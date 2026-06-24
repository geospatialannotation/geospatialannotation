---
title: "Calculating IoU Thresholds for Geospatial Object Detection"
description: "How to compute projection-aware Intersection over Union (IoU) for aerial and satellite pipelines: CRS transformation with pyproj, topology validation with shapely, and GSD-calibrated threshold selection."
slug: "calculating-iou-thresholds-for-geospatial-object-detection"
type: "long_tail"
breadcrumb:
  - label: "Home"
    url: "/"
  - label: "Geospatial Annotation Fundamentals & Architecture"
    url: "/geospatial-annotation-fundamentals-architecture/"
  - label: "Coordinate Reference Systems in Annotation Pipelines"
    url: "/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/"
  - label: "Calculating IoU Thresholds for Geospatial Object Detection"
    url: "/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/calculating-iou-thresholds-for-geospatial-object-detection/"
datePublished: "2025-06-01"
dateModified: "2026-06-24"
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
      "headline": "Calculating IoU Thresholds for Geospatial Object Detection",
      "description": "How to compute projection-aware Intersection over Union (IoU) for aerial and satellite pipelines: CRS transformation with pyproj, topology validation with shapely, and GSD-calibrated threshold selection.",
      "datePublished": "2025-06-01",
      "dateModified": "2026-06-24",
      "author": {"@type": "Organization", "name": "Geospatial Annotation"},
      "publisher": {"@type": "Organization", "name": "Geospatial Annotation"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://geospatialannotation.com/"},
        {"@type": "ListItem", "position": 2, "name": "Geospatial Annotation Fundamentals & Architecture", "item": "https://geospatialannotation.com/geospatial-annotation-fundamentals-architecture/"},
        {"@type": "ListItem", "position": 3, "name": "Coordinate Reference Systems in Annotation Pipelines", "item": "https://geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/"},
        {"@type": "ListItem", "position": 4, "name": "Calculating IoU Thresholds for Geospatial Object Detection", "item": "https://geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/calculating-iou-thresholds-for-geospatial-object-detection/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Calculating IoU Thresholds for Geospatial Object Detection",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Reproject geometries to a local metric CRS", "text": "Use pyproj.Transformer to convert all bounding boxes or polygons from WGS84 (EPSG:4326) to a metric projection such as UTM before any area computation."},
        {"@type": "HowToStep", "position": 2, "name": "Validate topology with shapely.make_valid", "text": "Apply make_valid() to every geometry before intersection to eliminate self-intersections, unclosed rings, and degenerate shapes that return silent zero-area results."},
        {"@type": "HowToStep", "position": 3, "name": "Compute intersection and union in metric space", "text": "Call .intersection() and .union() on the projected shapely geometries so areas are in square metres rather than square degrees."},
        {"@type": "HowToStep", "position": 4, "name": "Select a threshold calibrated to GSD and object scale", "text": "Choose an IoU cutoff from the mission-type table (0.35–0.75) and lower it proportionally as GSD increases above 30 cm/pixel to avoid penalising valid detections for sub-pixel annotation variance."},
        {"@type": "HowToStep", "position": 5, "name": "Apply size-stratified evaluation", "text": "Bin predictions by projected area (small / medium / large) and compute per-bin mAP rather than a single aggregate score to expose scale-dependent model weaknesses."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why does IoU calculated on EPSG:4326 coordinates produce wrong results?",
          "acceptedAnswer": {"@type": "Answer", "text": "WGS84 uses decimal degrees. A degree of longitude shrinks from ~111 km at the equator to near zero at the poles, so area calculated in degree-squared units is geographically meaningless. The intersection of two identically-sized boxes at 60°N is numerically smaller than the same boxes at 0°, producing artificially low IoU scores and false negatives during model evaluation."}
        },
        {
          "@type": "Question",
          "name": "What IoU threshold should I use for vehicle detection from drone imagery at 5 cm/pixel?",
          "acceptedAnswer": {"@type": "Answer", "text": "Use 0.50–0.60. At 5 cm/pixel the annotation boundary is sub-centimetre precise, so a 0.50 floor is achievable without penalising well-localised predictions. Scale toward 0.60 if your annotation protocol enforces tight polygon fits rather than loose bounding boxes."}
        },
        {
          "@type": "Question",
          "name": "How do I pick the right UTM zone for a global dataset?",
          "acceptedAnswer": {"@type": "Answer", "text": "Compute each annotation's centroid longitude, divide by 6, add 31, round to the nearest integer, and prepend 'EPSG:326' (northern) or 'EPSG:327' (southern) to get the local UTM EPSG code. For a dataset spanning multiple zones, use EPSG:3857 (Web Mercator) as a pragmatic fallback — distortion is acceptable for area-ratio comparisons within tiles under ~50 km wide."}
        },
        {
          "@type": "Question",
          "name": "What causes shapely to return 0.0 intersection for visually overlapping polygons?",
          "acceptedAnswer": {"@type": "Answer", "text": "Self-intersecting rings, duplicate vertices, or polygons whose shared edge sits exactly on a floating-point boundary all produce empty intersections. Run make_valid() before every intersection call, and apply polygon.buffer(0) as a fallback repair that forces ring closure without changing the exterior shape."}
        }
      ]
    }
  ]
}
</script>

# Calculating IoU Thresholds for Geospatial Object Detection

Reliable IoU evaluation for aerial and satellite object detection requires three things that standard computer vision toolkits do not provide out of the box: reprojection from angular coordinates to a local metric [coordinate reference system](/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/), topology validation before any area computation, and threshold values calibrated to ground sample distance (GSD) and mission type. Transform all geometries to a UTM or state-plane CRS using `pyproj` 3.6+, validate with `shapely` 2.0+ `make_valid()`, then apply adaptive cutoffs in the 0.35–0.75 range rather than a fixed 0.50. Skipping any of these steps introduces projection-induced bias that silently corrupts precision/recall curves.

## Why Unprojected IoU Breaks Aerial Pipelines

`EPSG:4326` (WGS84) stores coordinates as decimal degrees. A degree of longitude spans roughly 111 km at the equator but shrinks to near zero at high latitudes. When you compute intersection area directly in degree-squared units, a building in Helsinki occupies a smaller angular footprint than an identical building in Nairobi — even though both are the same physical size on the ground. The result is artificially suppressed IoU scores, false negatives during evaluation, and precision/recall curves that shift as your dataset spans different latitudes.

Varying GSD compounds the problem. An annotation tolerance of ±2 pixels at 10 cm/pixel represents ±20 cm on the ground; at 50 cm/pixel the same pixel tolerance is ±100 cm. A 0.50 threshold that passes valid detections at high resolution will reject them at coarser resolution purely because boundary pixelation widens the mismatch — not because the model performed worse.

<svg viewBox="0 0 760 260" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Diagram showing IoU pipeline: WGS84 input, reproject to metric CRS, validate topology, compute intersection/union in square metres, apply GSD-calibrated threshold" style="width:100%;max-width:760px;display:block;margin:1.5rem auto;">
  <title>Projection-aware IoU calculation pipeline</title>
  <desc>Five sequential stages: WGS84 coordinates enter, are reprojected to a metric CRS, validated for topology, used to compute intersection and union in square metres, and finally matched against a GSD-calibrated IoU threshold.</desc>
  <defs>
    <marker id="arr" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
      <polygon points="0 0, 8 3, 0 6" fill="currentColor" opacity="0.55"/>
    </marker>
  </defs>
  <!-- Stage boxes -->
  <rect x="10" y="90" width="120" height="56" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.35"/>
  <text x="70" y="113" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85" font-family="sans-serif">Input coords</text>
  <text x="70" y="129" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6" font-family="sans-serif">EPSG:4326</text>
  <rect x="160" y="90" width="130" height="56" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.35"/>
  <text x="225" y="113" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85" font-family="sans-serif">Reproject</text>
  <text x="225" y="129" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6" font-family="sans-serif">pyproj → UTM</text>
  <rect x="320" y="90" width="130" height="56" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.35"/>
  <text x="385" y="113" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85" font-family="sans-serif">Validate</text>
  <text x="385" y="129" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6" font-family="sans-serif">make_valid()</text>
  <rect x="480" y="90" width="130" height="56" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.35"/>
  <text x="545" y="109" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85" font-family="sans-serif">Compute IoU</text>
  <text x="545" y="125" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6" font-family="sans-serif">∩ / ∪ (m²)</text>
  <text x="545" y="140" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6" font-family="sans-serif"> </text>
  <rect x="640" y="90" width="108" height="56" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.35"/>
  <text x="694" y="113" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85" font-family="sans-serif">Threshold</text>
  <text x="694" y="129" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6" font-family="sans-serif">GSD-calibrated</text>
  <!-- Arrows -->
  <line x1="130" y1="118" x2="158" y2="118" stroke="currentColor" stroke-width="1.5" opacity="0.5" marker-end="url(#arr)"/>
  <line x1="290" y1="118" x2="318" y2="118" stroke="currentColor" stroke-width="1.5" opacity="0.5" marker-end="url(#arr)"/>
  <line x1="450" y1="118" x2="478" y2="118" stroke="currentColor" stroke-width="1.5" opacity="0.5" marker-end="url(#arr)"/>
  <line x1="610" y1="118" x2="638" y2="118" stroke="currentColor" stroke-width="1.5" opacity="0.5" marker-end="url(#arr)"/>
  <!-- Labels below -->
  <text x="70" y="170" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.45" font-family="sans-serif">lat/lon pairs</text>
  <text x="225" y="170" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.45" font-family="sans-serif">always_xy=True</text>
  <text x="385" y="170" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.45" font-family="sans-serif">fix rings + self-∩</text>
  <text x="545" y="170" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.45" font-family="sans-serif">exact area ratio</text>
  <text x="694" y="170" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.45" font-family="sans-serif">0.35 – 0.75</text>
</svg>

## Step-by-Step Implementation

Each step below is a self-contained, runnable block. Install the required packages once:

```bash
pip install shapely==2.0.6 pyproj==3.6.1 numpy==1.26.4
```

### Step 1 — Reproject All Geometries to a Metric CRS

Choose a UTM zone that covers your tile's centroid. For a dataset at longitude 13.4°E (central Europe), `EPSG:32633` (UTM Zone 33N) is appropriate. Use `always_xy=True` to force (longitude, latitude) input order regardless of the CRS authority definition:

```python
from pyproj import Transformer

def make_transformer(source_crs: str = "EPSG:4326",
                     target_crs: str = "EPSG:32633") -> Transformer:
    """Return a Transformer that always expects (lon, lat) / (x, y) input order."""
    return Transformer.from_crs(source_crs, target_crs, always_xy=True)
```

For global datasets spanning multiple UTM zones, derive the zone from the centroid longitude:

```python
def utm_epsg_from_lon_lat(lon: float, lat: float) -> str:
    zone = int((lon + 180) / 6) + 1
    hemisphere = "326" if lat >= 0 else "327"
    return f"EPSG:{hemisphere}{zone:02d}"
```

### Step 2 — Validate Topology Before Computing Area

`shapely`'s `make_valid()` repairs self-intersecting rings and unclosed exteriors. Call it on every geometry — prediction and ground-truth — before any set operation:

```python
from shapely.geometry import Polygon, box
from shapely.validation import make_valid
from typing import Union

def to_valid_polygon(coords: Union[list, tuple]) -> Polygon:
    """
    Accept either [minx, miny, maxx, maxy] (axis-aligned box)
    or a list of (x, y) ring coordinates (arbitrary polygon).
    Always returns a topologically valid shapely Polygon.
    """
    if len(coords) == 4 and not isinstance(coords[0], (list, tuple)):
        geom = box(*coords)
    else:
        geom = Polygon(coords)
    return make_valid(geom)
```

### Step 3 — Compute IoU in Metric Space

After reprojection and validation, the intersection and union areas are in square metres:

```python
from shapely.ops import transform
from shapely.geometry import Polygon

def geospatial_iou(
    pred: Polygon,
    gt: Polygon,
    transformer: "Transformer",
) -> float:
    """
    Compute IoU between two valid shapely Polygons after projecting
    both to the metric CRS defined by `transformer`.
    Returns a float in [0.0, 1.0].
    """
    project = lambda x, y: transformer.transform(x, y)
    pred_m = transform(project, pred)
    gt_m   = transform(project, gt)

    intersection_area = pred_m.intersection(gt_m).area
    union_area        = pred_m.union(gt_m).area

    if union_area == 0.0:
        return 0.0
    return intersection_area / union_area
```

### Step 4 — Apply a GSD-Calibrated Threshold

Wrap steps 1–3 in a single evaluation function that accepts explicit CRS and threshold parameters:

```python
def evaluate_detection(
    pred_coords: list,
    gt_coords: list,
    source_crs: str = "EPSG:4326",
    target_crs: str = "EPSG:32633",
    iou_threshold: float = 0.50,
) -> tuple[float, bool]:
    """
    Full projection-aware IoU evaluation.

    Args:
        pred_coords: [minx,miny,maxx,maxy] or polygon ring [(lon,lat), …]
        gt_coords:   same format as pred_coords
        source_crs:  CRS of the input coordinates (default WGS84)
        target_crs:  Local metric CRS for area computation (default UTM 33N)
        iou_threshold: Match cutoff, calibrated to GSD and mission type

    Returns:
        (iou_score, is_match)
    """
    t = make_transformer(source_crs, target_crs)
    pred_poly = to_valid_polygon(pred_coords)
    gt_poly   = to_valid_polygon(gt_coords)
    iou       = geospatial_iou(pred_poly, gt_poly, t)
    return iou, iou >= iou_threshold
```

### Step 5 — Size-Stratified Batch Evaluation

Aggregate IoU scores mask scale-dependent failure modes. Bin predictions by projected area and compute per-bin mean Average Precision after transformation:

```python
import numpy as np
from dataclasses import dataclass

@dataclass
class DetectionResult:
    iou: float
    projected_area_m2: float   # ground-truth area in square metres
    is_match: bool

def stratified_map(
    results: list[DetectionResult],
    bins: dict[str, tuple[float, float]] | None = None,
) -> dict[str, float]:
    """
    Compute per-size-bin match rate (proxy mAP) from a list of DetectionResults.
    Default bins: small < 100 m², medium 100–10 000 m², large > 10 000 m².
    """
    if bins is None:
        bins = {"small": (0, 100), "medium": (100, 10_000), "large": (10_000, float("inf"))}

    summary: dict[str, float] = {}
    for name, (lo, hi) in bins.items():
        subset = [r for r in results if lo <= r.projected_area_m2 < hi]
        if subset:
            summary[name] = float(np.mean([r.is_match for r in subset]))
        else:
            summary[name] = float("nan")
    return summary
```

## Spatial Parameters and Threshold Reference

| Mission Type | Typical Object Scale | Recommended IoU Cutoff | Rationale |
|---|---|---|---|
| Infrastructure mapping | Small (< 100 m²) | 0.65 – 0.75 | Tight compliance requirements; false positives carry regulatory risk |
| Vehicle / asset detection | Medium (1 – 50 m²) | 0.50 – 0.60 | Standard recall/precision balance |
| Agricultural / land cover | Large (> 10 000 m²) | 0.35 – 0.50 | Boundary ambiguity dominates; GSD variance is high |
| Multi-scale detection | Mixed | 0.40 – 0.60 (adaptive) | Use size-binned evaluation with per-bin thresholds |

**GSD scaling rule:** lower the threshold by ~0.05 per 10 cm/pixel increase in GSD above 20 cm/pixel. At 50 cm/pixel, sub-pixel annotation disagreement between labellers spans the equivalent of 25–50 cm on the ground — more than enough to drop IoU below a fixed 0.50 for a correctly localised detection. When embedding [confidence scores](/geospatial-annotation-fundamentals-architecture/confidence-scoring-for-geospatial-labels/) alongside IoU during evaluation, use the confidence value to weight borderline matches rather than applying a hard binary cut.

**EPSG quick reference:**

- `EPSG:4326` — WGS84, angular degrees, input format only
- `EPSG:32633` — UTM Zone 33N, metric (central Europe / Africa)
- `EPSG:32737` — UTM Zone 37S, metric (East Africa / Madagascar)
- `EPSG:3857` — Web Mercator, metric fallback for multi-zone datasets (distortion acceptable for tile-level area ratios)

## Common Errors & Fixes

| Error / Symptom | Root Cause | Fix |
|---|---|---|
| `TopologicalError: The operation 'GEOSIntersection_r' produced a null geometry` | Self-intersecting polygon (bowtie ring) passed to `.intersection()` | Call `make_valid(geom)` on both operands before intersection |
| IoU is always 0.0 for visually overlapping boxes | Input coordinates in `(lat, lon)` order passed to a transformer expecting `(lon, lat)` | Add `always_xy=True` to `Transformer.from_crs()` |
| IoU scores drop sharply for tiles above 55°N | Area computed in degree-squared units (`EPSG:4326` never reprojected) | Ensure `to_valid_polygon` receives metric coordinates after `transform(project, geom)` |
| `ShapelyDeprecationWarning: The array interface is deprecated` / wrong area returned | shapely 1.x geometry passed to shapely 2.x function | Upgrade to `shapely==2.0.6`; re-create all geometry objects from coordinates rather than pickling from 1.x |

## Related

- [Coordinate Reference Systems in Annotation Pipelines](/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) — parent page covering CRS contracts, datum management, and reprojection patterns across an entire annotation pipeline
- [Confidence Scoring for Geospatial Labels](/geospatial-annotation-fundamentals-architecture/confidence-scoring-for-geospatial-labels/) — assign per-annotation uncertainty values that complement IoU during model evaluation and active-learning triage
- [Best Practices for Polygon vs Bounding Box Annotation](/geospatial-annotation-fundamentals-architecture/defining-roi-label-taxonomies-for-aerial-imagery/best-practices-for-polygon-vs-bounding-box-annotation/) — annotation geometry choices upstream that directly determine how tight IoU scores can realistically be
- [Preserving Metadata Across Dataset Versions](/dataset-versioning-spatial-data-sync/preserving-metadata-across-dataset-versions/) — ensure the CRS and GSD metadata needed for threshold selection travel with every dataset export

This page covers one specialised calculation within the broader [Coordinate Reference Systems in Annotation Pipelines](/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) cluster, which is itself part of [Geospatial Annotation Fundamentals & Architecture](/geospatial-annotation-fundamentals-architecture/).
