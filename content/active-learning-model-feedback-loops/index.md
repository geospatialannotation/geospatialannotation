---
title: "Active Learning & Model Feedback Loops for Geospatial Annotation"
description: "Engineer active learning loops for geospatial ML: uncertainty sampling on spatial tiles, automated retraining triggers, and distribution-drift detection that keep annotation effort focused where the model is weakest."
slug: "active-learning-model-feedback-loops"
type: "overview"
breadcrumb: "Active Learning & Model Feedback Loops"
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
      "headline": "Active Learning & Model Feedback Loops for Geospatial Annotation",
      "description": "Engineer active learning loops for geospatial ML: uncertainty sampling on spatial tiles, automated retraining triggers, and distribution-drift detection that keep annotation effort focused where the model is weakest.",
      "datePublished": "2026-07-13",
      "dateModified": "2026-07-13",
      "author": {"@type": "Organization", "name": "Geospatial Annotation"},
      "publisher": {"@type": "Organization", "name": "Geospatial Annotation"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.geospatialannotation.com/"},
        {"@type": "ListItem", "position": 2, "name": "Active Learning & Model Feedback Loops", "item": "https://www.geospatialannotation.com/active-learning-model-feedback-loops/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Run a Geospatial Active Learning Loop",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Score the unlabeled tile pool with the current model to obtain per-tile uncertainty"},
        {"@type": "HowToStep", "position": 2, "name": "Select a diversity-aware batch of high-uncertainty tiles that avoids spatial redundancy"},
        {"@type": "HowToStep", "position": 3, "name": "Route the selected tiles to annotation and human-in-the-loop validation"},
        {"@type": "HowToStep", "position": 4, "name": "Retrain the model and promote the checkpoint only if evaluation gates pass"},
        {"@type": "HowToStep", "position": 5, "name": "Detect distribution drift and feed weak regions back into the unlabeled pool"}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why does random tile sampling waste annotation budget in geospatial ML?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Satellite and drone mosaics are massively redundant: neighbouring tiles overlap and share land cover, so a random draw repeatedly labels near-identical easy examples the model already handles. Active learning ranks the unlabeled pool by model uncertainty and picks a diverse batch, so a fixed labeling budget buys the maximum reduction in model error instead of paying to re-confirm what the model already knows."
          }
        },
        {
          "@type": "Question",
          "name": "How is spatial redundancy handled during batch selection?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Pure uncertainty ranking tends to select tight groups of adjacent tiles that all show the same hard scene, so the batch teaches the model one lesson many times. A diversity-aware selector combines the uncertainty score with a distance term in feature or geographic space, greedily choosing tiles that are both uncertain and far from already-selected tiles. This spreads the annotation budget across distinct scenes and prevents one difficult region from dominating a round."
          }
        },
        {
          "@type": "Question",
          "name": "What triggers automated retraining in an active learning loop?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Retraining is triggered when a threshold of newly validated annotations accumulates or when a drift monitor fires. A DVC pipeline stage hashes the annotation directory as a dependency, so a change in the validated data invalidates the stage and a scheduler launches training. The new checkpoint is promoted to production only if it beats the incumbent on a frozen geographically stratified validation set."
          }
        },
        {
          "@type": "Question",
          "name": "How do you keep active learning from over-fitting to one sensor or region?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Uncertainty sampling naturally chases the hardest scenes, which are often one sensor, one season, or one geography, so the training set can skew toward that slice. Guard against it by capping the per-region and per-sensor share of each batch, tracking class-balance and spectral drift across acquisition batches, and keeping a held-out stratified validation set that spans all sensors so a checkpoint that improves on one slice but regresses elsewhere is caught before promotion."
          }
        }
      ]
    }
  ]
}
</script>

# Active Learning & Model Feedback Loops for Geospatial Annotation

Every geospatial ML program eventually hits the same wall: the imagery is effectively infinite, but the labeling budget is not. A single Sentinel-2 pass covers 290 km of swath; a drone survey of one agricultural estate produces tens of thousands of overlapping frames. Annotating all of it is impossible, and annotating a random subset is wasteful, because most tiles are trivially easy for the model and massively redundant with their neighbours. The scarce resource in a mature pipeline is not compute or storage — it is the attention of a skilled annotator, and spending that attention on tiles the model already handles correctly is pure loss.

Active learning is the discipline that decides *which* tiles are worth labeling next. Instead of drawing tiles at random, the current model scores the unlabeled pool, and the pipeline routes only the most informative tiles — the ones where the model is genuinely uncertain — to human annotators. Those newly labeled tiles retrain the model, the improved model rescores the pool, and the cycle repeats. This is the active learning loop, and treating it as a first-class, automated system rather than an ad-hoc "label some more when accuracy stalls" habit is what separates a pipeline that plateaus from one that keeps improving on a flat labeling budget.

This is a genuinely distinct bottleneck from the mechanics of drawing polygons or wiring up an annotation tool. The upstream [labeling workflows and toolchain integration](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/) get tiles in front of annotators and validated labels back out; active learning decides what should enter that queue in the first place, and closes the loop by feeding model performance back into selection. Get it right and a team of five annotators produces the model quality that a naive random-sampling program would need fifty to reach. Get it wrong — with spatial leakage, near-duplicate batches, or an ungated retrain — and the loop quietly amplifies its own biases until the deployed model decays. This guide covers the concepts, the six-stage loop with runnable code for each stage, the spatial failure modes that generic active-learning tutorials ignore, and the CI/CD plumbing that makes the loop run without a human babysitting it.

## Core Concepts: Uncertainty, Query Strategies, and the Labeling Budget

Active learning rests on a single premise: an unlabeled example is worth labeling in proportion to how much it would improve the model. Since we cannot measure that improvement without the label, we estimate it with a *query strategy* — a scoring function over unlabeled tiles that proxies informativeness.

**Uncertainty sampling** is the workhorse strategy. It scores each tile by how unsure the current model is about its prediction. For a classifier or detector this is derived from the output probabilities: low-confidence predictions (a building the model calls 0.51 building / 0.49 shadow), high-entropy predictions, or predictions with a small margin between the top two classes. Uncertainty is cheap — it is a byproduct of ordinary inference — which is why it dominates production loops. Its reliability depends entirely on the model's probabilities being meaningful, which is why raw softmax outputs should be treated as suspect and the [confidence scores](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/confidence-scoring-for-geospatial-labels/) driving the queue are worth calibrating before you trust them.

**Query-by-committee** replaces a single model's uncertainty with *disagreement* among an ensemble. Train several models on the same labeled data — different seeds, architectures, or bootstrap samples — and score each tile by how much the committee members disagree (vote entropy, or variance of predicted masks). A tile where every model agrees is uninformative even if the shared confidence is moderate; a tile that splits the committee is exactly where a new label resolves the most ambiguity. Committee methods cost more inference but are more robust to a single model's miscalibration.

**Diversity and representativeness** counterbalance uncertainty. Uncertainty is a *per-tile* signal and is blind to the composition of the batch as a whole. If the ten most uncertain tiles are ten overlapping frames of the same confusing quarry, labeling all ten teaches the model one lesson ten times. A representativeness term rewards tiles that are similar to *many* unlabeled tiles (so the label generalizes) while a diversity term penalizes tiles that are similar to *already-selected* tiles (so the batch spans distinct scenes). Practical selectors combine all three: high uncertainty, high representativeness, low intra-batch redundancy.

**The labeling budget** is the constraint that turns these strategies from academic curiosities into an operational necessity. Frame it explicitly: a round has a fixed capacity — say 300 tile-annotations per week, given your annotator headcount and the average minutes each geospatial tile takes to label and validate. Every tile spent on a scene the model already segments at 0.95 IoU is a tile not spent on the confusing urban-fringe or the under-sampled coastal zone. The economic question active learning answers is therefore not "how do we label more" but "given that we can only label 300 tiles, which 300 buy the largest expected drop in validation error?" Modeling the budget as a hard weekly quantity also makes the loop schedulable: selection produces exactly one batch per cadence, annotation drains it, and retraining fires when the accumulated batches cross a retraining threshold rather than on an arbitrary calendar date.

**The exploration/exploitation trade-off** is the tension underneath these terms. Exploitation means labeling near the current decision boundary — squeezing accuracy out of the region the model already half-understands. Exploration means labeling in parts of the feature space the model has barely seen — new sensors, new seasons, new geographies — where uncertainty may be low simply because the model is confidently wrong. A loop that only exploits over-fits to today's hard cases and goes blind to tomorrow's distribution shift. Deliberate exploration, whether by mixing in random or geographically stratified draws or by scoring representativeness, is what keeps the loop honest over many rounds.

**Spatial redundancy of tiles** is the property that makes all of this sharper for geospatial data than for, say, a stream of independent photographs. Adjacent tiles from the same scene are strongly autocorrelated: they share illumination, sensor artifacts, land cover, and often the same objects straddling the tile boundary from your overlap padding. This means two things. First, the effective information content of a mosaic is far lower than its tile count suggests, so aggressive selection is not just efficient but necessary. Second, autocorrelation is a trap — it inflates apparent batch diversity's cost and, more dangerously, leaks between train and validation splits if you are not careful. Every technique below has to be defended against tiles that look different but carry the same signal. Because these tiles are compared in real-world units, the loop assumes a consistent [coordinate reference system](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/); a pool mixing [`EPSG:4326`](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) degrees with a UTM metric grid will produce nonsense distances in any diversity term.

## The Active Learning Loop: Six Stages from Unlabeled Pool to Retrained Model

The loop is a cycle, not a pipeline with an end. Six stages move a tile from the unlabeled pool to a retrained model, and the sixth stage feeds back into the first. Making each stage an independently testable, automatable step is what lets the whole loop run on a schedule.

<svg viewBox="0 0 760 430" role="img" aria-label="Six-stage cyclic active learning loop for geospatial annotation" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:760px;display:block;margin:1.5rem auto;">
  <title>The Geospatial Active Learning Loop</title>
  <desc>A cyclic diagram with six stages arranged in a ring: an unlabeled tile pool feeds model inference, which produces predictions scored for uncertainty, which feeds diversity-aware batch tile selection, which routes tiles to human annotation and validation, which supplies data to retrain and evaluate the model. A feedback arrow returns from retrain and evaluate back to the unlabeled tile pool, and a drift signal arrow points from evaluate back into the pool as well.</desc>
  <defs>
    <marker id="al-arrow" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor" opacity="0.6"/>
    </marker>
  </defs>
  <!-- Stage 1 -->
  <rect x="290" y="14" width="180" height="62" rx="9" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="380" y="40" text-anchor="middle" font-size="12" font-weight="600" fill="currentColor">1 · Unlabeled tile pool</text>
  <text x="380" y="58" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">satellite / drone chips</text>
  <!-- Stage 2 -->
  <rect x="560" y="118" width="180" height="62" rx="9" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="650" y="144" text-anchor="middle" font-size="12" font-weight="600" fill="currentColor">2 · Model inference</text>
  <text x="650" y="162" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">predict on the pool</text>
  <!-- Stage 3 -->
  <rect x="560" y="242" width="180" height="62" rx="9" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="650" y="268" text-anchor="middle" font-size="12" font-weight="600" fill="currentColor">3 · Uncertainty scoring</text>
  <text x="650" y="286" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">entropy · margin · BALD</text>
  <!-- Stage 4 -->
  <rect x="290" y="346" width="180" height="62" rx="9" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="380" y="372" text-anchor="middle" font-size="12" font-weight="600" fill="currentColor">4 · Batch selection</text>
  <text x="380" y="390" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">diversity-aware</text>
  <!-- Stage 5 -->
  <rect x="20" y="242" width="180" height="62" rx="9" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="110" y="262" text-anchor="middle" font-size="12" font-weight="600" fill="currentColor">5 · Annotation</text>
  <text x="110" y="279" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">human-in-the-loop</text>
  <text x="110" y="294" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">+ validation</text>
  <!-- Stage 6 -->
  <rect x="20" y="118" width="180" height="62" rx="9" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="110" y="144" text-anchor="middle" font-size="12" font-weight="600" fill="currentColor">6 · Retrain / evaluate</text>
  <text x="110" y="162" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">promote checkpoint</text>
  <!-- Ring arrows -->
  <path d="M470,52 Q600,70 640,116" fill="none" stroke="currentColor" stroke-width="1.5" marker-end="url(#al-arrow)" opacity="0.6"/>
  <line x1="650" y1="180" x2="650" y2="240" stroke="currentColor" stroke-width="1.5" marker-end="url(#al-arrow)" opacity="0.6"/>
  <path d="M600,304 Q520,352 472,372" fill="none" stroke="currentColor" stroke-width="1.5" marker-end="url(#al-arrow)" opacity="0.6"/>
  <path d="M288,372 Q200,352 150,306" fill="none" stroke="currentColor" stroke-width="1.5" marker-end="url(#al-arrow)" opacity="0.6"/>
  <line x1="110" y1="240" x2="110" y2="182" stroke="currentColor" stroke-width="1.5" marker-end="url(#al-arrow)" opacity="0.6"/>
  <path d="M150,116 Q200,70 288,52" fill="none" stroke="currentColor" stroke-width="1.5" marker-end="url(#al-arrow)" opacity="0.6"/>
  <!-- Feedback / drift arrow across the middle -->
  <path d="M200,150 Q380,215 560,150" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="6,4" marker-end="url(#al-arrow)" opacity="0.4"/>
  <text x="380" y="205" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.55">drift signal feeds the pool</text>
</svg>

The stages are: (1) hold an unlabeled pool of tiles; (2) run the current model over the pool; (3) score each prediction for uncertainty; (4) select a diversity-aware batch of the most informative tiles; (5) route that batch to human annotation and validation; (6) retrain, evaluate, and promote — then the improved model, plus any drift signal, sends control back to the pool for the next round. The deep dives below give a runnable Python implementation for the load-bearing stages.

All Python examples target 3.10+ and assume this environment:

```bash
pip install numpy==1.26.4 scipy==1.13.1 scikit-learn==1.5.1 \
    geopandas==0.14.4 shapely==2.0.6 rasterio==1.3.10 pyproj==3.6.1 torch==2.3.1
```

### Stage 1 & 2 — Score the Unlabeled Pool

Scoring the pool means running inference on every unlabeled tile and reducing each prediction to a scalar uncertainty. For a segmentation model the prediction is a per-pixel class-probability tensor; a robust tile-level score is the mean per-pixel entropy, which flags tiles where many pixels sit near a decision boundary. The function below is model-agnostic — it takes a callable that returns class probabilities, so you can swap in a detector or classifier.

```python
from __future__ import annotations
from dataclasses import dataclass
from pathlib import Path
from typing import Callable
import numpy as np

# A predictor maps a tile array (H, W, bands) -> class probs (H, W, C)
Predictor = Callable[[np.ndarray], np.ndarray]


@dataclass(frozen=True)
class TileScore:
    tile_id: str
    path: Path
    uncertainty: float


def pixel_entropy(probs: np.ndarray, eps: float = 1e-9) -> np.ndarray:
    """Per-pixel Shannon entropy from a (H, W, C) probability tensor."""
    p = np.clip(probs, eps, 1.0)
    return -np.sum(p * np.log(p), axis=-1)


def score_pool(
    tiles: dict[str, Path],
    load_tile: Callable[[Path], np.ndarray],
    predict: Predictor,
) -> list[TileScore]:
    """Score every unlabeled tile by mean per-pixel prediction entropy."""
    scored: list[TileScore] = []
    for tile_id, path in tiles.items():
        arr = load_tile(path)
        probs = predict(arr)
        score = float(pixel_entropy(probs).mean())
        scored.append(TileScore(tile_id=tile_id, path=path, uncertainty=score))
    scored.sort(key=lambda t: t.uncertainty, reverse=True)
    return scored
```

Run this over the full pool on a schedule with the freshest promoted checkpoint. The sorted list is the raw ranking; it is *not* yet a batch, because the top of the list is exactly where spatial redundancy bites — the most uncertain tiles are usually concentrated in one or two hard scenes.

### Stage 3 & 4 — Select a Diverse, High-Uncertainty Batch

Turning the ranking into a batch requires a diversity constraint. A greedy facility-location-style selection works well and is easy to reason about: repeatedly pick the tile that maximizes a blend of its own uncertainty and its distance to the tiles already chosen. Distance can be computed in a learned feature space (embeddings from the model's penultimate layer) or, as a cheap spatial proxy, in projected map coordinates so that geographically bunched tiles repel each other.

```python
from __future__ import annotations
import numpy as np


def select_diverse_batch(
    uncertainty: np.ndarray,   # (N,) higher = more uncertain
    features: np.ndarray,      # (N, D) tile embeddings or projected centroids
    batch_size: int,
    lambda_div: float = 0.5,
) -> list[int]:
    """Greedy uncertainty + diversity selection. Returns chosen tile indices."""
    n = uncertainty.shape[0]
    if batch_size >= n:
        return list(range(n))

    # Normalize both terms to [0, 1] so lambda_div is interpretable.
    u = (uncertainty - uncertainty.min()) / (np.ptp(uncertainty) + 1e-9)
    feats = features / (np.linalg.norm(features, axis=1, keepdims=True) + 1e-9)

    selected: list[int] = [int(np.argmax(u))]
    min_dist = np.full(n, np.inf)

    while len(selected) < batch_size:
        last = feats[selected[-1]]
        d = np.linalg.norm(feats - last, axis=1)   # distance to newest pick
        min_dist = np.minimum(min_dist, d)
        # Score = exploit uncertainty + explore distance from the batch.
        score = (1 - lambda_div) * u + lambda_div * (
            min_dist / (min_dist.max() + 1e-9)
        )
        for i in selected:
            score[i] = -np.inf
        selected.append(int(np.argmax(score)))
    return selected
```

Tune `lambda_div` toward 1.0 when your pool is highly redundant (dense drone overlap) and toward 0.0 when tiles are already well-separated. Query-by-committee slots in here by replacing the entropy score with ensemble vote-entropy; the diversity machinery is identical.

### Stage 5 — Route the Batch to Annotation and Validation

The selected batch becomes a set of annotation tasks. In practice this means pushing the tile chips, plus the model's pre-labeled predictions as an editable starting point, into your annotation platform. Routing through [Label Studio](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/integrating-label-studio-with-geospatial-workflows/) lets annotators correct model output rather than draw from scratch, which is the whole point of a pre-labeled active-learning batch. The completed labels then pass through the same [human-in-the-loop validation](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/human-in-the-loop-validation-cycles/) that guards the rest of your pipeline before they are trusted as ground truth.

```python
from __future__ import annotations
from dataclasses import dataclass, asdict
from pathlib import Path
import json


@dataclass
class AnnotationTask:
    tile_id: str
    image_url: str
    predicted_geojson: str      # model pre-label the annotator refines
    priority: float             # carry the uncertainty score for queue ordering


def build_task_queue(
    batch_ids: list[str],
    tiles: dict[str, Path],
    uncertainty: dict[str, float],
    predictions: dict[str, str],
    base_url: str,
) -> list[dict]:
    """Assemble prioritized annotation tasks for a batch, most-uncertain first."""
    tasks: list[AnnotationTask] = [
        AnnotationTask(
            tile_id=tid,
            image_url=f"{base_url}/{tiles[tid].name}",
            predicted_geojson=predictions[tid],
            priority=uncertainty[tid],
        )
        for tid in batch_ids
    ]
    tasks.sort(key=lambda t: t.priority, reverse=True)
    return [asdict(t) for t in tasks]


def write_queue(tasks: list[dict], out_path: Path) -> None:
    out_path.write_text(json.dumps(tasks, indent=2))
```

Carrying the uncertainty forward as a task `priority` means annotators see the highest-value tiles first, so a round that runs short on annotator time still captures most of its information gain.

### Stage 6a — Retrain and Promote the Checkpoint

When enough validated labels have accumulated, retrain and decide whether the new checkpoint is actually better. The non-negotiable rule is that promotion is *gated*: a fresh model reaches production only if it beats the incumbent on a frozen, geographically stratified validation set. Without this gate a single bad batch — mislabeled, or drawn from a pathological region — silently degrades the deployed model.

```python
from __future__ import annotations
from dataclasses import dataclass
from pathlib import Path
from typing import Callable
import json


@dataclass(frozen=True)
class EvalResult:
    checkpoint: Path
    miou: float
    per_class_iou: dict[str, float]


def promote_if_better(
    candidate: EvalResult,
    incumbent: EvalResult,
    min_gain: float = 0.005,
    max_class_regression: float = 0.02,
) -> bool:
    """Promote only on overall gain with no severe per-class regression."""
    if candidate.miou < incumbent.miou + min_gain:
        return False
    for cls, iou in candidate.per_class_iou.items():
        if iou < incumbent.per_class_iou.get(cls, 0.0) - max_class_regression:
            return False   # a rare class collapsed; block the promotion
    return True


def run_promotion(
    candidate: EvalResult,
    incumbent: EvalResult,
    registry: Path,
) -> None:
    decision = promote_if_better(candidate, incumbent)
    record = {
        "candidate": str(candidate.checkpoint),
        "candidate_miou": candidate.miou,
        "incumbent_miou": incumbent.miou,
        "promoted": decision,
    }
    (registry / "promotion_log.jsonl").open("a").write(json.dumps(record) + "\n")
```

The per-class guard matters more in geospatial work than a headline mIoU, because rare classes — landslide scars, damaged roofs, illegal dumping — are precisely what active learning is meant to chase, and an aggregate metric will happily trade them away for gains on abundant background classes. Two further habits harden this stage. Warm-start each retrain from the incumbent's weights rather than from scratch so a round's small labeled increment fine-tunes rather than destabilizes the model, and keep the training data cumulative — every round appends to the labeled set, so the loop never forgets earlier hard examples in favour of the latest batch. When a promotion is blocked, the candidate is not discarded silently; log the regressed classes and route their geographies back into the pool, because a blocked promotion is itself a signal about where the next round should look.

### Stage 6b — Detect Drift and Feed the Pool

The loop's final act is to look for distribution drift and route weak regions back into the pool. Covariate drift (the input imagery has shifted — new sensor, new season, atmospheric haze) and label drift (the class mix has changed) both signal that yesterday's uncertainty scores may be stale. A lightweight population-stability-index (PSI) check over a summary statistic — mean tile brightness, an NDVI band, or per-class frequency — flags acquisition batches that no longer resemble the training distribution.

```python
from __future__ import annotations
import numpy as np


def population_stability_index(
    expected: np.ndarray,
    actual: np.ndarray,
    bins: int = 10,
    eps: float = 1e-6,
) -> float:
    """PSI between a reference and a new sample. >0.2 signals notable drift."""
    edges = np.histogram_bin_edges(expected, bins=bins)
    exp_frac = np.histogram(expected, bins=edges)[0] / len(expected)
    act_frac = np.histogram(actual, bins=edges)[0] / len(actual)
    exp_frac = np.clip(exp_frac, eps, None)
    act_frac = np.clip(act_frac, eps, None)
    return float(np.sum((act_frac - exp_frac) * np.log(act_frac / exp_frac)))


def flag_drifted_batches(
    reference: np.ndarray,
    batches: dict[str, np.ndarray],
    threshold: float = 0.2,
) -> list[str]:
    """Return acquisition-batch ids whose feature distribution has drifted."""
    return [
        bid
        for bid, sample in batches.items()
        if population_stability_index(reference, sample) > threshold
    ]
```

Tiles from a drifted batch are prime candidates for the next round even if the current (now unreliable) model scores them as low-uncertainty — this is exploration forced by evidence rather than by a random draw, and it is how the loop defends itself against confidently-wrong blind spots.

## Spatial-Specific Failure Modes in Active Learning

Active-learning tutorials written for photo classification quietly assume examples are independent and identically distributed. Geospatial tiles violate that assumption in ways that create failure modes with no analogue in ordinary datasets. The unifying cause is that spatial position is a hidden variable coupled to almost everything else — imagery content, class prevalence, sensor, and acquisition date all correlate with *where* a tile sits — so a selector that optimizes purely in feature space, blind to geography, will make systematic mistakes. Each failure below is a specific consequence of ignoring that coupling, and each has a concrete guard that a production loop must implement rather than assume away.

**Spatial autocorrelation leaking into train/validation.** The most damaging and common error. If tiles are split randomly, adjacent tiles — which overlap and share content — land on both sides of the split, so the validation set is contaminated with near-copies of training tiles. Every metric, including the promotion gate, then reports optimistically, and the loop happily promotes checkpoints that do not actually generalize. Split by spatial block (grid cells, scenes, or administrative regions), never by tile, and keep the same blocks frozen across every round so scores stay comparable.

**Near-duplicate neighbouring tiles inflating a batch.** Uncertainty ranking bunches up, because a genuinely hard scene produces many adjacent high-uncertainty tiles. Selecting the raw top-k then spends an entire round's budget re-labeling one quarry or one cloud bank from twenty angles. The diversity term in Stage 4 is the direct defence; without it, apparent throughput looks fine while real information gain collapses.

**Cold-start with no seed model.** The loop needs a model to score the pool, but the first model needs labels that do not exist yet. Bootstrapping on uncertainty is impossible at round zero. Seed the pool with a diversity-only selection — group tile embeddings from a pretrained backbone (or even raw spectral statistics) into partitions and sample across those partitions — so the first annotated batch spans the input space before uncertainty scoring takes over in round one.

**Class-rare geographic concentration.** Rare classes are not sprinkled uniformly; they concentrate — informal settlements in specific districts, flood damage along one river reach. Uncertainty sampling will find one such hotspot and pour the budget into it, over-representing that geography and starving the model of rare-class examples elsewhere. Cap the per-region share of a batch and track per-class frequency across rounds so a single hotspot cannot monopolize selection.

**Over-fitting to one sensor.** When the pool spans multiple sensors or acquisition programs, the hardest tiles often come from whichever sensor the model has seen least — different GSD, spectral response, or noise profile. The loop will chase that sensor and skew the training set toward it, improving on that slice while quietly regressing on the sensors that matter in production. Stratify batches by sensor, and keep sensors represented in the frozen validation set so the promotion gate can see cross-sensor regressions.

## CI/CD Integration: DVC-Triggered Retraining

The loop only pays off if it runs without a human orchestrating each stage. The mechanism is dependency hashing: version the validated annotations with [DVC](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/), and let a change in the annotation directory invalidate the training stage so a scheduler reruns it. Because DVC hashes the actual content, a round that adds newly validated tiles automatically marks the downstream training and evaluation stages as stale.

```yaml
# dvc.yaml — retraining fires when validated annotations change
stages:
  score_pool:
    cmd: python -m loop.score_pool --pool data/unlabeled/ --ckpt models/current.pt
    deps:
      - data/unlabeled/
      - models/current.pt
    outs:
      - data/scores/pool_uncertainty.parquet

  select_batch:
    cmd: python -m loop.select_batch --scores data/scores/pool_uncertainty.parquet
    deps:
      - data/scores/pool_uncertainty.parquet
    outs:
      - data/queue/next_batch.json

  retrain:
    cmd: python -m loop.train --data data/annotations/ --out models/candidate.pt
    deps:
      - data/annotations/          # DVC-hashed: new labels invalidate this stage
      - loop/train.py
    outs:
      - models/candidate.pt

  evaluate_and_promote:
    cmd: python -m loop.promote --candidate models/candidate.pt --val data/val_blocks/
    deps:
      - models/candidate.pt
      - data/val_blocks/           # frozen, spatially blocked validation set
    metrics:
      - reports/eval.json
```

A scheduler — cron, GitHub Actions on a timer, or an Airflow DAG — runs `dvc repro` on a cadence. Only stages whose hashed dependencies changed actually execute, so a quiet week costs nothing while a week of heavy annotation triggers a full retrain-and-gate cycle. The same scheduler can call the drift monitor from Stage 6b and, when PSI crosses threshold, force a `score_pool` rerun even if no new labels arrived, so covariate shift alone can wake the loop.

```python
# airflow DAG — nightly loop tick that respects the promotion gate
from airflow import DAG
from airflow.operators.bash import BashOperator
from datetime import datetime, timedelta

with DAG(
    dag_id="active_learning_tick",
    schedule_interval="@daily",
    start_date=datetime(2026, 7, 1),
    catchup=False,
    default_args={"retries": 1, "retry_delay": timedelta(minutes=10)},
) as dag:
    repro = BashOperator(task_id="dvc_repro", bash_command="dvc repro")
    push = BashOperator(task_id="dvc_push", bash_command="dvc push")
    repro >> push
```

## Production-Readiness Checklist

Use this checklist to confirm the loop is safe to run unattended before you scale it beyond a pilot region.

- [ ] Score the full unlabeled pool with the freshest promoted checkpoint on a fixed cadence
- [ ] Calibrate model probabilities before trusting them as uncertainty signals
- [ ] Apply a diversity-aware selector so no batch is dominated by neighbouring tiles
- [ ] Seed round zero with diversity sampling to escape the cold-start problem
- [ ] Split train and validation by spatial block, never by individual tile
- [ ] Freeze the validation blocks so scores stay comparable across every round
- [ ] Cap the per-region and per-sensor share of each annotation batch
- [ ] Carry the uncertainty score forward as annotation task priority
- [ ] Pre-label every routed tile so annotators correct rather than draw from scratch
- [ ] Gate checkpoint promotion on overall gain with no severe per-class regression
- [ ] Track per-class frequency across rounds to catch rare-class starvation
- [ ] Monitor covariate and label drift and let drift alone trigger a new round
- [ ] Version validated annotations so a data change invalidates the training stage
- [ ] Log every selection, promotion decision, and drift alert for audit and rollback

Start with one region and a few hundred seed tiles, run the loop for three or four rounds, and confirm that accuracy climbs faster than a random-sampling baseline on the same budget before expanding coverage.

---

**Related**

- [Uncertainty Sampling for Geospatial Active Learning](https://www.geospatialannotation.com/active-learning-model-feedback-loops/uncertainty-sampling-for-geospatial-active-learning/) — entropy, margin, and BALD scoring to rank unlabeled tiles by informativeness
- [Closing the Loop with Automated Model Retraining](https://www.geospatialannotation.com/active-learning-model-feedback-loops/closing-the-loop-with-automated-retraining/) — DVC-triggered pipelines, checkpoint promotion gates, and evaluation guards
- [Detecting Distribution Drift in Spatial Datasets](https://www.geospatialannotation.com/active-learning-model-feedback-loops/detecting-distribution-drift-in-spatial-datasets/) — spectral histograms, class-balance monitors, and PSI thresholds that trigger re-labeling
- [Labeling Workflows & Toolchain Integration for Geospatial AI](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/) — the annotation platforms and QA gates that turn a selected batch into validated labels
- [Geospatial Annotation Fundamentals & Architecture](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/) — CRS contracts, label taxonomies, and confidence scoring that the loop depends on

This guide is the top of the broader [Active Learning & Model Feedback Loops](https://www.geospatialannotation.com/active-learning-model-feedback-loops/) topic area; the related guides above go deeper on each stage of the loop it frames.
