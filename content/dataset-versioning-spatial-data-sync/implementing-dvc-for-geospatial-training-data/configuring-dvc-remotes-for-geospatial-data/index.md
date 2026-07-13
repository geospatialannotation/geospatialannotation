---
title: "Configuring DVC Remotes for Geospatial Data"
description: "Configure DVC remotes for large geospatial datasets on S3, GCS, and Azure — chunked uploads for multi-GB COGs, cache sharing, and credential handling — with the exact dvc remote commands."
slug: "configuring-dvc-remotes-for-geospatial-data"
type: "tutorial"
breadcrumb:
  - label: "Home"
    url: "/"
  - label: "Dataset Versioning & Spatial Data Sync"
    url: "/dataset-versioning-spatial-data-sync/"
  - label: "Implementing DVC for Geospatial Training Data"
    url: "/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/"
  - label: "Configuring DVC Remotes for Geospatial Data"
    url: "/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/configuring-dvc-remotes-for-geospatial-data/"
datePublished: "2026-07-13"
dateModified: "2026-07-13"
schema:
  - Article
  - BreadcrumbList
  - HowTo
  - FAQPage
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Configuring DVC Remotes for Geospatial Data",
      "description": "Configure DVC remotes for large geospatial datasets on S3, GCS, and Azure — chunked uploads for multi-GB COGs, cache sharing, and credential handling — with the exact dvc remote commands.",
      "datePublished": "2026-07-13",
      "dateModified": "2026-07-13",
      "author": {"@type": "Organization", "name": "Geospatial Annotation"},
      "publisher": {"@type": "Organization", "name": "Geospatial Annotation"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.geospatialannotation.com/"},
        {"@type": "ListItem", "position": 2, "name": "Dataset Versioning & Spatial Data Sync", "item": "https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/"},
        {"@type": "ListItem", "position": 3, "name": "Implementing DVC for Geospatial Training Data", "item": "https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/"},
        {"@type": "ListItem", "position": 4, "name": "Configuring DVC Remotes for Geospatial Data", "item": "https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/configuring-dvc-remotes-for-geospatial-data/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Configuring DVC Remotes for Geospatial Data",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Add an S3 remote tuned for multi-GB rasters", "text": "Run dvc remote add to register the bucket, then dvc remote modify to raise jobs for parallel chunked transfer and set endpointurl for S3-compatible object stores."},
        {"@type": "HowToStep", "position": 2, "name": "Add GCS and Azure remotes", "text": "Register a gs:// or azure:// URL with dvc remote add and set credentialpath, connection_string, or account_name so authentication happens without inline secrets."},
        {"@type": "HowToStep", "position": 3, "name": "Point a shared cache at fast local storage", "text": "Set cache.dir to a shared directory and cache.type to reflink or symlink so repeated Cloud-Optimized GeoTIFFs are not re-hashed or duplicated on checkout."},
        {"@type": "HowToStep", "position": 4, "name": "Handle credentials via environment or profile", "text": "Prefer AWS_PROFILE, GOOGLE_APPLICATION_CREDENTIALS, or Azure connection strings over values written into the tracked config, keeping secrets out of git."},
        {"@type": "HowToStep", "position": 5, "name": "Verify connectivity before a large push", "text": "Run a Python helper that opens the configured filesystem and lists the remote prefix, confirming credentials and endpoint resolve before transferring hundreds of gigabytes."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "How do I speed up DVC push for multi-GB Cloud-Optimized GeoTIFFs?",
          "acceptedAnswer": {"@type": "Answer", "text": "Raise the jobs setting with dvc remote modify to run more parallel connections — 8 to 16 is a sensible band for large rasters on a fast link. DVC and its S3/GCS/Azure backends chunk each file into multipart segments, so higher concurrency mainly helps when you push many COGs at once. If a single 20 GB file dominates, also enable multipart tuning on the underlying object store rather than expecting jobs alone to help."}
        },
        {
          "@type": "Question",
          "name": "Where should DVC store credentials for a geospatial remote?",
          "acceptedAnswer": {"@type": "Answer", "text": "Keep secrets out of the tracked .dvc/config. Use dvc remote modify --local for values that must live on disk, and prefer environment-driven auth: AWS_PROFILE or an instance role for S3, GOOGLE_APPLICATION_CREDENTIALS for GCS, and AZURE_STORAGE_CONNECTION_STRING for Azure. This keeps API keys out of git history while letting every teammate resolve the same bucket."}
        },
        {
          "@type": "Question",
          "name": "Why does DVC re-hash my entire imagery dataset on every checkout?",
          "acceptedAnswer": {"@type": "Answer", "text": "By default DVC copies files into the workspace and hashes them, which is slow for terabytes of rasters. Set cache.type to reflink or symlink and point cache.dir at a shared directory on the same filesystem as the workspace. Reflinks give copy-on-write behaviour with no re-hashing, and a shared cache means multiple checkouts of the same COG never duplicate bytes."}
        },
        {
          "@type": "Question",
          "name": "Can DVC use an S3-compatible store like MinIO or Cloudflare R2?",
          "acceptedAnswer": {"@type": "Answer", "text": "Yes. Register the bucket as an s3:// remote and set endpointurl with dvc remote modify to the provider URL. The S3 driver then talks to any compatible API, so on-prem MinIO, Cloudflare R2, and Wasabi all work with the same commands used for AWS S3."}
        }
      ]
    }
  ]
}
</script>

# Configuring DVC Remotes for Geospatial Data

To version terabytes of satellite and drone imagery without stalling your team, configure a [DVC](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/) remote — on S3, Google Cloud Storage, or Azure Blob — that is tuned for multi-gigabyte Cloud-Optimized GeoTIFFs rather than the small text files DVC ships defaults for. Three settings carry the load: raise `jobs` so DVC transfers file chunks in parallel, point a shared `cache.dir` with a reflink or symlink `cache.type` at fast local storage so huge rasters are never re-hashed or duplicated, and resolve credentials through environment variables or a cloud profile instead of writing keys into tracked config. The entire configuration is two commands — `dvc remote add` to register the bucket and `dvc remote modify` to tune it.

## Why Remote Tuning Decides Whether Versioning Scales

DVC's defaults are built for a repository of code and small artifacts, where a naive copy-and-hash checkout costs nothing. Geospatial training data breaks those assumptions. A single mosaic can exceed 20 GB, an annotated tile set can run to hundreds of thousands of COGs, and a working copy of the dataset may not fit twice on one disk. Left untuned, `dvc push` opens too few connections and crawls across a link that could saturate, while `dvc checkout` copies every raster into the workspace and computes a fresh content hash on each one — turning a five-minute pull into an hour.

The fix is to align three layers with the shape of the data. Parallelism (`jobs`) matches transfer concurrency to the many-large-files profile. A shared cache with reflinks eliminates redundant copies and re-hashing so identical imagery costs disk space once. And credential handling through profiles keeps long-lived keys out of the config that every collaborator clones. Get these right once and the same remote serves an [annotation team](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/qgis-plugin-ecosystem-for-annotation-teams/) across sites; get them wrong and every pull is a bottleneck.

<svg viewBox="0 0 720 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Diagram of a local DVC cache exchanging chunked Cloud-Optimized GeoTIFFs in parallel with an S3, GCS, or Azure remote" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>Chunked parallel transfer between a local DVC cache and a cloud remote</title>
  <desc>On the left, a local shared cache holds content-addressed COG blobs. In the centre, four parallel transfer lanes carry file chunks. On the right, an object-store remote labelled S3, GCS, or Azure receives the chunks. The jobs setting controls how many lanes run at once.</desc>
  <defs>
    <marker id="arrowRight" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto">
      <polygon points="0 0, 9 3.5, 0 7" fill="currentColor" opacity="0.55"/>
    </marker>
    <marker id="arrowLeft" markerWidth="9" markerHeight="7" refX="1" refY="3.5" orient="auto">
      <polygon points="9 0, 0 3.5, 9 7" fill="currentColor" opacity="0.55"/>
    </marker>
  </defs>
  <!-- Local cache -->
  <rect x="16" y="70" width="150" height="160" rx="8" fill="currentColor" fill-opacity="0.05" stroke="currentColor" stroke-width="1.5" stroke-opacity="0.5"/>
  <text x="91" y="60" text-anchor="middle" font-size="12" fill="currentColor" opacity="0.85" font-family="sans-serif" font-weight="bold">Local shared cache</text>
  <text x="91" y="248" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.5" font-family="sans-serif">cache.dir + reflink</text>
  <rect x="34" y="90" width="52" height="30" rx="3" fill="currentColor" fill-opacity="0.12" stroke="currentColor" stroke-width="1" stroke-opacity="0.5"/>
  <rect x="96" y="90" width="52" height="30" rx="3" fill="currentColor" fill-opacity="0.12" stroke="currentColor" stroke-width="1" stroke-opacity="0.5"/>
  <rect x="34" y="128" width="52" height="30" rx="3" fill="currentColor" fill-opacity="0.12" stroke="currentColor" stroke-width="1" stroke-opacity="0.5"/>
  <rect x="96" y="128" width="52" height="30" rx="3" fill="currentColor" fill-opacity="0.12" stroke="currentColor" stroke-width="1" stroke-opacity="0.5"/>
  <text x="91" y="182" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.55" font-family="sans-serif">COG blobs (md5)</text>
  <!-- Transfer lanes -->
  <text x="360" y="60" text-anchor="middle" font-size="12" fill="currentColor" opacity="0.85" font-family="sans-serif" font-weight="bold">Chunked parallel transfer</text>
  <line x1="170" y1="100" x2="548" y2="100" stroke="currentColor" stroke-width="1.5" stroke-opacity="0.45" marker-end="url(#arrowRight)"/>
  <line x1="170" y1="132" x2="548" y2="132" stroke="currentColor" stroke-width="1.5" stroke-opacity="0.45" marker-end="url(#arrowRight)"/>
  <line x1="548" y1="168" x2="170" y2="168" stroke="currentColor" stroke-width="1.5" stroke-opacity="0.45" marker-end="url(#arrowLeft)"/>
  <line x1="170" y1="200" x2="548" y2="200" stroke="currentColor" stroke-width="1.5" stroke-opacity="0.45" marker-end="url(#arrowRight)"/>
  <rect x="300" y="90" width="26" height="20" rx="2" fill="currentColor" fill-opacity="0.18"/>
  <rect x="360" y="122" width="26" height="20" rx="2" fill="currentColor" fill-opacity="0.18"/>
  <rect x="330" y="190" width="26" height="20" rx="2" fill="currentColor" fill-opacity="0.18"/>
  <text x="360" y="232" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.5" font-family="sans-serif">jobs = concurrent lanes (push / pull)</text>
  <!-- Remote -->
  <rect x="554" y="70" width="150" height="160" rx="8" fill="currentColor" fill-opacity="0.05" stroke="currentColor" stroke-width="1.5" stroke-opacity="0.5"/>
  <text x="629" y="60" text-anchor="middle" font-size="12" fill="currentColor" opacity="0.85" font-family="sans-serif" font-weight="bold">Cloud remote</text>
  <text x="629" y="128" text-anchor="middle" font-size="12" fill="currentColor" opacity="0.8" font-family="sans-serif" font-weight="bold">S3 · GCS · Azure</text>
  <text x="629" y="150" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.55" font-family="sans-serif">object store bucket</text>
  <text x="629" y="248" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.5" font-family="sans-serif">creds via env / profile</text>
</svg>

## Step-by-Step Remote Configuration

Install a DVC build with the cloud extras you need. The extras pull in the S3, GCS, and Azure drivers:

```bash
pip install "dvc[s3]==3.55.2" "dvc[gs]==3.55.2" "dvc[azure]==3.55.2"
```

Initialise DVC in the repository if you have not already, then add a remote. Every command below assumes you run it from the repository root.

### Step 1 — Add and Tune an S3 Remote

Register the bucket, mark it the default, then modify it for large-raster throughput. `jobs` sets the number of parallel transfer connections; `endpointurl` lets the same command target any S3-compatible store such as MinIO or Cloudflare R2:

```bash
dvc remote add -d s3store s3://geo-training-datasets/dvc
dvc remote modify s3store jobs 12
dvc remote modify s3store endpointurl https://s3.eu-central-1.amazonaws.com
```

Set credentials without writing them into the tracked config. Prefer an AWS profile or an instance role; use `--local` only when a value must live on disk:

```bash
export AWS_PROFILE=geo-annotation
dvc remote modify --local s3store profile geo-annotation
```

### Step 2 — Add a GCS Remote

Google Cloud Storage uses a service-account key. Point DVC at it through `GOOGLE_APPLICATION_CREDENTIALS` and keep the path in local-only config:

```bash
dvc remote add gcsstore gs://geo-training-datasets/dvc
dvc remote modify gcsstore jobs 12
dvc remote modify --local gcsstore credentialpath /secrets/geo-sa.json
```

### Step 3 — Add an Azure Blob Remote

Azure authenticates with an account name plus a connection string. Store the connection string locally or, better, in the `AZURE_STORAGE_CONNECTION_STRING` environment variable:

```bash
dvc remote add azstore azure://geo-container/dvc
dvc remote modify azstore jobs 12
dvc remote modify azstore account_name geotrainingdata
dvc remote modify --local azstore connection_string "$AZURE_STORAGE_CONNECTION_STRING"
```

### Step 4 — Configure a Shared Cache for Rasters

The cache is where the real geospatial savings live. Point `cache.dir` at fast local storage on the same filesystem as your workspace, and set `cache.type` so checkouts link rather than copy. `reflink` gives copy-on-write with no re-hashing on filesystems that support it (XFS, Btrfs, APFS); `symlink` is the portable fallback:

```bash
dvc cache dir /data/dvc-cache
dvc config cache.type "reflink,symlink,copy"
dvc config cache.shared group
```

The comma-separated `cache.type` list makes DVC try each strategy in order and fall back gracefully. `cache.shared group` sets group-writable permissions so several users on a shared annotation box reuse one cache instead of each holding a private copy of every COG.

### Step 5 — Verify Connectivity Before a Large Push

Before pushing hundreds of gigabytes, confirm the remote resolves. DVC exposes its configured filesystems through the `DVCFileSystem` and remote API, so a short Python 3.10+ helper can open the target and list a prefix — surfacing a credential or endpoint error in seconds rather than after a half-finished transfer:

```python
from __future__ import annotations

from dvc.repo import Repo


def verify_remote(remote_name: str, prefix: str = "", limit: int = 10) -> list[str]:
    """List objects under a DVC remote to confirm credentials and endpoint resolve.

    Args:
        remote_name: Name passed to `dvc remote add` (e.g. "s3store").
        prefix: Optional sub-path within the remote to list.
        limit: Maximum number of entries to return.

    Returns:
        A list of object paths found on the remote (may be empty on a fresh bucket).
    """
    repo: Repo = Repo(".")
    fs = repo.cloud.get_remote_odb(remote_name).fs
    base: str = repo.cloud.get_remote_odb(remote_name).path
    target: str = f"{base.rstrip('/')}/{prefix.lstrip('/')}" if prefix else base

    entries: list[str] = []
    for path in fs.find(target, detail=False):
        entries.append(str(path))
        if len(entries) >= limit:
            break
    return entries


if __name__ == "__main__":
    found = verify_remote("s3store")
    print(f"Reachable — {len(found)} object(s) sampled from remote")
    for item in found:
        print(f"  {item}")
```

If this prints without raising, credentials and endpoint are valid and `dvc push` will proceed against a live target.

## Recommended Settings for Large Rasters

The table maps each remote to the exact `add`/`modify` keys that matter for multi-GB geospatial files, with the reasoning behind each choice.

| Remote | `dvc remote add` URL | Key `dvc remote modify` keys | Notes for large geospatial files |
|---|---|---|---|
| Amazon S3 | `s3://bucket/dvc` | `jobs`, `endpointurl`, `profile`, `region` | Raise `jobs` to 8–16 for many COGs; set `endpointurl` for MinIO / R2 / Wasabi; auth via `AWS_PROFILE` or instance role, never inline keys |
| Google Cloud Storage | `gs://bucket/dvc` | `jobs`, `credentialpath`, `projectname` | Use a service-account key via `GOOGLE_APPLICATION_CREDENTIALS`; regional bucket co-located with compute avoids egress on every pull |
| Azure Blob | `azure://container/dvc` | `jobs`, `account_name`, `connection_string` | Prefer `AZURE_STORAGE_CONNECTION_STRING` env var; block-blob multipart handles 20 GB+ mosaics without special flags |
| Shared cache (all) | `dvc cache dir /data/dvc-cache` | `cache.type`, `cache.shared` | `reflink,symlink,copy` avoids re-hashing terabytes; keep cache on the same filesystem as the workspace so links resolve |

A practical baseline for an imagery pipeline: `jobs 12`, `cache.type reflink,symlink,copy`, credentials from the environment, and the bucket in the same cloud region as your training compute. Preserving the acquisition and CRS metadata alongside these blobs is a separate concern covered in [preserving metadata across dataset versions](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/preserving-metadata-across-dataset-versions/).

## Common Errors and Fixes

**`Unable to locate credentials` / `403 Forbidden` on `dvc push`**
Root cause: DVC found the remote URL but no valid credentials, usually because a key was expected in the tracked config that was never committed (correctly, since secrets do not belong there).
Fix: export `AWS_PROFILE`, `GOOGLE_APPLICATION_CREDENTIALS`, or `AZURE_STORAGE_CONNECTION_STRING`, or set the value with `dvc remote modify --local` so it lands in `.dvc/config.local` outside git.

**`dvc push` saturates only a fraction of available bandwidth**
Root cause: default `jobs` is too low for a workload of many large rasters, so most of the link sits idle.
Fix: `dvc remote modify <name> jobs 12` (or higher on a fast link). If one enormous file dominates, the win is bounded by that single multipart upload — split monolithic mosaics into tiles so parallelism has files to spread across.

**`checkout` is slow and the workspace uses double the disk**
Root cause: `cache.type` is left at the `copy` default, so every COG is duplicated into the workspace and re-hashed.
Fix: `dvc config cache.type "reflink,symlink,copy"` and ensure `cache.dir` is on the same filesystem as the workspace — reflinks and symlinks cannot cross a filesystem boundary and DVC silently falls back to copying when they do.

**`failed to create symlink` / broken links on Windows or a network mount**
Root cause: symlink support is unavailable or requires elevated privileges, and the cache sits on a different volume than the checkout.
Fix: move the cache to the same volume as the workspace, or drop `symlink` from the `cache.type` list and rely on `reflink,copy`. On Windows, enable Developer Mode or run the shell elevated so symlink creation is permitted.

## Related

- [Implementing DVC for Geospatial Training Data](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/) — the broader guide to initialising DVC, structuring stages, and versioning imagery that this remote configuration plugs into
- [Integrating STAC Catalogs with Versioned Datasets](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/integrating-stac-catalogs-with-versioned-datasets/) — map each versioned snapshot on your remote back to STAC items so acquisition metadata and spatiotemporal queries stay reproducible
- [Syncing Annotations Across Cloud Remotes](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/syncing-annotations-across-cloud-remotes/) — keep labels consistent once several sites push to the same S3, GCS, or Azure remote, with conflict detection and content-addressed sync
- [How to Version Control Large Satellite Imagery Datasets](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/how-to-version-control-large-satellite-imagery-datasets/) — companion walkthrough for tracking terabyte-scale imagery once the remote is in place

This guide is part of the broader [Implementing DVC for Geospatial Training Data](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/) topic area within [Dataset Versioning & Spatial Data Sync](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/).
