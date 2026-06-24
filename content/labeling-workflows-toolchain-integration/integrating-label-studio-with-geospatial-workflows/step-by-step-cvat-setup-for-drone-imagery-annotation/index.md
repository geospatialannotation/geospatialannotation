---
title: "Step-by-Step CVAT Setup for Drone Imagery Annotation"
description: "Deploy CVAT via Docker Compose, tile GeoTIFF orthomosaics with GDAL, automate task ingestion via cvat-sdk, and reconstruct geospatial coordinates after export — a complete production workflow for drone imagery annotation pipelines."
slug: "step-by-step-cvat-setup-for-drone-imagery-annotation"
type: "long_tail"
breadcrumb:
  - label: "Labeling Workflows & Toolchain Integration"
    url: "/labeling-workflows-toolchain-integration/"
  - label: "Integrating Label Studio with Geospatial Workflows"
    url: "/labeling-workflows-toolchain-integration/integrating-label-studio-with-geospatial-workflows/"
  - label: "Step-by-Step CVAT Setup for Drone Imagery Annotation"
    url: "/labeling-workflows-toolchain-integration/integrating-label-studio-with-geospatial-workflows/step-by-step-cvat-setup-for-drone-imagery-annotation/"
datePublished: "2025-11-10"
dateModified: "2026-06-24"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Step-by-Step CVAT Setup for Drone Imagery Annotation",
      "description": "Deploy CVAT via Docker Compose, tile GeoTIFF orthomosaics with GDAL, automate task ingestion via cvat-sdk, and reconstruct geospatial coordinates after export — a complete production workflow for drone imagery annotation pipelines.",
      "datePublished": "2025-11-10",
      "dateModified": "2026-06-24",
      "author": {"@type": "Organization", "name": "Geospatial Annotation"},
      "publisher": {"@type": "Organization", "name": "Geospatial Annotation"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Labeling Workflows & Toolchain Integration", "item": "https://geospatialannotation.com/labeling-workflows-toolchain-integration/"},
        {"@type": "ListItem", "position": 2, "name": "Integrating Label Studio with Geospatial Workflows", "item": "https://geospatialannotation.com/labeling-workflows-toolchain-integration/integrating-label-studio-with-geospatial-workflows/"},
        {"@type": "ListItem", "position": 3, "name": "Step-by-Step CVAT Setup for Drone Imagery Annotation", "item": "https://geospatialannotation.com/labeling-workflows-toolchain-integration/integrating-label-studio-with-geospatial-workflows/step-by-step-cvat-setup-for-drone-imagery-annotation/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Set Up CVAT for Drone Imagery Annotation",
      "description": "Deploy CVAT, tile orthomosaics, automate task ingestion, and reconstruct geospatial coordinates after annotation export.",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Deploy CVAT via Docker Compose with persistent NVMe storage"},
        {"@type": "HowToStep", "position": 2, "name": "Tile GeoTIFF orthomosaics with GDAL and build a sidecar CRS manifest"},
        {"@type": "HowToStep", "position": 3, "name": "Automate project and task creation with cvat-sdk"},
        {"@type": "HowToStep", "position": 4, "name": "Export annotations and reconstruct geospatial coordinates via affine transform"}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why does CVAT strip CRS metadata from GeoTIFF uploads?",
          "acceptedAnswer": {"@type": "Answer", "text": "CVAT's browser canvas decodes imagery as plain raster pixels and has no concept of a spatial reference system. GeoTIFF tags are silently discarded at ingest. Preserve the geotransform externally in a sidecar CSV or GeoJSON manifest keyed on tile filename, then reapply it to exported pixel coordinates using an affine transformation."}
        },
        {
          "@type": "Question",
          "name": "What tile size avoids browser OOM during annotation?",
          "acceptedAnswer": {"@type": "Answer", "text": "Keep tiles at or below 2048×2048 pixels (JPEG, ~3–5 MB each). Chrome caps its canvas memory budget near 4 GB; exceeding it causes silent blank frames or tab crashes. Use a 10–15% overlap between tiles so annotators can resolve boundary features."}
        },
        {
          "@type": "Question",
          "name": "Can CVAT run GPU-assisted auto-labeling on drone orthomosaics?",
          "acceptedAnswer": {"@type": "Answer", "text": "Yes. Add the Nucleus AI serverless component to docker-compose.override.yml and expose an NVIDIA GPU with the --gpus all flag. CVAT then surfaces SAM and YOLOv8 as interactive tools inside the annotation canvas. The GPU must support CUDA 12+ and have at least 8 GB VRAM for SAM-ViT-H."}
        }
      ]
    }
  ]
}
</script>

# Step-by-Step CVAT Setup for Drone Imagery Annotation

Deploy CVAT via Docker Compose, preprocess orthomosaics into browser-compatible tiles using GDAL, and automate task ingestion with the `cvat-sdk` Python client. The three constraints that must be addressed before a single polygon is drawn: CVAT's browser renderer strips all [coordinate reference system](/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) metadata from GeoTIFF uploads, orthomosaics routinely exceed the canvas memory budget, and manual upload at scale is error-prone. Handle all three upfront and the rest of the pipeline is deterministic.

## Why Naïve Uploads Break Drone Annotation Pipelines

Drone survey orthomosaics are large (5–40 GB), spatially referenced (typically `EPSG:32632`–`EPSG:32636` UTM zones or a local `EPSG:6312` equivalent), and delivered as GeoTIFF. Uploading a raw GeoTIFF directly to CVAT produces three failure modes:

1. **CRS loss** — CVAT discards the geotransform and all projection tags. Exported polygon coordinates are tile-local pixel offsets with no path back to the original geodetic frame without external bookkeeping.
2. **Browser OOM** — Chrome's canvas memory cap (~4 GB) causes frames above roughly 4096 × 4096 pixels to render as blank or crash the tab silently.
3. **Annotation drift** — without tile-overlap metadata, annotations on adjacent tiles cannot be merged without seam artefacts, making post-export [vector vs raster annotation workflows](/geospatial-annotation-fundamentals-architecture/vector-vs-raster-annotation-workflows/) validation fragile.

The workflow below eliminates all three before annotation starts.

## Prerequisites & Compatibility Matrix

| Component | Minimum | Notes |
|---|---|---|
| OS | Ubuntu 22.04 LTS / WSL2 | Linux preferred for volume I/O throughput |
| Docker Engine | ≥ 24.0 | Must support Compose V2 (`docker compose`) |
| CVAT | v2.14+ | Verify with `git describe --tags` after checkout |
| Python | ≥ 3.10 | Required for `cvat-sdk>=2.14.0` and GDAL bindings |
| GDAL | ≥ 3.6 | Install via `conda install -c conda-forge gdal==3.8.4` |
| RAM | 16 GB (32 GB recommended) | Orthomosaics >5 GB trigger OOM without chunking |
| Imagery format | JPEG/PNG (native), GeoTIFF (requires tiling) | CRS metadata stripped at ingest |
| GPU | Optional — NVIDIA + CUDA 12+ | Enables SAM/YOLOv8 auto-labeling in the CVAT canvas |

## Pipeline Overview

The diagram below shows data flow from raw GeoTIFF through CVAT to a spatially reconstructed annotation export.

<svg viewBox="0 0 720 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="CVAT drone annotation pipeline: GeoTIFF to spatially reconstructed annotations" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>CVAT Drone Annotation Pipeline</title>
  <desc>Five-stage pipeline: raw GeoTIFF orthomosaic is tiled by GDAL with a sidecar CRS manifest, tiles are ingested into CVAT via cvat-sdk, annotators label polygons and bounding boxes, exports are joined with the CRS manifest, and affine reconstruction yields georeferenced GeoJSON ready for model training.</desc>
  <defs>
    <marker id="arr" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
      <polygon points="0 0,8 3,0 6" fill="currentColor" opacity="0.7"/>
    </marker>
  </defs>
  <!-- Stage boxes -->
  <rect x="4" y="70" width="120" height="56" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="64" y="94" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">Raw GeoTIFF</text>
  <text x="64" y="110" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">orthomosaic</text>
  <rect x="152" y="70" width="120" height="56" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="212" y="94" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">GDAL Tiling</text>
  <text x="212" y="110" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">+ CRS manifest</text>
  <rect x="300" y="70" width="120" height="56" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="360" y="94" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">CVAT Ingest</text>
  <text x="360" y="110" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">cvat-sdk</text>
  <rect x="448" y="70" width="120" height="56" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="508" y="94" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">Annotation</text>
  <text x="508" y="110" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">polygon / bbox</text>
  <rect x="596" y="70" width="120" height="56" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="656" y="90" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">Geo Reconstruct</text>
  <text x="656" y="106" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">affine + CRS</text>
  <text x="656" y="120" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">→ GeoJSON</text>
  <!-- Arrows -->
  <line x1="124" y1="98" x2="148" y2="98" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr)" opacity="0.7"/>
  <line x1="272" y1="98" x2="296" y2="98" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr)" opacity="0.7"/>
  <line x1="420" y1="98" x2="444" y2="98" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr)" opacity="0.7"/>
  <line x1="568" y1="98" x2="592" y2="98" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr)" opacity="0.7"/>
  <!-- CRS manifest feedback arc -->
  <path d="M212 70 Q212 30 508 30 Q656 30 656 70" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="5,4" opacity="0.4" marker-end="url(#arr)"/>
  <text x="400" y="22" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.6">sidecar CRS manifest preserved end-to-end</text>
</svg>

## Step 1 — Deploy CVAT with Persistent NVMe Storage

CVAT's official repository ships a production-ready Compose stack. Map volumes to a fast NVMe drive before the first `up`; retrofitting storage paths after data is written requires a full database export and re-import.

```bash
git clone https://github.com/cvat-ai/cvat.git
cd cvat
git checkout v2.14.3          # pin to a tested release
cp docker-compose.override.yml.example docker-compose.override.yml
```

Open `docker-compose.override.yml` and bind the data volume to your NVMe mount:

```yaml
services:
  cvat_server:
    volumes:
      - /mnt/nvme/cvat_data:/home/cvat/data
    environment:
      CVAT_NUM_WORKERS: "4"
      CVAT_MAX_REQUEST_SIZE: "2147483648"   # 2 GB — covers large tile batches
  cvat_db:
    volumes:
      - /mnt/nvme/cvat_db:/var/lib/postgresql/data
```

Start and verify health:

```bash
docker compose up -d
docker compose ps --format "table {% raw %}{{.Name}}{% endraw %}\t{% raw %}{{.Status}}{% endraw %}"
```

All containers must show `healthy` or `running`. Create a superuser via the setup CLI, then open `http://localhost:8080` to confirm the UI is reachable.

```bash
docker compose exec cvat_server python manage.py createsuperuser
```

## Step 2 — Tile GeoTIFFs and Build a CRS Manifest

CVAT's canvas handles images up to roughly 4096 × 4096 pixels reliably. Drone orthomosaics routinely reach 20,000 × 30,000 pixels. Use `gdal_retile.py` to produce 2048 × 2048 JPEG tiles with 10% overlap, then record the pixel-to-world geotransform for each tile in a manifest CSV.

```bash
# Produce 2048 × 2048 tiles with 200-pixel overlap
gdal_retile.py \
  -ps 2048 2048 \
  -overlap 200 \
  -levels 1 \
  -targetDir ./tiles \
  -r bilinear \
  -of JPEG \
  input_orthomosaic.tif
```

After tiling, generate the CRS manifest programmatically using `rasterio` so every tile's origin and pixel size are recorded in the source projection:

```python
# build_manifest.py  — requires rasterio>=1.3.9
import csv
from pathlib import Path
import rasterio

TILE_DIR = Path("./tiles")
MANIFEST = Path("./crs_manifest.csv")

with MANIFEST.open("w", newline="") as fh:
    writer = csv.DictWriter(
        fh,
        fieldnames=["tile_id", "origin_x", "origin_y", "pixel_size_x",
                    "pixel_size_y", "epsg", "width", "height"],
    )
    writer.writeheader()
    for tile_path in sorted(TILE_DIR.glob("*.jpg")):
        with rasterio.open(tile_path) as src:
            t = src.transform
            writer.writerow({
                "tile_id": tile_path.name,
                "origin_x": t.c,
                "origin_y": t.f,
                "pixel_size_x": t.a,
                "pixel_size_y": t.e,   # negative for north-up rasters
                "epsg": src.crs.to_epsg() if src.crs else "UNKNOWN",
                "width": src.width,
                "height": src.height,
            })

print(f"Manifest written: {MANIFEST} ({sum(1 for _ in TILE_DIR.glob('*.jpg'))} tiles)")
```

Store `crs_manifest.csv` alongside the tile directory and commit it to your [dataset versioning](/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/) repository so the spatial context is never decoupled from the annotation asset.

## Step 3 — Automate Project and Task Creation with `cvat-sdk`

Manual upload breaks above a few hundred frames. Use `cvat-sdk` to create a project, define the label schema, and push tile batches as tasks programmatically.

```bash
pip install "cvat-sdk>=2.14.0"
```

```python
# ingest_tasks.py  — Python 3.10+, cvat-sdk>=2.14.0
from cvat_sdk import make_client
from cvat_sdk.models import ProjectWriteRequest, TaskWriteRequest, DataRequest
from pathlib import Path
from typing import Optional

HOST = "http://localhost:8080"
CREDENTIALS = ("admin", "your_password")
TILE_DIR = Path("./tiles")
BATCH_SIZE = 200   # frames per CVAT task — keeps UI snappy


def build_label_schema() -> list[dict]:
    """Label schema for multi-class drone survey annotation."""
    return [
        {"name": "building",       "color": "#e6194b", "type": "polygon"},
        {"name": "road_surface",   "color": "#3cb44b", "type": "polygon"},
        {"name": "vegetation",     "color": "#4363d8", "type": "polygon"},
        {"name": "vehicle",        "color": "#f58231", "type": "rectangle"},
        {"name": "water_body",     "color": "#911eb4", "type": "polygon"},
    ]


def ingest(project_name: str, tile_dir: Path, batch_size: int = BATCH_SIZE) -> None:
    tiles = sorted(tile_dir.glob("frame_*.jpg"))
    if not tiles:
        raise FileNotFoundError(f"No frame_*.jpg tiles found in {tile_dir}")

    with make_client(host=HOST, credentials=CREDENTIALS) as client:
        # 1. Create project with label schema
        project = client.projects.create(
            ProjectWriteRequest(name=project_name, labels=build_label_schema())
        )
        print(f"Project '{project_name}' created  id={project.id}")

        # 2. Push tiles in batches
        for batch_idx, start in enumerate(range(0, len(tiles), batch_size)):
            batch = tiles[start : start + batch_size]
            resources = [str(p) for p in batch]
            task = client.tasks.create_from_data(
                spec=TaskWriteRequest(
                    name=f"batch_{batch_idx:04d}",
                    project_id=project.id,
                ),
                resource_type="local",
                resources=resources,
                data_params=DataRequest(
                    chunk_size=1,       # 1 frame per chunk: enables precise frame-seek
                    sorting_method="natural",
                    image_quality=95,
                ),
            )
            print(f"  Task batch_{batch_idx:04d} created  id={task.id}  frames={len(batch)}")


if __name__ == "__main__":
    ingest("Drone_Survey_Q3_2026", TILE_DIR)
```

For datasets exceeding 10 GB, upload tiles to S3 first and pass presigned URLs as `resources` with `resource_type="share"`. The SDK handles chunked uploads and background task initialization automatically.

## Step 4 — Export Annotations and Reconstruct Geospatial Coordinates

CVAT exports contain pixel coordinates relative to each tile, not the original orthomosaic. Spatial reconstruction joins exported annotations with the manifest CSV and applies the stored affine transform to convert pixel offsets to the source [coordinate reference system](/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/).

```python
# reconstruct_geo.py  — requires geopandas>=0.14.3, shapely>=2.0.4, pandas>=2.2.2
import json
import csv
from pathlib import Path

import pandas as pd
import geopandas as gpd
from shapely.geometry import shape, mapping
from shapely.affinity import affine_transform

EXPORT_JSON = Path("./cvat_export_coco.json")   # COCO format export from CVAT
MANIFEST    = Path("./crs_manifest.csv")
OUTPUT      = Path("./annotations_geo.geojson")

TARGET_EPSG = 32633   # UTM zone 33N — match your survey CRS


def pixel_to_world(px: float, py: float, row: pd.Series) -> tuple[float, float]:
    """Convert tile-local pixel coords to projected world coords."""
    world_x = row.origin_x + px * row.pixel_size_x
    world_y = row.origin_y + py * row.pixel_size_y   # pixel_size_y is negative
    return world_x, world_y


def reconstruct() -> None:
    manifest = pd.read_csv(MANIFEST, index_col="tile_id")

    with EXPORT_JSON.open() as fh:
        coco = json.load(fh)

    images_by_id = {img["id"]: img["file_name"] for img in coco["images"]}
    features: list[dict] = []

    for ann in coco["annotations"]:
        tile_name = Path(images_by_id[ann["image_id"]]).name
        if tile_name not in manifest.index:
            raise KeyError(f"Tile '{tile_name}' missing from CRS manifest")

        row = manifest.loc[tile_name]

        # COCO segmentation: list of [x1,y1,x2,y2,...] rings
        if "segmentation" not in ann or not ann["segmentation"]:
            continue

        ring = ann["segmentation"][0]
        coords = [
            pixel_to_world(ring[i], ring[i + 1], row)
            for i in range(0, len(ring), 2)
        ]
        coords.append(coords[0])  # close ring

        features.append({
            "type": "Feature",
            "geometry": {"type": "Polygon", "coordinates": [coords]},
            "properties": {
                "category_id": ann["category_id"],
                "tile_id": tile_name,
                "annotation_id": ann["id"],
                "epsg": int(row.epsg),
            },
        })

    gdf = gpd.GeoDataFrame.from_features(features, crs=f"EPSG:{int(manifest.epsg.iloc[0])}")

    # Validate geometry before training export
    invalid = gdf[~gdf.is_valid]
    if not invalid.empty:
        print(f"Warning: {len(invalid)} invalid geometries — applying buffer(0) repair")
        gdf.geometry = gdf.geometry.buffer(0)

    gdf.to_file(OUTPUT, driver="GeoJSON")
    print(f"Exported {len(gdf)} features to {OUTPUT}")


if __name__ == "__main__":
    reconstruct()
```

Validate the result by spot-checking a sample of reconstructed polygons in QGIS overlaid on the original orthomosaic before committing annotations to your training dataset. Assigning per-annotation [confidence scores](/geospatial-annotation-fundamentals-architecture/confidence-scoring-for-geospatial-labels/) at this stage — for example based on annotator agreement on boundary features — makes the output compatible with active-learning review queues downstream.

## Key Thresholds & Configuration Reference

| Parameter | Recommended value | Spatial implication |
|---|---|---|
| Tile size | 2048 × 2048 px | Stays inside Chrome canvas memory budget |
| Tile overlap | 200 px (≈10%) | Allows boundary features to be annotated without seam artefacts |
| JPEG quality | 95 | Preserves fine structural edges; avoid <85 for building footprint annotation |
| `chunk_size` | 1 frame | Enables single-frame seek; higher values degrade scrub performance |
| `image_quality` API param | 95 | CVAT re-encodes on ingest at this quality if `chunk_size=1` |
| `CVAT_MAX_REQUEST_SIZE` | `2147483648` (2 GB) | Prevents 413 errors on large tile batches |
| Source CRS | `EPSG:32632`–`EPSG:32636` (UTM) | Metric units; required for IoU calculation in meters |
| Export format | COCO JSON | Best support in `cvat-sdk`; carries per-annotation segmentation masks |

## Common Errors & Fixes

**`413 Request Entity Too Large` on tile upload**
CVAT's nginx proxy defaults to a 1 MB body limit. Set `CVAT_MAX_REQUEST_SIZE=2147483648` in `docker-compose.override.yml` under the `cvat_server` environment block and restart with `docker compose up -d cvat_server`.

**Blank white frames in the annotation canvas**
The tile exceeds the browser canvas memory budget. Reduce tile size to 1536 × 1536 px and re-tile: `gdal_retile.py -ps 1536 1536 ...`. Also disable browser extensions — ad-blockers frequently intercept canvas blob URLs and cause silent decode failures.

**`KeyError: 'EPSG:UNKNOWN'` in `reconstruct_geo.py`**
`gdal_retile.py` writes JPEG tiles that strip the CRS because JPEG has no geotag standard. Open the source GeoTIFF with `rasterio.open` before retiling and store its CRS manually in the manifest header: `manifest["epsg"] = src.crs.to_epsg()`. If `to_epsg()` returns `None`, the source has a custom or non-EPSG-registered CRS; use `src.crs.to_wkt()` instead and record the WKT string.

**Polygon ring not closed after COCO export**
COCO segmentation rings are not required to repeat the first vertex. The `reconstruct_geo.py` script above appends `coords[0]` explicitly; if you write your own parser, add the same closure or Shapely will raise `TopologicalError`.

**Database bloat slows task listing after several months**
Run `VACUUM FULL` on the Postgres container monthly:
```bash
docker compose exec cvat_db psql -U postgres -c "VACUUM FULL ANALYZE;"
```

---

This workflow is one component of the broader [Integrating Label Studio with Geospatial Workflows](/labeling-workflows-toolchain-integration/integrating-label-studio-with-geospatial-workflows/) cluster, which covers comparative benchmarking between CVAT and Label Studio for spatial annotation tasks.

**Related**

- [Integrating Label Studio with Geospatial Workflows](/labeling-workflows-toolchain-integration/integrating-label-studio-with-geospatial-workflows/) — parent cluster: platform comparison, Label Studio ML backend setup, and export pipeline design
- [Labeling Workflows & Toolchain Integration](/labeling-workflows-toolchain-integration/) — the full toolchain pillar covering pre-labeling, human-in-the-loop validation, and QGIS plugin automation
- [Coordinate Reference Systems in Annotation Pipelines](/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) — CRS contracts, datum transforms, and projection-safe IoU computation
- [Implementing DVC for Geospatial Training Data](/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/) — version-control the tile manifest and annotation exports alongside imagery
- [Converting Label Studio Exports to YOLOv8 Format](/labeling-workflows-toolchain-integration/automating-pre-labeling-with-foundation-models/converting-label-studio-exports-to-yolov8-format/) — adapt the spatial reconstruction output for YOLO-based object detection training
