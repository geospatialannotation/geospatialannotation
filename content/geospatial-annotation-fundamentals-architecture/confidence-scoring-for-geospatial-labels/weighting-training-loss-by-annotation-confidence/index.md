---
title: "Weighting Training Loss by Annotation Confidence"
description: "Turn per-label confidence into a per-sample loss weight in PyTorch — the mapping that avoids collapsing gradients, the floor that keeps hard examples alive, and the ablation that proves it helped."
slug: "weighting-training-loss-by-annotation-confidence"
type: "tutorial"
breadcrumb:
  - label: "Home"
    url: "/"
  - label: "Geospatial Annotation Fundamentals & Architecture"
    url: "/geospatial-annotation-fundamentals-architecture/"
  - label: "Confidence Scoring for Geospatial Labels"
    url: "/geospatial-annotation-fundamentals-architecture/confidence-scoring-for-geospatial-labels/"
  - label: "Weighting Training Loss by Annotation Confidence"
    url: "/geospatial-annotation-fundamentals-architecture/confidence-scoring-for-geospatial-labels/weighting-training-loss-by-annotation-confidence/"
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
      "headline": "Weighting Training Loss by Annotation Confidence",
      "description": "Turn per-label confidence into a per-sample loss weight in PyTorch — the mapping that avoids collapsing gradients, the floor that keeps hard examples alive, and the ablation that proves it helped.",
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
        {"@type": "ListItem", "position": 3, "name": "Confidence Scoring for Geospatial Labels", "item": "https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/confidence-scoring-for-geospatial-labels/"},
        {"@type": "ListItem", "position": 4, "name": "Weighting Training Loss by Annotation Confidence", "item": "https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/confidence-scoring-for-geospatial-labels/weighting-training-loss-by-annotation-confidence/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Weight a training loss by per-annotation confidence",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Carry confidence into the dataset", "text": "Attach the per-feature confidence score to each sample the loader returns, so the training step has it without a second lookup."},
        {"@type": "HowToStep", "position": 2, "name": "Map confidence to a weight with a floor", "text": "Use a linear map from a minimum confidence to one, clamped to a floor above zero, so low-confidence samples are quietened rather than silently deleted."},
        {"@type": "HowToStep", "position": 3, "name": "Apply the weight per sample, not per batch", "text": "Compute an unreduced loss, multiply by the weight vector, then normalise by the sum of weights so the effective learning rate does not drift with batch composition."},
        {"@type": "HowToStep", "position": 4, "name": "Rasterise weights for segmentation", "text": "For mask tasks, burn each feature's weight into a per-pixel weight map so a confident building beside an uncertain one is treated correctly."},
        {"@type": "HowToStep", "position": 5, "name": "Ablate before believing it", "text": "Train an unweighted control on the same split and compare on the same frozen evaluation set, because loss weighting is easy to adopt and hard to justify afterwards."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why not just drop the low-confidence annotations?",
          "acceptedAnswer": {"@type": "Answer", "text": "Because low confidence usually marks genuinely hard examples — the occluded vehicle, the shadowed roof, the field boundary under haze — and those are exactly the samples the model most needs. Dropping them trains a model that is excellent on easy ground and unusable where it matters. Weighting keeps the signal while limiting the damage a wrong label can do."}
        },
        {
          "@type": "Question",
          "name": "Should the weight go to zero for the worst annotations?",
          "acceptedAnswer": {"@type": "Answer", "text": "No. A zero weight is deletion with extra steps, and it makes batch statistics jump around as the number of contributing samples changes. Use a floor — 0.2 is a reasonable starting point — so the sample still contributes and the effective batch size stays stable."}
        },
        {
          "@type": "Question",
          "name": "Does loss weighting interact with class weighting?",
          "acceptedAnswer": {"@type": "Answer", "text": "They multiply, and that is usually fine, but watch the product. A rare class whose annotations are also uncertain gets both a large class weight and a small confidence weight, and the two can cancel. Log the mean effective weight per class for one epoch before trusting the combination."}
        },
        {
          "@type": "Question",
          "name": "How do I know the weighting helped?",
          "acceptedAnswer": {"@type": "Answer", "text": "Train the same architecture on the same split with weights all equal to one, and compare both on the frozen evaluation set. Loss weighting typically buys a point or two of IoU on the classes with noisy labels and nothing elsewhere, which is a small enough effect that it needs a control rather than an impression."}
        }
      ]
    }
  ]
}
</script>

# Weighting Training Loss by Annotation Confidence

A per-annotation [confidence score](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/confidence-scoring-for-geospatial-labels/) is only worth computing if something consumes it. Routing low-confidence labels to review is one consumer; the other is the training loss, where a confidence of 0.55 becomes a smaller gradient than a confidence of 0.95. The implementation is a few lines, and all of the difficulty is in three choices: the mapping from confidence to weight, the floor that stops the mapping becoming deletion, and the normalisation that keeps the effective learning rate steady as batch composition changes. This guide covers all three, the segmentation variant that needs a per-pixel weight map, and the ablation that says whether any of it helped.

## Why This Matters in Geospatial Pipelines

Geospatial labels are noisy in a structured way. The uncertain ones cluster: shadowed valleys, haze, class boundaries that the taxonomy never resolved, tiles annotated in the first week before the guide settled. Training as though every label is equally true lets those regions pull the model as hard as clean ground, and because the noise is spatially clustered rather than random, it does not average out.

The naive fix — delete anything below a threshold — is worse. Low confidence marks hard examples, and a model trained only on easy ones is confidently wrong exactly where a human would have hesitated.

<svg viewBox="0 0 720 280" role="img" aria-label="Three ways of handling low-confidence annotations and what each does to the training signal" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>Ignore, delete, or quieten</title>
  <desc>Treating every label as equally true lets noisy regions pull as hard as clean ground. Deleting everything below a threshold removes the hard examples the model most needs and leaves it confident and wrong on them. Weighting keeps every sample in the batch while scaling its gradient by how much the label can be trusted.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <!-- Ignore -->
  <text x="130" y="40" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">ignore confidence</text>
  <rect x="30" y="56" width="200" height="90" rx="6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="5 3"/>
  <g fill="currentColor" opacity="0.45">
    <rect x="46" y="76" width="24" height="50"/><rect x="78" y="76" width="24" height="50"/><rect x="110" y="76" width="24" height="50"/>
    <rect x="142" y="76" width="24" height="50"/><rect x="174" y="76" width="24" height="50"/>
  </g>
  <text x="130" y="168" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.85">every label pulls equally</text>
  <text x="130" y="184" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">and the noise is clustered,</text>
  <text x="130" y="198" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">so it does not average out</text>
  <!-- Delete -->
  <text x="360" y="40" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">delete below a threshold</text>
  <rect x="260" y="56" width="200" height="90" rx="6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="5 3"/>
  <g fill="currentColor" opacity="0.45">
    <rect x="276" y="76" width="24" height="50"/><rect x="308" y="76" width="24" height="50"/>
  </g>
  <g fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.35">
    <rect x="340" y="76" width="24" height="50"/><rect x="372" y="76" width="24" height="50"/><rect x="404" y="76" width="24" height="50"/>
  </g>
  <text x="360" y="168" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.85">the hard examples are gone</text>
  <text x="360" y="184" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">so the model is confident and</text>
  <text x="360" y="198" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">wrong precisely where humans hesitated</text>
  <!-- Weight -->
  <text x="590" y="40" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">weight by confidence</text>
  <rect x="490" y="56" width="200" height="90" rx="6" fill="none" stroke="currentColor" stroke-width="2"/>
  <g fill="currentColor">
    <rect x="506" y="76" width="24" height="50" opacity="0.55"/><rect x="538" y="76" width="24" height="50" opacity="0.5"/>
    <rect x="570" y="76" width="24" height="50" opacity="0.32"/><rect x="602" y="76" width="24" height="50" opacity="0.22"/>
    <rect x="634" y="76" width="24" height="50" opacity="0.16"/>
  </g>
  <text x="590" y="168" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.85">every sample still contributes</text>
  <text x="590" y="184" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">with a gradient scaled by how much</text>
  <text x="590" y="198" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">the label can be trusted</text>
  <text x="360" y="242" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">the floor matters: a weight of zero is deletion with extra steps, and it makes the effective batch size wander</text>
</svg>

## Step-by-Step Implementation

### Step 1 — Carry the Score Into the Sample

```bash
pip install torch==2.3.1 geopandas==0.14.4 rasterio==1.3.10 numpy==1.26.4
```

The loader must return the confidence alongside the image and target, so the training step never needs a second lookup.

```python
from dataclasses import dataclass
import torch
from torch.utils.data import Dataset

@dataclass(frozen=True)
class Sample:
    image: torch.Tensor       # C × H × W
    target: torch.Tensor      # H × W for masks, or a label index
    confidence: float         # the per-annotation score, 0–1

class WeightedTileDataset(Dataset):
    def __init__(self, records, transform=None):
        self.records, self.transform = records, transform

    def __getitem__(self, i: int) -> Sample:
        r = self.records[i]
        image, target = load_tile(r["image_path"]), load_target(r["target_path"])
        if self.transform:
            image, target = self.transform(image, target)
        return Sample(image, target, float(r["confidence"]))

    def __len__(self) -> int:
        return len(self.records)
```

Storing confidence in the record rather than recomputing it at load time matters for reproducibility: the score depends on annotator agreement and model calibration at the time the batch was built, both of which move.

### Step 2 — Map Confidence to a Weight, With a Floor

```python
def confidence_to_weight(conf: torch.Tensor, floor: float = 0.2,
                         c_min: float = 0.5, c_max: float = 0.95) -> torch.Tensor:
    """Linear map from [c_min, c_max] to [floor, 1.0], clamped at both ends.

    floor > 0 keeps hard examples in the batch instead of silently deleting them.
    """
    scaled = (conf - c_min) / max(c_max - c_min, 1e-6)
    return torch.clamp(scaled, 0.0, 1.0) * (1.0 - floor) + floor
```

Three properties are deliberate. The map is **linear**, because anything steeper amounts to a soft threshold and reintroduces the deletion behaviour. It **saturates at `c_max`**, since the difference between 0.95 and 0.99 confidence is not meaningful. And the **floor is well above zero**, so a batch always has the same effective size.

### Step 3 — Apply Per Sample and Normalise

The common mistake is multiplying an already-reduced loss, which scales the whole batch rather than its members.

```python
import torch.nn.functional as F

def weighted_loss(logits: torch.Tensor, target: torch.Tensor,
                  weight: torch.Tensor) -> torch.Tensor:
    """Per-sample weighted cross-entropy, normalised by the weight sum."""
    per_sample = F.cross_entropy(logits, target, reduction="none")   # N
    if per_sample.dim() > 1:                        # segmentation: N × H × W
        per_sample = per_sample.flatten(1).mean(1)
    return (per_sample * weight).sum() / weight.sum().clamp_min(1e-6)
```

Dividing by `weight.sum()` rather than by `N` is what keeps the effective learning rate steady. Without it, a batch that happens to contain many low-confidence samples produces a smaller total loss and therefore a smaller step, so the optimiser's behaviour depends on batch composition — a source of training instability that is very hard to attribute later.

### Step 4 — Rasterise Weights for Segmentation

For mask tasks a scalar per tile is too coarse: one tile can hold a confidently drawn warehouse and an uncertain field boundary. Burn each feature's weight into a per-pixel map.

<svg viewBox="0 0 720 260" role="img" aria-label="One tile carrying two features with different confidences, and the per-pixel weight map it produces" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>Why a segmentation tile needs a weight map, not a scalar</title>
  <desc>A single tile holds a confidently drawn warehouse at 0.94 confidence and an uncertain field boundary at 0.55. A per-tile scalar averages them to 0.75 and applies it everywhere, quietening the warehouse for no reason. Burning each feature's own weight into a per-pixel map keeps the warehouse at full strength and reduces only the pixels the annotator was unsure about.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <!-- Tile -->
  <text x="130" y="36" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">one tile, two confidences</text>
  <rect x="40" y="52" width="180" height="140" fill="none" stroke="currentColor" stroke-width="1.3"/>
  <polygon points="60,72 140,66 146,116 66,122" fill="currentColor" opacity="0.35" stroke="currentColor" stroke-width="1.5"/>
  <text x="103" y="98" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif">0.94</text>
  <polygon points="66,138 200,132 204,178 70,184" fill="currentColor" opacity="0.16" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 2"/>
  <text x="135" y="162" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif">0.55</text>
  <!-- Scalar -->
  <text x="360" y="36" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">one scalar per tile</text>
  <rect x="270" y="52" width="180" height="140" fill="currentColor" opacity="0.24"/>
  <rect x="270" y="52" width="180" height="140" fill="none" stroke="currentColor" stroke-width="1.3"/>
  <text x="360" y="128" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">weight 0.75</text>
  <text x="360" y="212" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.85">the warehouse is quietened</text>
  <text x="360" y="228" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.85">for no reason at all</text>
  <!-- Map -->
  <text x="590" y="36" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">per-pixel weight map</text>
  <rect x="500" y="52" width="180" height="140" fill="currentColor" opacity="0.1"/>
  <rect x="500" y="52" width="180" height="140" fill="none" stroke="currentColor" stroke-width="1.3"/>
  <polygon points="520,72 600,66 606,116 526,122" fill="currentColor" opacity="0.5"/>
  <text x="563" y="98" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif">1.00</text>
  <polygon points="526,138 660,132 664,178 530,184" fill="currentColor" opacity="0.18"/>
  <text x="595" y="162" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif">0.31</text>
  <text x="590" y="212" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.85">each feature carries its own weight;</text>
  <text x="590" y="228" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.85">background stays at 1.0</text>
  <text x="130" y="212" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">a warehouse and a field margin</text>
  <text x="130" y="228" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">are not equally certain</text>
</svg>

```python
import numpy as np
from rasterio.features import rasterize

def weight_map(features, transform, out_shape, floor: float = 0.2,
               background: float = 1.0) -> np.ndarray:
    """Per-pixel weights: each feature burns its own weight, background keeps `background`."""
    shapes = [(f.geometry, confidence_to_weight(torch.tensor(f.confidence), floor=floor).item())
              for f in features]
    burned = rasterize(shapes, out_shape=out_shape, transform=transform,
                       fill=background, dtype="float32", all_touched=False)
    return burned
```

Two decisions worth stating. Background keeps a weight of `1.0`, because "no object here" is usually a confident statement even when the objects present are uncertain. And `all_touched=False` matches whatever the label rasterisation used — a weight map built with a different rule than the mask it weights is misaligned at every boundary, which is the subtlest version of the problem [rasterizing vector labels for segmentation masks](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/vector-vs-raster-annotation-workflows/rasterizing-vector-labels-for-segmentation-masks/) describes.

### Step 5 — Ablate It

```python
def ablation_report(runs: dict[str, dict]) -> str:
    """Compare weighted against unweighted on the same frozen evaluation set."""
    lines = ["arm            mIoU   noisy-class IoU   clean-class IoU"]
    for name, m in runs.items():
        lines.append(f"{name:<14} {m['miou']:.3f}  {m['noisy']:.3f}            {m['clean']:.3f}")
    return "\n".join(lines)
```

The expected shape of the result is a gain concentrated on classes with noisy labels and nothing much elsewhere:

```
arm            mIoU   noisy-class IoU   clean-class IoU
unweighted     0.681  0.512             0.774
weighted       0.698  0.561             0.776
```

That is a real but modest effect, which is exactly why it needs a control arm rather than an impression. Run both on the same [blocked split](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/reproducible-train-validation-splits/) — comparing a weighted run on one split against an unweighted run on another measures the splits.

<svg viewBox="0 0 720 280" role="img" aria-label="Confidence mapped to loss weight, showing the floor, the linear region and the saturation point" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>The mapping, and why each part of it is shaped that way</title>
  <desc>Below 0.5 confidence the weight sits at the floor of 0.2, so those samples are quietened rather than deleted. Between 0.5 and 0.95 the weight rises linearly, so ranking is preserved without a soft threshold. Above 0.95 it saturates at 1.0, because the difference between 0.95 and 0.99 confidence is not a meaningful distinction.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <!-- Axes -->
  <line x1="100" y1="210" x2="640" y2="210" stroke="currentColor" stroke-width="1.4" opacity="0.6"/>
  <line x1="100" y1="210" x2="100" y2="50" stroke="currentColor" stroke-width="1.4" opacity="0.6"/>
  <text x="100" y="230" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.6">0.0</text>
  <text x="370" y="230" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.6">0.5</text>
  <text x="613" y="230" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.6">0.95</text>
  <text x="640" y="248" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.6">1.0</text>
  <text x="370" y="266" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.75">annotation confidence</text>
  <text x="80" y="212" text-anchor="end" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.6">0.0</text>
  <text x="80" y="178" text-anchor="end" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.6">0.2</text>
  <text x="80" y="58" text-anchor="end" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.6">1.0</text>
  <text x="52" y="130" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.75" transform="rotate(-90 52 130)">loss weight</text>
  <!-- Curve -->
  <path d="M100 178 L370 178 L613 54 L640 54" fill="none" stroke="currentColor" stroke-width="2.6"/>
  <!-- Guides -->
  <line x1="370" y1="60" x2="370" y2="206" stroke="currentColor" stroke-width="1" stroke-dasharray="3 3" opacity="0.5"/>
  <line x1="613" y1="60" x2="613" y2="206" stroke="currentColor" stroke-width="1" stroke-dasharray="3 3" opacity="0.5"/>
  <line x1="104" y1="178" x2="636" y2="178" stroke="currentColor" stroke-width="1" stroke-dasharray="3 3" opacity="0.35"/>
  <!-- Zone labels -->
  <text x="235" y="150" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.85">floor 0.2 — quietened,</text>
  <text x="235" y="164" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.85">not deleted</text>
  <text x="492" y="122" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.85">linear — ranking preserved,</text>
  <text x="492" y="136" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.85">no soft threshold</text>
  <text x="628" y="86" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.85">saturated</text>
</svg>

## Parameters and Thresholds Reference

| Parameter | Typical | Effect |
|---|---|---|
| `floor` | 0.2 | Below ~0.1 the mapping behaves like deletion |
| `c_min` | 0.5 | Confidence at which the weight starts rising |
| `c_max` | 0.95 | Above this, extra confidence buys nothing |
| Normalisation | by `weight.sum()` | Keeps the effective learning rate steady across batches |
| Background weight (masks) | 1.0 | "Nothing here" is usually a confident statement |
| Ablation | required | The effect is a point or two of IoU, not obvious by eye |

## Common Errors and Fixes

**Training loss drops but validation gets worse**
Root cause: the loss was reduced before weighting, so the weight scaled the whole batch and effectively lowered the learning rate.
Fix: use `reduction="none"` and normalise by the weight sum, as in Step 3.

**Loss becomes `nan` after a few hundred steps**
Root cause: a batch in which every weight is the floor, combined with a division by a near-zero weight sum.
Fix: the `clamp_min(1e-6)` above, plus a floor high enough that a full-floor batch is still a reasonable denominator.

**Segmentation weights are misaligned with the mask**
Root cause: the weight map was rasterised with a different `all_touched` setting than the label mask.
Fix: rasterise both with one function and one setting; assert their shapes and transforms match before training.

**A rare class disappears from the model's output**
Root cause: class weighting and confidence weighting multiplied, and that class is both rare and uncertain.
Fix: log the mean effective weight per class for one epoch and rebalance; the product, not either factor, is what the optimiser sees.

## Frequently Asked Questions

### Where does the confidence score come from?

From the composite described in [confidence scoring for geospatial labels](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/confidence-scoring-for-geospatial-labels/): annotator agreement, geometry sanity, and a calibrated model probability where one exists. The important property for this use is that it be calibrated — an uncalibrated score produces a weighting that is confidently arbitrary.

### Should the weights change between epochs?

Keep them fixed within a training run. Recomputing them from the current model's confidence mid-run creates a feedback loop where the model down-weights whatever it currently finds hard, which is the opposite of what you want. Updating them between runs, as annotations are re-adjudicated, is fine and expected.

### Does this replace a review queue?

No. Weighting limits the damage an uncertain label does to a model; it does not fix the label. The two consumers are complementary — the queue improves the dataset, the weighting protects the current run — and a project that only weights never improves its labels.

### How does this interact with active learning?

Directly: the same confidence that lowers a training weight raises a tile's priority for review. A batch selected by [uncertainty sampling](https://www.geospatialannotation.com/active-learning-model-feedback-loops/uncertainty-sampling-for-geospatial-active-learning/) will, once labelled, tend to carry lower annotation confidence than average, so the weighting keeps that batch from over-influencing the next model before the labels have been adjudicated.

## Related

- [Confidence Scoring for Geospatial Labels](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/confidence-scoring-for-geospatial-labels/) — where the score comes from, and the QA routing that consumes it alongside this
- [Calibrating Confidence Scores with Temperature Scaling](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/confidence-scoring-for-geospatial-labels/calibrating-confidence-scores-with-temperature-scaling/) — why an uncalibrated score makes this weighting arbitrary
- [Rasterizing Vector Labels for Segmentation Masks](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/vector-vs-raster-annotation-workflows/rasterizing-vector-labels-for-segmentation-masks/) — the rasterisation settings the weight map must match exactly
- [Reproducible Train/Validation Splits for Spatial Data](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/reproducible-train-validation-splits/) — the split both ablation arms have to share for the comparison to mean anything

This technique is one consumer of the scores produced in [Confidence Scoring for Geospatial Labels](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/confidence-scoring-for-geospatial-labels/), part of [Geospatial Annotation Fundamentals & Architecture](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/).
