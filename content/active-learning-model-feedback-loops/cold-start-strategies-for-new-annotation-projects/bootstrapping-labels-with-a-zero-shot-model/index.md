---
title: "Bootstrapping Labels with a Zero-Shot Model"
description: "Use a zero-shot segmentation model to propose geometry for a project's first batch — filtered by area and shape, class-less by design, and measured by whether it actually saves annotator time."
slug: "bootstrapping-labels-with-a-zero-shot-model"
type: "tutorial"
breadcrumb:
  - label: "Home"
    url: "/"
  - label: "Active Learning & Model Feedback Loops for Geospatial Annotation"
    url: "/active-learning-model-feedback-loops/"
  - label: "Cold-Start Strategies for New Annotation Projects"
    url: "/active-learning-model-feedback-loops/cold-start-strategies-for-new-annotation-projects/"
  - label: "Bootstrapping Labels with a Zero-Shot Model"
    url: "/active-learning-model-feedback-loops/cold-start-strategies-for-new-annotation-projects/bootstrapping-labels-with-a-zero-shot-model/"
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
      "headline": "Bootstrapping Labels with a Zero-Shot Model",
      "description": "Use a zero-shot segmentation model to propose geometry for a project's first batch — filtered by area and shape, class-less by design, and measured by whether it actually saves annotator time.",
      "datePublished": "2026-08-08",
      "dateModified": "2026-08-08",
      "author": {"@type": "Organization", "name": "Geospatial Annotation"},
      "publisher": {"@type": "Organization", "name": "Geospatial Annotation"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.geospatialannotation.com/"},
        {"@type": "ListItem", "position": 2, "name": "Active Learning & Model Feedback Loops for Geospatial Annotation", "item": "https://www.geospatialannotation.com/active-learning-model-feedback-loops/"},
        {"@type": "ListItem", "position": 3, "name": "Cold-Start Strategies for New Annotation Projects", "item": "https://www.geospatialannotation.com/active-learning-model-feedback-loops/cold-start-strategies-for-new-annotation-projects/"},
        {"@type": "ListItem", "position": 4, "name": "Bootstrapping Labels with a Zero-Shot Model", "item": "https://www.geospatialannotation.com/active-learning-model-feedback-loops/cold-start-strategies-for-new-annotation-projects/bootstrapping-labels-with-a-zero-shot-model/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Bootstrap a first annotation batch with a zero-shot segmentation model",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Run the model per tile in the source CRS", "text": "Read each tile with a windowed read and run the zero-shot model on the source pixels rather than on rendered map tiles."},
        {"@type": "HowToStep", "position": 2, "name": "Vectorise and georeference the masks", "text": "Trace each mask to a polygon, simplify it to about one vertex per few pixels, and transform through the tile's affine to world coordinates."},
        {"@type": "HowToStep", "position": 3, "name": "Filter by area and shape", "text": "Drop proposals below a minimum ground area and above a compactness limit, because correcting a bad proposal costs more than drawing a polygon."},
        {"@type": "HowToStep", "position": 4, "name": "Ship them without classes", "text": "Attach no class to any proposal, so the annotator assigns one from your taxonomy rather than accepting the model's guess."},
        {"@type": "HowToStep", "position": 5, "name": "Measure whether it saved time", "text": "Track accept, adjust and delete rates and the median time per tile against an unassisted control group, and turn the assistance off if it is not winning."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why not let the zero-shot model assign classes too?",
          "acceptedAnswer": {"@type": "Answer", "text": "Because its classes come from its own training distribution, not from your taxonomy, and a confident wrong class is more expensive than no class. Annotators accept plausible defaults — that is what defaults are for — so a mislabelled proposal propagates into the dataset while throughput metrics look excellent. Geometry is what the model is genuinely good at and what costs the most to draw by hand."}
        },
        {
          "@type": "Question",
          "name": "What acceptance rate means the pre-labels are working?",
          "acceptedAnswer": {"@type": "Answer", "text": "Somewhere between about 55 and 85 percent. Below that, annotators spend more time deleting than drawing. Above it, they have almost certainly stopped checking — an acceptance rate of 95 percent on a first batch is a warning, not a success, and the way to confirm it is an adjudication sample rather than a survey."}
        },
        {
          "@type": "Question",
          "name": "Should proposals run on rendered tiles or on the source imagery?",
          "acceptedAnswer": {"@type": "Answer", "text": "On the source. A rendered tile has been stretched, resampled and possibly re-projected for human eyes, and the model sees the artefacts of all three. Reading the source window gives native values in the source CRS, which also makes the georeferencing exact rather than a chain of inversions."}
        },
        {
          "@type": "Question",
          "name": "How small is too small for a proposal?",
          "acceptedAnswer": {"@type": "Answer", "text": "Below roughly twenty square metres on 30 cm imagery, correcting a proposal takes longer than drawing the object from scratch, so those proposals are a net cost. The threshold scales with resolution rather than being universal: on 5 cm drone imagery the same reasoning puts the floor closer to one square metre."}
        }
      ]
    }
  ]
}
</script>

# Bootstrapping Labels with a Zero-Shot Model

A zero-shot segmentation model will happily outline every roof, shadow, field boundary and parked car in a tile without having seen a single label from your project. That is genuinely useful for a first batch — tracing is the expensive part of annotation and the model does it for free — provided two rules hold. The proposals must be filtered hard enough that correcting them beats drawing from scratch, and they must arrive **without classes**, because the model's vocabulary is not your taxonomy and a confident wrong label costs more than no label. This guide covers the run, the vectorisation, the filters, and the measurement that says whether the assistance is paying for itself.

## Why This Matters at Cold Start

In the [cold-start phase](https://www.geospatialannotation.com/active-learning-model-feedback-loops/cold-start-strategies-for-new-annotation-projects/) there is no project model, so there is no uncertainty to sample on and the only lever is making the first batches cheaper. Zero-shot geometry is that lever. It is also the phase where a bad pre-labelling setup does the most damage: the first batch defines the annotation guide, sets the team's habits, and becomes the seed everything else is measured against. A pre-label that quietly biases it toward what a general-purpose model finds salient is expensive to unwind.

<svg viewBox="0 36 720 259" role="img" aria-label="What a zero-shot model contributes and what it cannot, split into geometry and semantics" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>The model draws; the human decides what it drew</title>
  <desc>A zero-shot segmentation model returns accurate outlines with no semantics: it separates a roof from its surroundings without knowing whether the project calls it building, warehouse or industrial. The annotator's remaining work is assigning a class from the project taxonomy and correcting the minority of outlines that are wrong, which is far cheaper than tracing every object by hand.</desc>
  <rect x="0" y="36" width="720" height="259" style="fill:var(--bg)"/>
  <!-- Model -->
  <rect x="20" y="56" width="320" height="170" rx="8" fill="none" stroke="currentColor" stroke-width="2"/>
  <text x="180" y="82" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">what the model supplies</text>
  <polygon points="60,110 150,102 158,158 68,166" fill="currentColor" opacity="0.22" stroke="currentColor" stroke-width="1.6"/>
  <polygon points="186,104 286,98 292,150 192,158" fill="currentColor" opacity="0.22" stroke="currentColor" stroke-width="1.6"/>
  <polygon points="70,182 148,176 152,208 74,212" fill="currentColor" opacity="0.22" stroke="currentColor" stroke-width="1.6"/>
  <polygon points="196,178 288,172 292,208 200,212" fill="currentColor" opacity="0.22" stroke="currentColor" stroke-width="1.6"/>
  <text x="180" y="246" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.85">outlines, in world coordinates, with no class</text>
  <!-- Human -->
  <rect x="380" y="56" width="320" height="170" rx="8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 3"/>
  <text x="540" y="82" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">what the annotator supplies</text>
  <text x="400" y="112" font-size="11" fill="currentColor" font-family="sans-serif">the class, from your taxonomy</text>
  <text x="400" y="138" font-size="11" fill="currentColor" font-family="sans-serif">the judgement about what counts</text>
  <text x="400" y="164" font-size="11" fill="currentColor" font-family="sans-serif">corrections to the minority that are wrong</text>
  <text x="400" y="190" font-size="11" fill="currentColor" font-family="sans-serif">the objects the model missed entirely</text>
  <text x="540" y="246" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.85">none of which a general-purpose model can guess</text>
  <text x="360" y="272" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">splitting the work this way is what keeps the assistance from becoming a source of silent bias</text>
</svg>

## Step-by-Step Implementation

### Step 1 — Run on Source Pixels, Tile by Tile

```bash
pip install torch==2.3.1 rasterio==1.3.10 shapely==2.0.6 geopandas==0.14.4 numpy==1.26.4
```

Read a window from the source COG rather than a rendered map tile. The model then sees native values, and the georeferencing is a single affine rather than a chain of inversions through a tiler's rendering.

```python
import rasterio
from rasterio.windows import Window

def tile_windows(path: str, size: int = 1024, overlap: int = 64):
    """Yield (window, transform) pairs covering the scene with a fixed overlap."""
    with rasterio.open(path) as src:
        step = size - overlap
        for row in range(0, src.height, step):
            for col in range(0, src.width, step):
                w = Window(col, row,
                           min(size, src.width - col),
                           min(size, src.height - row))
                if w.width < size // 2 or w.height < size // 2:
                    continue                       # skip slivers at the far edges
                yield w, rasterio.windows.transform(w, src.transform), src.crs
```

The overlap matters for the same reason it does in [automating pre-labeling with foundation models](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/automating-pre-labeling-with-foundation-models/): an object crossing a window edge is proposed twice, in truncated form, and the duplicates must be merged after georeferencing rather than in pixel space.

### Step 2 — Vectorise, Simplify, Georeference

```python
from rasterio.features import shapes
from shapely.geometry import shape
from shapely.geometry.base import BaseGeometry

def masks_to_polygons(masks, transform, simplify_m: float = 0.3) -> list[BaseGeometry]:
    """Trace each boolean mask to a simplified polygon in the source CRS."""
    out: list[BaseGeometry] = []
    for mask in masks:
        for geom, value in shapes(mask.astype("uint8"), mask=mask, transform=transform):
            if value != 1:
                continue
            poly = shape(geom).simplify(simplify_m).buffer(0)
            if not poly.is_empty and poly.geom_type in ("Polygon", "MultiPolygon"):
                out.append(poly)
    return out
```

`simplify_m` should be roughly the ground size of one pixel: enough to remove the staircase that pixel tracing produces, not enough to round off real corners. The trade-off is the one covered in [best practices for polygon vs bounding box annotation](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/defining-roi-label-taxonomies-for-aerial-imagery/best-practices-for-polygon-vs-bounding-box-annotation/).

### Step 3 — Filter Hard

Most of what a zero-shot model returns is not an object your project cares about. Two cheap geometric filters remove the bulk of it.

<svg viewBox="0 0 720 260" role="img" aria-label="Proposal counts falling as each filter is applied, from raw model output to what reaches an annotator" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>What survives each filter on one tile</title>
  <desc>Automatic mode returns 412 masks on one tile. Dropping everything below twenty square metres leaves 96. Removing shapes more than twelve times longer than they are wide — shadows, hedgerows, road margins — leaves 61. Merging duplicates across the window overlap leaves 54, which is the number an annotator actually sees.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <text x="180" y="46" text-anchor="end" font-size="11" fill="currentColor" font-family="sans-serif">raw model output</text>
  <rect x="192" y="34" width="470" height="18" rx="3" fill="currentColor" opacity="0.45"/>
  <text x="670" y="47" font-size="11" fill="currentColor" font-family="monospace">412</text>
  <text x="180" y="94" text-anchor="end" font-size="11" fill="currentColor" font-family="sans-serif">area ≥ 20 m²</text>
  <rect x="192" y="82" width="110" height="18" rx="3" fill="currentColor" opacity="0.45"/>
  <text x="310" y="95" font-size="11" fill="currentColor" font-family="monospace">96</text>
  <text x="180" y="142" text-anchor="end" font-size="11" fill="currentColor" font-family="sans-serif">elongation ≤ 12</text>
  <rect x="192" y="130" width="70" height="18" rx="3" fill="currentColor" opacity="0.45"/>
  <text x="270" y="143" font-size="11" fill="currentColor" font-family="monospace">61</text>
  <text x="180" y="190" text-anchor="end" font-size="11" fill="currentColor" font-family="sans-serif">overlap merged</text>
  <rect x="192" y="178" width="62" height="18" rx="3" fill="none" stroke="currentColor" stroke-width="1.6"/>
  <text x="262" y="191" font-size="11" fill="currentColor" font-family="monospace">54</text>
  <text x="192" y="226" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.85">87% of what the model returned never reaches a person — and that is the filters working,</text>
  <text x="192" y="244" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.85">not the model failing: it was asked for everything and it gave everything</text>
</svg>

```python
import math

def keep_proposal(poly: BaseGeometry, min_area_m2: float = 20.0,
                  max_elongation: float = 12.0) -> bool:
    """Area and shape filters, both in projected metres."""
    if poly.area < min_area_m2:
        return False                       # correcting it costs more than drawing it
    box = poly.minimum_rotated_rectangle
    xs, ys = box.exterior.coords.xy
    edges = [math.dist((xs[i], ys[i]), (xs[i + 1], ys[i + 1])) for i in range(4)]
    long_, short = max(edges), min(edges)
    if short == 0 or (long_ / short) > max_elongation:
        return False                       # a shadow strip or a field margin, not an object
    return True
```

The elongation filter earns its place on aerial imagery specifically: shadows, hedgerows and road margins are the commonest false proposals and they are all long and thin, while the built objects most projects care about are not.

### Step 4 — Ship Them Class-Less

```python
from dataclasses import dataclass

@dataclass(frozen=True)
class Proposal:
    tile_id: str
    geometry_wkt: str
    crs: str
    source: str = "zero-shot"
    class_name: str | None = None          # deliberately empty — the human decides
```

Every annotation platform will happily accept a class on a prediction, and it is worth resisting. The failure it prevents is not the model being wrong occasionally; it is the model being *plausibly* wrong systematically, so that a whole batch inherits its idea of where `warehouse` stops and `industrial` starts.

### Step 5 — Measure Whether It Helped

Pre-labelling is an intervention and deserves a control. Run a slice of the first batch without proposals and compare.

```python
import pandas as pd

def assistance_report(events: pd.DataFrame) -> pd.DataFrame:
    """Accept/adjust/delete rates and median tile time, assisted against control."""
    g = events.groupby("arm")
    return pd.DataFrame({
        "tiles": g["tile_id"].nunique(),
        "median_seconds_per_tile": g["seconds"].median().round(1),
        "accepted": g["action"].apply(lambda s: (s == "accept").mean().round(3)),
        "adjusted": g["action"].apply(lambda s: (s == "adjust").mean().round(3)),
        "deleted": g["action"].apply(lambda s: (s == "delete").mean().round(3)),
    })
```

Three readings and what each means:

- **Median time per tile is not lower than the control.** The proposals are not helping; the filters are too loose or the model is a poor fit for this imagery.
- **Acceptance above ~90%.** Almost certainly nobody is checking. Confirm with an adjudication sample rather than a survey, using the agreement machinery in [annotation quality metrics and agreement](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/annotation-quality-metrics-and-agreement/).
- **Deletion above ~40%.** The filters are letting through objects the project does not care about. Raise `min_area_m2` before touching the model.

<svg viewBox="0 0 720 280" role="img" aria-label="Median seconds per tile and proposal outcomes for an assisted arm against an unassisted control" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>The control arm is what makes the saving a fact</title>
  <desc>The assisted arm completes a tile in a median of 96 seconds against 168 for the unassisted control, a 43 percent saving. Of its proposals, 62 percent are accepted as drawn, 24 percent adjusted and 14 percent deleted — a distribution that indicates annotators are genuinely checking rather than clicking through.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <!-- Time -->
  <text x="20" y="46" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">median seconds per tile</text>
  <text x="200" y="80" text-anchor="end" font-size="11" fill="currentColor" font-family="sans-serif">control</text>
  <rect x="210" y="66" width="420" height="20" rx="3" fill="none" stroke="currentColor" stroke-width="1.6"/>
  <text x="642" y="81" font-size="11" fill="currentColor" font-family="monospace">168 s</text>
  <text x="200" y="112" text-anchor="end" font-size="11" fill="currentColor" font-family="sans-serif">assisted</text>
  <rect x="210" y="98" width="240" height="20" rx="3" fill="currentColor" opacity="0.45"/>
  <text x="462" y="113" font-size="11" fill="currentColor" font-family="monospace">96 s</text>
  <text x="210" y="140" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">a 43% saving — and the control arm is the only thing that makes that a measurement</text>
  <!-- Outcomes -->
  <text x="20" y="184" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">what happened to the proposals</text>
  <rect x="210" y="196" width="266" height="26" rx="3" fill="currentColor" opacity="0.45"/>
  <rect x="476" y="196" width="103" height="26" rx="3" fill="currentColor" opacity="0.25"/>
  <rect x="579" y="196" width="60" height="26" rx="3" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="343" y="214" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif">accepted 62%</text>
  <text x="527" y="214" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif">adjusted 24%</text>
  <text x="609" y="214" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif">del 14%</text>
  <text x="210" y="248" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">acceptance in the 55–85% band: high enough to save time, low enough that people are still looking</text>
  <text x="210" y="266" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">above 90% would be a warning about attention, not a report of quality</text>
</svg>

## Parameters and Thresholds Reference

| Parameter | Typical | Scales with |
|---|---|---|
| `min_area_m2` | 20 m² at 30 cm GSD | Resolution — about 1 m² at 5 cm |
| `max_elongation` | 12 | The shapes your project cares about |
| `simplify_m` | ≈ 1 pixel on the ground | GSD |
| Window / overlap | 1024 px / 64 px | Model input size |
| Healthy acceptance | 0.55 – 0.85 | — |
| Control arm | 5 – 10% of the batch | Enough to compare medians |

## Common Errors and Fixes

**Proposals land tens of metres from the objects**
Root cause: the model ran on rendered map tiles and the coordinates were inverted through the tiler's Web Mercator rendering.
Fix: run on source windows, as in Step 1, and transform with the window's own affine.

**Thousands of proposals per tile**
Root cause: automatic mode with no filtering — the model has segmented every roof facet and shadow separately.
Fix: apply Step 3's filters before anything reaches a platform, and consider prompting with a detector's boxes rather than running in automatic mode.

**Annotators say the proposals slow them down**
Root cause: deletion rate is high, so the assistance is net negative.
Fix: measure it with the control arm rather than debating it; raise `min_area_m2` and re-measure.

**Duplicate proposals along window edges**
Root cause: overlapping windows, deduplicated in pixel space or not at all.
Fix: merge after georeferencing, on world-coordinate IoU — the two windows have different pixel origins.

## Frequently Asked Questions

### Can I fine-tune the zero-shot model on the first batch?

Yes, and that is usually the point at which the project stops being cold-started. Once a fine-tuned model exists, its uncertainty starts to mean something and the [handover to uncertainty sampling](https://www.geospatialannotation.com/active-learning-model-feedback-loops/cold-start-strategies-for-new-annotation-projects/) becomes the next question.

### Does this work for line features like roads?

Less well. Segmentation models return regions, and converting a region to a centreline is a skeletonisation step that introduces its own errors. For linear networks, prompting with an existing vector source and having annotators correct it usually beats zero-shot proposals.

### How do I keep proposals from biasing the taxonomy?

Keep them class-less, and write the annotation guide from adjudicated examples rather than from what the model proposed. The bias to watch for is the guide silently adopting the model's implicit object boundaries — the roof versus the parcel, for instance — because those were the shapes people spent their time correcting.

### Should proposals be versioned with the dataset?

Record which model and which parameters produced them, in the batch manifest, and version the accepted result rather than the proposals themselves. What matters six months later is knowing that this batch was pre-labelled at all, since it is a plausible explanation for a systematic difference between it and an unassisted batch.

## Related

- [Cold-Start Strategies for New Annotation Projects](https://www.geospatialannotation.com/active-learning-model-feedback-loops/cold-start-strategies-for-new-annotation-projects/) — the phase this fits into, and what to do with the batches it produces
- [Automating Pre-Labeling with Foundation Models](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/automating-pre-labeling-with-foundation-models/) — the production pipeline for running these models at scale, including tile-boundary deduplication
- [Automating Batch Pre-Labeling with SAM and QGIS](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/qgis-plugin-ecosystem-for-annotation-teams/automating-batch-pre-labeling-with-sam-and-qgis/) — the desktop route, when proposals are corrected in a GIS rather than a web queue

Bootstrapping is the first move within [Cold-Start Strategies for New Annotation Projects](https://www.geospatialannotation.com/active-learning-model-feedback-loops/cold-start-strategies-for-new-annotation-projects/), part of [Active Learning & Model Feedback Loops](https://www.geospatialannotation.com/active-learning-model-feedback-loops/).
