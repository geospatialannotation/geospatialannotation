---
title: "Annotation Quality Metrics & Inter-Annotator Agreement"
description: "Measure geospatial annotation quality with the metrics that survive contact with production: boundary IoU, Cohen's kappa, Hausdorff distance, and per-class agreement matrices computed in projected metres."
slug: "annotation-quality-metrics-and-agreement"
type: "guide"
breadcrumb:
  - label: "Home"
    url: "/"
  - label: "Geospatial Annotation Fundamentals & Architecture"
    url: "/geospatial-annotation-fundamentals-architecture/"
  - label: "Annotation Quality Metrics & Inter-Annotator Agreement"
    url: "/geospatial-annotation-fundamentals-architecture/annotation-quality-metrics-and-agreement/"
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
      "headline": "Annotation Quality Metrics & Inter-Annotator Agreement",
      "description": "Measure geospatial annotation quality with the metrics that survive contact with production: boundary IoU, Cohen's kappa, Hausdorff distance, and per-class agreement matrices computed in projected metres.",
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
        {"@type": "ListItem", "position": 3, "name": "Annotation Quality Metrics & Inter-Annotator Agreement", "item": "https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/annotation-quality-metrics-and-agreement/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Measure geospatial annotation quality and inter-annotator agreement",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Build an overlap set", "text": "Assign a deliberate overlap of five to ten percent of tiles to two or more annotators so agreement can be measured on identical ground rather than inferred from throughput."},
        {"@type": "HowToStep", "position": 2, "name": "Project before measuring", "text": "Reproject every geometry to a local metric CRS so areas, distances and IoU are computed in square metres and metres rather than degrees, which vary with latitude."},
        {"@type": "HowToStep", "position": 3, "name": "Match features across annotators", "text": "Pair each annotator's features by greatest overlap above a minimum IoU, treating unmatched features as misses and false positives rather than silently dropping them."},
        {"@type": "HowToStep", "position": 4, "name": "Compute geometry and label agreement separately", "text": "Report boundary IoU and Hausdorff distance for delineation quality, and Cohen's kappa over the matched pairs for class agreement, because a single number hides which of the two is failing."},
        {"@type": "HowToStep", "position": 5, "name": "Route disagreement to adjudication", "text": "Send matched pairs below the geometry threshold or with disagreeing classes to a senior reviewer, and feed every ruling back into the annotation guide so the same dispute is not re-litigated."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why is plain IoU a poor measure of annotation quality for building footprints?",
          "acceptedAnswer": {"@type": "Answer", "text": "IoU is dominated by area, so a large footprint whose walls are traced sloppily can still score above 0.9 while a small one that is nearly perfect scores 0.75 because a two-pixel error is a larger share of its area. Boundary IoU restricts the comparison to a band around each polygon's edge, which is where delineation quality actually lives, and it makes scores comparable between a warehouse and a garden shed."
        }
        },
        {
          "@type": "Question",
          "name": "How much overlap should annotators be given for agreement measurement?",
          "acceptedAnswer": {"@type": "Answer", "text": "Five to ten percent of tiles double-labelled is enough to estimate agreement per class and per annotator without spending a large share of the budget on duplicate work. Below about three percent the per-class estimates for anything but the commonest classes become too noisy to act on, and above fifteen percent the duplicate labelling starts to compete with coverage."}
        },
        {
          "@type": "Question",
          "name": "What does Cohen's kappa add over raw percentage agreement?",
          "acceptedAnswer": {"@type": "Answer", "text": "Raw agreement is inflated by class imbalance: if 92 percent of features are buildings, two annotators who both label everything building agree 92 percent of the time while demonstrating no skill at all. Kappa subtracts the agreement expected by chance given each annotator's own class distribution, so the same pair scores near zero, which is the honest number."}
        },
        {
          "@type": "Question",
          "name": "Should quality thresholds be the same for every class?",
          "acceptedAnswer": {"@type": "Answer", "text": "No. A building has a crisp edge that two competent annotators will place within a pixel or two, so a boundary IoU floor of 0.75 is reasonable. A wetland margin or a burned-area boundary is genuinely fuzzy on the imagery, and holding it to the same threshold generates adjudication traffic that no ruling can resolve. Set the floor per class from the measured agreement of your own best annotators."}
        }
      ]
    }
  ]
}
</script>

# Annotation Quality Metrics & Inter-Annotator Agreement

A geospatial annotation project can report 96% agreement between its annotators and still be shipping unusable labels. The number is real; it is measured on a class distribution where nine in ten features are buildings, so two annotators who default to `building` on everything ambiguous agree almost perfectly while contributing nothing. Meanwhile the footprints they draw differ by three metres along every wall, which no percentage-agreement figure asks about. This topic covers the metrics that separate those two failures — delineation quality and label agreement — measures each in units that mean something on the ground, and wires the result into an adjudication queue rather than a dashboard nobody acts on.

The distinction matters because the two failures have different fixes. Sloppy delineation is a tooling and training problem: snapping is off, the imagery is being annotated at the wrong zoom, or nobody told the team that eaves are not walls. Label disagreement is a taxonomy problem: two classes are not actually separable on this imagery, or the guide never said which one wins. Reporting a single "quality score" mixes the two into a number that tells you something is wrong and nothing about what to do.

## Prerequisites & Toolchain Alignment

The measurement code needs a geometry stack and nothing else — no model, no GPU, and no annotation platform API. Pin the versions, because agreement numbers computed under different `shapely` releases are not comparable across a project's history.

```bash
pip install geopandas==0.14.4 shapely==2.0.6 pyproj==3.6.1 \
            scikit-learn==1.5.1 numpy==1.26.4 pandas==2.2.2
```

You also need three things that are not packages:

- **A deliberate overlap set.** Agreement can only be measured where two people annotated the same ground. Five to ten percent of tiles assigned to two annotators is the standard allocation; the assignment must be made when the batch is created, because retrofitting an overlap set later biases it toward whatever was easy to re-open.
- **A metric CRS for the working area.** Every metric below is a distance or an area, and both are meaningless in degrees. Choose the projection once per batch as described in [coordinate reference systems in annotation pipelines](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) and record it in the batch manifest.
- **A stable feature identity.** Matching two annotators' work requires knowing which of their features are meant to be the same object. Nothing in the file says so, which is why the matching step below is a real algorithm rather than a join.

<svg viewBox="0 0 720 300" role="img" aria-label="Two annotators' polygons over the same tile, matched by overlap, with matched pairs, misses and false positives marked" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>What the matching step has to work out</title>
  <desc>Annotator A drew four polygons on a tile and annotator B drew four. Three pair up by overlap above the matching threshold. One of A's polygons has no counterpart, which is a miss from B's perspective, and one of B's has none, which is a false positive. Only the matched pairs can carry a geometry or class agreement score; the unmatched features are counted separately as recall and precision failures.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <rect x="30" y="46" width="300" height="190" fill="none" stroke="currentColor" stroke-width="1.3"/>
  <text x="180" y="36" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">one tile, two annotators</text>
  <!-- matched pair 1 -->
  <polygon points="60,74 130,68 136,116 66,124" fill="none" stroke="currentColor" stroke-width="2"/>
  <polygon points="64,78 134,72 140,120 70,128" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="5 3"/>
  <!-- matched pair 2 -->
  <polygon points="180,80 258,74 266,130 188,138" fill="none" stroke="currentColor" stroke-width="2"/>
  <polygon points="176,86 254,80 262,136 184,144" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="5 3"/>
  <!-- matched pair 3 -->
  <polygon points="66,158 128,152 134,206 72,212" fill="none" stroke="currentColor" stroke-width="2"/>
  <polygon points="72,162 134,156 140,210 78,216" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="5 3"/>
  <!-- A only -->
  <polygon points="196,168 258,162 264,214 202,220" fill="none" stroke="currentColor" stroke-width="2"/>
  <!-- B only -->
  <polygon points="278,88 316,84 320,128 282,132" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="5 3"/>
  <!-- Legend and outcome -->
  <line x1="360" y1="60" x2="392" y2="60" stroke="currentColor" stroke-width="2"/>
  <text x="400" y="64" font-size="11" fill="currentColor" font-family="sans-serif">annotator A</text>
  <line x1="360" y1="84" x2="392" y2="84" stroke="currentColor" stroke-width="1.6" stroke-dasharray="5 3"/>
  <text x="400" y="88" font-size="11" fill="currentColor" font-family="sans-serif">annotator B</text>
  <rect x="360" y="110" width="330" height="46" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="376" y="130" font-size="11" fill="currentColor" font-family="sans-serif">3 matched pairs</text>
  <text x="376" y="148" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">these carry a geometry score and a class comparison</text>
  <rect x="360" y="166" width="330" height="46" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 3"/>
  <text x="376" y="186" font-size="11" fill="currentColor" font-family="sans-serif">1 unmatched from each side</text>
  <text x="376" y="204" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">counted as recall and precision failures, not as disagreement</text>
  <text x="360" y="238" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">dropping the unmatched features is the</text>
  <text x="360" y="252" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">easiest way to report agreement that looks</text>
  <text x="360" y="266" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">excellent on a batch nobody finished</text>
</svg>

## Core Measurement Workflow

### Step 1 — Load Both Annotators and Project to Metres

Read each annotator's GeoJSON, confirm the declared CRS, and reproject both to the batch's working projection before a single metric is computed. Doing it in one place means no downstream function has to ask what units it is holding.

```python
from pathlib import Path
import geopandas as gpd

def load_pair(path_a: Path, path_b: Path, work_crs: str) -> tuple[gpd.GeoDataFrame, gpd.GeoDataFrame]:
    """Load two annotators' features for the same tile, both in a metric CRS."""
    a = gpd.read_file(path_a)
    b = gpd.read_file(path_b)
    for name, gdf in (("a", a), ("b", b)):
        if gdf.crs is None:
            raise ValueError(f"annotator {name}: no CRS declared in {path_a if name == 'a' else path_b}")
    a = a.to_crs(work_crs)
    b = b.to_crs(work_crs)
    # Repair before measuring: an invalid ring makes every area below meaningless.
    a["geometry"] = a.geometry.make_valid()
    b["geometry"] = b.geometry.make_valid()
    return a, b
```

### Step 2 — Match Features by Greatest Overlap

Two annotators produce two independent feature sets with no shared identifiers. The match is greedy on IoU: for each of A's features, take B's feature with the largest overlap, provided that overlap clears a low matching floor. The floor exists to stop a building being "matched" to the road beside it; it is deliberately much lower than the quality threshold, because a badly drawn pair is still a pair.

```python
import geopandas as gpd
import pandas as pd

MATCH_FLOOR = 0.30   # low on purpose: this decides identity, not quality

def match_features(a: gpd.GeoDataFrame, b: gpd.GeoDataFrame) -> pd.DataFrame:
    """Greedy one-to-one matching of A's features to B's by intersection over union."""
    pairs: list[dict] = []
    taken: set[int] = set()
    sindex = b.sindex
    for ia, ga in a.geometry.items():
        best_j, best_iou = None, 0.0
        for ib in sindex.query(ga, predicate="intersects"):
            if ib in taken:
                continue
            gb = b.geometry.iloc[ib]
            inter = ga.intersection(gb).area
            if inter == 0.0:
                continue
            iou = inter / (ga.area + gb.area - inter)
            if iou > best_iou:
                best_j, best_iou = ib, iou
        if best_j is not None and best_iou >= MATCH_FLOOR:
            taken.add(best_j)
            pairs.append({"ia": ia, "ib": best_j, "iou": best_iou})
    matched_a = {p["ia"] for p in pairs}
    matched_b = {p["ib"] for p in pairs}
    return pd.DataFrame(pairs), sorted(set(a.index) - matched_a), sorted(set(range(len(b))) - matched_b)
```

The two lists the function returns alongside the pairs are not bookkeeping. Unmatched features from A are objects B never drew, and unmatched features from B are objects A never drew — recall and precision failures respectively. A quality report that silently drops them describes only the features both annotators found, which is the easiest subset to agree on.

### Step 3 — Score Delineation with Boundary IoU

Plain IoU is dominated by area. A 900 m² warehouse traced three metres wide of its true wall still scores about 0.94; a 40 m² shed traced within half a metre scores 0.88. Ranking by that number puts effort in the wrong place. Boundary IoU compares only a band around each polygon's edge, so the score reflects the tracing rather than the size.

```python
from shapely.geometry.base import BaseGeometry

def boundary_iou(g1: BaseGeometry, g2: BaseGeometry, band_m: float = 1.0) -> float:
    """IoU restricted to a band of `band_m` metres around each polygon's boundary.

    Both geometries must already be in a projected CRS whose unit is the metre.
    """
    if g1.is_empty or g2.is_empty:
        return 0.0
    b1 = g1.boundary.buffer(band_m)
    b2 = g2.boundary.buffer(band_m)
    inter = b1.intersection(b2).area
    if inter == 0.0:
        return 0.0
    return inter / (b1.area + b2.area - inter)
```

Set `band_m` from the ground sample distance rather than by taste: roughly three pixels is the width within which two competent annotators genuinely cannot be told apart. At 30 cm imagery that is 0.9 m; at 10 cm drone imagery, 0.3 m. Using one fixed band across sensors makes the same team look better on coarse imagery, which is the opposite of what the metric is for.

### Step 4 — Score Label Agreement with Cohen's Kappa

Geometry agreement says nothing about whether the two annotators called the object the same thing. Over the matched pairs — and only the matched pairs, since an unmatched feature has no counterpart class — compute Cohen's kappa on the class labels.

```python
import pandas as pd
from sklearn.metrics import cohen_kappa_score, confusion_matrix

def label_agreement(a: gpd.GeoDataFrame, b: gpd.GeoDataFrame, pairs: pd.DataFrame,
                    class_field: str = "class_name") -> dict:
    """Cohen's kappa and a confusion matrix over the matched pairs."""
    ya = [a.loc[int(r.ia), class_field] for r in pairs.itertuples()]
    yb = [b.iloc[int(r.ib)][class_field] for r in pairs.itertuples()]
    labels = sorted(set(ya) | set(yb))
    return {
        "kappa": float(cohen_kappa_score(ya, yb, labels=labels)),
        "raw_agreement": float(sum(x == y for x, y in zip(ya, yb)) / max(len(ya), 1)),
        "labels": labels,
        "matrix": confusion_matrix(ya, yb, labels=labels).tolist(),
        "n": len(ya),
    }
```

Report `kappa` and `raw_agreement` side by side, always. The gap between them is the class imbalance in your batch, and a large gap is itself a finding: it means the headline agreement number is being carried by one dominant class.

<svg viewBox="0 0 720 290" role="img" aria-label="Raw agreement compared with Cohen's kappa on the same three batches, showing the gap widening with class imbalance" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>The gap between raw agreement and kappa is the class imbalance</title>
  <desc>Three batches. A balanced batch with five roughly equal classes reports 0.88 raw agreement and 0.85 kappa, a small gap. A moderately imbalanced batch reports 0.91 raw and 0.72 kappa. A batch where 92 percent of features are one class reports 0.96 raw agreement and 0.31 kappa, because almost all of that agreement is what two annotators guessing the majority class would achieve anyway.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <!-- Axis -->
  <line x1="220" y1="232" x2="660" y2="232" stroke="currentColor" stroke-width="1.4" opacity="0.6"/>
  <text x="220" y="250" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.6">0.0</text>
  <text x="440" y="250" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.6">0.5</text>
  <text x="660" y="250" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.6">1.0</text>
  <!-- Batch 1 -->
  <text x="212" y="62" text-anchor="end" font-size="11" fill="currentColor" font-family="sans-serif">balanced batch</text>
  <text x="212" y="78" text-anchor="end" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.65">5 classes, none over 30%</text>
  <rect x="220" y="52" width="387" height="14" rx="3" fill="currentColor" opacity="0.45"/>
  <text x="615" y="64" font-size="10" fill="currentColor" font-family="monospace" opacity="0.8">0.88</text>
  <rect x="220" y="70" width="374" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="602" y="82" font-size="10" fill="currentColor" font-family="monospace" opacity="0.8">0.85</text>
  <!-- Batch 2 -->
  <text x="212" y="128" text-anchor="end" font-size="11" fill="currentColor" font-family="sans-serif">moderately skewed</text>
  <text x="212" y="144" text-anchor="end" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.65">top class 64%</text>
  <rect x="220" y="118" width="400" height="14" rx="3" fill="currentColor" opacity="0.45"/>
  <text x="628" y="130" font-size="10" fill="currentColor" font-family="monospace" opacity="0.8">0.91</text>
  <rect x="220" y="136" width="317" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="545" y="148" font-size="10" fill="currentColor" font-family="monospace" opacity="0.8">0.72</text>
  <!-- Batch 3 -->
  <text x="212" y="194" text-anchor="end" font-size="11" fill="currentColor" font-family="sans-serif">one class dominates</text>
  <text x="212" y="210" text-anchor="end" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.65">top class 92%</text>
  <rect x="220" y="184" width="422" height="14" rx="3" fill="currentColor" opacity="0.45"/>
  <text x="650" y="196" font-size="10" fill="currentColor" font-family="monospace" opacity="0.8">0.96</text>
  <rect x="220" y="202" width="136" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="364" y="214" font-size="10" fill="currentColor" font-family="monospace" opacity="0.8">0.31</text>
  <!-- Legend -->
  <rect x="220" y="266" width="18" height="12" rx="3" fill="currentColor" opacity="0.45"/>
  <text x="246" y="276" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">raw agreement</text>
  <rect x="380" y="266" width="18" height="12" rx="3" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="406" y="276" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">Cohen's kappa — chance agreement removed</text>
</svg>

### Step 5 — Route the Disagreements

Metrics that end in a report change nothing. Every matched pair below the geometry floor for its class, and every pair whose labels disagree, becomes a queue item with both geometries attached and the tile it came from. The reviewer's ruling does two things: it fixes the feature, and it produces a sentence for the annotation guide.

```python
from dataclasses import dataclass, asdict
import json

@dataclass(frozen=True)
class Dispute:
    tile_id: str
    kind: str            # "geometry" | "class"
    class_a: str
    class_b: str
    score: float
    threshold: float

def build_queue(tile_id: str, a, b, pairs, floors: dict[str, float],
                class_field: str = "class_name") -> list[Dispute]:
    out: list[Dispute] = []
    for r in pairs.itertuples():
        ga, gb = a.loc[int(r.ia)], b.iloc[int(r.ib)]
        ca, cb = ga[class_field], gb[class_field]
        if ca != cb:
            out.append(Dispute(tile_id, "class", ca, cb, float(r.iou), 1.0))
            continue                       # a class dispute makes the geometry moot
        floor = floors.get(ca, 0.65)
        biou = boundary_iou(ga.geometry, gb.geometry)
        if biou < floor:
            out.append(Dispute(tile_id, "geometry", ca, cb, biou, floor))
    return out

def write_queue(path: str, disputes: list[Dispute]) -> None:
    with open(path, "w", encoding="utf-8") as fh:
        json.dump([asdict(d) for d in disputes], fh, indent=2, sort_keys=True)
        fh.write("\n")
```

The `continue` after a class dispute is deliberate. When two annotators disagree about what an object is, their boundaries disagree for a reason — one is tracing a roof and the other a parcel — and scoring that disagreement as a delineation failure files the dispute under the wrong heading.

## Spatial Parameters & Configuration Reference

| Parameter | Typical value | Units | What it controls |
|---|---|---|---|
| Overlap allocation | 5 – 10% of tiles | share of batch | How much duplicate labelling funds the agreement estimate |
| `MATCH_FLOOR` | 0.30 | IoU | Whether two features are the same object at all |
| Boundary band | 3 × GSD (0.3 – 1.0 m) | metres | The width inside which tracing differences are not real |
| Boundary IoU floor, crisp classes | 0.70 – 0.80 | boundary IoU | Adjudication trigger for buildings, roads, solar arrays |
| Boundary IoU floor, fuzzy classes | 0.45 – 0.60 | boundary IoU | Adjudication trigger for wetland, burn scar, canopy edge |
| Kappa floor per class | 0.60 | kappa | Below this the class pair is a taxonomy problem, not an annotator one |
| Hausdorff alarm | 3 × boundary band | metres | A single corner far out of place, which mean-based scores hide |

## Edge Cases & Spatial Gotchas

**One annotator splits what the other merges.** A row of terraced houses is one feature to A and six to B. Greedy one-to-one matching pairs A's single polygon with B's largest and reports five false positives, which reads as B inventing objects. Detect it by checking whether the unmatched features on one side fall inside a matched feature on the other, and treat the case as a taxonomy dispute — the guide has not said whether the unit is the building or the block.

**Agreement measured on the easy tiles.** If the overlap set is assigned by letting annotators pick a second tile, they pick tiles they found straightforward. The overlap must be sampled by the batch builder, ideally stratified by class so rare classes appear in it at all.

**Kappa on two classes with one absent.** When a tile's overlap set contains only buildings, kappa is undefined or degenerate even though both annotators did perfect work. Aggregate kappa at the batch level, not per tile, and report the pair count alongside it so a number computed on eleven features is visibly weaker evidence than one computed on nine hundred.

**Self-agreement drift.** The same annotator re-labelling the same tile a month later will not reproduce their own work exactly. Measuring that intra-annotator agreement once, on a handful of tiles, gives you the ceiling: no pair of different people will agree better than one person agrees with themselves, and setting thresholds above that ceiling guarantees permanent adjudication traffic.

**Boundary band smaller than the coordinate precision.** If labels were serialised with five decimal places in `EPSG:4326`, coordinates are quantised to roughly a metre, and a 0.3 m boundary band measures quantisation noise. Precision has to be fixed at export time — see [how to structure GeoJSON for ML training datasets](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/vector-vs-raster-annotation-workflows/how-to-structure-geojson-for-ml-training-datasets/) — before any of these thresholds mean what they say.

<svg viewBox="0 0 700 280" role="img" aria-label="Two polygon pairs with similar IoU but very different boundary IoU, showing which failure each metric sees" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:700px;display:block;margin:1.5rem auto;">
  <title>Where plain IoU and boundary IoU disagree</title>
  <desc>A large warehouse traced three metres wide of its true wall scores 0.94 plain IoU but 0.41 boundary IoU. A small shed traced within half a metre scores 0.88 plain IoU and 0.79 boundary IoU. Ranking by plain IoU puts the warehouse above the shed; ranking by boundary IoU sends the warehouse to adjudication, which is where the actual tracing problem is.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <!-- Warehouse -->
  <text x="170" y="34" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">900 m² warehouse, wall 3 m out</text>
  <rect x="60" y="56" width="220" height="120" fill="none" stroke="currentColor" stroke-width="2"/>
  <rect x="52" y="48" width="236" height="136" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="5 3"/>
  <text x="170" y="122" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">the gap is 3 m all the way round</text>
  <text x="170" y="208" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">IoU 0.94 · boundary IoU 0.41</text>
  <text x="170" y="232" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">plain IoU calls this excellent because</text>
  <text x="170" y="246" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">the shared area is enormous</text>
  <!-- Shed -->
  <text x="510" y="34" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">40 m² shed, wall 0.5 m out</text>
  <rect x="470" y="90" width="80" height="56" fill="none" stroke="currentColor" stroke-width="2"/>
  <rect x="466" y="86" width="88" height="64" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="5 3"/>
  <text x="510" y="176" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">a careful trace on a small object</text>
  <text x="510" y="208" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">IoU 0.88 · boundary IoU 0.79</text>
  <text x="510" y="232" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">plain IoU ranks it below the warehouse;</text>
  <text x="510" y="246" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">boundary IoU puts it where it belongs</text>
  <text x="350" y="272" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">same metric, two objects an order of magnitude apart in area — which is exactly the comparison a batch report has to make</text>
</svg>

## Integration & Automation Hooks

The measurement runs as a batch job, not in the annotator's loop. Two hooks matter.

**A nightly job over the overlap set.** It reads yesterday's completed overlap tiles, writes a per-class agreement table and a dispute queue, and posts the classes whose kappa fell below the floor. Because it consumes only completed work, it never blocks anybody.

```python
def summarise_batch(tiles: list[str], floors: dict[str, float]) -> pd.DataFrame:
    rows = []
    for tile_id in tiles:
        a, b = load_pair(Path(f"a/{tile_id}.geojson"), Path(f"b/{tile_id}.geojson"), "EPSG:25832")
        pairs, miss_a, miss_b = match_features(a, b)
        agree = label_agreement(a, b, pairs)
        rows.append({
            "tile_id": tile_id,
            "pairs": len(pairs),
            "unmatched_a": len(miss_a),
            "unmatched_b": len(miss_b),
            "kappa": agree["kappa"],
            "raw": agree["raw_agreement"],
            "disputes": len(build_queue(tile_id, a, b, pairs, floors)),
        })
    return pd.DataFrame(rows)
```

**A gate on the batch, not the feature.** Individual disagreements are normal and should never block a merge. A batch whose kappa for a class has fallen below its floor is a different matter, and belongs in the same [CI/CD gate](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/ci-cd-gates-for-annotation-datasets/) that already checks geometry and schema, as a warning that names the class pair rather than an error that blocks the author.

Agreement scores also make a good confidence signal. A feature drawn on a tile whose class agreement is poor deserves a lower weight in training than one from a class two people place identically — which is what [confidence scoring for geospatial labels](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/confidence-scoring-for-geospatial-labels/) consumes.

## Validation & Testing

The metrics need their own tests, because a quality measure that silently returns optimistic numbers is worse than none.

```python
from shapely.geometry import box

def test_identical_geometries_score_one() -> None:
    g = box(0, 0, 10, 10)
    assert boundary_iou(g, g) == 1.0

def test_disjoint_geometries_score_zero() -> None:
    assert boundary_iou(box(0, 0, 10, 10), box(100, 100, 110, 110)) == 0.0

def test_boundary_iou_punishes_what_plain_iou_forgives() -> None:
    true_ = box(0, 0, 30, 30)              # 900 m²
    loose = box(-3, -3, 33, 33)            # 3 m out on every wall
    inter = true_.intersection(loose).area
    plain = inter / (true_.area + loose.area - inter)
    assert plain > 0.75                     # plain IoU is forgiving here
    assert boundary_iou(true_, loose) < plain / 1.5

def test_kappa_collapses_on_a_dominant_class() -> None:
    # Both "annotators" call everything building; raw agreement is perfect, skill is nil.
    ya = ["building"] * 92 + ["road"] * 8
    yb = ["building"] * 100
    assert cohen_kappa_score(ya, yb, labels=["building", "road"]) <= 0.0
```

The last test is the one that earns its place. It feeds the machinery a case that looks perfect by raw agreement and asserts that kappa refuses it, which is the whole reason kappa is in the pipeline.

## Frequently Asked Questions

### Can I measure agreement without a deliberate overlap set?

Only weakly. Proxies exist — comparing each annotator against a model's predictions, or against the eventual adjudicated truth — but both measure agreement with something that is itself uncertain, and both are biased toward annotators whose style matches the model's. The overlap set costs five to ten percent of the labelling budget and is the only measurement that compares two humans on identical ground.

### Which threshold should trigger re-training an annotator versus fixing the guide?

Look at whether the disagreement is concentrated. If one annotator disagrees with everyone else on many classes, that is a training conversation. If everyone disagrees with everyone on one class pair, the guide has not distinguished those classes and no amount of annotator training will fix it. The per-class confusion matrix from Step 4 separates the two cases directly.

### How does Hausdorff distance fit alongside boundary IoU?

Boundary IoU is an average-like measure over the whole outline, so a single badly placed corner can hide inside a good score. Hausdorff distance reports the single worst gap between the two boundaries, in metres. Running both means a polygon that is right everywhere except one corner is still caught — see [debugging annotation drift across dataset versions](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/rollback-strategies-for-corrupted-spatial-datasets/debugging-annotation-drift-across-dataset-versions/) for the same metric used across versions rather than across annotators.

### Should the model's own predictions be in the agreement calculation?

Keep them separate. Model-versus-human agreement is a useful monitoring signal, but mixing it into inter-annotator agreement makes the number move when the model is retrained, which means it no longer measures the annotation team. Track them as two series over the same overlap set.

## Related

- [Confidence Scoring for Geospatial Labels](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/confidence-scoring-for-geospatial-labels/) — how the agreement scores computed here become a per-label confidence that drives QA routing and loss weighting
- [Defining ROI Label Taxonomies for Aerial Imagery](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/defining-roi-label-taxonomies-for-aerial-imagery/) — the taxonomy work that a persistently low per-class kappa is telling you to do
- [Human-in-the-Loop Validation Cycles](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/human-in-the-loop-validation-cycles/) — the review tiers that consume the dispute queue this topic produces
- [Best Practices for Polygon vs Bounding Box Annotation](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/defining-roi-label-taxonomies-for-aerial-imagery/best-practices-for-polygon-vs-bounding-box-annotation/) — why the geometry primitive you chose sets a ceiling on the agreement you can measure

Quality measurement is one component of the broader [Geospatial Annotation Fundamentals & Architecture](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/) pipeline, which covers the CRS contracts, taxonomies and formats these metrics assume.
