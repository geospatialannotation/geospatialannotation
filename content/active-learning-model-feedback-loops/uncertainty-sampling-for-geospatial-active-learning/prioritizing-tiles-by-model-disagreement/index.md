---
title: "Prioritizing Annotation Tiles by Model Disagreement"
description: "Use query-by-committee ensemble disagreement to rank unlabeled geospatial tiles for annotation, including a vote-entropy implementation and a batch selection strategy that avoids spatial redundancy."
slug: "prioritizing-tiles-by-model-disagreement"
type: "tutorial"
breadcrumb:
  - label: "Home"
    url: "/"
  - label: "Active Learning & Model Feedback Loops"
    url: "/active-learning-model-feedback-loops/"
  - label: "Uncertainty Sampling for Geospatial Active Learning"
    url: "/active-learning-model-feedback-loops/uncertainty-sampling-for-geospatial-active-learning/"
  - label: "Prioritizing Annotation Tiles by Model Disagreement"
    url: "/active-learning-model-feedback-loops/uncertainty-sampling-for-geospatial-active-learning/prioritizing-tiles-by-model-disagreement/"
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
      "headline": "Prioritizing Annotation Tiles by Model Disagreement",
      "description": "Use query-by-committee ensemble disagreement to rank unlabeled geospatial tiles for annotation, including a vote-entropy implementation and a batch selection strategy that avoids spatial redundancy.",
      "datePublished": "2026-07-13",
      "dateModified": "2026-07-13",
      "author": {"@type": "Organization", "name": "Geospatial Annotation"},
      "publisher": {"@type": "Organization", "name": "Geospatial Annotation"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.geospatialannotation.com/"},
        {"@type": "ListItem", "position": 2, "name": "Active Learning & Model Feedback Loops", "item": "https://www.geospatialannotation.com/active-learning-model-feedback-loops/"},
        {"@type": "ListItem", "position": 3, "name": "Uncertainty Sampling for Geospatial Active Learning", "item": "https://www.geospatialannotation.com/active-learning-model-feedback-loops/uncertainty-sampling-for-geospatial-active-learning/"},
        {"@type": "ListItem", "position": 4, "name": "Prioritizing Annotation Tiles by Model Disagreement", "item": "https://www.geospatialannotation.com/active-learning-model-feedback-loops/uncertainty-sampling-for-geospatial-active-learning/prioritizing-tiles-by-model-disagreement/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Prioritizing Annotation Tiles by Model Disagreement",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Assemble a committee of models", "text": "Collect N independent model checkpoints from different training epochs or seeds, or produce N augmentation-perturbed passes from a single model, so each acts as an independent voter over the unlabeled tiles."},
        {"@type": "HowToStep", "position": 2, "name": "Gather per-tile committee predictions", "text": "Run every committee member over each unlabeled tile and store an array of shape (n_members, n_classes) of class probabilities per tile."},
        {"@type": "HowToStep", "position": 3, "name": "Compute vote entropy and average KL divergence", "text": "Convert each member's probabilities to a hard vote and measure the entropy of the vote histogram, then measure the mean KL divergence of each member's soft prediction from the committee consensus."},
        {"@type": "HowToStep", "position": 4, "name": "Combine into a single disagreement score", "text": "Normalise both signals to [0,1] and take a weighted sum so hard-vote splits and soft-probability spread both raise a tile's priority."},
        {"@type": "HowToStep", "position": 5, "name": "Batch-select while de-duplicating adjacent tiles", "text": "Sort tiles by disagreement descending and greedily accept the highest-scoring tiles, skipping any tile within a spatial exclusion radius of an already-selected tile to avoid labeling redundant neighbours."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "How many models do I need in a query-by-committee ensemble for geospatial tiles?",
          "acceptedAnswer": {"@type": "Answer", "text": "Three to five voters captures most of the disagreement signal for tile prioritization. Below three, vote entropy is too coarse to rank tiles. Above five, the marginal ranking change is usually smaller than the extra inference cost. If retraining several checkpoints is expensive, use one model with three to five augmentation-perturbed passes (flips, rotations, small brightness shifts) as a cheaper committee."}
        },
        {
          "@type": "Question",
          "name": "What is the difference between vote entropy and KL divergence in committee disagreement?",
          "acceptedAnswer": {"@type": "Answer", "text": "Vote entropy looks only at the hard argmax decision of each member and measures how split the votes are across classes, so it captures categorical disagreement. Average KL divergence compares each member's full probability distribution against the committee mean, so it captures soft disagreement even when every member picks the same class but with different confidence. Combining both catches tiles that a single metric would miss."}
        },
        {
          "@type": "Question",
          "name": "Why should I de-duplicate spatially adjacent tiles before annotating?",
          "acceptedAnswer": {"@type": "Answer", "text": "Uncertainty is spatially autocorrelated: if one tile confuses the committee, its neighbours usually do too because they share terrain, sensor conditions, and class distribution. Selecting a group of adjacent high-disagreement tiles wastes annotation budget on near-duplicate information. Enforcing a minimum spatial gap between selected tiles spreads the labeling effort across genuinely distinct regions and improves the diversity of each retraining batch."}
        },
        {
          "@type": "Question",
          "name": "Does query-by-committee need calibrated probabilities?",
          "acceptedAnswer": {"@type": "Answer", "text": "The KL-divergence component is sensitive to miscalibration because an over-confident member skews the consensus and inflates apparent disagreement. Temperature-scale each member's logits before computing soft scores, or rely more heavily on the vote-entropy component, which depends only on the argmax and is unaffected by absolute confidence levels."}
        }
      ]
    }
  ]
}
</script>

# Prioritizing Annotation Tiles by Model Disagreement

When an [active learning loop](https://www.geospatialannotation.com/active-learning-model-feedback-loops/) has to choose which of thousands of unlabeled satellite or drone tiles to send to annotators next, single-model uncertainty is not the only signal available. Query-by-committee ranks tiles by how much a set of models *disagree* with each other: run N model checkpoints — or N augmentation-perturbed passes of one model — over every unlabeled tile, then score each tile by vote entropy and average KL divergence from the committee consensus. Tiles where the committee splits are the most informative to label, because they sit near a decision boundary that new annotations will sharpen. This guide implements that ranking in NumPy and adds a batch selector that avoids wasting budget on spatially adjacent, near-duplicate tiles.

## Why Committee Disagreement Beats Single-Model Uncertainty

A single model's softmax entropy tells you where *that* model is unsure, but it conflates two very different situations: genuine class ambiguity, and a model that is confidently wrong. A committee separates them. If five independently trained checkpoints all assign 60% to "building" on a tile, the model family agrees — the tile is only mildly uncertain and probably not worth a label. If three checkpoints say "building" and two say "greenhouse", the tile sits exactly on a boundary the committee has not resolved, and one human label there corrects several models at once.

This matters for geospatial data specifically because uncertainty is spatially structured. Terrain, sensor geometry, seasonal illumination, and class frequency all vary smoothly across a scene, so disagreement clusters into contiguous patches rather than scattering randomly. A naive top-K selection would hand annotators twenty tiles from the same confusing field. The batch selector below treats spatial redundancy as a first-class constraint, spreading the label budget across distinct regions so each retraining round sees maximally diverse examples. The committee approach also composes cleanly with the [confidence scores](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/confidence-scoring-for-geospatial-labels/) you already log per prediction — disagreement is a complementary axis, not a replacement.

<svg viewBox="0 0 720 300" role="img" aria-label="Diagram: a committee of model checkpoints votes on unlabeled tiles, disagreement is scored, and tiles are ordered into a ranked annotation queue" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>Query-by-committee tile prioritization flow</title>
  <desc>On the left, four model checkpoints each emit a vote for a tile. Their votes feed a disagreement score box that computes vote entropy and average KL divergence. On the right the scored tiles are ordered into a ranked annotation queue, highest disagreement first, with spatially adjacent duplicates skipped.</desc>
  <defs>
    <marker id="qbc-arrow" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto">
      <polygon points="0 0, 9 3.5, 0 7" fill="currentColor" opacity="0.55"/>
    </marker>
  </defs>
  <!-- Committee -->
  <text x="90" y="26" text-anchor="middle" font-size="12" fill="currentColor" opacity="0.85" font-family="sans-serif" font-weight="bold">Committee of N models</text>
  <rect x="30" y="44" width="120" height="34" rx="5" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>
  <text x="90" y="66" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8" font-family="sans-serif">ckpt A → building</text>
  <rect x="30" y="88" width="120" height="34" rx="5" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>
  <text x="90" y="110" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8" font-family="sans-serif">ckpt B → building</text>
  <rect x="30" y="132" width="120" height="34" rx="5" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>
  <text x="90" y="154" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8" font-family="sans-serif">ckpt C → greenhouse</text>
  <rect x="30" y="176" width="120" height="34" rx="5" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>
  <text x="90" y="198" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8" font-family="sans-serif">ckpt D → greenhouse</text>
  <!-- Arrows into score box -->
  <line x1="150" y1="61" x2="266" y2="120" stroke="currentColor" stroke-width="1.4" opacity="0.4" marker-end="url(#qbc-arrow)"/>
  <line x1="150" y1="105" x2="266" y2="127" stroke="currentColor" stroke-width="1.4" opacity="0.4" marker-end="url(#qbc-arrow)"/>
  <line x1="150" y1="149" x2="266" y2="134" stroke="currentColor" stroke-width="1.4" opacity="0.4" marker-end="url(#qbc-arrow)"/>
  <line x1="150" y1="193" x2="266" y2="141" stroke="currentColor" stroke-width="1.4" opacity="0.4" marker-end="url(#qbc-arrow)"/>
  <!-- Score box -->
  <rect x="270" y="92" width="160" height="80" rx="7" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-width="1.6" opacity="0.6"/>
  <text x="350" y="118" text-anchor="middle" font-size="12" fill="currentColor" opacity="0.9" font-family="sans-serif" font-weight="bold">Disagreement score</text>
  <text x="350" y="138" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6" font-family="sans-serif">vote entropy H(v)</text>
  <text x="350" y="154" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6" font-family="sans-serif">+ mean KL from consensus</text>
  <!-- Arrow to queue -->
  <line x1="430" y1="132" x2="512" y2="132" stroke="currentColor" stroke-width="1.6" opacity="0.5" marker-end="url(#qbc-arrow)"/>
  <!-- Ranked queue -->
  <text x="620" y="26" text-anchor="middle" font-size="12" fill="currentColor" opacity="0.85" font-family="sans-serif" font-weight="bold">Ranked annotation queue</text>
  <rect x="520" y="44" width="180" height="30" rx="5" fill="currentColor" fill-opacity="0.14" stroke="currentColor" stroke-width="1.5" opacity="0.55"/>
  <text x="610" y="64" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9" font-family="sans-serif">tile 47 — 0.91 (label first)</text>
  <rect x="520" y="80" width="180" height="30" rx="5" fill="currentColor" fill-opacity="0.10" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="610" y="100" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85" font-family="sans-serif">tile 12 — 0.83</text>
  <rect x="520" y="116" width="180" height="30" rx="5" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-width="1.5" opacity="0.45"/>
  <text x="610" y="136" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8" font-family="sans-serif">tile 09 — 0.71</text>
  <rect x="520" y="152" width="180" height="30" rx="5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-dasharray="5 3" opacity="0.4"/>
  <text x="610" y="172" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.55" font-family="sans-serif">tile 48 — 0.90 skipped (adjacent)</text>
  <text x="610" y="200" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.45" font-family="sans-serif">spatial de-duplication drops near-neighbours</text>
</svg>

## Building the Committee

You can form a committee two ways. The first is to snapshot several checkpoints from a single training run — for example the model at epochs 40, 50, 60, and 70, or several runs with different random seeds. The second, cheaper, option is *test-time augmentation*: take one deployed model and run it several times over each tile with different augmentations (horizontal flip, 90° rotation, small brightness jitter), treating each perturbed pass as a voter. Both yield an array of per-tile class probabilities of shape `(n_members, n_classes)`, which is all the scoring code needs.

Install the single dependency:

```bash
pip install numpy==1.26.4
```

## Step-by-Step Implementation

### Step 1 — Represent Committee Predictions Per Tile

Store predictions as a dictionary keyed by tile id, each value an array of shape `(n_members, n_classes)`. In production these come from your inference workers; here a small helper documents the expected shape and validates it.

```python
from __future__ import annotations
import numpy as np

def as_committee_array(member_probs: list[np.ndarray]) -> np.ndarray:
    """
    Stack a list of per-member class-probability vectors into one array.

    Args:
        member_probs: length-N list, each entry shape (n_classes,) and summing to 1.

    Returns:
        Array of shape (n_members, n_classes), dtype float64.
    """
    arr = np.asarray(member_probs, dtype=np.float64)
    if arr.ndim != 2:
        raise ValueError(f"expected (n_members, n_classes), got shape {arr.shape}")
    row_sums = arr.sum(axis=1)
    if not np.allclose(row_sums, 1.0, atol=1e-3):
        raise ValueError("each member row must be a probability distribution summing to 1")
    return arr
```

### Step 2 — Compute Vote Entropy

Vote entropy looks only at each member's hard `argmax` decision, then measures how split those votes are. A unanimous committee scores 0; an evenly split committee scores the maximum. Normalising by `log(n_classes)` puts the result in `[0, 1]`.

```python
def vote_entropy(committee: np.ndarray) -> float:
    """
    Normalised entropy of the hard-vote histogram across committee members.

    Args:
        committee: shape (n_members, n_classes) of class probabilities.

    Returns:
        Float in [0, 1]; higher means the committee's argmax votes are more split.
    """
    n_members, n_classes = committee.shape
    votes = committee.argmax(axis=1)                       # one class index per member
    counts = np.bincount(votes, minlength=n_classes)
    p = counts / n_members                                  # vote distribution
    nz = p[p > 0.0]
    entropy = -np.sum(nz * np.log(nz))
    return float(entropy / np.log(n_classes)) if n_classes > 1 else 0.0
```

### Step 3 — Compute Average KL Divergence from Consensus

Vote entropy ignores confidence: a 51/49 split and a 99/1 split both cast one vote each way. Average KL divergence fixes that by comparing every member's *full* distribution against the committee mean (the consensus). This is the soft-disagreement signal, closely related to the [entropy and margin scores used for segmentation masks](https://www.geospatialannotation.com/active-learning-model-feedback-loops/uncertainty-sampling-for-geospatial-active-learning/entropy-vs-margin-sampling-for-segmentation-masks/), but measured *between* models rather than within one.

```python
def mean_kl_disagreement(committee: np.ndarray, eps: float = 1e-12) -> float:
    """
    Average KL divergence of each member's distribution from the consensus mean.

    Args:
        committee: shape (n_members, n_classes) of class probabilities.
        eps: floor added before logs to avoid divide-by-zero.

    Returns:
        Non-negative float; higher means members' soft predictions diverge more.
        Equals the Jensen-Shannon-style consensus dispersion of the committee.
    """
    p = np.clip(committee, eps, 1.0)
    consensus = p.mean(axis=0, keepdims=True)              # shape (1, n_classes)
    kl_per_member = np.sum(p * (np.log(p) - np.log(consensus)), axis=1)
    return float(kl_per_member.mean())
```

### Step 4 — Combine into One Disagreement Score

Both signals are normalised to `[0, 1]` and blended with a weight `alpha`. Because the KL term is unbounded, it is squashed with a saturating transform first so a single wildly over-confident member cannot dominate the ranking.

```python
def disagreement_score(committee: np.ndarray, alpha: float = 0.5) -> float:
    """
    Blend normalised vote entropy and squashed mean-KL into a single score.

    Args:
        committee: shape (n_members, n_classes).
        alpha: weight on vote entropy; (1 - alpha) weights the KL term.

    Returns:
        Float in [0, 1]; higher tiles are more informative to annotate.
    """
    h_vote = vote_entropy(committee)                        # already in [0, 1]
    kl = mean_kl_disagreement(committee)
    kl_norm = kl / (kl + 1.0)                               # saturating map to [0, 1)
    return float(alpha * h_vote + (1.0 - alpha) * kl_norm)
```

### Step 5 — Batch-Select While De-Duplicating Adjacent Tiles

Ranking alone is not enough — the top of the queue is usually a band of neighbouring tiles that share the same ambiguity. Greedily accept the highest-scoring tiles, but reject any candidate whose tile-grid position lies within `min_gap` cells of an already-selected tile. Tile positions are expressed as integer `(row, col)` grid coordinates, so adjacency is a cheap Chebyshev-distance check.

```python
from dataclasses import dataclass

@dataclass
class TileScore:
    tile_id: str
    score: float
    row: int          # tile-grid row index
    col: int          # tile-grid column index

def select_batch(
    scored: list[TileScore],
    batch_size: int,
    min_gap: int = 2,
) -> list[TileScore]:
    """
    Greedily pick the highest-disagreement tiles, skipping any tile within
    `min_gap` grid cells (Chebyshev distance) of an already-selected tile.

    Args:
        scored: per-tile disagreement scores with grid positions.
        batch_size: number of tiles to send to annotators this round.
        min_gap: minimum grid separation between two selected tiles.

    Returns:
        Up to `batch_size` spatially spread-out TileScore objects, score-descending.
    """
    ranked = sorted(scored, key=lambda t: t.score, reverse=True)
    chosen: list[TileScore] = []
    for cand in ranked:
        too_close = any(
            max(abs(cand.row - c.row), abs(cand.col - c.col)) < min_gap
            for c in chosen
        )
        if too_close:
            continue
        chosen.append(cand)
        if len(chosen) == batch_size:
            break
    return chosen
```

### Step 6 — Wire It Together

The end-to-end pass turns raw committee predictions into an annotation batch:

```python
def prioritize_tiles(
    predictions: dict[str, list[np.ndarray]],
    positions: dict[str, tuple[int, int]],
    batch_size: int = 25,
    alpha: float = 0.5,
    min_gap: int = 2,
) -> list[TileScore]:
    """Score every tile by committee disagreement and return one annotation batch."""
    scored: list[TileScore] = []
    for tile_id, member_probs in predictions.items():
        committee = as_committee_array(member_probs)
        row, col = positions[tile_id]
        scored.append(TileScore(tile_id, disagreement_score(committee, alpha), row, col))
    return select_batch(scored, batch_size, min_gap)
```

## Choosing Thresholds and Weights

Committee disagreement is a *ranking* signal first, but a few cut-offs keep the queue sensible:

- **Committee size N:** 3–5 checkpoints or augmentation passes. Fewer than 3 makes vote entropy too coarse; more than 5 rarely changes the ranking.
- **Score floor for queueing:** skip tiles scoring below ~0.15. Near-zero disagreement means the committee agrees and a label there teaches little.
- **`alpha` (vote-entropy weight):** start at 0.5. Raise toward 0.7 when member probabilities are poorly calibrated so the ranking leans on the calibration-robust vote count; lower toward 0.3 when calibration is trustworthy and you want soft-confidence spread to count more.
- **`min_gap` (spatial exclusion):** 2 grid cells for 256 px tiles at sub-metre resolution; increase to 3–4 for larger scenes where autocorrelation extends further.
- **Batch size:** size it to one annotation shift's throughput so the loop retrains on a full, diverse batch rather than trickling single tiles.

## Common Errors and Fixes

**Every tile scores near the maximum and the ranking is flat**
Cause: the "committee" is N copies of essentially the same model — checkpoints saved a few steps apart, or augmentations too weak to perturb the output.
Fix: widen the committee. Use checkpoints from different seeds or epochs spaced further apart, or stronger augmentations (rotations, brightness shifts) so members make genuinely independent errors.

**The batch is a tight cluster of neighbouring tiles despite `select_batch`**
Cause: `positions` holds pixel or geographic coordinates, not integer tile-grid indices, so the Chebyshev check compares the wrong units and never triggers.
Fix: pass `(row, col)` grid indices; convert real-world coordinates to grid cells by integer-dividing by tile size before building the `positions` dict.

**`mean_kl_disagreement` returns `inf` or `nan`**
Cause: a member emitted a hard 0.0 probability for some class, so `log(0)` appears in the KL sum.
Fix: keep the `eps` clip in place (`np.clip(committee, eps, 1.0)`); it floors probabilities before any logarithm. Verify each member row still sums to ~1 after your inference softmax.

**Disagreement tracks one over-confident model instead of true ambiguity**
Cause: an uncalibrated member outputs near-one-hot vectors, skewing the consensus and inflating KL.
Fix: temperature-scale each member's logits before scoring, or raise `alpha` so the calibration-robust vote-entropy term dominates the blend.

**High-disagreement tiles turn out to be cloud, sensor artefacts, or nodata**
Cause: the committee disagrees because the input is corrupt, not because the class is genuinely ambiguous.
Fix: run a quality mask before scoring and drop tiles exceeding a cloud or nodata fraction, so annotation budget is not spent labeling garbage.

## Related

- [Uncertainty Sampling for Geospatial Active Learning](https://www.geospatialannotation.com/active-learning-model-feedback-loops/uncertainty-sampling-for-geospatial-active-learning/) — the broader topic area covering entropy, margin, and BALD scoring for ranking unlabeled tiles
- [Entropy vs Margin Sampling for Segmentation Masks](https://www.geospatialannotation.com/active-learning-model-feedback-loops/uncertainty-sampling-for-geospatial-active-learning/entropy-vs-margin-sampling-for-segmentation-masks/) — single-model per-pixel uncertainty scoring that pairs naturally with committee disagreement
- [Confidence Scoring for Geospatial Labels](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/confidence-scoring-for-geospatial-labels/) — per-annotation uncertainty values that complement disagreement when triaging a queue
- [Active Learning & Model Feedback Loops for Geospatial Annotation](https://www.geospatialannotation.com/active-learning-model-feedback-loops/) — how tile prioritization feeds retraining triggers and drift detection across the whole loop

This guide covers one selection strategy within [Uncertainty Sampling for Geospatial Active Learning](https://www.geospatialannotation.com/active-learning-model-feedback-loops/uncertainty-sampling-for-geospatial-active-learning/), which is itself part of [Active Learning & Model Feedback Loops for Geospatial Annotation](https://www.geospatialannotation.com/active-learning-model-feedback-loops/).
