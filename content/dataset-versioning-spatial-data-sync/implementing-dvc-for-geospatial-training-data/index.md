---
title: "Implementing DVC for Geospatial Training Data"
description: "Step-by-step guide to configuring DVC for satellite imagery, LiDAR, and vector annotation datasets — covering remote storage setup, pipeline orchestration, rollback, and CI/CD integration for spatial ML workflows."
slug: "implementing-dvc-for-geospatial-training-data"
type: "guide"
breadcrumb:
  - label: "Home"
    url: "/"
  - label: "Dataset Versioning & Spatial Data Sync"
    url: "/dataset-versioning-spatial-data-sync/"
  - label: "Implementing DVC for Geospatial Training Data"
    url: "/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/"
datePublished: "2025-03-10"
dateModified: "2026-06-25"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Implementing DVC for Geospatial Training Data",
      "description": "Step-by-step guide to configuring DVC for satellite imagery, LiDAR, and vector annotation datasets — covering remote storage setup, pipeline orchestration, rollback, and CI/CD integration for spatial ML workflows.",
      "datePublished": "2025-03-10",
      "dateModified": "2026-06-25",
      "author": { "@type": "Organization", "name": "Geospatial Annotation" },
      "publisher": { "@type": "Organization", "name": "Geospatial Annotation" }
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.geospatialannotation.com/" },
        { "@type": "ListItem", "position": 2, "name": "Dataset Versioning & Spatial Data Sync", "item": "https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/" },
        { "@type": "ListItem", "position": 3, "name": "Implementing DVC for Geospatial Training Data", "item": "https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/" }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Implement DVC for Geospatial Training Data",
      "description": "Configure DVC to version-control satellite imagery, LiDAR point clouds, and vector annotations in a reproducible ML pipeline.",
      "step": [
        { "@type": "HowToStep", "position": 1, "name": "Initialize DVC and configure remote storage", "text": "Run dvc init alongside git init, then add a cloud remote with concurrency and xxhash settings tuned for large spatial files." },
        { "@type": "HowToStep", "position": 2, "name": "Structure geospatial data for deterministic tracking", "text": "Organize assets by task, region, and temporal snapshot; normalize CRS before adding directories to DVC tracking." },
        { "@type": "HowToStep", "position": 3, "name": "Orchestrate preprocessing with DVC pipelines", "text": "Define dvc.yaml stages for CRS normalization, chip generation, and label export; use params.yaml for spatial tiling parameters." },
        { "@type": "HowToStep", "position": 4, "name": "Track vector annotations and validate label consistency", "text": "Pair DVC content-addressing with SHA-256 manifests to catch coordinate-precision drift independent of semantic label changes." },
        { "@type": "HowToStep", "position": 5, "name": "Execute rollbacks and recover corrupted assets", "text": "Use git checkout + dvc checkout to restore known-good dataset states; validate cache integrity with dvc fetch and dvc status." },
        { "@type": "HowToStep", "position": 6, "name": "Scale for satellite imagery and multi-temporal stacks", "text": "Generate lightweight VRT indexes over cloud-optimized GeoTIFFs to keep DVC metadata small while preserving full spatial extents." }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why does DVC use xxhash instead of md5 for geospatial files?",
          "acceptedAnswer": { "@type": "Answer", "text": "xxhash is significantly faster than md5 for large binary files such as multi-gigabyte GeoTIFFs. Switching reduces CPU overhead during cache validation, which is critical when tracking thousands of raster chips or vector tiles." }
        },
        {
          "@type": "Question",
          "name": "How do I handle CRS misalignment before adding data to DVC?",
          "acceptedAnswer": { "@type": "Answer", "text": "Normalize all raster inputs to a shared projection using gdalwarp or rasterio before running dvc add. Misaligned inputs cause silent spatial drift during training that DVC's hash alone cannot detect." }
        },
        {
          "@type": "Question",
          "name": "Can DVC track GeoJSON annotation files with floating-point coordinate drift?",
          "acceptedAnswer": { "@type": "Answer", "text": "DVC tracks raw file hashes, not coordinate semantics. Pair DVC with SHA-256 manifests generated from the annotation coordinates to detect precision-level drift that changes model behavior without altering the hash." }
        },
        {
          "@type": "Question",
          "name": "What causes datum shift masquerading as model degradation?",
          "acceptedAnswer": { "@type": "Answer", "text": "When raw scenes mix EPSG:4326 (WGS84) and EPSG:4269 (NAD83) without an explicit datum transformation grid, gdalwarp applies a zero-shift fallback that introduces up to 3-metre errors in North America. Always specify +towgs84 parameters or install PROJ datum grids before running CRS normalization stages." }
        },
        {
          "@type": "Question",
          "name": "How do I handle cache size explosion from frequent raster modifications?",
          "acceptedAnswer": { "@type": "Answer", "text": "Every dvc add on a modified GeoTIFF creates a new cache object. Run dvc gc -w --all-commits weekly and configure cloud lifecycle policies to transition objects older than 90 days to infrequent-access storage tiers." }
        }
      ]
    }
  ]
}
</script>

# Implementing DVC for Geospatial Training Data

Geospatial ML pipelines fail in ways that generic data science tooling cannot anticipate. A satellite scene reprojected to the wrong datum, a batch of annotation GeoJSON files silently truncated to five decimal places, or an interrupted multipart upload to object storage — any of these can corrupt a training run while leaving the Git history looking perfectly clean. Standard Git workflows cannot address these problems because the assets themselves — multi-gigabyte GeoTIFFs, LiDAR point clouds, drone orthomosaics, and vector annotations with embedded CRS contracts — far exceed repository size limits and carry spatial semantics that version numbers alone cannot capture.

DVC (Data Version Control) bridges this gap by decoupling binary asset tracking from code versioning. Integrated into the broader [Dataset Versioning & Spatial Data Sync](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/) architecture, DVC gives teams a content-addressable cache for terabyte-scale rasters, deterministic pipeline orchestration for preprocessing stages, and safe rollback paths when spatial assets degrade.

---

## Prerequisites & Toolchain Alignment

Before configuring DVC for spatial workloads, verify every component below. Mismatched GDAL and rasterio versions are a common source of silent [coordinate reference system](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) handling differences between local and CI environments.

| Component | Minimum version | Notes |
|---|---|---|
| Python | 3.10 | Required for structural pattern matching in pipeline scripts |
| DVC CLI | 3.0 | Install with `pip install "dvc[s3]"` (or `[gcs]`, `[azure]`) |
| rasterio | 1.3.9 | Must match the system GDAL major version |
| geopandas | 0.14 | Requires shapely ≥ 2.0 for vectorized geometry ops |
| pyproj | 3.6 | Ensure PROJ data directory is set via `PROJ_DATA` env var |
| shapely | 2.0 | GEOS 3.11+ required for robust overlay operations |
| GDAL (system) | 3.6 | Install via `conda-forge` or OS package manager; avoid PyPI GDAL |

Additional requirements: a Git repository initialized with `.gitignore` entries for `.dvc/cache/`, virtual environments, and GDAL/OGR scratch directories; cloud object storage (AWS S3, GCP GCS, or Azure Blob) with programmatic IAM credentials.

---

## DVC Pipeline: From Raw Imagery to Training-Ready Chips

The diagram below shows how data flows through a DVC-managed geospatial pipeline. Each box corresponds to a `dvc.yaml` stage; arrows represent the dependency relationships DVC uses to decide which stages need re-execution.

<svg viewBox="0 0 760 360" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="DVC geospatial pipeline diagram showing stages from raw imagery through CRS normalization, chip generation, label export, and validation to training-ready outputs" style="width:100%;max-width:760px;height:auto;display:block;margin:1.5rem auto;">
  <title>DVC Geospatial Pipeline</title>
  <desc>Data flow diagram for a DVC-managed geospatial training data pipeline: Raw Imagery and Reference Vectors feed into CRS Normalization, which feeds Chip Generator and Label Exporter. Both feed into the Validation Gate, which produces Training-Ready Chips and Masks.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <defs>
    <marker id="dvc-arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
      <polygon points="0 0, 8 3, 0 6" fill="currentColor" opacity="0.6"/>
    </marker>
  </defs>
  <!-- Raw Imagery box: top-left -->
  <rect x="20" y="30" width="155" height="56" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.7"/>
  <text x="97" y="52" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">Raw Imagery</text>
  <text x="97" y="70" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.65">GeoTIFF / COG / VRT</text>
  <!-- Reference Vectors box: mid-left -->
  <rect x="20" y="120" width="155" height="56" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.7"/>
  <text x="97" y="142" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">Reference Vectors</text>
  <text x="97" y="160" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.65">GeoJSON / Shapefile</text>
  <!-- CRS Normalization box: centre -->
  <rect x="220" y="75" width="165" height="56" rx="6" fill="none" stroke="currentColor" stroke-width="2" opacity="0.9"/>
  <text x="302" y="97" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="700">CRS Normalization</text>
  <text x="302" y="116" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.65">gdalwarp / rasterio.reproject</text>
  <!-- Chip Generator box: right-top -->
  <rect x="460" y="30" width="160" height="56" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.7"/>
  <text x="540" y="52" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">Chip Generator</text>
  <text x="540" y="70" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.65">512×512 / 1024×1024 patches</text>
  <!-- Label Exporter box: right-mid -->
  <rect x="460" y="120" width="160" height="56" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.7"/>
  <text x="540" y="142" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">Label Exporter</text>
  <text x="540" y="160" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.65">segmentation masks / COCO</text>
  <!-- Validation Gate box: centre-lower -->
  <rect x="220" y="210" width="165" height="56" rx="6" fill="none" stroke="currentColor" stroke-width="2" opacity="0.9"/>
  <text x="302" y="232" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="700">Validation Gate</text>
  <text x="302" y="250" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.65">CRS · SHA manifest · geometry</text>
  <!-- Training-Ready box: centre-bottom -->
  <rect x="220" y="300" width="165" height="46" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5,3" opacity="0.7"/>
  <text x="302" y="320" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif">Training-Ready</text>
  <text x="302" y="337" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.65">chips + masks · dvc push</text>
  <!-- Arrow: Raw Imagery → CRS Normalization -->
  <line x1="175" y1="58" x2="218" y2="92" stroke="currentColor" stroke-width="1.5" opacity="0.55" marker-end="url(#dvc-arrow)"/>
  <!-- Arrow: Reference Vectors → CRS Normalization -->
  <line x1="175" y1="148" x2="218" y2="116" stroke="currentColor" stroke-width="1.5" opacity="0.55" marker-end="url(#dvc-arrow)"/>
  <!-- Arrow: CRS Normalization → Chip Generator -->
  <line x1="385" y1="92" x2="458" y2="58" stroke="currentColor" stroke-width="1.5" opacity="0.55" marker-end="url(#dvc-arrow)"/>
  <!-- Arrow: CRS Normalization → Label Exporter -->
  <line x1="385" y1="116" x2="458" y2="148" stroke="currentColor" stroke-width="1.5" opacity="0.55" marker-end="url(#dvc-arrow)"/>
  <!-- Arrow: Chip Generator → Validation Gate -->
  <line x1="540" y1="86" x2="388" y2="222" stroke="currentColor" stroke-width="1.5" opacity="0.55" marker-end="url(#dvc-arrow)"/>
  <!-- Arrow: Label Exporter → Validation Gate -->
  <line x1="460" y1="168" x2="387" y2="222" stroke="currentColor" stroke-width="1.5" opacity="0.55" marker-end="url(#dvc-arrow)"/>
  <!-- Arrow: Validation Gate → Training-Ready -->
  <line x1="302" y1="266" x2="302" y2="298" stroke="currentColor" stroke-width="1.5" opacity="0.55" marker-end="url(#dvc-arrow)"/>
</svg>

---

## Core Workflow

### Step 1 — Initialize DVC and Configure Remote Storage

DVC must be initialized alongside Git so that `.dvc` metadata files commit alongside code while binary assets route to cloud storage. Configure the remote backend for parallel multipart transfers and fast checksumming before adding any spatial data.

```bash
git init
dvc init

# Add a default remote — S3 shown; substitute gcs:// or azure:// as needed
dvc remote add -d geospatial-remote s3://your-bucket-name/dvc-cache

# Tune for large spatial files
dvc remote modify geospatial-remote credentialpath ~/.aws/credentials
dvc remote modify geospatial-remote upload_concurrency 10
dvc remote modify geospatial-remote download_concurrency 10
dvc remote modify geospatial-remote checksum xxhash

git add .dvc/config
git commit -m "chore: configure DVC remote for geospatial workloads"
```

`upload_concurrency` and `download_concurrency` enable parallel multipart transfers for multi-gigabyte GeoTIFFs, preventing timeout failures on initial pushes. Switching from `md5` to `xxhash` reduces CPU overhead by roughly 3–5× during cache validation — critical when checking thousands of raster chips between pipeline runs.

### Step 2 — Structure Geospatial Data for Deterministic Tracking

Avoid monolithic directories. Organize assets by task, region, and temporal snapshot to enable granular versioning and efficient cache reuse. A flat, predictable hierarchy prevents unnecessary cache invalidation when only a subset of assets changes between annotation iterations.

```
data/
├── raw/
│   ├── imagery/          # Source GeoTIFF, NetCDF, or HDF5 scenes
│   └── vectors/          # Reference boundaries, AOIs, road networks
├── processed/
│   ├── normalized/       # CRS-aligned rasters (common grid, unified datum)
│   ├── chips/            # 512×512 or 1024×1024 training patches
│   └── masks/            # Segmentation labels, instance masks
└── annotations/          # COCO, GeoJSON, or custom XML
```

Before tracking any raster, normalize all inputs to a shared `EPSG:4326` (for global models) or a local UTM zone (for regional tasks) using `gdalwarp` or `rasterio.warp.reproject`. Misaligned projections cause silent spatial drift during convolution that degrades model accuracy without triggering any obvious error.

```bash
dvc add data/raw/imagery
dvc add data/processed/chips
dvc add data/annotations
git add data/raw/imagery.dvc data/processed/chips.dvc data/annotations.dvc data/.gitignore
git commit -m "feat: initialize geospatial dataset tracking"
```

### Step 3 — Orchestrate Preprocessing with DVC Pipelines

Manual preprocessing scripts break reproducibility because they leave no record of parameter values, execution order, or intermediate file states. DVC pipelines (`dvc.yaml`) enforce deterministic execution, cache intermediate outputs, and skip unchanged stages automatically.

<svg viewBox="0 0 720 290" role="img" aria-label="A DVC stage graph where only the stages downstream of a changed input re-run" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>Change one input and only its descendants re-run</title>
  <desc>Four stages run in sequence: tile the imagery, rasterize the labels, build the training chips and train. Editing the label vectors leaves the tiling stage cached and re-runs rasterize, chips and train. Editing the tile size instead invalidates everything. The dependency graph, not a human, decides which is which.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <defs>
    <marker id="dg2-arr" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor"/>
    </marker>
  </defs>
  <!-- Inputs -->
  <rect x="14" y="40" width="136" height="42" rx="6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="4 2"/>
  <text x="82" y="60" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace">raw/scenes/*.tif</text>
  <text x="82" y="76" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.7">unchanged</text>
  <rect x="14" y="150" width="136" height="42" rx="6" fill="none" stroke="currentColor" stroke-width="2"/>
  <text x="82" y="170" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace">labels/*.geojson</text>
  <text x="82" y="186" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.85">edited</text>
  <!-- Stages -->
  <rect x="184" y="40" width="120" height="42" rx="6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="4 2"/>
  <text x="244" y="60" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">tile</text>
  <text x="244" y="76" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.7">cached, skipped</text>
  <rect x="184" y="150" width="120" height="42" rx="6" fill="none" stroke="currentColor" stroke-width="2"/>
  <text x="244" y="170" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">rasterize</text>
  <text x="244" y="186" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.85">re-runs</text>
  <rect x="356" y="94" width="120" height="44" rx="6" fill="none" stroke="currentColor" stroke-width="2"/>
  <text x="416" y="115" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">build_chips</text>
  <text x="416" y="131" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.85">re-runs</text>
  <rect x="530" y="94" width="120" height="44" rx="6" fill="none" stroke="currentColor" stroke-width="2"/>
  <text x="590" y="115" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">train</text>
  <text x="590" y="131" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.85">re-runs</text>
  <!-- Edges -->
  <line x1="150" y1="61" x2="180" y2="61" stroke="currentColor" stroke-width="1.3" marker-end="url(#dg2-arr)" opacity="0.5"/>
  <line x1="150" y1="171" x2="180" y2="171" stroke="currentColor" stroke-width="1.3" marker-end="url(#dg2-arr)"/>
  <path d="M304 61 L330 61 L330 106 L352 106" fill="none" stroke="currentColor" stroke-width="1.3" marker-end="url(#dg2-arr)" opacity="0.5"/>
  <path d="M304 171 L330 171 L330 126 L352 126" fill="none" stroke="currentColor" stroke-width="1.3" marker-end="url(#dg2-arr)"/>
  <line x1="476" y1="116" x2="526" y2="116" stroke="currentColor" stroke-width="1.3" marker-end="url(#dg2-arr)"/>
  <!-- Legend -->
  <rect x="14" y="228" width="20" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="2"/>
  <text x="42" y="240" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">invalidated by this edit</text>
  <rect x="210" y="228" width="20" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="4 2"/>
  <text x="238" y="240" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">restored from cache, not recomputed</text>
  <text x="14" y="270" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">change the tile size instead and the same graph invalidates all four — which is the point of declaring the deps rather than remembering them</text>
</svg>

```yaml
# dvc.yaml
stages:
  normalize_crs:
    cmd: python scripts/normalize_crs.py --input data/raw/imagery --output data/processed/normalized
    deps:
      - data/raw/imagery
      - scripts/normalize_crs.py
    params:
      - params.yaml:
        - crs_target
        - resample_method
    outs:
      - data/processed/normalized

  generate_chips:
    cmd: >-
      python scripts/chip_generator.py
        --input data/processed/normalized
        --output data/processed/chips
        --size ${tile_size}
        --overlap ${overlap}
    deps:
      - data/processed/normalized
      - scripts/chip_generator.py
    params:
      - params.yaml:
        - tile_size
        - overlap
    outs:
      - data/processed/chips

  export_labels:
    cmd: python scripts/label_exporter.py --annotations data/annotations --masks data/processed/masks
    deps:
      - data/annotations
      - scripts/label_exporter.py
    outs:
      - data/processed/masks
```

```yaml
# params.yaml
crs_target: "EPSG:32637"   # UTM zone 37N for East Africa example
resample_method: bilinear
tile_size: 512
overlap: 64
```

Run the full pipeline with `dvc repro`. DVC evaluates dependency hashes and re-executes only stages where inputs, scripts, or parameters have changed. Experiment variants — different `tile_size` values, alternative `resample_method` settings — can be tracked with `dvc exp run --set-param tile_size=1024` without branching Git history. For a complete treatment of pipeline automation, see [using DVC pipelines for automated dataset snapshots](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/tracking-annotation-changes-with-sha-hashing/using-dvc-pipelines-for-automated-dataset-snapshots/).

### Step 4 — Track Vector Annotations and Validate Label Consistency

Vector annotations (GeoJSON, Shapefile, COCO JSON) introduce versioning complexity that rasters do not have. Floating-point coordinates may shift due to software rounding, topology cleaning, or CRS reprojection even when the visual label looks identical. DVC tracks raw file hashes — it cannot distinguish semantic annotation changes from accidental coordinate truncation.

Pair DVC with [SHA-256 manifests](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/tracking-annotation-changes-with-sha-hashing/) to catch precision-level drift:

```bash
# Generate manifest before committing annotation updates
find data/annotations -type f -name "*.geojson" \
  | sort \
  | xargs sha256sum > data/annotations.sha256

dvc add data/annotations
git add data/annotations.dvc data/annotations.sha256
git commit -m "feat: update building footprint annotations — 143 polygons revised"
```

Add a Python validation step that checks coordinate precision before the manifest is written:

```python
# scripts/validate_annotations.py
import json
import pathlib
from typing import Iterator

PRECISION_THRESHOLD = 6  # decimal degrees — below 6 introduces >10 cm error at equator

def iter_coordinates(geom: dict) -> Iterator[tuple[float, float]]:
    """Recursively yield (lon, lat) pairs from any GeoJSON geometry."""
    match geom["type"]:
        case "Point":
            yield tuple(geom["coordinates"])
        case "MultiPoint" | "LineString":
            yield from (tuple(c) for c in geom["coordinates"])
        case "Polygon" | "MultiLineString":
            for ring in geom["coordinates"]:
                yield from (tuple(c) for c in ring)
        case "MultiPolygon":
            for polygon in geom["coordinates"]:
                for ring in polygon:
                    yield from (tuple(c) for c in ring)

def check_precision(annotation_dir: pathlib.Path) -> list[str]:
    issues: list[str] = []
    for path in sorted(annotation_dir.glob("**/*.geojson")):
        fc = json.loads(path.read_text())
        for feature in fc.get("features", []):
            for lon, lat in iter_coordinates(feature["geometry"]):
                lon_dec = len(str(lon).split(".")[-1]) if "." in str(lon) else 0
                lat_dec = len(str(lat).split(".")[-1]) if "." in str(lat) else 0
                if lon_dec < PRECISION_THRESHOLD or lat_dec < PRECISION_THRESHOLD:
                    issues.append(f"{path.name}: coordinate ({lon}, {lat}) below {PRECISION_THRESHOLD} decimal places")
    return issues

if __name__ == "__main__":
    found = check_precision(pathlib.Path("data/annotations"))
    if found:
        for msg in found:
            print(f"[PRECISION WARNING] {msg}")
        raise SystemExit(1)
    print("Annotation precision check passed.")
```

This approach ensures model retraining triggers only when semantic label boundaries change, not when file metadata or coordinate representation shifts.

### Step 5 — Execute Rollbacks and Recover Corrupted Assets

Geospatial datasets are prone to corruption during transfer, storage degradation, or interrupted pipeline runs. A truncated GeoTIFF header or a partially written Shapefile can silently break downstream training jobs — DVC's checkout mechanism provides deterministic recovery.

```bash
# Inspect the history of a specific tracked directory
git log --oneline -- data/processed/chips.dvc

# Example output:
# a3f91c2 feat: regenerate chips at 1024px after AOI expansion
# 7b82e10 feat: initial chip generation at 512px
# 4cd3a01 feat: initialize geospatial dataset tracking

# Roll back to the 512px chip set
git checkout 7b82e10 -- data/processed/chips.dvc
dvc checkout data/processed/chips.dvc
```

Validate cache integrity against the remote before and after restoration:

```bash
# Pull cache metadata without downloading data files
dvc fetch --jobs 4

# Compare local workspace against tracked state
dvc status

# If mismatches exist, pull the correct files
dvc pull data/processed/chips.dvc
```

If cache corruption is widespread, rebuild from raw sources:

```bash
# Remove corrupted outputs and force full re-execution
dvc repro --force
```

Never delete `.dvc` metadata files manually — always use `dvc remove` or `git checkout` to maintain consistency between Git history and DVC cache state. For enterprise-grade recovery patterns including automated integrity checks and fallback remote routing, see [rollback strategies for corrupted spatial datasets](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/rollback-strategies-for-corrupted-spatial-datasets/).

### Step 6 — Scale for Satellite Imagery and Multi-Temporal Stacks

Single-scene GeoTIFFs often exceed 10 GB, and temporal stacks of the same area multiply storage requirements proportionally. Tracking raw multi-temporal stacks directly causes two problems: DVC must checksum the full file on every `dvc status` call, and each new acquisition invalidates the entire tracked object even when 95% of pixels are unchanged.

<svg viewBox="0 0 720 260" role="img" aria-label="A multi-temporal stack where each acquisition date is versioned separately but shares a tile grid" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>One grid, many dates, independent versions</title>
  <desc>Three acquisitions over the same area share a single tile grid defined once, so tile 0142 means the same ground on every date. Each date is tracked as its own DVC target, so a re-processed 2025 scene does not invalidate 2024, and a change-detection pair can pin one date at v1 and the other at v3.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <!-- Grid definition -->
  <rect x="20" y="46" width="150" height="70" rx="6" fill="none" stroke="currentColor" stroke-width="2"/>
  <text x="95" y="70" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">tile grid</text>
  <text x="95" y="88" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">defined once</text>
  <text x="95" y="105" text-anchor="middle" font-size="9" fill="currentColor" font-family="monospace" opacity="0.7">origin · size · CRS</text>
  <line x1="170" y1="81" x2="212" y2="81" stroke="currentColor" stroke-width="1.5" marker-end="url(#mt-arr)"/>
  <defs>
    <marker id="mt-arr" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor"/>
    </marker>
  </defs>
  <!-- Dates -->
  <rect x="214" y="40" width="150" height="82" rx="6" fill="none" stroke="currentColor" stroke-width="1.4"/>
  <text x="289" y="62" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">2024-06-11</text>
  <text x="289" y="82" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">tracked at v1</text>
  <text x="289" y="102" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.7">1 840 tiles</text>
  <rect x="380" y="40" width="150" height="82" rx="6" fill="none" stroke="currentColor" stroke-width="1.4"/>
  <text x="455" y="62" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">2025-05-28</text>
  <text x="455" y="82" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">tracked at v3</text>
  <text x="455" y="102" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.7">re-processed twice</text>
  <rect x="546" y="40" width="150" height="82" rx="6" fill="none" stroke="currentColor" stroke-width="1.4"/>
  <text x="621" y="62" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">2026-04-02</text>
  <text x="621" y="82" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">tracked at v1</text>
  <text x="621" y="102" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.7">1 840 tiles</text>
  <!-- Pair -->
  <path d="M289 122 L289 158 L455 158 L455 126" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 3"/>
  <text x="372" y="180" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">change-detection pair pins 2024 at v1 and 2025 at v3</text>
  <text x="372" y="198" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">the pairing is a property of the experiment, not of the dataset</text>
  <text x="360" y="236" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">re-tiling any date to a different grid breaks the alignment silently — the grid definition is the thing that must never drift</text>
</svg>

Generate lightweight VRT index files that reference underlying cloud-optimized GeoTIFFs (COGs) stored directly in object storage:

```bash
# Build a temporal stack VRT from COGs already in S3
gdalbuildvrt \
  -separate \
  -input_file_list scene_list.txt \
  data/processed/temporal_stack.vrt

dvc add data/processed/temporal_stack.vrt
git add data/processed/temporal_stack.vrt.dvc
git commit -m "feat: add multi-temporal VRT index for 2024 Q1 acquisition series"
```

VRT files remain under 100 KB while preserving band mappings, spatial extents, and temporal ordering. Training scripts use `rasterio` windowed reads against the VRT to pull exactly the spatial extent needed for each chip, avoiding full-scene downloads.

```python
import rasterio
from rasterio.windows import from_bounds
from pyproj import Transformer

def read_chip_from_vrt(
    vrt_path: str,
    lon_min: float,
    lat_min: float,
    lon_max: float,
    lat_max: float,
    target_crs: str = "EPSG:32637",
) -> tuple:
    """Read a spatial chip from a VRT without loading the full scene."""
    with rasterio.open(vrt_path) as src:
        transformer = Transformer.from_crs("EPSG:4326", src.crs.to_epsg(), always_xy=True)
        x_min, y_min = transformer.transform(lon_min, lat_min)
        x_max, y_max = transformer.transform(lon_max, lat_max)
        window = from_bounds(x_min, y_min, x_max, y_max, src.transform)
        data = src.read(window=window)
        transform = src.window_transform(window)
    return data, transform
```

For guidance on handling petabyte-class archives or STAC catalog integration with DVC, see [how to version control large satellite imagery datasets](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/how-to-version-control-large-satellite-imagery-datasets/).

---

## Spatial Parameters & Configuration Reference

| Parameter | Type | Valid range / values | Spatial implication |
|---|---|---|---|
| `crs_target` | EPSG string | `EPSG:4326`, UTM zone codes | All rasters and vectors must share this CRS before chip generation |
| `tile_size` | int (pixels) | 256 – 2048 (power of 2) | Larger tiles increase GPU memory requirements; 512 is a common default |
| `overlap` | int (pixels) | 0 – tile_size / 2 | Overlap prevents boundary artifacts; 64 px is typical for 512 px tiles |
| `resample_method` | string | `nearest`, `bilinear`, `cubic` | Use `nearest` for categorical masks; `bilinear`/`cubic` for continuous rasters |
| `upload_concurrency` | int | 1 – 20 | Higher values improve throughput for large files; test against IAM rate limits |
| `checksum` | string | `md5`, `xxhash` | `xxhash` is 3–5× faster; prefer for files > 500 MB |
| `download_concurrency` | int | 1 – 20 | Match to upstream network bandwidth; 10 is a safe default |

---

## Edge Cases & Spatial-Specific Failure Modes

<details>
<summary><strong>Datum shift masquerading as model degradation</strong></summary>

When raw scenes mix `EPSG:4326` (WGS84) and `EPSG:4269` (NAD83) without an explicit datum transformation grid, `gdalwarp` applies a zero-shift fallback that introduces up to 3-metre errors in North America. Always specify `+towgs84` parameters or install PROJ datum grids (`proj-data` package) before running CRS normalization stages.

</details>

<details>
<summary><strong>Partial multipart upload corruption</strong></summary>

An interrupted `dvc push` leaves a partially written object in S3. DVC's `dvc status` reports the file as "modified" locally but may not catch the remote corruption. Run `dvc fetch --jobs 1 --run-cache` to force a full re-download of the remote object and detect size mismatches before training.

</details>

<details>
<summary><strong>Self-intersecting polygon boundaries after topology cleaning</strong></summary>

QGIS buffer or snap operations can introduce self-intersections in annotation polygons that are invisible at normal zoom levels but break GDAL rasterization. Add a shapely validity check in the `export_labels` stage:

```python
from shapely.validation import make_valid
import geopandas as gpd

def clean_annotations(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Fix self-intersecting geometries before rasterization."""
    invalid_mask = ~gdf.geometry.is_valid
    if invalid_mask.any():
        print(f"Repairing {invalid_mask.sum()} invalid geometries")
        gdf.loc[invalid_mask, "geometry"] = gdf.loc[invalid_mask, "geometry"].map(make_valid)
    return gdf
```

</details>

<details>
<summary><strong>Band order inconsistency across acquisition dates</strong></summary>

Satellite providers occasionally reorder spectral bands between product generations. Hardcoding band indices (e.g., `src.read(1)` for red) breaks silently when the band order changes. Always read by band name using GDAL band descriptions or embed a band-to-index mapping in `params.yaml`.

</details>

<details>
<summary><strong>Cache size explosion from frequent raster modifications</strong></summary>

Every `dvc add` on a modified GeoTIFF creates a new cache object. On high-frequency annotation workflows, the local cache can exhaust disk space within days. Run `dvc gc -w --all-commits` weekly and configure cloud lifecycle policies to transition objects older than 90 days to infrequent-access storage tiers.

</details>

---

## Integration & Automation Hooks

### GitHub Actions CI Gate

```yaml
# .github/workflows/spatial-data-ci.yml
name: Spatial Data Validation

on:
  push:
    paths:
      - 'data/**/*.dvc'
      - 'params.yaml'
      - 'dvc.yaml'

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.10"

      - name: Install dependencies
        run: |
          pip install "dvc[s3]==3.50.1" rasterio==1.3.9 geopandas==0.14.4 pyproj==3.6.1

      - name: Configure DVC remote credentials
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.DVC_AWS_KEY }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.DVC_AWS_SECRET }}
        run: dvc remote modify geospatial-remote profile ci

      - name: Pull changed datasets
        run: dvc pull --jobs 4

      - name: Validate annotation precision
        run: python scripts/validate_annotations.py

      - name: Reproduce pipeline (changed stages only)
        run: dvc repro --dry
```

Cache DVC objects between CI runs by adding a `cache` key that hashes `.dvc/config` alongside the runner's cache key. This avoids re-downloading unchanged raster assets on every push.

### Label Studio Export Hook

When [integrating Label Studio with geospatial workflows](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/integrating-label-studio-with-geospatial-workflows/), trigger a `dvc add` + `git commit` automatically after each export by hooking into Label Studio's webhook system:

```python
# scripts/ls_export_hook.py
import subprocess
import datetime
import pathlib

def commit_annotation_export(export_path: str, task_name: str) -> None:
    """Add exported annotations to DVC and commit the metadata update."""
    export_dir = pathlib.Path(export_path)
    subprocess.run(["dvc", "add", str(export_dir)], check=True)
    subprocess.run(["git", "add", f"{export_dir}.dvc"], check=True)
    date_str = datetime.date.today().isoformat()
    subprocess.run([
        "git", "commit", "-m",
        f"feat: label-studio export — {task_name} — {date_str}"
    ], check=True)
```

---

## Validation & Testing

Confirm DVC setup is functioning correctly before committing to a full pipeline run:

```bash
# 1. Verify the remote is reachable and credentials are valid
dvc remote list
dvc push --dry-run data/raw/imagery.dvc

# 2. Confirm pipeline DAG is acyclic and all deps resolve
dvc dag

# 3. Dry-run the full pipeline to preview which stages will execute
dvc repro --dry

# 4. After reproducing, verify outputs match expected checksums
dvc status
```

For raster output validation, add a post-stage assertion that checks CRS, band count, and pixel dimensions:

```python
import rasterio
import pyproj

def assert_raster_contract(
    path: str,
    expected_crs: str,
    expected_bands: int,
    expected_width: int,
    expected_height: int,
) -> None:
    with rasterio.open(path) as src:
        actual_crs = pyproj.CRS.from_user_input(src.crs)
        target_crs = pyproj.CRS.from_epsg(int(expected_crs.split(":")[1]))
        assert actual_crs.equals(target_crs), f"CRS mismatch: {src.crs} != {expected_crs}"
        assert src.count == expected_bands, f"Band count: {src.count} != {expected_bands}"
        assert src.width == expected_width, f"Width: {src.width} != {expected_width}"
        assert src.height == expected_height, f"Height: {src.height} != {expected_height}"
    print(f"Contract passed: {path}")
```

To [preserve geospatial metadata across dataset versions](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/preserving-metadata-across-dataset-versions/) — including acquisition date, sensor ID, and cloud cover percentage — store critical metadata in a companion `metadata.yaml` or STAC catalog entry rather than relying on GDAL-embedded tags that DVC cannot inspect.

---

## Related

- [How to version control large satellite imagery datasets](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/how-to-version-control-large-satellite-imagery-datasets/) — VRT, COG, and STAC patterns for petabyte-class raster archives
- [Tracking annotation changes with SHA hashing](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/tracking-annotation-changes-with-sha-hashing/) — complement DVC content-addressing with geometry-level integrity checks
- [Rollback strategies for corrupted spatial datasets](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/rollback-strategies-for-corrupted-spatial-datasets/) — enterprise recovery patterns including partial cache failures and fallback remotes
- [Preserving metadata across dataset versions](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/preserving-metadata-across-dataset-versions/) — STAC catalog and sidecar YAML strategies for sensor and acquisition provenance

This workflow is one component of the broader [Dataset Versioning & Spatial Data Sync](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/) pipeline for geospatial ML teams.
