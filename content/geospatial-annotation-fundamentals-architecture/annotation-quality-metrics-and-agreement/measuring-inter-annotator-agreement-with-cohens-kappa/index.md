---
title: "Measuring Inter-Annotator Agreement with Cohen's Kappa"
description: "Compute Cohen's kappa over matched geospatial features, read the confusion matrix that tells you whether the problem is an annotator or the taxonomy, and avoid the two ways kappa misleads on imbalanced classes."
slug: "measuring-inter-annotator-agreement-with-cohens-kappa"
type: "tutorial"
breadcrumb:
  - label: "Home"
    url: "/"
  - label: "Geospatial Annotation Fundamentals & Architecture"
    url: "/geospatial-annotation-fundamentals-architecture/"
  - label: "Annotation Quality Metrics & Inter-Annotator Agreement"
    url: "/geospatial-annotation-fundamentals-architecture/annotation-quality-metrics-and-agreement/"
  - label: "Measuring Inter-Annotator Agreement with Cohen's Kappa"
    url: "/geospatial-annotation-fundamentals-architecture/annotation-quality-metrics-and-agreement/measuring-inter-annotator-agreement-with-cohens-kappa/"
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
      "headline": "Measuring Inter-Annotator Agreement with Cohen's Kappa",
      "description": "Compute Cohen's kappa over matched geospatial features, read the confusion matrix that tells you whether the problem is an annotator or the taxonomy, and avoid the two ways kappa misleads on imbalanced classes.",
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
        {"@type": "ListItem", "position": 3, "name": "Annotation Quality Metrics & Inter-Annotator Agreement", "item": "https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/annotation-quality-metrics-and-agreement/"},
        {"@type": "ListItem", "position": 4, "name": "Measuring Inter-Annotator Agreement with Cohen's Kappa", "item": "https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/annotation-quality-metrics-and-agreement/measuring-inter-annotator-agreement-with-cohens-kappa/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Compute Cohen's kappa for a geospatial annotation batch",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Build the paired label vectors", "text": "Take the matched feature pairs from the overlap set and extract each annotator's class for each pair, keeping the pairs in a fixed order."},
        {"@type": "HowToStep", "position": 2, "name": "Fix the label set explicitly", "text": "Pass the full taxonomy as the label list so a class absent from this batch still occupies a row and column, keeping matrices comparable across batches."},
        {"@type": "HowToStep", "position": 3, "name": "Compute kappa and raw agreement together", "text": "Report both numbers; their difference is the class imbalance and is itself a finding."},
        {"@type": "HowToStep", "position": 4, "name": "Read the confusion matrix", "text": "Look for a single off-diagonal pair carrying most of the disagreement, which indicates a taxonomy problem rather than an annotator problem."},
        {"@type": "HowToStep", "position": 5, "name": "Break the score down per annotator", "text": "Compute pairwise kappa for each annotator against each other, so one person disagreeing with everybody is distinguishable from everybody disagreeing about one class."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What kappa value is good enough for a geospatial annotation project?",
          "acceptedAnswer": {"@type": "Answer", "text": "Treat 0.6 as the floor for a class that will be trained on, and 0.8 as the target for classes with crisp definitions. The published interpretation bands are guidance from other fields, not a standard; the more useful benchmark is your own best annotators' agreement with themselves, since no pair of different people will beat that."}
        },
        {
          "@type": "Question",
          "name": "Why is kappa low when raw agreement is high?",
          "acceptedAnswer": {"@type": "Answer", "text": "Because one class dominates. Kappa subtracts the agreement two annotators would reach by chance given their own class distributions, and when 92 percent of features belong to one class, chance agreement is already about 0.85. The residual skill is small, and kappa reports it honestly while raw agreement flatters it."}
        },
        {
          "@type": "Question",
          "name": "Can I use kappa with more than two annotators?",
          "acceptedAnswer": {"@type": "Answer", "text": "Cohen's kappa is defined for exactly two raters. For three or more, either report the mean of all pairwise kappas — which also shows whether one annotator is the outlier — or use Fleiss' kappa, which handles many raters but hides who disagrees with whom. The pairwise mean is usually more actionable."}
        },
        {
          "@type": "Question",
          "name": "Should geometry disagreement be folded into kappa?",
          "acceptedAnswer": {"@type": "Answer", "text": "No. Kappa is a categorical measure and needs matched pairs with a class each. Delineation quality is a continuous geometric quantity measured separately with boundary IoU. Mixing them produces a single number that moves for two unrelated reasons and cannot direct anyone to a fix."}
        }
      ]
    }
  ]
}
</script>

# Measuring Inter-Annotator Agreement with Cohen's Kappa

Cohen's kappa scores how much two annotators agree on class labels *beyond what chance would produce given their own labelling habits*. For matched features it takes their two class vectors and returns a number from below zero (worse than chance) to one (perfect). It exists because raw percentage agreement is inflated by class imbalance: on a batch where 92% of features are buildings, two annotators who call everything a building agree 92% of the time and demonstrate no skill at all. Kappa returns 0.0 for that pair, which is the honest answer. This guide computes it over geospatial features, reads the confusion matrix that says *why* it is low, and covers the two situations where kappa itself misleads.

## Why the Chance Correction Matters Here

Geospatial label distributions are extreme. A building-footprint project is mostly buildings; a land-cover project over farmland is mostly one crop class; an infrastructure project may have one class at 95% and four at one percent each. Under those distributions, raw agreement carries almost no information — it is a restatement of the class prior.

Kappa's correction is simple. Expected agreement is what you would get if each annotator independently drew labels from their own observed distribution. Observed agreement is what actually happened. Kappa is the fraction of the *available* improvement that was achieved:

```
kappa = (p_observed − p_expected) / (1 − p_expected)
```

When `p_expected` is 0.85 because one class dominates, an observed 0.92 yields kappa 0.47 — mediocre. When `p_expected` is 0.30 on a balanced taxonomy, an observed 0.92 yields kappa 0.89 — excellent. Same raw number, opposite verdicts, and the second is the one that reflects skill.

<svg viewBox="0 0 720 280" role="img" aria-label="The same observed agreement of 0.92 producing very different kappa values under two class distributions" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>0.92 observed agreement, two different verdicts</title>
  <desc>Under a balanced taxonomy, chance agreement is about 0.30, so an observed 0.92 uses most of the available headroom and kappa is 0.89. Under a taxonomy where one class holds 92 percent of features, chance agreement is already 0.85, leaving almost no headroom, and the same observed 0.92 yields kappa 0.47.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <!-- Balanced -->
  <text x="20" y="50" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">balanced taxonomy</text>
  <text x="20" y="68" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.7">5 classes, none over 30%</text>
  <line x1="220" y1="60" x2="680" y2="60" stroke="currentColor" stroke-width="1.2" opacity="0.5"/>
  <rect x="220" y="52" width="138" height="16" rx="3" fill="currentColor" opacity="0.25"/>
  <text x="289" y="65" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif">chance 0.30</text>
  <rect x="358" y="52" width="285" height="16" rx="3" fill="currentColor" opacity="0.5"/>
  <text x="500" y="65" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif">skill — the headroom actually used</text>
  <text x="220" y="94" font-size="10" fill="currentColor" font-family="monospace">observed 0.92 · expected 0.30 → kappa 0.89</text>
  <!-- Imbalanced -->
  <text x="20" y="160" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">one class dominates</text>
  <text x="20" y="178" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.7">top class 92%</text>
  <line x1="220" y1="170" x2="680" y2="170" stroke="currentColor" stroke-width="1.2" opacity="0.5"/>
  <rect x="220" y="162" width="391" height="16" rx="3" fill="currentColor" opacity="0.25"/>
  <text x="415" y="175" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif">chance 0.85 — nearly all of it</text>
  <rect x="611" y="162" width="32" height="16" rx="3" fill="currentColor" opacity="0.5"/>
  <text x="220" y="204" font-size="10" fill="currentColor" font-family="monospace">observed 0.92 · expected 0.85 → kappa 0.47</text>
  <!-- Note -->
  <rect x="220" y="228" width="460" height="34" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 3"/>
  <text x="450" y="250" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif">the gap between the two bars is what kappa measures, and raw agreement ignores</text>
</svg>

## Step-by-Step Implementation

### Step 1 — Install and Build the Paired Vectors

```bash
pip install scikit-learn==1.5.1 geopandas==0.14.4 pandas==2.2.2 numpy==1.26.4
```

Kappa needs two aligned label vectors, one per annotator, over the same matched features. The matching itself — deciding which of A's polygons corresponds to which of B's — is the step described in [annotation quality metrics and agreement](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/annotation-quality-metrics-and-agreement/); this guide starts from its output.

```python
import pandas as pd
import geopandas as gpd

def paired_labels(a: gpd.GeoDataFrame, b: gpd.GeoDataFrame, pairs: pd.DataFrame,
                  class_field: str = "class_name") -> tuple[list[str], list[str]]:
    """Two aligned class vectors over the matched pairs, in a stable order."""
    pairs = pairs.sort_values("ia").reset_index(drop=True)
    ya = [a.loc[int(r.ia), class_field] for r in pairs.itertuples()]
    yb = [b.iloc[int(r.ib)][class_field] for r in pairs.itertuples()]
    return ya, yb
```

Sorting the pairs is not cosmetic. Kappa itself is order-independent, but the confusion matrix you will read next is easier to diff between batches when the row order is stable.

### Step 2 — Fix the Label Set From the Taxonomy

Passing the labels explicitly, from the taxonomy rather than from the batch, keeps matrices comparable when a rare class happens to be absent.

```python
import json
from sklearn.metrics import cohen_kappa_score, confusion_matrix

def load_taxonomy_labels(path: str) -> list[str]:
    with open(path, encoding="utf-8") as fh:
        return sorted(json.load(fh)["classes"])

def agreement(ya: list[str], yb: list[str], labels: list[str]) -> dict:
    """Kappa, raw agreement and the confusion matrix over a fixed label set."""
    n = len(ya)
    raw = sum(x == y for x, y in zip(ya, yb)) / n if n else float("nan")
    return {
        "n_pairs": n,
        "kappa": float(cohen_kappa_score(ya, yb, labels=labels)) if n else float("nan"),
        "raw_agreement": float(raw),
        "labels": labels,
        "matrix": confusion_matrix(ya, yb, labels=labels).tolist(),
    }
```

Reporting `n_pairs` alongside the score is what stops a kappa computed on eleven features being read with the same confidence as one computed on nine hundred.

### Step 3 — Read the Confusion Matrix, Not Just the Number

A low kappa is a symptom. The matrix says which disagreement produced it, and the shape of the answer determines who fixes it.

<svg viewBox="0 0 700 280" role="img" aria-label="A confusion matrix whose disagreement is concentrated in one class pair, against one where it is spread" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:700px;display:block;margin:1.5rem auto;">
  <title>Where the off-diagonal mass sits decides who fixes it</title>
  <desc>On the left almost all disagreement is in a single pair of cells, orchard against cropland, which means the taxonomy has not separated those two on this imagery. On the right the same total disagreement is spread thinly across many pairs, which is a care-and-training pattern rather than a definitions problem.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <!-- Concentrated -->
  <text x="170" y="34" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">concentrated — fix the taxonomy</text>
  <g font-family="monospace" font-size="9" fill="currentColor" opacity="0.75">
    <text x="104" y="60" text-anchor="middle">bldg</text><text x="152" y="60" text-anchor="middle">crop</text>
    <text x="200" y="60" text-anchor="middle">orch</text><text x="248" y="60" text-anchor="middle">watr</text>
    <text x="66" y="86" text-anchor="end">bldg</text><text x="66" y="118" text-anchor="end">crop</text>
    <text x="66" y="150" text-anchor="end">orch</text><text x="66" y="182" text-anchor="end">watr</text>
  </g>
  <rect x="80" y="70" width="48" height="26" fill="currentColor" opacity="0.5"/>
  <rect x="128" y="102" width="48" height="26" fill="currentColor" opacity="0.5"/>
  <rect x="176" y="134" width="48" height="26" fill="currentColor" opacity="0.5"/>
  <rect x="224" y="166" width="48" height="26" fill="currentColor" opacity="0.5"/>
  <rect x="176" y="102" width="48" height="26" fill="currentColor" opacity="0.35"/>
  <rect x="128" y="134" width="48" height="26" fill="currentColor" opacity="0.35"/>
  <g font-family="monospace" font-size="9" fill="currentColor">
    <text x="104" y="88" text-anchor="middle">412</text><text x="152" y="120" text-anchor="middle">288</text>
    <text x="200" y="152" text-anchor="middle">96</text><text x="248" y="184" text-anchor="middle">140</text>
    <text x="200" y="120" text-anchor="middle">61</text><text x="152" y="152" text-anchor="middle">58</text>
  </g>
  <text x="170" y="222" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.85">119 of 127 disagreements are orchard ↔ cropland</text>
  <text x="170" y="240" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">no annotator training fixes a missing definition</text>
  <!-- Spread -->
  <text x="510" y="34" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">spread — train the annotators</text>
  <g font-family="monospace" font-size="9" fill="currentColor" opacity="0.75">
    <text x="444" y="60" text-anchor="middle">bldg</text><text x="492" y="60" text-anchor="middle">crop</text>
    <text x="540" y="60" text-anchor="middle">orch</text><text x="588" y="60" text-anchor="middle">watr</text>
    <text x="406" y="86" text-anchor="end">bldg</text><text x="406" y="118" text-anchor="end">crop</text>
    <text x="406" y="150" text-anchor="end">orch</text><text x="406" y="182" text-anchor="end">watr</text>
  </g>
  <rect x="420" y="70" width="48" height="26" fill="currentColor" opacity="0.5"/>
  <rect x="468" y="102" width="48" height="26" fill="currentColor" opacity="0.5"/>
  <rect x="516" y="134" width="48" height="26" fill="currentColor" opacity="0.5"/>
  <rect x="564" y="166" width="48" height="26" fill="currentColor" opacity="0.5"/>
  <g fill="currentColor" opacity="0.22">
    <rect x="468" y="70" width="48" height="26"/><rect x="516" y="70" width="48" height="26"/><rect x="564" y="70" width="48" height="26"/>
    <rect x="420" y="102" width="48" height="26"/><rect x="516" y="102" width="48" height="26"/><rect x="564" y="102" width="48" height="26"/>
    <rect x="420" y="134" width="48" height="26"/><rect x="468" y="134" width="48" height="26"/><rect x="564" y="134" width="48" height="26"/>
    <rect x="420" y="166" width="48" height="26"/><rect x="468" y="166" width="48" height="26"/><rect x="516" y="166" width="48" height="26"/>
  </g>
  <g font-family="monospace" font-size="9" fill="currentColor">
    <text x="444" y="88" text-anchor="middle">398</text><text x="492" y="120" text-anchor="middle">274</text>
    <text x="540" y="152" text-anchor="middle">88</text><text x="588" y="184" text-anchor="middle">132</text>
  </g>
  <text x="510" y="222" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.85">127 disagreements across all twelve pairs</text>
  <text x="510" y="240" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">no definition is missing — attention is</text>
  <text x="350" y="270" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">both matrices report the same kappa; only the shape says what to do about it</text>
</svg>

```python
def dominant_confusion(result: dict, top_k: int = 3) -> list[tuple[str, str, int]]:
    """The largest off-diagonal cells: which class pairs the disagreement lives in."""
    labels, m = result["labels"], result["matrix"]
    cells = [(labels[i], labels[j], m[i][j])
             for i in range(len(labels)) for j in range(len(labels)) if i != j and m[i][j]]
    return sorted(cells, key=lambda c: c[2], reverse=True)[:top_k]
```

If one pair holds most of the mass — `orchard` against `cropland`, say — the taxonomy has not distinguished them on this imagery, and no amount of annotator training will help. If the off-diagonal mass is spread evenly, the disagreement is about care rather than definitions, and it is a training conversation.

### Step 4 — Go Pairwise Across Annotators

With three or more people, the mean of pairwise kappas answers a question Fleiss' kappa cannot: is one person the outlier?

```python
from itertools import combinations

def pairwise_matrix(labels_by_annotator: dict[str, list[str]], labels: list[str]) -> pd.DataFrame:
    """Kappa for every pair of annotators over their common features."""
    names = sorted(labels_by_annotator)
    out = pd.DataFrame(index=names, columns=names, dtype=float)
    for x, y in combinations(names, 2):
        k = cohen_kappa_score(labels_by_annotator[x], labels_by_annotator[y], labels=labels)
        out.loc[x, y] = out.loc[y, x] = round(float(k), 3)
    return out
```

An annotator whose row is uniformly low disagrees with everyone, which is one conversation. A matrix where every cell is low is a taxonomy problem affecting the whole team, which is a different one.

<svg viewBox="0 0 720 290" role="img" aria-label="Two pairwise kappa matrices: one with a single low row, one uniformly low" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>One outlier, or everybody</title>
  <desc>In the left matrix three annotators agree well with each other and all disagree with the fourth, whose row is uniformly low: that is one person's calibration. In the right matrix every pair sits between 0.38 and 0.44, so nobody is the outlier and the classes themselves are not separable on this imagery.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <!-- Left -->
  <text x="170" y="34" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">one annotator is the outlier</text>
  <text x="90" y="62" font-size="10" fill="currentColor" font-family="monospace" opacity="0.75">A</text>
  <text x="140" y="62" font-size="10" fill="currentColor" font-family="monospace" opacity="0.75">B</text>
  <text x="190" y="62" font-size="10" fill="currentColor" font-family="monospace" opacity="0.75">C</text>
  <text x="240" y="62" font-size="10" fill="currentColor" font-family="monospace" opacity="0.75">D</text>
  <text x="52" y="90" font-size="10" fill="currentColor" font-family="monospace" opacity="0.75">A</text>
  <text x="52" y="122" font-size="10" fill="currentColor" font-family="monospace" opacity="0.75">B</text>
  <text x="52" y="154" font-size="10" fill="currentColor" font-family="monospace" opacity="0.75">C</text>
  <text x="52" y="186" font-size="10" fill="currentColor" font-family="monospace" opacity="0.75">D</text>
  <g font-family="monospace" font-size="10" fill="currentColor">
    <text x="140" y="90" text-anchor="middle">0.86</text><text x="190" y="90" text-anchor="middle">0.84</text><text x="240" y="90" text-anchor="middle">0.41</text>
    <text x="90" y="122" text-anchor="middle">0.86</text><text x="190" y="122" text-anchor="middle">0.88</text><text x="240" y="122" text-anchor="middle">0.39</text>
    <text x="90" y="154" text-anchor="middle">0.84</text><text x="140" y="154" text-anchor="middle">0.88</text><text x="240" y="154" text-anchor="middle">0.37</text>
    <text x="90" y="186" text-anchor="middle">0.41</text><text x="140" y="186" text-anchor="middle">0.39</text><text x="190" y="186" text-anchor="middle">0.37</text>
  </g>
  <rect x="66" y="170" width="200" height="24" rx="4" fill="none" stroke="currentColor" stroke-width="1.6"/>
  <text x="170" y="228" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.85">D's whole row is low — a calibration</text>
  <text x="170" y="244" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.85">conversation with one person</text>
  <!-- Right -->
  <text x="530" y="34" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">nobody is the outlier</text>
  <text x="450" y="62" font-size="10" fill="currentColor" font-family="monospace" opacity="0.75">A</text>
  <text x="500" y="62" font-size="10" fill="currentColor" font-family="monospace" opacity="0.75">B</text>
  <text x="550" y="62" font-size="10" fill="currentColor" font-family="monospace" opacity="0.75">C</text>
  <text x="600" y="62" font-size="10" fill="currentColor" font-family="monospace" opacity="0.75">D</text>
  <text x="412" y="90" font-size="10" fill="currentColor" font-family="monospace" opacity="0.75">A</text>
  <text x="412" y="122" font-size="10" fill="currentColor" font-family="monospace" opacity="0.75">B</text>
  <text x="412" y="154" font-size="10" fill="currentColor" font-family="monospace" opacity="0.75">C</text>
  <text x="412" y="186" font-size="10" fill="currentColor" font-family="monospace" opacity="0.75">D</text>
  <g font-family="monospace" font-size="10" fill="currentColor">
    <text x="500" y="90" text-anchor="middle">0.42</text><text x="550" y="90" text-anchor="middle">0.40</text><text x="600" y="90" text-anchor="middle">0.38</text>
    <text x="450" y="122" text-anchor="middle">0.42</text><text x="550" y="122" text-anchor="middle">0.44</text><text x="600" y="122" text-anchor="middle">0.41</text>
    <text x="450" y="154" text-anchor="middle">0.40</text><text x="500" y="154" text-anchor="middle">0.44</text><text x="600" y="154" text-anchor="middle">0.39</text>
    <text x="450" y="186" text-anchor="middle">0.38</text><text x="500" y="186" text-anchor="middle">0.41</text><text x="550" y="186" text-anchor="middle">0.39</text>
  </g>
  <rect x="426" y="70" width="200" height="126" rx="4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="4 2"/>
  <text x="530" y="228" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.85">every pair is low — the classes are not</text>
  <text x="530" y="244" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.85">separable on this imagery</text>
  <text x="360" y="274" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">a single mean kappa reports 0.62 on the left and 0.41 on the right, and hides which of the two you are looking at</text>
</svg>

## Parameters and Thresholds Reference

| Quantity | Value | Meaning |
|---|---|---|
| Kappa floor, trainable class | 0.60 | Below this, the class is a taxonomy question |
| Kappa target, crisp class | ≥ 0.80 | Buildings, roads, solar arrays on decent imagery |
| Minimum pairs for a per-class score | ~50 | Below that the estimate swings on a handful of features |
| Self-agreement ceiling | measure once | No pair of people beats one person against themselves |
| Reporting cadence | per batch, per class | A project-level mean hides the class that is failing |

## Common Errors and Fixes

**`ValueError: Number of classes ... does not match`**
Root cause: `labels` was inferred from one vector rather than passed explicitly.
Fix: always pass the full taxonomy list, as in Step 2.

**Kappa is `nan`**
Root cause: every feature in the batch has the same class in both vectors, so the expected-agreement denominator is zero.
Fix: report `raw_agreement` and `n_pairs` instead, and note that kappa is undefined here — it is not zero, and reporting it as zero is a mistake that reads as a broken team.

**Kappa is negative**
Root cause: the two annotators systematically disagree — often because one is using an old taxonomy version where two class names swapped meaning.
Fix: check the taxonomy version each annotation was made under before concluding anything about people, using the versioned taxonomy described in [defining ROI label taxonomies](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/defining-roi-label-taxonomies-for-aerial-imagery/).

**Agreement collapses after adding a class**
Root cause: a new class carved out of an existing one, so features that were unambiguous now have two plausible labels.
Fix: expected. Re-adjudicate a sample under the new taxonomy and treat the pre-change kappa as belonging to a different measurement.

## Frequently Asked Questions

### Does kappa work for multi-label annotation?

Not directly — it assumes exactly one class per feature. Where a feature can carry several labels, compute a per-label binary kappa (present versus absent) and report the vector. Averaging those into one number reintroduces exactly the imbalance problem kappa exists to remove.

### How large should the overlap set be for a stable kappa?

Enough that each class you care about has roughly fifty matched pairs. For a taxonomy with a long tail that means stratifying the overlap set so rare classes appear in it, rather than sampling tiles uniformly and hoping.

### Should model predictions be scored with kappa against human labels?

You can, and it is a reasonable monitoring signal, but keep the series separate from human-versus-human agreement. Mixing them makes the number move when the model is retrained, so it stops measuring the annotation team — which is what it was for.

### What about weighted kappa?

Weighted kappa penalises some confusions more than others, which fits ordered classes — `low`, `medium`, `high` density — where confusing adjacent levels is milder than confusing extremes. For unordered land-cover classes there is no natural weighting and the unweighted form is the honest choice.

## Related

- [Annotation Quality Metrics & Inter-Annotator Agreement](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/annotation-quality-metrics-and-agreement/) — the matching step that produces the pairs, and the geometry half of the measurement
- [Computing Boundary IoU for Footprint Quality](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/annotation-quality-metrics-and-agreement/computing-boundary-iou-for-footprint-quality/) — the delineation score that answers the question kappa deliberately does not
- [Defining ROI Label Taxonomies for Aerial Imagery](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/defining-roi-label-taxonomies-for-aerial-imagery/) — where a persistently low per-class kappa sends you

This measurement is one part of the [Annotation Quality Metrics & Inter-Annotator Agreement](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/annotation-quality-metrics-and-agreement/) topic within [Geospatial Annotation Fundamentals & Architecture](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/).
