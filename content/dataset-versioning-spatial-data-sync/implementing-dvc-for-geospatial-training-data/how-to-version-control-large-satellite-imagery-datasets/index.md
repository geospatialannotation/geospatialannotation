---
title: "How to Version Control Large Satellite Imagery Datasets"
description: "Step-by-step guide to versioning multi-gigabyte satellite imagery with DVC and Cloud-Optimized GeoTIFF: decouple binary rasters from Git, configure S3/GCS remotes, and maintain full dataset lineage for reproducible ML training."
slug: "how-to-version-control-large-satellite-imagery-datasets"
type: "tutorial"
breadcrumb: "How to Version Control Large Satellite Imagery Datasets"
datePublished: "2025-03-12"
dateModified: "2026-06-25"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "How to Version Control Large Satellite Imagery Datasets",
      "description": "Step-by-step guide to versioning multi-gigabyte satellite imagery with DVC and Cloud-Optimized GeoTIFF: decouple binary rasters from Git, configure S3/GCS remotes, and maintain full dataset lineage for reproducible ML training.",
      "datePublished": "2025-03-12",
      "dateModified": "2026-06-25",
      "author": {"@type": "Organization", "name": "Geospatial Annotation"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "/"},
        {"@type": "ListItem", "position": 2, "name": "Dataset Versioning & Spatial Data Sync", "item": "/dataset-versioning-spatial-data-sync/"},
        {"@type": "ListItem", "position": 3, "name": "Implementing DVC for Geospatial Training Data", "item": "/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/"},
        {"@type": "ListItem", "position": 4, "name": "How to Version Control Large Satellite Imagery Datasets", "item": "/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/how-to-version-control-large-satellite-imagery-datasets/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "How to Version Control Large Satellite Imagery Datasets",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Convert imagery to Cloud-Optimized GeoTIFF", "text": "Use gdal_translate with COG driver, DEFLATE compression, and TILED=YES to enable chunked HTTP range reads."},
        {"@type": "HowToStep", "position": 2, "name": "Initialize DVC alongside Git", "text": "Run dvc init, then configure a remote S3 or GCS bucket as the DVC backend."},
        {"@type": "HowToStep", "position": 3, "name": "Track the imagery directory with DVC", "text": "Run dvc add data/satellite_imagery/ to generate a .dvc pointer file with SHA-256 checksums."},
        {"@type": "HowToStep", "position": 4, "name": "Push binaries to cloud storage", "text": "Run dvc push to transfer rasters to the remote backend, then commit the .dvc pointer file to Git."},
        {"@type": "HowToStep", "position": 5, "name": "Tag the dataset release", "text": "Use git tag v1.0-imagery alongside dvc push to create an immutable, reproducible training snapshot."},
        {"@type": "HowToStep", "position": 6, "name": "Validate COG structure before tracking", "text": "Use rasterio to assert internal tiling and overview presence before committing .dvc pointers."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why does git add fail on large GeoTIFF files?",
          "acceptedAnswer": {"@type": "Answer", "text": "Git stores a full copy of every version of every tracked file. A 2 GB GeoTIFF committed twice doubles repository size permanently. Use DVC to store only a SHA-256 pointer in Git while the binary lives in cloud object storage."}
        },
        {
          "@type": "Question",
          "name": "What CRS should satellite imagery be stored in for ML training?",
          "acceptedAnswer": {"@type": "Answer", "text": "Store raw imagery in its native acquisition CRS (often EPSG:4326 or a UTM zone). Reproject to a consistent projected CRS such as EPSG:32633 only during preprocessing, and track that reprojection as a DVC pipeline stage so the transform is reproducible."}
        },
        {
          "@type": "Question",
          "name": "Can DVC handle partial tile updates without re-uploading the full scene?",
          "acceptedAnswer": {"@type": "Answer", "text": "Yes. DVC operates at the file level, so adding a changed tile to a dvc add directory re-hashes only that file. Zarr datasets offer sub-file chunk granularity, where only modified chunks are re-uploaded, making them preferable for frequently updated time-series imagery."}
        },
        {
          "@type": "Question",
          "name": "How do I pull a specific dataset version for a past experiment?",
          "acceptedAnswer": {"@type": "Answer", "text": "Check out the Git tag or commit that contains the .dvc pointer files for that snapshot, then run dvc pull. DVC resolves the SHA-256 hashes and fetches exactly those binary versions from the remote cache."}
        }
      ]
    }
  ]
}
</script>

# How to Version Control Large Satellite Imagery Datasets

To version control large satellite imagery datasets, decouple binary rasters from your Git repository. Store code, configuration, and lightweight annotation exports in Git, and use [Data Version Control (DVC)](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/) to track multi-gigabyte raster files via cryptographic pointers. Convert raw scenes to Cloud-Optimized GeoTIFF (COG) or Zarr format before tracking so that remote storage supports HTTP range requests and chunked access. This keeps the repository lean, preserves full dataset lineage, and enables any team member or CI runner to reproduce a training snapshot exactly.

---

<!-- Inline SVG: architecture diagram showing Git + DVC + Cloud Storage layers -->
<svg viewBox="0 0 720 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Architecture diagram: Git tracks pointer files, DVC orchestrates transfers, cloud storage holds binary rasters" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>Git + DVC + Cloud Storage versioning architecture for satellite imagery</title>
  <desc>Three horizontal layers stacked vertically: Git repository at the top holding .dvc pointer files and code; DVC orchestration layer in the middle managing push, pull and checksums; Cloud object storage at the bottom holding COG and Zarr rasters. Labelled arrows on the left show commit/checkout going down and dvc pull going up between layers.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <defs>
    <marker id="arr-down" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor"/>
    </marker>
    <marker id="arr-up" markerWidth="8" markerHeight="8" refX="2" refY="3" orient="auto">
      <path d="M8,0 L8,6 L0,3 z" fill="currentColor"/>
    </marker>
  </defs>
  <!-- Git layer -->
  <rect x="80" y="16" width="580" height="68" rx="8" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="96" y="42" font-size="13" font-weight="600" fill="currentColor" font-family="inherit">Git Repository</text>
  <text x="96" y="60" font-size="11" fill="currentColor" font-family="inherit" opacity="0.75">training_scripts/   dvc.yaml   data/imagery.dvc   annotations/*.geojson</text>
  <!-- Arrow column: Git ↔ DVC -->
  <line x1="40" y1="84" x2="40" y2="112" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr-down)"/>
  <text x="44" y="102" font-size="10" fill="currentColor" font-family="inherit" opacity="0.75">commit</text>
  <line x1="36" y1="112" x2="36" y2="84" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr-up)" stroke-dasharray="4 2"/>
  <text x="44" y="122" font-size="10" fill="currentColor" font-family="inherit" opacity="0.75">checkout</text>
  <!-- DVC layer -->
  <rect x="80" y="116" width="580" height="68" rx="8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="6 3"/>
  <text x="96" y="142" font-size="13" font-weight="600" fill="currentColor" font-family="inherit">DVC Orchestration Layer</text>
  <text x="96" y="160" font-size="11" fill="currentColor" font-family="inherit" opacity="0.75">SHA-256 checksums   dvc push / dvc pull   dvc repro (pipeline stages)   multipart transfer</text>
  <!-- Arrow column: DVC ↔ Cloud -->
  <line x1="40" y1="184" x2="40" y2="212" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr-down)"/>
  <text x="44" y="202" font-size="10" fill="currentColor" font-family="inherit" opacity="0.75">push</text>
  <line x1="36" y1="212" x2="36" y2="184" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr-up)" stroke-dasharray="4 2"/>
  <text x="44" y="222" font-size="10" fill="currentColor" font-family="inherit" opacity="0.75">pull</text>
  <!-- Cloud storage layer -->
  <rect x="80" y="216" width="580" height="68" rx="8" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="96" y="242" font-size="13" font-weight="600" fill="currentColor" font-family="inherit">Cloud Object Storage</text>
  <text x="96" y="260" font-size="11" fill="currentColor" font-family="inherit" opacity="0.75">s3://bucket/geodata/   scene_v1_cog.tif   scene_v2_cog.tif   timeseries.zarr/</text>
</svg>

## Why Standard Git Breaks on Satellite Imagery

Satellite scenes routinely exceed hundreds of gigabytes per acquisition. Git stores a full binary copy of every version of every committed file. Committing raw `.tif` or `.jp2` files causes repository size to compound linearly with dataset evolution, exhausts local disk space on developer machines, and makes CI/CD runners fail with out-of-memory errors during clone.

<svg viewBox="0 0 720 270" role="img" aria-label="What Git stores for a changed GeoTIFF compared with what DVC stores, over five versions" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>Five edits to one 800 MB scene, stored two ways</title>
  <desc>Git stores a compressed copy of the whole binary at every commit, so five versions of an 800 megabyte scene occupy roughly four gigabytes inside the repository and every clone pays for all of it. DVC keeps a 200 byte pointer per version in Git and one deduplicated copy of each distinct file in remote storage, so the repository stays kilobytes and the clone pulls only the version it asks for.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <!-- Git -->
  <text x="20" y="40" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">Git, tracking the file directly</text>
  <rect x="20" y="52" width="128" height="34" rx="4" fill="currentColor" opacity="0.45"/>
  <rect x="152" y="52" width="128" height="34" rx="4" fill="currentColor" opacity="0.45"/>
  <rect x="284" y="52" width="128" height="34" rx="4" fill="currentColor" opacity="0.45"/>
  <rect x="416" y="52" width="128" height="34" rx="4" fill="currentColor" opacity="0.45"/>
  <rect x="548" y="52" width="128" height="34" rx="4" fill="currentColor" opacity="0.45"/>
  <text x="84" y="74" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace">v1 · 800 MB</text>
  <text x="216" y="74" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace">v2 · 800 MB</text>
  <text x="348" y="74" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace">v3 · 800 MB</text>
  <text x="480" y="74" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace">v4 · 800 MB</text>
  <text x="612" y="74" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace">v5 · 800 MB</text>
  <text x="20" y="108" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.85">≈ 4 GB inside the repository — and every clone downloads all five</text>
  <!-- DVC -->
  <text x="20" y="156" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">DVC, tracking a pointer</text>
  <rect x="20" y="168" width="128" height="34" rx="4" fill="none" stroke="currentColor" stroke-width="1.4"/>
  <rect x="152" y="168" width="128" height="34" rx="4" fill="none" stroke="currentColor" stroke-width="1.4"/>
  <rect x="284" y="168" width="128" height="34" rx="4" fill="none" stroke="currentColor" stroke-width="1.4"/>
  <rect x="416" y="168" width="128" height="34" rx="4" fill="none" stroke="currentColor" stroke-width="1.4"/>
  <rect x="548" y="168" width="128" height="34" rx="4" fill="none" stroke="currentColor" stroke-width="1.4"/>
  <text x="84" y="190" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace">.dvc · 200 B</text>
  <text x="216" y="190" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace">.dvc · 200 B</text>
  <text x="348" y="190" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace">.dvc · 200 B</text>
  <text x="480" y="190" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace">.dvc · 200 B</text>
  <text x="612" y="190" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace">.dvc · 200 B</text>
  <text x="20" y="224" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.85">1 KB in the repository; the bytes live in remote storage, deduplicated by content hash</text>
  <text x="20" y="252" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">a checkout of v3 pulls one 800 MB object — not the history</text>
</svg>

Git LFS partially mitigates file size but introduces different problems for spatial workloads: it lacks native support for [coordinate reference system](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) metadata as a versioned entity, has no concept of chunked raster access, and can generate significant egress costs when pulling historical commits. DVC solves this by committing only a `.dvc` pointer file — a small YAML containing the file's SHA-256 hash and storage path — while the binary lives in a scalable remote backend.

## Why Imagery Scale Makes This a Pipeline Bottleneck

At the scale typical in ML workflows — multi-temporal stacks for change detection, multi-sensor fusion campaigns, or high-resolution urban mapping — the naive approach of committing rasters to Git collapses in three predictable ways. First, repository clone time grows proportionally to total historical binary size, breaking CI/CD environment setup. Second, reproducing a past experiment requires reconstructing every dataset version from scratch because there is no content-addressable cache. Third, team members on bandwidth-constrained connections (field offices, overseas contractors) cannot participate in dataset pulls at all.

The combination of DVC pointers in Git and COG-formatted rasters in object storage fixes all three problems: clones stay under a few megabytes regardless of dataset size, any historical version is reproducible by checking out the pointer file and running `dvc pull`, and remote caches mean that unchanged files are never re-transferred. This same mechanism also integrates cleanly with [SHA-based annotation tracking](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/tracking-annotation-changes-with-sha-hashing/) so that raster and vector versions stay in lockstep.

## Step-by-Step Implementation

### Step 1: Convert Raw Imagery to Cloud-Optimized GeoTIFF

Before tracking with DVC, convert each scene to COG format. COG files interleave tile overviews and data internally, so cloud storage can serve HTTP range requests against individual tiles without fetching the full file. The GDAL COG driver handles this:

```bash
gdal_translate \
  -of COG \
  -co COMPRESS=DEFLATE \
  -co TILED=YES \
  -co BLOCKXSIZE=512 \
  -co BLOCKYSIZE=512 \
  -co COPY_SRC_OVERVIEWS=YES \
  input_raw.tif \
  output_cog.tif
```

For time-series stacks or hyperspectral cubes, Zarr is preferable. Zarr stores data as chunked arrays in separate files, so only modified chunks are re-uploaded when a tile changes:

```bash
pip install "zarr==2.18.0" "rioxarray==0.15.5"
```

```python
import rioxarray

ds = rioxarray.open_rasterio("output_cog.tif", chunks={"x": 512, "y": 512})
ds.to_zarr("timeseries.zarr", mode="w")
```

### Step 2: Initialize DVC in Your Repository

DVC must sit alongside an existing Git repository. Run these commands from the repository root:

```bash
pip install "dvc[s3]==3.51.2"   # swap [s3] for [gcs] or [azure] as needed

git init
dvc init

# Commit the DVC configuration files Git needs to track
git add .dvc/config .dvcignore
git commit -m "Initialize DVC"
```

### Step 3: Configure Remote Storage

Point DVC at a cloud bucket. Use the `--local` flag to keep credentials out of the shared `.dvc/config` file:

```bash
# Shared config (safe to commit)
dvc remote add -d geospatial-remote s3://your-bucket/dvc-data
dvc remote modify geospatial-remote region us-east-1

# Per-machine credentials (never committed)
dvc remote modify --local geospatial-remote access_key_id YOUR_KEY
dvc remote modify --local geospatial-remote secret_access_key YOUR_SECRET

git add .dvc/config
git commit -m "Add S3 DVC remote"
```

### Step 4: Track the Imagery Directory

```bash
dvc add data/satellite_imagery/

# DVC writes data/satellite_imagery.dvc (pointer) and updates .gitignore
git add data/satellite_imagery.dvc .gitignore
git commit -m "Track satellite imagery v1 with DVC"
```

The generated `.dvc` pointer file looks like this:

```yaml
outs:
- md5: d41d8cd98f00b204e9800998ecf8427e.dir
  size: 4831838208
  nfiles: 47
  path: data/satellite_imagery
```

### Step 5: Push Binaries and Tag the Release

```bash
dvc push                            # transfer rasters to the S3 remote
git tag v1.0-imagery                # immutable snapshot for training run 1
git push origin main --tags
```

Any teammate or CI runner can now reproduce the exact dataset with:

```bash
git checkout v1.0-imagery
dvc pull
```

### Step 6: Validate COG Structure Before Committing

Run this validation script before calling `dvc add`. It uses `rasterio` to assert internal tiling and overview presence — the two properties required for cloud-native chunked reads:

<svg viewBox="0 0 720 260" role="img" aria-label="The four structural checks that decide whether a GeoTIFF qualifies as cloud-optimized" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>What the COG validator is actually asserting</title>
  <desc>Four structural properties: the header and tile index sit at the front of the file, the data is internally tiled rather than striped, an overview pyramid exists down to a small enough level, and the overviews are themselves tiled. A file can open cleanly in any reader and still fail all four, which is why the check belongs in the commit path rather than in a viewer.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <rect x="20" y="40" width="330" height="76" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="40" y="66" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">1 · header at the front</text>
  <text x="40" y="88" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">the IFD and tile index precede the pixel data,</text>
  <text x="40" y="104" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">so one request tells a client where everything is</text>
  <rect x="370" y="40" width="330" height="76" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="390" y="66" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">2 · internally tiled</text>
  <text x="390" y="88" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">512 × 512 blocks, not row strips —</text>
  <text x="390" y="104" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">a strip forces a full-width read for one window</text>
  <rect x="20" y="130" width="330" height="76" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="40" y="156" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">3 · overviews present</text>
  <text x="40" y="178" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">halving down to roughly 256 pixels, so a zoomed-out</text>
  <text x="40" y="194" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">view does not decode full resolution</text>
  <rect x="370" y="130" width="330" height="76" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="390" y="156" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">4 · overviews tiled too</text>
  <text x="390" y="178" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">the common near-miss: pyramids built, but written</text>
  <text x="390" y="194" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">as strips, so the zoomed-out view is still slow</text>
  <text x="360" y="238" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">a plain GeoTIFF opens fine everywhere and fails all four — which is why "it loads in QGIS" is not the test</text>
</svg>

```python
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import rasterio  # rasterio==1.3.10


def validate_cog(path: Path) -> bool:
    """Return True only if the file is a valid COG with tiling and overviews."""
    try:
        with rasterio.open(path) as src:
            is_tiled: bool = bool(src.profile.get("tiled", False))
            has_overviews: bool = len(src.overviews(1)) > 0
            if not is_tiled:
                print(f"  FAIL {path.name}: not internally tiled", file=sys.stderr)
            if not has_overviews:
                print(f"  FAIL {path.name}: no overviews", file=sys.stderr)
            return is_tiled and has_overviews
    except Exception as exc:
        print(f"  ERROR {path}: {exc}", file=sys.stderr)
        return False


def track_directory(data_dir: Path) -> None:
    """Validate all GeoTIFFs, then add the directory to DVC and commit."""
    if not data_dir.exists():
        raise FileNotFoundError(f"Directory not found: {data_dir}")

    tif_files = list(data_dir.glob("**/*.tif"))
    if not tif_files:
        raise RuntimeError(f"No .tif files found in {data_dir}")

    invalid = [f for f in tif_files if not validate_cog(f)]
    if invalid:
        print(f"{len(invalid)} file(s) failed COG validation — aborting.", file=sys.stderr)
        sys.exit(1)

    print(f"All {len(tif_files)} file(s) passed COG validation.")
    subprocess.run(["dvc", "add", str(data_dir)], check=True)
    subprocess.run(
        ["git", "add", f"{data_dir}.dvc", ".gitignore"], check=True
    )
    subprocess.run(
        ["git", "commit", "-m", f"Track {data_dir.name} with DVC"], check=True
    )
    print(f"Tracked and committed: {data_dir}")


if __name__ == "__main__":
    track_directory(Path("data/satellite_imagery"))
```

## Spatial Parameters and Format Flags Reference

| Parameter | Recommended value | Effect |
|---|---|---|
| `COMPRESS` (COG) | `DEFLATE` or `LZW` | Lossless; `DEFLATE` better for float bands |
| `BLOCKXSIZE` / `BLOCKYSIZE` | `512` | Matches typical S3 part size for range reads |
| `COPY_SRC_OVERVIEWS` | `YES` | Embeds multi-resolution pyramid; required for COG |
| Zarr chunk shape | `(1, 512, 512)` | Band × Y × X; aligns with GPU tile loaders |
| DVC cache type | `symlink` (Linux) | Avoids duplicate disk usage on cache hit |
| Remote transfer concurrency | `jobs=8` (via `dvc remote modify`) | Saturates typical gigabit egress |
| Storage CRS | [`EPSG:4326`](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) | Store native; reproject in a DVC pipeline stage |

The first time imagery is ingested, record the source CRS explicitly in a `dataset_metadata.json` sidecar committed to Git. This prevents silent CRS drift when future contributors add scenes from different acquisition providers. See [Preserving Metadata Across Dataset Versions](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/preserving-metadata-across-dataset-versions/) for a schema that captures acquisition timestamp, sensor type, and spatial resolution alongside the CRS.

## Common Errors and Fixes

`dvc push` hangs or times out on large files
: Root cause: default single-threaded upload. Fix: `dvc remote modify geospatial-remote jobs 8` to enable parallel multipart transfer.

`rasterio.errors.NotGeoreferencedWarning` during COG validation
: Root cause: the input file lacks a geotransform — the file has no embedded CRS. Fix: run `gdal_edit.py -a_srs EPSG:4326 input.tif` to embed the projection before conversion.

`.dvc` pointer file shows `md5: null`
: Root cause: `dvc add` was run before `dvc init` completed or the `.dvc/` directory is missing. Fix: confirm `git status` shows `.dvc/config` tracked, delete the broken `.dvc` file, and re-run `dvc add`.

`git commit` includes gigabyte-scale files instead of pointer
: Root cause: `.gitignore` was not updated by `dvc add` (possible permissions issue). Fix: manually verify that the imagery directory path appears in `.gitignore`, then re-stage and commit.

---

This workflow is one component of the broader [Implementing DVC for Geospatial Training Data](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/) guide, which covers multi-stage `dvc.yaml` orchestration, preprocessing locks, and experiment reproduction at scale.

**Related**

- [Implementing DVC for Geospatial Training Data](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/) — parent guide: DVC pipeline stages, remote auth, and `dvc repro` patterns
- [Preserving Metadata Across Dataset Versions](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/preserving-metadata-across-dataset-versions/) — keep CRS, geotransform, and acquisition timestamp in sync with binary snapshots
- [Tracking Annotation Changes with SHA Hashing](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/tracking-annotation-changes-with-sha-hashing/) — extend content-addressable hashing to GeoJSON and COCO annotation exports
- [Dataset Versioning & Spatial Data Sync](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/) — section overview covering the full versioning architecture
