---
title: "Reproducible Train/Validation Splits for Spatial Data"
description: "Build spatially blocked, buffered train and validation splits that survive versioning — deterministic assignment, leakage detection, and a split manifest that any run can reproduce exactly."
slug: "reproducible-train-validation-splits"
type: "guide"
breadcrumb:
  - label: "Home"
    url: "/"
  - label: "Dataset Versioning & Spatial Data Sync"
    url: "/dataset-versioning-spatial-data-sync/"
  - label: "Reproducible Train/Validation Splits for Spatial Data"
    url: "/dataset-versioning-spatial-data-sync/reproducible-train-validation-splits/"
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
      "headline": "Reproducible Train/Validation Splits for Spatial Data",
      "description": "Build spatially blocked, buffered train and validation splits that survive versioning — deterministic assignment, leakage detection, and a split manifest that any run can reproduce exactly.",
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
        {"@type": "ListItem", "position": 3, "name": "Reproducible Train/Validation Splits for Spatial Data", "item": "https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/reproducible-train-validation-splits/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Build a reproducible spatially blocked train and validation split",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Choose a block size", "text": "Pick a block edge several times the spatial autocorrelation range of the target, so that two tiles in different blocks are genuinely independent samples."},
        {"@type": "HowToStep", "position": 2, "name": "Assign blocks, not tiles", "text": "Hash each block's identifier to a deterministic bucket, so the same block always lands in the same split regardless of tile order or dataset size."},
        {"@type": "HowToStep", "position": 3, "name": "Buffer the boundary", "text": "Drop tiles within a buffer of a split boundary from training, so a validation tile never has a training tile touching it."},
        {"@type": "HowToStep", "position": 4, "name": "Test for leakage", "text": "Assert that no validation tile lies within the buffer distance of a training tile, and that no scene appears in both splits."},
        {"@type": "HowToStep", "position": 5, "name": "Version the split manifest", "text": "Write the assignment to a content-hashed manifest and track it with the dataset, so an evaluation number can always be traced to the exact split that produced it."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why does a random tile split inflate validation scores?",
          "acceptedAnswer": {"@type": "Answer", "text": "Adjacent tiles share roofs, shadows, field boundaries, sensor conditions and often the same physical objects cut in half. A random split puts neighbours on both sides, so the model is evaluated on ground it has effectively already seen. On aerial segmentation tasks the inflation is commonly ten to twenty IoU points, which is large enough to hide a model that will not work in production."}
        },
        {
          "@type": "Question",
          "name": "How large should a spatial block be?",
          "acceptedAnswer": {"@type": "Answer", "text": "Several times the autocorrelation range of the target, which is the distance beyond which two samples stop resembling each other. For buildings in a dense city that may be 200 to 500 metres; for agricultural fields it can be kilometres. Estimating it from a variogram of the target variable is better than guessing, and a block that is too large costs only some flexibility in split ratios, while one that is too small silently reintroduces the leakage."}
        },
        {
          "@type": "Question",
          "name": "Should the split be re-drawn when new annotations arrive?",
          "acceptedAnswer": {"@type": "Answer", "text": "No. Re-drawing the split makes every past evaluation number incomparable and gives an easy route to accidental cherry-picking. Hash-based block assignment means new tiles fall into their block's existing side automatically, so the split grows without moving, and only a deliberate, versioned decision changes it."}
        },
        {
          "@type": "Question",
          "name": "Does a buffer waste much data?",
          "acceptedAnswer": {"@type": "Answer", "text": "Typically two to eight percent of tiles, depending on block size and buffer width. That is the correct price: the discarded tiles are exactly the ones whose training use would corrupt the validation number. If the buffer is dropping much more than that, the blocks are too small, and the fix is larger blocks rather than a narrower buffer."}
        }
      ]
    }
  ]
}
</script>

# Reproducible Train/Validation Splits for Spatial Data

A model reports 0.84 IoU on validation and 0.61 in production, and nothing in between changed. The usual cause is not the model: it is a train/validation split drawn by shuffling tiles, which put the tile north of a warehouse in training and the tile south of it in validation. The two share the roof, the shadow, the sensor pass, and often the same building cut in half. The model was evaluated on ground it had already seen.

Fixing it takes three properties that a `train_test_split` call does not have. The split must be **spatially blocked**, so held-out ground is genuinely held out. It must be **buffered**, so no validation tile touches a training tile. And it must be **reproducible from a manifest**, so an evaluation number from six months ago can be traced to the exact assignment that produced it. This topic builds all three, and the leakage test that proves them.

## Prerequisites & Toolchain Alignment

```bash
pip install geopandas==0.14.4 shapely==2.0.6 pyproj==3.6.1 \
            numpy==1.26.4 pandas==2.2.2 pyyaml==6.0.1
```

The split operates on tile footprints, not on imagery, so it is fast and needs no GPU. It does need:

- **Tile footprints in a metric CRS.** Block edges and buffer widths are distances. Reproject once, as [coordinate reference systems in annotation pipelines](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) describes, and record the CRS in the manifest.
- **A stable tile identifier.** The assignment hashes an identifier; if tile ids are regenerated on each tiling pass, the split changes for reasons nobody intended.
- **A scene identifier per tile.** Two tiles from the same acquisition share sensor conditions even when they are far apart, and some projects treat that as leakage too.

<svg viewBox="0 0 720 300" role="img" aria-label="A random tile split compared with a buffered spatially blocked split over the same area" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>Random tiles against buffered blocks</title>
  <desc>On the left a random split scatters validation tiles among training tiles, so almost every held-out tile has a training neighbour sharing objects and sensor conditions. On the right the area is divided into blocks, whole blocks are assigned to a split, and a buffer strip along the boundary is dropped from training so nothing in validation touches anything the model saw.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <!-- Random -->
  <text x="170" y="36" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">random tile split</text>
  <rect x="50" y="52" width="240" height="160" fill="none" stroke="currentColor" stroke-width="1.3"/>
  <g>
    <rect x="50" y="52" width="40" height="40" fill="currentColor" opacity="0.35"/>
    <rect x="130" y="52" width="40" height="40" fill="currentColor" opacity="0.35"/>
    <rect x="210" y="52" width="40" height="40" fill="currentColor" opacity="0.35"/>
    <rect x="90" y="92" width="40" height="40" fill="currentColor" opacity="0.35"/>
    <rect x="170" y="92" width="40" height="40" fill="currentColor" opacity="0.35"/>
    <rect x="250" y="92" width="40" height="40" fill="currentColor" opacity="0.35"/>
    <rect x="50" y="132" width="40" height="40" fill="currentColor" opacity="0.35"/>
    <rect x="130" y="132" width="40" height="40" fill="currentColor" opacity="0.35"/>
    <rect x="210" y="132" width="40" height="40" fill="currentColor" opacity="0.35"/>
    <rect x="90" y="172" width="40" height="40" fill="currentColor" opacity="0.35"/>
    <rect x="250" y="172" width="40" height="40" fill="currentColor" opacity="0.35"/>
  </g>
  <g stroke="currentColor" stroke-width="0.8" opacity="0.4">
    <line x1="90" y1="52" x2="90" y2="212"/><line x1="130" y1="52" x2="130" y2="212"/><line x1="170" y1="52" x2="170" y2="212"/>
    <line x1="210" y1="52" x2="210" y2="212"/><line x1="250" y1="52" x2="250" y2="212"/>
    <line x1="50" y1="92" x2="290" y2="92"/><line x1="50" y1="132" x2="290" y2="132"/><line x1="50" y1="172" x2="290" y2="172"/>
  </g>
  <text x="170" y="238" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">every held-out tile has a training neighbour</text>
  <text x="170" y="258" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace" opacity="0.8">validation IoU 0.84</text>
  <text x="170" y="276" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">production 0.61</text>
  <!-- Blocked -->
  <text x="530" y="36" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">buffered spatial blocks</text>
  <rect x="410" y="52" width="240" height="160" fill="none" stroke="currentColor" stroke-width="1.3"/>
  <rect x="410" y="52" width="120" height="160" fill="currentColor" opacity="0.35"/>
  <rect x="530" y="52" width="40" height="160" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="4 3"/>
  <g stroke="currentColor" stroke-width="0.8" opacity="0.4">
    <line x1="450" y1="52" x2="450" y2="212"/><line x1="490" y1="52" x2="490" y2="212"/><line x1="530" y1="52" x2="530" y2="212"/>
    <line x1="570" y1="52" x2="570" y2="212"/><line x1="610" y1="52" x2="610" y2="212"/>
    <line x1="410" y1="92" x2="650" y2="92"/><line x1="410" y1="132" x2="650" y2="132"/><line x1="410" y1="172" x2="650" y2="172"/>
  </g>
  <text x="470" y="230" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">train</text>
  <text x="550" y="230" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">buffer</text>
  <text x="610" y="230" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">validation</text>
  <text x="530" y="258" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace" opacity="0.8">validation IoU 0.66</text>
  <text x="530" y="276" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">production 0.64 — the number holds</text>
</svg>

## Core Split Workflow

### Step 1 — Choose a Block Size From the Data

The block edge should exceed the distance at which two samples stop resembling each other. Guessing works badly; a coarse variogram of the target over the tile centroids gives a defensible number in a few lines.

<svg viewBox="0 0 720 270" role="img" aria-label="Semivariance against lag distance, with the range marked and the block size derived from it" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>Reading the block size off a variogram</title>
  <desc>Semivariance of building density rises steeply with distance and flattens at about 400 metres, which is the autocorrelation range: beyond it two tiles no longer resemble each other. The block edge is taken at three times that range, 1200 metres, so two tiles in different blocks are genuinely independent samples rather than neighbours with a boundary drawn between them.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <!-- Axes -->
  <line x1="90" y1="200" x2="660" y2="200" stroke="currentColor" stroke-width="1.4" opacity="0.6"/>
  <line x1="90" y1="200" x2="90" y2="46" stroke="currentColor" stroke-width="1.4" opacity="0.6"/>
  <text x="90" y="220" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.6">0</text>
  <text x="243" y="220" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.6">400 m</text>
  <text x="395" y="220" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.6">800 m</text>
  <text x="548" y="220" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.6">1 200 m</text>
  <text x="660" y="220" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.6">1 500 m</text>
  <text x="375" y="242" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.75">lag distance between tile centroids</text>
  <text x="56" y="124" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.75" transform="rotate(-90 56 124)">semivariance</text>
  <!-- Curve -->
  <path d="M90 190 L128 150 L166 118 L205 96 L243 84 L281 80 L320 78 L358 77 L397 78 L435 77 L474 78 L512 77 L550 78 L590 77 L628 78 L660 78" fill="none" stroke="currentColor" stroke-width="2.4"/>
  <!-- Sill -->
  <line x1="90" y1="78" x2="660" y2="78" stroke="currentColor" stroke-width="1" stroke-dasharray="3 3" opacity="0.5"/>
  <text x="600" y="70" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">sill</text>
  <!-- Range -->
  <line x1="243" y1="60" x2="243" y2="196" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 3"/>
  <text x="250" y="56" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.85">range ≈ 400 m — beyond here, tiles stop resembling each other</text>
  <!-- Block -->
  <line x1="548" y1="60" x2="548" y2="196" stroke="currentColor" stroke-width="2"/>
  <text x="556" y="112" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.85">block edge</text>
  <text x="556" y="126" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.85">= 3 × range</text>
  <text x="375" y="264" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">a block smaller than the range puts correlated ground on both sides of the split, which is the leak the blocking was for</text>
</svg>

```python
import numpy as np
import geopandas as gpd

def autocorrelation_range(tiles: gpd.GeoDataFrame, value_col: str,
                          max_lag_m: float = 5000.0, n_bins: int = 20) -> float:
    """Rough empirical range: the lag beyond which semivariance stops rising.

    `tiles` must be in a metric CRS; `value_col` is a per-tile target summary such as
    building density or the share of the dominant class.
    """
    pts = np.column_stack([tiles.geometry.centroid.x, tiles.geometry.centroid.y])
    vals = tiles[value_col].to_numpy(dtype=float)
    d = np.linalg.norm(pts[:, None, :] - pts[None, :, :], axis=-1)
    dv = 0.5 * (vals[:, None] - vals[None, :]) ** 2
    iu = np.triu_indices_from(d, k=1)
    d, dv = d[iu], dv[iu]
    edges = np.linspace(0, max_lag_m, n_bins + 1)
    gamma = np.array([dv[(d >= lo) & (d < hi)].mean() if ((d >= lo) & (d < hi)).any() else np.nan
                      for lo, hi in zip(edges[:-1], edges[1:])])
    sill = np.nanmax(gamma)
    reached = np.where(gamma >= 0.95 * sill)[0]
    return float(edges[reached[0] + 1]) if len(reached) else max_lag_m
```

Take the block edge as roughly three times that range. If the computation is impractical — very large tile counts make the pairwise distance matrix expensive — sample a few thousand tiles; the range estimate is not sensitive to that.

### Step 2 — Assign Blocks Deterministically

The assignment must not depend on tile order, dataset size, or a random seed that lives in someone's notebook. Hashing the block identifier gives a stable, order-independent bucket that new tiles fall into automatically.

```python
import hashlib

def block_id(x: float, y: float, block_m: float) -> str:
    """The block a coordinate falls in, as a stable string."""
    return f"{int(np.floor(x / block_m))}_{int(np.floor(y / block_m))}"

def assign_split(block: str, salt: str, val_share: float = 0.2,
                 test_share: float = 0.1) -> str:
    """Deterministic split assignment for a block. Same block + salt → same answer, always."""
    h = hashlib.sha256(f"{salt}:{block}".encode()).digest()
    # first 8 bytes as a fraction in [0, 1)
    frac = int.from_bytes(h[:8], "big") / float(1 << 64)
    if frac < val_share:
        return "val"
    if frac < val_share + test_share:
        return "test"
    return "train"
```

The `salt` is the only knob that changes the split, and changing it is a deliberate, versioned act. Recording it in the manifest is what lets a reviewer confirm that last quarter's numbers and this quarter's came from the same partition of the world.

### Step 3 — Buffer the Boundaries

A tile in a training block that shares an edge with a validation block is still adjacent to held-out ground. Drop it from training — not from validation, which would shrink the evaluation set for no benefit.

```python
def apply_buffer(tiles: gpd.GeoDataFrame, buffer_m: float,
                 split_col: str = "split") -> gpd.GeoDataFrame:
    """Drop training tiles within `buffer_m` of any validation or test tile."""
    held = tiles[tiles[split_col].isin(["val", "test"])]
    if held.empty:
        return tiles
    zone = held.geometry.buffer(buffer_m).union_all()
    is_train = tiles[split_col] == "train"
    touching = is_train & tiles.geometry.intersects(zone)
    out = tiles.copy()
    out.loc[touching, split_col] = "buffer"     # kept in the manifest, used by nothing
    return out
```

Marking them `buffer` rather than deleting them matters: the manifest then records that these tiles exist and were deliberately excluded, so a later reader does not conclude the tiling was incomplete.

### Step 4 — Test for Leakage Before Training

The split is a claim, and the claim deserves an assertion. Two failures matter: a validation tile within the buffer of a training tile, and a scene appearing on both sides.

```python
def assert_no_leakage(tiles: gpd.GeoDataFrame, buffer_m: float,
                      split_col: str = "split", scene_col: str = "scene_id") -> None:
    train = tiles[tiles[split_col] == "train"]
    held = tiles[tiles[split_col].isin(["val", "test"])]

    if not train.empty and not held.empty:
        zone = train.geometry.buffer(buffer_m).union_all()
        bleed = held[held.geometry.intersects(zone)]
        if len(bleed):
            raise AssertionError(
                f"{len(bleed)} held-out tile(s) within {buffer_m} m of training data, "
                f"e.g. {bleed.index[0]}")

    shared = set(train[scene_col]) & set(held[scene_col])
    if shared:
        raise AssertionError(f"{len(shared)} scene(s) in both splits, e.g. {sorted(shared)[0]}")
```

Run it as a step in the [CI gate](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/ci-cd-gates-for-annotation-datasets/) as well as before training. A split is exactly the kind of artifact that is correct when written and quietly wrong three merges later.

<svg viewBox="0 0 720 290" role="img" aria-label="Two leakage paths a split can have: spatial adjacency across the boundary and a scene present on both sides" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>The two leaks a split test has to catch</title>
  <desc>The first leak is spatial: a validation tile sits directly across the block boundary from a training tile, sharing objects and shadows. The second is by scene: two tiles far apart in space came from the same acquisition, so they share sensor geometry, atmospheric conditions and processing, and a model can key on that instead of on the ground.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <!-- Spatial leak -->
  <text x="170" y="36" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">leak 1 — adjacency</text>
  <rect x="50" y="54" width="120" height="120" fill="currentColor" opacity="0.3"/>
  <rect x="170" y="54" width="120" height="120" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="5 3"/>
  <line x1="170" y1="54" x2="170" y2="174" stroke="currentColor" stroke-width="2"/>
  <polygon points="140,90 200,86 206,132 146,138" fill="none" stroke="currentColor" stroke-width="2"/>
  <text x="170" y="196" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.85">one warehouse, cut by the boundary</text>
  <text x="110" y="216" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">train</text>
  <text x="230" y="216" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">validation</text>
  <text x="170" y="244" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">fixed by a buffer strip</text>
  <!-- Scene leak -->
  <text x="530" y="36" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">leak 2 — shared scene</text>
  <rect x="400" y="54" width="110" height="80" fill="currentColor" opacity="0.3"/>
  <text x="455" y="98" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace">tile 0142</text>
  <rect x="560" y="120" width="110" height="80" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="5 3"/>
  <text x="615" y="164" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace">tile 1907</text>
  <path d="M510 94 L536 94 L536 160 L556 160" fill="none" stroke="currentColor" stroke-width="1.4" opacity="0.7"/>
  <text x="455" y="152" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.8">same acquisition</text>
  <text x="530" y="224" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.85">kilometres apart, identical sun angle,</text>
  <text x="530" y="240" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.85">atmosphere and processing chain</text>
  <text x="530" y="262" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">fixed by splitting on scene, not only on space</text>
  <text x="170" y="272" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">a buffer alone does not catch leak 2</text>
</svg>

### Step 5 — Write and Version the Split Manifest

The manifest is the artifact. It is small, it is deterministic, and it is what makes an evaluation number auditable a year later.

```python
import json
from pathlib import Path

def write_split_manifest(path: str, tiles: gpd.GeoDataFrame, *, salt: str,
                         block_m: float, buffer_m: float, crs: str) -> str:
    """Serialise the split deterministically and return its digest."""
    payload = {
        "salt": salt,
        "block_m": block_m,
        "buffer_m": buffer_m,
        "crs": crs,
        "counts": tiles["split"].value_counts().sort_index().to_dict(),
        "assignments": {str(t.Index): t.split for t in
                        tiles.sort_index().itertuples()},
    }
    blob = json.dumps(payload, indent=2, sort_keys=True) + "\n"
    Path(path).write_text(blob, encoding="utf-8")
    return hashlib.sha256(blob.encode()).hexdigest()
```

Track that file with the dataset, not beside it. The pattern is the one in [tracking annotation changes with SHA hashing](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/tracking-annotation-changes-with-sha-hashing/): sorted keys, no timestamp, so two runs that produce the same split produce byte-identical manifests and no spurious version.

## Split Parameters & Configuration Reference

| Parameter | Typical | Effect |
|---|---|---|
| Block edge | 3 × autocorrelation range (0.5 – 5 km) | Too small reintroduces leakage; too large limits achievable ratios |
| `buffer_m` | 1 – 2 tile widths | Drops 2 – 8% of tiles from training; below one tile width it does nothing |
| `val_share` | 0.15 – 0.20 | Blocked splits are noisier than random ones, so do not go below 0.15 |
| `test_share` | 0.10, held out entirely | Touched once, at the end, or it is a second validation set |
| `salt` | a project-lifetime constant | Changing it invalidates every historical comparison |
| Scene exclusivity | on for single-sensor projects | Off only when scenes genuinely do not correlate |

## Edge Cases & Spatial Gotchas

**A rare class living in one block.** Hash assignment does not know that every solar farm in the dataset is in block `12_7`. If that block lands in validation, the model never trains on solar farms. Check per-class counts per split after assignment and re-salt — not re-shuffle — if a class is absent from training.

**Long thin study areas.** A corridor along a motorway has almost no interior, so blocks and buffers eat most of it. Use blocks along the corridor axis rather than a square grid, and accept a coarser split ratio.

**Multi-temporal stacks.** Two dates over the same block are the same ground. They must share a split, which means the block id must be computed from location alone and never include the date.

**Tiles that straddle a block boundary.** Assign by centroid and be consistent about it. Assigning by intersection puts one tile in two blocks, which quietly makes the assignment order-dependent — the exact property the hashing was there to remove.

**Growing the dataset later.** New tiles hash into existing blocks and inherit their side automatically, which is the point. What must not happen is re-running block sizing on the larger dataset and getting a different `block_m`, because that reassigns everything. Pin `block_m` in the manifest and treat it as fixed for the project's life.

## Integration & Automation Hooks

**As a DVC stage.** The split is a pure function of the tile footprints, the salt and the two distances, so it belongs in the pipeline as a stage whose outputs are the manifest. When the footprints change, the split regenerates; when they do not, nothing does.

```yaml
stages:
  split:
    cmd: python -m pipeline.split --salt ${split.salt} --block-m ${split.block_m} --buffer-m ${split.buffer_m}
    deps:
      - data/tiles/footprints.parquet
      - pipeline/split.py
    params:
      - split.salt
      - split.block_m
      - split.buffer_m
    outs:
      - data/splits/manifest.json
```

**As a CI assertion.** `assert_no_leakage` runs in the same gate as the geometry and schema checks, so a pull request that adds tiles across a boundary fails before it is merged.

**In the data loader.** The loader reads the manifest and filters, rather than globbing a directory per split. A directory layout encodes the split in the filesystem, which means changing it requires moving terabytes and makes two experiments on different splits impossible to run side by side.

## Validation & Testing

```python
def test_assignment_is_order_independent() -> None:
    blocks = ["3_4", "1_1", "9_2", "7_7"]
    a = {b: assign_split(b, salt="v1") for b in blocks}
    b = {b: assign_split(b, salt="v1") for b in reversed(blocks)}
    assert a == b

def test_salt_changes_the_split() -> None:
    blocks = [f"{i}_{j}" for i in range(20) for j in range(20)]
    v1 = [assign_split(b, salt="v1") for b in blocks]
    v2 = [assign_split(b, salt="v2") for b in blocks]
    assert v1 != v2                                   # a new salt is a new partition

def test_leakage_detector_rejects_a_random_split(tiles) -> None:
    """Feed the checker the split it exists to refuse."""
    import numpy as np, pytest
    rng = np.random.default_rng(0)
    tiles = tiles.copy()
    tiles["split"] = rng.choice(["train", "val"], size=len(tiles), p=[0.8, 0.2])
    with pytest.raises(AssertionError, match="within"):
        assert_no_leakage(tiles, buffer_m=200.0)
```

The last test is the one that keeps the rest honest: it constructs the naive random split this whole topic argues against, and asserts that the machinery refuses it.

## Frequently Asked Questions

### Can I use k-fold cross-validation with spatial blocks?

Yes — assign blocks to k buckets by the same hash and rotate which bucket is held out. The buffer has to be recomputed per fold, since the boundary moves. It is the right approach when the dataset is small enough that a single validation split is noisy, which is common early in a project.

### What if my validation number gets worse after switching to blocked splits?

That is the expected outcome, and it is good news. The previous number was measuring memorisation of neighbouring ground. Record both for one release so the change in methodology is visible in the history, then keep only the blocked number.

### How does this interact with active learning?

Actively selected tiles enter training, so they must respect the split: a tile in a validation block can never be labelled into training, no matter how uncertain the model is about it. Filter candidates by split before ranking, as part of the selection step described in [uncertainty sampling for geospatial active learning](https://www.geospatialannotation.com/active-learning-model-feedback-loops/uncertainty-sampling-for-geospatial-active-learning/).

### Should the test split ever be looked at?

Once, at the end, for the number you report. Every additional look leaks information through the decisions it influences. If you find yourself checking test performance between experiments, what you have is a second validation set and no test set at all.

## Related

- [Tracking Annotation Changes with SHA Hashing](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/tracking-annotation-changes-with-sha-hashing/) — the deterministic serialisation the split manifest borrows, so an unchanged split creates no new version
- [Implementing DVC for Geospatial Training Data](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/) — where the split stage sits in the pipeline graph
- [Closing the Loop with Automated Retraining](https://www.geospatialannotation.com/active-learning-model-feedback-loops/closing-the-loop-with-automated-retraining/) — the promotion gate whose numbers are only meaningful on an uncontaminated split
- [Detecting Distribution Drift in Spatial Datasets](https://www.geospatialannotation.com/active-learning-model-feedback-loops/detecting-distribution-drift-in-spatial-datasets/) — what to watch when the held-out blocks stop resembling the ground the model now sees

Splitting is one stage of the broader [Dataset Versioning & Spatial Data Sync](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/) pipeline, which keeps every artifact — including this one — reproducible from a manifest.
