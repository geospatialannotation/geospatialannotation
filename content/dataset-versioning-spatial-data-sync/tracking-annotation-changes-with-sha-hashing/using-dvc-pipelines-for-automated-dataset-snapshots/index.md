# Using DVC Pipelines for Automated Dataset Snapshots

**Using DVC pipelines for automated dataset snapshots** eliminates manual version control bottlenecks by treating geospatial annotations, satellite imagery, and training splits as reproducible, hash-tracked artifacts. Instead of committing multi-gigabyte `.tif` or `.geojson` files to Git, you define a declarative `dvc.yaml` workflow that triggers on annotation updates, computes SHA-256 checksums, stages outputs to remote storage, and tags the exact state of your training data for downstream ML jobs. This approach guarantees that every model training run traces back to the precise coordinate geometry, label schema, and raster alignment used at snapshot time.

Modern geospatial AI/ML workflows demand strict lineage tracking. A single shifted polygon, reprojected raster, or modified attribute table can silently invalidate model metrics. By adopting [Dataset Versioning & Spatial Data Sync](/dataset-versioning-spatial-data-sync/) principles, teams replace timestamp-based backups and manual zip archives with deterministic, content-addressable storage. DVC bridges the gap between lightweight Git repositories and heavy spatial datasets, ensuring that data provenance is as rigorously tracked as your model code.

### How the Pipeline Works
A DVC pipeline automates validation, hashing, and archival into a single reproducible step. When an annotation team pushes updated label files, the pipeline executes the following sequence:

1. **Validates spatial integrity**: Enforces CRS consistency, topology rules, and geometry validity before any data is staged.
2. **Computes content-addressable hashes**: Generates deterministic SHA-256 digests for every modified asset, enabling [Tracking Annotation Changes with SHA Hashing](/dataset-versioning-spatial-data-sync/tracking-annotation-changes-with-sha-hashing/) without manual diffing or fragile file-name conventions.
3. **Archives to remote storage**: Pushes only changed chunks to S3, GCS, or Azure Blob using DVC’s built-in cache, avoiding redundant transfers and preserving bandwidth.
4. **Registers metadata**: Writes a versioned Parquet/JSON manifest that downstream training scripts consume to fetch exact dataset states.

Unlike traditional Git LFS, which struggles with large binary files and lacks built-in pipeline orchestration, DVC treats datasets as first-class pipeline stages. This means your data transformations are versioned, cached, and reproducible across environments. For official pipeline configuration standards, refer to the [DVC Pipelines documentation](https://dvc.org/doc/user-guide/project-structure/pipelines-files).

### Production Implementation
Below is a complete, production-ready `dvc.yaml` configuration paired with a Python validation script. The script reads GeoJSON annotations, validates CRS and geometry, computes file hashes, and outputs a Parquet snapshot with metadata.

```yaml
# dvc.yaml
stages:
  snapshot_annotations:
    cmd: python scripts/validate_and_snapshot.py --input data/raw/annotations/ --output data/snapshots/
    deps:
      - data/raw/annotations/
      - scripts/validate_and_snapshot.py
    outs:
      - data/snapshots/latest_snapshot.parquet
      - data/snapshots/metadata.json
```

```python
# scripts/validate_and_snapshot.py
import argparse
import json
import hashlib
import pathlib
import logging
import geopandas as gpd
import pandas as pd
from datetime import datetime, timezone

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

def compute_file_hash(filepath: pathlib.Path) -> str:
    """Compute SHA-256 hash for a file using chunked reads to handle large spatial files."""
    sha256 = hashlib.sha256()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            sha256.update(chunk)
    return sha256.hexdigest()

def main(input_dir: str, output_dir: str) -> None:
    input_path = pathlib.Path(input_dir)
    output_path = pathlib.Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    if not input_path.is_dir():
        raise FileNotFoundError(f"Input directory not found: {input_path}")

    records = []
    for geojson in sorted(input_path.glob("*.geojson")):
        try:
            gdf = gpd.read_file(geojson)
            
            # Validate CRS
            if gdf.crs is None:
                logging.warning(f"Missing CRS in {geojson.name}. Skipping.")
                continue
            if gdf.crs.to_epsg() != 4326:
                logging.info(f"Reprojecting {geojson.name} to EPSG:4326")
                gdf = gdf.to_crs(epsg=4326)

            # Validate geometry
            invalid_mask = ~gdf.geometry.is_valid
            if invalid_mask.any():
                logging.warning(f"Fixing {invalid_mask.sum()} invalid geometries in {geojson.name}")
                gdf.loc[invalid_mask, "geometry"] = gdf.loc[invalid_mask, "geometry"].buffer(0)

            # Compute hash and metadata
            file_hash = compute_file_hash(geojson)
            records.append({
                "filename": geojson.name,
                "sha256": file_hash,
                "feature_count": len(gdf),
                "crs": gdf.crs.to_string(),
                "snapshot_time": datetime.now(timezone.utc).isoformat(),
                "geometry_types": list(gdf.geometry.geom_type.unique())
            })
        except Exception as e:
            logging.error(f"Failed to process {geojson.name}: {e}")

    if not records:
        raise ValueError("No valid GeoJSON files processed.")

    # Output snapshot
    df = pd.DataFrame(records)
    parquet_path = output_path / "latest_snapshot.parquet"
    df.to_parquet(parquet_path, index=False)
    
    metadata = {
        "version": "1.0",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_files": len(records),
        "pipeline_hash": hashlib.sha256(str(records).encode()).hexdigest()
    }
    with open(output_path / "metadata.json", "w") as f:
        json.dump(metadata, f, indent=2)

    logging.info(f"Snapshot complete: {len(records)} files archived to {parquet_path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Validate and snapshot geospatial annotations")
    parser.add_argument("--input", required=True, help="Path to raw annotations directory")
    parser.add_argument("--output", required=True, help="Path to output snapshots directory")
    args = parser.parse_args()
    main(args.input, args.output)
```

### Remote Storage & Cache Optimization
Once the pipeline is defined, initialize DVC and connect your remote storage. DVC uses a local `.dvc/cache` directory for speed and syncs only the necessary chunks to your cloud bucket.

```bash
# Initialize DVC and configure remote
dvc init
dvc remote add -d myremote s3://your-bucket/dvc-cache
dvc remote modify myremote credentialpath ~/.aws/credentials

# Run the pipeline
dvc repro

# Push artifacts to remote
dvc push
```

The `dvc repro` command checks `deps` for changes. If any `.geojson` file or the validation script is modified, DVC reruns the stage, updates the `.dvc` metadata files, and commits lightweight pointers to Git. This keeps your repository under 100MB while tracking terabytes of spatial data. For cryptographic standards governing the hashing algorithm used here, see the [NIST FIPS 180-4 specification](https://csrc.nist.gov/pubs/fips/180-4/final), which defines SHA-256's collision resistance properties.

When working with mixed raster and vector data, configure DVC to use `--external` tracking for massive `.tif` mosaics. This prevents local cache bloat while maintaining deterministic lineage. You can also enable `dvc gc` in your CI cleanup steps to prune unreferenced cache objects and control cloud storage costs.

### CI/CD & Downstream Integration
The generated `latest_snapshot.parquet` acts as a deterministic contract between your annotation team and model engineers. Training scripts can read this manifest to:
- Fetch exact file versions from the DVC cache using stored hashes
- Validate that the training environment matches the snapshot’s CRS and schema
- Log data lineage directly into MLflow or Weights & Biases

To automate this in CI/CD, trigger `dvc repro` on pull requests targeting your `data/` directory. If validation fails or hashes mismatch, the pipeline blocks the merge, preventing corrupted datasets from reaching production training jobs. A typical GitHub Actions workflow runs `dvc pull`, executes the snapshot stage, and pushes outputs only when the branch is approved.

By treating spatial datasets as pipeline outputs rather than static files, you eliminate drift, guarantee reproducibility, and scale geospatial ML without sacrificing version control rigor.