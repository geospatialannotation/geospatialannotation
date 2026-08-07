---
title: "Computing Boundary IoU for Footprint Quality"
description: "Score building-footprint delineation with boundary IoU instead of plain IoU, sizing the evaluation band from ground sample distance so small and large objects are judged on the same standard."
slug: "computing-boundary-iou-for-footprint-quality"
type: "tutorial"
breadcrumb:
  - label: "Home"
    url: "/"
  - label: "Geospatial Annotation Fundamentals & Architecture"
    url: "/geospatial-annotation-fundamentals-architecture/"
  - label: "Annotation Quality Metrics & Inter-Annotator Agreement"
    url: "/geospatial-annotation-fundamentals-architecture/annotation-quality-metrics-and-agreement/"
  - label: "Computing Boundary IoU for Footprint Quality"
    url: "/geospatial-annotation-fundamentals-architecture/annotation-quality-metrics-and-agreement/computing-boundary-iou-for-footprint-quality/"
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
      "headline": "Computing Boundary IoU for Footprint Quality",
      "description": "Score building-footprint delineation with boundary IoU instead of plain IoU, sizing the evaluation band from ground sample distance so small and large objects are judged on the same standard.",
      "datePublished": "2026-08-08",
      "dateModified": "2026-08-08",
      "author": {"@type": "Organization", "name": "Geospatial Annotation"},
      "publisher": {"@type": "Organization", "name": "Geospatial Annotation"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.geospatialannotation.com/"},
        {"@type": "ListItem", "position": 2, "name": "Geospatial Annotation Fundamentals & Architecture", "item": "https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/"},
        {"@type": "ListItem", "position": 3, "name": "Annotation Quality Metrics & Inter-Annotator Agreement", "item": "https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/annotation-quality-metrics-and-agreement/"},
        {"@type": "ListItem", "position": 4, "name": "Computing Boundary IoU for Footprint Quality", "item": "https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/annotation-quality-metrics-and-agreement/computing-boundary-iou-for-footprint-quality/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Compute boundary IoU for annotated building footprints",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Reproject to metres", "text": "Move both the reference and the candidate polygon into a local projected CRS so the buffer distance that defines the boundary band is expressed in metres."},
        {"@type": "HowToStep", "position": 2, "name": "Pick the band from the sensor", "text": "Set the band width to roughly three ground sample distances, so it covers the width within which two competent annotators cannot be distinguished."},
        {"@type": "HowToStep", "position": 3, "name": "Buffer each boundary", "text": "Take each polygon's boundary and buffer it by the band width, producing two ring-shaped regions that contain only the neighbourhood of the outlines."},
        {"@type": "HowToStep", "position": 4, "name": "Divide intersection by union", "text": "Compute the area of the intersection of the two rings divided by the area of their union, giving a score from zero to one that depends on tracing rather than object size."},
        {"@type": "HowToStep", "position": 5, "name": "Report it beside plain IoU", "text": "Emit both scores per feature so a large gap between them flags the objects where area is hiding a delineation problem."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What band width should I use for boundary IoU?",
          "acceptedAnswer": {"@type": "Answer", "text": "About three times the ground sample distance: 0.3 m for 10 cm drone imagery, 0.9 m for 30 cm satellite imagery, 1.5 m for 50 cm. That is the width inside which two careful annotators genuinely cannot be told apart, so differences within it should not be penalised. Using one fixed band across sensors makes the same team appear to improve when imagery gets coarser."}
        },
        {
          "@type": "Question",
          "name": "Why does boundary IoU fall so much faster than plain IoU?",
          "acceptedAnswer": {"@type": "Answer", "text": "Plain IoU divides shared area by total area, and for a compact object the interior dominates both. Boundary IoU throws the interior away, so an offset of one band width moves the two rings almost entirely apart. That steepness is the point: it turns a difference that plain IoU renders as 0.94 versus 0.97 into 0.41 versus 0.83, which is a range a threshold can act on."}
        },
        {
          "@type": "Question",
          "name": "Does boundary IoU work for lines and points?",
          "acceptedAnswer": {"@type": "Answer", "text": "It works directly for lines: buffer each LineString and compare the two buffers, which is the standard way to score road centreline delineation. For points it degenerates, since buffering a point gives a disc whose overlap is just a function of separation; use the distance between the points and a tolerance instead."}
        },
        {
          "@type": "Question",
          "name": "Should I use boundary IoU as the training metric too?",
          "acceptedAnswer": {"@type": "Answer", "text": "It is a good reporting metric and a poor loss. It is expensive to compute per batch, it is not differentiable through the buffer operation, and the model has no direct control over vector boundaries when it is predicting a raster mask. Use it to evaluate annotations and to compare model checkpoints on a held-out set, and keep the training loss on the mask."}
        }
      ]
    }
  ]
}
</script>

# Computing Boundary IoU for Footprint Quality

Boundary IoU compares two polygons only within a band around their outlines: buffer each boundary by a fixed distance in metres, then divide the area of the intersection of the two rings by the area of their union. Because the interior is excluded, the score reports how well the outline was traced rather than how large the object is — a 900 m² warehouse traced three metres wide of its walls scores 0.41 while a 40 m² shed traced within half a metre scores 0.79, exactly inverting the ranking that plain IoU produces. This guide gives you the function, the rule for sizing the band from ground sample distance, and the two ways the metric can lie to you.

## Why Plain IoU Cannot Grade Delineation

Intersection over union is an area ratio, and for a compact object the area is dominated by the interior, which both annotators got right by construction. Trace a 30 m × 30 m building three metres wide on every wall and the union grows from 900 m² to 1 296 m² while the intersection stays 900 m² — an IoU of 0.69 for a genuinely bad trace, and better still for larger buildings. The same absolute error on a 6 m × 6 m shed drops IoU to 0.25. One error, two very different scores, and the difference is object size rather than annotator skill.

That matters in two places. Ranking features for adjudication by plain IoU sends reviewers to small objects, where the metric is harsh, and lets large sloppy footprints through. And comparing quality between projects is meaningless when one works on warehouses and the other on garden sheds, because the score encodes the size distribution as much as the labelling.

Boundary IoU removes the interior from the comparison. What remains is the neighbourhood of the outline, which is the only part of the polygon where a decision was actually made.

<svg viewBox="0 0 720 300" role="img" aria-label="A polygon's boundary buffered into a ring, with the interior discarded, and the two rings compared" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>What boundary IoU actually compares</title>
  <desc>Starting from two overlapping footprints, each polygon's boundary is buffered by the band width to give a ring. The interiors, where both annotators trivially agree, are discarded. Only the two rings enter the intersection over union, so the score reflects how closely the outlines were placed.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <!-- Step 1 -->
  <text x="110" y="36" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">two footprints</text>
  <polygon points="40,66 178,60 186,168 48,176" fill="none" stroke="currentColor" stroke-width="2"/>
  <polygon points="52,78 190,72 198,180 60,188" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="5 3"/>
  <text x="110" y="216" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">the interiors agree</text>
  <text x="110" y="230" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">almost completely</text>
  <line x1="212" y1="120" x2="248" y2="120" stroke="currentColor" stroke-width="1.5" marker-end="url(#biou-arr)"/>
  <defs>
    <marker id="biou-arr" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor"/>
    </marker>
  </defs>
  <!-- Step 2 -->
  <text x="360" y="36" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">buffer each boundary</text>
  <polygon points="290,66 428,60 436,168 298,176" fill="none" stroke="currentColor" stroke-width="9" opacity="0.32"/>
  <polygon points="302,78 440,72 448,180 310,188" fill="none" stroke="currentColor" stroke-width="9" opacity="0.32" stroke-dasharray="9 5"/>
  <text x="360" y="216" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">band width = 3 × GSD,</text>
  <text x="360" y="230" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">in metres</text>
  <line x1="462" y1="120" x2="498" y2="120" stroke="currentColor" stroke-width="1.5" marker-end="url(#biou-arr)"/>
  <!-- Step 3 -->
  <text x="600" y="36" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">divide the rings</text>
  <rect x="512" y="60" width="176" height="118" rx="6" fill="none" stroke="currentColor" stroke-width="1.4"/>
  <text x="600" y="102" text-anchor="middle" font-size="12" fill="currentColor" font-family="monospace">ring ∩ ring</text>
  <line x1="546" y1="114" x2="654" y2="114" stroke="currentColor" stroke-width="1.4"/>
  <text x="600" y="136" text-anchor="middle" font-size="12" fill="currentColor" font-family="monospace">ring ∪ ring</text>
  <text x="600" y="216" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">a score that does not move</text>
  <text x="600" y="230" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">when the object gets bigger</text>
  <text x="360" y="266" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">the discarded interior is exactly the part of the polygon nobody had to make a decision about</text>
</svg>

## Step-by-Step Implementation

### Step 1 — Install and Fix the Working CRS

```bash
pip install geopandas==0.14.4 shapely==2.0.6 pyproj==3.6.1 numpy==1.26.4
```

The band width is a distance, so both geometries must be in a projected CRS whose unit is the metre before anything is buffered. Buffering a polygon that is still in `EPSG:4326` by `1.0` buffers it by one degree — roughly 111 km — and the function will happily return 1.0 for every pair, because both rings then cover the entire neighbourhood. Choosing that projection is covered in [coordinate reference systems in annotation pipelines](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/); assert it rather than assume it.

```python
import geopandas as gpd

def to_metric(gdf: gpd.GeoDataFrame, work_crs: str) -> gpd.GeoDataFrame:
    """Reproject and refuse to continue if the target is not metre-based."""
    from pyproj import CRS
    crs = CRS.from_user_input(work_crs)
    unit = crs.axis_info[0].unit_name
    if unit not in ("metre", "meter"):
        raise ValueError(f"{work_crs} has axis unit {unit!r}; boundary IoU needs metres")
    if gdf.crs is None:
        raise ValueError("input has no declared CRS")
    out = gdf.to_crs(crs)
    out["geometry"] = out.geometry.make_valid()
    return out
```

### Step 2 — Size the Band From the Sensor

The band should be the width inside which two competent annotators are indistinguishable. Empirically that is about three pixels, so the rule is three times the ground sample distance.

<svg viewBox="0 0 720 270" role="img" aria-label="Object size against band width, showing the size below which boundary IoU stops discriminating" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>Below this size the band swallows the object</title>
  <desc>Three objects measured with a 0.9 metre band on 30 centimetre imagery. A 900 square metre warehouse is thirty metres across, so the band is a thin edge and the score discriminates well. A 40 square metre shed is six metres across and the band is already a third of it. A 4 square metre kiosk is two metres across, so the two buffered rings overlap almost completely whatever the annotator did, and every pair scores near one.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <!-- Warehouse -->
  <text x="120" y="36" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">900 m² · 30 m across</text>
  <rect x="50" y="56" width="140" height="96" fill="none" stroke="currentColor" stroke-width="9" opacity="0.3"/>
  <rect x="50" y="56" width="140" height="96" fill="none" stroke="currentColor" stroke-width="1.6"/>
  <text x="120" y="180" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace">band / width = 0.03</text>
  <text x="120" y="200" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">the score discriminates</text>
  <!-- Shed -->
  <text x="360" y="36" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">40 m² · 6 m across</text>
  <rect x="326" y="80" width="68" height="48" fill="none" stroke="currentColor" stroke-width="14" opacity="0.3"/>
  <rect x="326" y="80" width="68" height="48" fill="none" stroke="currentColor" stroke-width="1.6"/>
  <text x="360" y="180" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace">band / width = 0.15</text>
  <text x="360" y="200" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">still usable, less sensitive</text>
  <!-- Kiosk -->
  <text x="600" y="36" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">4 m² · 2 m across</text>
  <rect x="586" y="94" width="28" height="20" fill="none" stroke="currentColor" stroke-width="22" opacity="0.3"/>
  <rect x="586" y="94" width="28" height="20" fill="none" stroke="currentColor" stroke-width="1.6"/>
  <text x="600" y="180" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace">band / width = 0.45</text>
  <text x="600" y="200" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">every pair scores near 1.0</text>
  <!-- Rule -->
  <rect x="120" y="220" width="480" height="34" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 3"/>
  <text x="360" y="242" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">skip when band_m ≥ sqrt(area) / 2 — and report the skip</text>
</svg>

```python
def band_for_gsd(gsd_m: float, pixels: float = 3.0) -> float:
    """Boundary band width in metres for a given ground sample distance."""
    if gsd_m <= 0:
        raise ValueError("gsd_m must be positive")
    return gsd_m * pixels
```

| Imagery | GSD | Band (3 px) | Notes |
|---|---|---|---|
| Consumer drone, low altitude | 0.02 – 0.05 m | 0.06 – 0.15 m | Below typical coordinate precision — check the export first |
| Survey drone | 0.10 m | 0.30 m | The usual case for footprint work |
| High-resolution satellite | 0.30 m | 0.90 m | Eaves and shadow start to dominate here |
| Mid-resolution satellite | 0.50 m | 1.50 m | Small structures may be below the band entirely |
| Sentinel-2 optical | 10 m | 30 m | Footprint-scale delineation is not meaningful |

The last row is not a joke: if the band is wider than the object, every pair of annotations scores near 1.0 and the metric has stopped measuring. Check `band_m < sqrt(area) / 2` and skip features that fail it rather than reporting a flattering number.

### Step 3 — Compute the Score

```python
from shapely.geometry.base import BaseGeometry

def boundary_iou(reference: BaseGeometry, candidate: BaseGeometry, band_m: float) -> float:
    """Intersection over union restricted to a band around each polygon's boundary.

    Both geometries must be in a projected CRS with metre units. Returns 0.0 when
    either input is empty, and 1.0 only for boundaries that coincide everywhere.
    """
    if reference.is_empty or candidate.is_empty:
        return 0.0
    if band_m <= 0:
        raise ValueError("band_m must be positive")
    ring_r = reference.boundary.buffer(band_m)
    ring_c = candidate.boundary.buffer(band_m)
    inter = ring_r.intersection(ring_c).area
    if inter == 0.0:
        return 0.0
    union = ring_r.area + ring_c.area - inter
    return float(inter / union)
```

`boundary` on a polygon with holes returns the exterior ring plus every interior ring, which is what you want: a courtyard traced badly is a delineation failure like any other.

### Step 4 — Run It Over a Batch and Keep Both Numbers

```python
import pandas as pd

def score_batch(reference: gpd.GeoDataFrame, candidate: gpd.GeoDataFrame,
                pairs: pd.DataFrame, gsd_m: float) -> pd.DataFrame:
    """Score matched pairs, reporting boundary IoU next to plain IoU."""
    band = band_for_gsd(gsd_m)
    rows = []
    for r in pairs.itertuples():
        gr = reference.loc[int(r.ia)].geometry
        gc = candidate.iloc[int(r.ib)].geometry
        inter = gr.intersection(gc).area
        plain = inter / (gr.area + gc.area - inter) if inter else 0.0
        too_small = band >= (gr.area ** 0.5) / 2
        rows.append({
            "ref_index": int(r.ia),
            "area_m2": round(gr.area, 1),
            "iou": round(plain, 3),
            "boundary_iou": None if too_small else round(boundary_iou(gr, gc, band), 3),
            "band_m": band,
            "skipped_too_small": too_small,
        })
    return pd.DataFrame(rows)
```

Reporting both is what makes the metric actionable. The features worth a reviewer's time are the ones where `iou` is high and `boundary_iou` is low: large objects whose area is covering for a bad outline.

<svg viewBox="0 0 720 290" role="img" aria-label="Plain IoU against boundary IoU for six features, with the quadrant that deserves review marked" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>The gap between the two scores is the review queue</title>
  <desc>Six features plotted with plain IoU on the horizontal axis and boundary IoU on the vertical. Features near the diagonal are consistent under both metrics. The lower right region — high plain IoU, low boundary IoU — holds large objects whose area hides a bad outline, and those are the ones that should be reviewed.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <!-- Axes -->
  <line x1="120" y1="230" x2="600" y2="230" stroke="currentColor" stroke-width="1.4" opacity="0.6"/>
  <line x1="120" y1="230" x2="120" y2="40" stroke="currentColor" stroke-width="1.4" opacity="0.6"/>
  <text x="120" y="250" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.6">0.5</text>
  <text x="360" y="250" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.6">0.75</text>
  <text x="600" y="250" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.6">1.0</text>
  <text x="360" y="272" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.75">plain IoU</text>
  <text x="100" y="250" text-anchor="end" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.6">0.0</text>
  <text x="100" y="138" text-anchor="end" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.6">0.5</text>
  <text x="100" y="46" text-anchor="end" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.6">1.0</text>
  <text x="66" y="135" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.75" transform="rotate(-90 66 135)">boundary IoU</text>
  <!-- Review region -->
  <rect x="420" y="150" width="180" height="80" fill="currentColor" opacity="0.1"/>
  <text x="510" y="176" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">review these</text>
  <text x="510" y="194" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">area is covering</text>
  <text x="510" y="208" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">for the outline</text>
  <!-- Points -->
  <circle cx="176" cy="196" r="5" fill="currentColor" opacity="0.55"/>
  <text x="186" y="192" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.75">shed, 38 m²</text>
  <circle cx="330" cy="118" r="5" fill="currentColor" opacity="0.55"/>
  <text x="340" y="114" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.75">house, 140 m²</text>
  <circle cx="420" cy="84" r="5" fill="currentColor" opacity="0.55"/>
  <text x="430" y="80" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.75">house, 210 m²</text>
  <circle cx="552" cy="62" r="5" fill="currentColor" opacity="0.55"/>
  <text x="500" y="58" text-anchor="end" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.75">school, 1 100 m²</text>
  <circle cx="530" cy="196" r="5" fill="currentColor"/>
  <text x="520" y="222" text-anchor="end" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.85">warehouse, 900 m²</text>
  <circle cx="576" cy="170" r="5" fill="currentColor"/>
  <text x="596" y="146" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.85">depot, 1 400 m²</text>
  <!-- Diagonal -->
  <path d="M120 230 L600 40" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="3 3" opacity="0.45"/>
  <text x="250" y="72" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.6">the two metrics agree along here</text>
</svg>

## Parameters and Thresholds Reference

| Parameter | Value | Effect |
|---|---|---|
| `band_m` | 3 × GSD | Wider bands forgive more; a band above `sqrt(area)/2` makes the score meaningless |
| Floor, crisp classes | 0.70 – 0.80 | Buildings, solar arrays, hard-edged infrastructure |
| Floor, fuzzy classes | 0.45 – 0.60 | Wetland margins, canopy edges, burn scars |
| `skipped_too_small` | `band ≥ sqrt(area)/2` | Report the skip; a silently skipped feature reads as a pass |
| Buffer resolution | shapely default (16 segments/quarter) | Lower values bias the ring area on curved boundaries |

## Common Errors and Fixes

**Every score comes back as 1.0**
Root cause: the geometries are still in degrees, so a `band_m` of 1.0 buffered them by roughly 111 km and both rings cover everything.
Fix: run `to_metric()` first and assert the axis unit, as in Step 1.

**`TopologyException` inside `buffer`**
Root cause: a self-intersecting ring reached the buffer operation.
Fix: call `make_valid()` on both inputs before scoring — the repair belongs before the metric, not inside it.

**Scores are systematically lower after switching imagery providers**
Root cause: the band was hard-coded rather than derived from GSD, and the new imagery is coarser.
Fix: derive `band_m` with `band_for_gsd()` per batch and record it beside the score, so historical numbers stay interpretable.

**A polygon with a courtyard scores badly despite a good outer wall**
Root cause: `boundary` includes interior rings, and the courtyard was traced loosely.
Fix: this is correct behaviour. If your project genuinely does not care about holes, compare `exterior` explicitly and say so in the report.

## Frequently Asked Questions

### Is boundary IoU the same as the metric used in panoptic segmentation papers?

It is the same idea applied to vectors. The published version computes the mask minus an eroded copy of itself, which is the raster equivalent of buffering the boundary inward. Doing it on vectors with an outward buffer is more natural for annotation data, which is stored as polygons, and it avoids rasterising twice at a resolution that would have to be chosen anyway.

### How expensive is it on a large batch?

Two buffer operations and one intersection per feature. On a batch of 50 000 building footprints it is a couple of minutes single-threaded, which is fine for a nightly job and too slow to run per keystroke in an annotation tool. If it needs to be interactive, simplify both geometries to the band width first — the result changes by less than the band.

### Can I use it to compare a model's predictions against ground truth?

Yes, and it is more informative than plain IoU for footprint extraction, because it is the outline quality that determines whether a predicted footprint is usable for area calculation. Vectorise the predicted mask first, as described in [automating batch pre-labeling with SAM and QGIS](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/qgis-plugin-ecosystem-for-annotation-teams/automating-batch-pre-labeling-with-sam-and-qgis/), and use the same band you use for human annotators so the two are comparable.

### What if the two polygons are matched wrongly in the first place?

Boundary IoU is a quality score, not an identity test. It assumes the pair is already matched; feeding it a building and the road beside it returns a low score that reads as bad tracing. Do the matching first with a low plain-IoU floor, as the [parent topic](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/annotation-quality-metrics-and-agreement/) sets out, and only then score.

## Related

- [Annotation Quality Metrics & Inter-Annotator Agreement](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/annotation-quality-metrics-and-agreement/) — the matching step that has to run before this score means anything, and the class-agreement half of the picture
- [Calculating IoU Thresholds for Geospatial Object Detection](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/calculating-iou-thresholds-for-geospatial-object-detection/) — why plain IoU has to be computed in metres too, and how thresholds shift with mission type
- [Best Practices for Polygon vs Bounding Box Annotation](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/defining-roi-label-taxonomies-for-aerial-imagery/best-practices-for-polygon-vs-bounding-box-annotation/) — the geometry choice that decides whether boundary quality is measurable at all

This metric is one part of the broader [Annotation Quality Metrics & Inter-Annotator Agreement](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/annotation-quality-metrics-and-agreement/) topic within [Geospatial Annotation Fundamentals & Architecture](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/).
