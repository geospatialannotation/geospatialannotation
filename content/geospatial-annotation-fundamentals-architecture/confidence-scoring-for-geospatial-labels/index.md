---
title: "Confidence Scoring for Geospatial Labels"
description: "Build a production-ready confidence scoring pipeline for geospatial annotations. Covers inter-annotator IoU, geometry validity signals, calibrated probability aggregation, and dynamic QA routing thresholds for spatial ML workflows."
slug: "confidence-scoring-for-geospatial-labels"
type: "guide"
breadcrumb:
  - label: "Home"
    url: "/"
  - label: "Geospatial Annotation Fundamentals & Architecture"
    url: "/geospatial-annotation-fundamentals-architecture/"
  - label: "Confidence Scoring for Geospatial Labels"
    url: "/geospatial-annotation-fundamentals-architecture/confidence-scoring-for-geospatial-labels/"
datePublished: "2025-01-15"
dateModified: "2026-06-25"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Confidence Scoring for Geospatial Labels",
      "description": "Build a production-ready confidence scoring pipeline for geospatial annotations. Covers inter-annotator IoU, geometry validity signals, calibrated probability aggregation, and dynamic QA routing thresholds for spatial ML workflows.",
      "datePublished": "2025-01-15",
      "dateModified": "2026-06-25",
      "author": {"@type": "Organization", "name": "GeoSpatialAnnotation"},
      "publisher": {"@type": "Organization", "name": "GeoSpatialAnnotation", "url": "https://www.geospatialannotation.com"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.geospatialannotation.com/"},
        {"@type": "ListItem", "position": 2, "name": "Geospatial Annotation Fundamentals & Architecture", "item": "https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/"},
        {"@type": "ListItem", "position": 3, "name": "Confidence Scoring for Geospatial Labels", "item": "https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/confidence-scoring-for-geospatial-labels/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "How to Implement Confidence Scoring for Geospatial Labels",
      "description": "Step-by-step guide to computing, calibrating, and applying confidence metrics across geospatial annotation workflows.",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Ingest and normalize annotations", "text": "Load raw annotations into a GeoDataFrame, enforce a unified CRS, and validate geometry topology."},
        {"@type": "HowToStep", "position": 2, "name": "Extract orthogonal quality signals", "text": "Extract inter-annotator IoU, geometric consistency scores, and model-assisted probabilities."},
        {"@type": "HowToStep", "position": 3, "name": "Calibrate and aggregate scores", "text": "Normalize signals to [0, 1] and apply weighted geometric mean aggregation."},
        {"@type": "HowToStep", "position": 4, "name": "Apply QA routing thresholds", "text": "Route labels into high, medium, and low confidence tiers with class-specific cutoffs."},
        {"@type": "HowToStep", "position": 5, "name": "Validate and test the pipeline", "text": "Assert geometry validity, CRS consistency, and score distribution across class strata."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Should I use arithmetic or geometric mean to aggregate confidence signals?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Use weighted geometric mean. Arithmetic mean allows a high score on one signal to mask a critically low score on another. Geometric mean amplifies the penalty for any single low-confidence signal, which prevents noisy labels from slipping through quality gates."
          }
        },
        {
          "@type": "Question",
          "name": "How do I handle class-level confidence thresholds for ambiguous aerial imagery classes?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Maintain a per-class threshold configuration (e.g., a JSON or YAML mapping of class_id to min_confidence). Visually ambiguous classes like transitional vegetation or shadowed rooftops inherently produce lower inter-annotator agreement; a universal threshold will systematically exclude too many valid labels from these classes."
          }
        },
        {
          "@type": "Question",
          "name": "Why does calibration require spatial cross-validation rather than random splits?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Geospatial data exhibits spatial autocorrelation — nearby tiles share visual characteristics. Random train/validation splits leak geographic context into the calibration set, inflating calibration metrics. Tile-based or block-based splits ensure calibration curves generalize to unseen regions."
          }
        },
        {
          "@type": "Question",
          "name": "Why do boundary-dominant classes score low on geometry consistency?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Linear features (roads, coastlines) have low compactness scores by definition — their area-to-convex-hull ratio approaches zero. For elongated classes, replace the compactness signal with a sinuosity or medial-axis deviation measure, or exclude those classes from geometry_score and increase the weight of iou_score and model_prob."
          }
        },
        {
          "@type": "Question",
          "name": "What causes composite scores to cluster near 0.5 for all labels?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "This indicates missing metadata. If all three signal columns were imputed to the neutral baseline of 0.5, the geometric mean will also be 0.5. Verify that your annotation export includes iou_score, geometry_score, and model_prob before calling the scoring function. Log a warning when more than 20% of rows are imputed."
          }
        }
      ]
    }
  ]
}
</script>

# Confidence Scoring for Geospatial Labels

When a pre-labeling model trained on Sentinel-2 imagery is applied to a new SAR dataset, its raw softmax outputs appear confident — but those probabilities are miscalibrated for the new sensor modality. If your pipeline treats every model output above `0.5` as a valid training label, the resulting dataset is silently contaminated: noisy polygons enter the training shard, loss curves stall, and the root cause is invisible until model accuracy collapses on held-out evaluation tiles weeks later.

Confidence scoring addresses this by transforming raw annotation outputs — annotator agreement, geometry quality, and model probabilities — into a composite quality signal that controls training inclusion, active learning prioritization, and QA routing. In production [geospatial annotation fundamentals & architecture](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/) pipelines, not all labeled polygons, bounding boxes, or raster masks carry equal reliability. A systematic confidence scoring framework isolates high-fidelity training samples, triggers targeted human review, and maintains reproducible dataset versions tied to explicit quality gates.

## Prerequisites & Toolchain Alignment

Confidence scoring sits downstream of geometry validation but upstream of dataset sharding and model training. Before implementing automated scoring, your annotation infrastructure must expose structured metadata alongside geometry.

**Required Python packages (pinned):**

```
geopandas==0.14.4
shapely==2.0.4
pyproj==3.6.1
pandas==2.2.2
numpy==1.26.4
scikit-learn==1.4.2
```

**System dependencies:** GDAL 3.8+, PROJ 9.3+

**Spatial knowledge prerequisites:**

- Understanding of [coordinate reference systems in annotation pipelines](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/), particularly the distinction between geographic (`EPSG:4326`) and local projected CRS (e.g., a UTM zone), since IoU calculations on unprojected coordinates produce distorted area measurements proportional to latitude.
- Familiarity with the geometric differences between [vector and raster annotation workflows](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/vector-vs-raster-annotation-workflows/), as pixel-level quantization in raster masks can artificially depress boundary agreement metrics when compared against vector polygons.
- Access to annotation logs or database exports containing per-label metadata: annotator IDs, timestamps, tool versions, and optional model-assisted prediction probabilities.

---

## Signal Extraction Through QA Routing: Pipeline Architecture

The diagram below shows how raw annotations flow from ingestion through scoring and into training or QA queues. The `<defs>` element defines the arrowhead marker used on all flow lines.

<svg viewBox="0 0 760 310" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Confidence scoring pipeline: five stages from ingest through routing" style="width:100%;max-width:760px;display:block;margin:1.5rem auto;">
  <title>Confidence Scoring Pipeline</title>
  <desc>Five-stage pipeline diagram. Stage 1: Ingest and Normalize (CRS and validity). Stage 2: Extract Signals (IoU, geometry, model probability). Stage 3: Calibrate and Aggregate (weighted geometric mean). Stage 4: Score and Threshold (per-class gates). Stage 5 forks into Training Shard for scores at or above 0.85, and QA Queue for scores below 0.60.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <defs>
    <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor"/>
    </marker>
  </defs>
  <!-- Stage 1 -->
  <rect x="10" y="120" width="118" height="60" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="69" y="145" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">Ingest &amp;</text>
  <text x="69" y="160" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">Normalize</text>
  <text x="69" y="174" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.7">CRS + validity</text>
  <!-- Stage 2 -->
  <rect x="148" y="120" width="118" height="60" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="207" y="145" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">Extract</text>
  <text x="207" y="160" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">Signals</text>
  <text x="207" y="174" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.7">IoU · geom · prob</text>
  <!-- Stage 3 -->
  <rect x="286" y="120" width="118" height="60" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="345" y="145" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">Calibrate &amp;</text>
  <text x="345" y="160" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">Aggregate</text>
  <text x="345" y="174" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.7">geo. mean</text>
  <!-- Stage 4 -->
  <rect x="424" y="120" width="118" height="60" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="483" y="145" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">Score &amp;</text>
  <text x="483" y="160" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">Threshold</text>
  <text x="483" y="174" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.7">per-class gates</text>
  <!-- Flow arrows between stages -->
  <line x1="128" y1="150" x2="146" y2="150" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr)"/>
  <line x1="266" y1="150" x2="284" y2="150" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr)"/>
  <line x1="404" y1="150" x2="422" y2="150" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr)"/>
  <line x1="542" y1="150" x2="600" y2="150" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr)"/>
  <!-- Routing fork vertical line -->
  <line x1="608" y1="150" x2="608" y2="80" stroke="currentColor" stroke-width="1.5"/>
  <line x1="608" y1="150" x2="608" y2="220" stroke="currentColor" stroke-width="1.5"/>
  <!-- Training shard -->
  <line x1="608" y1="80" x2="635" y2="80" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr)"/>
  <rect x="638" y="50" width="110" height="58" rx="5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 2"/>
  <text x="693" y="74" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif">Training Shard</text>
  <text x="693" y="88" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.7">score ≥ 0.85</text>
  <text x="693" y="102" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.7">standard loss weight</text>
  <!-- QA queue -->
  <line x1="608" y1="220" x2="635" y2="220" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr)"/>
  <rect x="638" y="192" width="110" height="58" rx="5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 2"/>
  <text x="693" y="216" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif">QA Queue</text>
  <text x="693" y="230" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.7">score &lt; 0.60</text>
  <text x="693" y="244" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.7">manual review</text>
  <!-- Middle tier label on fork point -->
  <text x="608" y="158" text-anchor="middle" font-size="8" fill="currentColor" font-family="sans-serif" opacity="0.6">0.60–0.84</text>
  <text x="608" y="168" text-anchor="middle" font-size="8" fill="currentColor" font-family="sans-serif" opacity="0.6">weighted</text>
</svg>

---

## Core Scoring Workflow

### Step 1 — Ingest and Normalize Annotations

Load raw annotations into a `GeoDataFrame`. Strip invalid geometries, enforce a unified CRS, and align attribute schemas. Missing metadata fields should be imputed with neutral baseline values (e.g., `confidence=0.5`) rather than dropped, preserving dataset completeness.

Geometry validation is non-negotiable at this stage. Self-intersecting polygons or unclosed rings will corrupt downstream spatial joins and [IoU threshold calculations](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/calculating-iou-thresholds-for-geospatial-object-detection/). Use `shapely`'s validity checks to flag or repair topological errors before scoring begins. All geometries must be re-projected to a local metric CRS — never compute areas or overlaps in `EPSG:4326` (degrees).

```python
import geopandas as gpd
from shapely.validation import make_valid

def ingest_annotations(
    path: str,
    target_crs: str = "EPSG:32632",  # UTM zone 32N — replace with your region
) -> gpd.GeoDataFrame:
    gdf = gpd.read_file(path)
    if gdf.crs is None:
        raise ValueError("Source file has no CRS defined. Set it before ingestion.")
    gdf = gdf.to_crs(target_crs)
    gdf["geometry"] = gdf["geometry"].apply(
        lambda g: make_valid(g) if g is not None and not g.is_valid else g
    )
    gdf = gdf[gdf.geometry.notna() & ~gdf.geometry.is_empty].copy()
    # Neutral baseline for missing metadata signals
    for col in ("iou_score", "geometry_score", "model_prob"):
        if col not in gdf.columns:
            gdf[col] = 0.5
    return gdf
```

### Step 2 — Extract Orthogonal Quality Signals

Confidence derived from a single metric captures only one failure mode. Production pipelines combine at least three orthogonal signals.

The diagram below illustrates how each signal type targets a distinct source of annotation noise: annotator disagreement, geometric irregularity, and model uncertainty. All three must be present and normalized before aggregation.

<svg viewBox="0 0 680 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Three orthogonal confidence signals feeding into composite score" style="width:100%;max-width:680px;display:block;margin:1.5rem auto;">
  <title>Three Orthogonal Confidence Signals</title>
  <desc>Three signal sources feed a composite score. Signal 1: Inter-annotator IoU — detects labeler disagreement on boundary placement. Signal 2: Geometric consistency — detects topology errors and scale anomalies. Signal 3: Model-assisted probability — detects out-of-distribution or low-certainty predictions. All three flow via weighted geometric mean into the composite confidence score.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <defs>
    <marker id="arr2" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor"/>
    </marker>
  </defs>
  <!-- Signal boxes -->
  <rect x="10" y="18" width="200" height="54" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="110" y="40" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">Inter-annotator IoU</text>
  <text x="110" y="56" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.75">pairwise overlap on reprojected geoms</text>
  <text x="110" y="68" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.75">weight: 0.40</text>
  <rect x="10" y="86" width="200" height="54" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="110" y="108" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">Geometric Consistency</text>
  <text x="110" y="124" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.75">area / convex-hull area (compactness)</text>
  <text x="110" y="136" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.75">weight: 0.30</text>
  <rect x="10" y="154" width="200" height="54" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="110" y="176" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">Model-Assisted Probability</text>
  <text x="110" y="192" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.75">calibrated softmax / sigmoid output</text>
  <text x="110" y="204" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.75">weight: 0.30</text>
  <!-- Arrows from signals to aggregator -->
  <line x1="210" y1="45" x2="340" y2="100" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr2)"/>
  <line x1="210" y1="113" x2="340" y2="110" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr2)"/>
  <line x1="210" y1="181" x2="340" y2="120" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr2)"/>
  <!-- Aggregation box -->
  <rect x="344" y="72" width="160" height="62" rx="6" fill="none" stroke="currentColor" stroke-width="2"/>
  <text x="424" y="97" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">Weighted</text>
  <text x="424" y="112" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">Geometric Mean</text>
  <text x="424" y="127" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.75">log-space dot product</text>
  <!-- Arrow to output -->
  <line x1="504" y1="103" x2="554" y2="103" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr2)"/>
  <!-- Output box -->
  <rect x="558" y="74" width="112" height="58" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 2"/>
  <text x="614" y="98" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">Composite</text>
  <text x="614" y="113" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">Score [0, 1]</text>
  <text x="614" y="127" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.75">→ QA routing</text>
</svg>

**Inter-annotator agreement (IoU):** Overlap consistency when multiple labelers annotate the same tile. Measured via pairwise Intersection-over-Union or Dice coefficient on reprojected geometries. Pairs are constructed using a spatial index to avoid O(n²) comparisons.

**Geometric consistency score:** Boundary regularity, topology validity, and alignment with expected object scales. Highly fragmented or deeply concave polygons often indicate tracing fatigue or ambiguous imagery. A useful proxy is the ratio of polygon area to its convex hull area — compact objects score high, erratic outlines score low.

**Model-assisted probability:** If using semi-automated labeling via a foundation model or pre-labeling classifier, extract raw softmax or sigmoid probabilities. These provide a strong prior but require calibration — a model predicting `0.92` on a new sensor modality may reflect an empirical accuracy of only `0.74`.

When evaluating raster masks alongside vector outputs, account for pixel-level quantization, which can artificially depress boundary agreement metrics. Consult the [vector vs. raster annotation workflows](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/vector-vs-raster-annotation-workflows/) trade-off analysis before mixing signal types.

```python
import numpy as np

def geometry_compactness(geom) -> float:
    """Ratio of polygon area to convex hull area. Returns 0.5 for None."""
    if geom is None or geom.is_empty:
        return 0.5
    hull_area = geom.convex_hull.area
    return float(geom.area / hull_area) if hull_area > 0 else 0.5

def pairwise_iou(geom_a, geom_b) -> float:
    intersection = geom_a.intersection(geom_b).area
    union = geom_a.union(geom_b).area
    return float(intersection / union) if union > 0 else 0.0
```

### Step 3 — Calibrate and Aggregate Composite Scores

Raw signals rarely share the same scale or distribution. Normalize each metric to `[0, 1]` using min-max scaling or rank-based transformation, then apply domain-informed weights.

Aggregation must use a **weighted geometric mean** rather than arithmetic mean. A single unreliable metric (e.g., IoU of `0.08`) should drag the composite score down more aggressively than a high score on another signal can lift it. This prevents noisy labels from slipping through when one signal is artificially inflated by the pre-labeling model.

```python
import geopandas as gpd
from sklearn.preprocessing import MinMaxScaler

def compute_confidence_scores(
    gdf: gpd.GeoDataFrame,
    signal_cols: list[str] = ["iou_score", "geometry_score", "model_prob"],
    weights: dict[str, float] = {"iou_score": 0.40, "geometry_score": 0.30, "model_prob": 0.30},
) -> gpd.GeoDataFrame:
    """
    Compute composite confidence scores via weighted geometric mean.
    Requires CRS to be set on gdf before calling.
    """
    if gdf.crs is None:
        raise ValueError("GeoDataFrame must have a defined CRS before scoring.")

    for col in signal_cols:
        if col not in gdf.columns:
            gdf[col] = 0.5

    # Normalize signals to [0, 1]
    scaler = MinMaxScaler()
    signal_matrix = gdf[signal_cols].fillna(0.5).values.astype(float)
    normalized = scaler.fit_transform(signal_matrix)

    # Build weight vector — normalized to sum to 1.0
    w = np.array([weights.get(col, 0.0) for col in signal_cols], dtype=float)
    w /= w.sum()

    # Weighted geometric mean via log-space dot product
    epsilon = 1e-6
    log_signals = np.log(normalized + epsilon)
    composite_log = log_signals @ w
    composite_score = np.exp(composite_log)

    gdf = gdf.copy()
    gdf["confidence_score"] = np.clip(composite_score, 0.0, 1.0)
    return gdf
```

The `epsilon` guard prevents `RuntimeWarning` when a normalized signal exactly reaches zero, which can occur when min-max scaling produces a degenerate lower bound.

### Step 4 — Apply QA Routing Thresholds by Confidence Tier

Once composite scores are computed, route labels into three tiers. Thresholds below are starting points and should be swept per-class (see the configuration table in the next section).

<svg viewBox="0 0 740 300" role="img" aria-label="A batch's composite scores as a distribution, cut by two thresholds into a training tier, a weighted tier and a review tier" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:740px;display:block;margin:1.5rem auto;">
  <title>Two cut points turn one score distribution into three queues</title>
  <desc>A histogram of composite confidence scores across a batch. Everything at or above 0.85 goes straight to the training shard at full loss weight. Scores between 0.60 and 0.84 are admitted with a reduced loss weight. Scores below 0.60 are held back for manual review. The two thresholds are the only knobs; moving them trades annotator hours against label noise.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <!-- Histogram bars -->
  <rect x="72" y="196" width="26" height="34" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <rect x="102" y="180" width="26" height="50" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <rect x="132" y="158" width="26" height="72" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <rect x="162" y="140" width="26" height="90" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <rect x="192" y="150" width="26" height="80" fill="currentColor" opacity="0.28"/>
  <rect x="222" y="132" width="26" height="98" fill="currentColor" opacity="0.28"/>
  <rect x="252" y="112" width="26" height="118" fill="currentColor" opacity="0.28"/>
  <rect x="282" y="98" width="26" height="132" fill="currentColor" opacity="0.28"/>
  <rect x="312" y="86" width="26" height="144" fill="currentColor" opacity="0.28"/>
  <rect x="342" y="74" width="26" height="156" fill="currentColor" opacity="0.55"/>
  <rect x="372" y="62" width="26" height="168" fill="currentColor" opacity="0.55"/>
  <rect x="402" y="70" width="26" height="160" fill="currentColor" opacity="0.55"/>
  <rect x="432" y="92" width="26" height="138" fill="currentColor" opacity="0.55"/>
  <!-- Axis -->
  <line x1="66" y1="230" x2="470" y2="230" stroke="currentColor" stroke-width="1.5" opacity="0.6"/>
  <text x="72" y="248" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.6">0.40</text>
  <text x="190" y="248" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.6">0.60</text>
  <text x="340" y="248" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.6">0.85</text>
  <text x="464" y="248" text-anchor="end" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.6">1.00</text>
  <text x="268" y="272" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.75">composite confidence score</text>
  <!-- Cut lines -->
  <line x1="190" y1="40" x2="190" y2="230" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 3"/>
  <line x1="340" y1="40" x2="340" y2="230" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 3"/>
  <!-- Tier callouts -->
  <text x="128" y="34" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">review</text>
  <text x="265" y="34" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">weighted</text>
  <text x="405" y="34" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">train</text>
  <!-- Destinations -->
  <rect x="510" y="52" width="212" height="56" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="616" y="74" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">training shard, full weight</text>
  <text x="616" y="92" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace" opacity="0.75">score ≥ 0.85</text>
  <rect x="510" y="120" width="212" height="56" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="616" y="142" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">admitted, loss weight scaled</text>
  <text x="616" y="160" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace" opacity="0.75">0.60 ≤ score &lt; 0.85</text>
  <rect x="510" y="188" width="212" height="56" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 3"/>
  <text x="616" y="210" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">held for manual review</text>
  <text x="616" y="228" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace" opacity="0.75">score &lt; 0.60</text>
</svg>

| Tier | Score Range | Action |
|------|------------|--------|
| High confidence | ≥ 0.85 | Ingest directly into training shards; standard loss weight |
| Medium confidence | 0.60 – 0.84 | Retain for training with down-weighting via focal loss; flag for periodic review |
| Low confidence | < 0.60 | Exclude from training until manually verified; route to QA queue with automated context |

Hard-coding a universal threshold across all classes biases your training distribution. [Defining ROI label taxonomies for aerial imagery](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/defining-roi-label-taxonomies-for-aerial-imagery/) typically reveals that certain classes — shadowed rooftops, transitional vegetation, partially occluded vehicles — inherently produce lower inter-annotator agreement. Maintain a per-class threshold YAML and reload it per pipeline run.

```python
def route_by_confidence(
    gdf: gpd.GeoDataFrame,
    class_thresholds: dict[str, dict[str, float]] | None = None,
    default_high: float = 0.85,
    default_low: float = 0.60,
) -> gpd.GeoDataFrame:
    """
    Assign routing tier per label. class_thresholds maps class_label ->
    {"high": float, "low": float}. Falls back to default_high / default_low.
    """
    tiers = []
    for _, row in gdf.iterrows():
        thresholds = (class_thresholds or {}).get(row.get("class_label", ""), {})
        high = thresholds.get("high", default_high)
        low = thresholds.get("low", default_low)
        score = row["confidence_score"]
        if score >= high:
            tiers.append("training")
        elif score >= low:
            tiers.append("training_weighted")
        else:
            tiers.append("qa_queue")
    gdf = gdf.copy()
    gdf["routing_tier"] = tiers
    return gdf
```

## Spatial Parameters & Configuration Reference

| Parameter | Type | Recommended Range | Spatial Implication |
|-----------|------|-------------------|---------------------|
| `target_crs` | EPSG code string | UTM zone matching scene (e.g., `EPSG:32632`) | Must be metric; IoU on `EPSG:4326` introduces area distortion proportional to latitude |
| `iou_score` weight | float | 0.35 – 0.50 | Higher weight for safety-critical annotation domains |
| `geometry_score` weight | float | 0.20 – 0.35 | Increase for high-density urban mapping where polygon precision is critical |
| `model_prob` weight | float | 0.20 – 0.35 | Reduce if pre-labeling model was trained on a different sensor modality |
| High-confidence threshold | float | 0.80 – 0.90 | Lower for rare classes with inherently limited inter-annotator agreement |
| Low-confidence threshold | float | 0.50 – 0.65 | Adjust based on QA team capacity and acceptable label noise floor |
| Calibration split | spatial blocks | 5 × 5 km tiles | Never use random splits — spatial autocorrelation leaks context |
| `epsilon` in geometric mean | float | 1e-6 – 1e-8 | Guards against log(0); value has negligible practical effect above 1e-8 |

## Edge Cases & Spatial Gotchas

**CRS mismatch at signal extraction time:** Computing IoU in `EPSG:4326` distorts area calculations, especially above ±50° latitude. All geometries must share a local projected CRS before any overlap computation. Validate CRS consistency with a unit test that checks `gdf.crs.is_projected` before each scoring run.

**Raster mask vs. vector polygon boundary discrepancy:** Pixel quantization in raster masks introduces systematic boundary offsets proportional to GSD (ground sampling distance). A 30 cm GSD image annotated in raster format will show boundary disagreements of up to one pixel width (30 cm) even for perfect polygon traces. Do not penalize boundary agreement below the GSD floor.

**Over-reliance on model-assisted probability on OOD scenes:** A pre-labeling model calibrated on one sensor modality (e.g., Sentinel-2 multispectral) will be overconfident when applied to a new modality (e.g., SAR intensity). Reduce the `model_prob` weight or apply domain-specific recalibration before scoring new sensor data.

**Annotator behavior drift:** Confidence distributions shift as annotation teams scale, tools are updated, or labeling guidelines change. Schedule quarterly recalibration runs using recent QA-reviewed samples drawn from the [SHA-hashed annotation change log](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/tracking-annotation-changes-with-sha-hashing/) to maintain scoring fidelity over time.

**Self-intersecting polygons after tool export:** Some annotation tools export geometries that pass UI validation but contain topological errors (butterfly ties, dangling edges). `shapely.validation.make_valid()` corrects most cases, but verify the repaired geometry area has not changed by more than 1–2% compared to the original.

**Static thresholds across imbalanced class distributions:** Rare classes have fewer inter-annotator overlap pairs, so their IoU signal has higher variance. Apply class-stratified threshold sweeps that optimize for downstream mAP@0.5 or F1-score per class, not a shared global cutoff.

## Frequently Asked Questions

**Why does my composite score cluster near 0.5 for all labels?**

This typically indicates missing metadata: if all three signal columns were imputed to the neutral baseline of `0.5`, the geometric mean will also be `0.5`. Verify that your annotation export includes `iou_score`, `geometry_score`, and `model_prob` before calling the scoring function. Log a warning when more than 20% of rows are imputed.

**Why do boundary-dominant classes (roads, coastlines) score low on geometry consistency?**

Linear features have low compactness scores by definition — their area-to-convex-hull ratio approaches zero. For elongated classes, replace the compactness signal with a sinuosity or medial-axis deviation measure. Alternatively, exclude those classes from the `geometry_score` signal and increase the weight of `iou_score` and `model_prob`.

**Should I use arithmetic or geometric mean to aggregate signals?**

Always use weighted geometric mean. Arithmetic mean allows a high score on one signal to mask a critically low score on another. Geometric mean amplifies the penalty for any single low-confidence signal, which prevents noisy labels from slipping through quality gates.

**How do I prevent calibration leakage?**

Use spatial block cross-validation: divide the annotation extent into a regular grid of tiles (e.g., 5 × 5 km), assign each tile to a fold, and ensure no tile appears in both calibration and test folds. The `scikit-learn` `GroupKFold` estimator with a tile-ID group column handles this cleanly. Random train/validation splits leak geographic context due to spatial autocorrelation.

**How do I handle per-class thresholds for ambiguous aerial imagery?**

Maintain a per-class threshold configuration (e.g., a JSON or YAML mapping of `class_id` to `min_confidence`). Visually ambiguous classes like transitional vegetation or shadowed rooftops inherently produce lower inter-annotator agreement; a universal threshold will systematically exclude too many valid labels from these classes.

## Integration & Automation Hooks

Confidence scoring integrates naturally into [DVC pipelines for geospatial training data](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/). Define each scoring stage as a DVC stage so that parameter changes (e.g., weight adjustments) automatically trigger pipeline reruns and produce a new dataset version with its own SHA digest — traceable via the [SHA-hashing annotation change tracking](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/tracking-annotation-changes-with-sha-hashing/) workflow.

```yaml
# dvc.yaml — confidence scoring stage
stages:
  score_annotations:
    cmd: python score_pipeline.py --config params.yaml
    deps:
      - annotations/raw/
      - score_pipeline.py
    params:
      - params.yaml:
          - scoring.weights
          - scoring.thresholds
    outs:
      - annotations/scored/gdf_scored.parquet
    metrics:
      - metrics/scoring_summary.json:
          cache: false
```

For Label Studio exports, parse the JSON export to extract annotator IDs and per-task annotation counts before calling `compute_confidence_scores`. Each Label Studio task maps to one tile; multiple completions on the same task provide the inter-annotator pairs needed for IoU signal extraction.

To wire into a CI gate, add a GitHub Actions step after each annotation batch export:

```yaml
# .github/workflows/annotation_qa.yml (excerpt)
- name: Score and validate annotations
  run: |
    python score_pipeline.py --config params.yaml
    python validate_scores.py --min-high-tier-pct 0.60
```

The `validate_scores.py` check fails the CI run if fewer than 60% of labels reach the high-confidence tier, surfacing annotation quality regressions before they reach training.

## Validation & Testing

Before promoting a scored dataset to a training shard, run the following assertions to catch silent failures:

```python
import geopandas as gpd
import numpy as np

def validate_scored_gdf(gdf: gpd.GeoDataFrame) -> None:
    # CRS must be projected (metric) before scoring
    assert gdf.crs is not None and gdf.crs.is_projected, (
        f"Expected projected CRS, got: {gdf.crs}"
    )
    # All geometries must be valid after make_valid pass
    invalid = gdf[~gdf.geometry.is_valid]
    assert len(invalid) == 0, (
        f"{len(invalid)} invalid geometries remain after validation pass"
    )
    # confidence_score must be in [0, 1]
    assert gdf["confidence_score"].between(0.0, 1.0).all(), (
        "confidence_score values outside [0, 1] detected"
    )
    # At least one label should reach training tier (sanity check)
    assert (gdf["routing_tier"] == "training").any(), (
        "No labels reached the high-confidence training tier — review thresholds"
    )
    # Score distribution should not be degenerate (all 0.5 signals indicate missing metadata)
    score_std = gdf["confidence_score"].std()
    assert score_std > 0.01, (
        f"Score distribution has near-zero variance ({score_std:.4f}) — check signal extraction"
    )

# Run as a pytest test or as a post-scoring assertion in the pipeline:
# validate_scored_gdf(scored_gdf)
```

**Calibration verification:** After applying Platt scaling or isotonic regression, check that the calibration curve (reliability diagram) shows points close to the diagonal across all confidence bins. A systematic deviation in the 0.6–0.8 range is common for models applied to new sensor modalities and indicates the `model_prob` weight should be reduced.

---

This workflow is one component of the broader [Geospatial Annotation Fundamentals & Architecture](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/) pipeline, covering everything from CRS contracts and label taxonomy design through geometry validation and export.

## Related

- [Coordinate Reference Systems in Annotation Pipelines](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) — CRS selection, reprojection, and the PROJ/GDAL stack required before spatial scoring
- [Calculating IoU Thresholds for Geospatial Object Detection](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/calculating-iou-thresholds-for-geospatial-object-detection/) — per-class IoU cutoffs by mission type and GSD range
- [Defining ROI Label Taxonomies for Aerial Imagery](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/defining-roi-label-taxonomies-for-aerial-imagery/) — class hierarchy design and the class-level threshold decisions that feed into confidence routing
- [Vector vs. Raster Annotation Workflows](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/vector-vs-raster-annotation-workflows/) — how annotation modality choice affects boundary agreement signals
- [Tracking Annotation Changes with SHA Hashing](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/tracking-annotation-changes-with-sha-hashing/) — version-controlled audit trail for scored datasets
