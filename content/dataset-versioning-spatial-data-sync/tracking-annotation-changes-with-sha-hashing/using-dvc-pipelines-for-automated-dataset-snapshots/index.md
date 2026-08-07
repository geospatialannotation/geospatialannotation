---
title: "Using DVC Pipelines for Automated Dataset Snapshots"
description: "Define declarative DVC pipeline stages that validate CRS consistency, compute SHA-256 checksums, and archive geospatial annotations to content-addressable remote storage — eliminating manual version control bottlenecks in spatial ML workflows."
slug: using-dvc-pipelines-for-automated-dataset-snapshots
type: "tutorial"
breadcrumb:
  - label: "Dataset Versioning & Spatial Data Sync"
    url: "/dataset-versioning-spatial-data-sync/"
  - label: "Tracking Annotation Changes with SHA Hashing"
    url: "/dataset-versioning-spatial-data-sync/tracking-annotation-changes-with-sha-hashing/"
  - label: "Using DVC Pipelines for Automated Dataset Snapshots"
    url: "/dataset-versioning-spatial-data-sync/tracking-annotation-changes-with-sha-hashing/using-dvc-pipelines-for-automated-dataset-snapshots/"
datePublished: "2025-03-10"
dateModified: "2026-06-25"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Using DVC Pipelines for Automated Dataset Snapshots",
      "description": "Define declarative DVC pipeline stages that validate CRS consistency, compute SHA-256 checksums, and archive geospatial annotations to content-addressable remote storage.",
      "datePublished": "2025-03-10",
      "dateModified": "2026-06-25",
      "author": {"@type": "Organization", "name": "Geospatial Annotation"},
      "publisher": {"@type": "Organization", "name": "Geospatial Annotation"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Dataset Versioning & Spatial Data Sync", "item": "https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/"},
        {"@type": "ListItem", "position": 2, "name": "Tracking Annotation Changes with SHA Hashing", "item": "https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/tracking-annotation-changes-with-sha-hashing/"},
        {"@type": "ListItem", "position": 3, "name": "Using DVC Pipelines for Automated Dataset Snapshots", "item": "https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/tracking-annotation-changes-with-sha-hashing/using-dvc-pipelines-for-automated-dataset-snapshots/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Set Up DVC Pipelines for Automated Geospatial Dataset Snapshots",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Install dependencies and initialise DVC", "text": "Install DVC with S3/GCS/Azure extras and run dvc init in the project root."},
        {"@type": "HowToStep", "position": 2, "name": "Author dvc.yaml with a snapshot stage", "text": "Declare deps (raw annotations directory, validation script) and outs (Parquet snapshot, metadata.json) so DVC tracks content hashes automatically."},
        {"@type": "HowToStep", "position": 3, "name": "Write the validation and hashing script", "text": "Validate CRS and geometry for every GeoJSON file, compute SHA-256 per file, and write a Parquet manifest."},
        {"@type": "HowToStep", "position": 4, "name": "Configure remote storage and run the pipeline", "text": "Add an S3/GCS remote, run dvc repro, then dvc push to sync only changed chunks."},
        {"@type": "HowToStep", "position": 5, "name": "Integrate with CI/CD", "text": "Trigger dvc repro on pull requests that modify the data/ directory; gate merges on pipeline success."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "DVC repro reports 'stage is cached' but my GeoJSON changed — why?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "DVC caches on the SHA-256 digest of every listed dep. If you edited the file but dvc status still shows cached, the file's mtime changed without changing content, or you forgot to list it under deps. Run dvc status --verbose to compare stored vs current hashes."
          }
        },
        {
          "@type": "Question",
          "name": "How do I snapshot multi-gigabyte GeoTIFF rasters without filling local disk?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Use dvc add --external on the raster path so DVC records the hash in a .dvc pointer file without copying the data into the local .dvc/cache. Pair with dvc remote add --default pointing at S3 or GCS."
          }
        },
        {
          "@type": "Question",
          "name": "Can I snapshot datasets that span multiple CRS projections?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes. The validation script should normalise all inputs to a single target CRS (EPSG:4326 for interchange or a local metric CRS for IoU computation) before hashing, so the snapshot hash reflects a deterministic geometric state, not arbitrary projection choices."
          }
        }
      ]
    }
  ]
}
</script>

# Using DVC Pipelines for Automated Dataset Snapshots

A declarative `dvc.yaml` pipeline turns annotation archival from a manual chore into a reproducible, hash-gated stage. DVC normalises all inputs to a consistent [coordinate reference system](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) — by default `EPSG:4326` — validates spatial integrity, computes SHA-256 checksums for every changed asset, then pushes only the modified chunks to remote storage. The precise geometry, projection, and label schema used in each training run become permanently traceable without zip archives, timestamp-based backups, or guesswork.

## Why Annotation Drift Breaks Geospatial Training Pipelines

A single reprojected raster, shifted polygon vertex, or corrected `.prj` file can silently invalidate months of training metrics without triggering any Git diff on binary assets. Teams that version spatial data only via Git LFS hit two compounding problems: large binary blobs slow every clone, and LFS provides no built-in mechanism to assert geometric consistency before archival. The result is annotation drift — where the dataset a model was trained on differs from the dataset recorded in the experiment tracker, making rollback guesswork. [Tracking annotation changes with SHA hashing](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/tracking-annotation-changes-with-sha-hashing/) solves the detection problem; DVC pipelines solve the enforcement problem by making the hash check a mandatory gate before any output artifact is written.

## Step-by-Step DVC Pipeline Implementation

<svg viewBox="0 0 740 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="DVC snapshot pipeline: raw GeoJSON files flow through CRS validation, SHA-256 hashing, and Parquet manifest generation before being pushed to remote storage" style="width:100%;max-width:740px;height:auto;display:block;margin:1.5rem auto;">
  <title>DVC snapshot pipeline for geospatial annotations</title>
  <desc>Raw GeoJSON annotation files enter a DVC pipeline stage that validates CRS and geometry, computes SHA-256 checksums, writes a Parquet snapshot manifest, and pushes changed chunks to S3/GCS remote storage. Git receives only lightweight dvc.lock pointer files.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <defs>
    <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor"/>
    </marker>
  </defs>
  <!-- DVC stage boundary -->
  <rect x="178" y="18" width="470" height="32" rx="4" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="4,2"/>
  <text x="413" y="38" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="bold">DVC pipeline stage: snapshot_annotations</text>
  <!-- Bracket lines from stage boundary down to boxes -->
  <line x1="178" y1="50" x2="178" y2="92" stroke="currentColor" stroke-width="1" stroke-dasharray="3,2" opacity="0.5"/>
  <line x1="648" y1="50" x2="648" y2="132" stroke="currentColor" stroke-width="1" stroke-dasharray="3,2" opacity="0.5"/>
  <!-- Raw annotations -->
  <rect x="20" y="102" width="120" height="60" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="80" y="126" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">Raw GeoJSON</text>
  <text x="80" y="142" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">annotations/</text>
  <text x="80" y="157" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.7">data/raw/</text>
  <!-- Arrow 1 -->
  <line x1="140" y1="132" x2="178" y2="132" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr)"/>
  <!-- CRS + Geometry validation -->
  <rect x="178" y="92" width="130" height="80" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="243" y="120" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">CRS + Geometry</text>
  <text x="243" y="135" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">Validation</text>
  <text x="243" y="152" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.7">reproject → repair</text>
  <text x="243" y="166" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.7">EPSG:4326</text>
  <!-- Arrow 2 -->
  <line x1="308" y1="132" x2="346" y2="132" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr)"/>
  <!-- SHA-256 hashing -->
  <rect x="346" y="92" width="120" height="80" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="406" y="120" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">SHA-256</text>
  <text x="406" y="135" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">Hashing</text>
  <text x="406" y="152" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.7">per-file digest</text>
  <text x="406" y="166" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.7">+ pipeline hash</text>
  <!-- Arrow 3 -->
  <line x1="466" y1="132" x2="504" y2="132" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr)"/>
  <!-- Parquet snapshot -->
  <rect x="504" y="92" width="120" height="80" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="564" y="120" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">Parquet</text>
  <text x="564" y="135" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">Snapshot</text>
  <text x="564" y="152" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.7">latest_snapshot</text>
  <text x="564" y="166" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.7">.parquet</text>
  <!-- Arrow down to remote storage -->
  <line x1="564" y1="172" x2="564" y2="218" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr)"/>
  <!-- Remote storage -->
  <rect x="484" y="218" width="160" height="52" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5,3"/>
  <text x="564" y="240" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">S3 / GCS Remote</text>
  <text x="564" y="256" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.7">dvc push (changed chunks only)</text>
  <!-- Arrow down from validation stage to Git -->
  <line x1="243" y1="172" x2="243" y2="218" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr)"/>
  <!-- Git pointer -->
  <rect x="163" y="218" width="160" height="52" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5,3"/>
  <text x="243" y="240" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">Git repository</text>
  <text x="243" y="256" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.7">dvc.lock pointer files only</text>
</svg>

### Step 1 — Install DVC with Your Storage Backend

```bash
# S3 backend
pip install "dvc[s3]>=3.50.0"

# GCS backend
pip install "dvc[gs]>=3.50.0"

# Azure Blob backend
pip install "dvc[azure]>=3.50.0"

# Initialise inside your project root (alongside .git/)
dvc init
git add .dvc .dvcignore
git commit -m "chore: initialise DVC"
```

### Step 2 — Declare the Snapshot Pipeline Stage

Create `dvc.yaml` at the project root. The `deps` list is the contract DVC hashes; any change there triggers a re-run:

<svg viewBox="0 0 720 260" role="img" aria-label="A snapshot stage that only produces a new version when the content hash actually changed" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>A scheduled snapshot that mostly does nothing, on purpose</title>
  <desc>The nightly job hashes the validated annotations and compares against the last recorded manifest hash. When they match — most nights — it exits without producing a version, so the history stays readable. When they differ it validates, writes a new manifest, pushes the objects and tags the version.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <defs>
    <marker id="ds-arr" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor"/>
    </marker>
  </defs>
  <rect x="14" y="96" width="120" height="52" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="74" y="118" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">nightly trigger</text>
  <text x="74" y="136" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace" opacity="0.75">cron / CI schedule</text>
  <line x1="134" y1="122" x2="160" y2="122" stroke="currentColor" stroke-width="1.5" marker-end="url(#ds-arr)"/>
  <rect x="162" y="96" width="130" height="52" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="227" y="118" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">hash the tree</text>
  <text x="227" y="136" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">canonical, per feature</text>
  <line x1="292" y1="122" x2="318" y2="122" stroke="currentColor" stroke-width="1.5" marker-end="url(#ds-arr)"/>
  <rect x="320" y="96" width="150" height="52" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="395" y="118" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">same as last manifest?</text>
  <text x="395" y="136" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">one string comparison</text>
  <!-- yes -->
  <line x1="395" y1="96" x2="395" y2="64" stroke="currentColor" stroke-width="1.5" marker-end="url(#ds-arr)"/>
  <text x="403" y="82" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">yes</text>
  <rect x="300" y="24" width="190" height="38" rx="6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="5 3"/>
  <text x="395" y="48" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">exit 0, no version created</text>
  <!-- no -->
  <line x1="470" y1="122" x2="496" y2="122" stroke="currentColor" stroke-width="1.5" marker-end="url(#ds-arr)"/>
  <text x="483" y="112" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">no</text>
  <rect x="498" y="96" width="208" height="52" rx="6" fill="none" stroke="currentColor" stroke-width="2"/>
  <text x="602" y="118" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">validate → write manifest</text>
  <text x="602" y="136" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">→ push → tag</text>
  <text x="360" y="192" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">most nights take the dashed path, and that is the design working</text>
  <text x="360" y="214" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">a job that tags a version every night gives you 365 tags a year and no way to find the three that mattered</text>
  <text x="360" y="238" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">— the hash comparison is what makes the history worth reading</text>
</svg>

```yaml
# dvc.yaml
stages:
  snapshot_annotations:
    cmd: >-
      python scripts/validate_and_snapshot.py
        --input  data/raw/annotations/
        --output data/snapshots/
        --target-crs 4326
    deps:
      - data/raw/annotations/
      - scripts/validate_and_snapshot.py
    outs:
      - data/snapshots/latest_snapshot.parquet
      - data/snapshots/metadata.json
    metrics:
      - data/snapshots/pipeline_metrics.json:
          cache: false
```

Setting `cache: false` on the metrics file lets DVC track it in Git without pushing it to remote storage on every run.

### Step 3 — Write the Validation and Hashing Script

The script below normalises all input annotations to the requested target CRS before hashing, so the stored SHA-256 always reflects a deterministic geometric state rather than the arbitrary projection delivered by individual annotators.

```python
# scripts/validate_and_snapshot.py
"""
Validate CRS + geometry for every GeoJSON file in the input directory,
compute per-file SHA-256 hashes, and write a Parquet snapshot manifest.

Requirements:
    geopandas>=0.14.0
    pyproj>=3.6.0
    shapely>=2.0.0
    pandas>=2.1.0
    pyarrow>=14.0.0
"""
from __future__ import annotations

import argparse
import hashlib
import json
import logging
import pathlib
from datetime import datetime, timezone
from typing import Any

import geopandas as gpd
import pandas as pd

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
log = logging.getLogger(__name__)


def sha256_file(path: pathlib.Path) -> str:
    """Stream-hash a file without loading it fully into memory."""
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(65_536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_and_normalise(
    path: pathlib.Path,
    target_epsg: int,
) -> gpd.GeoDataFrame | None:
    """
    Load, validate, and reproject a GeoJSON annotation file.

    Returns None and logs a warning if the file cannot be safely processed.
    """
    try:
        gdf: gpd.GeoDataFrame = gpd.read_file(path)
    except Exception as exc:
        log.error("Cannot read %s: %s", path.name, exc)
        return None

    if gdf.crs is None:
        log.warning("No CRS declared in %s — skipping.", path.name)
        return None

    if gdf.crs.to_epsg() != target_epsg:
        log.info("Reprojecting %s → EPSG:%d", path.name, target_epsg)
        gdf = gdf.to_crs(epsg=target_epsg)

    invalid_mask = ~gdf.geometry.is_valid
    if invalid_mask.any():
        n = int(invalid_mask.sum())
        log.warning("Repairing %d invalid geometries in %s via buffer(0).", n, path.name)
        gdf.loc[invalid_mask, "geometry"] = (
            gdf.loc[invalid_mask, "geometry"].buffer(0)
        )
        still_invalid = ~gdf.geometry.is_valid
        if still_invalid.any():
            log.error(
                "%d geometries in %s could not be repaired — skipping file.",
                int(still_invalid.sum()),
                path.name,
            )
            return None

    return gdf


def main(input_dir: str, output_dir: str, target_crs: int) -> None:
    input_path = pathlib.Path(input_dir)
    output_path = pathlib.Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    if not input_path.is_dir():
        raise FileNotFoundError(f"Input directory not found: {input_path}")

    records: list[dict[str, Any]] = []

    for geojson in sorted(input_path.glob("*.geojson")):
        gdf = validate_and_normalise(geojson, target_crs)
        if gdf is None:
            continue

        file_hash = sha256_file(geojson)
        records.append(
            {
                "filename": geojson.name,
                "sha256": file_hash,
                "feature_count": len(gdf),
                "crs_epsg": target_crs,
                "geometry_types": sorted(gdf.geometry.geom_type.unique().tolist()),
                "snapshot_utc": datetime.now(timezone.utc).isoformat(),
            }
        )
        log.info("Processed %s  sha256=%s…", geojson.name, file_hash[:12])

    if not records:
        raise ValueError("No valid GeoJSON files were processed — aborting snapshot.")

    df = pd.DataFrame(records)
    parquet_path = output_path / "latest_snapshot.parquet"
    df.to_parquet(parquet_path, index=False)

    pipeline_hash = hashlib.sha256(
        json.dumps(records, sort_keys=True).encode()
    ).hexdigest()
    metadata: dict[str, Any] = {
        "schema_version": "1.1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_files": len(records),
        "target_crs_epsg": target_crs,
        "pipeline_hash": pipeline_hash,
    }
    (output_path / "metadata.json").write_text(
        json.dumps(metadata, indent=2), encoding="utf-8"
    )

    metrics: dict[str, Any] = {
        "files_processed": len(records),
        "total_features": int(df["feature_count"].sum()),
        "pipeline_hash": pipeline_hash,
    }
    (output_path / "pipeline_metrics.json").write_text(
        json.dumps(metrics, indent=2), encoding="utf-8"
    )

    log.info(
        "Snapshot complete: %d file(s) → %s  pipeline_hash=%s…",
        len(records),
        parquet_path,
        pipeline_hash[:12],
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Validate and snapshot geospatial annotations."
    )
    parser.add_argument("--input", required=True, help="Raw annotations directory")
    parser.add_argument("--output", required=True, help="Snapshot output directory")
    parser.add_argument(
        "--target-crs",
        type=int,
        default=4326,
        help="EPSG code to normalise all annotations to before hashing (default: 4326)",
    )
    args = parser.parse_args()
    main(args.input, args.output, args.target_crs)
```

### Step 4 — Configure Remote Storage and Run the Pipeline

```bash
# Add a versioned S3 prefix as the default DVC remote
dvc remote add -d spatial-remote s3://your-bucket/dvc-cache
dvc remote modify spatial-remote credentialpath ~/.aws/credentials

# Reproduce the pipeline (no-op if deps are unchanged)
dvc repro

# Push only the new/changed cache chunks to S3
dvc push

# Commit the lightweight .dvc lock files and metrics to Git
git add dvc.lock data/snapshots/pipeline_metrics.json
git commit -m "data: snapshot annotations v$(date +%Y%m%d)"
```

`dvc repro` checks every `dep` hash against what is stored in `dvc.lock`. If even one `.geojson` file or the validation script changes, the stage re-runs in full and produces a new set of output hashes. This keeps the repository under 1 MB while tracking terabytes of spatial data in the remote cache.

For raster assets such as multi-gigabyte GeoTIFF mosaics, avoid local cache bloat by using external tracking:

```bash
dvc add --external s3://your-bucket/raw-imagery/mosaic_2024.tif
```

DVC writes a `.dvc` pointer file containing only the hash — the binary never enters the local cache.

### Step 5 — Automate Snapshots in CI/CD

A GitHub Actions workflow that gates pull requests on pipeline success prevents annotation drift from reaching production training jobs. The `metadata.json` manifest output integrates with experiment trackers such as MLflow — see [Preserving Metadata Across Dataset Versions](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/preserving-metadata-across-dataset-versions/) for how to embed CRS, geometry type, and label schema into versioned manifests consumed by training scripts.

<svg viewBox="0 32 720 227" role="img" aria-label="Where the snapshot job runs and what each environment can and cannot reach" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>The credentials, not the code, decide where this can run</title>
  <desc>The same snapshot stage runs from a developer machine, from CI and from a scheduled runner. All three need read access to the annotation store and write access to the DVC remote, but only CI should hold the token that can push a tag to the default branch. Giving the scheduled runner that token is how an unreviewed dataset version reaches production.</desc>
  <rect x="0" y="32" width="720" height="227" style="fill:var(--bg)"/>
  <rect x="20" y="52" width="200" height="110" rx="6" fill="none" stroke="currentColor" stroke-width="1.4"/>
  <text x="120" y="76" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">developer machine</text>
  <text x="120" y="100" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">reads the store ✓</text>
  <text x="120" y="120" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">writes to the remote ✓</text>
  <text x="120" y="140" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">cannot tag the branch</text>
  <rect x="260" y="52" width="200" height="110" rx="6" fill="none" stroke="currentColor" stroke-width="2"/>
  <text x="360" y="76" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">CI, on a merged PR</text>
  <text x="360" y="100" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">reads the store ✓</text>
  <text x="360" y="120" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">writes to the remote ✓</text>
  <text x="360" y="140" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">tags the branch ✓</text>
  <rect x="500" y="52" width="200" height="110" rx="6" fill="none" stroke="currentColor" stroke-width="1.4"/>
  <text x="600" y="76" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">scheduled runner</text>
  <text x="600" y="100" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">reads the store ✓</text>
  <text x="600" y="120" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">writes to the remote ✓</text>
  <text x="600" y="140" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">opens a PR, does not tag</text>
  <text x="360" y="196" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">only the reviewed path holds the tagging token</text>
  <text x="360" y="220" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">a scheduled job that can tag will eventually publish a dataset version nobody looked at,</text>
  <text x="360" y="236" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">at 03:00, on the night the upstream export was broken</text>
</svg>

```yaml
# .github/workflows/annotation-snapshot.yml
name: Annotation Snapshot

on:
  pull_request:
    paths:
      - "data/raw/annotations/**"
      - "scripts/validate_and_snapshot.py"
      - "dvc.yaml"

jobs:
  snapshot:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"

      - name: Install dependencies
        run: pip install "dvc[s3]>=3.50.0" geopandas>=0.14.0 pyarrow>=14.0.0

      - name: Configure DVC remote
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.DVC_AWS_KEY }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.DVC_AWS_SECRET }}
        run: |
          dvc remote add -d spatial-remote s3://your-bucket/dvc-cache
          dvc pull --run-cache

      - name: Reproduce snapshot pipeline
        run: dvc repro --pull

      - name: Push updated cache artifacts
        if: github.event_name == 'push'
        run: dvc push
```

## Spatial Parameters and Pipeline Thresholds

| Parameter | Value | Purpose |
|---|---|---|
| `--target-crs` | `4326` (default) | EPSG code for normalisation before hashing |
| DVC remote type | `s3`, `gs`, `azure`, `ssh` | Backend for content-addressable cache |
| Chunk size (hash) | 65 536 bytes | Balances memory use and I/O throughput for large `.geojson` files |
| Parquet compression | snappy (pandas default) | Efficient columnar storage for the manifest |
| `cache: false` (metrics) | — | Keeps `pipeline_metrics.json` in Git rather than S3 |
| `--external` flag | on `.tif` paths | Avoids copying multi-GB rasters into local DVC cache |

## Common Errors and Fixes

`ERROR: No valid GeoJSON files processed.`
: Every file in `data/raw/annotations/` has a missing CRS or unrepairable geometries. Run `ogrinfo -al -so <file>.geojson` to confirm CRS is declared, and audit geometry health with `python -c "import geopandas as gpd; gdf=gpd.read_file('<file>'); print(gdf.geometry.is_valid.value_counts())"` before the pipeline run.

`dvc repro` reports `stage is cached` after editing a `.geojson` file
: DVC hashes file content, not modification time. If content did change, confirm the file is listed under `deps` in `dvc.yaml` — DVC tracks directories by recursively hashing their contents, so parent-directory entries usually resolve this. Run `dvc status --verbose` to compare stored vs current hashes.

`pyproj.exceptions.CRSError: Invalid projection`
: The annotation tool exported a `.geojson` with a non-standard or missing `crs` member. Use `pyproj.CRS.from_user_input(gdf.crs)` for a fuzzy match, or force `gdf.crs = pyproj.CRS.from_epsg(4326)` when the source CRS is known from project documentation.

`dvc push` transfers unchanged chunks repeatedly
: The remote is misconfigured with a path prefix that varies between runs (e.g. a date-stamped folder). Pin a stable `url` in `.dvc/config` and use `dvc gc --cloud -w` sparingly to prune truly unreferenced objects rather than deleting valid cache entries.

---

This workflow is one component of the broader [Tracking Annotation Changes with SHA Hashing](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/tracking-annotation-changes-with-sha-hashing/) strategy for deterministic spatial data lineage.

**Related**

- [Tracking Annotation Changes with SHA Hashing](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/tracking-annotation-changes-with-sha-hashing/) — parent: how SHA-256 digests surface annotation drift in geospatial datasets
- [Implementing DVC for Geospatial Training Data](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/) — full DVC setup for spatial ML, from remote config to `.dvc` file conventions
- [Preserving Metadata Across Dataset Versions](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/preserving-metadata-across-dataset-versions/) — embedding CRS, geometry type, and label schema into versioned manifests consumed by training scripts
- [Rollback Strategies for Corrupted Spatial Datasets](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/rollback-strategies-for-corrupted-spatial-datasets/) — recovering a known-good snapshot hash when a pipeline stage writes corrupt outputs
- [Dataset Versioning & Spatial Data Sync](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/) — content-addressable storage, rollback, and sync strategies across annotation environments
