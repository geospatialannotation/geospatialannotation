---
title: "Calculating IoU Thresholds for Geospatial Object Detection"
description: "How to compute projection-aware Intersection over Union (IoU) for aerial and satellite pipelines: CRS transformation with pyproj, topology validation with shapely, and GSD-calibrated threshold selection."
slug: "calculating-iou-thresholds-for-geospatial-object-detection"
type: "tutorial"
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
dateModified: "2026-06-25"
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
      "dateModified": "2026-06-25",
      "author": {"@type": "Organization", "name": "Geospatial Annotation"},
      "publisher": {"@type": "Organization", "name": "Geospatial Annotation"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.geospatialannotation.com/"},
        {"@type": "ListItem", "position": 2, "name": "Geospatial Annotation Fundamentals & Architecture", "item": "https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/"},
        {"@type": "ListItem", "position": 3, "name": "Coordinate Reference Systems in Annotation Pipelines", "item": "https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/"},
        {"@type": "ListItem", "position": 4, "name": "Calculating IoU Thresholds for Geospatial Object Detection", "item": "https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/calculating-iou-thresholds-for-geospatial-object-detection/"}
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

Reliable IoU evaluation for aerial and satellite object detection requires three things that standard computer vision toolkits omit: reprojection from angular coordinates to a [local metric coordinate reference system](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) before any area computation, topology validation with `shapely` 2.0+ `make_valid()`, and threshold values calibrated to ground sample distance (GSD) and mission type. Reproject all geometries to a UTM or state-plane CRS using `pyproj` 3.6+, then apply adaptive cutoffs in the 0.35–0.75 range rather than a fixed 0.50. Skipping any of these steps introduces projection-induced bias that silently corrupts precision/recall curves.

## Why Unprojected IoU Breaks Aerial Pipelines

`EPSG:4326` (WGS84) stores coordinates as decimal degrees; a degree of longitude spans roughly 111 km at the equator but shrinks near zero at high latitudes, so intersection area computed in degree-squared units is geographically meaningless and produces artificially suppressed IoU scores that shift as your dataset spans different latitudes. Varying GSD compounds the problem: an annotation tolerance of ±2 pixels at 10 cm/pixel is ±20 cm on the ground, but at 50 cm/pixel that same pixel tolerance is ±100 cm — a fixed 0.50 threshold that passes valid detections at high resolution will reject them at coarser resolution purely because boundary pixelation widens the mismatch, not because the model degraded.

<svg viewBox="0 0 520 280" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Geometric illustration of IoU: two overlapping polygons with intersection area shaded, labelled with the IoU formula" style="width:100%;max-width:520px;display:block;margin:1.5rem auto;">
  <title>IoU geometric definition for geospatial polygons</title>
  <desc>Two overlapping quadrilaterals representing a ground-truth annotation and a model prediction. The overlapping region is shaded and labelled Intersection. The combined area is labelled Union. The IoU formula IoU = Intersection divided by Union appears below.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <!-- Ground-truth polygon -->
  <polygon points="60,60 240,50 260,190 50,200" fill="currentColor" fill-opacity="0.10" stroke="currentColor" stroke-width="2" stroke-opacity="0.7"/>
  <!-- Prediction polygon -->
  <polygon points="160,80 340,70 360,210 150,220" fill="currentColor" fill-opacity="0.10" stroke="currentColor" stroke-width="2" stroke-dasharray="6 3" stroke-opacity="0.7"/>
  <!-- Intersection region (approximated as overlapping area) -->
  <polygon points="160,80 240,50 260,190 150,220" fill="currentColor" opacity="0.25"/>
  <!-- Labels -->
  <text x="100" y="140" text-anchor="middle" font-size="12" fill="currentColor" opacity="0.75" font-family="sans-serif">Ground truth</text>
  <text x="320" y="120" text-anchor="middle" font-size="12" fill="currentColor" opacity="0.75" font-family="sans-serif">Prediction</text>
  <text x="205" y="148" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.95" font-family="sans-serif" font-weight="bold">∩</text>
  <!-- Legend -->
  <rect x="60" y="230" width="14" height="14" fill="currentColor" opacity="0.10" stroke="currentColor" stroke-width="1.5"/>
  <text x="80" y="242" font-size="11" fill="currentColor" opacity="0.7" font-family="sans-serif">Union (∪) area</text>
  <rect x="200" y="230" width="14" height="14" fill="currentColor" opacity="0.25"/>
  <text x="220" y="242" font-size="11" fill="currentColor" opacity="0.7" font-family="sans-serif">Intersection (∩) area</text>
  <!-- Formula -->
  <text x="430" y="150" text-anchor="middle" font-size="13" fill="currentColor" opacity="0.85" font-family="sans-serif" font-weight="bold">IoU = ∩ / ∪</text>
  <text x="430" y="169" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.55" font-family="sans-serif">compute in m², not degrees²</text>
</svg>

## Step-by-Step Implementation

Install the required packages once:

```bash
pip install shapely==2.0.6 pyproj==3.6.1 numpy==1.26.4
```

### Step 1 — Reproject All Geometries to a Metric CRS

Choose a UTM zone that covers your tile's centroid. For a dataset at longitude 13.4°E (central Europe), `EPSG:32633` (UTM Zone 33N) is appropriate. Pass `always_xy=True` to force `(longitude, latitude)` input order regardless of CRS authority axis definitions:

```python
from pyproj import Transformer

def make_transformer(source_crs: str = "EPSG:4326",
                     target_crs: str = "EPSG:32633") -> Transformer:
    """Return a Transformer that always expects (lon, lat) / (x, y) input order."""
    return Transformer.from_crs(source_crs, target_crs, always_xy=True)
```

For global datasets spanning multiple UTM zones, derive the zone automatically from each annotation's centroid longitude:

```python
def utm_epsg_from_lon_lat(lon: float, lat: float) -> str:
    zone = int((lon + 180) / 6) + 1
    hemisphere = "326" if lat >= 0 else "327"
    return f"EPSG:{hemisphere}{zone:02d}"
```

### Step 2 — Validate Topology Before Computing Area

`shapely`'s `make_valid()` repairs self-intersecting rings and unclosed exteriors. Call it on every geometry — prediction and ground-truth alike — before any set operation:

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

After reprojection and validation, intersection and union areas are in square metres. Assign [confidence scores](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/confidence-scoring-for-geospatial-labels/) alongside the IoU value when building evaluation logs — they let you weight borderline matches rather than applying a hard binary cut:

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

Wrap steps 1–3 in a single evaluation function that accepts explicit CRS and threshold parameters. Consult the reference table in the next section to choose `iou_threshold`:

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

Aggregate IoU scores mask scale-dependent failure modes. Bin predictions by projected area — the same approach used in [polygon vs. bounding-box annotation](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/defining-roi-label-taxonomies-for-aerial-imagery/best-practices-for-polygon-vs-bounding-box-annotation/) quality assessment — and compute per-bin match rates after transformation:

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

## Threshold and CRS Reference

<svg viewBox="-12 48 722 113" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Pipeline diagram showing the five stages of projection-aware IoU calculation" style="width:100%;max-width:722px;display:block;margin:1.5rem auto;">
  <title>Projection-aware IoU calculation pipeline</title>
  <desc>Five sequential stages: WGS84 input coordinates are reprojected via pyproj to a UTM CRS, validated with make_valid, used to compute intersection and union in square metres, then compared against a GSD-calibrated IoU threshold.</desc>
  <rect x="-12" y="48" width="722" height="113" style="fill:var(--bg)"/>
  <defs>
    <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
      <polygon points="0 0, 8 3, 0 6" fill="currentColor" opacity="0.5"/>
    </marker>
  </defs>
  <!-- Stage 1 -->
  <rect x="8" y="68" width="112" height="54" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.35"/>
  <text x="64" y="91" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85" font-family="sans-serif">Input coords</text>
  <text x="64" y="108" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.55" font-family="sans-serif">EPSG:4326</text>
  <!-- Stage 2 -->
  <rect x="148" y="68" width="112" height="54" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.35"/>
  <text x="204" y="91" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85" font-family="sans-serif">Reproject</text>
  <text x="204" y="108" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.55" font-family="sans-serif">pyproj → UTM</text>
  <!-- Stage 3 -->
  <rect x="288" y="68" width="112" height="54" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.35"/>
  <text x="344" y="91" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85" font-family="sans-serif">Validate</text>
  <text x="344" y="108" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.55" font-family="sans-serif">make_valid()</text>
  <!-- Stage 4 -->
  <rect x="428" y="68" width="112" height="54" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.35"/>
  <text x="484" y="91" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85" font-family="sans-serif">Compute IoU</text>
  <text x="484" y="108" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.55" font-family="sans-serif">∩ / ∪  (m²)</text>
  <!-- Stage 5 -->
  <rect x="568" y="68" width="122" height="54" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.35"/>
  <text x="629" y="91" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85" font-family="sans-serif">Threshold</text>
  <text x="629" y="108" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.55" font-family="sans-serif">GSD-calibrated</text>
  <!-- Arrows -->
  <line x1="120" y1="95" x2="146" y2="95" stroke="currentColor" stroke-width="1.5" opacity="0.45" marker-end="url(#arrowhead)"/>
  <line x1="260" y1="95" x2="286" y2="95" stroke="currentColor" stroke-width="1.5" opacity="0.45" marker-end="url(#arrowhead)"/>
  <line x1="400" y1="95" x2="426" y2="95" stroke="currentColor" stroke-width="1.5" opacity="0.45" marker-end="url(#arrowhead)"/>
  <line x1="540" y1="95" x2="566" y2="95" stroke="currentColor" stroke-width="1.5" opacity="0.45" marker-end="url(#arrowhead)"/>
  <!-- Sub-labels -->
  <text x="64" y="138" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.4" font-family="sans-serif">lat/lon pairs</text>
  <text x="204" y="138" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.4" font-family="sans-serif">always_xy=True</text>
  <text x="344" y="138" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.4" font-family="sans-serif">fix rings + self-∩</text>
  <text x="484" y="138" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.4" font-family="sans-serif">exact area ratio</text>
  <text x="629" y="138" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.4" font-family="sans-serif">0.35 – 0.75</text>
</svg>

**IoU threshold by mission type:**

| Mission type | Typical object scale | Recommended IoU cutoff | Rationale |
|---|---|---|---|
| Infrastructure mapping | Small (< 100 m²) | 0.65 – 0.75 | Tight compliance requirements; false positives carry regulatory risk |
| Vehicle / asset detection | Medium (1 – 50 m²) | 0.50 – 0.60 | Standard recall/precision balance |
| Agricultural / land cover | Large (> 10 000 m²) | 0.35 – 0.50 | Boundary ambiguity dominates; GSD variance is high |
| Multi-scale detection | Mixed | 0.40 – 0.60 (adaptive) | Use size-binned evaluation with per-bin thresholds |

**GSD scaling rule:** lower the threshold by approximately 0.05 per 10 cm/pixel increase in GSD above 20 cm/pixel. At 50 cm/pixel, sub-pixel annotation disagreement between labellers spans 25–50 cm on the ground — more than enough to drop IoU below a fixed 0.50 for a correctly localised detection.

**EPSG quick reference:**

- `EPSG:4326` — WGS84, angular degrees, input format only
- `EPSG:32633` — UTM Zone 33N, metric (central Europe / Africa)
- `EPSG:32737` — UTM Zone 37S, metric (East Africa / Madagascar)
- `EPSG:3857` — Web Mercator, metric fallback for multi-zone datasets (distortion acceptable for tile-level area ratios under ~50 km wide)

Ensure the CRS and GSD metadata needed for threshold selection travels with every dataset export — [preserving metadata across dataset versions](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/preserving-metadata-across-dataset-versions/) covers the mechanics of attaching that context to each versioned snapshot.

<svg viewBox="0 0 720 290" role="img" aria-label="Recommended IoU cutoff ranges by mission type, plotted on a shared axis from 0.3 to 0.8" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>Where each mission type's IoU cutoff belongs</title>
  <desc>A shared axis from 0.30 to 0.80. Infrastructure mapping of objects under a hundred square metres sits at 0.65 to 0.75. Vehicle and asset detection between one and fifty square metres sits at 0.50 to 0.60. Agricultural and land cover work above ten thousand square metres sits at 0.35 to 0.50. Multi-scale detection spans 0.40 to 0.60 and is applied per size bin rather than as one number. The single default of 0.50 is marked, showing it is only correct for one of the four.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <!-- Axis -->
  <line x1="230" y1="238" x2="670" y2="238" stroke="currentColor" stroke-width="1.5" opacity="0.6"/>
  <line x1="230" y1="234" x2="230" y2="242" stroke="currentColor" stroke-width="1.5" opacity="0.6"/>
  <line x1="318" y1="234" x2="318" y2="242" stroke="currentColor" stroke-width="1.5" opacity="0.6"/>
  <line x1="406" y1="234" x2="406" y2="242" stroke="currentColor" stroke-width="1.5" opacity="0.6"/>
  <line x1="494" y1="234" x2="494" y2="242" stroke="currentColor" stroke-width="1.5" opacity="0.6"/>
  <line x1="582" y1="234" x2="582" y2="242" stroke="currentColor" stroke-width="1.5" opacity="0.6"/>
  <line x1="670" y1="234" x2="670" y2="242" stroke="currentColor" stroke-width="1.5" opacity="0.6"/>
  <text x="230" y="256" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.6">0.30</text>
  <text x="318" y="256" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.6">0.40</text>
  <text x="406" y="256" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.6">0.50</text>
  <text x="494" y="256" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.6">0.60</text>
  <text x="582" y="256" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.6">0.70</text>
  <text x="670" y="256" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.6">0.80</text>
  <text x="450" y="278" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.75">IoU cutoff, computed on projected metres</text>
  <!-- The inherited default -->
  <line x1="406" y1="26" x2="406" y2="230" stroke="currentColor" stroke-width="1" stroke-dasharray="3 3" opacity="0.5"/>
  <text x="400" y="24" text-anchor="end" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">the inherited 0.50 default</text>
  <!-- Rows -->
  <text x="222" y="52" text-anchor="end" font-size="11" fill="currentColor" font-family="sans-serif">infrastructure mapping</text>
  <text x="222" y="66" text-anchor="end" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.65">&lt; 100 m² · regulatory risk</text>
  <rect x="538" y="46" width="88" height="14" rx="3" fill="currentColor" opacity="0.5"/>
  <text x="634" y="58" font-size="10" fill="currentColor" font-family="monospace" opacity="0.75">0.65–0.75</text>
  <text x="222" y="104" text-anchor="end" font-size="11" fill="currentColor" font-family="sans-serif">vehicle / asset detection</text>
  <text x="222" y="118" text-anchor="end" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.65">1 – 50 m² · balanced</text>
  <rect x="406" y="98" width="88" height="14" rx="3" fill="currentColor" opacity="0.5"/>
  <text x="502" y="110" font-size="10" fill="currentColor" font-family="monospace" opacity="0.75">0.50–0.60</text>
  <text x="222" y="156" text-anchor="end" font-size="11" fill="currentColor" font-family="sans-serif">agricultural / land cover</text>
  <text x="222" y="170" text-anchor="end" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.65">&gt; 10 000 m² · fuzzy edges</text>
  <rect x="274" y="150" width="132" height="14" rx="3" fill="currentColor" opacity="0.5"/>
  <text x="414" y="162" font-size="10" fill="currentColor" font-family="monospace" opacity="0.75">0.35–0.50</text>
  <text x="222" y="208" text-anchor="end" font-size="11" fill="currentColor" font-family="sans-serif">multi-scale detection</text>
  <text x="222" y="222" text-anchor="end" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.65">mixed · per size bin</text>
  <rect x="318" y="202" width="176" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 2"/>
  <text x="502" y="214" font-size="10" fill="currentColor" font-family="monospace" opacity="0.75">0.40–0.60</text>
</svg>

## Common Errors and Fixes

**`TopologicalError: The operation 'GEOSIntersection_r' produced a null geometry`**
Root cause: self-intersecting polygon (bowtie ring) passed to `.intersection()`.
Fix: call `make_valid(geom)` on both operands before the intersection call.

**IoU is always 0.0 for visually overlapping boxes**
Root cause: input coordinates in `(lat, lon)` order passed to a transformer expecting `(lon, lat)`.
Fix: add `always_xy=True` to `Transformer.from_crs()`.

**IoU scores drop sharply for tiles above 55°N**
Root cause: area computed in degree-squared units — `EPSG:4326` was never reprojected.
Fix: ensure `to_valid_polygon` receives metric coordinates after `transform(project, geom)` has been applied.

**`ShapelyDeprecationWarning: The array interface is deprecated` / wrong area returned**
Root cause: shapely 1.x geometry object passed to a shapely 2.x function.
Fix: upgrade to `shapely==2.0.6` and re-create all geometry objects from raw coordinates rather than unpickling from 1.x.

## Related

- [Coordinate Reference Systems in Annotation Pipelines](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) — parent page covering CRS contracts, datum management, and reprojection patterns across an entire annotation pipeline
- [Confidence Scoring for Geospatial Labels](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/confidence-scoring-for-geospatial-labels/) — assign per-annotation uncertainty values that complement IoU during model evaluation and active-learning triage
- [Best Practices for Polygon vs Bounding Box Annotation](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/defining-roi-label-taxonomies-for-aerial-imagery/best-practices-for-polygon-vs-bounding-box-annotation/) — annotation geometry choices that determine how tight IoU scores can realistically be
- [Preserving Metadata Across Dataset Versions](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/preserving-metadata-across-dataset-versions/) — ensure the CRS and GSD metadata needed for threshold selection travel with every dataset export

This page covers one specialised calculation within [Coordinate Reference Systems in Annotation Pipelines](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/), which is itself part of [Geospatial Annotation Fundamentals & Architecture](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/).
