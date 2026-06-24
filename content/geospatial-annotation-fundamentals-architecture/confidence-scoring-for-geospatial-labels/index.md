---
title: "Confidence Scoring for Geospatial Labels"
description: "Build a production-ready confidence scoring pipeline for geospatial annotations. Covers inter-annotator IoU, geometry validity signals, calibrated probability aggregation, and dynamic QA routing thresholds for spatial ML workflows."
slug: "confidence-scoring-for-geospatial-labels"
type: "cluster"
breadcrumb:
  - label: "Home"
    url: "/"
  - label: "Geospatial Annotation Fundamentals & Architecture"
    url: "/geospatial-annotation-fundamentals-architecture/"
  - label: "Confidence Scoring for Geospatial Labels"
    url: "/geospatial-annotation-fundamentals-architecture/confidence-scoring-for-geospatial-labels/"
datePublished: "2025-01-15"
dateModified: "2026-06-24"
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
      "dateModified": "2026-06-24",
      "author": {"@type": "Organization", "name": "GeoSpatialAnnotation"},
      "publisher": {"@type": "Organization", "name": "GeoSpatialAnnotation", "url": "https://geospatialannotation.com"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://geospatialannotation.com/"},
        {"@type": "ListItem", "position": 2, "name": "Geospatial Annotation Fundamentals & Architecture", "item": "https://geospatialannotation.com/geospatial-annotation-fundamentals-architecture/"},
        {"@type": "ListItem", "position": 3, "name": "Confidence Scoring for Geospatial Labels", "item": "https://geospatialannotation.com/geospatial-annotation-fundamentals-architecture/confidence-scoring-for-geospatial-labels/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "How to Implement Confidence Scoring for Geospatial Labels",
      "description": "Step-by-step guide to computing, calibrating, and applying confidence metrics across geospatial annotation workflows.",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Ingest and normalize annotations", "text": "Load raw annotations into a GeoDataFrame, enforce a unified CRS, and validate geometry topology."},
        {"@type": "HowToStep", "position": 2, "name": "Compute base signals", "text": "Extract inter-annotator IoU, geometric consistency scores, and model-assisted probabilities."},
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
        }
      ]
    }
  ]
}
</script>

# Confidence Scoring for Geospatial Labels

Confidence scoring transforms raw annotation outputs into quantifiable training signals that directly control model convergence, active learning prioritization, and QA routing. In spatial machine learning pipelines, not all labeled polygons, bounding boxes, or raster masks carry equal reliability: annotator fatigue, ambiguous imagery boundaries, class overlap, and sensor artifacts introduce noise that — if left unweighted — degrades downstream model performance. A systematic confidence scoring framework lets spatial data scientists and ML engineers isolate high-fidelity training samples, trigger targeted human review, and maintain reproducible dataset versions tied to explicit quality gates.

This guide details a production-ready architecture for computing, calibrating, and applying confidence metrics across annotation workflows, from geometry ingestion through QA routing integration.

## Prerequisites & Toolchain Alignment

Confidence scoring sits downstream of geometry validation but upstream of dataset sharding and model training. Before implementing automated scoring, your annotation infrastructure must expose structured metadata alongside geometry — review the foundational ingestion and normalization patterns in [Geospatial Annotation Fundamentals & Architecture](/geospatial-annotation-fundamentals-architecture/) if your pipeline is not yet exporting per-label metadata.

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
- Understanding of [coordinate reference systems in annotation pipelines](/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/), particularly the distinction between geographic (`EPSG:4326`) and local projected CRS (e.g., a UTM zone), since IoU calculations on unprojected coordinates produce distorted area measurements.
- Familiarity with the geometric differences between [vector and raster annotation workflows](/geospatial-annotation-fundamentals-architecture/vector-vs-raster-annotation-workflows/), as pixel-level quantization in raster masks can artificially depress boundary agreement metrics when compared against vector polygons.
- Access to annotation logs or database exports containing per-label metadata: annotator IDs, timestamps, tool versions, and optional model-assisted prediction probabilities.

---

## Pipeline Architecture: Signal Extraction Through QA Routing

The diagram below shows how raw annotations flow from ingestion through scoring and into training or QA queues.

<svg viewBox="0 0 720 280" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Confidence scoring pipeline diagram" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>Confidence Scoring Pipeline</title>
  <desc>Five-stage pipeline: Ingest and Normalize, Extract Signals (IoU, Geometry, Model Prob), Calibrate and Aggregate, Score and Threshold, then route to Training Shard or QA Queue.</desc>
  <!-- Stage boxes -->
  <rect x="10" y="110" width="120" height="60" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="70" y="136" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">Ingest &amp;</text>
  <text x="70" y="151" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">Normalize</text>
  <text x="70" y="166" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.7">CRS + validity</text>
  <rect x="160" y="110" width="120" height="60" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="220" y="136" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">Extract</text>
  <text x="220" y="151" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">Signals</text>
  <text x="220" y="166" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.7">IoU · geom · prob</text>
  <rect x="310" y="110" width="120" height="60" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="370" y="136" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">Calibrate &amp;</text>
  <text x="370" y="151" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">Aggregate</text>
  <text x="370" y="166" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.7">geo. mean</text>
  <rect x="460" y="110" width="120" height="60" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="520" y="136" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">Score &amp;</text>
  <text x="520" y="151" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">Threshold</text>
  <text x="520" y="166" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.7">per-class gates</text>
  <!-- Arrows between stages -->
  <line x1="130" y1="140" x2="158" y2="140" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr)"/>
  <line x1="280" y1="140" x2="308" y2="140" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr)"/>
  <line x1="430" y1="140" x2="458" y2="140" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr)"/>
  <line x1="580" y1="140" x2="608" y2="140" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr)"/>
  <!-- Routing fork -->
  <line x1="608" y1="140" x2="650" y2="140" stroke="currentColor" stroke-width="1.5"/>
  <line x1="650" y1="140" x2="650" y2="80" stroke="currentColor" stroke-width="1.5"/>
  <line x1="650" y1="140" x2="650" y2="200" stroke="currentColor" stroke-width="1.5"/>
  <!-- Training shard -->
  <rect x="655" y="50" width="58" height="56" rx="5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 2"/>
  <text x="684" y="73" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif">Training</text>
  <text x="684" y="87" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif">Shard</text>
  <text x="684" y="100" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.7">≥ 0.85</text>
  <!-- QA queue -->
  <rect x="655" y="175" width="58" height="56" rx="5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 2"/>
  <text x="684" y="198" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif">QA</text>
  <text x="684" y="212" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif">Queue</text>
  <text x="684" y="225" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.7">&lt; 0.60</text>
  <!-- Arrow markers -->
  <defs>
    <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor"/>
    </marker>
  </defs>
</svg>

---

## Step 1 — Ingest and Normalize Annotations

Load raw annotations into a `GeoDataFrame`. Strip invalid geometries, enforce a unified CRS, and align attribute schemas. Missing metadata fields should be imputed with neutral baseline values (e.g., `confidence=0.5`) rather than dropped, preserving dataset completeness.

Geometry validation is non-negotiable at this stage. Self-intersecting polygons or unclosed rings will corrupt downstream spatial joins and [IoU threshold calculations](/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/calculating-iou-thresholds-for-geospatial-object-detection/). Use `shapely`'s validity checks to flag or repair topological errors before scoring begins. All geometries must be re-projected to a local metric CRS — never compute areas or overlaps in `EPSG:4326` (degrees).

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

## Step 2 — Extract Orthogonal Quality Signals

Confidence derived from a single metric captures only one failure mode. Production pipelines combine at least three orthogonal signals:

**Inter-annotator agreement (IoU):** Overlap consistency when multiple labelers annotate the same tile. Measured via pairwise Intersection-over-Union or Dice coefficient on reprojected geometries. Pairs are constructed using a spatial index to avoid O(n²) comparisons.

**Geometric consistency score:** Boundary regularity, topology validity, and alignment with expected object scales. Highly fragmented or deeply concave polygons often indicate tracing fatigue or ambiguous imagery. A useful proxy is the ratio of polygon area to its convex hull area — compact objects score high, erratic outlines score low.

**Model-assisted probability:** If using semi-automated labeling via a foundation model or pre-labeling classifier, extract raw softmax or sigmoid probabilities. These provide a strong prior but require calibration — a model predicting `0.92` on a new sensor modality may reflect an empirical accuracy of only `0.74`.

When evaluating raster masks alongside vector outputs, account for pixel-level quantization, which can artificially depress boundary agreement metrics. Consult the [vector vs. raster annotation workflows](/geospatial-annotation-fundamentals-architecture/vector-vs-raster-annotation-workflows/) trade-off analysis before mixing signal types.

```python
import numpy as np
from shapely.ops import unary_union

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

## Step 3 — Calibrate and Aggregate Composite Scores

Raw signals rarely share the same scale or distribution. Normalize each metric to `[0, 1]` using min-max scaling or rank-based transformation, then apply domain-informed weights.

Aggregation must use a **weighted geometric mean** rather than arithmetic mean. A single unreliable metric (e.g., IoU of `0.08`) should drag the composite score down more aggressively than a high score on another signal can lift it. This prevents noisy labels from slipping through when one signal is artificially inflated by the pre-labeling model.

```python
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

    # Ensure all signal columns exist
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

## Step 4 — QA Routing Thresholds by Confidence Tier

Once composite scores are computed, route labels into three tiers. Thresholds below are starting points and should be swept per-class (see the parameters table in the next section).

| Tier | Score Range | Action |
|------|------------|--------|
| High confidence | ≥ 0.85 | Ingest directly into training shards; standard loss weight |
| Medium confidence | 0.60 – 0.84 | Retain for training with down-weighting via focal loss; flag for periodic review |
| Low confidence | < 0.60 | Exclude from training until manually verified; route to QA queue with automated context |

Hard-coding a universal threshold across all classes biases your training distribution. [Defining ROI label taxonomies for aerial imagery](/geospatial-annotation-fundamentals-architecture/defining-roi-label-taxonomies-for-aerial-imagery/) typically reveals that certain classes — shadowed rooftops, transitional vegetation, partially occluded vehicles — inherently produce lower inter-annotator agreement. Maintain a per-class threshold YAML and reload it per pipeline run.

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

## Edge Cases and Spatial Gotchas

**CRS mismatch at signal extraction time:** Computing IoU in `EPSG:4326` distorts area calculations, especially above ±50° latitude. All geometries must share a local projected CRS before any overlap computation. Validate CRS consistency with a unit test that checks `gdf.crs.is_projected` before each scoring run.

**Raster mask vs. vector polygon boundary discrepancy:** Pixel quantization in raster masks introduces systematic boundary offsets proportional to GSD (ground sampling distance). A 30 cm GSD image annotated in raster format will show boundary disagreements of up to one pixel width (30 cm) even for perfect polygon traces. Do not penalize boundary agreement below the GSD floor.

**Over-reliance on model-assisted probability on OOD scenes:** A pre-labeling model calibrated on one sensor modality (e.g., Sentinel-2 multispectral) will be overconfident when applied to a new modality (e.g., SAR intensity). Reduce the `model_prob` weight or apply domain-specific recalibration before scoring new sensor data.

**Annotator behavior drift:** Confidence distributions shift as annotation teams scale, tools are updated, or labeling guidelines change. Schedule quarterly recalibration runs using recent QA-reviewed samples drawn from the [SHA-hashed annotation change log](/dataset-versioning-spatial-data-sync/tracking-annotation-changes-with-sha-hashing/) to maintain scoring fidelity over time.

**Self-intersecting polygons after tool export:** Some annotation tools export geometries that pass UI validation but contain topological errors (butterfly ties, dangling edges). `shapely.validation.make_valid()` corrects most cases, but verify the repaired geometry area has not changed by more than 1–2% compared to the original.

**Static thresholds across imbalanced class distributions:** Rare classes have fewer inter-annotator overlap pairs, so their IoU signal has higher variance. Apply class-stratified threshold sweeps that optimize for downstream mAP@0.5 or F1-score per class, not a shared global cutoff.

## Integration and Automation Hooks

Confidence scoring integrates naturally into [DVC pipelines for geospatial training data](/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/). Define each scoring stage as a DVC stage so that parameter changes (e.g., weight adjustments) automatically trigger pipeline reruns and produce a new dataset version with its own SHA digest — traceable via the [SHA-hashing annotation change tracking](/dataset-versioning-spatial-data-sync/tracking-annotation-changes-with-sha-hashing/) workflow.

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

## Validation and Testing

Before promoting a scored dataset to a training shard, run the following assertions to catch silent failures:

```python
import pytest
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

## Common Scoring Pitfalls

**Why does my composite score cluster near 0.5 for all labels?** This typically indicates missing metadata: if all three signal columns were imputed to the neutral baseline of `0.5`, the geometric mean will also be `0.5`. Verify that your annotation export includes `iou_score`, `geometry_score`, and `model_prob` before calling the scoring function. Log a warning when more than 20% of rows are imputed.

**Why do boundary-dominant classes (roads, coastlines) score low on geometry consistency?** Linear features have low compactness scores by definition — their area-to-convex-hull ratio approaches zero. For elongated classes, replace the compactness signal with a sinuosity or medial-axis deviation measure. Alternatively, exclude those classes from the `geometry_score` signal and increase the weight of `iou_score` and `model_prob`.

**How do I prevent calibration leakage?** Use spatial block cross-validation: divide the annotation extent into a regular grid of tiles (e.g., 5 × 5 km), assign each tile to a fold, and ensure no tile appears in both calibration and test folds. The `scikit-learn` `GroupKFold` estimator with a tile-ID group column handles this cleanly.

---

This workflow is one component of the broader [Geospatial Annotation Fundamentals & Architecture](/geospatial-annotation-fundamentals-architecture/) pipeline, covering everything from CRS contracts and label taxonomy design through geometry validation and export.

## Related

- [Coordinate Reference Systems in Annotation Pipelines](/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) — CRS selection, reprojection, and the PROJ/GDAL stack required before spatial scoring
- [Calculating IoU Thresholds for Geospatial Object Detection](/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/calculating-iou-thresholds-for-geospatial-object-detection/) — per-class IoU cutoffs by mission type and GSD range
- [Defining ROI Label Taxonomies for Aerial Imagery](/geospatial-annotation-fundamentals-architecture/defining-roi-label-taxonomies-for-aerial-imagery/) — class hierarchy design and the class-level threshold decisions that feed into confidence routing
- [Vector vs. Raster Annotation Workflows](/geospatial-annotation-fundamentals-architecture/vector-vs-raster-annotation-workflows/) — how annotation modality choice affects boundary agreement signals
- [Tracking Annotation Changes with SHA Hashing](/dataset-versioning-spatial-data-sync/tracking-annotation-changes-with-sha-hashing/) — version-controlled audit trail for scored datasets
