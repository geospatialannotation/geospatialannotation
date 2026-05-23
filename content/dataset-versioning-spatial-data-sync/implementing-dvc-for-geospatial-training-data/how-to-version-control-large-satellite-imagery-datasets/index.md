# How to Version Control Large Satellite Imagery Datasets

To learn **how to version control large satellite imagery datasets**, decouple metadata from binary assets. Use Git for code, configuration, and lightweight annotation exports, while leveraging Data Version Control (DVC) to track multi-gigabyte raster files. Store imagery in cloud object storage, convert raw tiles to Cloud-Optimized GeoTIFF (COG) or Zarr for chunked I/O, and commit `.dvc` pointer files to your repository. This architecture preserves full dataset lineage, enables reproducible ML training snapshots, and prevents Git repository bloat.

## Why Standard Git Fails for Geospatial Data
Satellite imagery routinely exceeds hundreds of gigabytes per scene. Git was engineered for text-based source control, not binary raster data. Committing raw `.tif` or `.jp2` files triggers full copies on every change, exhausts local disk space, and breaks CI/CD runners. While Git LFS exists, it struggles with geospatial metadata, lacks native chunked access, and incurs high egress costs when pulling historical commits. 

DVC solves this by storing only cryptographic hashes and storage paths in Git, while the actual imagery lives in a scalable remote backend. This approach is foundational to modern [Dataset Versioning & Spatial Data Sync](/dataset-versioning-spatial-data-sync/) workflows, where reproducibility, storage efficiency, and team collaboration are non-negotiable.

## Production Architecture: Git + DVC + Cloud Storage
A scalable setup separates concerns into three distinct layers:

1. **Git Layer:** Tracks Python training scripts, `dvc.yaml` pipelines, annotation exports (COCO/GeoJSON), and lightweight `.dvc` pointer files.
2. **DVC Layer:** Manages dataset snapshots, computes SHA-256 checksums, and orchestrates `pull`/`push` operations. It also tracks preprocessing dependencies so `dvc repro` rebuilds pipelines deterministically.
3. **Storage Layer:** Hosts the actual imagery in S3, GCS, or Azure Blob. COG format enables HTTP range requests for tile-level access without downloading full files, while Zarr supports cloud-native chunked arrays ideal for PyTorch/TensorFlow dataloaders. Refer to the [GDAL COG driver documentation](https://gdal.org/drivers/raster/cog.html) for optimal compression and tiling flags.

## Step-by-Step Implementation
Follow this sequence to initialize version control for a new satellite imagery directory:

1. **Initialize DVC in your repository:**
 ```bash
   dvc init
   ```
2. **Convert raw imagery to COG** (ensures cloud-native streaming):
 ```bash
   gdal_translate -of COG -co COMPRESS=DEFLATE -co TILED=YES -co COPY_SRC_OVERVIEWS=YES input.tif output_cog.tif
   ```
3. **Track the dataset directory:**
 ```bash
   dvc add data/satellite_imagery/
   ```
4. **Configure remote storage** (replace with your cloud provider):
 ```bash
   dvc remote add -d myremote s3://your-bucket/geodata
   ```
 See the official [DVC Remote Storage guide](https://dvc.org/doc/user-guide/data-management/remote-storage) for authentication and provider-specific configurations.
5. **Push binaries to the cloud:**
 ```bash
   dvc push
   ```
6. **Commit pointer files to Git:**
 ```bash
   git add data/satellite_imagery.dvc .gitignore
   git commit -m "Track v1 satellite imagery"
   ```

## Automated Validation & Tracking Script
The following Python script validates COG structure, tracks a directory with DVC, and commits the resulting pointers. It assumes a Linux/macOS environment with `dvc` and `rasterio` installed.

```python
import subprocess
import sys
from pathlib import Path
import rasterio

def validate_cog(path: Path) -> bool:
    """Verify file is a valid COG with internal tiling and overviews."""
    try:
        with rasterio.open(path) as src:
            is_tiled = src.profile.get("tiled", False)
            has_overviews = len(src.overviews(1)) > 0
            return is_tiled and has_overviews
    except Exception as e:
        print(f"❌ Validation failed for {path}: {e}", file=sys.stderr)
        return False

def track_with_dvc(data_dir: Path) -> None:
    """Add directory to DVC and commit pointer to Git."""
    if not data_dir.exists():
        raise FileNotFoundError(f"Directory not found: {data_dir}")
        
    subprocess.run(["dvc", "add", str(data_dir)], check=True)
    subprocess.run(["git", "add", f"{data_dir}.dvc", ".gitignore"], check=True)
    subprocess.run(["git", "commit", "-m", f"Track {data_dir.name}"], check=True)
    print(f"✅ Successfully tracked and committed {data_dir}")

if __name__ == "__main__":
    imagery_dir = Path("data/satellite_v1")
    
    # Validate all TIFFs before tracking
    valid_count = 0
    for tif_file in imagery_dir.glob("*.tif"):
        if validate_cog(tif_file):
            valid_count += 1
        else:
            print(f"⚠️  {tif_file.name} failed COG validation. Skipping.")
            
    if valid_count == 0:
        print("No valid COGs found. Aborting DVC tracking.")
        sys.exit(1)
        
    track_with_dvc(imagery_dir)
```

## Best Practices for ML & Annotation Workflows
When building automated annotation pipelines, you’ll typically generate versioned splits (train/val/test) alongside spatial metadata. Locking dataset states before model training prevents data leakage and ensures experiment reproducibility. For a complete breakdown of pipeline orchestration, see [Implementing DVC for Geospatial Training Data](/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/).

- **Store annotations in Git:** COCO JSON, GeoJSON, and label CSVs are lightweight text files. Commit them directly to Git to maintain strict version parity with `.dvc` pointers.
- **Use `dvc.yaml` for preprocessing:** Define tiling, normalization, and augmentation steps as DVC stages. This guarantees that any team member can run `dvc repro` and generate identical training tensors.
- **Tag releases, not commits:** Use `git tag v1.0-imagery` alongside `dvc push` to create immutable snapshots. CI/CD runners can then pull exact dataset versions without scanning commit history.
- **Monitor storage costs:** Enable lifecycle policies on your cloud bucket to archive older `.dvc` versions to cold storage after 90 days. DVC’s hash-based deduplication ensures you never pay twice for identical tiles.

This workflow scales cleanly from single-GPU experiments to distributed training clusters, keeping your repository lean while preserving full geospatial lineage.