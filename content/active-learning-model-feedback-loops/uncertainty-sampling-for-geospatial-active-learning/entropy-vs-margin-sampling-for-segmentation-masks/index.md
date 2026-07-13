---
title: "Entropy vs Margin Sampling for Segmentation Masks"
description: "Compare entropy and margin (least-confidence) uncertainty scoring for per-pixel segmentation masks on aerial imagery, with runnable NumPy code and thresholds for tile prioritization."
slug: "entropy-vs-margin-sampling-for-segmentation-masks"
type: "tutorial"
breadcrumb:
  - label: "Home"
    url: "/"
  - label: "Active Learning & Model Feedback Loops"
    url: "/active-learning-model-feedback-loops/"
  - label: "Uncertainty Sampling for Geospatial Active Learning"
    url: "/active-learning-model-feedback-loops/uncertainty-sampling-for-geospatial-active-learning/"
  - label: "Entropy vs Margin Sampling for Segmentation Masks"
    url: "/active-learning-model-feedback-loops/uncertainty-sampling-for-geospatial-active-learning/entropy-vs-margin-sampling-for-segmentation-masks/"
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
      "headline": "Entropy vs Margin Sampling for Segmentation Masks",
      "description": "Compare entropy and margin (least-confidence) uncertainty scoring for per-pixel segmentation masks on aerial imagery, with runnable NumPy code and thresholds for tile prioritization.",
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
        {"@type": "ListItem", "position": 4, "name": "Entropy vs Margin Sampling for Segmentation Masks", "item": "https://www.geospatialannotation.com/active-learning-model-feedback-loops/uncertainty-sampling-for-geospatial-active-learning/entropy-vs-margin-sampling-for-segmentation-masks/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Scoring segmentation-mask uncertainty with entropy and margin sampling",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Compute per-pixel Shannon entropy", "text": "Normalise the softmax logits across the class axis and evaluate -sum(p * log p) per pixel to obtain a full-distribution uncertainty map suitable for many-class land cover."},
        {"@type": "HowToStep", "position": 2, "name": "Compute per-pixel margin", "text": "Sort the per-pixel class probabilities and take one minus the gap between the top two classes, giving a cheaper, more stable signal for binary or few-class masks."},
        {"@type": "HowToStep", "position": 3, "name": "Aggregate pixels to a tile score with top-k mean", "text": "Average only the top-k percent most uncertain pixels rather than the global mean, so a small uncertain region inside a confident tile is not washed out."},
        {"@type": "HowToStep", "position": 4, "name": "Rank tiles for annotation", "text": "Sort candidate tiles by their aggregated top-k score in descending order and route the highest-scoring tiles to annotators for the next labeling round."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Should I use entropy or margin sampling for a segmentation mask?",
          "acceptedAnswer": {"@type": "Answer", "text": "Use entropy when the mask has many classes, such as multi-class land cover, because entropy integrates over the entire class distribution and captures diffuse three-way or four-way confusion that margin ignores. Use margin (or least-confidence) for binary and few-class masks such as building footprints or water, because it is cheaper to compute, less sensitive to broad spreads of near-zero class probabilities, and produces a more stable ranking when only two classes carry real probability mass."}
        },
        {
          "@type": "Question",
          "name": "Why aggregate segmentation uncertainty with a top-k mean instead of a global mean?",
          "acceptedAnswer": {"@type": "Answer", "text": "A global mean over every pixel dilutes the signal: a tile that is 95 percent confident sky or vegetation with a genuinely ambiguous 5 percent boundary region will score almost zero, so the tiles that most need review never rise to the top of the queue. Averaging only the top-k percent of uncertain pixels isolates the ambiguous region and lets small but informative areas dominate the tile score, which is exactly what an active learning queue should prioritise."}
        },
        {
          "@type": "Question",
          "name": "What top-k percentage works best for tile-level uncertainty aggregation?",
          "acceptedAnswer": {"@type": "Answer", "text": "Start at k = 1 to 5 percent of pixels for sparse targets like vehicles or solar panels, where the object of interest occupies a tiny fraction of the tile, and 10 to 20 percent for area classes like land cover or vegetation, where uncertainty is spread over larger contiguous regions. Tune k on a held-out set by checking that the ranked top tiles visibly contain ambiguous boundaries rather than uniform interior."}
        },
        {
          "@type": "Question",
          "name": "Do entropy and margin need calibrated probabilities to rank tiles correctly?",
          "acceptedAnswer": {"@type": "Answer", "text": "Ranking is more forgiving than absolute thresholds, but uncalibrated, over-confident softmax outputs compress both entropy and margin toward zero and flatten the differences between tiles, which weakens the ranking. Applying temperature scaling before scoring restores the spread between confident and uncertain tiles and makes fixed score thresholds meaningful across acquisition batches."}
        }
      ]
    }
  ]
}
</script>

# Entropy vs Margin Sampling for Segmentation Masks

For per-pixel segmentation masks, the choice between entropy and margin sampling comes down to how many classes carry real probability mass. Entropy uses the full class distribution and is the better signal for many-class land cover masks, where three- and four-way confusion is common and only a full-distribution measure captures it. Margin sampling — and its close relative least-confidence — is cheaper to compute and produces a more stable ranking for binary or few-class masks such as building, water, or road extraction. In both cases the critical move is aggregation: convert the per-pixel uncertainty map to a single tile score using the **mean of the top-k most uncertain pixels**, never the global mean, so a small ambiguous region is not averaged into irrelevance by a large confident background. That tile score is what feeds the ranking that drives your [active learning loop](https://www.geospatialannotation.com/active-learning-model-feedback-loops/).

## Why This Matters in Geospatial Pipelines

Aerial and satellite tiles are dominated by confident background — vegetation, water, bare soil — so a segmentation model is genuinely uncertain over only a thin fraction of each tile, usually class boundaries and rare objects. If you rank tiles by average uncertainty, those informative fractions vanish and annotators are handed confident tiles that teach the model nothing. Choosing the right per-pixel measure and aggregating it with a top-k mean concentrates scarce annotation budget on the tiles whose ambiguous regions will actually move the metric.

## Entropy vs Margin on a Single Pixel

Both measures start from the same input: a per-pixel probability vector over `C` classes, produced by a softmax over the segmentation head's logits. They disagree on what "uncertain" means. Entropy is maximised when probability is spread evenly across *all* classes; margin looks only at the gap between the top two. The SVG below shows the same two softmax vectors scored both ways — a three-way-confused pixel that entropy flags strongly but margin rates as only moderately uncertain.

<svg viewBox="0 0 640 340" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Comparison of entropy and margin scores on two example per-pixel softmax vectors" style="width:100%;max-width:640px;display:block;margin:1.5rem auto;">
  <title>Entropy versus margin on two example softmax vectors</title>
  <desc>Two grouped bar charts of class probabilities. Pixel A has three near-equal classes and one small class, giving high entropy but only moderate margin uncertainty. Pixel B has one dominant class and one runner-up, giving lower entropy but a small top-two gap. Score readouts appear beneath each chart.</desc>
  <!-- Pixel A -->
  <text x="150" y="24" text-anchor="middle" font-size="13" fill="currentColor" opacity="0.9" font-family="sans-serif" font-weight="bold">Pixel A — 3-way confusion</text>
  <line x1="40" y1="170" x2="260" y2="170" stroke="currentColor" stroke-width="1" opacity="0.4"/>
  <rect x="52" y="86" width="34" height="84" fill="currentColor" opacity="0.30"/>
  <rect x="102" y="94" width="34" height="76" fill="currentColor" opacity="0.30"/>
  <rect x="152" y="100" width="34" height="70" fill="currentColor" opacity="0.30"/>
  <rect x="202" y="150" width="34" height="20" fill="currentColor" opacity="0.30"/>
  <text x="69" y="184" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.6" font-family="sans-serif">0.34</text>
  <text x="119" y="184" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.6" font-family="sans-serif">0.31</text>
  <text x="169" y="184" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.6" font-family="sans-serif">0.28</text>
  <text x="219" y="184" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.6" font-family="sans-serif">0.07</text>
  <text x="150" y="210" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85" font-family="sans-serif" font-weight="bold">entropy = 1.09 (high)</text>
  <text x="150" y="228" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.7" font-family="sans-serif">margin = 1 − (0.34−0.31) = 0.97</text>
  <text x="150" y="246" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.5" font-family="sans-serif">both flag it — top two nearly tied</text>
  <!-- Divider -->
  <line x1="320" y1="40" x2="320" y2="300" stroke="currentColor" stroke-width="1" opacity="0.2" stroke-dasharray="4 4"/>
  <!-- Pixel B -->
  <text x="490" y="24" text-anchor="middle" font-size="13" fill="currentColor" opacity="0.9" font-family="sans-serif" font-weight="bold">Pixel B — dominant + runner-up</text>
  <line x1="380" y1="170" x2="600" y2="170" stroke="currentColor" stroke-width="1" opacity="0.4"/>
  <rect x="392" y="60" width="34" height="110" fill="currentColor" opacity="0.30"/>
  <rect x="442" y="112" width="34" height="58" fill="currentColor" opacity="0.30"/>
  <rect x="492" y="158" width="34" height="12" fill="currentColor" opacity="0.30"/>
  <rect x="542" y="160" width="34" height="10" fill="currentColor" opacity="0.30"/>
  <text x="409" y="184" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.6" font-family="sans-serif">0.55</text>
  <text x="459" y="184" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.6" font-family="sans-serif">0.34</text>
  <text x="509" y="184" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.6" font-family="sans-serif">0.07</text>
  <text x="559" y="184" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.6" font-family="sans-serif">0.04</text>
  <text x="490" y="210" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85" font-family="sans-serif" font-weight="bold">entropy = 0.99 (lower)</text>
  <text x="490" y="228" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.7" font-family="sans-serif">margin = 1 − (0.55−0.34) = 0.79</text>
  <text x="490" y="246" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.5" font-family="sans-serif">margin ranks it clearly below A</text>
  <!-- Footer note -->
  <text x="320" y="286" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.55" font-family="sans-serif">Entropy rewards spread across many classes; margin cares only about the top-two gap.</text>
  <text x="320" y="304" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.55" font-family="sans-serif">Both scores rise as the mask becomes more ambiguous; scale each map before aggregating.</text>
</svg>

## Step-by-Step Implementation

Install the two libraries used throughout. Everything below runs on NumPy alone — no model or GPU required — so you can validate the scoring logic on synthetic logits before wiring it to a real segmenter.

```bash
pip install numpy==1.26.4 scipy==1.13.1
```

Assume your model returns raw logits of shape `(C, H, W)` per tile, where `C` is the number of segmentation classes and `H`, `W` are the tile height and width in pixels.

### Step 1 — Softmax and Per-Pixel Entropy

Entropy integrates over the whole class axis, so it is the natural default for multi-class land cover masks. Normalise the logits with a numerically stable softmax first, then evaluate `-sum(p * log p)` along the class axis. Dividing by `log(C)` rescales the map to `[0, 1]`, which makes score thresholds portable across models with different class counts.

```python
from __future__ import annotations
import numpy as np

def softmax(logits: np.ndarray, axis: int = 0) -> np.ndarray:
    """Numerically stable softmax over `axis` of a (C, H, W) logit array."""
    shifted = logits - np.max(logits, axis=axis, keepdims=True)
    exp = np.exp(shifted)
    return exp / np.sum(exp, axis=axis, keepdims=True)

def pixel_entropy(probs: np.ndarray, axis: int = 0) -> np.ndarray:
    """
    Normalised Shannon entropy per pixel.

    Args:
        probs: (C, H, W) class-probability array (sums to 1 over `axis`).
    Returns:
        (H, W) array in [0, 1]; 1.0 means a uniform distribution over all classes.
    """
    eps = 1e-12
    num_classes = probs.shape[axis]
    raw = -np.sum(probs * np.log(probs + eps), axis=axis)
    return raw / np.log(num_classes)
```

### Step 2 — Per-Pixel Margin (and Least-Confidence)

Margin looks only at the top two classes, so it is cheaper and far more stable for binary or few-class masks where a broad spread of near-zero probabilities would otherwise perturb entropy. Sort the probabilities descending along the class axis and take `1 - (p_top1 - p_top2)`; a value near 1.0 means the two leading classes are nearly tied. The same helper returns least-confidence (`1 - p_top1`) for callers that prefer it.

```python
from __future__ import annotations
import numpy as np

def pixel_margin(probs: np.ndarray, axis: int = 0) -> np.ndarray:
    """
    Per-pixel margin uncertainty: 1 - (top1 - top2) probability gap.

    Args:
        probs: (C, H, W) class-probability array.
    Returns:
        (H, W) array in [0, 1]; higher means the top two classes are closer.
    """
    top2 = np.sort(probs, axis=axis)[-2:, ...]   # ascending -> last two are top2, top1
    gap = top2[-1] - top2[-2]
    return 1.0 - gap

def pixel_least_confidence(probs: np.ndarray, axis: int = 0) -> np.ndarray:
    """Per-pixel least-confidence uncertainty: 1 - max class probability."""
    return 1.0 - np.max(probs, axis=axis)
```

### Step 3 — Aggregate to a Tile Score with a Top-k Mean

This is the step that makes or breaks geospatial uncertainty sampling. Flatten the per-pixel map, take the highest-scoring `k` percent of pixels, and average only those. A background-dominated tile with a genuinely ambiguous boundary now scores on the strength of that boundary instead of being diluted to near zero by a confident interior. Keep `k` small for sparse targets and larger for area classes; the table in the next section gives starting values.

```python
from __future__ import annotations
import numpy as np

def topk_mean(uncertainty_map: np.ndarray, k_percent: float = 5.0) -> float:
    """
    Aggregate a (H, W) per-pixel uncertainty map into one tile score.

    Averages only the top `k_percent` most uncertain pixels so small
    ambiguous regions are not washed out by a confident background.

    Args:
        uncertainty_map: (H, W) array of per-pixel scores in [0, 1].
        k_percent: fraction of pixels to keep, e.g. 5.0 for the top 5%.
    Returns:
        Scalar tile score in [0, 1].
    """
    flat = uncertainty_map.reshape(-1)
    n_keep = max(1, int(round(flat.size * k_percent / 100.0)))
    # np.partition puts the n_keep largest values at the end, unsorted (O(n)).
    top_values = np.partition(flat, flat.size - n_keep)[-n_keep:]
    return float(np.mean(top_values))
```

### Step 4 — Rank Candidate Tiles for the Next Labeling Round

Score every unlabeled tile, then sort descending. The scorer is selectable so you can run entropy for a land-cover model and margin for a binary extractor without changing the ranking code. The output is a queue of tile IDs handed to annotators — the highest-uncertainty tiles first.

```python
from __future__ import annotations
import numpy as np
from typing import Callable

Scorer = Callable[[np.ndarray], np.ndarray]  # (C,H,W) probs -> (H,W) uncertainty

def rank_tiles(
    tile_logits: dict[str, np.ndarray],
    scorer: Scorer = pixel_entropy,
    k_percent: float = 5.0,
) -> list[tuple[str, float]]:
    """
    Rank tiles by aggregated top-k uncertainty, highest first.

    Args:
        tile_logits: mapping of tile_id -> (C, H, W) raw logits.
        scorer: pixel_entropy (many-class) or pixel_margin (few-class).
        k_percent: top-k percentage passed to topk_mean.
    Returns:
        List of (tile_id, score) sorted by descending score.
    """
    scored: list[tuple[str, float]] = []
    for tile_id, logits in tile_logits.items():
        probs = softmax(logits, axis=0)
        umap = scorer(probs)
        scored.append((tile_id, topk_mean(umap, k_percent)))
    scored.sort(key=lambda item: item[1], reverse=True)
    return scored

# --- self-contained demo on synthetic logits ---
if __name__ == "__main__":
    rng = np.random.default_rng(42)
    tiles: dict[str, np.ndarray] = {
        "tile_confident":  rng.normal(0, 1, (4, 64, 64)) + np.array([6, 0, 0, 0])[:, None, None],
        "tile_ambiguous":  rng.normal(0, 1, (4, 64, 64)),  # near-uniform logits
    }
    for tid, score in rank_tiles(tiles, scorer=pixel_entropy, k_percent=5.0):
        print(f"{tid:16s} entropy_top5 = {score:.3f}")
```

## Parameters and Score Ranges

The two measures live on different numeric scales even after normalisation, so pick thresholds per measure and per target type rather than reusing one global cutoff. Because these scores drive annotation priority the same way [confidence scores](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/confidence-scoring-for-geospatial-labels/) drive review triage, keep them calibrated: over-confident softmax output compresses both measures toward zero and flattens the ranking.

| Parameter | Entropy | Margin / least-confidence | Notes |
|---|---|---|---|
| Per-pixel range (normalised) | 0.0 – 1.0 | 0.0 – 1.0 | 1.0 = maximally uncertain pixel |
| Best fit | Many-class land cover | Binary / few-class masks | Match the measure to class count |
| Cost per tile | Higher (full `C` sum) | Lower (top-2 sort) | Margin scales better on large tiles |
| Top-k for sparse targets | k = 1 – 5% | k = 1 – 5% | Vehicles, panels, small buildings |
| Top-k for area classes | k = 10 – 20% | k = 10 – 20% | Vegetation, water, land cover |
| "Send to annotator" tile score | ≳ 0.55 | ≳ 0.45 | Tune on a held-out set per model |
| Stability under noisy tails | Sensitive | Robust | Heavy probability tails perturb entropy more |

Treat the "send to annotator" rows as ranking anchors, not hard gates — in most loops you take a fixed batch size off the top of the ranked queue each round rather than everything above a score. When ambiguity clusters spatially, deduplicate the batch so you are not labeling ten adjacent tiles of the same confused field; that is the subject of [prioritizing tiles by model disagreement](https://www.geospatialannotation.com/active-learning-model-feedback-loops/uncertainty-sampling-for-geospatial-active-learning/prioritizing-tiles-by-model-disagreement/).

## Common Errors and Fixes

**Every tile scores near zero and the ranking looks random.**
Root cause: you aggregated with a global `mean()` over all pixels, so confident background dominated and drowned the small uncertain regions.
Fix: aggregate with `topk_mean()` and start at `k_percent = 5`; the informative fraction of a geospatial tile is small by nature.

**`entropy` returns `nan` for some pixels.**
Root cause: `log(0)` where a class probability underflowed to exactly zero after softmax.
Fix: add a small epsilon inside the log (`np.log(probs + 1e-12)`) as shown, and confirm the softmax was applied before scoring.

**Margin scores are stuck at a constant value across every tile.**
Root cause: you passed raw logits instead of probabilities, so the top-two gap is on an unbounded scale and the `1 - gap` result saturates or goes negative.
Fix: always run `softmax()` first; margin and entropy are defined on the probability simplex, not on logits.

**Entropy and margin disagree wildly on which tiles to label.**
Root cause: the mask has many classes with a heavy tail of tiny probabilities; entropy responds to that spread while margin ignores it.
Fix: this is expected — pick the measure that matches your class count (entropy for many-class, margin for few-class) rather than averaging the two rankings.

**The queue keeps surfacing the same over-confident tiles as "certain" that annotators find obviously wrong.**
Root cause: uncalibrated logits make the model over-confident, compressing uncertainty toward zero.
Fix: apply temperature scaling to the logits before `softmax()` so the score spread between tiles is restored.

## Related

- [Uncertainty Sampling for Geospatial Active Learning](https://www.geospatialannotation.com/active-learning-model-feedback-loops/uncertainty-sampling-for-geospatial-active-learning/) — the topic area this guide belongs to, covering entropy, margin, and BALD scoring across detectors and segmenters
- [Prioritizing Annotation Tiles by Model Disagreement](https://www.geospatialannotation.com/active-learning-model-feedback-loops/uncertainty-sampling-for-geospatial-active-learning/prioritizing-tiles-by-model-disagreement/) — query-by-committee vote entropy and batch selection that removes the spatial redundancy this ranking alone does not handle
- [Confidence Scoring for Geospatial Labels](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/confidence-scoring-for-geospatial-labels/) — how per-annotation confidence is defined and calibrated so uncertainty scores stay comparable across batches
- [Active Learning & Model Feedback Loops for Geospatial Annotation](https://www.geospatialannotation.com/active-learning-model-feedback-loops/) — the broader feedback-loop architecture these tile scores feed into

This guide is one specialised technique within [Uncertainty Sampling for Geospatial Active Learning](https://www.geospatialannotation.com/active-learning-model-feedback-loops/uncertainty-sampling-for-geospatial-active-learning/), which is itself part of [Active Learning & Model Feedback Loops for Geospatial Annotation](https://www.geospatialannotation.com/active-learning-model-feedback-loops/).
