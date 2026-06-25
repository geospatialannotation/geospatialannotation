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
dateModified: "2026-06-25"
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
      "dateModified": "2026-06-25",
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

Deploy CVAT v2.14+ via Docker Compose, tile GeoTIFF orthomosaics into 2048 × 2048 JPEG frames using `gdal_retile.py`, automate task ingestion with `cvat-sdk`, then reconstruct projected [coordinate reference system](/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) coordinates from exported pixel offsets using a sidecar affine manifest. The key constraint: CVAT's browser canvas treats every upload as a plain raster — GeoTIFF projection tags are silently discarded at ingest, so spatial context must be preserved externally from the start.

## Why Naïve GeoTIFF Uploads Break Drone Annotation Pipelines

Drone survey orthomosaics arrive as large GeoTIFF files (5–40 GB) referenced to a UTM zone such as `EPSG:32632` or a local equivalent. Uploading a raw GeoTIFF directly to CVAT produces three failure modes that compound each other: CRS loss (the geotransform is stripped, leaving pixel-only coordinates with no route back to the geodetic frame), browser OOM (Chrome's ~4 GB canvas cap causes frames above roughly 4096 × 4096 pixels to render blank or crash the tab silently), and annotation drift across tile boundaries that makes post-export [vector vs raster annotation](/geospatial-annotation-fundamentals-architecture/vector-vs-raster-annotation-workflows/) validation fragile. The four-step workflow below eliminates all three before annotation starts.

<svg viewBox="0 0 760 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Four-stage CVAT drone annotation pipeline from raw GeoTIFF to georeferenced GeoJSON" style="width:100%;max-width:760px;display:block;margin:1.5rem auto;">
  <title>CVAT Drone Annotation Pipeline</title>
  <desc>Four-stage pipeline: raw GeoTIFF orthomosaic is tiled by GDAL alongside a sidecar CRS manifest; tiles are ingested into CVAT tasks via cvat-sdk; annotators draw polygons and bounding boxes; exported COCO JSON is joined with the CRS manifest and an affine transform produces georeferenced GeoJSON.</desc>
  <defs>
    <marker id="arr2" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
      <polygon points="0 0,8 3,0 6" fill="currentColor" opacity="0.7"/>
    </marker>
  </defs>
  <!-- Stage boxes -->
  <rect x="4" y="65" width="155" height="60" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="81" y="90" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">Raw GeoTIFF</text>
  <text x="81" y="107" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">orthomosaic input</text>
  <rect x="195" y="65" width="155" height="60" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="272" y="90" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">GDAL Tiling</text>
  <text x="272" y="107" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">+ CRS manifest CSV</text>
  <rect x="386" y="65" width="155" height="60" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="463" y="90" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">CVAT Ingest</text>
  <text x="463" y="107" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">cvat-sdk batches</text>
  <rect x="577" y="65" width="175" height="60" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="664" y="86" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">Geo Reconstruct</text>
  <text x="664" y="103" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">affine + manifest</text>
  <text x="664" y="118" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">→ GeoJSON</text>
  <!-- Arrows -->
  <line x1="159" y1="95" x2="191" y2="95" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr2)" opacity="0.7"/>
  <line x1="350" y1="95" x2="382" y2="95" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr2)" opacity="0.7"/>
  <line x1="541" y1="95" x2="573" y2="95" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr2)" opacity="0.7"/>
  <!-- CRS manifest feedback arc -->
  <path d="M272 65 Q272 24 464 24 Q664 24 664 65" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="5,4" opacity="0.4" marker-end="url(#arr2)"/>
  <text x="468" y="16" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.6">sidecar CRS manifest preserved end-to-end</text>
</svg>

## Prerequisites

| Component | Minimum version | Notes |
|---|---|---|
| Docker Engine | 24.0 | Compose V2 (`docker compose`) required |
| CVAT | v2.14+ | Pin with `git checkout v2.14.3` |
| Python | 3.10+ | Required for `cvat-sdk` and GDAL bindings |
| GDAL | 3.6+ | `conda install -c conda-forge gdal==3.8.4` |
| rasterio | 1.3.9+ | CRS manifest generation |
| RAM | 16 GB (32 GB recommended) | Orthomosaics >5 GB need chunked processing |

## Step 1 — Deploy CVAT with Persistent NVMe Storage

Map volumes to a fast NVMe drive before the first `docker compose up`; retrofitting storage paths after data is written requires a full database export and re-import.

```bash
git clone https://github.com/cvat-ai/cvat.git
cd cvat
git checkout v2.14.3
cp docker-compose.override.yml.example docker-compose.override.yml
```

Edit `docker-compose.override.yml` to bind data to the NVMe mount:

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

Start and verify health, then create a superuser:

```bash
docker compose up -d
{% raw %}docker compose ps --format "table {{.Name}}\t{{.Status}}"{% endraw %}
docker compose exec cvat_server python manage.py createsuperuser
```

All containers must report `healthy` or `running` before proceeding.

## Step 2 — Tile GeoTIFFs and Build a CRS Manifest

CVAT's canvas handles images up to ~4096 × 4096 px reliably. Use `gdal_retile.py` to produce 2048 × 2048 JPEG tiles with 200-pixel overlap, then record the pixel-to-world geotransform for every tile in a manifest CSV.

```bash
gdal_retile.py \
  -ps 2048 2048 \
  -overlap 200 \
  -levels 1 \
  -targetDir ./tiles \
  -r bilinear \
  -of JPEG \
  input_orthomosaic.tif
```

Generate the CRS manifest with `rasterio` so each tile's origin and pixel size are recorded in the source projection:

```python
# build_manifest.py — requires rasterio>=1.3.9
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

print(f"Manifest written: {MANIFEST}")
```

Store `crs_manifest.csv` alongside the tile directory and track it in your [DVC-versioned dataset repository](/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/) so spatial context is never decoupled from the annotation asset.

## Step 3 — Automate Project and Task Creation with `cvat-sdk`

Manual upload breaks above a few hundred frames. The SDK handles chunked uploads and background task initialization:

```bash
pip install "cvat-sdk>=2.14.0"
```

```python
# ingest_tasks.py — Python 3.10+, cvat-sdk>=2.14.0
from cvat_sdk import make_client
from cvat_sdk.models import ProjectWriteRequest, TaskWriteRequest, DataRequest
from pathlib import Path

HOST = "http://localhost:8080"
CREDENTIALS = ("admin", "your_password")
TILE_DIR = Path("./tiles")
BATCH_SIZE = 200   # frames per CVAT task — keeps UI responsive


def build_label_schema() -> list[dict]:
    return [
        {"name": "building",     "color": "#e6194b", "type": "polygon"},
        {"name": "road_surface", "color": "#3cb44b", "type": "polygon"},
        {"name": "vegetation",   "color": "#4363d8", "type": "polygon"},
        {"name": "vehicle",      "color": "#f58231", "type": "rectangle"},
        {"name": "water_body",   "color": "#911eb4", "type": "polygon"},
    ]


def ingest(project_name: str, tile_dir: Path, batch_size: int = BATCH_SIZE) -> None:
    tiles = sorted(tile_dir.glob("*.jpg"))
    if not tiles:
        raise FileNotFoundError(f"No .jpg tiles found in {tile_dir}")

    with make_client(host=HOST, credentials=CREDENTIALS) as client:
        project = client.projects.create(
            ProjectWriteRequest(name=project_name, labels=build_label_schema())
        )
        print(f"Project '{project_name}' created  id={project.id}")

        for batch_idx, start in enumerate(range(0, len(tiles), batch_size)):
            batch = tiles[start : start + batch_size]
            task = client.tasks.create_from_data(
                spec=TaskWriteRequest(
                    name=f"batch_{batch_idx:04d}",
                    project_id=project.id,
                ),
                resource_type="local",
                resources=[str(p) for p in batch],
                data_params=DataRequest(
                    chunk_size=1,           # 1 frame per chunk: precise frame-seek
                    sorting_method="natural",
                    image_quality=95,
                ),
            )
            print(f"  Task batch_{batch_idx:04d}  id={task.id}  frames={len(batch)}")


if __name__ == "__main__":
    ingest("Drone_Survey_Q3_2026", TILE_DIR)
```

For datasets exceeding 10 GB, upload tiles to S3 first and pass presigned URLs as `resources` with `resource_type="share"`.

## Step 4 — Export Annotations and Reconstruct Geospatial Coordinates

CVAT COCO exports contain pixel coordinates relative to each tile. Reconstruction joins them with the manifest and applies the stored affine transform, converting pixel offsets back to the survey's source CRS. Assign per-annotation [confidence scores](/geospatial-annotation-fundamentals-architecture/confidence-scoring-for-geospatial-labels/) at this stage to make the output compatible with active-learning review queues.

```python
# reconstruct_geo.py — requires geopandas>=0.14.3, pandas>=2.2.2
import json
import csv
from pathlib import Path

import pandas as pd
import geopandas as gpd

EXPORT_JSON = Path("./cvat_export_coco.json")
MANIFEST    = Path("./crs_manifest.csv")
OUTPUT      = Path("./annotations_geo.geojson")


def pixel_to_world(px: float, py: float, row: pd.Series) -> tuple[float, float]:
    return (
        row.origin_x + px * row.pixel_size_x,
        row.origin_y + py * row.pixel_size_y,  # pixel_size_y is negative
    )


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
        if "segmentation" not in ann or not ann["segmentation"]:
            continue

        ring = ann["segmentation"][0]
        coords = [
            pixel_to_world(ring[i], ring[i + 1], row)
            for i in range(0, len(ring), 2)
        ]
        coords.append(coords[0])  # close the ring

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

    gdf = gpd.GeoDataFrame.from_features(
        features, crs=f"EPSG:{int(manifest.epsg.iloc[0])}"
    )
    invalid = gdf[~gdf.is_valid]
    if not invalid.empty:
        print(f"Warning: {len(invalid)} invalid geometries — applying buffer(0) repair")
        gdf.geometry = gdf.geometry.buffer(0)

    gdf.to_file(OUTPUT, driver="GeoJSON")
    print(f"Exported {len(gdf)} features to {OUTPUT}")


if __name__ == "__main__":
    reconstruct()
```

Spot-check a sample of reconstructed polygons in QGIS overlaid on the original orthomosaic before committing annotations to your training dataset.

## Verifying the Reconstruction Before Training

Visual QA in QGIS catches gross misalignment, but a programmatic roundtrip check catches the subtle errors — a flipped `pixel_size_y` sign, a tile indexed against the wrong manifest row, or an overlap offset applied twice. The assertion below picks a tile, walks a known pixel corner forward to world coordinates and back, and confirms the residual stays inside one ground-sampling-distance unit:

```python
# verify_roundtrip.py — requires rasterio>=1.3.9, numpy>=1.26
import numpy as np
import pandas as pd

manifest = pd.read_csv("./crs_manifest.csv", index_col="tile_id")
row = manifest.iloc[0]

# forward: pixel (col, line) -> world (x, y)
col, line = 1024.0, 1024.0          # tile centre for a 2048px tile
world_x = row.origin_x + col * row.pixel_size_x
world_y = row.origin_y + line * row.pixel_size_y

# inverse: world -> pixel
back_col = (world_x - row.origin_x) / row.pixel_size_x
back_line = (world_y - row.origin_y) / row.pixel_size_y

residual = np.hypot(back_col - col, back_line - line)
assert residual < 1e-6, f"Affine roundtrip failed: {residual:.3e} px"
print(f"Roundtrip OK — residual {residual:.2e} px, GSD {abs(row.pixel_size_x):.4f} m/px")
```

Wire this into your annotation export step so a corrupted manifest fails the pipeline before geometries reach the [DVC-versioned dataset repository](/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/) rather than after a model has already trained on drifted labels.

## Key Thresholds Reference

| Parameter | Recommended value | Spatial implication |
|---|---|---|
| Tile size | 2048 × 2048 px | Stays inside Chrome canvas memory budget |
| Tile overlap | 200 px (~10%) | Resolves boundary features without seam artefacts |
| JPEG quality | 95 | Preserves fine structural edges for building footprint annotation |
| `chunk_size` | 1 frame | Enables precise single-frame seek in the CVAT UI |
| `CVAT_MAX_REQUEST_SIZE` | `2147483648` (2 GB) | Prevents 413 errors on large tile batches |
| Source CRS | `EPSG:32632`–`EPSG:32636` (UTM) | Metric units; required for IoU computation in metres |
| Export format | COCO JSON | Best `cvat-sdk` support; carries per-annotation segmentation masks |

## Common Errors & Fixes

`413 Request Entity Too Large` on tile upload
: CVAT's nginx proxy defaults to a 1 MB body limit. Set `CVAT_MAX_REQUEST_SIZE=2147483648` under `cvat_server.environment` in `docker-compose.override.yml`, then `docker compose up -d cvat_server`.

Blank white frames in the annotation canvas
: The tile exceeds the browser canvas memory budget. Reduce tile size to 1536 × 1536 px and re-tile: `gdal_retile.py -ps 1536 1536 ...`. Also disable browser extensions — ad-blockers frequently intercept canvas blob URLs and cause silent decode failures.

`KeyError: 'EPSG:UNKNOWN'` in `reconstruct_geo.py`
: `gdal_retile.py` writes JPEG tiles that strip the CRS because JPEG has no geotag standard. Read the source GeoTIFF CRS with `rasterio.open` before tiling and write it directly into the manifest; if `to_epsg()` returns `None`, record `src.crs.to_wkt()` instead.

Polygon ring not closed after COCO export
: COCO segmentation rings do not require the first vertex to be repeated. The `reconstruct_geo.py` script appends `coords[0]` explicitly — include the same closure in any custom parser or Shapely raises `TopologicalError`.

Database bloat slows task listing after several months
: Run `VACUUM FULL` on the Postgres container monthly: `docker compose exec cvat_db psql -U postgres -c "VACUUM FULL ANALYZE;"`.

---

This workflow is one component of the broader [Integrating Label Studio with Geospatial Workflows](/labeling-workflows-toolchain-integration/integrating-label-studio-with-geospatial-workflows/) guide, which covers platform comparison, Label Studio ML backend setup, and export pipeline design.

**Related**

- [Integrating Label Studio with Geospatial Workflows](/labeling-workflows-toolchain-integration/integrating-label-studio-with-geospatial-workflows/) — parent page: platform comparison and export pipeline design
- [Coordinate Reference Systems in Annotation Pipelines](/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) — CRS contracts, datum transforms, and projection-safe IoU computation
- [Implementing DVC for Geospatial Training Data](/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/) — version-control the tile manifest and annotation exports alongside imagery
- [Converting Label Studio Exports to YOLOv8 Format](/labeling-workflows-toolchain-integration/automating-pre-labeling-with-foundation-models/converting-label-studio-exports-to-yolov8-format/) — adapt the spatial reconstruction output for YOLO-based object detection training
- [Confidence Scoring for Geospatial Labels](/geospatial-annotation-fundamentals-architecture/confidence-scoring-for-geospatial-labels/) — assign per-annotation scores at reconstruction time to feed active-learning queues
