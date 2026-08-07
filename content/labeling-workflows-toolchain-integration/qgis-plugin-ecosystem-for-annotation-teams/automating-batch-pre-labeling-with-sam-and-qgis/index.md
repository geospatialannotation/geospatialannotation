---
title: "Automating Batch Pre-Labeling with SAM and QGIS"
description: "Run Meta's Segment Anything Model on georeferenced raster tiles, convert binary masks to vector polygons with correct CRS, and load spatially aligned GeoJSON directly into QGIS for rapid human review."
slug: "automating-batch-pre-labeling-with-sam-and-qgis"
type: "tutorial"
breadcrumb:
  - label: "Home"
    url: "/"
  - label: "Labeling Workflows & Toolchain Integration"
    url: "/labeling-workflows-toolchain-integration/"
  - label: "QGIS Plugin Ecosystem for Annotation Teams"
    url: "/labeling-workflows-toolchain-integration/qgis-plugin-ecosystem-for-annotation-teams/"
  - label: "Automating Batch Pre-Labeling with SAM and QGIS"
    url: "/labeling-workflows-toolchain-integration/qgis-plugin-ecosystem-for-annotation-teams/automating-batch-pre-labeling-with-sam-and-qgis/"
datePublished: "2025-03-10"
dateModified: "2026-06-25"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Automating Batch Pre-Labeling with SAM and QGIS",
      "description": "Run Meta's Segment Anything Model on georeferenced raster tiles, convert binary masks to vector polygons with correct CRS, and load spatially aligned GeoJSON directly into QGIS for rapid human review.",
      "datePublished": "2025-03-10",
      "dateModified": "2026-06-25",
      "author": {"@type": "Organization", "name": "Geospatial Annotation"},
      "publisher": {"@type": "Organization", "name": "Geospatial Annotation"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.geospatialannotation.com/"},
        {"@type": "ListItem", "position": 2, "name": "Labeling Workflows & Toolchain Integration", "item": "https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/"},
        {"@type": "ListItem", "position": 3, "name": "QGIS Plugin Ecosystem for Annotation Teams", "item": "https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/qgis-plugin-ecosystem-for-annotation-teams/"},
        {"@type": "ListItem", "position": 4, "name": "Automating Batch Pre-Labeling with SAM and QGIS", "item": "https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/qgis-plugin-ecosystem-for-annotation-teams/automating-batch-pre-labeling-with-sam-and-qgis/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Automating Batch Pre-Labeling with SAM and QGIS",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Tile rasters and normalize CRS", "text": "Reproject orthomosaics to a local metric CRS such as EPSG:32634, then split into 1024×1024 pixel tiles with 15–20% overlap so every tile inherits uniform pixel-to-metre ratios."},
        {"@type": "HowToStep", "position": 2, "name": "Run batch SAM inference", "text": "Load a SAM checkpoint once, then iterate tiles inside a torch.no_grad() context with pred_iou_thresh ≥ 0.85 and stability_score_thresh ≥ 0.92. Mixed-precision (torch.autocast) cuts VRAM usage by roughly 40%."},
        {"@type": "HowToStep", "position": 3, "name": "Convert pixel masks to georeferenced polygons", "text": "Apply each tile's rasterio affine transform via shapely_transform to map pixel contour coordinates to real-world map coordinates, then export as a GeoDataFrame with per-polygon confidence scores."},
        {"@type": "HowToStep", "position": 4, "name": "Import and validate in QGIS", "text": "Load the GeoJSON into QGIS, apply a Graduated renderer on the confidence field (green ≥ 0.90, amber 0.80–0.89, red < 0.80), run Topology Checker, and enable snapping to align pre-labels with existing survey boundaries."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why do SAM masks drift from real-world boundaries after vectorization?",
          "acceptedAnswer": {"@type": "Answer", "text": "The raster was likely in a geographic CRS (WGS84) during inference. Pixel-to-metre ratios are non-uniform in geographic projections, so SAM misinterprets object scale. Reproject to a local metric CRS before tiling and the drift disappears."}
        },
        {
          "@type": "Question",
          "name": "How do I stop duplicate polygons appearing at tile edges?",
          "acceptedAnswer": {"@type": "Answer", "text": "Maintain 15–20% tile overlap, then post-process with drop_duplicates(subset=['geometry']) sorted by descending confidence. For near-duplicates use gpd.overlay() and dissolve by source_tile."}
        },
        {
          "@type": "Question",
          "name": "Which SAM checkpoint is best for aerial imagery?",
          "acceptedAnswer": {"@type": "Answer", "text": "vit_h gives the highest mask quality but requires ~7 GB VRAM. For production throughput on a 16 GB GPU, vit_l is a practical compromise. SAM 2's Hiera backbone offers faster inference with similar quality and accepts the same tiling pipeline."}
        },
        {
          "@type": "Question",
          "name": "Can I filter pre-labels by polygon area before loading into QGIS?",
          "acceptedAnswer": {"@type": "Answer", "text": "Yes. After gpd.GeoDataFrame.from_features(), call gdf = gdf[gdf.geometry.area > MIN_AREA_M2]. Because the GeoDataFrame is already in a metric CRS, the area values are in square metres and the threshold is meaningful."}
        }
      ]
    }
  ]
}
</script>

# Automating Batch Pre-Labeling with SAM and QGIS

A headless Python pipeline runs Meta's Segment Anything Model (SAM) on georeferenced raster tiles, transforms binary segmentation masks back to map coordinates using each tile's affine transform, and exports spatially aligned GeoJSON that QGIS loads directly for human review. The pipeline removes manual digitizing as the rate-limiting step: a GPU pass over one hundred 1024×1024 tiles completes in minutes, producing polygon annotations that annotators correct rather than draw from scratch.

## Why Unprojected Inference Breaks the Pipeline

When the source raster is in a geographic [coordinate reference system](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) such as `EPSG:4326`, one pixel does not represent a consistent ground distance across the image. SAM's receptive field spans different physical areas in the north versus south of a scene, causing fragmented or oversized masks at scale. The second failure is quieter: converting pixel-space contours back to geographic coordinates using a geographic CRS affine transform produces geometries that look correct in a GIS viewer but carry distorted area and perimeter values, which collapses [IoU threshold](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/calculating-iou-thresholds-for-geospatial-object-detection/) calculations at model evaluation time. Both failures are silent — the pipeline finishes, the GeoJSON loads, but the annotations do not match the ground truth.

<figure>
<svg viewBox="-10 35 740 163" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="SAM batch pre-labeling pipeline: raster tiles flow through SAM inference, mask vectorization, and QGIS review" style="width:100%;max-width:740px;display:block;">
  <title>SAM Batch Pre-Labeling Pipeline</title>
  <desc>Four pipeline stages shown left to right: Raster Tiling and CRS Normalization, SAM Batch Inference, Mask to Vector Conversion, and QGIS Review and Export.</desc>
  <rect x="-10" y="35" width="740" height="163" style="fill:var(--bg)"/>
  <defs>
    <marker id="arr-sam" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 Z" fill="currentColor"/>
    </marker>
  </defs>
  <!-- Stage boxes -->
  <rect x="10" y="55" width="150" height="100" rx="8" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="85" y="82" text-anchor="middle" font-size="12" font-weight="bold" fill="currentColor">Raster Tiling</text>
  <text x="85" y="98" text-anchor="middle" font-size="11" fill="currentColor">CRS → metric</text>
  <text x="85" y="114" text-anchor="middle" font-size="11" fill="currentColor">1024×1024 px</text>
  <text x="85" y="130" text-anchor="middle" font-size="11" fill="currentColor">15–20% overlap</text>
  <rect x="195" y="55" width="150" height="100" rx="8" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="270" y="82" text-anchor="middle" font-size="12" font-weight="bold" fill="currentColor">SAM Inference</text>
  <text x="270" y="98" text-anchor="middle" font-size="11" fill="currentColor">vit_h / vit_l</text>
  <text x="270" y="114" text-anchor="middle" font-size="11" fill="currentColor">IoU ≥ 0.85</text>
  <text x="270" y="130" text-anchor="middle" font-size="11" fill="currentColor">stability ≥ 0.92</text>
  <rect x="380" y="55" width="150" height="100" rx="8" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="455" y="82" text-anchor="middle" font-size="12" font-weight="bold" fill="currentColor">Mask → Vector</text>
  <text x="455" y="98" text-anchor="middle" font-size="11" fill="currentColor">affine transform</text>
  <text x="455" y="114" text-anchor="middle" font-size="11" fill="currentColor">topology clean</text>
  <text x="455" y="130" text-anchor="middle" font-size="11" fill="currentColor">GeoJSON export</text>
  <rect x="565" y="55" width="145" height="100" rx="8" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="637" y="82" text-anchor="middle" font-size="12" font-weight="bold" fill="currentColor">QGIS Review</text>
  <text x="637" y="98" text-anchor="middle" font-size="11" fill="currentColor">confidence triage</text>
  <text x="637" y="114" text-anchor="middle" font-size="11" fill="currentColor">topology check</text>
  <text x="637" y="130" text-anchor="middle" font-size="11" fill="currentColor">COCO / YOLO out</text>
  <!-- Arrows -->
  <line x1="161" y1="105" x2="193" y2="105" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr-sam)"/>
  <line x1="346" y1="105" x2="378" y2="105" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr-sam)"/>
  <line x1="531" y1="105" x2="563" y2="105" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr-sam)"/>
  <!-- Step labels -->
  <text x="85" y="175" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">Step 1</text>
  <text x="270" y="175" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">Step 2</text>
  <text x="455" y="175" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">Step 3</text>
  <text x="637" y="175" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">Step 4</text>
</svg>

<figcaption>Four deterministic pipeline stages: tile and reproject, run SAM, convert masks to georeferenced polygons, then validate in QGIS.</figcaption>
</figure>

## Step-by-Step Implementation

### Step 1 — Tile the Raster and Normalize the CRS

Use `rasterio` and `rio-cogeo` to reproject to a local UTM zone and split into overlapping tiles. Reprojection must happen before tiling so every tile inherits a consistent metric CRS.

```python
# requirements: rasterio==1.3.10, rio-cogeo==3.6.0, numpy==1.26.4
import math
import rasterio
from rasterio.warp import calculate_default_transform, reproject, Resampling
from rasterio.windows import Window
import os

TARGET_CRS = "EPSG:32634"          # UTM zone 34N — adjust to your AOI
TILE_SIZE = 1024                   # pixels
OVERLAP = int(TILE_SIZE * 0.175)   # ~18% overlap


def reproject_to_metric(src_path: str, dst_path: str) -> None:
    """Reproject an arbitrary raster to a metric CRS before tiling."""
    with rasterio.open(src_path) as src:
        transform, width, height = calculate_default_transform(
            src.crs, TARGET_CRS, src.width, src.height, *src.bounds
        )
        profile = src.profile.copy()
        profile.update(crs=TARGET_CRS, transform=transform,
                       width=width, height=height)
        with rasterio.open(dst_path, "w", **profile) as dst:
            for i in range(1, src.count + 1):
                reproject(
                    source=rasterio.band(src, i),
                    destination=rasterio.band(dst, i),
                    src_transform=src.transform,
                    src_crs=src.crs,
                    dst_transform=transform,
                    dst_crs=TARGET_CRS,
                    resampling=Resampling.bilinear,
                )


def tile_raster(src_path: str, out_dir: str) -> list[str]:
    """Slice a metric raster into overlapping tiles; return tile paths."""
    os.makedirs(out_dir, exist_ok=True)
    tile_paths: list[str] = []
    step = TILE_SIZE - OVERLAP
    with rasterio.open(src_path) as src:
        cols = math.ceil((src.width - OVERLAP) / step)
        rows = math.ceil((src.height - OVERLAP) / step)
        for r in range(rows):
            for c in range(cols):
                col_off = c * step
                row_off = r * step
                w = min(TILE_SIZE, src.width - col_off)
                h = min(TILE_SIZE, src.height - row_off)
                window = Window(col_off, row_off, w, h)
                transform = src.window_transform(window)
                profile = src.profile.copy()
                profile.update(width=w, height=h, transform=transform)
                tile_path = os.path.join(out_dir, f"tile_r{r:04d}_c{c:04d}.tif")
                with rasterio.open(tile_path, "w", **profile) as dst:
                    dst.write(src.read(window=window))
                tile_paths.append(tile_path)
    return tile_paths
```

### Step 2 — Batch SAM Inference

Pre-load the checkpoint once and iterate tiles in a `torch.no_grad()` context. Mixed-precision cuts VRAM usage by roughly 40% without affecting mask quality.

<svg viewBox="0 0 720 280" role="img" aria-label="Three ways to prompt the segmentation model on one tile, and what each returns" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>The prompt decides how much you have to throw away</title>
  <desc>The same tile prompted three ways. A point prompt returns one mask per click and needs a click per object. A box prompt returns one mask per box and pairs naturally with an existing detector. Automatic mode returns every mask in the tile, including roads, shadows and roof sections, so most of the output is discarded by an area and class filter.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <!-- Point -->
  <text x="120" y="34" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace" font-weight="600">point prompt</text>
  <rect x="30" y="50" width="180" height="130" fill="none" stroke="currentColor" stroke-width="1.3"/>
  <polygon points="70,80 150,74 158,140 78,148" fill="currentColor" opacity="0.3" stroke="currentColor" stroke-width="1.5"/>
  <circle cx="114" cy="110" r="4" fill="currentColor"/>
  <text x="120" y="204" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">one mask per click</text>
  <text x="120" y="222" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">precise, but it is still</text>
  <text x="120" y="236" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">a click per object</text>
  <!-- Box -->
  <text x="360" y="34" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace" font-weight="600">box prompt</text>
  <rect x="270" y="50" width="180" height="130" fill="none" stroke="currentColor" stroke-width="1.3"/>
  <rect x="300" y="70" width="100" height="80" fill="none" stroke="currentColor" stroke-width="1.3" stroke-dasharray="4 2"/>
  <polygon points="310,80 390,74 398,140 318,148" fill="currentColor" opacity="0.3" stroke="currentColor" stroke-width="1.5"/>
  <text x="360" y="204" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">one mask per box</text>
  <text x="360" y="222" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">feed it a detector's boxes and</text>
  <text x="360" y="236" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">the class comes along for free</text>
  <!-- Automatic -->
  <text x="600" y="34" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace" font-weight="600">automatic</text>
  <rect x="510" y="50" width="180" height="130" fill="none" stroke="currentColor" stroke-width="1.3"/>
  <polygon points="530,66 592,62 596,104 534,108" fill="currentColor" opacity="0.22" stroke="currentColor" stroke-width="1.2"/>
  <polygon points="606,62 674,60 678,100 610,104" fill="currentColor" opacity="0.22" stroke="currentColor" stroke-width="1.2"/>
  <polygon points="530,118 596,114 600,168 534,172" fill="currentColor" opacity="0.22" stroke="currentColor" stroke-width="1.2"/>
  <polygon points="610,116 678,112 682,170 614,174" fill="currentColor" opacity="0.22" stroke="currentColor" stroke-width="1.2"/>
  <text x="600" y="204" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">every mask in the tile</text>
  <text x="600" y="222" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">roads, shadows and roof sections</text>
  <text x="600" y="236" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">arrive with the buildings</text>
  <text x="360" y="266" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">the model returns geometry, never a class — whichever prompt you use, the label still has to come from somewhere else</text>
</svg>

```python
# requirements: segment-anything==1.0, torch==2.3.0, opencv-python==4.9.0.80
import torch
import numpy as np
import rasterio
from segment_anything import sam_model_registry, SamAutomaticMaskGenerator

CHECKPOINT = "checkpoints/sam_vit_h_4b8939.pth"
MODEL_TYPE = "vit_h"
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

sam = sam_model_registry[MODEL_TYPE](checkpoint=CHECKPOINT)
sam.to(device=DEVICE)

mask_generator = SamAutomaticMaskGenerator(
    model=sam,
    points_per_side=32,
    pred_iou_thresh=0.85,
    stability_score_thresh=0.92,
    crop_n_layers=1,
    min_mask_region_area=500,   # pixels; filters noise fragments
)


def run_sam_on_tiles(tile_paths: list[str]) -> list[tuple[str, list[dict]]]:
    """Return (tile_path, masks) pairs for every input tile."""
    results: list[tuple[str, list[dict]]] = []
    with torch.no_grad():
        with torch.autocast(device_type=DEVICE, dtype=torch.float16):
            for tile_path in tile_paths:
                with rasterio.open(tile_path) as src:
                    img = src.read().transpose(1, 2, 0)  # (H, W, C)
                    # SAM expects uint8 RGB; handle multi-band imagery
                    if img.shape[2] > 3:
                        img = img[:, :, :3]
                    img = img.astype(np.uint8)
                masks = mask_generator.generate(img)
                results.append((tile_path, masks))
    return results
```

### Step 3 — Convert Pixel Masks to Georeferenced Polygons

Apply each tile's affine transform to map pixel contour coordinates to real-world map coordinates. Assign per-polygon [confidence scores](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/confidence-scoring-for-geospatial-labels/) so annotators can triage masks by certainty in QGIS.

<svg viewBox="-6 40 752 210" role="img" aria-label="The chain that turns a binary mask array into a georeferenced polygon, with what each step can lose" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:752px;display:block;margin:1.5rem auto;">
  <title>From a boolean array to something a GIS will accept</title>
  <desc>A binary mask is traced to pixel contours, simplified to remove the staircase, transformed through the tile geotransform into world coordinates, then repaired and filtered by minimum area. Each step can lose something: tracing drops single-pixel holes, simplification rounds corners, and the transform is where a wrong tile origin puts the whole polygon in the wrong place.</desc>
  <rect x="-6" y="40" width="752" height="210" style="fill:var(--bg)"/>
  <defs>
    <marker id="sm-arr" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor"/>
    </marker>
  </defs>
  <rect x="14" y="60" width="126" height="56" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="77" y="84" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">binary mask</text>
  <text x="77" y="101" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace" opacity="0.75">bool[512, 512]</text>
  <line x1="140" y1="88" x2="164" y2="88" stroke="currentColor" stroke-width="1.5" marker-end="url(#sm-arr)"/>
  <rect x="166" y="60" width="126" height="56" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="229" y="84" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">trace contours</text>
  <text x="229" y="101" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace" opacity="0.75">pixel rings</text>
  <line x1="292" y1="88" x2="316" y2="88" stroke="currentColor" stroke-width="1.5" marker-end="url(#sm-arr)"/>
  <rect x="318" y="60" width="126" height="56" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="381" y="84" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">simplify</text>
  <text x="381" y="101" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace" opacity="0.75">tolerance ≈ 1 px</text>
  <line x1="444" y1="88" x2="468" y2="88" stroke="currentColor" stroke-width="1.5" marker-end="url(#sm-arr)"/>
  <rect x="470" y="60" width="126" height="56" rx="6" fill="none" stroke="currentColor" stroke-width="2"/>
  <text x="533" y="84" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">apply transform</text>
  <text x="533" y="101" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace" opacity="0.75">tile affine + CRS</text>
  <line x1="596" y1="88" x2="620" y2="88" stroke="currentColor" stroke-width="1.5" marker-end="url(#sm-arr)"/>
  <rect x="622" y="60" width="104" height="56" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="674" y="84" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">repair</text>
  <text x="674" y="101" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace" opacity="0.75">make_valid</text>
  <!-- Losses -->
  <text x="229" y="152" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">single-pixel holes are</text>
  <text x="229" y="166" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">dropped here</text>
  <text x="381" y="152" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">the pixel staircase goes,</text>
  <text x="381" y="166" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">and so do real corners</text>
  <text x="533" y="152" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">a wrong tile origin moves</text>
  <text x="533" y="166" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">every polygon, identically</text>
  <line x1="229" y1="122" x2="229" y2="138" stroke="currentColor" stroke-width="1" opacity="0.45"/>
  <line x1="381" y1="122" x2="381" y2="138" stroke="currentColor" stroke-width="1" opacity="0.45"/>
  <line x1="533" y1="122" x2="533" y2="138" stroke="currentColor" stroke-width="1" opacity="0.45"/>
  <!-- Filter -->
  <rect x="150" y="190" width="440" height="40" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 3"/>
  <text x="370" y="215" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">then drop everything under the minimum area — in metres, after the transform</text>
</svg>

```python
# requirements: shapely==2.0.4, geopandas==0.14.4, opencv-python==4.9.0.80
import cv2
from shapely.geometry import Polygon, mapping
from shapely.ops import transform as shapely_transform
import geopandas as gpd
from rasterio.transform import Affine

MIN_AREA_PX = 500


def mask_to_georef_polygons(
    mask_binary: np.ndarray,
    affine_tfm: Affine,
    predicted_iou: float,
    source_tile: str,
) -> list[dict]:
    """Convert one SAM binary mask to a list of GeoJSON-ready feature dicts."""
    contours, _ = cv2.findContours(
        mask_binary.astype(np.uint8),
        cv2.RETR_EXTERNAL,
        cv2.CHAIN_APPROX_SIMPLE,
    )
    features: list[dict] = []
    for cnt in contours:
        if cv2.contourArea(cnt) < MIN_AREA_PX:
            continue
        pts = cnt.squeeze()
        if pts.ndim < 2 or len(pts) < 3:
            continue
        # Build pixel-space polygon, then apply raster affine transform
        pixel_ring = [tuple(pt) for pt in pts]
        pixel_poly = Polygon(pixel_ring)
        if not pixel_poly.is_valid:
            pixel_poly = pixel_poly.buffer(0)

        def _affine(xs, ys):
            geo_xs, geo_ys = zip(*(affine_tfm * (col, row) for col, row in zip(xs, ys)))
            return list(geo_xs), list(geo_ys)

        geo_poly = shapely_transform(_affine, pixel_poly)
        geo_poly = geo_poly.simplify(0.5, preserve_topology=True)
        features.append({
            "geometry": mapping(geo_poly),
            "properties": {
                "source_tile": source_tile,
                "confidence": round(float(predicted_iou), 4),
                "area_m2": round(geo_poly.area, 2),
            },
        })
    return features


def build_geodataframe(
    sam_results: list[tuple[str, list[dict]]],
    output_crs: str = TARGET_CRS,
) -> gpd.GeoDataFrame:
    """Aggregate all tile results into a single GeoDataFrame."""
    all_features: list[dict] = []
    for tile_path, masks in sam_results:
        with rasterio.open(tile_path) as src:
            tfm = src.transform
        for m in masks:
            all_features.extend(
                mask_to_georef_polygons(
                    m["segmentation"], tfm, m["predicted_iou"], tile_path
                )
            )
    gdf = gpd.GeoDataFrame.from_features(all_features, crs=output_crs)
    # Remove duplicates from overlapping tiles: keep the highest-confidence copy
    gdf = gdf.sort_values("confidence", ascending=False)
    gdf = gdf.drop_duplicates(subset=["geometry"])
    return gdf.reset_index(drop=True)
```

### Step 4 — Export GeoJSON and Load into QGIS

Write the GeoDataFrame to a GeoJSON file and configure QGIS for annotation review.

```python
OUTPUT_GEOJSON = "prelabels/sam_batch_output.geojson"

def export_prelabels(gdf: gpd.GeoDataFrame) -> None:
    gdf.to_file(OUTPUT_GEOJSON, driver="GeoJSON")
    print(f"Exported {len(gdf)} pre-label polygons → {OUTPUT_GEOJSON}")
    high_conf = (gdf["confidence"] >= 0.90).sum()
    print(f"  High-confidence (≥0.90): {high_conf} ({100*high_conf/len(gdf):.1f}%)")
```

In QGIS, open **Layer > Add Layer > Add Vector Layer** and select the GeoJSON. Apply a **Graduated** renderer on the `confidence` field — green for ≥ 0.90, amber for 0.80–0.89, red for < 0.80. Enable **Snapping** (Settings > Snapping Options, tolerance 5–10 map units) so editors can snap pre-label edges to existing survey boundaries. This review cycle integrates with the broader [QGIS plugin ecosystem for annotation teams](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/qgis-plugin-ecosystem-for-annotation-teams/).

Because every polygon already carries a metric geotransform, the reviewed layer exports cleanly to [COCO/YOLO formats](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/preserving-metadata-across-dataset-versions/) with the geotransform preserved as metadata — no second reprojection round-trip, and pixel-space bounding boxes recovered by inverting the same affine used in Step 3.

## Key Parameters Reference

| Parameter | Recommended value | Effect |
|---|---|---|
| `points_per_side` | 32 | Grid density for automatic prompt points; raise to 64 for dense urban scenes |
| `pred_iou_thresh` | 0.85 | Minimum predicted IoU to keep a mask; lower increases recall, raises noise |
| `stability_score_thresh` | 0.92 | Mask consistency across threshold perturbations; lower if SAM misses soft boundaries |
| `min_mask_region_area` | 500 px | Pixel noise filter; scale with GSD (higher GSD → larger threshold) |
| Tile overlap | 15–20% | Prevents edge-cut artifacts; overlap > 25% creates excessive duplicates |
| `simplify` tolerance | 0.5 m | Vertex reduction; keep < 1 m to preserve parcel or building edges |
| `MIN_AREA_M2` post-filter | 25–100 m² | Remove sub-parcel noise after metric CRS conversion |

## Common Errors and Fixes

<details>
<summary><strong>TypeError: image must be uint8</strong></summary>

SAM requires three-channel uint8 RGB input, but multispectral rasters read via rasterio are often `uint16` and carry more than three bands. The mask generator raises this on the first tile. Fix: `img = img[:, :, :3].astype(np.uint8)` — and apply a per-band stretch first if the source is true `uint16` radiance rather than a display-ready composite.

</details>

<details>
<summary><strong>Masks look correct but coordinates land far off the basemap</strong></summary>

The raster's CRS was geographic (`EPSG:4326`) at inference time, so each tile's affine transform maps pixel columns and rows to decimal-degree deltas instead of metres. Polygons render with the right shape but the wrong scale and position. Fix: run `reproject_to_metric()` before tiling so every tile inherits a uniform metric transform.

</details>

<details>
<summary><strong>Topology Checker flags hundreds of overlapping polygons</strong></summary>

Tile overlap produces the same object in two adjacent tiles without deduplication. The `drop_duplicates(subset=["geometry"])` step removes exact duplicates, but near-duplicates with slightly different vertex counts survive. Fix: dissolve near-duplicates with `gpd.overlay(gdf, gdf, how="union")` followed by a `groupby("source_tile").geometry.union_all()` pass, or snap to a shared grid before deduplicating.

</details>

<details>
<summary><strong>CUDA out of memory with vit_h</strong></summary>

The `vit_h` checkpoint needs roughly 7 GB of VRAM per batch, which overflows a 16 GB GPU once the automatic mask generator allocates its crop pyramid. Fix: switch to `vit_l` (~4 GB), enable `torch.autocast` as shown in Step 2, or drop `crop_n_layers` to `0` and process tiles strictly sequentially.

</details>

## Related

- [QGIS Plugin Ecosystem for Annotation Teams](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/qgis-plugin-ecosystem-for-annotation-teams/) — parent page covering plugin selection, scripting hooks, and team review workflows
- [Automating Pre-Labeling with Foundation Models](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/automating-pre-labeling-with-foundation-models/) — broader treatment of foundation-model-assisted labeling including Label Studio integration
- [Coordinate Reference Systems in Annotation Pipelines](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) — foundational CRS concepts underlying the reprojection steps above
- [Confidence Scoring for Geospatial Labels](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/confidence-scoring-for-geospatial-labels/) — how to use SAM's `predicted_iou` field to drive active learning queues

This page is part of the [QGIS Plugin Ecosystem for Annotation Teams](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/qgis-plugin-ecosystem-for-annotation-teams/) section within [Labeling Workflows & Toolchain Integration](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/).
