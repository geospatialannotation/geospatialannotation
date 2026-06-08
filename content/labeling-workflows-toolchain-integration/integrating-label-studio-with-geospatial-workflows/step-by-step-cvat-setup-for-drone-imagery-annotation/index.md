---
title: CVAT Setup for Drone Imagery Annotation
---
# Step-by-Step CVAT Setup for Drone Imagery Annotation

To execute a **step-by-step CVAT setup for drone imagery annotation**, deploy CVAT via Docker Compose, preprocess orthomosaics into browser-compatible tiles, and automate task ingestion using the `cvat-sdk` Python client. Geospatial ML pipelines require explicit coordinate reference system (CRS) handling, chunked raster delivery, and persistent volume mapping before annotation begins. The following workflow covers production deployment, spatial preprocessing, and programmatic ingestion tailored for high-throughput drone datasets.

### Prerequisites & Compatibility Matrix
| Component | Minimum Requirement | Notes |
|-----------|---------------------|-------|
| OS | Ubuntu 22.04 LTS / macOS 13+ / WSL2 | Linux preferred for volume I/O performance |
| Docker Engine | ≥ 24.0 | Must support Compose V2 (`docker compose`) |
| CVAT Version | v2.14+ (stable) | Check the checked-out release tag with `git describe --tags` |
| Python | ≥ 3.10 | Required for `cvat-sdk` and GDAL bindings |
| RAM | 16GB (32GB recommended) | Orthomosaics >5GB trigger OOM without chunking |
| Imagery Format | JPEG/PNG (native), GeoTIFF (requires tiling) | CVAT browser renderer strips CRS metadata |
| GPU | Optional (NVIDIA + CUDA 12+) | Enables SAM/YOLOv8 auto-labeling inside CVAT |

### Step 1: Docker Deployment & Storage Configuration
CVAT’s official repository provides a production-ready Compose stack. Persistent volumes must be mapped to a high-throughput NVMe drive; default Docker overlay storage will bottleneck during tile streaming and database writes.

```bash
git clone https://github.com/cvat-ai/cvat.git
cd cvat
cp docker-compose.override.yml.example docker-compose.override.yml
```

Edit `docker-compose.override.yml` to mount your fast storage to `/home/cvat/data`. Ensure `cvat_server` and `cvat_db` share the same host path for consistency. Reference the [CVAT Official Installation Guide](https://docs.cvat.ai/docs/administration/basics/installation/) for environment variable tuning (e.g., `CVAT_NUM_WORKERS`, `CVAT_MAX_REQUEST_SIZE`).

Start the stack and verify health:
```bash
docker compose up -d
docker compose ps
```
All containers must report `healthy` or `running`. Access the UI at `http://localhost:8080` and create an admin account.

### Step 2: Geospatial Preprocessing & Tiling Strategy
CVAT’s canvas expects raster images ≤ 4096×4096 pixels for smooth browser rendering. Drone orthomosaics routinely exceed 20,000×20,000 pixels. Preprocess using GDAL to split imagery into overlapping tiles while preserving spatial context for later georeferencing.

```bash
# Create sequential 2048x2048 tiles with 10% overlap
gdal_retile.py -ps 2048 2048 -overlap 200 -levels 1 -targetDir ./tiles -r bilinear input_orthomosaic.tif
```

Alternatively, use `rasterio` or `rio-tiler` for programmatic chunking. Store tiles in a flat directory: `drone_project/task_01/frame_{0001..N}.jpg`. Maintain a sidecar CSV mapping `frame_id → original_pixel_bounds → CRS (e.g., EPSG:32633)`. This metadata enables post-export spatial reconstruction. Consult the [GDAL Raster Utilities](https://gdal.org/programs/gdal_translate.html) documentation for advanced `-projwin` or `-co` compression flags.

### Step 3: Automated Task Ingestion via Python
Manual uploads break at scale. Use `cvat-sdk` to automate project creation, task definition, and frame ingestion. Install the client: `pip install cvat-sdk`.

```python
from cvat_sdk import make_client
from pathlib import Path

# 1. Authenticate
client = make_client(host="http://localhost:8080", credentials=("admin", "your_password"))

# 2. Create project
project = client.projects.create(name="Drone_Orthomosaic_Q3")

# 3. Prepare tile paths
tile_dir = Path("./tiles")
resources = [str(f) for f in sorted(tile_dir.glob("frame_*.jpg"))]

# 4. Create task and upload data
task = client.tasks.create_from_data(
    project_id=project.id,
    name="Tile_Batch_01",
    resources=resources,
    chunk_size=1,  # 1 frame per chunk for precise bounding box tracking
    data_sort="natural"
)

print(f"Task {task.id} created. Status: {task.status}")
```
For datasets exceeding 10GB, upload tiles to cloud storage (S3/GCS) and pass presigned URLs to `resources` instead of local paths. The SDK handles chunked uploads and background task initialization automatically.

### Step 4: Annotation, Export & Spatial Reconstruction
Once tasks are ingested, annotators can use CVAT’s polygon, bounding box, or AI-assisted tools. Export formats (COCO, YOLO, CVAT XML) contain pixel coordinates relative to each tile, not the original orthomosaic. To restore geospatial accuracy:

1. Export annotations and join with the sidecar CSV on `frame_id`.
2. Apply affine transformations using the stored `original_pixel_bounds` to shift coordinates back to the master CRS.
3. Validate topology with `shapely` or `geopandas` before training.

While this pipeline focuses on CVAT, teams evaluating alternative platforms often explore [Integrating Label Studio with Geospatial Workflows](/labeling-workflows-toolchain-integration/integrating-label-studio-with-geospatial-workflows/) for comparative benchmarking. Regardless of the annotation engine, robust [Labeling Workflows & Toolchain Integration](/labeling-workflows-toolchain-integration/) ensures metadata survives the export-import cycle and aligns with downstream model training requirements.

### Troubleshooting & Performance Notes
- **Browser Memory Limits:** Chrome caps canvas memory at ~4GB. Keep tile sizes ≤ 3072×3072 and disable browser extensions during annotation.
- **Database Bloat:** Run `docker compose exec cvat_db psql -U postgres -c "VACUUM FULL;"` monthly to reclaim space from deleted tasks.
- **GPU Auto-Labeling:** Enable SAM/YOLOv8 by adding `--gpus all` to `docker-compose.override.yml` under `cvat_server.deploy.resources.reservations.devices`.

This workflow delivers a reproducible, scalable foundation for drone imagery annotation. Automate ingestion, preserve CRS context, and validate exports before committing to model training.