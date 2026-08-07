---
title: "Detecting Distribution Drift in Spatial Datasets"
description: "Detect covariate and label drift in geospatial training data across acquisition dates, sensors, and regions — spectral histograms, class-balance monitors, and PSI thresholds that trigger re-labeling before model decay."
slug: "detecting-distribution-drift-in-spatial-datasets"
type: "guide"
breadcrumb: "Active Learning & Model Feedback Loops > Detecting Distribution Drift in Spatial Datasets"
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
      "headline": "Detecting Distribution Drift in Spatial Datasets",
      "description": "Detect covariate and label drift in geospatial training data across acquisition dates, sensors, and regions — spectral histograms, class-balance monitors, and PSI thresholds that trigger re-labeling before model decay.",
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
        {"@type": "ListItem", "position": 3, "name": "Detecting Distribution Drift in Spatial Datasets", "item": "https://www.geospatialannotation.com/active-learning-model-feedback-loops/detecting-distribution-drift-in-spatial-datasets/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Detect Distribution Drift in a Geospatial Training Dataset",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Build a reference distribution", "text": "Compute per-band spectral histograms over the frozen training set that the deployed model was fit on."},
        {"@type": "HowToStep", "position": 2, "name": "Summarize each incoming batch", "text": "Compute the same band histograms for every new acquisition batch of tiles as it arrives."},
        {"@type": "HowToStep", "position": 3, "name": "Measure covariate drift", "text": "Score each band with the Population Stability Index and a two-sample Kolmogorov-Smirnov test against the reference."},
        {"@type": "HowToStep", "position": 4, "name": "Measure label and prior drift", "text": "Compare per-class annotation frequencies between reference and batch to detect class-balance shift."},
        {"@type": "HowToStep", "position": 5, "name": "Threshold and alert", "text": "Apply banded PSI thresholds and raise a re-labeling trigger when covariate or prior drift crosses the significant band."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "How do I tell seasonal variation apart from true distribution drift?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Compare each incoming batch against a reference built from the same season or a full annual cycle rather than a single acquisition. Seasonal change is cyclical and reverts, so a rolling reference that spans a year absorbs it, while true drift accumulates and does not return to baseline across cycles."
          }
        },
        {
          "@type": "Question",
          "name": "What PSI threshold should trigger re-labeling?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "A common banding is PSI below 0.1 stable, 0.1 to 0.25 moderate, and above 0.25 significant. Raise a re-labeling trigger when any monitored band or the class-prior distribution crosses 0.25, and open a review ticket at the moderate band so a human can confirm before annotation budget is spent."
          }
        },
        {
          "@type": "Question",
          "name": "Why does a small batch produce false drift alerts?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "With few tiles the histogram is noisy and the KS test is under-powered, so PSI inflates on sampling noise alone. Set a minimum sample size per batch, accumulate tiles until it is met, and treat any alert on an undersized batch as provisional pending more data."
          }
        },
        {
          "@type": "Question",
          "name": "Can a resolution or projection mismatch look like drift?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes. A batch resampled to a different ground sample distance or reprojected into another coordinate reference system shifts pixel statistics in ways that mimic covariate drift. Normalize resolution and CRS before computing histograms so the monitor measures scene content rather than pipeline configuration."
          }
        }
      ]
    }
  ]
}
</script>

# Detecting Distribution Drift in Spatial Datasets

A building-footprint segmenter trained on cloud-free summer imagery ships to production and scores well on the held-out test set. Six months later the same model starts missing rooftops — not because the weights changed, but because the incoming tiles did. Winter acquisitions carry snow cover, low sun angles, and long shadows; a newly onboarded sensor delivers a slightly different spectral response and a coarser ground sample distance. None of this raises an exception. The pipeline keeps producing predictions, the dashboards stay green, and accuracy quietly decays until a downstream consumer notices the maps are wrong. By then weeks of degraded inference have already propagated into derived products.

This is distribution drift, and it is the failure mode that a monitoring layer inside an [active learning loop](https://www.geospatialannotation.com/active-learning-model-feedback-loops/) exists to catch. The goal is to detect when the imagery or the label distribution feeding your model has moved away from what it was trained on, quantify how far it has moved, and raise a trigger that routes the divergent tiles back to annotators before model performance collapses. This guide builds that monitor end to end: per-band spectral histograms, Population Stability Index and Kolmogorov-Smirnov covariate scoring, class-prior comparison, and a banded threshold gate that emits a re-labeling signal.

---

<svg viewBox="0 0 880 340" role="img" aria-label="Distribution drift monitoring diagram: reference distribution compared against an incoming batch through PSI bins and a threshold gate that raises a re-label trigger" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:880px;display:block;margin:1.5rem auto;">
  <title>Drift Monitoring Flow</title>
  <desc>A reference distribution and an incoming batch distribution are each binned, compared per bin to produce a Population Stability Index, passed through a banded threshold gate, and when drift is significant the gate raises a re-label trigger that feeds the active learning loop.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <defs>
    <marker id="dm-arr" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor" opacity="0.6"/>
    </marker>
  </defs>
  <!-- Reference distribution histogram -->
  <text x="120" y="28" text-anchor="middle" font-size="13" font-weight="700" fill="currentColor" font-family="sans-serif">Reference</text>
  <text x="120" y="44" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">training band histogram</text>
  <rect x="34" y="120" width="18" height="30" fill="currentColor" opacity="0.35"/>
  <rect x="58" y="98" width="18" height="52" fill="currentColor" opacity="0.35"/>
  <rect x="82" y="72" width="18" height="78" fill="currentColor" opacity="0.35"/>
  <rect x="106" y="86" width="18" height="64" fill="currentColor" opacity="0.35"/>
  <rect x="130" y="104" width="18" height="46" fill="currentColor" opacity="0.35"/>
  <rect x="154" y="126" width="18" height="24" fill="currentColor" opacity="0.35"/>
  <line x1="30" y1="150" x2="196" y2="150" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <!-- Incoming batch histogram -->
  <text x="120" y="196" text-anchor="middle" font-size="13" font-weight="700" fill="currentColor" font-family="sans-serif">Incoming batch</text>
  <text x="120" y="212" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">new acquisition tiles</text>
  <rect x="34" y="286" width="18" height="26" fill="currentColor" opacity="0.6"/>
  <rect x="58" y="276" width="18" height="36" fill="currentColor" opacity="0.6"/>
  <rect x="82" y="262" width="18" height="50" fill="currentColor" opacity="0.6"/>
  <rect x="106" y="238" width="18" height="74" fill="currentColor" opacity="0.6"/>
  <rect x="130" y="252" width="18" height="60" fill="currentColor" opacity="0.6"/>
  <rect x="154" y="270" width="18" height="42" fill="currentColor" opacity="0.6"/>
  <line x1="30" y1="312" x2="196" y2="312" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <!-- Arrows into PSI bins -->
  <path d="M196 150 L238 150 L238 180 L274 180" fill="none" stroke="currentColor" stroke-width="1.4" marker-end="url(#dm-arr)" opacity="0.6"/>
  <path d="M196 312 L238 312 L238 210 L274 210" fill="none" stroke="currentColor" stroke-width="1.4" marker-end="url(#dm-arr)" opacity="0.6"/>
  <!-- PSI bins box -->
  <rect x="278" y="150" width="180" height="90" rx="8" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.55"/>
  <text x="368" y="176" text-anchor="middle" font-size="13" font-weight="700" fill="currentColor" font-family="sans-serif">Per-bin compare</text>
  <text x="368" y="198" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace" opacity="0.85">(a-e)·ln(a/e)</text>
  <text x="368" y="220" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.75">summed → PSI</text>
  <!-- Arrow to gate -->
  <line x1="458" y1="195" x2="520" y2="195" stroke="currentColor" stroke-width="1.4" marker-end="url(#dm-arr)" opacity="0.6"/>
  <!-- Threshold gate -->
  <rect x="528" y="140" width="180" height="110" rx="8" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.55"/>
  <text x="618" y="166" text-anchor="middle" font-size="13" font-weight="700" fill="currentColor" font-family="sans-serif">Threshold gate</text>
  <text x="618" y="190" text-anchor="middle" font-size="10.5" fill="currentColor" font-family="sans-serif" opacity="0.8">&lt; 0.10 stable</text>
  <text x="618" y="210" text-anchor="middle" font-size="10.5" fill="currentColor" font-family="sans-serif" opacity="0.8">0.10–0.25 moderate</text>
  <text x="618" y="230" text-anchor="middle" font-size="10.5" fill="currentColor" font-family="sans-serif" opacity="0.8">&gt; 0.25 significant</text>
  <!-- Arrow to trigger -->
  <line x1="708" y1="195" x2="770" y2="195" stroke="currentColor" stroke-width="1.4" marker-end="url(#dm-arr)" opacity="0.6"/>
  <!-- Re-label trigger -->
  <rect x="778" y="158" width="92" height="74" rx="8" fill="none" stroke="currentColor" stroke-width="2" opacity="0.85"/>
  <text x="824" y="188" text-anchor="middle" font-size="12" font-weight="700" fill="currentColor" font-family="sans-serif">Re-label</text>
  <text x="824" y="206" text-anchor="middle" font-size="12" font-weight="700" fill="currentColor" font-family="sans-serif">trigger</text>
</svg>

---

## Prerequisites & Monitoring Contract

A drift monitor is only trustworthy if its reference is fixed and its inputs are normalized. Before computing a single statistic, agree on what "the distribution the model was trained on" means and freeze it. That reference is the frozen training set the deployed checkpoint was fit on — not last week's data, not a rolling window that silently absorbs the very drift you want to catch.

**Required Python packages (pinned):**

```bash
pip install numpy==1.26.4 pandas==2.2.2 scipy==1.13.1 rasterio==1.3.10 scikit-learn==1.5.1
```

**Monitoring contract to establish first:**

- A frozen reference dataset, versioned so every drift report cites the exact snapshot it compared against.
- A canonical [coordinate reference system](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) and ground sample distance that every batch is resampled to before statistics are computed.
- Fixed histogram bin edges derived once from the reference, reused for every batch — comparing histograms with different edges is meaningless.
- A minimum sample size per batch below which alerts are held as provisional.
- A destination for the re-label trigger: the review queue that the [active learning loop](https://www.geospatialannotation.com/active-learning-model-feedback-loops/) drains.

**What drift monitoring assumes about the data:**

- Every tile carries a valid CRS and geotransform, so pixel statistics reflect scene content rather than a projection artefact.
- Band ordering is consistent across sensors, or an explicit band-mapping table normalizes it.
- Class labels use a stable [label taxonomy](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/defining-roi-label-taxonomies-for-aerial-imagery/) so a "class-prior shift" is a real change in scene composition, not a renamed category.

With those fixed, the monitor reduces to three questions asked on every batch: has the imagery changed (covariate drift), has the class mix changed (prior drift), and is the change large enough to act on (thresholding).

---

## Core Drift-Monitoring Workflow

### Compute per-band spectral histograms

The covariate in a geospatial pipeline is the imagery itself. Rather than track every pixel, summarize each band as a normalized histogram over fixed bin edges. Edges are computed once from the reference and frozen; every subsequent batch is binned against those same edges so the two histograms are directly comparable.

```python
from __future__ import annotations

from pathlib import Path

import numpy as np
import rasterio


def band_edges(reference_paths: list[str], n_bins: int = 20) -> np.ndarray:
    """Derive fixed histogram bin edges from the reference set (per-band shared edges)."""
    samples: list[np.ndarray] = []
    for path in reference_paths:
        with rasterio.open(path) as src:
            arr = src.read().astype(np.float64)  # (bands, h, w)
        samples.append(arr.reshape(arr.shape[0], -1))
    stacked = np.concatenate(samples, axis=1)  # (bands, pixels)
    lo, hi = np.percentile(stacked, [1.0, 99.0])
    return np.linspace(float(lo), float(hi), n_bins + 1)


def band_histograms(path: str, edges: np.ndarray) -> np.ndarray:
    """Return an (n_bands, n_bins) array of normalized per-band histograms."""
    with rasterio.open(path) as src:
        arr = src.read(masked=True).astype(np.float64)
    n_bands = arr.shape[0]
    n_bins = len(edges) - 1
    out = np.zeros((n_bands, n_bins), dtype=np.float64)
    for b in range(n_bands):
        pixels = arr[b].compressed()  # drops nodata via the mask
        counts, _ = np.histogram(pixels, bins=edges)
        total = counts.sum()
        out[b] = counts / total if total else counts
    return out


def batch_histograms(paths: list[str], edges: np.ndarray) -> np.ndarray:
    """Average per-band histograms across every tile in a batch."""
    per_tile = [band_histograms(p, edges) for p in paths]
    return np.mean(np.stack(per_tile, axis=0), axis=0)
```

Reading with `masked=True` matters: nodata borders from reprojected or clipped tiles would otherwise pile into an edge bin and manufacture drift where none exists. Averaging per-tile histograms rather than pooling all pixels keeps a single unusually large tile from dominating the batch summary.

### Measure covariate drift with PSI and the KS test

With reference and batch histograms in hand, quantify how far they diverge. Two complementary statistics do the job. The Population Stability Index is a binned, symmetric measure that sums per-bin contributions and maps cleanly onto action bands. The two-sample Kolmogorov-Smirnov test works on the raw pixel samples and returns a distribution-free significance value, catching shape changes that a coarse binning might blur.

```python
from __future__ import annotations

import numpy as np
import rasterio
from scipy import stats


def population_stability_index(
    reference: np.ndarray,
    batch: np.ndarray,
    epsilon: float = 1e-6,
) -> float:
    """PSI between two normalized histograms over identical bin edges."""
    ref = np.clip(reference, epsilon, None)
    cur = np.clip(batch, epsilon, None)
    ref = ref / ref.sum()
    cur = cur / cur.sum()
    return float(np.sum((cur - ref) * np.log(cur / ref)))


def band_psi(reference_hist: np.ndarray, batch_hist: np.ndarray) -> dict[int, float]:
    """PSI per band, given (n_bands, n_bins) histogram matrices."""
    return {
        b: population_stability_index(reference_hist[b], batch_hist[b])
        for b in range(reference_hist.shape[0])
    }


def band_ks(
    reference_paths: list[str],
    batch_paths: list[str],
    band: int,
    max_pixels: int = 200_000,
) -> tuple[float, float]:
    """Two-sample KS statistic and p-value for one band, on subsampled pixels."""
    rng = np.random.default_rng(42)

    def sample(paths: list[str]) -> np.ndarray:
        vals: list[np.ndarray] = []
        for path in paths:
            with rasterio.open(path) as src:
                arr = src.read(band + 1, masked=True).astype(np.float64)
            vals.append(arr.compressed())
        pool = np.concatenate(vals)
        if pool.size > max_pixels:
            pool = rng.choice(pool, size=max_pixels, replace=False)
        return pool

    ref = sample(reference_paths)
    cur = sample(batch_paths)
    result = stats.ks_2samp(ref, cur)
    return float(result.statistic), float(result.pvalue)
```

PSI answers "how much has this band moved" on a scale you can threshold; the KS p-value answers "is the move statistically real given the sample size." Reporting both prevents two opposite mistakes: acting on a large PSI that is pure small-batch noise, and ignoring a modest but highly significant shift on a large batch.

### Measure label and prior drift

Covariate drift describes the imagery; prior drift describes the labels. If summer batches were 8% impervious surface and winter batches are 20% because snow reshapes what annotators mark, the model's learned class priors no longer match the incoming scene composition even when every band histogram looks stable. Track per-class annotation frequency and score it with the same PSI machinery.

```python
from __future__ import annotations

from collections import Counter

import numpy as np
import pandas as pd


def class_frequencies(labels: list[str], classes: list[str]) -> np.ndarray:
    """Normalized frequency vector over a fixed class ordering."""
    counts = Counter(labels)
    total = sum(counts.values())
    if total == 0:
        return np.zeros(len(classes), dtype=np.float64)
    return np.array([counts.get(c, 0) / total for c in classes], dtype=np.float64)


def prior_drift(
    reference_labels: list[str],
    batch_labels: list[str],
    classes: list[str],
) -> pd.DataFrame:
    """Per-class reference vs batch frequency plus a PSI contribution table."""
    ref = class_frequencies(reference_labels, classes)
    cur = class_frequencies(batch_labels, classes)
    eps = 1e-6
    ref_c = np.clip(ref, eps, None)
    cur_c = np.clip(cur, eps, None)
    contribution = (cur_c - ref_c) * np.log(cur_c / ref_c)
    return pd.DataFrame(
        {
            "class": classes,
            "reference_freq": ref,
            "batch_freq": cur,
            "psi_contribution": contribution,
        }
    ).sort_values("psi_contribution", ascending=False, ignore_index=True)
```

The returned frame does double duty: its `psi_contribution` column sums to the overall class-prior PSI, and sorting by it surfaces exactly which classes drove the shift. A large contribution from a single rare class often signals a real emerging phenomenon — a new construction site, seasonal flooding — that is precisely what you want annotators to look at.

### Threshold and raise a re-label trigger

The final stage collapses every per-band and per-class score into a single decision. Banded PSI thresholds turn continuous scores into `stable`, `moderate`, and `significant` verdicts; the gate raises a re-label trigger when any covariate band or the class-prior distribution crosses into `significant`, and opens a softer review ticket at `moderate`.

```python
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class DriftBands:
    stable_max: float = 0.10
    moderate_max: float = 0.25


def classify(psi: float, bands: DriftBands = DriftBands()) -> str:
    if psi < bands.stable_max:
        return "stable"
    if psi < bands.moderate_max:
        return "moderate"
    return "significant"


@dataclass(frozen=True)
class DriftReport:
    band_psi: dict[int, float]
    prior_psi: float
    verdict: str
    trigger_relabel: bool


def evaluate_batch(
    band_psi_scores: dict[int, float],
    prior_psi: float,
    min_samples_met: bool,
    bands: DriftBands = DriftBands(),
) -> DriftReport:
    scores = list(band_psi_scores.values()) + [prior_psi]
    verdicts = [classify(s, bands) for s in scores]
    if "significant" in verdicts:
        overall = "significant"
    elif "moderate" in verdicts:
        overall = "moderate"
    else:
        overall = "stable"
    # Small-batch guard: never fire a hard trigger on an undersized batch.
    trigger = overall == "significant" and min_samples_met
    return DriftReport(
        band_psi=band_psi_scores,
        prior_psi=prior_psi,
        verdict=overall,
        trigger_relabel=trigger,
    )
```

The `min_samples_met` guard is deliberate: an undersized batch can produce a `significant` verdict on sampling noise alone, so the gate downgrades it to a provisional review rather than spending annotation budget. When `trigger_relabel` is `True`, the report is the payload you hand to the annotation queue.

---

## Drift Metrics & Threshold Reference

| Metric | Measures | Stable | Moderate | Significant | Action on breach |
|---|---|---|---|---|---|
| PSI (per band) | Covariate shift in spectral response | `< 0.10` | `0.10 – 0.25` | `> 0.25` | Queue divergent tiles for re-labeling |
| KS p-value (per band) | Significance of band-level shift | `> 0.05` | `0.01 – 0.05` | `< 0.01` | Confirm PSI verdict is not noise |
| PSI (class prior) | Shift in per-class annotation mix | `< 0.10` | `0.10 – 0.25` | `> 0.25` | Re-balance sampling; inspect top-contributing class |
| Min samples / batch | Statistical power of the batch | `>= target` | near target | `< target` | Hold alert as provisional; accumulate more tiles |
| Reference age | Staleness of the frozen baseline | current model | prior model | pre-retrain | Rebuild reference after each retraining |

Treat the numeric bands as starting points, not universals. A high-cadence daily-revisit constellation with tight radiometric calibration can tolerate a lower `significant` threshold; a heterogeneous archive stitched from several sensors may need a higher one to avoid alert fatigue. Calibrate against a labeled drift event if you have one — replay a known summer-to-winter transition and tune the bands so it trips exactly once.

<svg viewBox="0 0 720 250" role="img" aria-label="Drift metrics against what each one can and cannot see" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>Three metrics, three blind spots</title>
  <desc>The population stability index summarises a whole distribution in one number but says nothing about which bin moved. The Kolmogorov-Smirnov test is sensitive to the shape of the middle of a distribution and weak in the tails. Per-class prior comparison catches label drift that leaves the imagery statistics untouched. Running one of the three and calling it drift monitoring leaves the other two failures invisible.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <text x="330" y="38" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">catches</text>
  <text x="580" y="38" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">misses</text>
  <line x1="20" y1="48" x2="700" y2="48" stroke="currentColor" stroke-width="1" opacity="0.4"/>
  <text x="20" y="80" font-size="12" fill="currentColor" font-family="monospace">PSI</text>
  <text x="20" y="98" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.65">per-band, binned</text>
  <text x="200" y="80" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.85">a whole-distribution shift, in one number</text>
  <text x="200" y="96" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.85">that is easy to threshold and trend</text>
  <text x="470" y="80" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.85">which bin moved, and whether two</text>
  <text x="470" y="96" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.85">opposing shifts cancelled out</text>
  <line x1="20" y1="110" x2="700" y2="110" stroke="currentColor" stroke-width="1" opacity="0.2"/>
  <text x="20" y="142" font-size="12" fill="currentColor" font-family="monospace">KS test</text>
  <text x="20" y="160" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.65">per-band, continuous</text>
  <text x="200" y="142" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.85">a change in the body of the</text>
  <text x="200" y="158" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.85">distribution, with a p-value</text>
  <text x="470" y="142" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.85">tail behaviour — new saturated</text>
  <text x="470" y="158" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.85">pixels barely move the statistic</text>
  <line x1="20" y1="172" x2="700" y2="172" stroke="currentColor" stroke-width="1" opacity="0.2"/>
  <text x="20" y="204" font-size="12" fill="currentColor" font-family="monospace">class priors</text>
  <text x="20" y="222" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.65">on the labels</text>
  <text x="200" y="204" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.85">label drift with identical imagery —</text>
  <text x="200" y="220" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.85">a taxonomy or guideline change</text>
  <text x="470" y="204" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.85">anything about the pixels; a new</text>
  <text x="470" y="220" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.85">sensor passes it untouched</text>
</svg>

---

## Edge Cases & Gotchas

### Seasonal cycles masquerading as drift

Vegetation greenness, snow, sun angle, and soil moisture all swing on an annual cycle. Compared against a single summer reference, every winter batch trips the gate — but that is expected variation the model should already handle, not a reason to re-label. Build the reference from a full annual cycle, or maintain season-matched references and compare like against like. True drift accumulates and does not revert across cycles; seasonal signal returns to baseline every year, and a rolling annual reference absorbs it.

<svg viewBox="0 0 720 280" role="img" aria-label="A seasonal cycle in a spectral index and the two ways of comparing it, one of which reports drift every autumn" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>Comparing to last month reports drift every autumn</title>
  <desc>A vegetation index over two years traces the same seasonal curve twice. Comparing each batch to the previous month crosses the seasonal slope and fires an alert every spring and autumn. Comparing to the same season a year earlier removes the cycle, so only a genuine change — a new sensor, a land-use shift — clears the threshold.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <!-- Axes -->
  <line x1="60" y1="180" x2="670" y2="180" stroke="currentColor" stroke-width="1.3" opacity="0.5"/>
  <text x="120" y="200" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.6">spring</text>
  <text x="210" y="200" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.6">summer</text>
  <text x="300" y="200" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.6">autumn</text>
  <text x="390" y="200" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.6">winter</text>
  <text x="480" y="200" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.6">spring</text>
  <text x="570" y="200" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.6">summer</text>
  <text x="655" y="200" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.6">autumn</text>
  <text x="34" y="110" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.7" transform="rotate(-90 34 110)">band mean</text>
  <!-- Curve -->
  <path d="M60 140 L120 96 L210 62 L300 104 L390 152 L480 98 L570 60 L655 106" fill="none" stroke="currentColor" stroke-width="2.5"/>
  <circle cx="120" cy="96" r="4" fill="currentColor"/>
  <circle cx="210" cy="62" r="4" fill="currentColor"/>
  <circle cx="300" cy="104" r="4" fill="currentColor"/>
  <circle cx="390" cy="152" r="4" fill="currentColor"/>
  <circle cx="480" cy="98" r="4" fill="currentColor"/>
  <circle cx="570" cy="60" r="4" fill="currentColor"/>
  <circle cx="655" cy="106" r="4" fill="currentColor"/>
  <!-- month-over-month comparisons -->
  <path d="M210 46 L300 88" fill="none" stroke="currentColor" stroke-width="1.3" stroke-dasharray="4 3" opacity="0.75"/>
  <text x="258" y="44" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.8">alert</text>
  <path d="M300 120 L390 168" fill="none" stroke="currentColor" stroke-width="1.3" stroke-dasharray="4 3" opacity="0.75"/>
  <text x="352" y="182" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.8">alert</text>
  <!-- year-over-year -->
  <path d="M210 78 L210 226 L570 226 L570 76" fill="none" stroke="currentColor" stroke-width="1.6"/>
  <text x="390" y="244" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">compare like season to like season — no alert, because nothing changed</text>
  <text x="390" y="266" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">dashed: month-over-month, which fires twice a year forever and trains everyone to ignore the alert</text>
</svg>

### Sensor calibration shifts

Onboarding a new satellite or drone camera, or a vendor re-processing an archive to a new radiometric baseline, moves band histograms wholesale even though the scenes are unchanged. This is genuine covariate drift from the model's perspective, but the fix is often a radiometric harmonization step rather than re-labeling. Tag every tile with its sensor and processing-baseline identifier, and stratify drift reports by sensor so a calibration shift is diagnosed as such instead of being blamed on scene content.

### Small-batch noise

PSI is unstable on small samples: with a handful of tiles, an empty bin clipped to `epsilon` can dominate the sum and inflate the score. Enforce a minimum sample size, accumulate tiles until it is met, and mark any alert on an undersized batch as provisional — exactly what the `min_samples_met` guard in the gate encodes. Bootstrapping a confidence interval on PSI across resampled tiles is a cheap way to see whether a score is robust or an artefact of one outlier tile.

### CRS and resolution mismatch posing as drift

A batch delivered in a different [coordinate reference system](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) or at a coarser ground sample distance produces pixel statistics that diverge from the reference for reasons that have nothing to do with the scene. Reprojection resamples pixel values; a resolution change alters texture and edge density; both shift histograms and can trip the covariate gate on a pipeline configuration difference. Normalize CRS and GSD before any histogram is computed, and assert both in the monitor so a mismatch raises a configuration error rather than a false drift alert. A batch whose only "drift" is a projection artefact will waste an entire re-labeling cycle if it slips through.

### Multimodal bands and bin starvation

Bands with genuinely multimodal distributions — water versus land in a near-infrared band, for instance — can leave interior bins near-empty, making PSI hypersensitive there. Derive bin edges from percentiles rather than a linear span, or use quantile bins so each carries comparable mass. Empty reference bins clipped to `epsilon` are the single most common source of spuriously large PSI.

---

## Integration & Automation Hooks

### Feed drift alerts into the active learning loop

A drift report is only useful if it changes what gets annotated. When `trigger_relabel` is `True`, push the batch identifier and the top-contributing bands and classes into the review queue that the [active learning loop](https://www.geospatialannotation.com/active-learning-model-feedback-loops/) consumes. Drift monitoring and uncertainty sampling are complementary signals: uncertainty finds tiles the current model is unsure about, while drift finds tiles that are unlike anything the model has seen. A tile flagged by both is the highest-value annotation target in the batch, so union the two queues and prioritize the intersection.

### Version the reference alongside the dataset with DVC

The reference distribution must move in lockstep with the model. Track it as an artefact under [DVC versioning](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/) so every drift report cites the exact reference snapshot, and rebuild the reference as a pipeline stage immediately after each retraining. This keeps a subtle bug at bay: comparing new batches against a reference from two model generations ago will report drift that the current model has already absorbed.

```yaml
# dvc.yaml
stages:
  build_drift_reference:
    cmd: python scripts/build_reference.py --train data/train/ --out artifacts/reference.npz
    deps:
      - scripts/build_reference.py
      - data/train/
    outs:
      - artifacts/reference.npz
  drift_gate:
    cmd: python scripts/drift_gate.py --reference artifacts/reference.npz --batch data/incoming/
    deps:
      - scripts/drift_gate.py
      - artifacts/reference.npz
      - data/incoming/
    metrics:
      - reports/drift.json:
          cache: false
```

Emitting the drift verdict as a DVC metric means the gate result is diffable across runs, and a `significant` verdict can fail the pipeline stage so a divergent batch never reaches training unreviewed.

---

## Validation & Testing

A drift monitor that never fires is as dangerous as one that always fires. Validate it against synthetic ground truth before trusting it in production: construct a batch you know is drifted and confirm the gate trips, and construct an in-distribution batch and confirm it stays quiet.

```python
from __future__ import annotations

import numpy as np


def test_identical_batch_is_stable() -> None:
    rng = np.random.default_rng(0)
    hist = rng.dirichlet(np.ones(20))
    assert population_stability_index(hist, hist) < 1e-9


def test_shifted_batch_trips_significant() -> None:
    edges = np.linspace(0.0, 1.0, 21)
    ref_pixels = np.random.default_rng(1).normal(0.4, 0.05, 50_000)
    cur_pixels = np.random.default_rng(2).normal(0.7, 0.05, 50_000)
    ref_hist, _ = np.histogram(ref_pixels, bins=edges, density=True)
    cur_hist, _ = np.histogram(cur_pixels, bins=edges, density=True)
    psi = population_stability_index(ref_hist, cur_hist)
    assert classify(psi) == "significant"


def test_small_batch_holds_trigger() -> None:
    report = evaluate_batch(
        band_psi_scores={0: 0.9},
        prior_psi=0.02,
        min_samples_met=False,
    )
    assert report.verdict == "significant"
    assert report.trigger_relabel is False
```

Three properties are worth asserting in CI: a batch identical to the reference scores near-zero PSI, a deliberately shifted batch classifies as `significant`, and an undersized batch never raises a hard trigger regardless of its score. Add a replay test over a historical drift event if one exists in your archive — it is the closest thing to a real-world integration check the monitor will get.

Beyond unit tests, log every batch's full drift report even when it stays stable. The stream of scores over time is itself a diagnostic: a slow upward creep in band PSI that never quite crosses `0.25` is early warning that the reference is aging and a retrain is due, long before any single batch trips the gate.

---

## Frequently Asked Questions

### How do I tell seasonal variation apart from true distribution drift?

Compare each incoming batch against a reference built from the same season or a full annual cycle rather than a single acquisition. Seasonal change is cyclical and reverts, so a rolling reference that spans a year absorbs it, while true drift accumulates and does not return to baseline across cycles.

### What PSI threshold should trigger re-labeling?

A common banding is PSI below 0.1 stable, 0.1 to 0.25 moderate, and above 0.25 significant. Raise a re-labeling trigger when any monitored band or the class-prior distribution crosses 0.25, and open a review ticket at the moderate band so a human can confirm before annotation budget is spent.

### Why does a small batch produce false drift alerts?

With few tiles the histogram is noisy and the KS test is under-powered, so PSI inflates on sampling noise alone. Set a minimum sample size per batch, accumulate tiles until it is met, and treat any alert on an undersized batch as provisional pending more data.

### Can a resolution or projection mismatch look like drift?

Yes. A batch resampled to a different ground sample distance or reprojected into another coordinate reference system shifts pixel statistics in ways that mimic covariate drift. Normalize resolution and CRS before computing histograms so the monitor measures scene content rather than pipeline configuration.

---

## Related

- [Monitoring Class-Balance Drift Across Image Tiles](https://www.geospatialannotation.com/active-learning-model-feedback-loops/detecting-distribution-drift-in-spatial-datasets/monitoring-class-balance-drift-across-tiles/) — a focused walkthrough of the class-prior PSI monitor with a full pandas implementation
- [Uncertainty Sampling for Geospatial Active Learning](https://www.geospatialannotation.com/active-learning-model-feedback-loops/uncertainty-sampling-for-geospatial-active-learning/) — the complementary signal that ranks tiles by model uncertainty rather than distributional distance
- [Closing the Loop with Automated Model Retraining](https://www.geospatialannotation.com/active-learning-model-feedback-loops/closing-the-loop-with-automated-retraining/) — where a confirmed drift trigger ultimately lands: an evaluation-gated retraining pipeline
- [Implementing DVC for Geospatial Training Data](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/) — versioning the frozen reference so every drift report is reproducible
- [Coordinate Reference Systems in Annotation Pipelines](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) — normalizing CRS and resolution so projection artefacts do not masquerade as drift

This guide is part of the broader [Active Learning & Model Feedback Loops for Geospatial Annotation](https://www.geospatialannotation.com/active-learning-model-feedback-loops/) topic area that keeps annotation effort focused where the model is weakest.
