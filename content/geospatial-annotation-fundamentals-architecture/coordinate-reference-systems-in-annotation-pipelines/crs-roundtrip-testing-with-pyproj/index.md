---
title: "CRS Roundtrip Testing with pyproj"
description: "Write a CRS roundtrip test that reprojects geometries out and back and asserts coordinate drift stays under tolerance — catching axis-order bugs and lossy transforms before they corrupt training labels."
slug: "crs-roundtrip-testing-with-pyproj"
type: "long_tail"
breadcrumb:
  - label: "Home"
    url: "/"
  - label: "Geospatial Annotation Fundamentals & Architecture"
    url: "/geospatial-annotation-fundamentals-architecture/"
  - label: "Coordinate Reference Systems in Annotation Pipelines"
    url: "/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/"
  - label: "CRS Roundtrip Testing with pyproj"
    url: "/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/crs-roundtrip-testing-with-pyproj/"
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
      "headline": "CRS Roundtrip Testing with pyproj",
      "description": "Write a CRS roundtrip test that reprojects geometries out and back and asserts coordinate drift stays under tolerance — catching axis-order bugs and lossy transforms before they corrupt training labels.",
      "datePublished": "2026-07-13",
      "dateModified": "2026-07-13",
      "author": {"@type": "Organization", "name": "Geospatial Annotation"},
      "publisher": {"@type": "Organization", "name": "Geospatial Annotation"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://geospatialannotation.com/"},
        {"@type": "ListItem", "position": 2, "name": "Geospatial Annotation Fundamentals & Architecture", "item": "https://geospatialannotation.com/geospatial-annotation-fundamentals-architecture/"},
        {"@type": "ListItem", "position": 3, "name": "Coordinate Reference Systems in Annotation Pipelines", "item": "https://geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/"},
        {"@type": "ListItem", "position": 4, "name": "CRS Roundtrip Testing with pyproj", "item": "https://geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/crs-roundtrip-testing-with-pyproj/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "CRS Roundtrip Testing with pyproj",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Assemble known control points", "text": "Collect a small set of well-distributed reference coordinates in the source CRS that span the extent of your annotation tiles, including at least one point near each corner of the working area."},
        {"@type": "HowToStep", "position": 2, "name": "Build forward and back transformers", "text": "Create two pyproj Transformer objects with always_xy=True — one from source to target CRS and one from target back to source — so axis order is explicit and reproducible."},
        {"@type": "HowToStep", "position": 3, "name": "Run the roundtrip and measure drift", "text": "Project each control point source to target and back, then compute the Euclidean distance between the original and returned coordinate as the per-point drift."},
        {"@type": "HowToStep", "position": 4, "name": "Assert the tolerance in source units", "text": "Compare the maximum drift against a tolerance expressed in the source CRS units — degrees for geographic, metres for projected — converting where necessary so the comparison is dimensionally correct."},
        {"@type": "HowToStep", "position": 5, "name": "Wrap the check as a pytest gate", "text": "Parametrize the roundtrip over your CRS pairs and control points inside a pytest test so every commit re-runs the drift assertion in continuous integration."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why does a CRS roundtrip drift by tens of metres instead of near zero?",
          "acceptedAnswer": {"@type": "Answer", "text": "The dominant cause is a missing datum-shift grid. When pyproj cannot find the NTv2 or GTX grid for a datum transform it silently falls back to a null or approximate Helmert transform, and the source-to-target-to-source path no longer cancels. The residual you measure is roughly the difference between the exact grid shift and the fallback, which is commonly one to a few metres for NAD27 or ED50 and can exceed ten metres. Install the transform grids with pyproj-data or projsync and the drift collapses to sub-centimetre."}
        },
        {
          "@type": "Question",
          "name": "What tolerance should a roundtrip test assert?",
          "acceptedAnswer": {"@type": "Answer", "text": "Match the tolerance to the transform class. For an equal-datum projection change such as WGS84 geographic to UTM, expect sub-millimetre drift and assert under 1e-6 metres. For a grid-based datum transform assert under 0.01 metres (1 cm). For a published Helmert or seven-parameter transform assert under 0.05 to 0.5 metres depending on the parameter set. Always express the tolerance in the units of the coordinates you are comparing and never compare a degree drift against a metre tolerance."}
        },
        {
          "@type": "Question",
          "name": "Does always_xy=True affect roundtrip results?",
          "acceptedAnswer": {"@type": "Answer", "text": "It affects correctness, not the residual. always_xy=True forces both transformers to accept and emit longitude-latitude or easting-northing order regardless of the authority axis definition. If one transformer uses authority order and the other uses xy order, the roundtrip swaps axes and drift explodes to tens of degrees. Set always_xy=True identically on the forward and back transformer so the only difference between them is direction."}
        },
        {
          "@type": "Question",
          "name": "How many control points does a roundtrip test need?",
          "acceptedAnswer": {"@type": "Answer", "text": "Use enough to sample the working extent rather than a single centroid. A practical minimum is five points: one near each corner of the annotation area plus the centre, because datum-shift residuals and projection distortion vary across the extent. For a dataset spanning multiple UTM zones add a representative point per zone. The test cost is negligible, so favour coverage over minimalism."}
        }
      ]
    }
  ]
}
</script>

# CRS Roundtrip Testing with pyproj

A CRS roundtrip test reprojects a set of known control points from the source coordinate reference system to the target and back to the source, then asserts that the maximum coordinate drift stays below a tolerance — under 1 cm for grid-based datum transforms, sub-millimetre for a plain projection change. That single assertion catches the three failures that silently corrupt geospatial training labels: axis-order bugs, missing datum-shift grids, and lossy datum operations. Build a forward and a back `pyproj` `Transformer` with `always_xy=True`, run your control points through both, measure the residual, and fail the build when it exceeds the tolerance for the transform class you are exercising. This guide shows the runnable pattern and the tolerance table to calibrate it against.

## Why Roundtrip Drift Predicts Corrupted Labels

Reprojection sits on the critical path of almost every annotation pipeline: imagery arrives in one [coordinate reference system](/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/), annotators draw in another, and the training exporter writes a third. Every hop is a `Transformer` call, and a wrong one does not raise — it returns plausible numbers that are quietly off by metres. A polygon shifted two metres north still looks like a valid building footprint in a viewer, but it now disagrees with the pixels it is supposed to label, and the model learns the offset as signal.

The roundtrip is powerful because it is self-checking. A correct forward transform composed with a correct inverse is the identity, so the returned coordinate must equal the original to within numerical noise. Any measurable residual means one of the two directions is wrong, and the magnitude tells you which failure class you hit. A residual of tens of degrees is an axis swap. A residual of one to ten metres is a missing grid falling back to an approximate shift. A residual of a few millimetres on a supposedly exact transform points at a lossy intermediate step. You do not need ground truth to run the check — the source coordinate is its own reference — which is what makes it cheap enough to run on every commit.

<svg viewBox="0 0 640 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Diagram of a CRS roundtrip: a control point is projected from source to target and back to source, its drift measured on a ruler and compared against a tolerance gate that passes or fails" style="width:100%;max-width:640px;display:block;margin:1.5rem auto;">
  <title>CRS roundtrip drift measurement and tolerance gate</title>
  <desc>A control point in the source CRS is projected forward to the target CRS, then back to the source. The original and returned points are compared on a drift ruler measured in metres. The drift value enters a tolerance gate: if it is below the tolerance the test passes, otherwise it fails.</desc>
  <defs>
    <marker id="rtarrow" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto">
      <polygon points="0 0, 9 3.5, 0 7" fill="currentColor" opacity="0.55"/>
    </marker>
  </defs>
  <!-- Source box -->
  <rect x="14" y="40" width="150" height="88" rx="8" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>
  <text x="89" y="66" text-anchor="middle" font-size="12" fill="currentColor" opacity="0.85" font-family="sans-serif" font-weight="bold">Source CRS</text>
  <text x="89" y="84" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.55" font-family="sans-serif">EPSG:4326</text>
  <circle cx="89" cy="106" r="4" fill="currentColor" opacity="0.85"/>
  <text x="89" y="122" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.5" font-family="sans-serif">control point</text>
  <!-- Target box -->
  <rect x="245" y="40" width="150" height="88" rx="8" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>
  <text x="320" y="66" text-anchor="middle" font-size="12" fill="currentColor" opacity="0.85" font-family="sans-serif" font-weight="bold">Target CRS</text>
  <text x="320" y="84" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.55" font-family="sans-serif">EPSG:32633</text>
  <circle cx="320" cy="106" r="4" fill="currentColor" opacity="0.85"/>
  <!-- Returned box -->
  <rect x="476" y="40" width="150" height="88" rx="8" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>
  <text x="551" y="66" text-anchor="middle" font-size="12" fill="currentColor" opacity="0.85" font-family="sans-serif" font-weight="bold">Source CRS</text>
  <text x="551" y="84" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.55" font-family="sans-serif">returned</text>
  <circle cx="549" cy="106" r="4" fill="currentColor" opacity="0.85"/>
  <circle cx="556" cy="106" r="4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2 2" opacity="0.7"/>
  <!-- Forward / back arrows -->
  <line x1="166" y1="84" x2="243" y2="84" stroke="currentColor" stroke-width="1.5" opacity="0.5" marker-end="url(#rtarrow)"/>
  <text x="204" y="76" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.55" font-family="sans-serif">forward</text>
  <line x1="397" y1="84" x2="474" y2="84" stroke="currentColor" stroke-width="1.5" opacity="0.5" marker-end="url(#rtarrow)"/>
  <text x="436" y="76" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.55" font-family="sans-serif">back</text>
  <!-- Drift ruler -->
  <line x1="476" y1="168" x2="626" y2="168" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <line x1="476" y1="163" x2="476" y2="173" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <line x1="513" y1="164" x2="513" y2="172" stroke="currentColor" stroke-width="1" opacity="0.35"/>
  <line x1="551" y1="163" x2="551" y2="173" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <line x1="588" y1="164" x2="588" y2="172" stroke="currentColor" stroke-width="1" opacity="0.35"/>
  <line x1="626" y1="163" x2="626" y2="173" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="551" y="158" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.6" font-family="sans-serif">drift ruler (m)</text>
  <text x="476" y="186" text-anchor="middle" font-size="8" fill="currentColor" opacity="0.45" font-family="sans-serif">0</text>
  <text x="626" y="186" text-anchor="middle" font-size="8" fill="currentColor" opacity="0.45" font-family="sans-serif">0.02</text>
  <!-- drift measurement -->
  <text x="330" y="172" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8" font-family="sans-serif">max drift = ‖original − returned‖</text>
  <line x1="330" y1="180" x2="470" y2="168" stroke="currentColor" stroke-width="1" opacity="0.3" stroke-dasharray="3 3"/>
  <!-- Tolerance gate -->
  <rect x="200" y="222" width="240" height="60" rx="8" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-width="1.5" opacity="0.55"/>
  <text x="320" y="246" text-anchor="middle" font-size="12" fill="currentColor" opacity="0.9" font-family="sans-serif" font-weight="bold">Tolerance gate</text>
  <text x="320" y="264" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6" font-family="sans-serif">max drift &lt; tol ?</text>
  <line x1="330" y1="192" x2="320" y2="220" stroke="currentColor" stroke-width="1.5" opacity="0.45" marker-end="url(#rtarrow)"/>
  <!-- pass / fail -->
  <text x="120" y="256" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85" font-family="sans-serif" font-weight="bold">PASS</text>
  <line x1="198" y1="252" x2="160" y2="252" stroke="currentColor" stroke-width="1.5" opacity="0.45" marker-end="url(#rtarrow)"/>
  <text x="520" y="256" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85" font-family="sans-serif" font-weight="bold">FAIL</text>
  <line x1="442" y1="252" x2="480" y2="252" stroke="currentColor" stroke-width="1.5" opacity="0.45" marker-end="url(#rtarrow)"/>
</svg>

## Step-by-Step Implementation

Install the pinned toolchain once:

```bash
pip install pyproj==3.6.1 numpy==1.26.4 pytest==8.2.2
```

### Step 1 — Define Control Points and CRS Pairs

Control points are ordinary coordinates in the source CRS, chosen to span the extent of your annotation tiles. Use the corners and the centre rather than a single point, because datum residuals vary across an area. Coordinates here are `(lon, lat)` in `[EPSG:4326](/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/)`:

```python
from dataclasses import dataclass

@dataclass(frozen=True)
class RoundtripCase:
    source_crs: str
    target_crs: str
    tolerance_m: float          # tolerance expressed in metres on the ground
    control_points: list[tuple[float, float]]   # (x, y) in source CRS order

CENTRAL_EUROPE = RoundtripCase(
    source_crs="EPSG:4326",
    target_crs="EPSG:32633",    # UTM zone 33N
    tolerance_m=1e-3,           # equal-datum projection change: sub-mm expected
    control_points=[
        (13.30, 52.45),         # SW corner
        (13.60, 52.45),         # SE corner
        (13.30, 52.60),         # NW corner
        (13.60, 52.60),         # NE corner
        (13.45, 52.52),         # centre
    ],
)
```

### Step 2 — Build Forward and Back Transformers

Both transformers must carry `always_xy=True` so axis order is explicit and identical in each direction. The only difference between them is which CRS is source and which is target:

```python
from pyproj import Transformer

def build_transformers(
    source_crs: str,
    target_crs: str,
) -> tuple[Transformer, Transformer]:
    """Return (forward, back) transformers that share xy axis order."""
    forward = Transformer.from_crs(source_crs, target_crs, always_xy=True)
    back = Transformer.from_crs(target_crs, source_crs, always_xy=True)
    return forward, back
```

### Step 3 — Run the Roundtrip and Measure Drift

Project each point forward then back, and measure the residual. Because the source CRS here is geographic (degrees), convert the degree residual to an approximate ground distance in metres so the comparison against a metric tolerance is dimensionally correct. A local scale factor is sufficient for a tolerance check:

```python
import math
import numpy as np

def degrees_to_metres(
    dlon: float,
    dlat: float,
    at_lat_deg: float,
) -> float:
    """Approximate ground distance for a small lon/lat delta near a latitude."""
    m_per_deg_lat = 111_132.0
    m_per_deg_lon = 111_320.0 * math.cos(math.radians(at_lat_deg))
    return math.hypot(dlon * m_per_deg_lon, dlat * m_per_deg_lat)

def max_roundtrip_drift(case: RoundtripCase) -> float:
    """Return the largest source→target→source drift, in metres, over all points."""
    forward, back = build_transformers(case.source_crs, case.target_crs)
    drifts: list[float] = []
    for x, y in case.control_points:
        tx, ty = forward.transform(x, y)
        rx, ry = back.transform(tx, ty)
        if case.source_crs.upper().endswith("4326"):
            drift = degrees_to_metres(rx - x, ry - y, at_lat_deg=y)
        else:
            drift = math.hypot(rx - x, ry - y)   # already metric
        drifts.append(drift)
    return float(np.max(drifts))
```

### Step 4 — Assert the Tolerance

The assertion is one line, but the message matters — when the gate fails months later, the reported drift and tolerance are what let an engineer classify the failure immediately:

```python
def assert_roundtrip(case: RoundtripCase) -> float:
    """Raise AssertionError if max drift exceeds the case tolerance."""
    drift = max_roundtrip_drift(case)
    assert drift <= case.tolerance_m, (
        f"{case.source_crs}->{case.target_crs} roundtrip drift "
        f"{drift:.4g} m exceeds tolerance {case.tolerance_m:.4g} m — "
        f"check axis order and datum-shift grids"
    )
    return drift
```

### Step 5 — Wrap It as a pytest Gate

Parametrize over every CRS pair your pipeline touches so a single test file guards the whole reprojection surface. Add the grid-based cases you rely on — the [datum transformation grids applied with pyproj](/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/applying-datum-transformation-grids-with-pyproj/) determine whether those cases hit their tight tolerance or fall back and fail:

```python
import pytest

CASES = [
    CENTRAL_EUROPE,
    RoundtripCase(
        source_crs="EPSG:4267",     # NAD27
        target_crs="EPSG:4326",     # WGS84 (needs an NTv2 grid)
        tolerance_m=0.01,           # grid-based datum transform: sub-cm
        control_points=[(-122.30, 47.60), (-122.30, 47.62), (-122.28, 47.61)],
    ),
]

@pytest.mark.parametrize("case", CASES, ids=lambda c: f"{c.source_crs}->{c.target_crs}")
def test_crs_roundtrip_within_tolerance(case: RoundtripCase) -> None:
    drift = assert_roundtrip(case)
    assert drift >= 0.0
```

Run it with `pytest -q`. A green result certifies that every registered transform is invertible to within its tolerance; a red result names the offending CRS pair and the measured drift.

## Tolerance by Transform Type

Drift is not a single number — the achievable residual depends on what the transform actually does. Assert against the class of transform you are exercising, not a universal constant:

| Transform type | Example pair | Expected roundtrip drift | Tolerance to assert |
|---|---|---|---|
| Projection, same datum | `EPSG:4326` → `EPSG:32633` | Numerical noise | < 1e-6 m (1 µm) |
| Web Mercator reprojection | `EPSG:4326` → `EPSG:3857` | Sub-millimetre | < 1e-3 m |
| Grid-based datum shift (NTv2/GTX) | `EPSG:4267` → `EPSG:4326` | Grid interpolation residual | < 0.01 m (1 cm) |
| Published Helmert (7-parameter) | `EPSG:4230` → `EPSG:4326` | Parameter fit residual | < 0.05–0.5 m |
| Fallback / no grid available | any datum shift, grid missing | 1–15 m (silent) | test should FAIL |

The last row is the whole point of the exercise. When the correct grid is present the transform is invertible to a centimetre; when it is missing, `pyproj` substitutes an approximate operation and the roundtrip no longer cancels. A tolerance of 1 cm on a grid-based case turns that silent substitution into a red build.

## Common Errors and Fixes

**Roundtrip drift is tens of degrees, not centimetres**
Root cause: axis-order mismatch — one transformer was built with `always_xy=True` and the other without, so latitude and longitude are swapped on the return leg.
Fix: set `always_xy=True` identically on both the forward and back `Transformer`, and never mix a transformer built one way with one built the other.

**Drift is a stable 1–10 m across all points**
Root cause: the datum-shift grid for the transform is not installed, so `pyproj` fell back to a null or Helmert approximation and the two directions do not cancel.
Fix: install the grids with `projsync --all` or the `pyproj-data` package, then confirm with `Transformer.from_crs(...).description` that the operation names the expected grid rather than a ballpark transform.

**The test passes at 1e-6 but should have caught a real shift**
Root cause: the tolerance was compared in the wrong units — a drift measured in degrees was tested against a tolerance meant for metres, so a real 2 m error (about 2e-5 degrees) slipped under a `1e-6` bar that looked strict.
Fix: convert the residual to ground metres before comparison, as `degrees_to_metres` does, and always state the tolerance in the same units you measure the drift in.

## Related

- [Coordinate Reference Systems in Annotation Pipelines](/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) — the parent guide covering CRS contracts, datum management, and reprojection patterns that a roundtrip test defends
- [Applying Datum Transformation Grids with pyproj](/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/applying-datum-transformation-grids-with-pyproj/) — install and verify the NTv2/GTX grids whose absence a roundtrip test is designed to expose
- [CI/CD gates for annotation datasets](/labeling-workflows-toolchain-integration/ci-cd-gates-for-annotation-datasets/) — wire the pytest roundtrip check into a pipeline that blocks a bad reprojection from reaching training
- [Calculating IoU Thresholds for Geospatial Object Detection](/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/calculating-iou-thresholds-for-geospatial-object-detection/) — a companion reprojection-sensitive calculation that assumes the transforms a roundtrip test validates

This guide covers one focused check within [Coordinate Reference Systems in Annotation Pipelines](/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/), which is itself part of [Geospatial Annotation Fundamentals & Architecture](/geospatial-annotation-fundamentals-architecture/).
