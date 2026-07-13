---
title: "Converting Label Studio Exports to YOLOv8 Format"
description: "Step-by-step guide to transforming Label Studio JSON exports into YOLOv8 normalized bounding-box format for geospatial tile datasets — covering coordinate math, directory layout, data.yaml generation, and common conversion errors."
slug: "converting-label-studio-exports-to-yolov8-format"
type: "tutorial"
breadcrumb:
  - label: "Home"
    url: "/"
  - label: "Labeling Workflows & Toolchain Integration"
    url: "/labeling-workflows-toolchain-integration/"
  - label: "Automating Pre-Labeling with Foundation Models"
    url: "/labeling-workflows-toolchain-integration/automating-pre-labeling-with-foundation-models/"
  - label: "Converting Label Studio Exports to YOLOv8 Format"
    url: "/labeling-workflows-toolchain-integration/automating-pre-labeling-with-foundation-models/converting-label-studio-exports-to-yolov8-format/"
datePublished: "2025-01-15"
dateModified: "2026-06-25"
schema:
  - Article
  - BreadcrumbList
  - HowTo
  - FAQPage
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Converting Label Studio Exports to YOLOv8 Format",
      "description": "Step-by-step guide to transforming Label Studio JSON exports into YOLOv8 normalized bounding-box format for geospatial tile datasets — covering coordinate math, directory layout, data.yaml generation, and common conversion errors.",
      "datePublished": "2025-01-15",
      "dateModified": "2026-06-25",
      "author": {"@type": "Organization", "name": "Geospatial Annotation"},
      "publisher": {"@type": "Organization", "name": "Geospatial Annotation"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.geospatialannotation.com/"},
        {"@type": "ListItem", "position": 2, "name": "Labeling Workflows & Toolchain Integration", "item": "https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/"},
        {"@type": "ListItem", "position": 3, "name": "Automating Pre-Labeling with Foundation Models", "item": "https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/automating-pre-labeling-with-foundation-models/"},
        {"@type": "ListItem", "position": 4, "name": "Converting Label Studio Exports to YOLOv8 Format", "item": "https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/automating-pre-labeling-with-foundation-models/converting-label-studio-exports-to-yolov8-format/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Converting Label Studio Exports to YOLOv8 Format",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Export Label Studio annotations as JSON", "text": "Use the Label Studio UI or SDK to export tasks as a JSON file containing annotation results with percentage-based bounding box coordinates."},
        {"@type": "HowToStep", "position": 2, "name": "Audit tile dimensions against Label Studio metadata", "text": "Verify that original_width/original_height stored in the export matches the actual pixel dimensions of each tile on disk before applying coordinate math."},
        {"@type": "HowToStep", "position": 3, "name": "Map class names to zero-based integer indices", "text": "Build a class_map dict that converts string label names to YOLOv8 integer class IDs in a fixed, reproducible order."},
        {"@type": "HowToStep", "position": 4, "name": "Convert percentage coordinates to YOLO normalized values", "text": "Divide Label Studio's 0–100 percentage values by 100, then compute x_center and y_center from the top-left corner plus half-width/height. Clamp all values to [0, 1]."},
        {"@type": "HowToStep", "position": 5, "name": "Write per-image .txt label files and directory structure", "text": "Create images/ and labels/ directories, write one .txt file per image containing one row per bounding box, then generate data.yaml."},
        {"@type": "HowToStep", "position": 6, "name": "Validate the dataset with YOLOv8 before training", "text": "Run yolo val against the generated data.yaml to surface coordinate range errors, missing label files, and class histogram imbalances before committing training compute."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why do my YOLOv8 bounding boxes drift from the annotated objects?",
          "acceptedAnswer": {"@type": "Answer", "text": "Drift usually means the original_width/original_height stored in Label Studio does not match the actual pixel dimensions of your exported tile. Recompute those values from the tile files before normalization."}
        },
        {
          "@type": "Question",
          "name": "What happens if Label Studio exports predictions instead of annotations?",
          "acceptedAnswer": {"@type": "Answer", "text": "Projects using model-assisted labeling store results under the predictions key rather than annotations. Update the script to fall back to task.get('predictions', []) when annotations is empty."}
        },
        {
          "@type": "Question",
          "name": "How should I handle overlapping tiles with padding in the coordinate conversion?",
          "acceptedAnswer": {"@type": "Answer", "text": "Subtract the pixel offset introduced by padding from the raw x/y percentages before dividing by 100. If tiles overlap by 64 px on a 512 px chip, shift coordinates by 64/512 = 0.125 in normalized space before writing the label file."}
        },
        {
          "@type": "Question",
          "name": "What causes KeyError: 'rectanglelabels' in the conversion script?",
          "acceptedAnswer": {"@type": "Answer", "text": "The project template uses a different annotation type — for example polygonlabels for segmentation masks or keypointlabels for skeleton annotations. Add a guard on result.get('type') and route non-rectangle types to a separate handler or skip them explicitly."}
        }
      ]
    }
  ]
}
</script>

# Converting Label Studio Exports to YOLOv8 Format

Converting [Label Studio](https://labelstud.io/) exports to YOLOv8 format requires parsing the exported JSON payload, remapping string class labels to zero-based integer indices, and transforming percentage-based bounding box coordinates into YOLO's normalized `[class_id, x_center, y_center, width, height]` structure. Label Studio stores box coordinates as percentages (0–100) relative to the original image; YOLOv8 expects values in the 0–1 range representing center points and box dimensions relative to the full tile. For [geospatial annotation workflows](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/) that tile GeoTIFFs or orthomosaics into fixed-resolution chips, this conversion runs as a post-processing step and writes the standard `images/` and `labels/` directory layout plus a `data.yaml` configuration file ready for `yolo train`.

## Why Coordinate Precision Matters for Raster Chips

A naive division by 100 is only correct when Label Studio's stored `original_width` and `original_height` exactly match the pixel dimensions of the tile on disk. In geospatial pipelines this frequently breaks: dynamic tiling scripts using `rasterio` or `gdal_translate` sometimes add overlap padding, resize for square input, or resample to a different ground sampling distance — none of which Label Studio records unless you explicitly update the task metadata. Even a 4-pixel mismatch on a 512×512 chip produces a ~0.8% coordinate shift, which compounds across thousands of training images and measurably degrades mean Average Precision. Annotations that cross a tile boundary can produce `x_center + width/2 > 1.0`, which triggers YOLOv8's dataset validation assertion and aborts training entirely before a single epoch runs.

---

<svg viewBox="0 0 760 230" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Label Studio to YOLOv8 conversion pipeline diagram" style="width:100%;max-width:760px;display:block;margin:1.5rem auto;">
  <title>Label Studio to YOLOv8 Conversion Pipeline</title>
  <desc>Five-stage pipeline: Label Studio JSON export, dimension audit, coordinate math (percentage to normalized), class mapping and directory layout, then data.yaml output ready for yolo val and yolo train.</desc>
  <defs>
    <marker id="arr" markerWidth="8" markerHeight="8" refX="7" refY="3.5" orient="auto">
      <path d="M0,0 L8,3.5 L0,7 Z" fill="currentColor" opacity="0.55"/>
    </marker>
  </defs>
  <!-- Stage 1: Export -->
  <rect x="6" y="65" width="120" height="86" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"/>
  <text x="66" y="97" text-anchor="middle" font-size="11" fill="currentColor" font-family="system-ui,sans-serif" font-weight="600">Label Studio</text>
  <text x="66" y="113" text-anchor="middle" font-size="10" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.75">JSON export</text>
  <text x="66" y="128" text-anchor="middle" font-size="9" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.5">tasks.json</text>
  <!-- Arrow 1→2 -->
  <line x1="126" y1="108" x2="148" y2="108" stroke="currentColor" stroke-width="1.5" opacity="0.45" marker-end="url(#arr)"/>
  <!-- Stage 2: Dimension audit -->
  <rect x="150" y="65" width="128" height="86" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"/>
  <text x="214" y="97" text-anchor="middle" font-size="11" fill="currentColor" font-family="system-ui,sans-serif" font-weight="600">Dimension</text>
  <text x="214" y="112" text-anchor="middle" font-size="10" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.75">Audit</text>
  <text x="214" y="127" text-anchor="middle" font-size="9" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.5">tile px vs metadata</text>
  <!-- Arrow 2→3 -->
  <line x1="278" y1="108" x2="300" y2="108" stroke="currentColor" stroke-width="1.5" opacity="0.45" marker-end="url(#arr)"/>
  <!-- Stage 3: Coord math -->
  <rect x="302" y="65" width="128" height="86" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"/>
  <text x="366" y="97" text-anchor="middle" font-size="11" fill="currentColor" font-family="system-ui,sans-serif" font-weight="600">Coordinate</text>
  <text x="366" y="112" text-anchor="middle" font-size="10" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.75">Math</text>
  <text x="366" y="127" text-anchor="middle" font-size="9" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.5">% ÷ 100 → 0–1</text>
  <!-- Arrow 3→4 -->
  <line x1="430" y1="108" x2="452" y2="108" stroke="currentColor" stroke-width="1.5" opacity="0.45" marker-end="url(#arr)"/>
  <!-- Stage 4: Class map + dir layout -->
  <rect x="454" y="65" width="140" height="86" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"/>
  <text x="524" y="93" text-anchor="middle" font-size="11" fill="currentColor" font-family="system-ui,sans-serif" font-weight="600">Class Map +</text>
  <text x="524" y="108" text-anchor="middle" font-size="10" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.75">Directory Layout</text>
  <text x="524" y="123" text-anchor="middle" font-size="9" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.5">images/ + labels/</text>
  <text x="524" y="137" text-anchor="middle" font-size="9" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.5">.txt per image</text>
  <!-- Arrow 4→5 -->
  <line x1="594" y1="108" x2="616" y2="108" stroke="currentColor" stroke-width="1.5" opacity="0.45" marker-end="url(#arr)"/>
  <!-- Stage 5: data.yaml -->
  <rect x="618" y="65" width="134" height="86" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"/>
  <text x="685" y="97" text-anchor="middle" font-size="11" fill="currentColor" font-family="system-ui,sans-serif" font-weight="600">data.yaml</text>
  <text x="685" y="112" text-anchor="middle" font-size="10" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.75">+ yolo val</text>
  <text x="685" y="127" text-anchor="middle" font-size="9" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.5">ready for training</text>
  <!-- Caption -->
  <text x="380" y="200" text-anchor="middle" font-size="10" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.4">Label Studio JSON → validated YOLOv8 dataset</text>
</svg>

## Step-by-Step Implementation

### Step 1 — Export from Label Studio as JSON

Open your project in Label Studio, navigate to **Export → JSON**, and download `tasks.json`. Each task contains an `annotations` array; each annotation result of type `rectanglelabels` carries the fields `x`, `y`, `width`, `height` (all percentages, 0–100, top-left anchor) and `rectanglelabels` (the class name list).

If your project used [foundation model pre-labeling](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/automating-pre-labeling-with-foundation-models/) before human review, confirm that annotators accepted or corrected the model suggestions. Unreviewed model outputs live in the `predictions` key, not `annotations`, and require a separate fallback path in the conversion script.

### Step 2 — Audit Tile Dimensions Against Label Studio Metadata

Before any coordinate math, verify that `original_width` and `original_height` from the JSON payload match the pixel dimensions of each tile on disk. Run this audit once per export batch:

```python
from pathlib import Path
import json
from PIL import Image   # pillow>=10.0.0


def audit_tile_dimensions(
    export_json: str,
    image_dir: str,
) -> list[dict]:
    """
    Return mismatches between Label Studio metadata and actual tile pixel sizes.
    An empty list means all tiles match and coordinate math is safe to apply.
    """
    mismatches: list[dict] = []

    with open(export_json, encoding="utf-8") as f:
        tasks: list[dict] = json.load(f)

    for task in tasks:
        image_url = task.get("data", {}).get("image", "")
        filename  = Path(image_url).name
        tile_path = Path(image_dir) / filename

        if not tile_path.exists():
            continue

        for annotation in task.get("annotations", []):
            for result in annotation.get("result", []):
                if result.get("type") != "rectanglelabels":
                    continue
                ls_w = result.get("original_width")
                ls_h = result.get("original_height")
                actual_w, actual_h = Image.open(tile_path).size

                if ls_w != actual_w or ls_h != actual_h:
                    mismatches.append({
                        "file": filename,
                        "label_studio": (ls_w, ls_h),
                        "actual":       (actual_w, actual_h),
                    })
                break  # one result per task is enough for the dimension check

    return mismatches
```

This is especially important when [tracking annotation changes across dataset versions](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/tracking-annotation-changes-with-sha-hashing/): a silent dimension mismatch introduced at any pipeline stage will corrupt every downstream training run without producing an obvious error message.

### Step 3 — Coordinate Transformation Formula

Label Studio's top-left anchor convention means `x` and `y` are the top-left corner of the box expressed as percentages of the image dimensions. YOLOv8 expects center-point coordinates normalized to 0–1:

```
x_center = (x_pct + width_pct / 2) / 100.0
y_center = (y_pct + height_pct / 2) / 100.0
w_norm   = width_pct  / 100.0
h_norm   = height_pct / 100.0
```

For geospatial tiles produced by a sliding-window tiler with overlap, subtract the pixel offset of the overlap before dividing by 100. If tiles overlap by 64 px on a 512 px chip, the coordinate correction is `64 / 512 = 0.125` in normalized space — add this to the top-left coordinate of each box before applying the center-point formula.

### Step 4 — Production Conversion Script

The script below handles batch conversion, class mapping, directory generation, coordinate clamping, and boundary-overflow logging. It requires only the Python standard library and runs on Python 3.10+:

```python
import json
import logging
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")


def convert_labelstudio_to_yolo(
    export_json: str,
    output_dir: str,
    class_names: list[str],
    image_dir: str | None = None,
    fallback_to_predictions: bool = False,
) -> None:
    """
    Convert a Label Studio object-detection JSON export to YOLOv8 format.

    Produces:
      <output_dir>/images/   — symlinks to source tiles (or empty if image_dir is None)
      <output_dir>/labels/   — one .txt per image, one YOLO row per bounding box
      <output_dir>/data.yaml — YOLOv8-compliant dataset config
    """
    output_path = Path(output_dir)
    images_dir  = output_path / "images"
    labels_dir  = output_path / "labels"
    images_dir.mkdir(parents=True, exist_ok=True)
    labels_dir.mkdir(parents=True, exist_ok=True)

    class_map: dict[str, int] = {name: idx for idx, name in enumerate(class_names)}

    with open(export_json, encoding="utf-8") as f:
        tasks: list[dict] = json.load(f)

    converted = 0
    skipped   = 0

    for task in tasks:
        image_url      = task.get("data", {}).get("image", "")
        image_filename = Path(image_url).name if image_url else f"task_{task.get('id', 'unknown')}.jpg"

        if image_dir:
            src_img = Path(image_dir) / image_filename
            if src_img.exists():
                dest_img = images_dir / image_filename
                if not dest_img.exists():
                    dest_img.symlink_to(src_img.resolve())

        # Prefer human-reviewed annotations; fall back to model predictions if allowed
        annotation_sets = task.get("annotations", [])
        if not annotation_sets and fallback_to_predictions:
            annotation_sets = task.get("predictions", [])

        if not annotation_sets:
            skipped += 1
            continue

        label_lines: list[str] = []

        for result in annotation_sets[0].get("result", []):
            if result.get("type") != "rectanglelabels":
                continue

            value    = result["value"]
            cls_name = value.get("rectanglelabels", ["unknown"])[0]

            if cls_name not in class_map:
                logging.warning("Unknown class '%s' in %s — skipped", cls_name, image_filename)
                continue

            # Label Studio stores coordinates as percentages (0–100), top-left anchor
            x_pct = float(value["x"])
            y_pct = float(value["y"])
            w_pct = float(value["width"])
            h_pct = float(value["height"])

            # Convert to YOLO center-point normalized coordinates (0–1)
            x_center = (x_pct + w_pct / 2.0) / 100.0
            y_center = (y_pct + h_pct / 2.0) / 100.0
            w_norm   = w_pct / 100.0
            h_norm   = h_pct / 100.0

            # Clamp to valid range; values outside [0, 1] abort yolo train
            x_center = max(0.0, min(1.0, x_center))
            y_center = max(0.0, min(1.0, y_center))
            w_norm   = max(0.0, min(1.0, w_norm))
            h_norm   = max(0.0, min(1.0, h_norm))

            # Flag annotations whose boxes likely overflow the tile boundary
            if x_center + w_norm / 2.0 > 0.99 or y_center + h_norm / 2.0 > 0.99:
                logging.warning(
                    "Boundary overflow in %s class=%s — check tile padding",
                    image_filename, cls_name,
                )

            label_lines.append(
                f"{class_map[cls_name]} {x_center:.6f} {y_center:.6f} {w_norm:.6f} {h_norm:.6f}"
            )

        if label_lines:
            label_file = labels_dir / f"{Path(image_filename).stem}.txt"
            label_file.write_text("\n".join(label_lines), encoding="utf-8")
            converted += 1

    # Write YOLOv8-compliant data.yaml
    yaml_path = output_path / "data.yaml"
    yaml_path.write_text(
        f"path: {output_path.resolve()}\n"
        "train: images\n"
        "val: images\n"
        f"nc: {len(class_names)}\n"
        f"names: {class_names}\n",
        encoding="utf-8",
    )

    logging.info("Done. Converted: %d tasks, skipped (no annotations): %d", converted, skipped)
    logging.info("Dataset written to %s", output_path)
```

### Step 5 — Validate the Dataset Before Training

After conversion, run YOLOv8's built-in dataset check before starting any training job. A clean dataset produces zero coordinate-range warnings and a legible class histogram:

```python
from ultralytics import YOLO   # ultralytics>=8.0.0

# Dataset validation — does not consume GPU or training time
model = YOLO("yolov8n.pt")
model.val(data="path/to/output/data.yaml", split="train")
```

Alternatively use the CLI: `yolo val model=yolov8n.pt data=path/to/data.yaml split=train`.

For teams using [DVC to version geospatial training data](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/), pin `data.yaml` and the `labels/` directory as tracked outputs of the conversion stage so coordinate bugs are traceable to a specific export commit and revertible without re-annotating.

## Format Parameters and Coordinate Thresholds

| Parameter | Expected value | Notes |
|---|---|---|
| `x`, `y` (Label Studio) | 0–100 float | Top-left corner; **not** center point |
| `x_center`, `y_center` (YOLO) | 0.0–1.0 float | Center point, fraction of tile dimension |
| `width`, `height` (YOLO) | 0.0–1.0 float | Box size as fraction of tile dimension |
| Class index | 0-based integer | Must match `names` list order in `data.yaml` |
| Coordinate precision | 6 decimal places | 4+ dp is sufficient; YOLOv8 reads standard floats |
| Typical GeoTIFF chip size | 512×512 px or 640×640 px | Larger chips reduce label count but increase GPU memory |
| Boundary overflow threshold | > 0.99 on any edge | Indicates a tile-boundary cut; log and investigate |
| Overlap correction (64 px on 512 px) | subtract 0.125 normalized units | Apply before center-point formula when tiler uses overlap |

## Common Errors and Fixes

`AssertionError: box labels must be in [0, 1] range` during `yolo train`
: One or more `.txt` label files contain coordinates outside the valid range. Root cause: `original_width` / `original_height` mismatch, or a boundary annotation extending past the tile edge. Fix: run the dimension audit from Step 2, then enable coordinate clamping in the conversion script and log every clamped value for manual review.

Empty `labels/` directory after conversion
: The export uses the `predictions` key instead of `annotations` (model-assisted labeling workflow where annotators never confirmed the pre-labels). Fix: set `fallback_to_predictions=True` in the conversion call, or re-export from Label Studio after annotators have accepted the pre-labels.

`KeyError: 'rectanglelabels'` in the conversion script
: The project template uses a different annotation type — `polygonlabels` for segmentation masks, or `keypointlabels` for skeleton annotations. Fix: add a guard on `result.get("type")` and route non-rectangle types to a separate handler, or skip them explicitly with a log message.

All bounding boxes offset by ~0.01–0.05 normalized units
: The tiling pipeline applied overlap padding that shifted pixel origins without updating Label Studio task metadata. Fix: compute the normalized offset (`overlap_px / tile_size_px`) and subtract it from the raw percentage coordinates before applying the center-point formula.

---

This page covers the export and conversion step within the broader [automating pre-labeling with foundation models](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/automating-pre-labeling-with-foundation-models/) workflow, where foundation model outputs feed Label Studio before the human review and export cycle described here.

**Related**

- [Automating Pre-Labeling with Foundation Models](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/automating-pre-labeling-with-foundation-models/) — upstream pipeline that populates Label Studio with model-generated annotations before export
- [Integrating Label Studio with Geospatial Workflows](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/integrating-label-studio-with-geospatial-workflows/) — project configuration, storage backends, and task queue setup
- [Implementing DVC for Geospatial Training Data](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/) — version-control the converted dataset so coordinate errors are traceable to specific export commits
- [Preserving Metadata Across Dataset Versions](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/preserving-metadata-across-dataset-versions/) — embed geotransform and CRS metadata alongside YOLO label files
