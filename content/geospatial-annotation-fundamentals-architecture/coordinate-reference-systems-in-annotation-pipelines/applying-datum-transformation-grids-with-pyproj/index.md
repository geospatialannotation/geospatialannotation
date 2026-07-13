---
title: "Applying Datum Transformation Grids with pyproj"
description: "Install and apply NTv2/GTX datum-shift grids in pyproj so NAD27→WGS84 and other datum transforms are centimetre-accurate, avoiding the silent metre-scale error of a fallback Helmert transform."
slug: "applying-datum-transformation-grids-with-pyproj"
type: "tutorial"
breadcrumb:
  - label: "Home"
    url: "/"
  - label: "Geospatial Annotation Fundamentals & Architecture"
    url: "/geospatial-annotation-fundamentals-architecture/"
  - label: "Coordinate Reference Systems in Annotation Pipelines"
    url: "/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/"
  - label: "Applying Datum Transformation Grids with pyproj"
    url: "/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/applying-datum-transformation-grids-with-pyproj/"
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
      "headline": "Applying Datum Transformation Grids with pyproj",
      "description": "Install and apply NTv2/GTX datum-shift grids in pyproj so NAD27→WGS84 and other datum transforms are centimetre-accurate, avoiding the silent metre-scale error of a fallback Helmert transform.",
      "datePublished": "2026-07-13",
      "dateModified": "2026-07-13",
      "author": {"@type": "Organization", "name": "Geospatial Annotation"},
      "publisher": {"@type": "Organization", "name": "Geospatial Annotation"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.geospatialannotation.com/"},
        {"@type": "ListItem", "position": 2, "name": "Geospatial Annotation Fundamentals & Architecture", "item": "https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/"},
        {"@type": "ListItem", "position": 3, "name": "Coordinate Reference Systems in Annotation Pipelines", "item": "https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/"},
        {"@type": "ListItem", "position": 4, "name": "Applying Datum Transformation Grids with pyproj", "item": "https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/applying-datum-transformation-grids-with-pyproj/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Applying Datum Transformation Grids with pyproj",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Enumerate candidate operations with TransformerGroup", "text": "Build a pyproj.transformer.TransformerGroup for the source and target datum and inspect its transformers and unavailable_operations to see whether a grid-based operation exists and whether its grid is installed."},
        {"@type": "HowToStep", "position": 2, "name": "Install the required grids", "text": "Enable the PROJ CDN with PROJ_NETWORK=ON or pyproj.network.set_network_enabled(True), then fetch grids on demand or pre-stage them locally with the projsync command-line tool."},
        {"@type": "HowToStep", "position": 3, "name": "Select the grid-based operation explicitly", "text": "Do not trust the default best operation blindly. Choose the TransformerGroup member whose accuracy is centimetre-scale and whose grid is available, and construct the transform with always_xy=True."},
        {"@type": "HowToStep", "position": 4, "name": "Verify against a published control point", "text": "Transform a coordinate with a known official answer, such as a national geodetic survey mark, and assert the residual is within a few centimetres before trusting the pipeline."},
        {"@type": "HowToStep", "position": 5, "name": "Compare grid vs fallback to quantify the error", "text": "Run the same point through the grid operation and through the balloted Helmert or null fallback, and log the metre-scale difference so the silent degradation is visible in CI."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why does pyproj give different answers for the same datum transform on two machines?",
          "acceptedAnswer": {"@type": "Answer", "text": "Because one machine has the NTv2 or GTX grid installed and the other does not. When the grid is missing, PROJ silently falls back to a lower-accuracy Helmert or null transform, so the two machines pick different pipelines and produce answers that differ by one to several metres. Pin the grid set with projsync and assert the chosen operation's accuracy in code so the pipeline is reproducible."}
        },
        {
          "@type": "Question",
          "name": "What is the difference between an NTv2 grid and a GTX grid?",
          "acceptedAnswer": {"@type": "Answer", "text": "NTv2 grids store horizontal latitude and longitude shifts and are used for horizontal datum transformations such as NAD27 to NAD83 or OSGB36 to ETRS89. GTX grids store a single vertical offset per cell and are used for vertical datum or geoid transformations such as NAVD88 orthometric heights to ellipsoidal heights. Modern PROJ distributes both as GeoTIFF files but the horizontal versus vertical role is unchanged."}
        },
        {
          "@type": "Question",
          "name": "How do I stop PROJ from silently using a fallback transform when the grid is missing?",
          "acceptedAnswer": {"@type": "Answer", "text": "Build a TransformerGroup and inspect unavailable_operations. If it is non-empty, the best grid-based operation cannot run and PROJ will substitute a coarser one. Raise an error in that case, or set only_best=True so PROJ refuses to substitute a lower-ranked operation, and enable network access or pre-stage grids with projsync so the accurate operation is always available."}
        },
        {
          "@type": "Question",
          "name": "Is NAD83 to WGS84 really a null transform?",
          "acceptedAnswer": {"@type": "Answer", "text": "At the roughly one to two metre level the two datums are often treated as coincident, and PROJ may apply a null transform. But modern realizations such as WGS84 G2139 and NAD83 2011 differ by more than a metre in parts of North America, and a time-dependent transform with a velocity grid is needed for centimetre work. Choose the realization-specific EPSG codes rather than the generic ones when accuracy matters."}
        }
      ]
    }
  ]
}
</script>

# Applying Datum Transformation Grids with pyproj

A datum shift such as NAD27 to NAD83, or NAD27 to WGS84, is not a simple rotation and scale — it corrects for how two reference frames disagree region by region, and that regional distortion is stored in a transformation grid. In pyproj, the accurate path uses an NTv2 grid (horizontal shifts) or a GTX grid (vertical shifts). When that grid is not installed, PROJ does not fail loudly; it silently falls back to a balloted Helmert transform or a null transform and returns coordinates that are off by one to several metres. The fix is to install the grids with `projsync` or by setting `PROJ_NETWORK=ON`, build a `pyproj.transformer.TransformerGroup`, inspect it for the grid-based operation, select that operation explicitly with `always_xy=True`, and verify the result against a published control point before trusting the pipeline.

## Why a Missing Grid Silently Corrupts Labels

Annotation pipelines routinely ingest legacy vector data — county parcels, historical survey lines, older aerial mosaics — that carries a pre-1983 datum, then reproject it into the [coordinate reference system](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) used for training. If the datum transform is wrong by two metres, every polygon vertex lands two metres from its true position. At a ground sample distance of 20 cm/pixel that is a ten-pixel offset — enough to shift a building footprint off its roof and turn correct annotations into systematically mislabelled training data. The failure is insidious because nothing errors out: the code runs, coordinates come back, and only a control-point check reveals the drift.

The root cause is how PROJ ranks operations. For a given datum pair there may be several candidate pipelines, each with a published accuracy. The most accurate uses a grid; coarser ones use a seven-parameter Helmert transform or assume the datums coincide. PROJ prefers the most accurate operation whose grid is present. Remove the grid and it quietly drops to the next candidate. Two machines with different grid sets therefore compute different coordinates for identical input, which also breaks reproducibility across a team.

<svg viewBox="0 0 640 300" role="img" aria-label="Two transformation paths between NAD27 and WGS84: the grid-based NTv2 path yields centimetre accuracy while the fallback Helmert path yields metre-scale error" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:640px;display:block;margin:1.5rem auto;">
  <title>Grid-based versus fallback datum transformation accuracy</title>
  <desc>A NAD27 source datum on the left connects to a WGS84 target datum on the right by two paths. The upper path passes through an NTv2 grid shift node and is labelled centimetre accuracy. The lower path passes through a Helmert or null fallback node and is labelled metre-scale error. The two paths arrive at target points offset from each other.</desc>
  <defs>
    <marker id="dtghead" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto">
      <polygon points="0 0, 9 3.5, 0 7" fill="currentColor" opacity="0.6"/>
    </marker>
  </defs>
  <!-- Source datum -->
  <rect x="16" y="120" width="120" height="60" rx="8" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-width="1.6" opacity="0.8"/>
  <text x="76" y="146" text-anchor="middle" font-size="13" fill="currentColor" font-family="sans-serif" font-weight="bold">NAD27</text>
  <text x="76" y="164" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6" font-family="sans-serif">EPSG:4267</text>
  <!-- Grid node (upper) -->
  <rect x="248" y="40" width="150" height="62" rx="8" fill="none" stroke="currentColor" stroke-width="1.6" opacity="0.85"/>
  <text x="323" y="66" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="bold">NTv2 grid shift</text>
  <text x="323" y="84" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6" font-family="sans-serif">us_noaa_conus.tif</text>
  <!-- Fallback node (lower) -->
  <rect x="248" y="198" width="150" height="62" rx="8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="6 4" opacity="0.6"/>
  <text x="323" y="224" text-anchor="middle" font-size="12" fill="currentColor" opacity="0.75" font-family="sans-serif" font-weight="bold">Helmert / null</text>
  <text x="323" y="242" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.55" font-family="sans-serif">no grid installed</text>
  <!-- Target datum, two arrival points -->
  <rect x="504" y="120" width="120" height="60" rx="8" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-width="1.6" opacity="0.8"/>
  <text x="564" y="146" text-anchor="middle" font-size="13" fill="currentColor" font-family="sans-serif" font-weight="bold">WGS84</text>
  <text x="564" y="164" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6" font-family="sans-serif">EPSG:4326</text>
  <!-- Upper path -->
  <line x1="136" y1="138" x2="246" y2="80" stroke="currentColor" stroke-width="1.8" opacity="0.75" marker-end="url(#dtghead)"/>
  <line x1="398" y1="80" x2="508" y2="134" stroke="currentColor" stroke-width="1.8" opacity="0.75" marker-end="url(#dtghead)"/>
  <text x="323" y="120" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85" font-family="sans-serif">accuracy &#8776; 1&#8211;5 cm</text>
  <!-- Lower path -->
  <line x1="136" y1="162" x2="246" y2="220" stroke="currentColor" stroke-width="1.6" stroke-dasharray="6 4" opacity="0.5" marker-end="url(#dtghead)"/>
  <line x1="398" y1="220" x2="508" y2="166" stroke="currentColor" stroke-width="1.6" stroke-dasharray="6 4" opacity="0.5" marker-end="url(#dtghead)"/>
  <text x="323" y="284" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.6" font-family="sans-serif">error &#8776; 1&#8211;100 m</text>
</svg>

## Step-by-Step Implementation

Install the pinned toolchain once:

```bash
pip install pyproj==3.6.1
```

pyproj 3.6.1 ships with PROJ 9.3, which distributes all shift grids as GeoTIFF and can stream them from the PROJ content delivery network on demand.

### Step 1 — Enumerate Candidate Operations

`TransformerGroup` returns every operation PROJ knows for a datum pair, ranked by accuracy, plus a list of operations whose grids are missing. Inspect it before choosing anything:

```python
from pyproj.transformer import TransformerGroup

def describe_operations(source_crs: str, target_crs: str) -> None:
    """Print each candidate operation, its accuracy, and grid availability."""
    tg: TransformerGroup = TransformerGroup(source_crs, target_crs, always_xy=True)
    print(f"available operations: {len(tg.transformers)}")
    for op in tg.transformers:
        acc: float | None = op.operations[0].grids[0].available if op.operations and op.operations[0].grids else None
        print(f"  {op.description!r}  accuracy={op.accuracy} m")
    print(f"unavailable (grid missing): {len(tg.unavailable_operations)}")
    for op in tg.unavailable_operations:
        print(f"  MISSING -> {op.name}")

describe_operations("EPSG:4267", "EPSG:4326")  # NAD27 -> WGS84
```

If `unavailable_operations` is non-empty, the most accurate path cannot run yet and PROJ will substitute a coarser one. That is the silent-fallback condition you must fix.

### Step 2 — Enable the Network or Pre-Stage Grids

The fastest fix is to let PROJ fetch grids on demand from its CDN. Enable it in code or by environment variable:

```python
import pyproj

pyproj.network.set_network_enabled(active=True)
print("network enabled:", pyproj.network.is_network_enabled())
```

Equivalently, export `PROJ_NETWORK=ON` before the process starts. For reproducible, offline builds — the right choice for CI and containers — pre-stage the exact grids instead of streaming them at runtime with the `projsync` command-line tool:

```bash
# Download only the grids you need (fast, deterministic)
projsync --file us_noaa_conus.tif
projsync --file ca_nrc_ntv2_0.tif

# Or fetch every grid intersecting a bounding box
projsync --bbox -125,24,-66,50 --target-dir /opt/proj_data
```

Pin the grid set in your image so every machine resolves the same operation. Point PROJ at a fixed directory with `PROJ_DATA=/opt/proj_data` if you stage grids outside the default location.

### Step 3 — Select the Grid-Based Operation Explicitly

Do not trust the default `Transformer.from_crs()` result blindly, because it degrades silently. Filter the group for an available, centimetre-accurate operation and construct the transform from it:

```python
from pyproj import Transformer
from pyproj.transformer import TransformerGroup

def best_grid_transformer(source_crs: str, target_crs: str) -> Transformer:
    """Return the most accurate transformer whose grids are all installed."""
    tg: TransformerGroup = TransformerGroup(source_crs, target_crs, always_xy=True)
    if tg.unavailable_operations:
        names = ", ".join(op.name for op in tg.unavailable_operations)
        raise RuntimeError(f"grid-based operation unavailable, install grids: {names}")
    # tg.transformers is sorted best-first; the top entry is grid-based when present
    return tg.transformers[0]

transformer: Transformer = best_grid_transformer("EPSG:4267", "EPSG:4326")
print(transformer.description)
```

Passing `only_best=True` to `Transformer.from_crs()` is the stricter alternative: PROJ then refuses to substitute a lower-ranked operation and errors instead of degrading.

### Step 4 — Verify Against a Published Control Point

A datum transform is only trustworthy once it reproduces an official answer. Pick a coordinate whose value is published by a national survey and assert the residual:

```python
def verify_control_point(transformer: Transformer,
                         src_lon: float, src_lat: float,
                         expected_lon: float, expected_lat: float,
                         tol_deg: float = 5e-6) -> None:
    """Assert the transform reproduces a known control point (~0.5 m at tol_deg=5e-6)."""
    out_lon, out_lat = transformer.transform(src_lon, src_lat)
    dlon: float = abs(out_lon - expected_lon)
    dlat: float = abs(out_lat - expected_lat)
    assert dlon < tol_deg and dlat < tol_deg, (
        f"control point drift too large: dlon={dlon:.7f}, dlat={dlat:.7f} degrees"
    )
    print(f"verified: ({out_lon:.7f}, {out_lat:.7f})")
```

Because `always_xy=True` is set on the group, inputs and outputs are always `(longitude, latitude)` regardless of each CRS's declared axis order — the single most common source of a swapped-coordinate bug.

### Step 5 — Compare Grid vs Fallback to Quantify the Error

Make the silent degradation visible by transforming the same point both ways and logging the difference. Run this assertion in CI so a missing grid fails the build instead of shipping metre-scale error:

```python
from pyproj import Transformer, Geod

def grid_vs_fallback_metres(source_crs: str, target_crs: str,
                            lon: float, lat: float) -> float:
    """Return the ground distance in metres between grid and fallback results."""
    grid: Transformer = best_grid_transformer(source_crs, target_crs)
    fallback: Transformer = Transformer.from_crs(
        source_crs, target_crs, always_xy=True, allow_ballpark=True
    )
    gx, gy = grid.transform(lon, lat)
    fx, fy = fallback.transform(lon, lat)
    geod: Geod = Geod(ellps="WGS84")
    _, _, dist = geod.inv(gx, gy, fx, fy)
    return dist

delta: float = grid_vs_fallback_metres("EPSG:4267", "EPSG:4326", -96.0, 41.0)
print(f"grid vs fallback: {delta:.2f} m")
```

## Common Datum Pairs and Their Grids

The error-without-grid column is the ground distance you inherit if PROJ falls back. First reproject into a metric CRS such as [`EPSG:32614`](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) (UTM 14N) before measuring any of these residuals as distances.

| Source → target | Region | Grid file (kind) | Error without grid |
|---|---|---|---|
| NAD27 → NAD83/WGS84 | CONUS | `us_noaa_conus.tif` (NADCON, horizontal) | 10 – 100 m |
| NAD27 → NAD83 | Canada | `ca_nrc_ntv2_0.tif` (NTv2, horizontal) | up to 100 m |
| OSGB36 → ETRS89/WGS84 | Great Britain | `uk_os_OSTN15_NTv2_OSGBtoETRS.tif` (NTv2) | up to 120 m |
| NTF → RGF93 | France | `fr_ign_ntf_r93.tif` (NTv2, horizontal) | 1 – 3 m |
| GDA94 → GDA2020 | Australia | `au_icsm_GDA94_GDA2020_conformal.tif` (NTv2) | ~1.8 m |
| NAVD88 height → ellipsoid | US | `us_noaa_g2018u0.tif` (GTX, vertical geoid) | 20 – 40 m |

Horizontal grids (NTv2) and vertical grids (GTX) are independent: a pipeline that reprojects points needs the NTv2 grid, while one that converts orthometric to ellipsoidal heights needs the GTX geoid grid. Getting the horizontal shift right does nothing for elevations.

## Common Errors and Fixes

**Transform succeeds but coordinates are off by metres**
Root cause: the NTv2 grid is not installed, so PROJ used a balloted Helmert or null fallback.
Fix: build a `TransformerGroup`, check that `unavailable_operations` is empty, and install the named grid with `projsync` or `PROJ_NETWORK=ON`.

**`inf` or unchanged coordinates returned**
Root cause: `allow_ballpark=False` combined with a missing grid means no operation qualifies, so PROJ returns `inf`.
Fix: install the grid, or intentionally set `allow_ballpark=True` only when metre-scale accuracy is acceptable and documented.

**Answers differ between a laptop and CI**
Root cause: different grid sets on each machine cause PROJ to pick different operations.
Fix: pin grids into the container image with `projsync`, set `PROJ_DATA` to that directory, and assert the chosen `transformer.description` in a test.

**Latitude and longitude come back swapped**
Root cause: the target CRS declares latitude-first axis order and `always_xy` was not set.
Fix: pass `always_xy=True` to `TransformerGroup` and `Transformer.from_crs()` so every call is `(lon, lat)`.

**Horizontal fix applied but elevations still wrong**
Root cause: an NTv2 horizontal grid does not correct vertical datums.
Fix: add the matching GTX geoid grid (for example `us_noaa_g2018u0.tif`) and run a separate vertical transform.

## Related

- [CRS Roundtrip Testing with pyproj](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/crs-roundtrip-testing-with-pyproj/) — assert that a reproject-out-and-back cycle stays under tolerance, the natural companion check to a verified datum grid
- [Calculating IoU Thresholds for Geospatial Object Detection](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/calculating-iou-thresholds-for-geospatial-object-detection/) — why area and overlap must be computed in a metric CRS after any datum correction
- [Coordinate Reference Systems in Annotation Pipelines](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) — the broader topic area covering CRS contracts, axis order, and reprojection across a pipeline
- [Preserving Metadata Across Dataset Versions](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/preserving-metadata-across-dataset-versions/) — record the exact datum, grid file, and operation description alongside every versioned export

This guide is one specialised task within [Coordinate Reference Systems in Annotation Pipelines](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/), which is itself part of [Geospatial Annotation Fundamentals & Architecture](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/).
