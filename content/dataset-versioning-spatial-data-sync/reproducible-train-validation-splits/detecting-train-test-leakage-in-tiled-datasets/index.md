---
title: "Detecting Train/Test Leakage in Tiled Datasets"
description: "Four tests that catch spatial, temporal, scene and duplicate leakage between a tiled dataset's splits — run them in CI so a split that quietly degrades is caught before it inflates a metric."
slug: "detecting-train-test-leakage-in-tiled-datasets"
type: "tutorial"
breadcrumb:
  - label: "Home"
    url: "/"
  - label: "Dataset Versioning & Spatial Data Sync"
    url: "/dataset-versioning-spatial-data-sync/"
  - label: "Reproducible Train/Validation Splits for Spatial Data"
    url: "/dataset-versioning-spatial-data-sync/reproducible-train-validation-splits/"
  - label: "Detecting Train/Test Leakage in Tiled Datasets"
    url: "/dataset-versioning-spatial-data-sync/reproducible-train-validation-splits/detecting-train-test-leakage-in-tiled-datasets/"
datePublished: "2026-08-08"
dateModified: "2026-08-08"
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
      "headline": "Detecting Train/Test Leakage in Tiled Datasets",
      "description": "Four tests that catch spatial, temporal, scene and duplicate leakage between a tiled dataset's splits — run them in CI so a split that quietly degrades is caught before it inflates a metric.",
      "datePublished": "2026-08-08",
      "dateModified": "2026-08-08",
      "author": {"@type": "Organization", "name": "Geospatial Annotation"},
      "publisher": {"@type": "Organization", "name": "Geospatial Annotation"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.geospatialannotation.com/"},
        {"@type": "ListItem", "position": 2, "name": "Dataset Versioning & Spatial Data Sync", "item": "https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/"},
        {"@type": "ListItem", "position": 3, "name": "Reproducible Train/Validation Splits for Spatial Data", "item": "https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/reproducible-train-validation-splits/"},
        {"@type": "ListItem", "position": 4, "name": "Detecting Train/Test Leakage in Tiled Datasets", "item": "https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/reproducible-train-validation-splits/detecting-train-test-leakage-in-tiled-datasets/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Test a tiled dataset for train and test leakage",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Test spatial adjacency", "text": "Buffer the training footprints and assert that no held-out tile intersects the buffered zone."},
        {"@type": "HowToStep", "position": 2, "name": "Test scene exclusivity", "text": "Assert that no acquisition identifier appears in both the training split and a held-out split."},
        {"@type": "HowToStep", "position": 3, "name": "Test temporal overlap", "text": "For multi-date datasets, assert that the same ground does not appear on one date in training and another date in validation unless that is deliberate."},
        {"@type": "HowToStep", "position": 4, "name": "Test for duplicate content", "text": "Hash tile pixels and assert that no hash appears on both sides, which catches re-tiled or re-exported copies with different identifiers."},
        {"@type": "HowToStep", "position": 5, "name": "Run all four in CI", "text": "Wire the tests into the dataset gate so a merge that adds tiles across a split boundary fails before the dataset is versioned."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "How can leakage appear in a split that was built correctly?",
          "acceptedAnswer": {"@type": "Answer", "text": "Because datasets grow. New tiles arrive from a re-tiling pass with different identifiers, a scene is re-processed and added under a new name, or an annotator's export lands in a directory the split manifest does not cover. Each of those is an ordinary operation, and each can place near-identical content on both sides of a boundary that was clean when it was drawn."}
        },
        {
          "@type": "Question",
          "name": "Is duplicate-content hashing worth the cost?",
          "acceptedAnswer": {"@type": "Answer", "text": "It is the only test that catches an identical tile that entered under two identifiers, which is common after a re-tiling or a re-export. Hash the decoded pixels rather than the file bytes, so a re-compressed copy still matches, and run it over a downsampled version if full-resolution hashing is too slow."}
        },
        {
          "@type": "Question",
          "name": "What buffer distance should the adjacency test use?",
          "acceptedAnswer": {"@type": "Answer", "text": "The same one the split was built with, read from the split manifest rather than hard-coded. A test that asserts a 200 metre buffer against a split built with 500 will pass a dataset that leaks, which is worse than no test because it produces a green check."}
        },
        {
          "@type": "Question",
          "name": "Should the test fail the build or warn?",
          "acceptedAnswer": {"@type": "Answer", "text": "Fail. Spatial leakage silently inflates every metric downstream and is unrecoverable once a model has been promoted on the strength of it. Unlike class-balance drift, which is a judgement call, leakage is unambiguous: the split either holds or it does not."}
        }
      ]
    }
  ]
}
</script>

# Detecting Train/Test Leakage in Tiled Datasets

A split built correctly in March can leak by June without anyone doing anything wrong. A re-tiling pass gives the same ground new tile ids; a scene is re-processed and lands under a new name; an annotator's export is written to a directory the split manifest never heard of. Each is routine, and each can put near-identical content on both sides of a boundary. This guide gives four tests — spatial adjacency, scene exclusivity, temporal overlap and duplicate content — that catch those four paths, plus the wiring that runs them on every dataset change rather than once when the split was drawn.

## Why the Split Manifest Is Not Enough

The [split manifest](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/reproducible-train-validation-splits/) records an assignment. It is authoritative about which tile is on which side, and it says nothing about whether two tiles on opposite sides are the same ground. Those are different claims, and only the second one is what "held out" means.

Four ways they come apart:

- **Adjacency.** A new tile lands in a training block and touches a validation block, because the buffer was computed when the dataset was smaller.
- **Scene.** Two tiles far apart geographically came from one acquisition, sharing sun angle, atmosphere and processing.
- **Time.** The same ground appears on two dates, one on each side, so the model has seen the buildings it is being evaluated on.
- **Duplicate content.** The identical tile entered twice under two identifiers, and the hash assignment sent the two copies to different sides.

<svg viewBox="0 0 720 290" role="img" aria-label="Four leakage paths and the test that catches each" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>Four ways a clean split goes bad, and the test for each</title>
  <desc>Adjacency leakage is caught by buffering the training footprints and testing for intersection with held-out tiles. Scene leakage is caught by set intersection on acquisition identifiers. Temporal leakage is caught by testing whether the same ground appears on two dates across the boundary. Duplicate content is caught by hashing decoded pixels and comparing the two sides.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <text x="240" y="38" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">how it gets in</text>
  <text x="560" y="38" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">the test that catches it</text>
  <line x1="20" y1="48" x2="700" y2="48" stroke="currentColor" stroke-width="1" opacity="0.4"/>
  <text x="20" y="80" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">adjacency</text>
  <text x="140" y="80" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.85">a new tile lands beside a held-out block</text>
  <rect x="420" y="64" width="280" height="24" rx="4" fill="currentColor" opacity="0.28"/>
  <text x="560" y="81" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace">buffer(train).intersects(held)</text>
  <text x="20" y="132" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">scene</text>
  <text x="140" y="132" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.85">one acquisition, tiles on both sides</text>
  <rect x="420" y="116" width="280" height="24" rx="4" fill="currentColor" opacity="0.28"/>
  <text x="560" y="133" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace">set(train.scene) &amp; set(held.scene)</text>
  <text x="20" y="184" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">temporal</text>
  <text x="140" y="184" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.85">same ground, two dates, split across</text>
  <rect x="420" y="168" width="280" height="24" rx="4" fill="currentColor" opacity="0.28"/>
  <text x="560" y="185" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace">block id shared, date differs</text>
  <text x="20" y="236" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">duplicate</text>
  <text x="140" y="236" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.85">the same pixels under two tile ids</text>
  <rect x="420" y="220" width="280" height="24" rx="4" fill="none" stroke="currentColor" stroke-width="1.6"/>
  <text x="560" y="237" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace">sha256(decoded pixels) collision</text>
  <text x="360" y="272" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">the first three are cheap and run on metadata; only the fourth needs to open imagery</text>
</svg>

## Step-by-Step Implementation

### Step 1 — Spatial Adjacency, With the Buffer From the Manifest

```bash
pip install geopandas==0.14.4 shapely==2.0.6 pandas==2.2.2 numpy==1.26.4 rasterio==1.3.10
```

```python
import json
import geopandas as gpd

def load_split_params(manifest_path: str) -> dict:
    """Read the distances the split was actually built with — never hard-code them."""
    with open(manifest_path, encoding="utf-8") as fh:
        m = json.load(fh)
    return {"buffer_m": float(m["buffer_m"]), "block_m": float(m["block_m"]), "crs": m["crs"]}

def check_adjacency(tiles: gpd.GeoDataFrame, buffer_m: float,
                    split_col: str = "split") -> list[str]:
    train = tiles[tiles[split_col] == "train"]
    held = tiles[tiles[split_col].isin(["val", "test"])]
    if train.empty or held.empty:
        return []
    zone = train.geometry.buffer(buffer_m).union_all()
    bleed = held[held.geometry.intersects(zone)]
    return [f"tile {i} is within {buffer_m} m of training data" for i in bleed.index[:20]]
```

Reading `buffer_m` from the manifest rather than passing a literal is the difference between a test that verifies the split and one that verifies a number somebody typed. A test asserting 200 m against a split built with 500 m passes a leaking dataset and shows a green check, which is worse than having no test.

### Step 2 — Scene and Temporal Exclusivity

```python
def check_scene(tiles: gpd.GeoDataFrame, split_col: str = "split",
                scene_col: str = "scene_id") -> list[str]:
    train = set(tiles.loc[tiles[split_col] == "train", scene_col])
    held = set(tiles.loc[tiles[split_col].isin(["val", "test"]), scene_col])
    return [f"scene {s} appears in both splits" for s in sorted(train & held)[:20]]

def check_temporal(tiles: gpd.GeoDataFrame, split_col: str = "split",
                   block_col: str = "block", date_col: str = "acquired") -> list[str]:
    """The same block on two dates, one per side, is the same ground seen twice."""
    train = tiles[tiles[split_col] == "train"]
    held = tiles[tiles[split_col].isin(["val", "test"])]
    shared = set(train[block_col]) & set(held[block_col])
    out = []
    for b in sorted(shared)[:20]:
        d_train = set(train.loc[train[block_col] == b, date_col])
        d_held = set(held.loc[held[block_col] == b, date_col])
        if d_train and d_held:
            out.append(f"block {b} is in training on {sorted(d_train)[0]} "
                       f"and held out on {sorted(d_held)[0]}")
    return out
```

The temporal test is the one most projects skip, and it is the one that bites hardest on change-detection work, where the same ground appearing on two dates is the entire point of the dataset and must therefore be handled deliberately rather than by accident.

<svg viewBox="0 0 720 260" role="img" aria-label="A split manifest's recorded buffer distance being read by the test rather than hard-coded" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>The test must read the distance the split was built with</title>
  <desc>The split manifest records a buffer of 500 metres. A test that reads that value asserts the real contract and fails a dataset that leaks. A test with 200 metres hard-coded passes the same dataset and reports a green check, which is worse than having no test because it converts an unverified claim into an apparent verification.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <rect x="250" y="34" width="220" height="52" rx="6" fill="none" stroke="currentColor" stroke-width="2"/>
  <text x="360" y="56" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">manifest.json</text>
  <text x="360" y="74" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">buffer_m: 500</text>
  <path d="M250 60 L200 60 L200 116" fill="none" stroke="currentColor" stroke-width="1.5" marker-end="url(#lkx-arr)"/>
  <defs>
    <marker id="lkx-arr" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor"/>
    </marker>
  </defs>
  <rect x="40" y="118" width="320" height="84" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="200" y="142" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">reads the manifest</text>
  <text x="200" y="164" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace">check_adjacency(tiles, buffer_m=500)</text>
  <text x="200" y="186" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.85">fails the leaking dataset — correctly</text>
  <rect x="390" y="118" width="290" height="84" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 3"/>
  <text x="535" y="142" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">hard-codes a number</text>
  <text x="535" y="164" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace">check_adjacency(tiles, buffer_m=200)</text>
  <text x="535" y="186" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.85">passes it, and shows a green check</text>
  <text x="360" y="232" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">a test that verifies a number somebody typed is not verifying the split —</text>
  <text x="360" y="248" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">and unlike no test at all, it stops anyone looking</text>
</svg>

### Step 3 — Duplicate Content by Pixel Hash

File bytes change on re-compression; decoded pixels do not. Hash what the model will actually see.

```python
import hashlib
import rasterio
import numpy as np

def tile_content_hash(path: str, downsample: int = 8) -> str:
    """Hash decoded pixels, downsampled for speed. Stable across re-compression."""
    with rasterio.open(path) as src:
        h = hashlib.sha256()
        for band in range(1, src.count + 1):
            arr = src.read(band,
                           out_shape=(src.height // downsample, src.width // downsample),
                           resampling=rasterio.enums.Resampling.average)
            h.update(np.ascontiguousarray(arr).tobytes())
        return h.hexdigest()

def check_duplicates(tiles: gpd.GeoDataFrame, path_col: str = "path",
                     split_col: str = "split") -> list[str]:
    seen: dict[str, tuple[str, str]] = {}
    problems: list[str] = []
    for row in tiles.itertuples():
        digest = tile_content_hash(getattr(row, path_col))
        split = getattr(row, split_col)
        if digest in seen:
            other_id, other_split = seen[digest]
            if other_split != split and {other_split, split} != {"train", "buffer"}:
                problems.append(f"identical pixels in {split} ({row.Index}) "
                                f"and {other_split} ({other_id})")
        else:
            seen[digest] = (str(row.Index), split)
    return problems
```

Downsampling by eight makes this fast enough to run over a full dataset nightly and still catches genuine duplicates: two tiles that agree at one-eighth resolution across every band are not coincidentally similar.

### Step 4 — Wire All Four Into One Gate

```python
def audit_split(tiles: gpd.GeoDataFrame, manifest_path: str, *,
                with_pixels: bool = False) -> None:
    params = load_split_params(manifest_path)
    problems: list[str] = []
    problems += check_adjacency(tiles, params["buffer_m"])
    problems += check_scene(tiles)
    problems += check_temporal(tiles)
    if with_pixels:
        problems += check_duplicates(tiles)
    if problems:
        raise AssertionError(f"{len(problems)} leakage problem(s):\n  " + "\n  ".join(problems[:20]))
```

Run the three metadata tests on every pull request that touches the dataset, and the pixel test nightly — the same split between cheap and expensive checks the [CI/CD gate](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/ci-cd-gates-for-annotation-datasets/) already makes for geometry and schema.

<svg viewBox="0 0 720 270" role="img" aria-label="Where each leakage test runs: three on every pull request, one nightly" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>Cheap tests on every change, the expensive one nightly</title>
  <desc>Adjacency, scene and temporal tests read only tile footprints and metadata, so they finish in seconds and belong on every pull request. The duplicate-content test opens imagery and is run nightly over the whole dataset, where its cost is acceptable and its findings are still timely.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <defs>
    <marker id="lk-arr" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor"/>
    </marker>
  </defs>
  <rect x="20" y="60" width="150" height="56" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="95" y="84" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">pull request</text>
  <text x="95" y="102" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">tiles added or moved</text>
  <line x1="170" y1="88" x2="204" y2="88" stroke="currentColor" stroke-width="1.5" marker-end="url(#lk-arr)"/>
  <rect x="206" y="52" width="250" height="72" rx="6" fill="none" stroke="currentColor" stroke-width="2"/>
  <text x="331" y="76" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">adjacency · scene · temporal</text>
  <text x="331" y="96" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">footprints and metadata only</text>
  <text x="331" y="114" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace" opacity="0.75">~4 s on 50 000 tiles</text>
  <line x1="456" y1="88" x2="490" y2="88" stroke="currentColor" stroke-width="1.5" marker-end="url(#lk-arr)"/>
  <rect x="492" y="60" width="208" height="56" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="596" y="84" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">merge blocked on failure</text>
  <text x="596" y="102" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">names the offending tile</text>
  <rect x="20" y="160" width="150" height="56" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 3"/>
  <text x="95" y="184" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">nightly job</text>
  <text x="95" y="202" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">whole dataset</text>
  <line x1="170" y1="188" x2="204" y2="188" stroke="currentColor" stroke-width="1.5" marker-end="url(#lk-arr)"/>
  <rect x="206" y="160" width="250" height="56" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 3"/>
  <text x="331" y="184" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">duplicate content by pixel hash</text>
  <text x="331" y="202" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace" opacity="0.75">opens every tile — minutes, not seconds</text>
  <text x="360" y="248" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">putting the pixel test on every pull request is how a leakage gate becomes the check everyone disables</text>
</svg>

## Parameters and Thresholds Reference

| Test | Input | Cost | Cadence |
|---|---|---|---|
| Adjacency | footprints + `buffer_m` from the manifest | seconds | every pull request |
| Scene exclusivity | `scene_id` column | milliseconds | every pull request |
| Temporal overlap | `block` + `acquired` columns | seconds | every pull request |
| Duplicate content | decoded pixels, downsample 8 | minutes | nightly |
| Failure mode | hard failure, never a warning | — | leakage is unambiguous |

## Common Errors and Fixes

**The adjacency test passes but production still disagrees with validation**
Root cause: the buffer was applied to `val` but the dataset also has a `test` split that was not included.
Fix: treat every non-training split as held out, as `check_adjacency` does above.

**The duplicate test reports thousands of collisions**
Root cause: downsampling turned large areas of empty ground — sea, desert, cloud — into identical arrays.
Fix: skip tiles whose pixel variance is below a threshold before hashing; genuinely featureless tiles are duplicates in a sense that does not matter.

**Scene test fails on a dataset with no scene column**
Root cause: the tiling pass did not carry the acquisition identifier through.
Fix: add it at tiling time — the manifest pattern in [preserving metadata across dataset versions](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/preserving-metadata-across-dataset-versions/) exists for exactly this.

**Temporal test fires on a change-detection dataset**
Root cause: the same ground on two dates is the intended design.
Fix: mark the dataset as multi-temporal in the manifest and pair the dates explicitly, so the test asserts that *pairs* stay on one side rather than that blocks appear once.

## Frequently Asked Questions

### Can leakage be detected after the fact, from metrics alone?

Only as a suspicion. A validation score far above production performance is consistent with leakage and also with a distribution shift, and the two need opposite responses. The tests here answer the question directly, which is why they belong in the pipeline rather than in a post-mortem.

### What about leakage through derived features?

If a per-tile statistic computed over the whole dataset — a global mean for normalisation, say — is fitted before splitting, information crosses the boundary. Fit any such statistic on the training split alone and store it with the split manifest.

### Does the buffer need to grow as the dataset grows?

No. The buffer relates to the spatial autocorrelation of the target, not to dataset size. What changes with growth is the chance that a new tile lands in the buffer zone, which is what the adjacency test on every pull request is for.

### Should tiles in the buffer be deleted?

Keep them, marked. They are useful for inference-time context, they document that the exclusion was deliberate, and deleting them means a later reader cannot tell the difference between a buffered split and an incomplete tiling.

## Related

- [Reproducible Train/Validation Splits for Spatial Data](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/reproducible-train-validation-splits/) — how the split and its manifest are built in the first place
- [CI/CD Gates for Annotation Datasets](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/ci-cd-gates-for-annotation-datasets/) — the gate these tests join, and the cheap-before-expensive ordering it already uses
- [Computing Stable Content Hashes for COGs](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/tracking-annotation-changes-with-sha-hashing/computing-stable-content-hashes-for-cogs/) — the decoded-pixel hashing the duplicate test borrows

These tests defend the split built in [Reproducible Train/Validation Splits for Spatial Data](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/reproducible-train-validation-splits/), part of [Dataset Versioning & Spatial Data Sync](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/).
