---
title: "Dataset Versioning & Spatial Data Sync"
description: "Production-grade dataset versioning and spatial data sync for geospatial AI/ML pipelines: content-addressable hashing, atomic tiling manifests, CRS governance, and CI/CD integration patterns for reproducible training datasets."
slug: "dataset-versioning-spatial-data-sync"
type: "pillar"
breadcrumb: "Dataset Versioning & Spatial Data Sync"
datePublished: "2025-03-10"
dateModified: "2026-06-24"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Dataset Versioning & Spatial Data Sync for Geospatial AI/ML Pipelines",
      "description": "Production-grade dataset versioning and spatial data sync for geospatial AI/ML pipelines: content-addressable hashing, atomic tiling manifests, CRS governance, and CI/CD integration patterns for reproducible training datasets.",
      "datePublished": "2025-03-10",
      "dateModified": "2026-06-24",
      "author": {"@type": "Organization", "name": "Geospatial Annotation"},
      "publisher": {"@type": "Organization", "name": "Geospatial Annotation"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://geospatialannotation.com/"},
        {"@type": "ListItem", "position": 2, "name": "Dataset Versioning & Spatial Data Sync", "item": "https://geospatialannotation.com/dataset-versioning-spatial-data-sync/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "How to version control geospatial training datasets",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Configure object storage with a spatial registry"},
        {"@type": "HowToStep", "position": 2, "name": "Implement content-addressable hashing for rasters and vectors"},
        {"@type": "HowToStep", "position": 3, "name": "Generate and validate atomic tiling manifests"},
        {"@type": "HowToStep", "position": 4, "name": "Enforce canonical CRS alignment across all layers"},
        {"@type": "HowToStep", "position": 5, "name": "Wire validation into CI/CD gates"},
        {"@type": "HowToStep", "position": 6, "name": "Implement rollback triggers for corrupted dataset states"}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why can't I use Git to version geospatial training data?",
          "acceptedAnswer": {"@type": "Answer", "text": "Git stores complete file snapshots and diffs against text. Multi-gigabyte GeoTIFFs and dense GeoJSON files bloat the pack file, slow every clone and pull, and produce merge conflicts that Git cannot resolve. Content-addressable tools like DVC decouple large spatial assets from the Git object store while keeping lineage metadata in the repo."}
        },
        {
          "@type": "Question",
          "name": "What hash function should I use for spatial tiles?",
          "acceptedAnswer": {"@type": "Answer", "text": "SHA-256 over the pixel array, CRS string, and geotransform matrix — not the raw file bytes. GeoTIFFs embed volatile metadata blocks that GDAL utilities rewrite without changing pixel values, so hashing the file directly creates false version drift."}
        },
        {
          "@type": "Question",
          "name": "How do I prevent CRS drift between annotation layers and raster imagery?",
          "acceptedAnswer": {"@type": "Answer", "text": "Declare a canonical CRS for each project (typically a local projected system such as UTM). Enforce reprojection of all incoming vector annotations to that CRS during ingestion, and validate every tile's CRS against the project standard before it enters the versioned manifest."}
        }
      ]
    }
  ]
}
</script>

# Dataset Versioning & Spatial Data Sync for Geospatial AI/ML Pipelines

Geospatial machine learning operates at the intersection of massive raster archives, complex vector topologies, and continuously evolving human-in-the-loop annotations. When training pipelines scale beyond proof-of-concept, the absence of rigorous dataset versioning and spatial data sync becomes the primary bottleneck to reproducibility, model stability, and deployment velocity. Spatial data scientists, ML engineers, and GIS annotation teams require infrastructure that treats [coordinate reference systems](/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/), tiling schemes, and annotation geometries as first-class versioned entities — not afterthoughts attached to model checkpoints.

This guide covers production-grade architectures, Python automation patterns, and operational protocols for synchronizing and versioning spatial training datasets. By treating geospatial assets with the same rigor as code, teams can eliminate silent data drift, accelerate annotation workflows, and guarantee that every model checkpoint maps to a deterministic, auditable dataset snapshot.

---

## Core Concepts: Spatial Data Modalities and Version Primitives

Before choosing a versioning strategy, teams must understand what makes geospatial data structurally different from the file types standard DevOps tooling was designed for.

**Raster assets** — GeoTIFFs, Cloud-Optimized GeoTIFFs (COGs), HDF5 stacks, NetCDF archives — are multi-dimensional arrays anchored to the earth's surface via a geotransform matrix and a [coordinate reference system](/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/). A single Sentinel-2 scene can exceed 1 GB per acquisition date. Tiling pipelines split these into overlapping patches (typically 256×256 or 512×512 pixels), and every tile inherits the parent's spatial metadata.

**Vector annotation layers** — GeoJSON, Shapefile, FlatGeobuf, GeoParquet — encode geometries as coordinate sequences. A polygon's identity does not change when an annotator adjusts one vertex, but its SHA-256 hash does. [Defining ROI label taxonomies](/geospatial-annotation-fundamentals-architecture/defining-roi-label-taxonomies-for-aerial-imagery/) for aerial imagery is the upstream task that determines how these geometries are classified and which geometry type (polygon vs bounding box) the annotation team produces.

**Version primitives** in spatial pipelines are not files — they are tuples of `(pixel_array, crs_string, geotransform, annotation_ids)`. Any change to any element of that tuple constitutes a new dataset version. This distinction drives every architectural choice below.

---

## Dataset Versioning Pipeline: Architecture Overview

A production spatial versioning architecture has four interconnected layers. Each must operate deterministically to ensure that model training is fully reproducible across distributed compute environments.

<svg viewBox="0 0 780 320" role="img" aria-label="Dataset versioning pipeline: four layers from object storage through version control, manifest engine, and compute data loader" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:780px;display:block;margin:1.5rem auto;">
  <title>Dataset Versioning Pipeline Architecture</title>
  <desc>Four-layer architecture diagram showing data flowing from Object Storage and Spatial Registry, through Content-Addressable Version Control, into the Atomic Manifest Engine, and finally the Compute-Aware Data Loader for PyTorch/TensorFlow/JAX.</desc>
  <defs>
    <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor" opacity="0.6"/>
    </marker>
  </defs>
  <!-- Layer boxes -->
  <rect x="20" y="30" width="160" height="80" rx="8" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="100" y="60" text-anchor="middle" font-size="12" font-weight="600" fill="currentColor">Object Storage</text>
  <text x="100" y="78" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">S3 / GCS / Azure Blob</text>
  <text x="100" y="96" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">Spatial Registry (PG/SQLite)</text>
  <rect x="210" y="30" width="160" height="80" rx="8" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="290" y="60" text-anchor="middle" font-size="12" font-weight="600" fill="currentColor">Content-Addressable</text>
  <text x="290" y="78" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">Version Control (DVC)</text>
  <text x="290" y="96" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">SHA-256 per tile+CRS</text>
  <rect x="400" y="30" width="160" height="80" rx="8" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="480" y="60" text-anchor="middle" font-size="12" font-weight="600" fill="currentColor">Atomic Manifest</text>
  <text x="480" y="78" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">Engine (JSON/Parquet)</text>
  <text x="480" y="96" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">Checksum + bbox index</text>
  <rect x="590" y="30" width="170" height="80" rx="8" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="675" y="60" text-anchor="middle" font-size="12" font-weight="600" fill="currentColor">Compute Data Loader</text>
  <text x="675" y="78" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">PyTorch / TF / JAX</text>
  <text x="675" y="96" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">On-the-fly CRS warp</text>
  <!-- Arrows between layers -->
  <line x1="182" y1="70" x2="207" y2="70" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr)" opacity="0.6"/>
  <line x1="372" y1="70" x2="397" y2="70" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr)" opacity="0.6"/>
  <line x1="562" y1="70" x2="587" y2="70" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr)" opacity="0.6"/>
  <!-- Data flow stages below -->
  <text x="390" y="155" text-anchor="middle" font-size="11" font-weight="600" fill="currentColor" opacity="0.7">DATA FLOW STAGES</text>
  <rect x="20" y="170" width="100" height="36" rx="6" fill="none" stroke="currentColor" stroke-width="1" opacity="0.4"/>
  <text x="70" y="193" text-anchor="middle" font-size="10" fill="currentColor">Ingest raster</text>
  <rect x="138" y="170" width="100" height="36" rx="6" fill="none" stroke="currentColor" stroke-width="1" opacity="0.4"/>
  <text x="188" y="193" text-anchor="middle" font-size="10" fill="currentColor">Validate CRS</text>
  <rect x="256" y="170" width="100" height="36" rx="6" fill="none" stroke="currentColor" stroke-width="1" opacity="0.4"/>
  <text x="306" y="193" text-anchor="middle" font-size="10" fill="currentColor">Tile + hash</text>
  <rect x="374" y="170" width="110" height="36" rx="6" fill="none" stroke="currentColor" stroke-width="1" opacity="0.4"/>
  <text x="429" y="193" text-anchor="middle" font-size="10" fill="currentColor">Overlay labels</text>
  <rect x="502" y="170" width="110" height="36" rx="6" fill="none" stroke="currentColor" stroke-width="1" opacity="0.4"/>
  <text x="557" y="193" text-anchor="middle" font-size="10" fill="currentColor">Write manifest</text>
  <rect x="630" y="170" width="110" height="36" rx="6" fill="none" stroke="currentColor" stroke-width="1" opacity="0.4"/>
  <text x="685" y="193" text-anchor="middle" font-size="10" fill="currentColor">Promote version</text>
  <!-- Stage arrows -->
  <line x1="122" y1="188" x2="135" y2="188" stroke="currentColor" stroke-width="1.2" marker-end="url(#arr)" opacity="0.5"/>
  <line x1="240" y1="188" x2="253" y2="188" stroke="currentColor" stroke-width="1.2" marker-end="url(#arr)" opacity="0.5"/>
  <line x1="358" y1="188" x2="371" y2="188" stroke="currentColor" stroke-width="1.2" marker-end="url(#arr)" opacity="0.5"/>
  <line x1="486" y1="188" x2="499" y2="188" stroke="currentColor" stroke-width="1.2" marker-end="url(#arr)" opacity="0.5"/>
  <line x1="614" y1="188" x2="627" y2="188" stroke="currentColor" stroke-width="1.2" marker-end="url(#arr)" opacity="0.5"/>
  <!-- Feedback arrow -->
  <path d="M685,208 Q685,270 390,270 Q95,270 70,208" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="5,4" marker-end="url(#arr)" opacity="0.4"/>
  <text x="390" y="290" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.5">training feedback loop — metric regression triggers rollback</text>
</svg>

### Layer 1: Object Storage and Spatial Registry

Cloud-native storage (AWS S3, Google Cloud Storage, Azure Blob) serves as the immutable backing store. Datasets follow a hierarchical path: `/{project_id}/{dataset_name}/{version_hash}/{layer_type}/`. A lightweight metadata registry — PostgreSQL, SQLite, or a managed catalog like AWS Glue — tracks spatial extents, `EPSG` codes, acquisition timestamps, sensor type, and dependency graphs. This registry is the single source of truth for pipeline orchestration and must be queried before any training run begins.

### Layer 2: Content-Addressable Version Control

Instead of tracking file modifications by timestamp, spatial pipelines use cryptographic hashes (SHA-256) derived from pixel arrays, CRS metadata, and tiling configurations. When a single tile or annotation vertex changes, only the affected hash updates, triggering a delta sync rather than a full dataset re-upload. [Implementing DVC for geospatial training data](/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/) provides the canonical migration path from ad-hoc scripts to structured DVC pipelines that bridge Git workflows with heavy spatial assets.

### Layer 3: Atomic Sync and Tiling Manifest Engine

Spatial sync operations must be atomic. Partial uploads or interrupted tile generation should never leave a dataset in a corrupted state. A manifest engine generates JSON or Parquet files that map each tile to its bounding box, parent raster, and associated annotation IDs. During sync, the engine validates checksums against the registry before promoting a new version to the `latest` pointer. Failed sync jobs quarantine partial artifacts and restart from the last verified checkpoint.

### Layer 4: Compute-Aware Data Loading

The final layer interfaces with PyTorch, TensorFlow, or JAX. Custom data loaders read the versioned manifest, apply on-the-fly CRS transformations, and stream tiles into GPU memory. Decoupling storage from compute lets teams spin up ephemeral training clusters without duplicating terabytes of spatial data across regions.

---

## Per-Stage Deep Dives

### Stage 1: Raster Ingestion

Raw satellite imagery arrives as full-scene GeoTIFFs. The ingestion stage converts these to COG format, validates the coordinate reference system against the project's canonical CRS, and records acquisition metadata in the registry.

```python
import rasterio
from rasterio.enums import Resampling
import rio_cogeo.cogeo as cogeo

def ingest_to_cog(
    src_path: str,
    dst_path: str,
    canonical_epsg: int = 32637,  # e.g. UTM zone 37N
) -> dict:
    """Reproject to canonical CRS and convert to Cloud-Optimized GeoTIFF."""
    config = {"GDAL_TIFF_INTERNAL_MASK": True, "GDAL_TIFF_OVR_BLOCKSIZE": 512}
    with rasterio.Env(**config):
        with rasterio.open(src_path) as src:
            if src.crs.to_epsg() != canonical_epsg:
                raise ValueError(
                    f"CRS mismatch: got EPSG:{src.crs.to_epsg()}, "
                    f"expected EPSG:{canonical_epsg}"
                )
            meta = {
                "crs": src.crs.to_string(),
                "transform": list(src.transform),
                "width": src.width,
                "height": src.height,
                "count": src.count,
                "dtype": src.dtypes[0],
            }
    cogeo.cog_translate(src_path, dst_path, cogeo.cog_profiles.get("deflate"))
    return meta
```

### Stage 2: Deterministic Tile Hashing

GeoTIFFs contain volatile metadata blocks that GDAL utilities can rewrite without altering pixel values. Hashing raw file bytes therefore produces false version drift. The correct approach hashes only the semantic content:

```python
import hashlib
import numpy as np
import rasterio
from shapely.geometry import shape
from shapely.validation import make_valid

def hash_raster_tile(path: str) -> str:
    """SHA-256 over pixel data, CRS string, and geotransform — not raw file bytes."""
    with rasterio.open(path) as src:
        data: np.ndarray = src.read()
        crs_str = src.crs.to_string()
        transform_str = str(list(src.transform))
    payload = (data.tobytes() + crs_str.encode() + transform_str.encode())
    return hashlib.sha256(payload).hexdigest()

def hash_vector_feature(feature: dict) -> str:
    """Normalize geometry before hashing to eliminate vertex-order false positives."""
    geom = shape(feature["geometry"])
    valid_geom = make_valid(geom)
    # Canonical WKT is vertex-order stable for simple geometries
    payload = (valid_geom.wkt + str(sorted(feature["properties"].items()))).encode()
    return hashlib.sha256(payload).hexdigest()
```

[Tracking annotation changes with SHA hashing](/dataset-versioning-spatial-data-sync/tracking-annotation-changes-with-sha-hashing/) covers topology normalization in depth — including how to handle multi-polygon dissolves and floating-point precision across annotator workstations.

### Stage 3: Manifest Generation and Validation

The manifest is the authoritative record of a dataset version. It maps every tile to its bounding box, hash, and overlapping annotation IDs:

```python
import json
from pathlib import Path
from typing import Any

def generate_manifest(tile_dir: str, version: str, crs: str | None = None) -> dict[str, Any]:
    manifest: dict[str, Any] = {"version": version, "crs": crs, "tiles": []}
    for tile_path in sorted(Path(tile_dir).glob("*.tif")):
        with rasterio.open(tile_path) as src:
            manifest["crs"] = manifest["crs"] or src.crs.to_string()
            manifest["tiles"].append({
                "filename": tile_path.name,
                "bbox": list(src.bounds),
                "hash": hash_raster_tile(str(tile_path)),
                "epsg": src.crs.to_epsg(),
            })
    return manifest

def validate_manifest(manifest: dict[str, Any], target_dir: str) -> list[str]:
    """Return list of invalid tile filenames (empty list = all pass)."""
    failures: list[str] = []
    for tile in manifest["tiles"]:
        path = Path(target_dir) / tile["filename"]
        if not path.exists() or hash_raster_tile(str(path)) != tile["hash"]:
            failures.append(tile["filename"])
    return failures
```

### Stage 4: Annotation Overlay and Label Extraction

After tiles are generated, the pipeline extracts annotation polygons that spatially intersect each tile's bounding box. [Confidence scoring for geospatial labels](/geospatial-annotation-fundamentals-architecture/confidence-scoring-for-geospatial-labels/) determines which annotations are included in training versus held out for review, and those scores must be preserved in the manifest alongside geometry hashes.

```python
import geopandas as gpd
from shapely.geometry import box

def extract_tile_labels(
    tile_bbox: tuple[float, float, float, float],
    label_gdf: gpd.GeoDataFrame,
    min_confidence: float = 0.7,
) -> gpd.GeoDataFrame:
    """Clip annotation GeoDataFrame to tile extent, filtering by confidence threshold."""
    tile_geom = box(*tile_bbox)
    clipped = label_gdf[
        label_gdf.geometry.intersects(tile_geom)
        & (label_gdf["confidence"] >= min_confidence)
    ].copy()
    clipped["geometry"] = clipped.geometry.intersection(tile_geom)
    return clipped[clipped.geometry.is_valid & ~clipped.geometry.is_empty]
```

### Stage 5: Version Promotion and Registry Update

Promotion is a two-step atomic operation: first, write the manifest to object storage; second, update the registry pointer. If either step fails, the pipeline rolls back to the previous pointer:

```python
import boto3
import json
import psycopg2
from contextlib import contextmanager

def promote_version(
    manifest: dict,
    bucket: str,
    project_id: str,
    dataset_name: str,
    db_conn_str: str,
) -> str:
    version_hash = manifest["version"]
    key = f"{project_id}/{dataset_name}/{version_hash}/manifest.json"
    s3 = boto3.client("s3")
    s3.put_object(Bucket=bucket, Key=key, Body=json.dumps(manifest), ContentType="application/json")
    with psycopg2.connect(db_conn_str) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE dataset_versions SET latest_hash = %s WHERE dataset_name = %s",
                (version_hash, dataset_name),
            )
    return key
```

---

## Spatial-Specific Gotchas and Failure Modes

Standard DevOps pipelines do not surface these failure patterns — they are unique to geospatial data engineering.

**CRS drift across annotation layers.** Annotations created in `EPSG:4326` (geographic, degrees) silently misalign with imagery stored in `EPSG:3857` (Web Mercator) or a local UTM zone. At mid-latitudes, a 1-metre pixel in UTM corresponds to roughly 0.00001 degrees, but the mapping is non-linear. Without enforcing a single canonical CRS at ingestion, pixel-to-polygon offsets compound silently until validation IoU metrics collapse. Always enforce reprojection at the boundary of the ingestion stage, not during training.

**Tiling scheme mismatch between model versions.** Changing from 256×256 to 512×512 tiles, or shifting the tile grid origin by one pixel, invalidates all existing manifests even though the underlying imagery is identical. Record the tile grid parameters (size, overlap percentage, origin offset, and CRS) as first-class fields in the manifest rather than as implicit pipeline defaults.

**Topology corruption in annotation updates.** GIS operators frequently correct polygon boundaries in QGIS or Label Studio. Operations like snapping, merging, or splitting can introduce self-intersecting rings, sliver polygons, or orphaned vertices. These do not raise errors during export but cause `shapely` to return `None` area values during training data loading. Always run `make_valid()` and area-threshold filters after any annotation update is ingested.

**Multi-temporal layer misalignment.** Satellite imagery, digital elevation models (DEMs), SAR backscatter, and vector label layers update at different acquisition cadences. A training batch that pairs a summer optical image with a winter DEM and annotations from a different season can produce hallucinated feature correlations. The manifest must record the acquisition timestamp of every layer and include a multi-temporal alignment check as a sync prerequisite.

**Silent float32 vs float64 rounding in hashes.** `rasterio` reads pixel values as `float32` by default on most datasets, but some export pipelines produce `float64`. Two tiles with identical visual content but different dtypes produce different SHA-256 hashes, causing the versioning system to treat them as unrelated. Normalize to a declared dtype at ingestion and record it in the manifest.

**GeoJSON coordinate precision inflation.** Annotation export tools sometimes serialize coordinates to 15 decimal places (double precision), while others round to 6. When annotations from different platforms are merged, the same physical polygon gets two different hashes. Apply a coordinate precision normalization step (6 decimal places is sub-millimetre for geographic coordinates) before hashing vector features.

---

## CI/CD Integration Patterns

Dataset sync should be treated as a deployment step, gated by the same quality controls as code merges.

### GitHub Actions: Manifest Validation Gate

```yaml
name: Validate spatial dataset manifest
on:
  pull_request:
    paths:
      - 'manifests/**'
      - 'pipelines/sync*.py'

jobs:
  validate-manifest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.11"
      - name: Install dependencies
        run: pip install rasterio==1.3.10 shapely==2.0.4 geopandas==0.14.3 pyproj==3.6.1
      - name: Validate tile checksums
        run: |
          python - <<'EOF'
          import json, sys, pathlib
          from pipelines.versioning import validate_manifest
          manifest = json.loads(pathlib.Path("manifests/latest.json").read_text())
          failures = validate_manifest(manifest, "tiles/")
          if failures:
              print(f"FAIL: {len(failures)} tiles failed checksum: {failures[:5]}")
              sys.exit(1)
          print(f"PASS: {len(manifest['tiles'])} tiles verified")
          EOF
      - name: CRS uniformity check
        run: |
          python - <<'EOF'
          import json, pathlib
          manifest = json.loads(pathlib.Path("manifests/latest.json").read_text())
          epsgs = {t["epsg"] for t in manifest["tiles"]}
          assert len(epsgs) == 1, f"Multiple EPSG codes in manifest: {epsgs}"
          print(f"PASS: all tiles in EPSG:{epsgs.pop()}")
          EOF
```

### DVC Pipeline Hook for Automated Snapshots

[Using DVC pipelines for automated dataset snapshots](/dataset-versioning-spatial-data-sync/tracking-annotation-changes-with-sha-hashing/using-dvc-pipelines-for-automated-dataset-snapshots/) integrates directly with this CI/CD pattern. A `dvc.yaml` stage runs `generate_manifest` after every tile job, and `dvc repro` enforces that no training run can proceed without a valid, committed manifest.

```yaml
# dvc.yaml
stages:
  tile_and_hash:
    cmd: python pipelines/tile_pipeline.py --input data/raw/ --output data/tiles/ --manifest manifests/latest.json
    deps:
      - data/raw/
      - pipelines/tile_pipeline.py
    outs:
      - data/tiles/
      - manifests/latest.json
  validate:
    cmd: python pipelines/validate_sync.py --manifest manifests/latest.json --tile-dir data/tiles/
    deps:
      - manifests/latest.json
      - data/tiles/
      - pipelines/validate_sync.py
```

### Apache Airflow for Scheduled Dataset Refreshes

When new satellite imagery is delivered on a fixed cadence, an Airflow DAG orchestrates the full ingestion → tile → hash → manifest → promote sequence. The `validate_sync` task is gated by a short-circuit operator: if any checksum fails, the DAG alerts on Slack and halts before promoting to `latest`.

---

## Operational Governance

Versioning infrastructure only delivers value when paired with strict operational protocols.

**Immutable version pointers.** Never overwrite a versioned dataset. Use symbolic registry pointers (`latest`, `stable`, `v2.1.4`) to reference specific hashes. This guarantees that historical model checkpoints can be reproduced exactly months or years later.

**Access control and audit logging.** Restrict write access to the sync orchestration service account. All read/write operations log to an immutable audit trail (CloudTrail, Datadog, or ELK stack) with user ID, timestamp, and dataset hash. Any manual write to a versioned path should trigger an alert.

**Automated rollback triggers.** When validation metrics drop below a defined threshold or a sync job produces corrupted manifests, the pipeline should automatically revert to the previous stable version. [Rollback strategies for corrupted spatial datasets](/dataset-versioning-spatial-data-sync/rollback-strategies-for-corrupted-spatial-datasets/) details step-by-step recovery patterns for both object storage and training cluster states — including how to identify the last clean version hash from the registry.

**Metadata preservation across iterations.** Spatial datasets carry critical provenance: sensor type, cloud cover percentage, acquisition angle, and per-annotation confidence scores. Stripping this metadata during sync breaks downstream quality analysis. [Preserving metadata across dataset versions](/dataset-versioning-spatial-data-sync/preserving-metadata-across-dataset-versions/) demonstrates how to embed provenance directly into Parquet manifests and GeoTIFF sidecar files so that every training sample traces back to its source observation.

**Pre-commit hooks for spatial drift.** Python's built-in `hashlib` and `rasterio` validation routines can be wrapped into pre-commit hooks to catch CRS mismatches or topology errors before they reach the shared data store.

---

## Implementation Checklist

The following gates define a production-ready spatial versioning system. Incomplete gates should block model training runs.

- [ ] Canonical CRS declared per project; all incoming layers validated and reprojected at ingestion boundary
- [ ] SHA-256 hash computed over `(pixel_array, crs_string, geotransform)` — not raw file bytes
- [ ] Tiling parameters (size, overlap, grid origin, CRS) recorded as explicit manifest fields
- [ ] Manifest generated and committed to version control before any training run
- [ ] `validate_manifest()` passes on 100% of tiles in CI before merging pipeline changes
- [ ] Topology validation (`make_valid()` + area threshold) runs on every annotation ingest
- [ ] Multi-temporal alignment check: acquisition timestamps for all layers within declared tolerance
- [ ] Coordinate precision normalized to 6 decimal places before hashing vector features
- [ ] Immutable version pointers in registry; no overwrite of versioned paths in object storage
- [ ] Automated rollback configured: metric regression or manifest corruption reverts to previous stable hash
- [ ] Audit log captures every read/write with user, timestamp, and dataset hash
- [ ] DVC or Airflow pipeline enforces that training is gated on `validate_manifest` success

---

## Related

- [Implementing DVC for Geospatial Training Data](/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/) — migrate from ad-hoc sync scripts to DVC pipelines with S3/GCS remotes
- [Tracking Annotation Changes with SHA Hashing](/dataset-versioning-spatial-data-sync/tracking-annotation-changes-with-sha-hashing/) — normalize and hash complex label geometries for deterministic drift detection
- [Rollback Strategies for Corrupted Spatial Datasets](/dataset-versioning-spatial-data-sync/rollback-strategies-for-corrupted-spatial-datasets/) — recover from corrupted COG exports, registry pointer failures, and partial sync states
- [Preserving Metadata Across Dataset Versions](/dataset-versioning-spatial-data-sync/preserving-metadata-across-dataset-versions/) — embed sensor provenance, confidence scores, and acquisition context into Parquet manifests
- [Coordinate Reference Systems in Annotation Pipelines](/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) — foundational CRS contracts that every versioning pipeline depends on
- [Geospatial Annotation Fundamentals & Architecture](/geospatial-annotation-fundamentals-architecture/) — the upstream architecture that produces the annotation layers this pipeline versions
