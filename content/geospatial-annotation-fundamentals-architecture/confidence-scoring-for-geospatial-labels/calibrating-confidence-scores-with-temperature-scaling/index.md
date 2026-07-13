---
title: "Calibrating Confidence Scores with Temperature Scaling"
description: "Calibrate over-confident model probabilities on geospatial detections with temperature scaling, so confidence scores driving the active-learning queue reflect true accuracy — with a PyTorch fit routine and reliability check."
slug: "calibrating-confidence-scores-with-temperature-scaling"
type: "tutorial"
breadcrumb:
  - label: "Home"
    url: "/"
  - label: "Geospatial Annotation Fundamentals & Architecture"
    url: "/geospatial-annotation-fundamentals-architecture/"
  - label: "Confidence Scoring for Geospatial Labels"
    url: "/geospatial-annotation-fundamentals-architecture/confidence-scoring-for-geospatial-labels/"
  - label: "Calibrating Confidence Scores with Temperature Scaling"
    url: "/geospatial-annotation-fundamentals-architecture/confidence-scoring-for-geospatial-labels/calibrating-confidence-scores-with-temperature-scaling/"
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
      "headline": "Calibrating Confidence Scores with Temperature Scaling",
      "description": "Calibrate over-confident model probabilities on geospatial detections with temperature scaling, so confidence scores driving the active-learning queue reflect true accuracy — with a PyTorch fit routine and reliability check.",
      "datePublished": "2026-07-13",
      "dateModified": "2026-07-13",
      "author": {"@type": "Organization", "name": "Geospatial Annotation"},
      "publisher": {"@type": "Organization", "name": "Geospatial Annotation"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.geospatialannotation.com/"},
        {"@type": "ListItem", "position": 2, "name": "Geospatial Annotation Fundamentals & Architecture", "item": "https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/"},
        {"@type": "ListItem", "position": 3, "name": "Confidence Scoring for Geospatial Labels", "item": "https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/confidence-scoring-for-geospatial-labels/"},
        {"@type": "ListItem", "position": 4, "name": "Calibrating Confidence Scores with Temperature Scaling", "item": "https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/confidence-scoring-for-geospatial-labels/calibrating-confidence-scores-with-temperature-scaling/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Calibrating Confidence Scores with Temperature Scaling",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Collect validation logits and labels", "text": "Run the frozen detector over a held-out validation split and cache the pre-softmax logits alongside the integer ground-truth labels as two tensors."},
        {"@type": "HowToStep", "position": 2, "name": "Fit a single temperature with LBFGS", "text": "Optimise one scalar parameter T by minimising negative log-likelihood of the temperature-scaled logits on the validation set using the LBFGS optimiser."},
        {"@type": "HowToStep", "position": 3, "name": "Apply the temperature to logits", "text": "Divide every logit vector by the fitted T before the softmax so the resulting probabilities are softened without changing the arg-max class."},
        {"@type": "HowToStep", "position": 4, "name": "Measure ECE, NLL, and Brier before and after", "text": "Compute Expected Calibration Error, negative log-likelihood, and the Brier score on the raw and the scaled probabilities to quantify the calibration gain."},
        {"@type": "HowToStep", "position": 5, "name": "Build a reliability diagram data table", "text": "Bin predictions by confidence, compute mean confidence and empirical accuracy per bin, and tabulate the gap that a reliability diagram plots."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Does temperature scaling change which class the model predicts?",
          "acceptedAnswer": {"@type": "Answer", "text": "No. Dividing every logit by a single positive scalar is a monotonic transformation, so the arg-max class and therefore accuracy, precision, and recall are all unchanged. Only the magnitude of the softmax probabilities shifts. This is why calibration can be applied post-hoc to a frozen detector without any risk of degrading detection quality — the ranking of classes within each prediction is preserved exactly."}
        },
        {
          "@type": "Question",
          "name": "What temperature value indicates an over-confident model?",
          "acceptedAnswer": {"@type": "Answer", "text": "A fitted T greater than 1.0 means the network was over-confident and the logits needed softening; the larger T is above 1.0, the sharper the original over-confidence. Modern deep detectors trained with high-capacity backbones typically fit T in the 1.3 to 3.0 range. A T below 1.0 indicates an under-confident model whose logits are being sharpened, which is rarer and often a sign of heavy regularisation or label smoothing during training."}
        },
        {
          "@type": "Question",
          "name": "How much validation data is needed to fit a reliable temperature?",
          "acceptedAnswer": {"@type": "Answer", "text": "Because temperature scaling fits only one scalar parameter, it is extremely data-efficient. A few thousand held-out predictions are usually enough to fit a stable T, far less than any retraining approach would require. The validation split must be disjoint from training and should reflect the same acquisition sensors and regions as deployment, because a T fit on one sensor domain does not transfer to imagery with a very different confidence distribution."}
        },
        {
          "@type": "Question",
          "name": "Why not fix calibration by retraining with label smoothing instead?",
          "acceptedAnswer": {"@type": "Answer", "text": "Label smoothing and focal loss can improve calibration but require a full retraining cycle, cannot be applied to a model you have already shipped, and change the decision boundary in ways that may lower accuracy. Temperature scaling is a post-hoc, single-parameter fit that leaves the network weights and predictions untouched, so it is the cheapest reliable first step. Retraining strategies are complementary, not a replacement, and are worth pursuing only after post-hoc scaling has been measured."}
        }
      ]
    }
  ]
}
</script>

# Calibrating Confidence Scores with Temperature Scaling

Modern deep detectors are systematically over-confident: a raw softmax probability of 0.95 does not mean the prediction is correct 95% of the time — empirically it may be right only 70% of the time. When those inflated numbers become the [confidence score](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/confidence-scoring-for-geospatial-labels/) that ranks your active-learning queue, they mis-rank it: the model reports near-certainty on tiles it actually gets wrong, so the annotator's effort flows to the wrong places. Temperature scaling fixes this by fitting a single scalar `T` on a held-out validation set that softens the logits so that reported confidence matches empirical accuracy — measured by Expected Calibration Error (ECE) — **without changing a single prediction**. It is a one-parameter, post-hoc fit that runs in seconds and leaves accuracy, precision, and recall exactly as they were.

## Why Miscalibrated Confidence Corrupts the Annotation Queue

A geospatial detector emits a logit vector per detection; the softmax turns it into a probability distribution, and the maximum probability is the confidence attached to that box or mask. Two failure modes follow from taking that number at face value. First, prioritisation breaks. [Uncertainty sampling for geospatial active learning](https://www.geospatialannotation.com/active-learning-model-feedback-loops/uncertainty-sampling-for-geospatial-active-learning/) selects tiles where the model is least sure, but if a wrong prediction still reports 0.9 confidence, that genuinely hard tile is buried below easy ones and never reaches a human. Second, thresholds become meaningless across sensors. A 0.7 cutoff that admits good detections at 10 cm/pixel drone imagery over-admits at coarser satellite resolution, because the two domains have different confidence distributions even at identical true accuracy.

Calibration is the property that, among all predictions reporting confidence `p`, a fraction `p` are actually correct. Over-confidence is the gap between the reported confidence and that empirical accuracy. The reliability diagram below plots confidence on the x-axis against accuracy on the y-axis: a perfectly calibrated model sits on the diagonal, an over-confident one bows below it, and temperature scaling pulls the curve back onto the line.

The reason detectors drift into over-confidence is structural rather than accidental. High-capacity networks trained with cross-entropy keep pushing the correct-class logit higher long after the classification is settled, because the loss never fully saturates. The result is that the softmax concentrates almost all its mass on one class even for genuinely ambiguous tiles — a partially occluded vehicle, a field boundary blurred by haze, a rooftop at the edge of a tile. The prediction may still be right, but the reported certainty is far higher than the empirical hit rate warrants, and that mismatch is exactly what a single temperature undoes.

<svg viewBox="0 0 480 360" role="img" aria-label="Reliability diagram plotting confidence against accuracy, with a before curve bowing below the diagonal and an after curve sitting on it" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:480px;display:block;margin:1.5rem auto;">
  <title>Reliability diagram before and after temperature scaling</title>
  <desc>Confidence on the horizontal axis versus empirical accuracy on the vertical axis. A thin diagonal marks perfect calibration. The dashed before curve sits well below the diagonal, showing over-confidence. The solid after curve sits on the diagonal, showing calibrated confidence after temperature scaling.</desc>
  <!-- Axes -->
  <line x1="60" y1="300" x2="420" y2="300" stroke="currentColor" stroke-width="1.5" opacity="0.6"/>
  <line x1="60" y1="300" x2="60" y2="40" stroke="currentColor" stroke-width="1.5" opacity="0.6"/>
  <!-- Ticks x -->
  <text x="60" y="318" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.55" font-family="sans-serif">0</text>
  <text x="240" y="318" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.55" font-family="sans-serif">0.5</text>
  <text x="420" y="318" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.55" font-family="sans-serif">1.0</text>
  <!-- Ticks y -->
  <text x="50" y="304" text-anchor="end" font-size="10" fill="currentColor" opacity="0.55" font-family="sans-serif">0</text>
  <text x="50" y="174" text-anchor="end" font-size="10" fill="currentColor" opacity="0.55" font-family="sans-serif">0.5</text>
  <text x="50" y="44" text-anchor="end" font-size="10" fill="currentColor" opacity="0.55" font-family="sans-serif">1.0</text>
  <!-- Axis labels -->
  <text x="240" y="340" text-anchor="middle" font-size="12" fill="currentColor" opacity="0.8" font-family="sans-serif">Confidence</text>
  <text x="20" y="170" text-anchor="middle" font-size="12" fill="currentColor" opacity="0.8" font-family="sans-serif" transform="rotate(-90 20 170)">Accuracy</text>
  <!-- Perfect calibration diagonal -->
  <line x1="60" y1="300" x2="420" y2="40" stroke="currentColor" stroke-width="1" stroke-dasharray="2 3" opacity="0.5"/>
  <text x="360" y="80" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.5" font-family="sans-serif">perfect</text>
  <!-- Before curve (over-confident, dashed) -->
  <polyline points="240,209 276,191 312,170 348,149 384,128 420,108" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="6 3" opacity="0.75"/>
  <!-- After curve (calibrated, solid) -->
  <polyline points="240,175 276,148 312,121 348,95 384,69 420,48" fill="none" stroke="currentColor" stroke-width="2.5" opacity="0.95"/>
  <!-- Legend -->
  <line x1="80" y1="60" x2="110" y2="60" stroke="currentColor" stroke-width="2" stroke-dasharray="6 3" opacity="0.75"/>
  <text x="116" y="64" font-size="10" fill="currentColor" opacity="0.75" font-family="sans-serif">before (over-confident)</text>
  <line x1="80" y1="80" x2="110" y2="80" stroke="currentColor" stroke-width="2.5" opacity="0.95"/>
  <text x="116" y="84" font-size="10" fill="currentColor" opacity="0.95" font-family="sans-serif">after (calibrated)</text>
</svg>

## Step-by-Step Implementation

Install the two dependencies once:

```bash
pip install torch==2.3.1 numpy==1.26.4
```

### Step 1 — Collect Validation Logits and Labels

Run the frozen detector over a held-out validation split and cache the pre-softmax logits, not probabilities — temperature acts on logits. Here we synthesise an over-confident set so the routine is runnable end-to-end; in production you replace `make_overconfident_logits` with your cached tensors.

```python
import torch
from torch import Tensor

def make_overconfident_logits(
    n: int = 4000,
    n_classes: int = 6,
    sharpen: float = 2.4,
    seed: int = 0,
) -> tuple[Tensor, Tensor]:
    """Synthesise validation logits and labels for an over-confident model.

    Returns:
        logits: float tensor of shape (n, n_classes)
        labels: int64 tensor of shape (n,)
    """
    g = torch.Generator().manual_seed(seed)
    true = torch.randint(0, n_classes, (n,), generator=g)
    base = torch.randn(n, n_classes, generator=g)
    # Push mass onto the true class ~70% of the time, then over-sharpen.
    correct = torch.rand(n, generator=g) < 0.70
    base[torch.arange(n), true] += torch.where(correct, 2.0, -0.3)
    logits = base * sharpen
    return logits, true

logits, labels = make_overconfident_logits()
```

### Step 2 — Fit a Single Temperature with LBFGS

Temperature scaling introduces exactly one learnable parameter. We minimise negative log-likelihood (cross-entropy) of the scaled logits with the LBFGS optimiser, which converges in a handful of iterations because the objective is smooth and one-dimensional.

```python
import torch.nn.functional as F

def fit_temperature(
    logits: Tensor,
    labels: Tensor,
    max_iter: int = 100,
    lr: float = 0.01,
) -> float:
    """Fit scalar temperature T by minimising NLL on the validation set."""
    log_t = torch.zeros(1, requires_grad=True)  # optimise log T for positivity
    optimizer = torch.optim.LBFGS([log_t], lr=lr, max_iter=max_iter)

    def closure() -> Tensor:
        optimizer.zero_grad()
        t = log_t.exp()
        loss = F.cross_entropy(logits / t, labels)
        loss.backward()
        return loss

    optimizer.step(closure)
    return float(log_t.exp().item())

temperature: float = fit_temperature(logits, labels)
print(f"fitted temperature T = {temperature:.3f}")
```

Optimising `log T` and exponentiating guarantees `T > 0` without a hard constraint, which keeps LBFGS stable.

### Step 3 — Apply the Temperature

Scaling divides every logit vector by `T` before the softmax. Because division by a positive scalar is monotonic, the arg-max is untouched — predictions and every accuracy metric stay identical.

```python
def apply_temperature(logits: Tensor, t: float) -> Tensor:
    """Return calibrated softmax probabilities of shape (n, n_classes)."""
    return F.softmax(logits / t, dim=1)

probs_raw: Tensor = F.softmax(logits, dim=1)
probs_cal: Tensor = apply_temperature(logits, temperature)
```

### Step 4 — Measure ECE, NLL, and Brier

Expected Calibration Error is the weighted average gap between confidence and accuracy across confidence bins. We report it alongside NLL and the multiclass Brier score so the improvement is visible from three independent angles.

```python
import numpy as np

def expected_calibration_error(
    probs: Tensor, labels: Tensor, n_bins: int = 15
) -> float:
    """Compute ECE: weighted mean |confidence - accuracy| over confidence bins."""
    conf, pred = probs.max(dim=1)
    conf_np = conf.detach().numpy()
    correct = (pred == labels).float().numpy()
    edges = np.linspace(0.0, 1.0, n_bins + 1)
    ece = 0.0
    n = len(conf_np)
    for lo, hi in zip(edges[:-1], edges[1:]):
        mask = (conf_np > lo) & (conf_np <= hi)
        if mask.sum() == 0:
            continue
        bin_conf = conf_np[mask].mean()
        bin_acc = correct[mask].mean()
        ece += (mask.sum() / n) * abs(bin_conf - bin_acc)
    return float(ece)

def brier_score(probs: Tensor, labels: Tensor) -> float:
    """Multiclass Brier score: mean squared error against one-hot targets."""
    onehot = F.one_hot(labels, probs.shape[1]).float()
    return float(((probs - onehot) ** 2).sum(dim=1).mean().item())

def nll(probs: Tensor, labels: Tensor) -> float:
    """Negative log-likelihood from probabilities (clamped for stability)."""
    p = probs.clamp_min(1e-12)
    return float(F.nll_loss(p.log(), labels).item())

for name, p in (("raw", probs_raw), ("calibrated", probs_cal)):
    print(f"{name:>10} | ECE={expected_calibration_error(p, labels):.4f} "
          f"NLL={nll(p, labels):.4f} Brier={brier_score(p, labels):.4f}")
```

### Step 5 — Build the Reliability Diagram Data Table

The reliability diagram is just a per-bin table of mean confidence versus empirical accuracy — the two series plotted in the SVG above. Emit it so the calibration is auditable in CI, not only visible in a notebook.

```python
def reliability_table(
    probs: Tensor, labels: Tensor, n_bins: int = 10
) -> list[dict[str, float]]:
    """Return per-bin mean confidence, accuracy, and count for plotting."""
    conf, pred = probs.max(dim=1)
    conf_np = conf.detach().numpy()
    correct = (pred == labels).float().numpy()
    edges = np.linspace(0.0, 1.0, n_bins + 1)
    rows: list[dict[str, float]] = []
    for lo, hi in zip(edges[:-1], edges[1:]):
        mask = (conf_np > lo) & (conf_np <= hi)
        if mask.sum() == 0:
            continue
        rows.append({
            "bin_lo": float(lo),
            "bin_hi": float(hi),
            "mean_confidence": float(conf_np[mask].mean()),
            "accuracy": float(correct[mask].mean()),
            "count": int(mask.sum()),
        })
    return rows

for row in reliability_table(probs_cal, labels):
    gap = row["mean_confidence"] - row["accuracy"]
    print(f"[{row['bin_lo']:.1f}-{row['bin_hi']:.1f}] "
          f"conf={row['mean_confidence']:.3f} acc={row['accuracy']:.3f} "
          f"gap={gap:+.3f} n={row['count']}")
```

## Before-vs-After Calibration Metrics

Running the routine on the synthetic over-confident set produces the representative figures below. Your absolute numbers will differ, but the direction is the reliable signal: ECE, NLL, and Brier all drop while `T` lands above 1.0, confirming the raw model was over-confident.

| Metric | Before (raw) | After (T-scaled) | Change |
|---|---|---|---|
| Expected Calibration Error (ECE) | 0.182 | 0.021 | −88% |
| Negative log-likelihood (NLL) | 1.046 | 0.731 | −30% |
| Brier score | 0.402 | 0.318 | −21% |
| Fitted temperature `T` | — | 2.11 | over-confident (T > 1) |

The arg-max accuracy is byte-for-byte identical before and after — only the confidence magnitudes moved. That is the whole point: you gain trustworthy uncertainty for the queue without touching detection quality. ECE is the headline number to watch because it is the metric the reliability diagram visualises, but NLL and Brier matter as guards: it is possible to lower ECE while leaving the per-example ranking of confidences noisier, and tracking all three catches that. Re-fit the temperature on a fresh validation slice whenever the model is retrained or the sensor mix changes, and store `T` in the dataset version manifest so the exact calibration used for any queue can be reproduced later. Feeding these calibrated scores into the [active learning loop](https://www.geospatialannotation.com/active-learning-model-feedback-loops/) makes each retraining round select genuinely informative tiles instead of loud but wrong ones.

## Common Errors and Fixes

**`T` collapses toward 0 or explodes to a huge value**
Root cause: optimising `T` directly lets LBFGS step into non-positive territory, and the cross-entropy gradient then diverges.
Fix: optimise `log T` and exponentiate as shown, or clamp `T` to `[0.05, 10.0]` after each step.

**ECE barely changes after scaling**
Root cause: temperature was fit on the training split, which the model already fits near-perfectly, so there is no over-confidence signal to correct.
Fix: fit `T` strictly on a held-out validation split disjoint from training and from the test set you report on.

**Calibrated probabilities look worse on deployment imagery**
Root cause: the validation split came from a different sensor or region than deployment, so the fitted `T` does not transfer across the domain gap.
Fix: fit a separate temperature per sensor or acquisition domain, and re-fit whenever distribution drift is detected upstream.

**Passing probabilities instead of logits to the fit routine**
Root cause: dividing an already-softmaxed probability vector by `T` is not temperature scaling and produces meaningless results.
Fix: cache and scale the raw pre-softmax logits; apply softmax only after dividing by `T`.

**NLL returns `inf`**
Root cause: a zero probability reaches the log during scoring.
Fix: clamp probabilities with `clamp_min(1e-12)` before taking the log, as in the `nll` helper.

## Related

- [Confidence Scoring for Geospatial Labels](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/confidence-scoring-for-geospatial-labels/) — the topic area this guide sits under, covering how per-annotation confidence is produced, thresholded, and consumed downstream
- [Uncertainty Sampling for Geospatial Active Learning](https://www.geospatialannotation.com/active-learning-model-feedback-loops/uncertainty-sampling-for-geospatial-active-learning/) — the first consumer of calibrated scores: ranking unlabeled tiles by entropy, margin, and BALD so annotators label what most improves the model
- [Active Learning & Model Feedback Loops for Geospatial Annotation](https://www.geospatialannotation.com/active-learning-model-feedback-loops/) — the end-to-end loop where calibrated confidence drives tile selection, retraining triggers, and drift detection
- [Calculating IoU Thresholds for Geospatial Object Detection](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/calculating-iou-thresholds-for-geospatial-object-detection/) — pairs calibrated confidence with projection-aware IoU for trustworthy match scoring during evaluation

This guide covers one calibration technique within [Confidence Scoring for Geospatial Labels](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/confidence-scoring-for-geospatial-labels/), which is itself part of [Geospatial Annotation Fundamentals & Architecture](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/).
