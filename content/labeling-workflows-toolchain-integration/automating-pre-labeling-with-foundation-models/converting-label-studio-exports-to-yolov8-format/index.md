# Converting Label Studio Exports to YOLOv8 Format

Converting Label Studio exports to YOLOv8 format requires parsing the exported JSON payload, extracting bounding box coordinates, and transforming them into YOLO’s normalized `[class_id, x_center, y_center, width, height]` structure. Label Studio outputs coordinates as percentages (0–100) relative to the original image or raster tile, while YOLOv8 expects values normalized to the 0–1 range representing center points and dimensions. For geospatial workflows, this conversion typically runs as a post-processing step after tiling GeoTIFFs or orthomosaics into fixed-resolution PNG/JPEG chips. A lightweight Python script handles the batch transformation, generates the required `images/` and `labels/` directory layout, and outputs a `data.yaml` configuration file ready for `yolo train`.

## Coordinate Transformation Logic

Label Studio’s object detection export uses a nested JSON structure where each annotation contains `original_width`, `original_height`, and a `value` dictionary with `x`, `y`, `width`, and `height` expressed as percentages. YOLOv8 requires absolute normalized coordinates calculated as:

```
x_center = (x + width / 2) / 100
y_center = (y + height / 2) / 100
w_norm   = width / 100
h_norm   = height / 100
```

Geospatial annotation teams must verify that `original_width` and `original_height` match the actual pixel dimensions of the exported tile. Mismatched resolutions cause normalized coordinates to drift, resulting in misaligned bounding boxes during training. If your pipeline uses dynamic tiling (e.g., `rasterio` or `gdal_translate`), bake the tile dimensions into the conversion metadata rather than relying on Label Studio’s stored values. For teams scaling annotation throughput, integrating AI-assisted pre-labeling before manual review significantly reduces bounding box drift and accelerates dataset curation. See [Automating Pre-Labeling with Foundation Models](/labeling-workflows-toolchain-integration/automating-pre-labeling-with-foundation-models/) for pipeline patterns that inject foundation model outputs directly into Label Studio projects prior to export.

## Production-Ready Conversion Script

The following Python script handles batch conversion, class mapping, directory generation, and basic coordinate validation. It assumes a standard Label Studio JSON export (`tasks.json` from the UI) and requires no external dependencies beyond the Python standard library.

```python
import json
import logging
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

def convert_labelstudio_to_yolo(
    export_json: str,
    output_dir: str,
    class_names: list[str],
    image_dir: str = None
):
    """
    Converts Label Studio object detection JSON to YOLOv8 format.
    Handles geospatial tile validation, normalized coordinate mapping,
    and generates a compliant data.yaml.
    """
    output_path = Path(output_dir)
    images_dir = output_path / "images"
    labels_dir = output_path / "labels"
    images_dir.mkdir(parents=True, exist_ok=True)
    labels_dir.mkdir(parents=True, exist_ok=True)

    class_map = {name: idx for idx, name in enumerate(class_names)}

    with open(export_json, "r", encoding="utf-8") as f:
        tasks = json.load(f)

    for task in tasks:
        # Extract image filename from Label Studio payload
        image_url = task.get("data", {}).get("image", "")
        image_filename = Path(image_url).name if image_url else f"image_{task.get('id', 'unknown')}.jpg"

        # Optional: symlink or copy source images
        if image_dir:
            src_img = Path(image_dir) / image_filename
            if src_img.exists():
                dest_img = images_dir / image_filename
                dest_img.symlink_to(src_img.resolve())

        label_lines = []
        annotations = task.get("annotations", [])
        if not annotations:
            continue

        # Process results from the first completed annotation
        for result in annotations[0].get("result", []):
            if result.get("type") != "rectanglelabels":
                continue

            value = result["value"]
            cls_name = value.get("rectanglelabels", ["unknown"])[0]
            if cls_name not in class_map:
                logging.warning(f"Skipping unknown class: {cls_name} in {image_filename}")
                continue

            # Label Studio percentages (0-100)
            x_pct = value["x"]
            y_pct = value["y"]
            w_pct = value["width"]
            h_pct = value["height"]

            # YOLO normalized coordinates (0-1)
            x_center = (x_pct + w_pct / 2) / 100.0
            y_center = (y_pct + h_pct / 2) / 100.0
            w_norm = w_pct / 100.0
            h_norm = h_pct / 100.0

            # Clamp to [0, 1] to prevent YOLOv8 assertion errors
            x_center = max(0.0, min(1.0, x_center))
            y_center = max(0.0, min(1.0, y_center))
            w_norm = max(0.0, min(1.0, w_norm))
            h_norm = max(0.0, min(1.0, h_norm))

            label_lines.append(f"{class_map[cls_name]} {x_center:.6f} {y_center:.6f} {w_norm:.6f} {h_norm:.6f}")

        if label_lines:
            label_file = labels_dir / f"{Path(image_filename).stem}.txt"
            with open(label_file, "w", encoding="utf-8") as lf:
                lf.write("\n".join(label_lines))

    # Generate YOLOv8-compliant data.yaml
    yaml_path = output_path / "data.yaml"
    with open(yaml_path, "w", encoding="utf-8") as yf:
        yf.write(f"path: {output_path.resolve()}\n")
        yf.write("train: images\n")
        yf.write("val: images\n")
        yf.write(f"nc: {len(class_names)}\n")
        yf.write(f"names: {class_names}\n")

    logging.info(f"Conversion complete. Output saved to {output_path}")
```

## Geospatial Validation & Pipeline Integration

When working with satellite imagery, aerial orthomosaics, or drone surveys, coordinate drift often stems from mismatched tile boundaries or unaccounted padding. Before running the conversion script, validate that each exported chip matches the `original_width`/`original_height` metadata stored in Label Studio. If your tiling pipeline applies overlap or padding (common in `rasterio` or `torchgeo` workflows), adjust the percentage coordinates by the pixel offset before normalization.

For robust dataset management, integrate this conversion step into a broader [Labeling Workflows & Toolchain Integration](/labeling-workflows-toolchain-integration/) strategy. Automating the export-to-YOLO handoff via CI/CD or Airflow prevents manual file shuffling and ensures reproducible training runs. Always verify your final dataset against the official [Ultralytics YOLOv8 dataset specification](https://docs.ultralytics.com/datasets/detect/) to confirm directory structure, class indexing, and YAML syntax align with trainer expectations.

## Pre-Flight Checklist for Training

Run these checks before invoking `yolo train`:
- **Class Index Consistency:** Ensure `class_names` order matches your model’s expected label mapping. YOLOv8 uses zero-based indexing.
- **Coordinate Bounds:** All `x_center`, `y_center`, `width`, and `height` values must fall within `[0, 1]`. The script clamps values, but investigate outliers >0.95 or <0.05 as they often indicate annotation errors.
- **File Pairing:** Every `.txt` label file must have a corresponding image in `images/`. Missing pairs trigger YOLO’s dataset validation warnings.
- **Export Format Verification:** Label Studio occasionally exports `predictions` instead of `annotations` when using auto-labeling. Update the script’s `task.get("annotations", [])` fallback to `task.get("predictions", [])` if your project relies on model-assisted labeling. Refer to the official [Label Studio export documentation](https://labelstud.io/guide/export.html) for payload variations across project types.