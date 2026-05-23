# Preserving Metadata Across Dataset Versions

Geospatial machine learning pipelines fail silently when coordinate reference systems, acquisition timestamps, or annotation provenance drift between iterations. Unlike tabular datasets, spatial data carries implicit geometric and semantic context that must survive every transformation, augmentation, and version commit. **Preserving Metadata Across Dataset Versions** is not an optional hygiene step; it is a structural requirement for reproducible training, regulatory compliance, and model auditability.

When annotation teams iterate over satellite imagery, LiDAR point clouds, or vector boundaries, metadata loss typically occurs during format conversion, cropping, or batch processing. Without deterministic tracking, downstream training scripts inherit mismatched projections, stale bounding box scales, or orphaned sensor tags. This guide outlines a production-ready workflow for extracting, serializing, and versioning geospatial metadata alongside your training data.

## Why Geospatial Metadata Drift Breaks ML Pipelines

Spatial formats like GeoTIFF, GeoJSON, and Cloud-Optimized GeoTIFF (COG) embed critical context in headers, XML blocks, or auxiliary files. Standard image processing libraries (e.g., OpenCV, PIL) strip this context by design, treating spatial arrays as generic pixel matrices. Even GDAL-based tools can silently drop metadata when drivers encounter unsupported tags or when files are rewritten without explicit metadata preservation flags. [GDAL's raster data model documentation](https://gdal.org/user/raster_data_model.html#metadata) outlines exactly which tags survive round-trip conversions and which require explicit driver configuration.

The downstream impact is severe:
- **Projection Mismatch:** A model trained on EPSG:4326 coordinates receives EPSG:32633 tiles during inference, causing spatial misalignment.
- **Temporal Drift:** Acquisition timestamps are lost, breaking time-series models that rely on seasonal or diurnal patterns.
- **Annotation Misalignment:** Bounding boxes or polygon masks shift when affine transforms are applied without updating coordinate offsets.

Addressing these failures requires treating metadata as a first-class artifact, not a byproduct.

## Prerequisites & Environment Setup

Before implementing a metadata preservation pipeline, ensure your environment meets the following baseline requirements:

- **Python 3.9+** with `pip` or `conda`
- **Core Libraries**: `rasterio>=1.3`, `geopandas>=0.13`, `pyproj>=3.4`, `shapely>=2.0`, `pyyaml>=6.0`
- **Version Control**: Git for code tracking, paired with a data versioning layer. See [Implementing DVC for Geospatial Training Data](/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/) for storage orchestration and remote caching strategies.
- **Input Formats**: GeoTIFF, COG, GeoJSON, or GeoPackage. For structured vector storage, the [OGC GeoPackage specification](https://www.geopackage.org/) provides a reliable, SQLite-backed alternative to shapefiles.
- **Storage Layout**: Flat or hierarchical directory structure with explicit `data/`, `metadata/`, and `annotations/` separation

Install dependencies:
```bash
pip install rasterio geopandas pyproj shapely pyyaml
```

## Step-by-Step Metadata Preservation Workflow

### 1. Extract & Normalize Baseline Metadata
Parse native headers (GDAL tags, PROJ strings, sensor metadata) and normalize into a schema-agnostic dictionary. Convert all CRS representations to EPSG codes or WKT2 strings. Standardize timestamps to ISO 8601 UTC. Store resolution, affine transform, and bounding box in a consistent numeric format.

### 2. Apply Spatial Transformations & Update Context
Execute cropping, tiling, augmentation, or label injection while explicitly updating spatial bounds and resolution fields. Use `rasterio.windows` for precise tile extraction and recalculate the affine transform matrix. Never assume the original CRS survives a crop operation without verification.

### 3. Serialize Deterministic Sidecar Files
Write a structured YAML or JSON file alongside each dataset version. Avoid embedding metadata inside binary formats where GDAL truncation or driver limitations may occur. Sidecar files guarantee human readability, machine parseability, and driver-agnostic portability.

### 4. Compute Hashes & Build Version Manifests
Generate SHA-256 signatures for both the data file and its metadata sidecar. Store these in a centralized manifest for drift detection. For teams managing large-scale annotation campaigns, [Tracking Annotation Changes with SHA Hashing](/dataset-versioning-spatial-data-sync/tracking-annotation-changes-with-sha-hashing/) provides a proven methodology for detecting silent label corruption.

### 5. Commit, Validate & Automate Sync
Push data and metadata to your version control layer. Validate that CRS, extent, and annotation counts match across environments. Integrate validation checks into CI/CD pipelines to block merges that introduce spatial inconsistencies. This workflow aligns with broader [Dataset Versioning & Spatial Data Sync](/dataset-versioning-spatial-data-sync/) practices, ensuring that every pipeline stage consumes identical spatial context regardless of compute node or cloud region.

## Production-Ready Code Implementation

The following script demonstrates a robust, production-grade approach to metadata extraction, sidecar generation, and hash computation. It handles both raster and vector inputs, normalizes CRS, and outputs a deterministic YAML sidecar alongside a SHA-256 manifest.

```python
import hashlib
import json
import os
from pathlib import Path
from typing import Dict, Any

import rasterio
import geopandas as gpd
import yaml
import pyproj

def compute_sha256(file_path: str) -> str:
    """Compute SHA-256 hash of a file."""
    sha256 = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            sha256.update(chunk)
    return sha256.hexdigest()

def normalize_crs(crs_obj) -> Dict[str, Any]:
    """Normalize CRS to EPSG code and WKT2 string."""
    try:
        crs = pyproj.CRS.from_user_input(crs_obj)
        return {
            "epsg": crs.to_epsg(),
            "wkt2": crs.to_wkt(version="WKT2"),
            "is_geographic": crs.is_geographic
        }
    except Exception as e:
        return {"error": str(e), "raw": str(crs_obj)}

def extract_raster_metadata(path: str) -> Dict[str, Any]:
    with rasterio.open(path) as src:
        return {
            "driver": src.driver,
            "width": src.width,
            "height": src.height,
            "count": src.count,
            "dtype": str(src.dtypes[0]),
            "nodata": src.nodata,
            "crs": normalize_crs(src.crs),
            "transform": list(src.transform),
            "bounds": src.bounds._asdict()
        }

def extract_vector_metadata(path: str) -> Dict[str, Any]:
    gdf = gpd.read_file(path)
    return {
        "driver": gdf.__class__.__name__,
        "geometry_type": str(gdf.geometry.iloc[0].geom_type) if not gdf.empty else "empty",
        "feature_count": len(gdf),
        "crs": normalize_crs(gdf.crs),
        "bounds": gdf.total_bounds.tolist()
    }

def build_sidecar(data_path: str, output_dir: str) -> Dict[str, Any]:
    path = Path(data_path)
    suffix = path.suffix.lower()
    
    if suffix in (".tif", ".tiff", ".gtiff", ".cog"):
        meta = extract_raster_metadata(data_path)
    elif suffix in (".geojson", ".gpkg", ".shp"):
        meta = extract_vector_metadata(data_path)
    else:
        raise ValueError(f"Unsupported format: {suffix}")

    # Add file-level metadata
    meta["source_path"] = str(path)
    meta["file_size_bytes"] = path.stat().st_size

    # Write YAML sidecar
    sidecar_name = f"{path.stem}_metadata.yaml"
    sidecar_path = Path(output_dir) / sidecar_name
    with open(sidecar_path, "w") as f:
        yaml.dump(meta, f, default_flow_style=False, sort_keys=False)

    # Compute hashes
    data_hash = compute_sha256(data_path)
    sidecar_hash = compute_sha256(str(sidecar_path))

    return {
        "data_file": str(path),
        "metadata_file": str(sidecar_path),
        "data_sha256": data_hash,
        "metadata_sha256": sidecar_hash,
        "metadata": meta
    }

# Usage example
if __name__ == "__main__":
    INPUT_DIR = "data/raw"
    OUTPUT_DIR = "metadata/v1"
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    for file in Path(INPUT_DIR).glob("*"):
        if file.is_file():
            manifest_entry = build_sidecar(str(file), OUTPUT_DIR)
            print(f"✅ Processed: {file.name}")
            print(f"   Data SHA: {manifest_entry['data_sha256'][:12]}...")
            print(f"   Meta SHA: {manifest_entry['metadata_sha256'][:12]}...")
```

### Code Reliability Notes
- **CRS Normalization**: Uses `pyproj` to convert ambiguous PROJ strings into standardized EPSG/WKT2 pairs, preventing silent projection mismatches.
- **Affine Transform Preservation**: `rasterio.transform` is serialized as a flat list, ensuring exact reconstruction during data loading.
- **Hash Determinism**: Reads files in binary chunks to handle multi-gigabyte COGs without memory overflow.
- **Extensibility**: Easily adaptable to batch processing frameworks (Dask, Ray) or integrated into Airflow/Prefect DAGs.

## Common Pitfalls & Mitigation Strategies

| Pitfall | Root Cause | Mitigation |
|---------|------------|------------|
| **Silent CRS Override** | GDAL defaults to WGS84 when tags are missing | Explicitly validate `crs.is_valid` before processing; reject files without defined projections |
| **Timestamp Timezone Drift** | EXIF/GDAL stores local time without offset | Convert all timestamps to UTC ISO 8601 during normalization |
| **Bounding Box Shift After Augmentation** | Random crops/rotations applied without updating affine matrix | Recompute `transform` and `bounds` post-augmentation; never hardcode original extents |
| **Sidecar-Data Desync** | Manual edits or partial commits | Enforce atomic writes; validate SHA-256 pairs before pipeline execution |

## Next Steps & Ecosystem Integration

Preserving metadata across dataset versions requires treating spatial context as immutable infrastructure. Once your sidecar generation and hashing pipeline is stable, integrate it with your data registry, CI validation gates, and model training schedulers. Automate drift detection by comparing manifest hashes across environments, and enforce strict schema validation before data enters the training queue.

For teams scaling beyond single-node workloads, consider coupling this workflow with distributed storage orchestration and automated rollback triggers. The foundational patterns covered here directly support enterprise-grade spatial ML pipelines, where reproducibility, compliance, and auditability are non-negotiable.