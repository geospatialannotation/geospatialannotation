---
title: "Automating Pre-Labeling with Foundation Models"
description: "A production engineering guide to building deterministic, CRS-aware pre-labeling pipelines using SAM, Grounding DINO, and open-vocabulary vision models for geospatial ML training datasets."
slug: "automating-pre-labeling-with-foundation-models"
type: "cluster"
breadcrumb:
  - label: "Home"
    url: "/"
  - label: "Labeling Workflows & Toolchain Integration"
    url: "/labeling-workflows-toolchain-integration/"
  - label: "Automating Pre-Labeling with Foundation Models"
    url: "/labeling-workflows-toolchain-integration/automating-pre-labeling-with-foundation-models/"
datePublished: "2025-01-15"
dateModified: "2026-06-24"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Automating Pre-Labeling with Foundation Models",
      "description": "A production engineering guide to building deterministic, CRS-aware pre-labeling pipelines using SAM, Grounding DINO, and open-vocabulary vision models for geospatial ML training datasets.",
      "datePublished": "2025-01-15",
      "dateModified": "2026-06-24",
      "author": { "@type": "Organization", "name": "Geospatial Annotation" },
      "publisher": { "@type": "Organization", "name": "Geospatial Annotation" }
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://geospatialannotation.com/" },
        { "@type": "ListItem", "position": 2, "name": "Labeling Workflows & Toolchain Integration", "item": "https://geospatialannotation.com/labeling-workflows-toolchain-integration/" },
        { "@type": "ListItem", "position": 3, "name": "Automating Pre-Labeling with Foundation Models", "item": "https://geospatialannotation.com/labeling-workflows-toolchain-integration/automating-pre-labeling-with-foundation-models/" }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Build a Production Pre-Labeling Pipeline with Foundation Models",
      "description": "Step-by-step workflow for tiling orthomosaics, running foundation model inference, vectorizing masks, filtering by confidence and area, and exporting georeferenced annotations for human validation.",
      "step": [
        { "@type": "HowToStep", "position": 1, "name": "Tile and Ingest the Raster", "text": "Split large orthomosaics into overlapping tiles using rasterio windowed reads, preserving the original affine transform and CRS per tile." },
        { "@type": "HowToStep", "position": 2, "name": "Run Foundation Model Inference", "text": "Batch tiles through SAM or Grounding DINO using mixed-precision inference; record per-prediction confidence scores and mask arrays." },
        { "@type": "HowToStep", "position": 3, "name": "Vectorize and Georeference Masks", "text": "Convert pixel-space binary masks to polygon geometries and project coordinates back to the source CRS using the tile affine transform." },
        { "@type": "HowToStep", "position": 4, "name": "Filter and Deduplicate Predictions", "text": "Apply confidence thresholds, minimum-area filters, and spatial NMS to remove noise and overlapping duplicates across tile boundaries." },
        { "@type": "HowToStep", "position": 5, "name": "Export and Route to Annotation Platform", "text": "Serialize validated GeoJSON or GeoParquet with required metadata fields and push to Label Studio or QGIS for human-in-the-loop review." }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Which foundation model works best for satellite imagery?",
          "acceptedAnswer": { "@type": "Answer", "text": "SAM handles dense polygon segmentation well for high-resolution imagery (GSD < 0.5 m). Grounding DINO excels at zero-shot bounding-box detection for named classes. For multispectral data, fine-tuned SAM variants trained on remote sensing datasets outperform the vanilla checkpoint." }
        },
        {
          "@type": "Question",
          "name": "How do I prevent tile boundary artefacts in the merged output?",
          "acceptedAnswer": { "@type": "Answer", "text": "Use 10–15% tile overlap, then apply spatial non-maximum suppression (NMS) during merge. Dissolve adjacent polygons that share more than 80% of their boundary and retain the higher-confidence candidate." }
        },
        {
          "@type": "Question",
          "name": "What confidence threshold should I use for geospatial pre-labeling?",
          "acceptedAnswer": { "@type": "Answer", "text": "Start at 0.70 for dense urban features and 0.65 for sparse rural objects, then calibrate against a 200-tile validation set of manually labeled imagery. Track false positive rate and human edit distance together, not just score distribution." }
        }
      ]
    }
  ]
}
</script>

# Automating Pre-Labeling with Foundation Models

A foundation model pipeline that looks perfect in a notebook fails in production the moment it encounters a raster with a non-standard [coordinate reference system](/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/), a tile whose bounding box straddles the antimeridian, or a batch where GPU memory spikes during the second epoch. The central engineering challenge of automating geospatial pre-labeling is not running inference — it is building a deterministic, resumable pipeline that preserves spatial metadata across every transformation from raw imagery to validated annotation export.

This page covers the complete production workflow: raster tiling with affine-transform preservation, batched inference with SAM and Grounding DINO, mask vectorization back to georeferenced polygons, confidence-aware filtering, tile-boundary deduplication, and integration with annotation platforms for [human-in-the-loop validation](/labeling-workflows-toolchain-integration/human-in-the-loop-validation-cycles/). When the pipeline is hardened correctly, manual annotation overhead drops by 60–80% while keeping spatial accuracy within acceptable IoU bounds for downstream model training.

This workflow sits inside the broader [Labeling Workflows & Toolchain Integration](/labeling-workflows-toolchain-integration/) pipeline.

---

## Prerequisites & Toolchain Alignment

### Python and Geospatial Stack

| Package | Minimum version | Role |
|---|---|---|
| `rasterio` | 1.3.9 | Windowed tile reads, affine transform, CRS metadata |
| `shapely` | 2.0.4 | Polygon creation, validity repair, area filtering |
| `pyproj` | 3.6.1 | CRS definition, coordinate transforms, datum handling |
| `geopandas` | 0.14.3 | Spatial joins, NMS merges, GeoJSON/GeoParquet export |
| `torch` | 2.2.0 | Model inference, autocast, DataLoader batching |
| `transformers` | 4.40.0 | SAM, Grounding DINO, OWL-ViT checkpoints via Hugging Face |
| `segment-anything` | 1.0 | SAM automatic mask generator and prompt encoder |
| `opencv-python` | 4.9.0 | Morphological operations, contour extraction |
| `pydantic` | 2.6.0 | Output schema validation before storage commit |

Lock versions in `requirements.txt` or `environment.yml`. Foundation model inference is sensitive to CUDA toolkit and `torch` wheel alignment — a silent version mismatch can degrade mask quality without raising an exception.

### System Dependencies

```bash
# Ubuntu/Debian — install before pip install rasterio
sudo apt-get install -y gdal-bin libgdal-dev libproj-dev

# Verify PROJ and GDAL versions
gdal-config --version   # expect 3.8+
proj --version          # expect 9.3+
```

PROJ 9.3+ is required for full VERTCON/NADCON5 datum grid support. Older versions silently fall back to approximate transforms, which can introduce 1–3 m horizontal offsets — enough to shift building footprint polygons off their true location.

### Spatial Prerequisites

Before building the pipeline, review [vector vs. raster annotation workflows](/geospatial-annotation-fundamentals-architecture/vector-vs-raster-annotation-workflows/) for the foundational contrast between pixel-space and geographic-space representations. Pre-labeling pipelines span both: model inference operates in pixel space; all exported annotations must live in geographic space with a declared CRS.

---

## Pipeline Architecture

The diagram below shows the five deterministic stages and the key metadata that must survive each transition without loss or mutation.

<svg viewBox="0 0 760 320" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Foundation model pre-labeling pipeline: five stages from raster ingest to annotation export" style="width:100%;max-width:760px;height:auto;display:block;margin:1.5rem auto;">
  <title>Foundation Model Pre-Labeling Pipeline</title>
  <desc>Five-stage data flow: Raster Ingest → Tile + Window → Foundation Model Inference → Vectorize + Georeference → Filter + Merge → Export + Validate. Arrows between stages show the spatial metadata (affine transform, CRS, confidence scores) that must be preserved at each step.</desc>
  <!-- Stage boxes -->
  <rect x="10" y="110" width="120" height="60" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="70" y="135" text-anchor="middle" font-size="11" fill="currentColor" font-weight="600">Raster</text>
  <text x="70" y="150" text-anchor="middle" font-size="11" fill="currentColor" font-weight="600">Ingest</text>
  <text x="70" y="165" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.75">GeoTIFF / COG</text>
  <rect x="160" y="110" width="120" height="60" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="220" y="135" text-anchor="middle" font-size="11" fill="currentColor" font-weight="600">Tile + Window</text>
  <text x="220" y="150" text-anchor="middle" font-size="11" fill="currentColor" font-weight="600">Read</text>
  <text x="220" y="165" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.75">rasterio.windows</text>
  <rect x="310" y="110" width="130" height="60" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="375" y="130" text-anchor="middle" font-size="11" fill="currentColor" font-weight="600">Foundation</text>
  <text x="375" y="145" text-anchor="middle" font-size="11" fill="currentColor" font-weight="600">Model Inference</text>
  <text x="375" y="162" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.75">SAM / Grounding DINO</text>
  <rect x="470" y="110" width="130" height="60" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="535" y="130" text-anchor="middle" font-size="11" fill="currentColor" font-weight="600">Vectorize +</text>
  <text x="535" y="145" text-anchor="middle" font-size="11" fill="currentColor" font-weight="600">Georeference</text>
  <text x="535" y="162" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.75">affine → CRS coords</text>
  <rect x="630" y="50" width="120" height="55" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="690" y="70" text-anchor="middle" font-size="11" fill="currentColor" font-weight="600">Filter +</text>
  <text x="690" y="85" text-anchor="middle" font-size="11" fill="currentColor" font-weight="600">Merge</text>
  <text x="690" y="100" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.75">NMS / thresholds</text>
  <rect x="630" y="200" width="120" height="55" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="690" y="222" text-anchor="middle" font-size="11" fill="currentColor" font-weight="600">Export +</text>
  <text x="690" y="237" text-anchor="middle" font-size="11" fill="currentColor" font-weight="600">Validate</text>
  <text x="690" y="252" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.75">GeoJSON / Parquet</text>
  <!-- Horizontal arrows -->
  <line x1="130" y1="140" x2="158" y2="140" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr)"/>
  <line x1="280" y1="140" x2="308" y2="140" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr)"/>
  <line x1="440" y1="140" x2="468" y2="140" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr)"/>
  <line x1="600" y1="130" x2="628" y2="90" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr)"/>
  <line x1="690" y1="105" x2="690" y2="198" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 3" marker-end="url(#arr)"/>
  <!-- Metadata labels on arrows -->
  <text x="144" y="132" text-anchor="middle" font-size="8" fill="currentColor" opacity="0.7">CRS</text>
  <text x="294" y="132" text-anchor="middle" font-size="8" fill="currentColor" opacity="0.7">affine</text>
  <text x="454" y="132" text-anchor="middle" font-size="8" fill="currentColor" opacity="0.7">masks</text>
  <text x="620" y="108" text-anchor="middle" font-size="8" fill="currentColor" opacity="0.7">scores</text>
  <text x="706" y="155" text-anchor="middle" font-size="8" fill="currentColor" opacity="0.7">merged</text>
  <!-- Feedback arrow label -->
  <text x="690" y="290" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.7">→ Label Studio / QGIS</text>
  <!-- Arrow marker -->
  <defs>
    <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor"/>
    </marker>
  </defs>
</svg>

Every stage must accept the same tile identifier as input and produce an idempotent output. Interrupted runs resume from the last successfully checkpointed tile without duplicating geometries.

---

## Core Workflow

### Step 1 — Raster Ingest and CRS Validation

Open the source raster and confirm CRS and affine transform before any processing begins. A missing or malformed `.prj`/embedded CRS is a hard stop — all downstream pixel-to-geography transformations will produce incorrect coordinates.

```python
from pathlib import Path
import rasterio
from pyproj import CRS

def validate_raster(raster_path: Path) -> dict:
    with rasterio.open(raster_path) as src:
        if src.crs is None:
            raise ValueError(f"No CRS embedded in {raster_path}. Fix before processing.")
        crs = CRS.from_user_input(src.crs)
        return {
            "path": raster_path,
            "crs": crs,
            "epsg": crs.to_epsg(),         # None if non-standard
            "transform": src.transform,
            "width": src.width,
            "height": src.height,
            "count": src.count,
            "dtype": src.dtypes[0],
            "nodata": src.nodata,
        }
```

If `epsg` returns `None`, the CRS is non-standard (common with older aerial survey files). Convert explicitly to a known `EPSG` before proceeding — see [coordinate reference systems in annotation pipelines](/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) for the standard reprojection pattern.

### Step 2 — Tiling with Windowed Reads

Large orthomosaics routinely exceed GPU memory. Split into fixed-size tiles with 10–15% overlap to prevent edge truncation. The overlap region is deduplicated after merging.

```python
from typing import Generator
import numpy as np
import rasterio
from rasterio.windows import Window

def generate_tiles(
    raster_path: Path,
    tile_size: int = 1024,
    overlap: float = 0.12,
) -> Generator[tuple[np.ndarray, rasterio.transform.Affine, str], None, None]:
    """Yield (pixel_array, tile_affine, tile_id) for each tile."""
    step = int(tile_size * (1 - overlap))

    with rasterio.open(raster_path) as src:
        for row_off in range(0, src.height, step):
            for col_off in range(0, src.width, step):
                win = Window(
                    col_off=col_off,
                    row_off=row_off,
                    width=min(tile_size, src.width - col_off),
                    height=min(tile_size, src.height - row_off),
                )
                data = src.read(window=win)                  # (bands, H, W)
                tile_transform = src.window_transform(win)   # preserves geo reference
                tile_id = f"r{row_off:06d}_c{col_off:06d}"
                yield data, tile_transform, tile_id
```

`src.window_transform(win)` returns the affine transform for that specific tile. Pass this alongside the pixel array so vectorization in Step 4 can reconstruct geographic coordinates without re-opening the parent raster.

### Step 3 — Foundation Model Inference

Architecture selection depends on annotation target. For dense instance segmentation, SAM generates pixel-accurate masks with the automatic mask generator. For zero-shot bounding-box detection, Grounding DINO accepts text prompts without fine-tuning.

```python
import torch
import numpy as np
from segment_anything import sam_model_registry, SamAutomaticMaskGenerator

def build_sam_generator(checkpoint: str, device: str = "cuda") -> SamAutomaticMaskGenerator:
    sam = sam_model_registry["vit_h"](checkpoint=checkpoint)
    sam.to(device=device)
    return SamAutomaticMaskGenerator(
        sam,
        points_per_side=32,
        pred_iou_thresh=0.86,
        stability_score_thresh=0.92,
        min_mask_region_area=100,    # px² — pre-filter micro-masks before vectorization
    )

def run_inference(
    tile_rgb: np.ndarray,           # (3, H, W) uint8
    generator: SamAutomaticMaskGenerator,
) -> list[dict]:
    """Return list of {segmentation, predicted_iou, stability_score} dicts."""
    # SAM expects HWC uint8
    image_hwc = np.moveaxis(tile_rgb[:3], 0, -1).astype(np.uint8)
    with torch.autocast(device_type="cuda", dtype=torch.float16):
        masks = generator.generate(image_hwc)
    return masks
```

For **open-vocabulary detection** with Grounding DINO, replace the SAM generator with:

```python
from transformers import AutoProcessor, AutoModelForZeroShotObjectDetection

processor = AutoProcessor.from_pretrained("IDEA-Research/grounding-dino-base")
model_gd = AutoModelForZeroShotObjectDetection.from_pretrained(
    "IDEA-Research/grounding-dino-base"
).to("cuda")

def detect_objects(
    tile_rgb: np.ndarray,
    text_prompt: str = "building . solar panel . road .",
    threshold: float = 0.30,
) -> list[dict]:
    from PIL import Image
    image = Image.fromarray(np.moveaxis(tile_rgb[:3], 0, -1))
    inputs = processor(images=image, text=text_prompt, return_tensors="pt").to("cuda")
    with torch.no_grad():
        outputs = model_gd(**inputs)
    results = processor.post_process_grounded_object_detection(
        outputs, inputs.input_ids, threshold=threshold,
        target_sizes=[image.size[::-1]]
    )[0]
    return [
        {"box": box.tolist(), "score": float(score), "label": label}
        for box, score, label in zip(
            results["boxes"], results["scores"], results["labels"]
        )
    ]
```

Text prompts for Grounding DINO must use period-separated class tokens (`"building . solar panel ."`). Free-form sentences reduce detection precision significantly.

### Step 4 — Vectorization and Georeferencing

Convert pixel-space binary masks (SAM) or bounding boxes (Grounding DINO) to georeferenced polygon geometries. The tile's affine transform from Step 2 is the only bridge between pixel and geographic space.

```python
import cv2
import numpy as np
from rasterio.transform import Affine
from shapely.geometry import Polygon, box as shapely_box
from shapely.validation import make_valid
import geopandas as gpd
from pyproj import CRS

def mask_to_polygon(
    binary_mask: np.ndarray,       # (H, W) bool
    affine: Affine,
) -> Polygon | None:
    """Trace the largest contour and project pixel coords to geographic space."""
    mask_u8 = binary_mask.astype(np.uint8) * 255
    # Morphological close to fill small holes before tracing
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    mask_u8 = cv2.morphologyEx(mask_u8, cv2.MORPH_CLOSE, kernel)

    contours, _ = cv2.findContours(mask_u8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_TC89_L1)
    if not contours:
        return None
    largest = max(contours, key=cv2.contourArea)
    if len(largest) < 4:
        return None

    # Map pixel (col, row) → (easting, northing) via affine transform
    geo_coords = [
        affine * (float(pt[0][0]), float(pt[0][1]))
        for pt in largest
    ]
    poly = Polygon(geo_coords)
    return make_valid(poly) if not poly.is_valid else poly

def bbox_to_polygon(box_xyxy: list[float], affine: Affine) -> Polygon:
    """Convert pixel-space [x1,y1,x2,y2] bounding box to geographic polygon."""
    x1, y1, x2, y2 = box_xyxy
    corners = [(x1, y1), (x2, y1), (x2, y2), (x1, y2)]
    geo_corners = [affine * (c[0], c[1]) for c in corners]
    return Polygon(geo_corners)
```

Apply `make_valid` from Shapely immediately after construction. Contour extraction from noisy masks can produce self-intersecting rings that cause `geopandas` spatial joins to silently return empty results.

### Step 5 — Confidence Filtering and Tile-Boundary Deduplication

Two-stage filtering removes noise before the merge step. Calibrate thresholds on a 200-tile validation split of manually labeled imagery.

```python
from shapely.ops import unary_union

def filter_predictions(
    gdf: gpd.GeoDataFrame,
    confidence_col: str = "confidence",
    threshold: float = 0.70,
    min_area_m2: float = 40.0,
) -> gpd.GeoDataFrame:
    # Stage 1: score threshold
    gdf = gdf[gdf[confidence_col] >= threshold].copy()
    # Stage 2: area filter (requires projected CRS — EPSG:32632 / UTM etc.)
    gdf = gdf[gdf.geometry.area >= min_area_m2].copy()
    # Stage 3: fix any remaining invalid geometries
    gdf["geometry"] = gdf.geometry.apply(
        lambda g: make_valid(g) if not g.is_valid else g
    )
    return gdf.reset_index(drop=True)

def spatial_nms(
    gdf: gpd.GeoDataFrame,
    iou_threshold: float = 0.45,
    confidence_col: str = "confidence",
) -> gpd.GeoDataFrame:
    """Suppress lower-confidence predictions whose IoU with a higher-scoring
    prediction exceeds iou_threshold. O(n²) — run after per-tile filtering."""
    gdf = gdf.sort_values(confidence_col, ascending=False).reset_index(drop=True)
    keep = []
    suppressed = set()
    for i, row in gdf.iterrows():
        if i in suppressed:
            continue
        keep.append(i)
        for j, other in gdf.iloc[i + 1 :].iterrows():
            if j in suppressed:
                continue
            intersection = row.geometry.intersection(other.geometry).area
            union = row.geometry.union(other.geometry).area
            if union > 0 and (intersection / union) >= iou_threshold:
                suppressed.add(j)
    return gdf.loc[keep].reset_index(drop=True)
```

For regional datasets with millions of predictions, replace the O(n²) loop with a spatial index (`gdf.sindex`) to limit intersection tests to candidate pairs only.

### Step 6 — Export and Platform Integration

Serialize to GeoJSON or GeoParquet with a mandatory metadata schema. Assign per-annotation [confidence scores](/geospatial-annotation-fundamentals-architecture/confidence-scoring-for-geospatial-labels/) as attributes so annotation platforms can prioritize low-confidence candidates for human review.

```python
import json
from datetime import datetime, timezone

REQUIRED_COLUMNS = ["geometry", "confidence", "class_name", "tile_id", "source_model", "timestamp"]

def export_prelabels(
    gdf: gpd.GeoDataFrame,
    output_path: Path,
    source_crs: CRS,
    export_crs_epsg: int = 4326,
) -> Path:
    # Reproject to WGS 84 for GeoJSON interoperability
    if source_crs.to_epsg() != export_crs_epsg:
        gdf = gdf.to_crs(epsg=export_crs_epsg)

    gdf["timestamp"] = datetime.now(timezone.utc).isoformat()

    missing = [c for c in REQUIRED_COLUMNS if c not in gdf.columns]
    if missing:
        raise ValueError(f"Missing required columns before export: {missing}")

    if output_path.suffix == ".parquet":
        gdf.to_parquet(output_path, index=False)
    else:
        gdf.to_file(output_path, driver="GeoJSON")
    return output_path
```

Exporting to `EPSG:4326` (WGS 84) allows direct import into [Label Studio with geospatial workflows](/labeling-workflows-toolchain-integration/integrating-label-studio-with-geospatial-workflows/) without additional reprojection. GeoParquet is preferred for datasets exceeding 50,000 annotations — it compresses 5–10× compared to GeoJSON and retains geometry precision without floating-point truncation.

---

## Spatial Parameters & Configuration Reference

| Parameter | Type | Recommended range | Spatial implication |
|---|---|---|---|
| `tile_size` | int (px) | 512–2048 | Smaller tiles → more boundary artefacts; larger tiles → GPU OOM on high-res imagery |
| `overlap` | float | 0.10–0.15 | Below 0.10 causes unrecoverable boundary truncation; above 0.20 increases merge cost |
| `confidence_threshold` | float | 0.65–0.85 | Calibrate per class; buildings tolerate 0.80, sparse rural features need 0.65 |
| `min_area_m2` | float | 20–200 m² | Must match target feature scale; building footprints ≥ 40 m², road segments ≥ 100 m² |
| `iou_threshold` (NMS) | float | 0.40–0.55 | Lower values suppress more aggressively; calibrate against tile overlap percentage |
| `export_crs_epsg` | int | `4326` or local UTM | Use `4326` for Label Studio; use local projected CRS for area-accurate filtering |
| `pred_iou_thresh` (SAM) | float | 0.80–0.92 | SAM internal quality gate; raise for clean orthomosaics, lower for noisy aerials |
| `points_per_side` (SAM) | int | 16–64 | Higher → denser mask coverage → slower inference; 32 suits 1 m GSD imagery |

---

## Edge Cases and Spatial Failure Modes

**Tile affine transform dropped during multiprocessing.** When tiles are processed with `multiprocessing.Pool`, Python pickles the tile array but not the associated `Affine` object if it is not explicitly included in the task tuple. All polygon coordinates silently map to pixel-space (0, 0) origin. Fix: always bundle `(tile_array, affine, tile_id, crs_wkt)` as a single serializable unit.

**Mixed CRS sources in a mosaic.** If the input raster is a mosaic assembled from tiles with different source CRSes, `rasterio.open` may report the dominant CRS while individual tiles carry offset geometry. Validate by checking that a sample of output polygons land within the declared bounding box of the raster:

```python
from shapely.geometry import box as shapely_box

def assert_geom_in_bounds(gdf: gpd.GeoDataFrame, raster_bounds: tuple) -> None:
    raster_box = shapely_box(*raster_bounds)
    outside = gdf[~gdf.geometry.intersects(raster_box)]
    if not outside.empty:
        raise AssertionError(f"{len(outside)} predictions fall outside raster bounds — CRS mismatch suspected.")
```

**Self-intersecting polygons from noisy contours.** SAM masks on low-contrast imagery (fog, haze, uniform rooftops) produce jagged contours with figure-eight topology. `Shapely` operations on these raise `TopologicalError`. Always call `make_valid` immediately after contour-to-polygon conversion, not as a post-processing step — by then a spatial join may already have silently dropped the geometry.

**Confidence score inflation from radiometric imbalances.** Models trained on standard RGB imagery report inflated confidence on tiles with unusual radiometric properties (sensor saturation, shadow masking, seasonal reflectance shifts). Cross-validate confidence distributions against a held-out validation set whenever you process imagery from a new sensor or acquisition date.

**Datum shift when mixing `EPSG:4326` and `EPSG:4269` (NAD83).** For North American datasets, treating WGS 84 and NAD83 as identical introduces up to 1.5 m offset. At a 0.3 m GSD, this shifts polygon centroids by 5 pixel widths. Explicitly declare the datum in all `CRS.from_epsg()` calls and use PROJ with datum grid files enabled.

---

## Integration and Automation Hooks

### Label Studio Pre-Annotation Integration

Push pre-labels as Label Studio pre-annotations using the SDK, filtered to a specific confidence band to surface the most uncertain candidates first:

```python
from label_studio_sdk import Client

def push_to_label_studio(
    gdf: gpd.GeoDataFrame,
    ls_url: str,
    api_key: str,
    project_id: int,
    confidence_col: str = "confidence",
    review_band: tuple[float, float] = (0.65, 0.80),
) -> int:
    ls = Client(url=ls_url, api_key=api_key)
    project = ls.get_project(project_id)

    review_gdf = gdf[
        (gdf[confidence_col] >= review_band[0]) &
        (gdf[confidence_col] < review_band[1])
    ]
    tasks = []
    for _, row in review_gdf.iterrows():
        tasks.append({
            "data": {"geo": row.geometry.__geo_interface__},
            "predictions": [{"result": [{"value": {"confidence": row[confidence_col]}}]}],
        })
    project.import_tasks(tasks)
    return len(tasks)
```

The [QGIS plugin ecosystem for annotation teams](/labeling-workflows-toolchain-integration/qgis-plugin-ecosystem-for-annotation-teams/) provides a complementary desktop review path — load the exported GeoJSON directly into a QGIS project to inspect prediction geometry against the source orthomosaic, snap polygons to visible edges, and batch-edit attributes before re-exporting.

### DVC Pipeline Checkpoint Integration

Wire each stage as a [DVC pipeline](/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/) stage so that partial runs checkpoint at the tile level and downstream stages only re-execute when their inputs change:

```yaml
# dvc.yaml
stages:
  prelabel_inference:
    cmd: python scripts/run_inference.py --config configs/prelabel.yaml
    deps:
      - data/raw/ortho.tif
      - scripts/run_inference.py
      - configs/prelabel.yaml
    outs:
      - data/interim/tiles/        # per-tile GeoParquet files
      - data/interim/prelabels.geojson
    params:
      - configs/prelabel.yaml:
          - tile_size
          - overlap
          - confidence_threshold
```

When `confidence_threshold` changes in the config, DVC invalidates and re-runs only the filter step — not the expensive inference step — as long as tile outputs are tracked separately.

---

## Validation and Testing

Run these assertions before committing pre-labels to storage or pushing to an annotation platform:

```python
import pytest
import geopandas as gpd
from shapely.geometry import box as shapely_box
from pyproj import CRS

def validate_prelabel_output(output_path: Path, raster_meta: dict) -> None:
    gdf = gpd.read_file(output_path)

    # 1. Required schema
    required = {"geometry", "confidence", "class_name", "tile_id", "timestamp"}
    missing = required - set(gdf.columns)
    assert not missing, f"Missing columns: {missing}"

    # 2. CRS declared and matches expected export EPSG
    assert gdf.crs is not None, "Output GDF has no CRS"
    assert gdf.crs.to_epsg() == 4326, f"Expected EPSG:4326, got {gdf.crs.to_epsg()}"

    # 3. All geometries valid
    invalid = gdf[~gdf.geometry.is_valid]
    assert invalid.empty, f"{len(invalid)} invalid geometries in output"

    # 4. Confidence scores within bounds
    assert gdf["confidence"].between(0.0, 1.0).all(), "Confidence scores out of [0, 1]"

    # 5. All predictions within raster footprint (with 5 m tolerance)
    raster_box = shapely_box(*raster_meta["bounds"]).buffer(5)
    outside = gdf[~gdf.geometry.intersects(raster_box)]
    assert outside.empty, f"{len(outside)} predictions outside raster bounds"

    print(f"Validation passed: {len(gdf)} pre-labels ready for annotation review.")
```

Add these assertions as a `pytest` suite and run them as a CI gate using GitHub Actions or as a DVC `check` stage. Teams producing training data for safety-critical applications (flood mapping, infrastructure inspection) should also compute [IoU thresholds](/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/calculating-iou-thresholds-for-geospatial-object-detection/) against a held-out labeled reference to quantify pre-label quality before human review begins.

---

## Production Hardening Checklist

- [ ] CRS validated and EPSG resolved before tile generation begins
- [ ] Affine transform bundled with each tile task in multiprocessing pool
- [ ] `make_valid` called immediately after contour-to-polygon conversion
- [ ] Per-tile GeoParquet checkpoints written before next tile starts (idempotent resume)
- [ ] Confidence threshold calibrated against ≥ 200 manually labeled validation tiles
- [ ] Spatial NMS run with `sindex` for datasets > 100,000 predictions
- [ ] `assert_geom_in_bounds` check passes on sample before full export
- [ ] Required metadata schema validated with `pydantic` or assertion block
- [ ] Export CRS matches target annotation platform expectations (`EPSG:4326` for Label Studio)
- [ ] DVC pipeline stage defined so inference cache is not invalidated by filter-only changes
- [ ] Human review acceptance rate tracked per model checkpoint and image acquisition date

---

## Related

- [Converting Label Studio Exports to YOLOv8 Format](/labeling-workflows-toolchain-integration/automating-pre-labeling-with-foundation-models/converting-label-studio-exports-to-yolov8-format/) — format-conversion workflow for the downstream training step
- [Human-in-the-Loop Validation Cycles](/labeling-workflows-toolchain-integration/human-in-the-loop-validation-cycles/) — how to structure the review queue, track edit distance, and feed corrections back into the model
- [Integrating Label Studio with Geospatial Workflows](/labeling-workflows-toolchain-integration/integrating-label-studio-with-geospatial-workflows/) — platform setup, S3/GCS storage sync, and per-annotator quality scoring
- [QGIS Plugin Ecosystem for Annotation Teams](/labeling-workflows-toolchain-integration/qgis-plugin-ecosystem-for-annotation-teams/) — desktop review environment for high-precision polygon correction
- [Implementing DVC for Geospatial Training Data](/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/) — version the raw tiles, pre-labels, and corrected annotations as a reproducible pipeline

This workflow is one component of the broader [Labeling Workflows & Toolchain Integration](/labeling-workflows-toolchain-integration/) pipeline.
