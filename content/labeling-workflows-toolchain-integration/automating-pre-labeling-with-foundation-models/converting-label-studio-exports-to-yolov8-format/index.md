---
title: "Converting Label Studio Exports to YOLOv8 Format"
description: "Step-by-step guide to transforming Label Studio JSON exports into YOLOv8 normalized bounding-box format for geospatial tile datasets — covering coordinate math, directory layout, data.yaml generation, and common conversion errors."
slug: "converting-label-studio-exports-to-yolov8-format"
type: "long_tail"
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
dateModified: "2026-06-24"
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
      "description": "Step-by-step guide to transforming Label Studio JSON exports into YOLOv8 normalized bounding-box format for geospatial tile datasets.",
      "datePublished": "2025-01-15",
      "dateModified": "2026-06-24",
      "author": {"@type": "Organization", "name": "Geospatial Annotation"},
      "publisher": {"@type": "Organization", "name": "Geospatial Annotation"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://geospatialannotation.com/"},
        {"@type": "ListItem", "position": 2, "name": "Labeling Workflows & Toolchain Integration", "item": "https://geospatialannotation.com/labeling-workflows-toolchain-integration/"},
        {"@type": "ListItem", "position": 3, "name": "Automating Pre-Labeling with Foundation Models", "item": "https://geospatialannotation.com/labeling-workflows-toolchain-integration/automating-pre-labeling-with-foundation-models/"},
        {"@type": "ListItem", "position": 4, "name": "Converting Label Studio Exports to YOLOv8 Format", "item": "https://geospatialannotation.com/labeling-workflows-toolchain-integration/automating-pre-labeling-with-foundation-models/converting-label-studio-exports-to-yolov8-format/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Converting Label Studio Exports to YOLOv8 Format",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Export Label Studio annotations as JSON", "text": "Use the Label Studio UI or SDK to export tasks as a JSON file containing annotation results with percentage-based bounding box coordinates."},
        {"@type": "HowToStep", "position": 2, "name": "Map class names to zero-based integer indices", "text": "Build a class_map dict that converts string label names to YOLOv8 integer class IDs in a fixed, reproducible order."},
        {"@type": "HowToStep", "position": 3, "name": "Convert percentage coordinates to YOLO normalized values", "text": "Divide Label Studio's 0–100 percentage values by 100, then compute x_center and y_center from the top-left corner plus half-width/height."},
        {"@type": "HowToStep", "position": 4, "name": "Write per-image .txt label files and directory structure", "text": "Create images/ and labels/ directories, write one .txt file per image containing one row per bounding box, then generate data.yaml."},
        {"@type": "HowToStep", "position": 5, "name": "Validate tile dimensions and clamp out-of-bounds coordinates", "text": "Verify that original_width/original_height match actual tile pixels, clamp all coordinates to [0, 1], and log any outliers as annotation errors."}
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
        }
      ]
    }
  ]
}
</script>

# Converting Label Studio Exports to YOLOv8 Format

Converting [Label Studio](https://labelstud.io/) exports to YOLOv8 format requires parsing the exported JSON payload, remapping string class labels to zero-based integer indices, and transforming percentage-based bounding box coordinates into YOLO's normalized `[class_id, x_center, y_center, width, height]` structure. Label Studio stores coordinates as percentages (0–100) relative to the original image or raster tile; YOLOv8 expects values in the 0–1 range representing center points and box dimensions relative to the full image. For [geospatial annotation](/labeling-workflows-toolchain-integration/) workflows that tile GeoTIFFs or orthomosaics into fixed-resolution chips, this conversion runs as a post-processing step and writes the standard `images/` and `labels/` directory layout plus a `data.yaml` configuration file ready for `yolo train`.

## Why Coordinate Precision Matters for Raster Chips

A naive division by 100 is correct only when Label Studio's stored `original_width` and `original_height` exactly match the pixel dimensions of the tile on disk. In geospatial pipelines this frequently breaks: dynamic tiling scripts (using `rasterio` or `gdal_translate`) sometimes add overlap padding, resize for square input, or resample to a different ground sampling distance — none of which Label Studio knows about unless you explicitly update the task metadata. Even a 4-pixel mismatch on a 512×512 chip produces a ~0.8 % coordinate shift, which compounds across thousands of training images and degrades mean Average Precision measurably. Additionally, annotations that cross a tile boundary can produce `x_center + width/2 > 1.0`, which triggers YOLOv8's dataset validation assertion and aborts training entirely.

---

<svg viewBox="0 0 720 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Label Studio to YOLOv8 conversion pipeline diagram" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>Label Studio to YOLOv8 Conversion Pipeline</title>
  <desc>Five-stage pipeline: Label Studio JSON export, coordinate math (percentage to normalized), class mapping, directory layout generation, and data.yaml output ready for yolo train.</desc>
  <defs>
    <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3.5" orient="auto">
      <path d="M0,0 L8,3.5 L0,7 Z" fill="currentColor" opacity="0.6"/>
    </marker>
  </defs>
  <!-- Stage boxes -->
  <!-- 1: Export -->
  <rect x="8" y="70" width="118" height="80" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.35"/>
  <text x="67" y="103" text-anchor="middle" font-size="11" fill="currentColor" font-family="system-ui,sans-serif" font-weight="600">Label Studio</text>
  <text x="67" y="118" text-anchor="middle" font-size="10" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.75">JSON export</text>
  <text x="67" y="133" text-anchor="middle" font-size="9" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.55">tasks.json</text>
  <!-- Arrow 1→2 -->
  <line x1="126" y1="110" x2="148" y2="110" stroke="currentColor" stroke-width="1.5" opacity="0.5" marker-end="url(#arrow)"/>
  <!-- 2: Coordinate math -->
  <rect x="150" y="70" width="130" height="80" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.35"/>
  <text x="215" y="103" text-anchor="middle" font-size="11" fill="currentColor" font-family="system-ui,sans-serif" font-weight="600">Coordinate</text>
  <text x="215" y="118" text-anchor="middle" font-size="10" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.75">Math</text>
  <text x="215" y="133" text-anchor="middle" font-size="9" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.55">% → 0–1 normalized</text>
  <!-- Arrow 2→3 -->
  <line x1="280" y1="110" x2="302" y2="110" stroke="currentColor" stroke-width="1.5" opacity="0.5" marker-end="url(#arrow)"/>
  <!-- 3: Class mapping -->
  <rect x="304" y="70" width="120" height="80" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.35"/>
  <text x="364" y="103" text-anchor="middle" font-size="11" fill="currentColor" font-family="system-ui,sans-serif" font-weight="600">Class</text>
  <text x="364" y="118" text-anchor="middle" font-size="10" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.75">Mapping</text>
  <text x="364" y="133" text-anchor="middle" font-size="9" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.55">name → int index</text>
  <!-- Arrow 3→4 -->
  <line x1="424" y1="110" x2="446" y2="110" stroke="currentColor" stroke-width="1.5" opacity="0.5" marker-end="url(#arrow)"/>
  <!-- 4: Directory layout -->
  <rect x="448" y="70" width="120" height="80" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.35"/>
  <text x="508" y="97" text-anchor="middle" font-size="11" fill="currentColor" font-family="system-ui,sans-serif" font-weight="600">Directory</text>
  <text x="508" y="112" text-anchor="middle" font-size="10" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.75">Layout</text>
  <text x="508" y="127" text-anchor="middle" font-size="9" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.55">images/ + labels/</text>
  <text x="508" y="141" text-anchor="middle" font-size="9" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.55">.txt per image</text>
  <!-- Arrow 4→5 -->
  <line x1="568" y1="110" x2="590" y2="110" stroke="currentColor" stroke-width="1.5" opacity="0.5" marker-end="url(#arrow)"/>
  <!-- 5: data.yaml -->
  <rect x="592" y="70" width="120" height="80" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.35"/>
  <text x="652" y="103" text-anchor="middle" font-size="11" fill="currentColor" font-family="system-ui,sans-serif" font-weight="600">data.yaml</text>
  <text x="652" y="118" text-anchor="middle" font-size="10" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.75">+ validation</text>
  <text x="652" y="133" text-anchor="middle" font-size="9" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.55">yolo train ready</text>
  <!-- Stage label -->
  <text x="360" y="190" text-anchor="middle" font-size="10" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.45">Label Studio JSON → YOLOv8 dataset</text>
</svg>

## Step-by-Step Implementation

### Step 1 — Export from Label Studio as JSON

From the Label Studio UI, open your project and navigate to **Export → JSON**. This produces a `tasks.json` file where each task contains an `annotations` array. Each annotation result of type `rectanglelabels` carries the fields you need: `x`, `y`, `width`, `height` (all percentages, 0–100) and `rectanglelabels` (the class name list).

If your project used [foundation model pre-labeling](/labeling-workflows-toolchain-integration/automating-pre-labeling-with-foundation-models/) before human review, verify that annotators accepted or corrected the model suggestions — unreviewed predictions live in the `predictions` key, not `annotations`, and require a separate fallback.

### Step 2 — Coordinate Transformation

Label Studio's top-left anchor convention means `x` and `y` are the pixel offsets of the box's top-left corner expressed as percentages of the image dimensions. YOLOv8 expects center-point coordinates normalized to 0–1:

```
x_center = (x_pct + width_pct / 2) / 100.0
y_center = (y_pct + height_pct / 2) / 100.0
w_norm   = width_pct  / 100.0
h_norm   = height_pct / 100.0
```

For geospatial tiles, confirm `original_width` and `original_height` from the JSON payload match the files on disk before applying this math. If your tiling pipeline added padding (e.g., `rasterio` sliding window with `overlap=64` on 512 px chips), adjust the percentage values by the pixel offset before dividing by 100.

### Step 3 — Production Conversion Script

The script below handles batch conversion, class mapping, directory generation, and coordinate validation. It requires only the Python standard library and works with Python 3.10+.

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
      <output_dir>/images/        — symlinks or copies of source tiles
      <output_dir>/labels/        — one .txt per image, YOLO row format
      <output_dir>/data.yaml      — YOLOv8-compliant dataset config
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
                logging.warning("Boundary overflow in %s class=%s — check tile padding", image_filename, cls_name)

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

### Step 4 — Validate Tile Dimensions Against Label Studio Metadata

Before invoking the script on a production export, run a quick dimension audit to surface mismatches early. This is especially important when [tracking annotation changes across dataset versions](/dataset-versioning-spatial-data-sync/tracking-annotation-changes-with-sha-hashing/), because a metadata mismatch introduced at any pipeline stage will silently corrupt every downstream training run.

```python
from pathlib import Path
import json
from PIL import Image   # pillow>=10.0.0


def audit_tile_dimensions(
    export_json: str,
    image_dir: str,
) -> list[dict]:
    """
    Returns a list of mismatches between Label Studio metadata and actual tile sizes.
    Empty list means all tiles match.
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
                break  # Only need one result to check dimensions

    return mismatches
```

### Step 5 — Generate and Verify the Dataset

After conversion, run YOLOv8's built-in dataset check before starting a training job. A clean dataset produces zero warnings and a balanced class histogram:

```python
from ultralytics import YOLO   # ultralytics>=8.0.0

# Lightweight dataset validation — does not start training
model = YOLO("yolov8n.pt")
model.val(data="path/to/output/data.yaml", split="train")
```

Alternatively, use the CLI: `yolo val model=yolov8n.pt data=path/to/data.yaml split=train`.

## Key Parameters and Format Thresholds

| Parameter | Expected value | Notes |
|---|---|---|
| `x`, `y` (Label Studio) | 0–100 (float) | Top-left corner; **not** center |
| `x_center`, `y_center` (YOLO) | 0.0–1.0 (float) | Center point, fraction of image dimension |
| `width`, `height` (YOLO) | 0.0–1.0 (float) | Box size as fraction of image dimension |
| Class index | 0-based integer | Must match `names` list order in `data.yaml` |
| Coordinate precision | 6 decimal places | YOLOv8 reads floats; 4+ dp is sufficient |
| Tile size (typical GSD ≤ 0.1 m) | 512×512 px or 640×640 px | Larger tiles reduce annotation count per chip |
| Boundary overflow warning threshold | > 0.99 | Boxes near the edge indicate tile-boundary cuts |

For teams using [DVC to version geospatial training data](/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/), pin the `data.yaml` and `labels/` directory as tracked outputs of the conversion stage so coordinate bugs are traceable to specific export commits.

## Common Errors & Fixes

**`AssertionError: box labels must be in [0, 1] range` during `yolo train`**
: One or more `.txt` label files contain coordinates outside the 0–1 range. Root cause: `original_width`/`original_height` mismatch or a boundary annotation that extends past the tile edge. Fix: run the dimension audit, then set `fallback_clamp=True` in the conversion and log all clamped values.

**Empty `labels/` directory after conversion**
: The export uses the `predictions` key rather than `annotations` (model-assisted labeling workflow). Fix: set `fallback_to_predictions=True` in the conversion script, or re-export after annotators have accepted the pre-labels.

**`KeyError: 'rectanglelabels'` in the conversion script**
: The project template uses a different annotation type — for example `polygonlabels` for segmentation masks or `keypointlabels` for skeleton annotations. Fix: add a guard on `result.get("type")` and route non-rectangle types to a separate handler or skip them explicitly.

**All bounding boxes are ~0.01 units offset from the annotated object**
: The tiling pipeline applied padding or overlap that shifted pixel origins without updating Label Studio metadata. Fix: compute the pixel offset introduced by padding (e.g. `overlap_px / tile_size`) and subtract it from the normalized coordinates before writing the label file.

---

This page covers one export step in the broader [automating pre-labeling with foundation models](/labeling-workflows-toolchain-integration/automating-pre-labeling-with-foundation-models/) workflow, where foundation model outputs feed Label Studio projects before the human review and export cycle described here.

**Related**

- [Automating Pre-Labeling with Foundation Models](/labeling-workflows-toolchain-integration/automating-pre-labeling-with-foundation-models/) — upstream pipeline that populates Label Studio with model-generated annotations before export
- [Integrating Label Studio with Geospatial Workflows](/labeling-workflows-toolchain-integration/integrating-label-studio-with-geospatial-workflows/) — project configuration, storage backends, and task queue setup
- [Implementing DVC for Geospatial Training Data](/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/) — version-control the converted dataset so coordinate errors are traceable
- [Preserving Metadata Across Dataset Versions](/dataset-versioning-spatial-data-sync/preserving-metadata-across-dataset-versions/) — embed geotransform and CRS metadata alongside YOLO label files
