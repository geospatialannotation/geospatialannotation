---
title: "Integrating STAC Catalogs with Versioned Datasets"
description: "Bridge a STAC catalog with DVC-tracked training data so every versioned dataset snapshot maps back to STAC items, preserving acquisition metadata and enabling reproducible spatiotemporal queries."
slug: "integrating-stac-catalogs-with-versioned-datasets"
type: "long_tail"
breadcrumb:
  - label: "Home"
    url: "/"
  - label: "Dataset Versioning & Spatial Data Sync"
    url: "/dataset-versioning-spatial-data-sync/"
  - label: "Implementing DVC for Geospatial Training Data"
    url: "/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/"
  - label: "Integrating STAC Catalogs with Versioned Datasets"
    url: "/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/integrating-stac-catalogs-with-versioned-datasets/"
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
      "headline": "Integrating STAC Catalogs with Versioned Datasets",
      "description": "Bridge a STAC catalog with DVC-tracked training data so every versioned dataset snapshot maps back to STAC items, preserving acquisition metadata and enabling reproducible spatiotemporal queries.",
      "datePublished": "2026-07-13",
      "dateModified": "2026-07-13",
      "author": {"@type": "Organization", "name": "Geospatial Annotation"},
      "publisher": {"@type": "Organization", "name": "Geospatial Annotation"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://geospatialannotation.com/"},
        {"@type": "ListItem", "position": 2, "name": "Dataset Versioning & Spatial Data Sync", "item": "https://geospatialannotation.com/dataset-versioning-spatial-data-sync/"},
        {"@type": "ListItem", "position": 3, "name": "Implementing DVC for Geospatial Training Data", "item": "https://geospatialannotation.com/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/"},
        {"@type": "ListItem", "position": 4, "name": "Integrating STAC Catalogs with Versioned Datasets", "item": "https://geospatialannotation.com/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/integrating-stac-catalogs-with-versioned-datasets/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Integrating STAC Catalogs with Versioned Datasets",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Open the STAC catalog", "text": "Load the root catalog with pystac.Catalog.from_file and walk its items so every asset that could enter the training set is enumerated from acquisition metadata rather than from a directory listing."},
        {"@type": "HowToStep", "position": 2, "name": "Select items by bbox and datetime", "text": "Filter the catalog items by a spatial bounding box and an acquisition datetime window so the snapshot is a deterministic spatiotemporal query rather than an ad-hoc file copy."},
        {"@type": "HowToStep", "position": 3, "name": "Record item ids and self hrefs into a manifest", "text": "Write the selected STAC item ids, their self hrefs, and the query parameters into a JSON manifest that fully describes the provenance of the snapshot."},
        {"@type": "HowToStep", "position": 4, "name": "Hash the manifest", "text": "Compute a SHA-256 digest over the canonicalised manifest so any change to the item set, hrefs, or query produces a different, verifiable catalog hash."},
        {"@type": "HowToStep", "position": 5, "name": "Tie the manifest into DVC", "text": "Track the manifest file with dvc add and commit the generated .dvc pointer to git so the exact STAC-derived dataset composition is reproducible at any revision."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why store STAC item ids in the dataset manifest instead of just the image files?",
          "acceptedAnswer": {"@type": "Answer", "text": "Image files alone lose the acquisition context — sensor, cloud cover, datetime, and CRS — that determines whether a training set is comparable across versions. Storing the STAC item ids and their self hrefs pins each snapshot back to the catalog record, so you can re-run the exact spatiotemporal query, audit why a scene was included, and detect when an upstream item was revised or withdrawn."}
        },
        {
          "@type": "Question",
          "name": "What does the catalog hash protect against?",
          "acceptedAnswer": {"@type": "Answer", "text": "The catalog hash is a SHA-256 digest over the canonicalised list of selected item ids, hrefs, and query parameters. It detects silent drift: if an upstream STAC provider re-processes a scene, changes an asset href, or if your bbox/datetime filter is altered, the hash changes and DVC surfaces the difference. A matching hash is positive proof that two dataset versions were built from the identical set of acquisition records."}
        },
        {
          "@type": "Question",
          "name": "Does DVC need to store the imagery itself, or just the manifest?",
          "acceptedAnswer": {"@type": "Answer", "text": "You can do either. The lightweight pattern tracks only the manifest with dvc add, keeping the multi-gigabyte COGs on their original STAC-hosted remote and rehydrating on demand from the recorded hrefs. The self-contained pattern also imports the assets into a DVC remote so the snapshot survives even if the upstream catalog disappears. Most teams track the manifest in git-plus-DVC and mirror only the assets they cannot re-fetch."}
        },
        {
          "@type": "Question",
          "name": "How do I reproduce a training set from an old dataset version?",
          "acceptedAnswer": {"@type": "Answer", "text": "Check out the git revision, run dvc checkout to restore the manifest, then re-read the recorded item ids and self hrefs to rehydrate the assets. Verify the recomputed catalog hash matches the value stored in the manifest before training; a mismatch means an upstream item changed and the snapshot is no longer bit-identical to the original."}
        }
      ]
    }
  ]
}
</script>

# Integrating STAC Catalogs with Versioned Datasets

A versioned training set is only reproducible if you can prove which source scenes it was built from. Pinning each snapshot to its exact acquisition records means storing the STAC item ids plus a catalog hash inside a dataset manifest that [DVC versioning](/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/) tracks. The manifest records the SpatioTemporal Asset Catalog (STAC) items a snapshot draws from — their ids, their `self` hrefs, and the spatial and temporal query that selected them — then hashes that list so any drift is detectable. With this bridge in place, any training set is reproducible back to its acquisition metadata, and the same spatiotemporal query can be re-run to rebuild or extend the dataset months later.

## Why Acquisition Provenance Belongs in the Version Record

Geospatial training data is derived data. The imagery a model learns from is a filtered slice of a much larger archive, selected by area of interest, date range, sensor, and cloud cover. If a dataset version records only the resulting files, it throws away the query that produced them — and with it, any ability to explain why one scene was included and another dropped, or to reproduce the selection when the archive grows. A directory of GeoTIFFs cannot answer "was this the June 2025 cloud-free Sentinel-2 pass or the July re-processing?"

STAC solves the description problem: it is a JSON specification where each **item** describes one spatiotemporal asset (a scene) with its geometry, datetime, and links to the underlying files. What STAC does not solve is *version binding* — nothing in a raw catalog ties a specific training snapshot to a specific set of items at a specific moment. That binding is what the manifest supplies. By recording item ids and a hash of the selection inside a DVC-tracked file, you turn an ephemeral query into a durable, verifiable part of the version record. When an upstream provider re-processes a scene and quietly changes an asset href, the recomputed hash no longer matches and the difference surfaces in `dvc status` instead of corrupting a downstream model months later.

<svg viewBox="0 0 720 260" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Data-flow diagram: a STAC catalog of items is filtered by a spatiotemporal query into a selection, recorded as a dataset manifest of item ids and a catalog hash, which DVC tracks as a version" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>From STAC catalog to DVC-tracked dataset version</title>
  <desc>Four stages flow left to right. A STAC catalog containing multiple items is filtered by a bounding box and datetime query into a smaller selection. The selection is written to a dataset manifest holding item ids and a catalog hash. DVC then tracks the manifest as an immutable version pointer committed to git.</desc>
  <defs>
    <marker id="arrow" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto">
      <polygon points="0 0, 9 3.5, 0 7" fill="currentColor" opacity="0.5"/>
    </marker>
  </defs>
  <!-- Stage 1: STAC catalog -->
  <rect x="12" y="52" width="150" height="150" rx="8" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>
  <text x="87" y="42" text-anchor="middle" font-size="12" fill="currentColor" opacity="0.85" font-family="sans-serif" font-weight="bold">STAC catalog</text>
  <rect x="28" y="68" width="118" height="20" rx="3" fill="currentColor" opacity="0.10" stroke="currentColor" stroke-width="1" stroke-opacity="0.4"/>
  <text x="87" y="82" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.7" font-family="sans-serif">item S2_0612</text>
  <rect x="28" y="94" width="118" height="20" rx="3" fill="currentColor" opacity="0.20" stroke="currentColor" stroke-width="1" stroke-opacity="0.5"/>
  <text x="87" y="108" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.85" font-family="sans-serif">item S2_0615</text>
  <rect x="28" y="120" width="118" height="20" rx="3" fill="currentColor" opacity="0.10" stroke="currentColor" stroke-width="1" stroke-opacity="0.4"/>
  <text x="87" y="134" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.7" font-family="sans-serif">item S2_0701</text>
  <rect x="28" y="146" width="118" height="20" rx="3" fill="currentColor" opacity="0.20" stroke="currentColor" stroke-width="1" stroke-opacity="0.5"/>
  <text x="87" y="160" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.85" font-family="sans-serif">item S2_0704</text>
  <text x="87" y="184" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.45" font-family="sans-serif">…many items</text>
  <!-- Arrow 1 -->
  <line x1="164" y1="127" x2="196" y2="127" stroke="currentColor" stroke-width="1.5" opacity="0.5" marker-end="url(#arrow)"/>
  <text x="180" y="118" text-anchor="middle" font-size="8" fill="currentColor" opacity="0.5" font-family="sans-serif">bbox +</text>
  <text x="180" y="146" text-anchor="middle" font-size="8" fill="currentColor" opacity="0.5" font-family="sans-serif">datetime</text>
  <!-- Stage 2: Selection -->
  <rect x="200" y="82" width="130" height="90" rx="8" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>
  <text x="265" y="72" text-anchor="middle" font-size="12" fill="currentColor" opacity="0.85" font-family="sans-serif" font-weight="bold">Selection</text>
  <rect x="214" y="96" width="102" height="18" rx="3" fill="currentColor" opacity="0.20" stroke="currentColor" stroke-width="1" stroke-opacity="0.5"/>
  <text x="265" y="109" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.85" font-family="sans-serif">S2_0615</text>
  <rect x="214" y="118" width="102" height="18" rx="3" fill="currentColor" opacity="0.20" stroke="currentColor" stroke-width="1" stroke-opacity="0.5"/>
  <text x="265" y="131" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.85" font-family="sans-serif">S2_0704</text>
  <text x="265" y="156" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.5" font-family="sans-serif">query matches</text>
  <!-- Arrow 2 -->
  <line x1="332" y1="127" x2="364" y2="127" stroke="currentColor" stroke-width="1.5" opacity="0.5" marker-end="url(#arrow)"/>
  <!-- Stage 3: Manifest -->
  <rect x="368" y="62" width="176" height="130" rx="8" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>
  <text x="456" y="52" text-anchor="middle" font-size="12" fill="currentColor" opacity="0.85" font-family="sans-serif" font-weight="bold">Dataset manifest</text>
  <text x="382" y="86" font-size="9" fill="currentColor" opacity="0.7" font-family="monospace">item_ids: [</text>
  <text x="392" y="102" font-size="9" fill="currentColor" opacity="0.7" font-family="monospace">"S2_0615",</text>
  <text x="392" y="116" font-size="9" fill="currentColor" opacity="0.7" font-family="monospace">"S2_0704" ]</text>
  <text x="382" y="134" font-size="9" fill="currentColor" opacity="0.7" font-family="monospace">self_hrefs: […]</text>
  <rect x="380" y="146" width="152" height="34" rx="4" fill="currentColor" opacity="0.12" stroke="currentColor" stroke-width="1" stroke-opacity="0.5"/>
  <text x="456" y="160" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.85" font-family="monospace">catalog_hash:</text>
  <text x="456" y="173" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.85" font-family="monospace">sha256:9f3a…</text>
  <!-- Arrow 3 -->
  <line x1="546" y1="127" x2="578" y2="127" stroke="currentColor" stroke-width="1.5" opacity="0.5" marker-end="url(#arrow)"/>
  <text x="562" y="118" text-anchor="middle" font-size="8" fill="currentColor" opacity="0.5" font-family="sans-serif">dvc</text>
  <text x="562" y="146" text-anchor="middle" font-size="8" fill="currentColor" opacity="0.5" font-family="sans-serif">add</text>
  <!-- Stage 4: DVC version -->
  <rect x="582" y="82" width="126" height="90" rx="8" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>
  <text x="645" y="72" text-anchor="middle" font-size="12" fill="currentColor" opacity="0.85" font-family="sans-serif" font-weight="bold">DVC version</text>
  <rect x="596" y="96" width="98" height="20" rx="3" fill="currentColor" opacity="0.15" stroke="currentColor" stroke-width="1" stroke-opacity="0.5"/>
  <text x="645" y="110" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.8" font-family="monospace">.dvc pointer</text>
  <text x="645" y="136" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.6" font-family="sans-serif">committed to git</text>
  <text x="645" y="152" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.5" font-family="sans-serif">reproducible</text>
</svg>

## Reading the Catalog and Selecting Items

Install the tooling with pinned versions so the manifest is byte-stable across machines:

```bash
pip install pystac==1.9.0 shapely==2.0.6 python-dateutil==2.9.0
```

STAC items carry geometry in `EPSG:4326` by convention, so the bounding-box filter below operates in decimal degrees. If your area of interest is expressed in a metric [coordinate reference system](/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/), reproject it to WGS84 before filtering. The first stage walks the catalog and applies a spatial and temporal predicate:

```python
from __future__ import annotations

from datetime import datetime, timezone

import pystac
from shapely.geometry import box, shape


def select_items(
    catalog_href: str,
    bbox: tuple[float, float, float, float],
    start: datetime,
    end: datetime,
) -> list[pystac.Item]:
    """Return catalog items whose footprint intersects `bbox`
    (minx, miny, maxx, maxy, in EPSG:4326) and whose acquisition
    datetime falls within [start, end]."""
    catalog: pystac.Catalog = pystac.Catalog.from_file(catalog_href)
    aoi = box(*bbox)
    matches: list[pystac.Item] = []

    for item in catalog.get_items(recursive=True):
        dt: datetime | None = item.datetime
        if dt is None:
            continue
        if not (start <= dt <= end):
            continue
        if shape(item.geometry).intersects(aoi):
            matches.append(item)

    # Deterministic ordering is essential for a stable hash.
    matches.sort(key=lambda it: it.id)
    return matches
```

The `matches.sort()` call is not cosmetic: STAC iteration order is not guaranteed, and an unordered list would hash differently on each run even for the identical selection. Sorting by item id makes the downstream digest deterministic.

## Recording Item Ids and Self Hrefs into a Manifest

The manifest is the durable artifact. It stores the query that produced the snapshot, the selected item ids, and each item's `self` href — the canonical link back to its catalog record — so the selection can be replayed or audited without re-scanning the whole catalog:

```python
import json
from typing import Any


def build_manifest(
    items: list[pystac.Item],
    bbox: tuple[float, float, float, float],
    start: datetime,
    end: datetime,
) -> dict[str, Any]:
    """Assemble a provenance manifest for the selected STAC items."""
    records: list[dict[str, str]] = []
    for item in items:
        self_link = item.get_single_link("self")
        href = self_link.href if self_link is not None else ""
        records.append({"id": item.id, "self_href": href})

    return {
        "query": {
            "bbox": list(bbox),
            "datetime_start": start.isoformat(),
            "datetime_end": end.isoformat(),
        },
        "item_count": len(records),
        "items": records,
    }
```

Because `self_href` points at an immutable catalog record and the `id` uniquely names the scene, these two fields together are enough to rehydrate the imagery later — either by re-fetching from the STAC-hosted remote or by pulling the assets you mirrored into your own [DVC remote configuration](/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/configuring-dvc-remotes-for-geospatial-data/).

## Hashing the Manifest for Drift Detection

The catalog hash is a SHA-256 digest computed over the manifest in a canonical form. Serialising with `sort_keys=True` and no incidental whitespace guarantees the same logical content always yields the same digest, regardless of dict insertion order:

```python
import hashlib


def canonical_bytes(manifest: dict[str, Any]) -> bytes:
    """Serialise a manifest to canonical UTF-8 JSON bytes."""
    return json.dumps(
        manifest, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")


def compute_catalog_hash(manifest: dict[str, Any]) -> str:
    """Return a stable sha256:<hex> digest over the manifest body,
    excluding the hash field itself."""
    body = {k: v for k, v in manifest.items() if k != "catalog_hash"}
    digest = hashlib.sha256(canonical_bytes(body)).hexdigest()
    return f"sha256:{digest}"
```

Excluding the `catalog_hash` key from its own input avoids a chicken-and-egg problem and lets you verify a manifest by recomputing the digest and comparing it to the stored value. The content-addressing pattern here mirrors the SHA hashing used elsewhere in the versioning pipeline, applied specifically to acquisition provenance rather than raw pixels.

## Writing the Manifest and Tracking It with DVC

The final stage writes the manifest with its embedded hash to disk and hands the file to DVC. Tracking the manifest — rather than only the imagery — is what makes the STAC-to-version binding survive in git:

```python
from pathlib import Path


def write_manifest(manifest: dict[str, Any], out_path: Path) -> str:
    """Attach the catalog hash, write the manifest, and return the hash."""
    manifest = dict(manifest)  # copy before mutating
    manifest["catalog_hash"] = compute_catalog_hash(manifest)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(canonical_bytes(manifest))
    return manifest["catalog_hash"]


if __name__ == "__main__":
    start = datetime(2025, 6, 1, tzinfo=timezone.utc)
    end = datetime(2025, 6, 30, tzinfo=timezone.utc)
    selected = select_items(
        "https://example.com/stac/catalog.json",
        bbox=(13.0, 52.3, 13.8, 52.7),  # Berlin AOI, EPSG:4326
        start=start,
        end=end,
    )
    manifest = build_manifest(selected, (13.0, 52.3, 13.8, 52.7), start, end)
    digest = write_manifest(manifest, Path("data/snapshot_manifest.json"))
    print(f"{len(selected)} items, {digest}")
```

Then bring the manifest under version control. DVC replaces the file with a small `.dvc` pointer that you commit to git, so the exact STAC-derived composition is recoverable at any revision:

```bash
dvc add data/snapshot_manifest.json
git add data/snapshot_manifest.json.dvc data/.gitignore
git commit -m "Snapshot: June 2025 Berlin AOI, sha256:9f3a…"
```

To reproduce the training set at any later date, check out the revision, run `dvc checkout` to restore the manifest, recompute the catalog hash, and confirm it matches the stored value before rehydrating assets from the recorded `self_href` links.

## STAC Fields That Anchor Reproducibility

Not every STAC field matters for version binding. The ones below are the load-bearing pieces — capture them in the manifest or verify them at rehydration time.

| STAC field | Why it matters for reproducibility |
|---|---|
| `id` | Uniquely names the scene; the primary key that pins a snapshot to an acquisition record independent of file paths. |
| `links[rel=self].href` | Canonical, immutable pointer back to the catalog record; enables re-fetch and audit without re-scanning the catalog. |
| `properties.datetime` | Acquisition timestamp; guarantees the snapshot reflects a specific pass rather than a later re-processing of the same footprint. |
| `geometry` / `bbox` | Footprint used by the spatial filter; lets you prove the selection covered the intended area of interest. |
| `properties.proj:epsg` | Native CRS of the asset; needed to reproject annotations and to detect a silent projection change between versions. |
| `assets[*].href` | Direct links to the underlying COGs; the rehydration targets, and the fields most likely to drift when a provider re-hosts data. |
| `properties.eo:cloud_cover` | Selection criterion for many pipelines; recording it explains why a scene was kept or dropped when the query is revisited. |

## Common Errors and Fixes

**Catalog hash changes on every run for the same selection**
Root cause: STAC item iteration is unordered, so the `items` list is assembled in a different sequence each time.
Fix: sort the selection deterministically (`matches.sort(key=lambda it: it.id)`) before building the manifest, and serialise with `sort_keys=True`.

**`AttributeError: 'NoneType' object has no attribute 'href'` when reading `self` link**
Root cause: static catalogs generated offline sometimes omit the `self` link until they are normalised against a root URL.
Fix: call `catalog.normalize_hrefs(root_href)` after loading, or guard with `item.get_single_link("self")` and fall back to constructing the href from the item id.

**`dvc add` tracks the imagery instead of the manifest**
Root cause: pointing `dvc add` at the data directory rather than the single manifest file.
Fix: run `dvc add data/snapshot_manifest.json` on the manifest only; keep multi-gigabyte COGs on their STAC remote and rehydrate from the recorded hrefs.

**Recomputed hash mismatches the stored value at checkout**
Root cause: an upstream provider re-processed a scene and changed an asset href, or the manifest was hand-edited.
Fix: this is the system working as intended — diff the current catalog against the manifest to locate the changed item, then decide whether to re-pin the snapshot or restore the archived assets from your DVC remote.

**`datetime` comparison raises `TypeError: can't compare offset-naive and offset-aware datetimes`**
Root cause: the query bounds are timezone-naive while STAC item datetimes are UTC-aware.
Fix: construct query bounds with `tzinfo=timezone.utc` so both sides of the comparison are offset-aware.

## Related

- [Implementing DVC for Geospatial Training Data](/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/) — the parent guide covering how DVC pointers, caches, and pipelines version large spatial datasets end to end
- [Configuring DVC Remotes for Geospatial Data](/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/configuring-dvc-remotes-for-geospatial-data/) — set up the S3, GCS, or Azure remote that mirrors the STAC assets your manifest references
- [Preserving Metadata Across Dataset Versions](/dataset-versioning-spatial-data-sync/preserving-metadata-across-dataset-versions/) — the broader patterns for carrying CRS, geotransform, and acquisition context through every versioned snapshot
- [Coordinate Reference Systems in Annotation Pipelines](/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) — reproject an area of interest to WGS84 before filtering STAC geometries, and reconcile native asset CRS at rehydration

This guide covers one integration within [Implementing DVC for Geospatial Training Data](/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/), which is itself part of [Dataset Versioning & Spatial Data Sync](/dataset-versioning-spatial-data-sync/).
