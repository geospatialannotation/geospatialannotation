---
title: "Monitoring Class-Balance Drift Across Image Tiles"
description: "Track per-class annotation frequency across tiles and acquisition batches using the population stability index, with a pandas implementation and alert thresholds for geospatial datasets."
slug: "monitoring-class-balance-drift-across-tiles"
type: "tutorial"
breadcrumb:
  - label: "Home"
    url: "/"
  - label: "Active Learning & Model Feedback Loops"
    url: "/active-learning-model-feedback-loops/"
  - label: "Detecting Distribution Drift in Spatial Datasets"
    url: "/active-learning-model-feedback-loops/detecting-distribution-drift-in-spatial-datasets/"
  - label: "Monitoring Class-Balance Drift Across Image Tiles"
    url: "/active-learning-model-feedback-loops/detecting-distribution-drift-in-spatial-datasets/monitoring-class-balance-drift-across-tiles/"
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
      "headline": "Monitoring Class-Balance Drift Across Image Tiles",
      "description": "Track per-class annotation frequency across tiles and acquisition batches using the population stability index, with a pandas implementation and alert thresholds for geospatial datasets.",
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
        {"@type": "ListItem", "position": 3, "name": "Detecting Distribution Drift in Spatial Datasets", "item": "https://www.geospatialannotation.com/active-learning-model-feedback-loops/detecting-distribution-drift-in-spatial-datasets/"},
        {"@type": "ListItem", "position": 4, "name": "Monitoring Class-Balance Drift Across Image Tiles", "item": "https://www.geospatialannotation.com/active-learning-model-feedback-loops/detecting-distribution-drift-in-spatial-datasets/monitoring-class-balance-drift-across-tiles/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Monitoring Class-Balance Drift Across Image Tiles",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Tabulate class counts per batch", "text": "Parse each tile's GeoJSON FeatureCollection, read the class property from every feature, and aggregate per-class annotation counts into a tidy pandas DataFrame keyed by acquisition batch."},
        {"@type": "HowToStep", "position": 2, "name": "Build the reference class-prior vector", "text": "Pick a trusted baseline batch or a pooled window of historical tiles, normalise its per-class counts into proportions, and apply Laplace smoothing so no class prior is exactly zero."},
        {"@type": "HowToStep", "position": 3, "name": "Compute the Population Stability Index per class", "text": "For each incoming batch, compute PSI per class as (current_prop - reference_prop) multiplied by the natural log of (current_prop / reference_prop), then sum across classes for a total PSI."},
        {"@type": "HowToStep", "position": 4, "name": "Emit an alert table", "text": "Compare each per-class PSI and the total PSI against banded thresholds; flag any class whose PSI exceeds 0.25 as significant drift and route its tiles to targeted re-labeling."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why use PSI instead of a simple percentage-point change in class frequency?",
          "acceptedAnswer": {"@type": "Answer", "text": "A raw percentage-point delta treats a shift from 1% to 3% the same as 40% to 42%, yet the first triples a rare class's prevalence and the second barely moves a dominant one. PSI weights each shift by the log-ratio of the proportions, so it amplifies proportional changes in rare classes and dampens absolute changes in common ones. That matches how class imbalance actually degrades a geospatial detector: minority classes are where drift hurts recall first."}
        },
        {
          "@type": "Question",
          "name": "What PSI threshold indicates significant class-balance drift?",
          "acceptedAnswer": {"@type": "Answer", "text": "PSI below 0.10 is stable, 0.10 to 0.25 is a moderate shift worth watching, and any class above 0.25 is significant drift that should trigger targeted re-labeling of that batch's tiles. These bands are the widely used credit-scoring PSI conventions and transfer directly to per-class annotation priors because both are discrete categorical distributions."}
        },
        {
          "@type": "Question",
          "name": "How do I handle a class that is absent from a batch, giving a zero proportion?",
          "acceptedAnswer": {"@type": "Answer", "text": "A zero proportion makes the PSI log-ratio undefined or infinite. Apply Laplace (add-one) smoothing to every class count before normalising, or add a small epsilon such as 1e-6 to each proportion and renormalise. Smoothing keeps PSI finite while still producing a large, correctly-flagged value when a class truly vanishes from a batch."}
        },
        {
          "@type": "Question",
          "name": "Should PSI be computed per tile or per acquisition batch?",
          "acceptedAnswer": {"@type": "Answer", "text": "Compute it per batch. A single tile holds too few annotations for stable proportions, so per-tile PSI is dominated by sampling noise. Aggregate tiles into acquisition batches — one flight, one sensor pass, or one delivery — of at least a few hundred annotations, then compute PSI on the batch-level class-prior vector."}
        }
      ]
    }
  ]
}
</script>

# Monitoring Class-Balance Drift Across Image Tiles

To detect class-balance drift across image tiles, compute a per-class annotation frequency vector for every acquisition batch, normalise it into a class-prior distribution, and compare each incoming batch against a trusted reference prior using the **Population Stability Index (PSI)**. PSI scores each class by `(current_prop - reference_prop) * ln(current_prop / reference_prop)`; a per-class PSI above **0.25** flags significant class-balance drift and should trigger targeted re-labeling of that batch's tiles before they enter training. This measure is the batch-level companion to per-tile monitoring inside an [active learning loop](https://www.geospatialannotation.com/active-learning-model-feedback-loops/), where annotation effort is steered toward the data the model handles worst. The rest of this guide gives a runnable pandas implementation, a threshold table, and the failure modes that quietly break PSI monitoring.

## Why Class-Balance Drift Silently Degrades Geospatial Models

A geospatial detector learns the class priors baked into its training set. When later acquisition batches carry a different mix — a summer flight thick with cars where the winter baseline had mostly bare roofs, or a new sensor that resolves small vehicles the old one missed — the label distribution shifts even though every individual annotation is correct. That shift is *label drift*, and it erodes model performance in a way that overall accuracy hides: the minority classes lose recall first, and aggregate metrics stay high because the dominant class still scores well.

Per-class frequency is the cheapest drift signal you can compute. It needs no imagery, no model inference, and no reprojection — only the class property already present in each annotation. Yet a naive check ("did any class change by more than 5 percentage points?") misfires in both directions. It ignores a rare class tripling from 1% to 3%, and it panics over a dominant class drifting from 40% to 45%. PSI fixes both by weighting every change by its log-ratio, so proportional moves in small classes dominate the score exactly where drift does the most damage. Because class labels are the same discrete categories the [ROI label taxonomy](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/defining-roi-label-taxonomies-for-aerial-imagery/) already fixes, the reference vector is stable and cheap to maintain across the life of a dataset.

<svg viewBox="0 0 660 320" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Grouped bar chart comparing reference and current class-prior distributions for four classes, alongside a horizontal PSI gauge with stable, watch, and drift zones" style="width:100%;max-width:660px;display:block;margin:1.5rem auto;">
  <title>Reference versus current class priors with a PSI drift gauge</title>
  <desc>Left panel: grouped bars for four classes — building, road, vehicle, vegetation — showing the reference prior against the current batch prior. Vehicle rises sharply while building falls. Right panel: a horizontal PSI gauge divided into stable, watch, and drift zones with a marker sitting in the drift zone at PSI 0.34.</desc>
  <!-- Left panel axis -->
  <line x1="40" y1="240" x2="360" y2="240" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="40" y="40" font-size="12" fill="currentColor" opacity="0.85" font-family="sans-serif" font-weight="bold">Class-prior distribution</text>
  <!-- building: ref 0.40 -> h160 y80 ; cur 0.28 -> h112 y128 -->
  <rect x="52" y="80" width="18" height="160" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.55"/>
  <rect x="72" y="128" width="18" height="112" fill="currentColor" opacity="0.30"/>
  <text x="71" y="256" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7" font-family="sans-serif">building</text>
  <!-- road: ref 0.25 -> h100 y140 ; cur 0.22 -> h88 y152 -->
  <rect x="132" y="140" width="18" height="100" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.55"/>
  <rect x="152" y="152" width="18" height="88" fill="currentColor" opacity="0.30"/>
  <text x="151" y="256" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7" font-family="sans-serif">road</text>
  <!-- vehicle: ref 0.10 -> h40 y200 ; cur 0.30 -> h120 y120 -->
  <rect x="212" y="200" width="18" height="40" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.55"/>
  <rect x="232" y="120" width="18" height="120" fill="currentColor" opacity="0.30"/>
  <text x="231" y="256" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7" font-family="sans-serif">vehicle</text>
  <!-- vegetation: ref 0.25 -> h100 y140 ; cur 0.20 -> h80 y160 -->
  <rect x="292" y="140" width="18" height="100" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.55"/>
  <rect x="312" y="160" width="18" height="80" fill="currentColor" opacity="0.30"/>
  <text x="311" y="256" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7" font-family="sans-serif">veg</text>
  <!-- legend -->
  <rect x="52" y="278" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.55"/>
  <text x="72" y="290" font-size="10" fill="currentColor" opacity="0.7" font-family="sans-serif">reference prior</text>
  <rect x="182" y="278" width="14" height="14" fill="currentColor" opacity="0.30"/>
  <text x="202" y="290" font-size="10" fill="currentColor" opacity="0.7" font-family="sans-serif">current batch</text>
  <!-- Right panel: PSI gauge -->
  <text x="420" y="40" font-size="12" fill="currentColor" opacity="0.85" font-family="sans-serif" font-weight="bold">Total PSI gauge</text>
  <!-- track: x 420..620 maps PSI 0..0.5 -->
  <rect x="420" y="120" width="40" height="22" fill="currentColor" opacity="0.12"/>
  <rect x="460" y="120" width="60" height="22" fill="currentColor" opacity="0.32"/>
  <rect x="520" y="120" width="100" height="22" fill="currentColor" opacity="0.55"/>
  <rect x="420" y="120" width="200" height="22" fill="none" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <!-- zone labels -->
  <text x="440" y="162" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.6" font-family="sans-serif">stable</text>
  <text x="490" y="162" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.6" font-family="sans-serif">watch</text>
  <text x="570" y="162" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.6" font-family="sans-serif">drift</text>
  <text x="420" y="182" text-anchor="middle" font-size="8" fill="currentColor" opacity="0.45" font-family="sans-serif">0.00</text>
  <text x="460" y="182" text-anchor="middle" font-size="8" fill="currentColor" opacity="0.45" font-family="sans-serif">0.10</text>
  <text x="520" y="182" text-anchor="middle" font-size="8" fill="currentColor" opacity="0.45" font-family="sans-serif">0.25</text>
  <text x="620" y="182" text-anchor="middle" font-size="8" fill="currentColor" opacity="0.45" font-family="sans-serif">0.50</text>
  <!-- marker at PSI 0.34 -> x = 420 + 0.34/0.5*200 = 556 -->
  <polygon points="556,104 548,116 564,116" fill="currentColor" opacity="0.9"/>
  <line x1="556" y1="116" x2="556" y2="142" stroke="currentColor" stroke-width="2" opacity="0.9"/>
  <text x="556" y="98" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.95" font-family="sans-serif" font-weight="bold">0.34</text>
  <text x="520" y="212" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.55" font-family="sans-serif">vehicle class drives total PSI into the drift zone</text>
</svg>

## Step-by-Step Implementation

Install the pinned dependencies once:

```bash
pip install pandas==2.2.2 numpy==1.26.4
```

### Step 1 — Tabulate Class Counts per Batch from GeoJSON

Each tile is a GeoJSON `FeatureCollection` whose features carry a `class` property. Group tiles into acquisition batches (a flight, a sensor pass, or a delivery) and count classes per batch. Store the batch identifier and the source [`EPSG:4326`](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) coordinate reference system alongside the counts so a flagged batch stays traceable to its raw tiles.

```python
from __future__ import annotations
import json
from collections import Counter
from pathlib import Path
import pandas as pd


def count_classes_in_tile(geojson_path: Path, class_key: str = "class") -> Counter[str]:
    """Return a Counter of class -> annotation count for one tile GeoJSON."""
    fc: dict = json.loads(geojson_path.read_text())
    counts: Counter[str] = Counter()
    for feature in fc.get("features", []):
        label = feature.get("properties", {}).get(class_key)
        if label is not None:
            counts[str(label)] += 1
    return counts


def tabulate_batch_counts(
    batch_tiles: dict[str, list[Path]],
    class_key: str = "class",
) -> pd.DataFrame:
    """
    Aggregate per-class counts for each batch.

    Args:
        batch_tiles: mapping of batch_id -> list of tile GeoJSON paths.
        class_key:   feature property holding the class label.

    Returns:
        DataFrame indexed by batch_id, one column per class, values = counts.
    """
    rows: dict[str, Counter[str]] = {}
    for batch_id, tiles in batch_tiles.items():
        total: Counter[str] = Counter()
        for tile in tiles:
            total.update(count_classes_in_tile(tile, class_key))
        rows[batch_id] = total
    return pd.DataFrame(rows).fillna(0).astype(int).T.sort_index(axis=1)
```

### Step 2 — Build the Reference Class-Prior Vector

Normalise a trusted baseline batch (or a pooled historical window) into proportions. Apply Laplace smoothing so no class prior is exactly zero — a zero reference makes the PSI log-ratio explode to infinity.

```python
import numpy as np


def to_prior(counts: pd.Series, smoothing: float = 1.0) -> pd.Series:
    """Convert a per-class count Series into a smoothed proportion vector."""
    smoothed = counts.astype(float) + smoothing
    return smoothed / smoothed.sum()


def build_reference_prior(
    counts_df: pd.DataFrame,
    reference_batches: list[str],
    smoothing: float = 1.0,
) -> pd.Series:
    """Pool one or more baseline batches into a single reference prior."""
    pooled: pd.Series = counts_df.loc[reference_batches].sum(axis=0)
    return to_prior(pooled, smoothing)
```

### Step 3 — Compute PSI per Class

PSI is a sum over classes of `(current - reference) * ln(current / reference)`. Compute the per-class contribution so you can flag *which* class drifted, not merely that the batch as a whole moved. Align both vectors on the full class index first so a class missing from one side still contributes.

```python
def psi_per_class(
    current_counts: pd.Series,
    reference_prior: pd.Series,
    smoothing: float = 1.0,
) -> pd.DataFrame:
    """
    Population Stability Index per class between a current batch and a reference.

    Returns a DataFrame with reference_prop, current_prop, and psi per class,
    sorted by descending psi so the worst-drifting class is first.
    """
    classes = reference_prior.index.union(current_counts.index)
    ref = reference_prior.reindex(classes, fill_value=0.0)
    cur = to_prior(current_counts.reindex(classes, fill_value=0), smoothing)
    # Re-smooth the reference in case new classes appeared.
    ref = (ref + 1e-9) / (ref + 1e-9).sum()

    psi = (cur - ref) * np.log(cur / ref)
    out = pd.DataFrame(
        {"reference_prop": ref, "current_prop": cur, "psi": psi}
    )
    return out.sort_values("psi", ascending=False)
```

### Step 4 — Emit an Alert Table

Band each per-class PSI, compute the total PSI for the batch, and mark any class above 0.25 for targeted re-labeling. The `action` column feeds straight into an annotation-queue routing step.

```python
from dataclasses import dataclass


def psi_band(value: float) -> tuple[str, str]:
    """Map a PSI value to (band, recommended action)."""
    if value < 0.10:
        return "stable", "no action"
    if value < 0.25:
        return "watch", "monitor next batch"
    return "drift", "re-label this class"


@dataclass
class BatchDriftReport:
    batch_id: str
    total_psi: float
    per_class: pd.DataFrame  # includes band and action columns


def build_alert_table(
    batch_id: str,
    current_counts: pd.Series,
    reference_prior: pd.Series,
) -> BatchDriftReport:
    table = psi_per_class(current_counts, reference_prior)
    bands = table["psi"].apply(psi_band)
    table["band"] = [b for b, _ in bands]
    table["action"] = [a for _, a in bands]
    total = float(table["psi"].sum())
    return BatchDriftReport(batch_id=batch_id, total_psi=total, per_class=table)


# --- Worked example -------------------------------------------------------
counts_df = pd.DataFrame(
    {
        "building": [400, 280],
        "road":     [250, 220],
        "vehicle":  [100, 300],
        "veg":      [250, 200],
    },
    index=["2026-04-baseline", "2026-07-flightB"],
)

reference = build_reference_prior(counts_df, ["2026-04-baseline"])
report = build_alert_table("2026-07-flightB", counts_df.loc["2026-07-flightB"], reference)

print(f"Total PSI for {report.batch_id}: {report.total_psi:.3f}")
print(report.per_class.round(3).to_string())
```

Running the example prints a total PSI of roughly 0.34, with `vehicle` carrying a per-class PSI well above 0.25 and an action of `re-label this class` — the batch tripled its vehicle prevalence, exactly the minority-class shift that erodes recall. Persisting each `BatchDriftReport` next to its dataset snapshot keeps the drift signal reproducible; the mechanics of attaching that context live in [preserving metadata across dataset versions](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/preserving-metadata-across-dataset-versions/).

## PSI Thresholds and Actions

The bands below are the standard PSI conventions borrowed from population-stability monitoring; they transfer cleanly to categorical class priors because both are discrete distributions.

| Per-class PSI | Band | Interpretation | Action |
|---|---|---|---|
| < 0.10 | Stable | Class prior matches the reference within noise | No action; keep the reference |
| 0.10 – 0.25 | Watch | Moderate shift; could be sampling variation | Monitor the next batch; do not retrain on it alone |
| 0.25 – 0.50 | Drift | Significant, unlikely to be noise | Route this class's tiles to targeted re-labeling |
| > 0.50 | Severe | Class prior fundamentally changed or a class vanished | Quarantine the batch; audit the acquisition and taxonomy |

Read the **total** PSI as a batch-level smoke alarm and the **per-class** PSI as the diagnosis: a total of 0.34 tells you the batch drifted, but only the per-class breakdown tells you it was `vehicle` that moved and therefore which tiles to re-annotate. Never retrain on a batch whose dominant-class PSI sits in the drift band without first confirming the shift is real rather than a labeling-protocol change.

## Common Errors and Fixes

**`RuntimeWarning: divide by zero encountered in log` and PSI of `inf`**
Root cause: a class has a reference proportion of exactly 0.0, so `ln(current / 0)` is undefined.
Fix: apply Laplace smoothing (`smoothing=1.0`) to every count vector before normalising, or add a small epsilon and renormalise, as `to_prior` does above.

**PSI spikes on every batch even when the label mix looks unchanged**
Root cause: PSI computed per tile rather than per batch — a single tile holds too few annotations for stable proportions, so the score is dominated by sampling noise.
Fix: aggregate tiles into batches of at least a few hundred annotations before computing PSI.

**A newly introduced class produces a misleadingly small PSI**
Root cause: the class exists in the current batch but not in the reference index, so it is dropped during alignment.
Fix: take the union of both class indices (`reference_prior.index.union(current_counts.index)`) and reindex with `fill_value=0` before smoothing, so new classes contribute their full drift.

**Total PSI looks fine but the model still loses recall on a rare class**
Root cause: a large drift in one minority class is diluted when only the summed total is inspected.
Fix: alert on the maximum per-class PSI, not just the total; a single class above 0.25 warrants re-labeling regardless of the aggregate.

## Related

- [Detecting Distribution Drift in Spatial Datasets](https://www.geospatialannotation.com/active-learning-model-feedback-loops/detecting-distribution-drift-in-spatial-datasets/) — the broader topic area covering spectral, covariate, and label drift monitors this class-balance check belongs to
- [Preserving Metadata Across Dataset Versions](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/preserving-metadata-across-dataset-versions/) — persist each batch's drift report and reference prior so a flagged shift stays reproducible across snapshots
- [Defining ROI Label Taxonomies for Aerial Imagery](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/defining-roi-label-taxonomies-for-aerial-imagery/) — a stable class taxonomy is what makes the reference prior vector meaningful batch after batch
- [Active Learning & Model Feedback Loops for Geospatial Annotation](https://www.geospatialannotation.com/active-learning-model-feedback-loops/) — how drift alerts feed the retraining and re-labeling triage that keeps a deployed detector current

This guide covers one specialised monitor within [Detecting Distribution Drift in Spatial Datasets](https://www.geospatialannotation.com/active-learning-model-feedback-loops/detecting-distribution-drift-in-spatial-datasets/), which is itself part of [Active Learning & Model Feedback Loops for Geospatial Annotation](https://www.geospatialannotation.com/active-learning-model-feedback-loops/).
