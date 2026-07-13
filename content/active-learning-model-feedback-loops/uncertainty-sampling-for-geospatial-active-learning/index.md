---
title: "Uncertainty Sampling for Geospatial Active Learning"
description: "How to rank unlabeled satellite and drone tiles by model uncertainty — entropy, margin, and BALD scoring — so annotators label the tiles that most improve a geospatial detector or segmenter."
slug: "uncertainty-sampling-for-geospatial-active-learning"
type: "cluster"
breadcrumb: "Active Learning & Model Feedback Loops > Uncertainty Sampling for Geospatial Active Learning"
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
      "headline": "Uncertainty Sampling for Geospatial Active Learning",
      "description": "How to rank unlabeled satellite and drone tiles by model uncertainty — entropy, margin, and BALD scoring — so annotators label the tiles that most improve a geospatial detector or segmenter.",
      "datePublished": "2026-07-13",
      "dateModified": "2026-07-13",
      "author": {"@type": "Organization", "name": "Geospatial Annotation"},
      "publisher": {"@type": "Organization", "name": "Geospatial Annotation"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://geospatialannotation.com/"},
        {"@type": "ListItem", "position": 2, "name": "Active Learning & Model Feedback Loops for Geospatial Annotation", "item": "https://geospatialannotation.com/active-learning-model-feedback-loops/"},
        {"@type": "ListItem", "position": 3, "name": "Uncertainty Sampling for Geospatial Active Learning", "item": "https://geospatialannotation.com/active-learning-model-feedback-loops/uncertainty-sampling-for-geospatial-active-learning/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Rank Unlabeled Geospatial Tiles by Model Uncertainty",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Score per-tile uncertainty", "text": "Run the current model over unlabeled tiles and compute least-confidence, margin, and entropy scores from the softmax output."},
        {"@type": "HowToStep", "position": 2, "name": "Aggregate pixel scores to tile scores", "text": "For segmentation, reduce a per-pixel uncertainty map to a single tile score using a high-percentile or masked-mean aggregator."},
        {"@type": "HowToStep", "position": 3, "name": "Add feature-space diversity", "text": "Cluster tile embeddings and cap selections per cluster so neighbouring, redundant scenes are not all queued at once."},
        {"@type": "HowToStep", "position": 4, "name": "Produce a ranked annotation queue", "text": "Combine uncertainty and diversity into a final score, sort descending, and emit a batch-sized queue with tile identifiers and geotransform metadata."},
        {"@type": "HowToStep", "position": 5, "name": "Hand the queue to the labeling tool", "text": "Import the ranked queue into the annotation platform so labelers see the highest-value tiles first, then feed reviewed labels back into retraining."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Does uncertainty sampling need calibrated probabilities?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "It benefits from them. A miscalibrated network is systematically over-confident, so raw softmax entropy underestimates true uncertainty and the queue skews toward a few loud classes. Because ranking only needs the relative order to be correct, temperature scaling — a single learned scalar applied to the logits — is usually enough to restore a trustworthy order without retraining."
          }
        },
        {
          "@type": "Question",
          "name": "Why does the queue keep selecting adjacent tiles of the same scene?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Spatial autocorrelation. Neighbouring tiles share illumination, sensor geometry, and land cover, so a hard region produces a whole block of near-identical high-uncertainty tiles. Pure uncertainty ranking then spends an entire batch on one field. Add a feature-space diversity term or cap selections per spatial cluster so the batch covers distinct conditions."
          }
        },
        {
          "@type": "Question",
          "name": "How do I bootstrap active learning when there is no model yet?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Use a cold-start round driven by diversity, not uncertainty. With no trained model, uncertainty scores are noise, so seed the first batch by clustering tile embeddings from a pretrained backbone and sampling the medoids to span the geographic and spectral range. Switch to uncertainty sampling once the model reaches non-trivial validation accuracy."
          }
        },
        {
          "@type": "Question",
          "name": "Should I use entropy or margin sampling for a binary detector?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "For two classes the three common scores are monotonic transforms of each other and rank tiles identically, so margin is the cheapest choice. Entropy earns its keep only for multi-class segmentation, where it responds to diffuse uncertainty spread across many classes that margin, which looks only at the top two, would miss."
          }
        }
      ]
    }
  ]
}
</script>

# Uncertainty Sampling for Geospatial Active Learning

A building-footprint detector trained on 4,000 hand-labeled drone tiles plateaus at 0.71 mAP and refuses to improve. The team keeps labeling — another thousand tiles, then another — drawn at random from the unlabeled pool. Validation barely moves. The reason is structural: a random draw over a large aerial survey is dominated by easy, redundant scenes. Empty pasture, bare parking lots, and repeated views of the same suburban grid make up most of the pool, so most of each new batch teaches the model things it already knows. The rare tiles the detector actually struggles with — dense informal settlements, buildings under tree canopy, half-constructed roofs — arrive one every few hundred labels, far too slowly to shift the metric.

Uncertainty sampling replaces the random draw with a targeted one. Instead of asking "what should we label next?" and answering by coin flip, it runs the current model over the unlabeled pool, measures how confused the model is on each tile, and sends annotators to the tiles where confusion is highest. Those are precisely the tiles near the decision boundary — the ones whose labels carry the most information. This guide is one topic within [active learning and model feedback loops](/active-learning-model-feedback-loops/) for geospatial annotation, and it covers the scoring end of that loop: how to compute per-tile uncertainty for detectors and segmenters, how to stop the queue from collapsing onto one neighbourhood, and how to hand a ranked batch to your labeling tool.

---

<svg viewBox="0 0 840 340" role="img" aria-label="Comparison of least-confidence, margin, and entropy uncertainty scoring computed on the same class-probability vector" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:840px;display:block;margin:1.5rem auto;">
  <title>Three Uncertainty Scores on One Probability Vector</title>
  <desc>Three panels each show the same softmax output of 0.50, 0.30 and 0.20 over classes A, B and C. The least-confidence panel reports 0.50, the margin panel reports 0.80, and the normalized-entropy panel reports 0.94, illustrating how each score reacts differently to the same distribution.</desc>
  <!-- Panel 1: Least confidence -->
  <rect x="15" y="20" width="250" height="300" rx="10" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.45"/>
  <text x="140" y="45" text-anchor="middle" font-size="13" font-weight="700" fill="currentColor" font-family="sans-serif">Least confidence</text>
  <text x="140" y="66" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace" opacity="0.8">1 - max(p)</text>
  <line x1="45" y1="250" x2="235" y2="250" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <rect x="55" y="170" width="34" height="80" fill="currentColor" opacity="0.55"/>
  <rect x="110" y="202" width="34" height="48" fill="currentColor" opacity="0.35"/>
  <rect x="165" y="218" width="34" height="32" fill="currentColor" opacity="0.25"/>
  <text x="72" y="164" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace" opacity="0.8">.50</text>
  <text x="127" y="196" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace" opacity="0.8">.30</text>
  <text x="182" y="212" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace" opacity="0.8">.20</text>
  <text x="72" y="266" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">A</text>
  <text x="127" y="266" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">B</text>
  <text x="182" y="266" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">C</text>
  <text x="140" y="302" text-anchor="middle" font-size="13" font-weight="700" fill="currentColor" font-family="sans-serif">score = 0.50</text>
  <!-- Panel 2: Margin -->
  <rect x="295" y="20" width="250" height="300" rx="10" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.45"/>
  <text x="420" y="45" text-anchor="middle" font-size="13" font-weight="700" fill="currentColor" font-family="sans-serif">Margin</text>
  <text x="420" y="66" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace" opacity="0.8">1 - (p1 - p2)</text>
  <line x1="325" y1="250" x2="515" y2="250" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <rect x="335" y="170" width="34" height="80" fill="currentColor" opacity="0.55"/>
  <rect x="390" y="202" width="34" height="48" fill="currentColor" opacity="0.35"/>
  <rect x="445" y="218" width="34" height="32" fill="currentColor" opacity="0.25"/>
  <text x="352" y="164" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace" opacity="0.8">.50</text>
  <text x="407" y="196" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace" opacity="0.8">.30</text>
  <text x="462" y="212" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace" opacity="0.8">.20</text>
  <text x="352" y="266" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">A</text>
  <text x="407" y="266" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">B</text>
  <text x="462" y="266" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">C</text>
  <text x="420" y="302" text-anchor="middle" font-size="13" font-weight="700" fill="currentColor" font-family="sans-serif">score = 0.80</text>
  <!-- Panel 3: Entropy -->
  <rect x="575" y="20" width="250" height="300" rx="10" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.45"/>
  <text x="700" y="45" text-anchor="middle" font-size="13" font-weight="700" fill="currentColor" font-family="sans-serif">Normalized entropy</text>
  <text x="700" y="66" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace" opacity="0.8">-Σ p·log p / log k</text>
  <line x1="605" y1="250" x2="795" y2="250" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <rect x="615" y="170" width="34" height="80" fill="currentColor" opacity="0.55"/>
  <rect x="670" y="202" width="34" height="48" fill="currentColor" opacity="0.35"/>
  <rect x="725" y="218" width="34" height="32" fill="currentColor" opacity="0.25"/>
  <text x="632" y="164" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace" opacity="0.8">.50</text>
  <text x="687" y="196" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace" opacity="0.8">.30</text>
  <text x="742" y="212" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace" opacity="0.8">.20</text>
  <text x="632" y="266" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">A</text>
  <text x="687" y="266" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">B</text>
  <text x="742" y="266" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">C</text>
  <text x="700" y="302" text-anchor="middle" font-size="13" font-weight="700" fill="currentColor" font-family="sans-serif">score = 0.94</text>
</svg>

---

## Prerequisites & Toolchain

Uncertainty sampling sits between an already-trained model and an annotation tool, so the toolchain is deliberately small: an inference stack to produce probabilities, a raster reader to stream tiles, and a vector library to attach spatial identity to each score. Pin the versions below so the scoring numbers are reproducible across a team and across retraining rounds.

```bash
pip install \
  numpy==1.26.4 \
  torch==2.3.1 \
  scikit-learn==1.5.1 \
  rasterio==1.3.10 \
  geopandas==0.14.4 \
  pyproj==3.6.1
```

You need a model that emits per-class probabilities — a classifier head, a detector's class logits, or a segmentation decoder — plus a tiling scheme that maps each model output back to a georeferenced footprint. Every tile carries a stable `tile_id`, an affine geotransform, and an [`EPSG:4326`](/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) or projected coordinate reference system so the queue can be reprojected into whatever the labeling tool expects. If your tiles do not yet carry consistent projection metadata, resolve that first; a queue that points annotators at the wrong footprint wastes the very effort this workflow is meant to save.

Two assumptions matter for the code that follows. First, probabilities are the softmax output of the model, shape `(num_classes,)` for a classifier or `(num_classes, H, W)` for a segmenter. Second, the unlabeled pool is enumerable — you can list tile identifiers and load each on demand. Both hold for the standard tile-store layout used across geospatial pipelines.

---

## Core Uncertainty Sampling Workflow

The workflow is four stages: score each tile, reduce dense per-pixel scores to one number per tile, break spatial redundancy with a diversity term, and emit a ranked queue. Each stage is independently testable, which matters because uncertainty bugs are silent — a wrong score still produces a plausible-looking queue.

### Step 1 — Compute per-tile uncertainty

Three scores dominate practical work: least-confidence, margin, and entropy. Least-confidence looks only at the top class and asks how far its probability sits below certainty. Margin looks at the gap between the top two classes — a narrow gap means the model is torn between two options. Entropy considers the whole distribution and peaks when probability is spread evenly across many classes.

```python
from __future__ import annotations

import numpy as np


def least_confidence(probs: np.ndarray) -> np.ndarray:
    """1 - p_max. probs shape (..., num_classes); returns (...,)."""
    return 1.0 - probs.max(axis=-1)


def margin_score(probs: np.ndarray) -> np.ndarray:
    """1 - (p_top1 - p_top2). Higher means the top two classes are closer."""
    part = np.partition(probs, -2, axis=-1)
    top1 = part[..., -1]
    top2 = part[..., -2]
    return 1.0 - (top1 - top2)


def normalized_entropy(probs: np.ndarray, eps: float = 1e-12) -> np.ndarray:
    """Shannon entropy divided by log(k), so the score lands in [0, 1]."""
    k = probs.shape[-1]
    clipped = np.clip(probs, eps, 1.0)
    ent = -np.sum(clipped * np.log(clipped), axis=-1)
    return ent / np.log(k)
```

For a classifier or detector, `probs` is one vector per tile and any of the three returns a scalar. The choice between them is not cosmetic: on the vector `[0.5, 0.3, 0.2]` from the diagram above, least-confidence returns 0.50, margin returns 0.80, and normalized entropy returns 0.94, because each score weighs the tail of the distribution differently. The detailed trade-off — when margin's focus on the top two classes helps and when entropy's whole-distribution view is worth its cost — is worked through in [entropy vs margin sampling for segmentation masks](/active-learning-model-feedback-loops/uncertainty-sampling-for-geospatial-active-learning/entropy-vs-margin-sampling-for-segmentation-masks/).

### Step 2 — Aggregate pixel scores to a tile score

A segmenter emits a probability tensor of shape `(num_classes, H, W)`, so every one of tens of thousands of pixels gets its own uncertainty value. Active learning queues tiles, not pixels, so those maps must reduce to a single number. A plain mean is the wrong reducer: a tile that is 98% confident background with a small, deeply confusing structure in one corner averages out to "confident" and never gets queued — even though that corner is exactly what you want labeled.

Use a high-percentile or masked-mean aggregator that preserves local difficulty.

```python
from __future__ import annotations

import numpy as np


def pixel_uncertainty_map(seg_probs: np.ndarray) -> np.ndarray:
    """seg_probs shape (num_classes, H, W) -> per-pixel entropy (H, W)."""
    moved = np.moveaxis(seg_probs, 0, -1)  # (H, W, num_classes)
    return normalized_entropy(moved)


def aggregate_tile_score(
    unc_map: np.ndarray,
    percentile: float = 95.0,
    min_active_fraction: float = 0.01,
) -> float:
    """Reduce a per-pixel uncertainty map to one tile score.

    Uses a high percentile so a small, hard region still lifts the score,
    but ignores tiles where too few pixels are uncertain (pure noise).
    """
    flat = unc_map.reshape(-1)
    hot = flat[flat > np.median(flat)]
    if hot.size < min_active_fraction * flat.size:
        return float(np.percentile(flat, percentile))
    return float(np.percentile(hot, percentile))
```

The 95th-percentile reducer answers a sharper question than the mean: "how confused is the model on the hardest sliver of this tile?" That question surfaces boundary tiles — coastlines, field edges, the fringe of a built-up area — where segmenters genuinely struggle and where a few corrective labels pay off across the whole class.

### Step 3 — Add diversity via feature-space clustering

Uncertainty alone has a failure mode that is specific to spatial data. Because neighbouring tiles share sensor geometry, sun angle, and land cover, a single hard region — say one confusing informal settlement — produces a contiguous block of near-identical high-uncertainty tiles. Rank by uncertainty alone and the top of the queue is fifty views of the same street, each nearly a duplicate of the last. The annotator burns a batch and the model learns almost nothing new.

The fix is to select for uncertainty and diversity together. Embed each tile with the model's own backbone features, cluster the candidate pool, and cap how many tiles any one cluster can contribute to a batch.

```python
from __future__ import annotations

import numpy as np
from sklearn.cluster import KMeans


def diverse_selection(
    tile_ids: list[str],
    scores: np.ndarray,
    embeddings: np.ndarray,
    batch_size: int,
    n_clusters: int = 16,
    per_cluster_cap: int = 3,
) -> list[str]:
    """Pick a high-uncertainty batch that spans feature-space clusters."""
    km = KMeans(n_clusters=n_clusters, n_init=10, random_state=0)
    labels = km.fit_predict(embeddings)

    order = np.argsort(scores)[::-1]  # most uncertain first
    taken: list[str] = []
    per_cluster: dict[int, int] = {}
    for idx in order:
        cluster = int(labels[idx])
        if per_cluster.get(cluster, 0) >= per_cluster_cap:
            continue
        taken.append(tile_ids[idx])
        per_cluster[cluster] = per_cluster.get(cluster, 0) + 1
        if len(taken) >= batch_size:
            break
    return taken
```

Capping per cluster forces the batch to spread across distinct visual conditions while still preferring the most uncertain tile available within each. A committee-based alternative, which ranks by how strongly independent models disagree rather than by any single model's confidence, is developed in [prioritizing annotation tiles by model disagreement](/active-learning-model-feedback-loops/uncertainty-sampling-for-geospatial-active-learning/prioritizing-tiles-by-model-disagreement/).

### Step 4 — Produce a ranked annotation queue

The final stage joins scores back to spatial identity and writes a batch-sized, ordered queue. Keep the geotransform and CRS on every row so the downstream tool can render the exact footprint an annotator must inspect.

```python
from __future__ import annotations

import geopandas as gpd
from shapely.geometry import box


def build_queue(
    selected_ids: list[str],
    scores_by_id: dict[str, float],
    bounds_by_id: dict[str, tuple[float, float, float, float]],
    crs: str = "EPSG:4326",
) -> gpd.GeoDataFrame:
    """Emit an ordered GeoDataFrame ready for the labeling platform."""
    rows = []
    for tid in selected_ids:
        minx, miny, maxx, maxy = bounds_by_id[tid]
        rows.append(
            {
                "tile_id": tid,
                "uncertainty": scores_by_id[tid],
                "geometry": box(minx, miny, maxx, maxy),
            }
        )
    gdf = gpd.GeoDataFrame(rows, crs=crs)
    return gdf.sort_values("uncertainty", ascending=False).reset_index(drop=True)
```

The resulting `GeoDataFrame` is the annotation queue: one row per tile, ordered so the highest-value work is at the top, carrying enough spatial metadata to drive any geospatial labeling front end.

---

## Scoring Method Parameters

The table below summarizes the levers introduced above, the range each produces, and the spatial consideration attached to each. Ranges assume probabilities that sum to one.

<div style="overflow-x:auto;">

| Scoring method | Formula | Range | When to use | Spatial note |
|---|---|---|---|---|
| Least-confidence | `1 - max(p)` | `[0, 1 - 1/k]` | Fast triage; detectors with a dominant class | Cheap enough to score an entire survey in one pass |
| Margin | `1 - (p1 - p2)` | `[0, 1]` | Binary or few-class detection near a boundary | Highlights coast/field-edge tiles where two classes meet |
| Entropy (normalized) | `-Σ p·log p / log k` | `[0, 1]` | Multi-class segmentation with diffuse confusion | Reacts to mixed land cover a margin score would miss |
| Percentile aggregator | `pctl(pixel_unc, 95)` | inherits map range | Reducing dense segmentation maps to a tile score | Preserves small hard regions inside mostly-easy tiles |
| Per-cluster cap | count limit per cluster | integer | Any batch over spatially correlated tiles | Directly counters neighbouring-tile redundancy |

</div>

---

## Edge Cases & Gotchas

### Calibration decides whether the ranking can be trusted

Uncertainty scores are only as honest as the probabilities they read. Modern networks are systematically over-confident, so raw softmax entropy understates true uncertainty and the queue skews toward whichever classes the model shouts loudest. Because ranking needs only the relative order to hold, you rarely need to retrain — temperature scaling, a single learned scalar dividing the logits, is usually enough to restore a trustworthy order. Treat calibrated [confidence scores](/geospatial-annotation-fundamentals-architecture/confidence-scoring-for-geospatial-labels/) as a prerequisite, not a nicety, before you let a score drive human effort.

### Spatial autocorrelation collapses the batch

The redundancy problem from Step 3 is not an occasional annoyance; it is the default behaviour of uncertainty sampling on tiled imagery, because Tobler's first law guarantees nearby tiles resemble each other. If you skip the diversity term, expect the queue to lock onto one difficult scene and drain a batch on it. The per-cluster cap is the minimum defence; for stronger guarantees, add a spatial exclusion radius so no two queued tiles fall within a fixed ground distance of each other.

### Cold start has no signal to sample

On the very first round there is no trained model, so uncertainty scores are pure noise and ranking by them is worse than random. Bootstrap with a diversity-only round: embed tiles with a pretrained backbone, group them by similarity, and sample the group medoids to span the geographic and spectral range of the survey. Switch to uncertainty sampling only once the model clears a non-trivial validation threshold and its probabilities carry real information.

### Multi-class and binary problems want different scores

For a two-class detector the three scores are monotonic transforms of one another and rank tiles identically, so margin — the cheapest to compute — is the right default and entropy buys nothing. The distinction matters only as class count grows: with many segmentation classes, entropy responds to probability spread thinly across several classes, a diffuse confusion that margin, which inspects only the top two, cannot see. Match the score to the class count rather than reaching for entropy reflexively.

---

## Integration & Automation Hooks

The queue is only useful if it lands in front of annotators in priority order. The most direct hook is to import the ranked `GeoDataFrame` into [Label Studio configured for geospatial workflows](/labeling-workflows-toolchain-integration/integrating-label-studio-with-geospatial-workflows/), where the `uncertainty` column becomes the task ordering so the highest-value tiles surface first.

```python
from __future__ import annotations

import json

import geopandas as gpd


def queue_to_label_studio_tasks(gdf: gpd.GeoDataFrame, image_root: str) -> str:
    """Serialize a ranked queue into a Label Studio import file."""
    tasks = []
    for _, row in gdf.iterrows():
        tasks.append(
            {
                "data": {
                    "image": f"{image_root}/{row['tile_id']}.tif",
                    "tile_id": row["tile_id"],
                },
                # Label Studio orders by this field when configured to.
                "meta": {"priority": float(row["uncertainty"])},
            }
        )
    return json.dumps(tasks, indent=2)
```

Wire this into a scheduled job that runs after each retraining round: score the current unlabeled pool, build the queue, push tasks, and let annotators drain them. As reviewed labels return, they become training data for the next round, which produces a sharper model, which in turn scores the pool differently — the feedback loop that [closing the loop with automated model retraining](/active-learning-model-feedback-loops/closing-the-loop-with-automated-retraining/) automates end to end. Pair it with [detecting distribution drift in spatial datasets](/active-learning-model-feedback-loops/detecting-distribution-drift-in-spatial-datasets/) so a sudden shift in the imagery — a new sensor, a new season — triggers a fresh sampling round rather than silently degrading the model.

---

## Validation & Testing

Uncertainty code fails quietly, so guard it with property tests that assert the scores behave the way the math promises rather than eyeballing a queue.

```python
from __future__ import annotations

import numpy as np


def test_uniform_is_max_entropy() -> None:
    k = 5
    uniform = np.full(k, 1.0 / k)
    assert abs(normalized_entropy(uniform) - 1.0) < 1e-9


def test_one_hot_is_zero_uncertainty() -> None:
    one_hot = np.array([0.0, 1.0, 0.0])
    assert normalized_entropy(one_hot) < 1e-6
    assert least_confidence(one_hot) < 1e-6
    assert margin_score(one_hot) < 1e-6


def test_binary_scores_rank_identically() -> None:
    probs = np.array([[0.9, 0.1], [0.6, 0.4], [0.51, 0.49]])
    lc = np.argsort(least_confidence(probs))
    mg = np.argsort(margin_score(probs))
    en = np.argsort(normalized_entropy(probs))
    assert np.array_equal(lc, mg)
    assert np.array_equal(mg, en)
```

Three invariants cover most regressions. A uniform distribution must score the maximum uncertainty; a one-hot distribution must score zero on every method; and for two classes the three scores must produce the same ranking. Beyond unit tests, run an offline replay: hold out a labeled set, simulate rounds by revealing labels in queue order, and confirm the uncertainty-driven curve reaches target accuracy in fewer labels than a random baseline. If it does not beat random, calibration or the diversity term is broken — investigate before the queue reaches real annotators.

---

## Frequently Asked Questions

### Does uncertainty sampling need calibrated probabilities?

It benefits from them. A miscalibrated network is systematically over-confident, so raw softmax entropy underestimates true uncertainty and the queue skews toward a few loud classes. Because ranking only needs the relative order to be correct, temperature scaling — a single learned scalar applied to the logits — is usually enough to restore a trustworthy order without retraining.

### Why does the queue keep selecting adjacent tiles of the same scene?

Spatial autocorrelation. Neighbouring tiles share illumination, sensor geometry, and land cover, so a hard region produces a whole block of near-identical high-uncertainty tiles. Pure uncertainty ranking then spends an entire batch on one field. Add a feature-space diversity term or cap selections per spatial cluster so the batch covers distinct conditions.

### How do I bootstrap active learning when there is no model yet?

Use a cold-start round driven by diversity, not uncertainty. With no trained model, uncertainty scores are noise, so seed the first batch by clustering tile embeddings from a pretrained backbone and sampling the medoids to span the geographic and spectral range. Switch to uncertainty sampling once the model reaches non-trivial validation accuracy.

### Should I use entropy or margin sampling for a binary detector?

For two classes the three common scores are monotonic transforms of each other and rank tiles identically, so margin is the cheapest choice. Entropy earns its keep only for multi-class segmentation, where it responds to diffuse uncertainty spread across many classes that margin, which looks only at the top two, would miss.

---

## Related

- [Entropy vs Margin Sampling for Segmentation Masks](/active-learning-model-feedback-loops/uncertainty-sampling-for-geospatial-active-learning/entropy-vs-margin-sampling-for-segmentation-masks/) — a head-to-head on per-pixel scoring with runnable NumPy and tile thresholds
- [Prioritizing Annotation Tiles by Model Disagreement](/active-learning-model-feedback-loops/uncertainty-sampling-for-geospatial-active-learning/prioritizing-tiles-by-model-disagreement/) — query-by-committee ranking when a single model's confidence is untrustworthy
- [Closing the Loop with Automated Model Retraining](/active-learning-model-feedback-loops/closing-the-loop-with-automated-retraining/) — turning a drained queue into a retraining trigger with evaluation guards
- [Detecting Distribution Drift in Spatial Datasets](/active-learning-model-feedback-loops/detecting-distribution-drift-in-spatial-datasets/) — catching sensor and seasonal shifts that should kick off a fresh sampling round
- [Confidence Scoring for Geospatial Labels](/geospatial-annotation-fundamentals-architecture/confidence-scoring-for-geospatial-labels/) — the calibration foundation that makes uncertainty rankings trustworthy

This guide is part of the broader [Active Learning & Model Feedback Loops for Geospatial Annotation](/active-learning-model-feedback-loops/) topic area that keeps annotation effort focused where the model is weakest.
