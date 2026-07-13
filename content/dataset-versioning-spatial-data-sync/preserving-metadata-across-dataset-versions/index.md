---
title: "Preserving Metadata Across Dataset Versions"
description: "A production workflow for extracting, serializing, and versioning geospatial metadata — CRS, affine transforms, acquisition timestamps, and annotation provenance — so spatial context survives every pipeline iteration."
slug: preserving-metadata-across-dataset-versions
type: "guide"
breadcrumb:
  - label: "Dataset Versioning & Spatial Data Sync"
    url: "/dataset-versioning-spatial-data-sync/"
  - label: "Preserving Metadata Across Dataset Versions"
    url: "/dataset-versioning-spatial-data-sync/preserving-metadata-across-dataset-versions/"
datePublished: "2025-03-12"
dateModified: "2026-06-25"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Preserving Metadata Across Dataset Versions",
      "description": "A production workflow for extracting, serializing, and versioning geospatial metadata — CRS, affine transforms, acquisition timestamps, and annotation provenance — so spatial context survives every pipeline iteration.",
      "datePublished": "2025-03-12",
      "dateModified": "2026-06-25",
      "author": { "@type": "Organization", "name": "Geospatial Annotation" },
      "publisher": { "@type": "Organization", "name": "Geospatial Annotation" }
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Dataset Versioning & Spatial Data Sync", "item": "https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/" },
        { "@type": "ListItem", "position": 2, "name": "Preserving Metadata Across Dataset Versions", "item": "https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/preserving-metadata-across-dataset-versions/" }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Preserve Metadata Across Geospatial Dataset Versions",
      "description": "Extract, normalize, serialize, and version-control geospatial metadata so CRS, transforms, and annotation provenance survive every pipeline transformation.",
      "step": [
        { "@type": "HowToStep", "position": 1, "name": "Extract & normalize baseline metadata", "text": "Parse native headers and normalize CRS, timestamps, resolution, and affine transforms into a schema-agnostic dictionary." },
        { "@type": "HowToStep", "position": 2, "name": "Apply spatial transformations and update context", "text": "Execute cropping, tiling, or augmentation while explicitly recalculating affine transform and spatial bounds." },
        { "@type": "HowToStep", "position": 3, "name": "Serialize deterministic sidecar files", "text": "Write a structured YAML or JSON sidecar alongside each dataset version, decoupled from binary format headers." },
        { "@type": "HowToStep", "position": 4, "name": "Compute hashes and build version manifests", "text": "Generate SHA-256 signatures for both data file and metadata sidecar; store in a centralized manifest for drift detection." },
        { "@type": "HowToStep", "position": 5, "name": "Commit, validate, and automate sync", "text": "Push data and metadata to version control, validate CRS and extent consistency, and integrate checks into CI/CD pipelines." }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why does GDAL silently drop geospatial metadata?",
          "acceptedAnswer": { "@type": "Answer", "text": "Many GDAL format drivers do not round-trip all metadata domains by default. Tags in the IMAGERY, RPC, or custom XML domains are only preserved when the driver explicitly supports them and when the output format has a container for them. Rewriting a GeoTIFF through a driver like PNG or JPEG discards everything except pixel data." }
        },
        {
          "@type": "Question",
          "name": "Should metadata live inside the GeoTIFF or in a sidecar file?",
          "acceptedAnswer": { "@type": "Answer", "text": "Both. Embed spatial context (CRS, affine transform, nodata) in the GeoTIFF header for tool compatibility, but write a parallel YAML or JSON sidecar for provenance fields that are not natively supported (acquisition sensor, annotation batch ID, dataset version tag). Sidecar files are human-readable, diff-friendly, and survive format conversions." }
        },
        {
          "@type": "Question",
          "name": "How do I detect metadata drift between two dataset versions?",
          "acceptedAnswer": { "@type": "Answer", "text": "Compare SHA-256 hashes of the metadata sidecar files rather than the binary raster data. A hash change on the sidecar—with no change on the data file—signals a metadata mutation without a corresponding data update, which is exactly the silent drift scenario you want to catch." }
        }
      ]
    }
  ]
}
</script>

# Preserving Metadata Across Dataset Versions

Geospatial ML pipelines fail silently when [coordinate reference systems](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/), acquisition timestamps, or annotation provenance drift between iterations. Unlike tabular datasets, spatial data carries implicit geometric and semantic context that must survive every transformation, augmentation, and version commit. Preserving this metadata is not optional hygiene — it is a structural requirement for reproducible training, regulatory compliance, and model auditability.

The failure scenario is routine: an annotation team delivers a new batch of GeoTIFF tiles. A data engineer runs a tiling script. PIL or OpenCV strips the GeoTIFF headers. Training ingests tiles that are now `EPSG:4326`-free pixel arrays. A downstream inference job applies `EPSG:32633` UTM coordinates. IoU metrics collapse because every bounding box is offset by hundreds of meters. No exception is raised.

This guide builds a production-ready workflow for extracting, serializing, and versioning geospatial metadata alongside training data so that scenario never reaches production.

<svg viewBox="0 0 820 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Metadata preservation pipeline: raw spatial data flows through extraction, normalization, sidecar generation, hash manifest, and version commit stages" style="width:100%;max-width:820px;display:block;margin:2rem auto;">
  <title>Metadata Preservation Pipeline</title>
  <desc>Five-stage pipeline showing how spatial metadata flows from raw files through extraction and normalization into YAML sidecars, SHA-256 manifests, and finally a versioned dataset commit. Each stage is connected by arrows. Below the stages, a dashed line marks where spatial context is preserved across every step.</desc>
  <defs>
    <marker id="arr-meta" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
      <polygon points="0 0, 8 3, 0 6" fill="currentColor" opacity="0.5"/>
    </marker>
  </defs>
  <!-- Stage labels -->
  <text x="75" y="22" text-anchor="middle" font-size="9" font-family="inherit" fill="currentColor" opacity="0.5" letter-spacing="0.5">STAGE 1</text>
  <text x="235" y="22" text-anchor="middle" font-size="9" font-family="inherit" fill="currentColor" opacity="0.5" letter-spacing="0.5">STAGE 2</text>
  <text x="395" y="22" text-anchor="middle" font-size="9" font-family="inherit" fill="currentColor" opacity="0.5" letter-spacing="0.5">STAGE 3</text>
  <text x="555" y="22" text-anchor="middle" font-size="9" font-family="inherit" fill="currentColor" opacity="0.5" letter-spacing="0.5">STAGE 4</text>
  <text x="715" y="22" text-anchor="middle" font-size="9" font-family="inherit" fill="currentColor" opacity="0.5" letter-spacing="0.5">STAGE 5</text>
  <!-- Stage boxes -->
  <rect x="10" y="32" width="130" height="108" rx="8" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.25"/>
  <text x="75" y="64" text-anchor="middle" font-size="11" font-family="inherit" fill="currentColor" font-weight="600">Raw Spatial</text>
  <text x="75" y="80" text-anchor="middle" font-size="11" font-family="inherit" fill="currentColor" font-weight="600">Data</text>
  <text x="75" y="102" text-anchor="middle" font-size="10" font-family="inherit" fill="currentColor" opacity="0.7">GeoTIFF · COG</text>
  <text x="75" y="118" text-anchor="middle" font-size="10" font-family="inherit" fill="currentColor" opacity="0.7">GeoJSON · GPKG</text>
  <rect x="170" y="32" width="130" height="108" rx="8" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.25"/>
  <text x="235" y="64" text-anchor="middle" font-size="11" font-family="inherit" fill="currentColor" font-weight="600">Extract &amp;</text>
  <text x="235" y="80" text-anchor="middle" font-size="11" font-family="inherit" fill="currentColor" font-weight="600">Normalize</text>
  <text x="235" y="102" text-anchor="middle" font-size="10" font-family="inherit" fill="currentColor" opacity="0.7">CRS → EPSG/WKT2</text>
  <text x="235" y="118" text-anchor="middle" font-size="10" font-family="inherit" fill="currentColor" opacity="0.7">UTC timestamps</text>
  <rect x="330" y="32" width="130" height="108" rx="8" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.25"/>
  <text x="395" y="64" text-anchor="middle" font-size="11" font-family="inherit" fill="currentColor" font-weight="600">YAML Sidecar</text>
  <text x="395" y="80" text-anchor="middle" font-size="11" font-family="inherit" fill="currentColor" font-weight="600">Generation</text>
  <text x="395" y="102" text-anchor="middle" font-size="10" font-family="inherit" fill="currentColor" opacity="0.7">driver-agnostic</text>
  <text x="395" y="118" text-anchor="middle" font-size="10" font-family="inherit" fill="currentColor" opacity="0.7">human-readable</text>
  <rect x="490" y="32" width="130" height="108" rx="8" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.25"/>
  <text x="555" y="64" text-anchor="middle" font-size="11" font-family="inherit" fill="currentColor" font-weight="600">SHA-256</text>
  <text x="555" y="80" text-anchor="middle" font-size="11" font-family="inherit" fill="currentColor" font-weight="600">Manifest</text>
  <text x="555" y="102" text-anchor="middle" font-size="10" font-family="inherit" fill="currentColor" opacity="0.7">data + sidecar</text>
  <text x="555" y="118" text-anchor="middle" font-size="10" font-family="inherit" fill="currentColor" opacity="0.7">hashes paired</text>
  <rect x="650" y="32" width="130" height="108" rx="8" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.25"/>
  <text x="715" y="64" text-anchor="middle" font-size="11" font-family="inherit" fill="currentColor" font-weight="600">Versioned</text>
  <text x="715" y="80" text-anchor="middle" font-size="11" font-family="inherit" fill="currentColor" font-weight="600">Commit</text>
  <text x="715" y="102" text-anchor="middle" font-size="10" font-family="inherit" fill="currentColor" opacity="0.7">DVC + Git</text>
  <text x="715" y="118" text-anchor="middle" font-size="10" font-family="inherit" fill="currentColor" opacity="0.7">CI validation gate</text>
  <!-- Arrows -->
  <line x1="142" y1="86" x2="168" y2="86" stroke="currentColor" stroke-width="1.5" opacity="0.5" marker-end="url(#arr-meta)"/>
  <line x1="302" y1="86" x2="328" y2="86" stroke="currentColor" stroke-width="1.5" opacity="0.5" marker-end="url(#arr-meta)"/>
  <line x1="462" y1="86" x2="488" y2="86" stroke="currentColor" stroke-width="1.5" opacity="0.5" marker-end="url(#arr-meta)"/>
  <line x1="622" y1="86" x2="648" y2="86" stroke="currentColor" stroke-width="1.5" opacity="0.5" marker-end="url(#arr-meta)"/>
  <!-- Metadata survival annotation -->
  <line x1="170" y1="168" x2="620" y2="168" stroke="currentColor" stroke-width="1" opacity="0.3" stroke-dasharray="4,3"/>
  <text x="395" y="188" text-anchor="middle" font-size="10" font-family="inherit" fill="currentColor" opacity="0.55">spatial context preserved across every stage</text>
  <!-- Danger zone annotation -->
  <rect x="10" y="210" width="640" height="70" rx="6" fill="none" stroke="currentColor" stroke-width="1" opacity="0.15" stroke-dasharray="5,3"/>
  <text x="330" y="233" text-anchor="middle" font-size="9" font-family="inherit" fill="currentColor" opacity="0.45" letter-spacing="0.4">METADATA LOSS RISK ZONE</text>
  <text x="75" y="258" text-anchor="middle" font-size="9" font-family="inherit" fill="currentColor" opacity="0.4">PIL / CV2</text>
  <text x="75" y="270" text-anchor="middle" font-size="9" font-family="inherit" fill="currentColor" opacity="0.4">strips headers</text>
  <text x="235" y="258" text-anchor="middle" font-size="9" font-family="inherit" fill="currentColor" opacity="0.4">PROJ4 string</text>
  <text x="235" y="270" text-anchor="middle" font-size="9" font-family="inherit" fill="currentColor" opacity="0.4">ambiguity</text>
  <text x="395" y="258" text-anchor="middle" font-size="9" font-family="inherit" fill="currentColor" opacity="0.4">binary format</text>
  <text x="395" y="270" text-anchor="middle" font-size="9" font-family="inherit" fill="currentColor" opacity="0.4">driver limits</text>
  <text x="555" y="258" text-anchor="middle" font-size="9" font-family="inherit" fill="currentColor" opacity="0.4">partial write</text>
  <text x="555" y="270" text-anchor="middle" font-size="9" font-family="inherit" fill="currentColor" opacity="0.4">crash desync</text>
</svg>

## Prerequisites & Toolchain Alignment

Before implementing a metadata preservation pipeline, install and pin the following dependencies:

```bash
pip install "rasterio>=1.3.9" "geopandas>=0.13.2" "pyproj>=3.6.0" "shapely>=2.0.3" "pyyaml>=6.0.1"
```

System dependencies:

- **GDAL >= 3.6** — required by `rasterio` and `geopandas`; install via `conda install -c conda-forge gdal` or the OS package manager
- **PROJ >= 9.2** — linked automatically with the conda GDAL build; must match the `pyproj` binding version

Spatial knowledge prerequisites:

- Familiarity with [coordinate reference systems in annotation pipelines](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) — specifically `EPSG:4326` vs projected CRS semantics
- Understanding of affine transforms: `(x_pixel, y_pixel) → (x_geo, y_geo)` mapping encoded in rasterio's `Transform` object
- Basic DVC concepts covered in [Implementing DVC for Geospatial Training Data](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/) for the storage and remote caching layer this workflow feeds into

Storage layout assumed throughout:

```
project/
├── data/raw/          # original GeoTIFFs, COGs, GeoJSONs
├── data/processed/    # cropped / augmented derivatives
├── metadata/          # YAML sidecars + manifest.json
└── annotations/       # label files with provenance fields
```

## Why Spatial Metadata Drifts Between Versions

Spatial formats — GeoTIFF, Cloud-Optimized GeoTIFF (COG), GeoJSON, GeoPackage — embed critical context in binary headers, XML blocks, or auxiliary `.prj` / `.aux.xml` files. Standard image processing libraries treat spatial arrays as generic pixel matrices and discard these containers. Even GDAL-based tools can silently drop metadata when drivers encounter unsupported tags or when files are rewritten without explicit preservation flags.

The downstream impact is concrete:

- **Projection mismatch:** a model trained on `EPSG:4326` coordinate space receives `EPSG:32633` UTM tiles during inference, causing spatial offsets of hundreds of meters
- **Temporal drift:** acquisition timestamps are lost, breaking time-series models that depend on seasonal or diurnal patterns in multi-date stacks
- **Annotation misalignment:** bounding boxes or polygon masks shift when affine transforms are applied during augmentation without updating the geotransform, causing the label geometry to disagree with the pixel geometry. This type of failure is closely related to the [annotation drift problems](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/rollback-strategies-for-corrupted-spatial-datasets/debugging-annotation-drift-across-dataset-versions/) that manifest across dataset versions
- **Provenance gaps:** sensor ID, flight altitude, or annotation batch identifiers disappear, preventing post-hoc audits of model performance by data source

Addressing these failures requires treating metadata as a first-class versioned artifact, not a byproduct stored in binary headers that survive only when the right driver flags are set.

## Core Workflow

### Step 1: Extract and Normalize Baseline Metadata

Parse native headers (GDAL tags, PROJ strings, sensor metadata) and normalize into a schema-agnostic dictionary. Converting all CRS representations to EPSG codes or WKT2 strings prevents the ambiguous PROJ4 string drift that silently shifts datum parameters between library versions. Standardize timestamps to ISO 8601 UTC. Serialize resolution, affine transform, and bounding box in consistent numeric types.

```python
import hashlib
from pathlib import Path
from typing import Any

import rasterio
import geopandas as gpd
import pyproj
import yaml


def normalize_crs(crs_obj: Any) -> dict[str, Any]:
    """Normalize any CRS representation to EPSG code + WKT2 string."""
    try:
        crs = pyproj.CRS.from_user_input(crs_obj)
        return {
            "epsg": crs.to_epsg(),
            "wkt2": crs.to_wkt(version="WKT2_2019"),
            "is_geographic": crs.is_geographic,
            "axis_order": [str(a.direction) for a in crs.axis_info],
        }
    except Exception as exc:
        return {"error": str(exc), "raw": str(crs_obj)}


def extract_raster_metadata(path: Path) -> dict[str, Any]:
    with rasterio.open(path) as src:
        return {
            "driver": src.driver,
            "width": src.width,
            "height": src.height,
            "band_count": src.count,
            "dtype": str(src.dtypes[0]),
            "nodata": src.nodata,
            "crs": normalize_crs(src.crs),
            # Serialize as flat list: [a, b, c, d, e, f] matches GDAL geotransform order
            "affine_transform": list(src.transform)[:6],
            "bounds": dict(src.bounds._asdict()),
            "resolution_m": src.res,
            "compression": src.compression.value if src.compression else None,
        }


def extract_vector_metadata(path: Path) -> dict[str, Any]:
    gdf = gpd.read_file(path)
    geom_types = gdf.geometry.geom_type.value_counts().to_dict() if not gdf.empty else {}
    return {
        "format": path.suffix.lstrip(".").upper(),
        "geometry_types": geom_types,
        "feature_count": len(gdf),
        "crs": normalize_crs(gdf.crs),
        "bounds": gdf.total_bounds.tolist(),  # [minx, miny, maxx, maxy]
        "attribute_schema": {col: str(dtype) for col, dtype in gdf.dtypes.items()},
    }
```

### Step 2: Apply Spatial Transformations and Update Context

Execute cropping, tiling, augmentation, or label injection while explicitly recalculating affine transform and spatial bounds. Never assume the original CRS survives a crop operation without verification — `rasterio.windows` and `rasterio.transform.from_bounds` make the update deterministic.

```python
import rasterio
from rasterio.windows import Window
from rasterio.transform import from_bounds
from pathlib import Path
from typing import Any


def crop_raster_with_metadata(
    src_path: Path,
    dst_path: Path,
    row_off: int,
    col_off: int,
    height: int,
    width: int,
) -> dict[str, Any]:
    """Crop a GeoTIFF tile and return updated metadata dict."""
    with rasterio.open(src_path) as src:
        window = Window(col_off=col_off, row_off=row_off, width=width, height=height)
        transform = src.window_transform(window)
        profile = src.profile.copy()
        profile.update(
            height=height,
            width=width,
            transform=transform,
            # Preserve driver, CRS, dtype, nodata — never drop them
        )
        data = src.read(window=window)

    with rasterio.open(dst_path, "w", **profile) as dst:
        dst.write(data)

    with rasterio.open(dst_path) as verification:
        assert verification.crs == rasterio.open(src_path).crs, (
            "CRS must survive tile crop — check driver write flags"
        )
        return extract_raster_metadata(dst_path)
```

### Step 3: Serialize Deterministic Sidecar Files

Write a structured YAML file alongside each dataset version. Avoid embedding provenance metadata inside binary formats where GDAL truncation or driver limitations may occur. Sidecar files guarantee human readability, machine parseability, and driver-agnostic portability — they also diff cleanly in Git, exposing any metadata mutation across versions.

```python
def write_metadata_sidecar(
    data_path: Path,
    metadata: dict[str, Any],
    sidecar_dir: Path,
    version_tag: str = "v1",
) -> Path:
    """Write a versioned YAML sidecar next to the dataset file."""
    sidecar_dir.mkdir(parents=True, exist_ok=True)
    sidecar_name = f"{data_path.stem}_{version_tag}_metadata.yaml"
    sidecar_path = sidecar_dir / sidecar_name

    payload = {
        "schema_version": "1.0",
        "version_tag": version_tag,
        "source_path": str(data_path),
        "file_size_bytes": data_path.stat().st_size,
        **metadata,
    }

    with open(sidecar_path, "w", encoding="utf-8") as fh:
        yaml.dump(payload, fh, default_flow_style=False, sort_keys=False, allow_unicode=True)

    return sidecar_path
```

### Step 4: Compute SHA-256 Hashes and Build the Version Manifest

Generate SHA-256 signatures for both the data file and its metadata sidecar. Store these as a paired entry in a centralized `manifest.json`. For teams managing large-scale annotation campaigns, [tracking annotation changes with SHA hashing](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/tracking-annotation-changes-with-sha-hashing/) provides proven methodology for detecting silent label corruption using the same manifest structure.

```python
import json
from datetime import datetime, timezone


def compute_sha256(file_path: Path) -> str:
    sha256 = hashlib.sha256()
    with open(file_path, "rb") as fh:
        for chunk in iter(lambda: fh.read(65_536), b""):
            sha256.update(chunk)
    return sha256.hexdigest()


def update_manifest(
    manifest_path: Path,
    data_path: Path,
    sidecar_path: Path,
) -> dict[str, Any]:
    """Append or update a manifest entry for one data/sidecar pair."""
    manifest: dict[str, Any] = {}
    if manifest_path.exists():
        with open(manifest_path, encoding="utf-8") as fh:
            manifest = json.load(fh)

    entry_key = str(data_path.name)
    manifest[entry_key] = {
        "data_path": str(data_path),
        "sidecar_path": str(sidecar_path),
        "data_sha256": compute_sha256(data_path),
        "sidecar_sha256": compute_sha256(sidecar_path),
        "recorded_at": datetime.now(tz=timezone.utc).isoformat(),
    }

    with open(manifest_path, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2)

    return manifest[entry_key]
```

### Step 5: Commit, Validate, and Automate Sync

Push data and metadata to your version control layer. Validate that CRS, extent, and annotation counts match across environments before any training job proceeds. This pattern integrates with the broader [dataset versioning and spatial data sync](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/) workflow, ensuring every pipeline stage consumes identical spatial context regardless of compute node or cloud region.

```python
def validate_sidecar_consistency(
    data_path: Path,
    sidecar_path: Path,
    manifest_path: Path,
) -> bool:
    """Assert that data file and sidecar still match the recorded manifest hashes."""
    with open(manifest_path, encoding="utf-8") as fh:
        manifest: dict[str, Any] = json.load(fh)

    entry = manifest.get(data_path.name)
    if entry is None:
        raise KeyError(f"{data_path.name} not found in manifest — run update_manifest first")

    actual_data_hash = compute_sha256(data_path)
    actual_sidecar_hash = compute_sha256(sidecar_path)

    if actual_data_hash != entry["data_sha256"]:
        raise ValueError(
            f"Data file hash mismatch for {data_path.name}:\n"
            f"  expected: {entry['data_sha256']}\n"
            f"  actual:   {actual_data_hash}"
        )
    if actual_sidecar_hash != entry["sidecar_sha256"]:
        raise ValueError(
            f"Sidecar hash mismatch for {sidecar_path.name}:\n"
            f"  expected: {entry['sidecar_sha256']}\n"
            f"  actual:   {actual_sidecar_hash}"
        )

    return True
```

## Spatial Parameters & Configuration Reference

| Parameter | Type | Valid Range / Format | Spatial Implication |
|-----------|------|----------------------|---------------------|
| `crs.epsg` | `int \| None` | 1024 – 32767 | `None` means CRS is undefined or non-standard; reject file |
| `affine_transform` | `list[float]` (6 elements) | finite floats | `[a, b, c, d, e, f]` matches GDAL convention; `c` and `f` are top-left corner coordinates |
| `bounds` | `dict` (`minx`, `miny`, `maxx`, `maxy`) | depends on CRS units | For geographic CRS: degrees; for projected CRS: meters from origin |
| `resolution_m` | `tuple[float, float]` | > 0 | Pixel size in CRS units; use `pyproj.Transformer` to convert to meters if CRS is geographic |
| `nodata` | `float \| int \| None` | any finite value | Must match the dtype range; `None` is valid but downstream models must handle masked arrays |
| `dtype` | `str` | `uint8`, `uint16`, `float32`, `float64` | `float32` is the standard ML input format; `uint16` common for multispectral sensors |
| `schema_version` | `str` | `"1.0"`, `"1.1"`, … | Increment the minor version when adding optional fields; major version for breaking changes |
| `version_tag` | `str` | `v{N}` or `{date}-{hash}` | Use the DVC commit hash as tag for exact reproducibility |

## Edge Cases & Gotchas

**Silent CRS override by GDAL defaults.** When a GeoTIFF has a missing or corrupt `GEOGCS` block, GDAL defaults to `EPSG:4326` without raising an error. The resulting CRS object is technically valid, but the coordinates are wrong. Mitigation: before processing any file, verify `src.crs is not None` and check `normalize_crs(src.crs)["epsg"] is not None`. Reject files that fail this guard.

**Timestamp timezone drift.** GDAL's `TIFFTAG_DATETIME` stores local time without a UTC offset, and EXIF acquisition time is similarly ambiguous. If your sensor metadata reports `2024-08-14 06:30:00` without a timezone, you cannot know whether that is UTC, UTC+2, or local mission time. Mitigation: at ingest, require all timestamps to carry an explicit UTC offset; if missing, record them as `"unknown"` rather than assuming UTC.

**Affine transform corruption during augmentation.** Random rotation augmentations applied at the pixel level without updating the affine transform produce annotation files whose polygon coordinates no longer align with the rotated image. This is the most common source of IoU collapse in augmented geospatial datasets. Mitigation: apply `rasterio.transform.AffineTransformer` or `pyproj.Transformer` to every annotation geometry after any spatial augmentation. When evaluating how labels shift against detection windows, use the [IoU threshold guidelines for geospatial object detection](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/calculating-iou-thresholds-for-geospatial-object-detection/) to set acceptance criteria.

**Sidecar-data desync from partial commits.** A batch job that writes the raster but crashes before writing the sidecar leaves the manifest in a half-updated state. The next run will find a data SHA that has no matching sidecar SHA, which the validation step correctly rejects — but only if `validate_sidecar_consistency` is called before the training job starts. Wire this check into the CI gate, not just the ingestion script.

**GeoPackage layer name collisions.** A GeoPackage stores multiple layers in a single SQLite file. Extracting vector metadata without specifying `layer=` in `gpd.read_file()` reads only the first layer, silently ignoring the rest. Mitigation: enumerate layers with `fiona.listlayers(path)` and extract metadata per layer.

**PROJ datum grid availability.** Reprojection between datums like NAD27 → NAD83 or ETRS89 → OSGB36 requires PROJ datum shift grids that are not bundled with the standard PROJ distribution. If the grid file is absent, `pyproj` falls back to a simplified transform with errors up to several meters. Mitigation: install `proj-data` (conda) or use the `pyproj` CDN grid downloader, and verify the transformation accuracy using `pyproj.CRS.from_epsg().datum`.

## Integration & Automation Hooks

### DVC Integration

Track the `metadata/` directory alongside data files so every `dvc repro` run captures sidecar state. The [DVC pipeline configuration for geospatial training data](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/) covers remote storage setup and caching strategies that complement this metadata tracking approach.

```yaml
# dvc.yaml
stages:
  extract_metadata:
    cmd: python pipeline/extract_metadata.py
    deps:
      - data/raw/
      - pipeline/extract_metadata.py
    outs:
      - metadata/
      - metadata/manifest.json
    params:
      - params.yaml:
          - metadata.version_tag
          - metadata.schema_version
```

### GitHub Actions CI Gate

Block any PR that introduces spatial metadata drift before it reaches the training queue:

```yaml
# .github/workflows/metadata_check.yml
name: Metadata Consistency Check
on: [pull_request]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"
      - run: pip install rasterio>=1.3.9 geopandas>=0.13.2 pyproj>=3.6.0 pyyaml>=6.0.1
      - name: Validate manifest consistency
        run: |
          python - <<'EOF'
          from pathlib import Path
          from pipeline.metadata import validate_sidecar_consistency
          import json, sys

          manifest_path = Path("metadata/manifest.json")
          with open(manifest_path) as fh:
              manifest = json.load(fh)

          errors = []
          for name, entry in manifest.items():
              try:
                  validate_sidecar_consistency(
                      Path(entry["data_path"]),
                      Path(entry["sidecar_path"]),
                      manifest_path,
                  )
              except ValueError as exc:
                  errors.append(str(exc))

          if errors:
              print("\n".join(errors), file=sys.stderr)
              sys.exit(1)
          print(f"All {len(manifest)} manifest entries validated successfully.")
          EOF
```

### Label Studio Provenance Injection

When exporting annotated tasks from [Label Studio integrated with geospatial workflows](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/integrating-label-studio-with-geospatial-workflows/), inject the dataset version tag and sidecar hash into each annotation's `meta` field so the training pipeline can trace every label back to its source version:

```python
import json
from pathlib import Path


def inject_provenance(
    label_studio_export: Path,
    manifest_path: Path,
    output_path: Path,
) -> None:
    with open(label_studio_export, encoding="utf-8") as fh:
        tasks: list[dict] = json.load(fh)
    with open(manifest_path, encoding="utf-8") as fh:
        manifest: dict = json.load(fh)

    for task in tasks:
        source_file = Path(task.get("data", {}).get("image", "")).name
        if source_file in manifest:
            task.setdefault("meta", {})["dataset_version"] = manifest[source_file]

    with open(output_path, "w", encoding="utf-8") as fh:
        json.dump(tasks, fh, indent=2)
```

## Validation & Testing

Run these assertions after every pipeline stage to confirm metadata integrity before any data enters a training queue.

```python
import pytest
import rasterio
import pyproj
from pathlib import Path
import json


def test_crs_survives_crop(tmp_path: Path, sample_geotiff: Path) -> None:
    """CRS must be identical before and after a tile crop operation."""
    with rasterio.open(sample_geotiff) as src:
        original_epsg = pyproj.CRS(src.crs).to_epsg()

    cropped = tmp_path / "tile.tif"
    crop_raster_with_metadata(sample_geotiff, cropped, 0, 0, 256, 256)

    with rasterio.open(cropped) as dst:
        cropped_epsg = pyproj.CRS(dst.crs).to_epsg()

    assert original_epsg == cropped_epsg, (
        f"CRS changed after crop: {original_epsg} → {cropped_epsg}"
    )


def test_manifest_hash_matches_file(tmp_path: Path, sample_geotiff: Path) -> None:
    """Manifest SHA-256 must match recomputed hash of the file on disk."""
    sidecar_dir = tmp_path / "metadata"
    manifest_path = sidecar_dir / "manifest.json"
    meta = extract_raster_metadata(sample_geotiff)
    sidecar = write_metadata_sidecar(sample_geotiff, meta, sidecar_dir)
    update_manifest(manifest_path, sample_geotiff, sidecar)

    assert validate_sidecar_consistency(sample_geotiff, sidecar, manifest_path)


def test_sidecar_is_valid_yaml(tmp_path: Path, sample_geotiff: Path) -> None:
    """Sidecar file must be parseable YAML with required fields present."""
    import yaml

    sidecar_dir = tmp_path / "metadata"
    meta = extract_raster_metadata(sample_geotiff)
    sidecar = write_metadata_sidecar(sample_geotiff, meta, sidecar_dir)

    with open(sidecar, encoding="utf-8") as fh:
        loaded = yaml.safe_load(fh)

    required_fields = {"schema_version", "version_tag", "crs", "affine_transform", "bounds"}
    missing = required_fields - set(loaded.keys())
    assert not missing, f"Sidecar missing required fields: {missing}"


def test_crs_normalization_roundtrip() -> None:
    """normalize_crs must produce a valid EPSG code for standard projections."""
    import pyproj

    for epsg in [4326, 32633, 3857, 27700]:
        crs = pyproj.CRS.from_epsg(epsg)
        result = normalize_crs(crs)
        assert result["epsg"] == epsg, f"EPSG roundtrip failed for {epsg}: got {result['epsg']}"
        assert "error" not in result
```

---

This workflow is one component of the broader [Dataset Versioning & Spatial Data Sync](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/) pipeline.

**Related**

- [Implementing DVC for Geospatial Training Data](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/) — storage orchestration and remote caching that consumes these metadata sidecars
- [Tracking Annotation Changes with SHA Hashing](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/tracking-annotation-changes-with-sha-hashing/) — manifest-based drift detection for annotation files, complementing the raster metadata approach here
- [Rollback Strategies for Corrupted Spatial Datasets](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/rollback-strategies-for-corrupted-spatial-datasets/) — what to do when metadata validation catches a version with silent CRS corruption
- [Debugging Annotation Drift Across Dataset Versions](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/rollback-strategies-for-corrupted-spatial-datasets/debugging-annotation-drift-across-dataset-versions/) — diagnosing the label shift that surfaces when affine transforms are not updated after augmentation
- [Coordinate Reference Systems in Annotation Pipelines](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) — foundational CRS concepts underlying the normalization steps in this workflow
