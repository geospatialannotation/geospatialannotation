---
title: "Cold-Start Strategies for New Annotation Projects"
description: "Active learning needs a model and a new project has none. Seed the first batch with spatial stratification, zero-shot pre-labels and diversity sampling, then hand over to uncertainty once the scores mean something."
slug: "cold-start-strategies-for-new-annotation-projects"
type: "guide"
breadcrumb:
  - label: "Home"
    url: "/"
  - label: "Active Learning & Model Feedback Loops for Geospatial Annotation"
    url: "/active-learning-model-feedback-loops/"
  - label: "Cold-Start Strategies for New Annotation Projects"
    url: "/active-learning-model-feedback-loops/cold-start-strategies-for-new-annotation-projects/"
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
      "headline": "Cold-Start Strategies for New Annotation Projects",
      "description": "Active learning needs a model and a new project has none. Seed the first batch with spatial stratification, zero-shot pre-labels and diversity sampling, then hand over to uncertainty once the scores mean something.",
      "datePublished": "2026-08-08",
      "dateModified": "2026-08-08",
      "author": {"@type": "Organization", "name": "Geospatial Annotation"},
      "publisher": {"@type": "Organization", "name": "Geospatial Annotation"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.geospatialannotation.com/"},
        {"@type": "ListItem", "position": 2, "name": "Active Learning & Model Feedback Loops for Geospatial Annotation", "item": "https://www.geospatialannotation.com/active-learning-model-feedback-loops/"},
        {"@type": "ListItem", "position": 3, "name": "Cold-Start Strategies for New Annotation Projects", "item": "https://www.geospatialannotation.com/active-learning-model-feedback-loops/cold-start-strategies-for-new-annotation-projects/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Seed the first annotation batches for a new geospatial project",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Stratify the pool by geography and imagery", "text": "Bucket the unlabeled pool by region, acquisition date and sensor so the first batch cannot come from one city on one sunny morning."},
        {"@type": "HowToStep", "position": 2, "name": "Sample for coverage, not for uncertainty", "text": "Take a spatially spread sample within each stratum, because with no model there is no uncertainty signal and coverage is the only thing worth optimising."},
        {"@type": "HowToStep", "position": 3, "name": "Pre-label with a zero-shot model", "text": "Run a foundation segmentation model to propose geometry that annotators correct, which cuts the cost of the first batch without pretending to supply the class."},
        {"@type": "HowToStep", "position": 4, "name": "Freeze a seed evaluation set first", "text": "Label a small blocked evaluation set before any training, so every later checkpoint is measured against ground that was never actively selected."},
        {"@type": "HowToStep", "position": 5, "name": "Hand over to uncertainty when the scores calibrate", "text": "Switch from coverage sampling to uncertainty sampling only once the model's confidence tracks its accuracy, which is a measurable condition rather than a round number of labels."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "How many labels are needed before uncertainty sampling starts helping?",
          "acceptedAnswer": {"@type": "Answer", "text": "There is no universal count, and the useful test is not a count. Fit a temperature on a held-out slice and measure expected calibration error: while the model is badly calibrated its uncertainty ranking is close to arbitrary, so coverage sampling still wins. In practice that crossover often falls somewhere between one and three thousand labelled tiles, but measure it rather than assuming it."}
        },
        {
          "@type": "Question",
          "name": "Can a foundation model supply the labels as well as the geometry?",
          "acceptedAnswer": {"@type": "Answer", "text": "It supplies geometry well and classes badly. Segment-anything style models return masks with no semantics, and open-vocabulary detectors return classes drawn from their own training distribution rather than your taxonomy. Use them to save the tracing time, which is the expensive part, and have a human assign the class from your own taxonomy."}
        },
        {
          "@type": "Question",
          "name": "Why not just label a random sample to start?",
          "acceptedAnswer": {"@type": "Answer", "text": "A random sample of a geospatial pool is dominated by whatever the pool is dominated by — usually one region, one season, and a lot of empty ground. Stratifying by region, date and sensor first, then sampling for spread inside each stratum, produces a first batch that covers the variation the model will actually meet, at the same labelling cost."}
        },
        {
          "@type": "Question",
          "name": "Should the seed evaluation set be selected the same way as training data?",
          "acceptedAnswer": {"@type": "Answer", "text": "No, and it must never be actively selected. An evaluation set drawn by uncertainty is biased toward the cases the model finds hard, which makes it useless for tracking real performance. Draw it as spatially blocked random ground, freeze it before the first training run, and leave it alone."}
        }
      ]
    }
  ]
}
</script>

# Cold-Start Strategies for New Annotation Projects

Active learning has a chicken-and-egg problem at the start of every project: the loop selects tiles the model is unsure about, and there is no model. The usual response is to label a random few thousand tiles and start the loop, which wastes most of that budget — a random sample of an aerial pool is mostly ground with nothing in it, drawn from whichever region happens to dominate the archive, on whichever days happened to be cloud-free.

The cold-start phase deserves its own strategy, and it is a different strategy: **coverage rather than uncertainty**. With no model, the only thing worth optimising is how much of the variation the first batch contains. This topic covers stratifying the pool, sampling for spread inside each stratum, using a zero-shot model to cut the tracing cost, freezing an evaluation set that active learning can never contaminate, and the measurable condition for handing over to [uncertainty sampling](https://www.geospatialannotation.com/active-learning-model-feedback-loops/uncertainty-sampling-for-geospatial-active-learning/).

## Prerequisites & Toolchain Alignment

```bash
pip install geopandas==0.14.4 shapely==2.0.6 pyproj==3.6.1 \
            scikit-learn==1.5.1 numpy==1.26.4 rasterio==1.3.10 torch==2.3.1
```

What the cold-start phase needs that later rounds do not:

- **Pool metadata before pixels.** Region, acquisition date, sensor and cloud cover per tile, which comes from the [STAC catalog](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/integrating-stac-catalogs-with-versioned-datasets/) rather than from reading imagery. Stratification runs on the metadata alone.
- **A cheap embedding, optionally.** A small pretrained encoder over a downsampled tile gives a feature vector for diversity sampling. It is not required — geographic spread alone is a decent proxy — but it catches the case where two distant tiles look identical.
- **A frozen evaluation plan.** Decide the blocked evaluation set before labelling anything, following [reproducible train/validation splits](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/reproducible-train-validation-splits/). Doing it afterwards means the evaluation set is drawn from ground the active loop has already picked over.

<svg viewBox="0 0 720 300" role="img" aria-label="Three phases of a project's labelling strategy: coverage, mixed, and uncertainty-driven" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>What each phase of a new project should optimise</title>
  <desc>In the cold-start phase there is no model, so batches are chosen for coverage: stratified by region, date and sensor, spread within each stratum. In the transition phase a model exists but its confidence does not yet track its accuracy, so batches mix coverage and uncertainty. Once calibration error falls below the threshold, uncertainty and diversity take over and coverage sampling retires.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <!-- Phase bar -->
  <rect x="20" y="56" width="220" height="54" rx="6" fill="none" stroke="currentColor" stroke-width="2"/>
  <text x="130" y="80" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">cold start</text>
  <text x="130" y="98" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">no model at all</text>
  <line x1="240" y1="83" x2="266" y2="83" stroke="currentColor" stroke-width="1.5" marker-end="url(#cs-arr)"/>
  <defs>
    <marker id="cs-arr" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor"/>
    </marker>
  </defs>
  <rect x="268" y="56" width="200" height="54" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 3"/>
  <text x="368" y="80" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">transition</text>
  <text x="368" y="98" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">a model, badly calibrated</text>
  <line x1="468" y1="83" x2="494" y2="83" stroke="currentColor" stroke-width="1.5" marker-end="url(#cs-arr)"/>
  <rect x="496" y="56" width="204" height="54" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="598" y="80" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">active learning</text>
  <text x="598" y="98" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">confidence tracks accuracy</text>
  <!-- What is optimised -->
  <text x="130" y="146" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">coverage</text>
  <text x="130" y="166" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">stratify by region, date,</text>
  <text x="130" y="180" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">sensor; spread inside each</text>
  <text x="368" y="146" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">both, weighted</text>
  <text x="368" y="166" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">half the batch by coverage,</text>
  <text x="368" y="180" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">half by the model's doubts</text>
  <text x="598" y="146" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">uncertainty + diversity</text>
  <text x="598" y="166" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">rank by score, thin by</text>
  <text x="598" y="180" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">feature-space distance</text>
  <!-- Handover condition -->
  <rect x="120" y="208" width="480" height="66" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 3"/>
  <text x="360" y="232" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">the handover is a measurement, not a milestone</text>
  <text x="360" y="252" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">move on when expected calibration error on a held-out slice falls below about 0.05 —</text>
  <text x="360" y="268" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">before that, the ranking the loop depends on is close to arbitrary</text>
</svg>

## Cold-Start Workflow

### Step 1 — Stratify the Pool on Metadata

Strata are the axes along which the model will be expected to generalise. For most aerial and satellite projects those are geography, time of year and sensor — and the pool is almost never balanced across them.

```python
import geopandas as gpd
import pandas as pd

def build_strata(pool: gpd.GeoDataFrame, region_col: str = "admin_area",
                 date_col: str = "acquired", sensor_col: str = "platform") -> pd.Series:
    """A stratum key per tile, from metadata only — no pixels are read."""
    season = pd.to_datetime(pool[date_col]).dt.quarter.map(
        {1: "winter", 2: "spring", 3: "summer", 4: "autumn"})
    return (pool[region_col].astype(str) + "|" + season + "|" + pool[sensor_col].astype(str))

def stratum_report(pool: gpd.GeoDataFrame, strata: pd.Series) -> pd.DataFrame:
    """What the pool actually contains — usually a surprise."""
    counts = strata.value_counts().rename("tiles").to_frame()
    counts["share"] = (counts["tiles"] / counts["tiles"].sum()).round(4)
    return counts
```

Run the report before deciding anything. A pool that is 71% one city in summer is normal, and it is exactly why a random first batch teaches the model that summer in that city is what the world looks like.

### Step 2 — Sample for Spread, Not Proportionally

Proportional sampling reproduces the pool's imbalance in the labelled set. For a first batch, allocate closer to evenly across strata — capped by what each stratum can supply — and inside each stratum pick tiles that are far apart.

<svg viewBox="0 0 700 270" role="img" aria-label="Two labelling budgets spent by a random first batch and by a stratified spread sample, and what each teaches the model" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:700px;display:block;margin:1.5rem auto;">
  <title>The same 400 tiles, drawn two ways</title>
  <desc>A random first batch clusters where the archive is dense, so most tiles come from a small area and much of the study region is unrepresented. Farthest-point sampling within strata spreads the same 400 tiles across the region, so the first model has seen every part of the ground it will be asked about — at identical annotation cost.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <!-- Random -->
  <text x="170" y="34" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">random from the pool</text>
  <rect x="50" y="50" width="240" height="160" fill="none" stroke="currentColor" stroke-width="1.3"/>
  <g fill="currentColor" opacity="0.55">
    <circle cx="112" cy="96" r="3"/><circle cx="120" cy="104" r="3"/><circle cx="128" cy="92" r="3"/>
    <circle cx="118" cy="118" r="3"/><circle cx="134" cy="110" r="3"/><circle cx="106" cy="112" r="3"/>
    <circle cx="126" cy="128" r="3"/><circle cx="140" cy="122" r="3"/><circle cx="112" cy="134" r="3"/>
    <circle cx="146" cy="100" r="3"/><circle cx="132" cy="140" r="3"/><circle cx="100" cy="124" r="3"/>
    <circle cx="152" cy="130" r="3"/><circle cx="142" cy="88" r="3"/><circle cx="96" cy="102" r="3"/>
    <circle cx="212" cy="166" r="3"/><circle cx="238" cy="74" r="3"/>
  </g>
  <text x="170" y="234" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.85">most of the region is unrepresented</text>
  <text x="170" y="252" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">because most of the archive is one place</text>
  <!-- Spread -->
  <text x="510" y="34" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">spread within strata</text>
  <rect x="390" y="50" width="240" height="160" fill="none" stroke="currentColor" stroke-width="1.3"/>
  <g fill="currentColor" opacity="0.55">
    <circle cx="412" cy="70" r="3"/><circle cx="470" cy="64" r="3"/><circle cx="536" cy="72" r="3"/><circle cx="602" cy="66" r="3"/>
    <circle cx="440" cy="104" r="3"/><circle cx="504" cy="98" r="3"/><circle cx="570" cy="106" r="3"/><circle cx="614" cy="100" r="3"/>
    <circle cx="410" cy="140" r="3"/><circle cx="474" cy="134" r="3"/><circle cx="540" cy="142" r="3"/><circle cx="606" cy="136" r="3"/>
    <circle cx="436" cy="180" r="3"/><circle cx="500" cy="176" r="3"/><circle cx="566" cy="184" r="3"/><circle cx="618" cy="172" r="3"/>
    <circle cx="472" cy="200" r="3"/>
  </g>
  <text x="510" y="234" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.85">every part of the region has a sample</text>
  <text x="510" y="252" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">same 400 tiles, same annotator hours</text>
</svg>

```python
import numpy as np

def allocate(strata_counts: pd.Series, batch_size: int, evenness: float = 0.7) -> dict[str, int]:
    """Blend proportional and uniform allocation. evenness=1.0 is fully uniform."""
    prop = strata_counts / strata_counts.sum()
    unif = pd.Series(1.0 / len(strata_counts), index=strata_counts.index)
    mix = (1 - evenness) * prop + evenness * unif
    alloc = (mix / mix.sum() * batch_size).round().astype(int)
    return {k: int(min(v, strata_counts[k])) for k, v in alloc.items()}

def spread_sample(tiles: gpd.GeoDataFrame, n: int, seed: int = 0) -> list:
    """Greedy farthest-point sampling on tile centroids: maximal geographic spread."""
    if len(tiles) <= n:
        return list(tiles.index)
    pts = np.column_stack([tiles.geometry.centroid.x, tiles.geometry.centroid.y])
    rng = np.random.default_rng(seed)
    chosen = [int(rng.integers(len(pts)))]
    dist = np.linalg.norm(pts - pts[chosen[0]], axis=1)
    for _ in range(n - 1):
        nxt = int(np.argmax(dist))
        chosen.append(nxt)
        dist = np.minimum(dist, np.linalg.norm(pts - pts[nxt], axis=1))
    return [tiles.index[i] for i in chosen]
```

Farthest-point sampling is the cheap version of diversity sampling and needs no model. It is also the step that stops the first batch being forty tiles of the same industrial estate, which is what uniform random sampling within a small stratum tends to produce.

### Step 3 — Pre-Label the Geometry, Not the Class

A zero-shot segmentation model cuts the expensive part of the first batch — tracing — without pretending to know your taxonomy. The annotator's job becomes accept, adjust or delete, plus assigning the class.

```python
from dataclasses import dataclass

@dataclass(frozen=True)
class SeedProposal:
    tile_id: str
    geometry_wkt: str
    source: str          # "sam" | "manual"
    class_name: None     # deliberately empty: the model does not get a vote

def to_prelabels(masks, tile_id: str, transform, crs: str) -> list[SeedProposal]:
    """Vectorise zero-shot masks into class-less proposals for human classification."""
    from rasterio.features import shapes
    from shapely.geometry import shape
    out: list[SeedProposal] = []
    for mask in masks:
        for geom, value in shapes(mask.astype("uint8"), mask=mask, transform=transform):
            if value != 1:
                continue
            poly = shape(geom).simplify(0.3).buffer(0)
            if poly.is_empty or poly.area < 20.0:          # square metres, projected CRS
                continue
            out.append(SeedProposal(tile_id, poly.wkt, "sam", None))
    return out
```

Setting `class_name` to `None` is a design decision, not an omission. A pre-label that arrives with a confident wrong class costs more than one that arrives with none: annotators accept plausible defaults, and the resulting bias is invisible in throughput metrics. The mechanics of running the model over tiles are covered in [automating pre-labeling with foundation models](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/automating-pre-labeling-with-foundation-models/).

### Step 4 — Freeze the Evaluation Set First

The evaluation set must be drawn before the active loop starts and never touched by it. Draw it as blocked random ground, label it, freeze it.

```python
def carve_seed_eval(pool: gpd.GeoDataFrame, salt: str, share: float = 0.15) -> gpd.GeoDataFrame:
    """Blocked random evaluation ground, chosen before any model exists."""
    from pipeline.split import block_id, assign_split      # see the splits topic
    blocks = [block_id(g.centroid.x, g.centroid.y, block_m=1200.0) for g in pool.geometry]
    pool = pool.assign(block=blocks)
    pool["split"] = [assign_split(b, salt=salt, val_share=share, test_share=0.0) for b in blocks]
    return pool[pool["split"] == "val"]
```

Label this set with the same care as training data — better, if anything, since every future decision is measured against it. Then leave it alone. An evaluation set that grows as the project goes on cannot be compared with itself across time, which defeats the purpose of having one.

<svg viewBox="0 0 720 290" role="img" aria-label="A pool dominated by one stratum, and the difference between proportional and evened allocation for the first batch" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>What proportional sampling does to a lopsided pool</title>
  <desc>The unlabeled pool is 71 percent one city in summer, 18 percent a second region, 8 percent winter imagery and 3 percent a second sensor. A proportional first batch of 400 tiles reproduces that: 284 tiles of the dominant stratum and 12 of the second sensor. An evened allocation gives 150, 110, 80 and 60, covering the variation the model will meet at the same labelling cost.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <!-- Pool -->
  <text x="20" y="44" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">the pool</text>
  <rect x="120" y="32" width="412" height="20" rx="3" fill="currentColor" opacity="0.45"/>
  <rect x="532" y="32" width="104" height="20" rx="3" fill="currentColor" opacity="0.3"/>
  <rect x="636" y="32" width="46" height="20" rx="3" fill="currentColor" opacity="0.2"/>
  <rect x="682" y="32" width="18" height="20" rx="3" fill="none" stroke="currentColor" stroke-width="1.2"/>
  <text x="326" y="47" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif">city A, summer — 71%</text>
  <text x="584" y="47" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif">18%</text>
  <text x="659" y="47" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif">8%</text>
  <!-- Proportional -->
  <text x="20" y="104" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">proportional</text>
  <text x="20" y="120" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.7">400 tiles</text>
  <rect x="120" y="92" width="412" height="20" rx="3" fill="currentColor" opacity="0.45"/>
  <rect x="532" y="92" width="104" height="20" rx="3" fill="currentColor" opacity="0.3"/>
  <rect x="636" y="92" width="46" height="20" rx="3" fill="currentColor" opacity="0.2"/>
  <rect x="682" y="92" width="18" height="20" rx="3" fill="none" stroke="currentColor" stroke-width="1.2"/>
  <text x="326" y="107" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace">284</text>
  <text x="584" y="107" text-anchor="middle" font-size="9" fill="currentColor" font-family="monospace">72</text>
  <text x="659" y="107" text-anchor="middle" font-size="9" fill="currentColor" font-family="monospace">32</text>
  <text x="120" y="136" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">the second sensor gets 12 tiles — the model will meet it in production and has never seen it</text>
  <!-- Evened -->
  <text x="20" y="184" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">evened</text>
  <text x="20" y="200" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.7">400 tiles</text>
  <rect x="120" y="172" width="174" height="20" rx="3" fill="currentColor" opacity="0.45"/>
  <rect x="294" y="172" width="128" height="20" rx="3" fill="currentColor" opacity="0.3"/>
  <rect x="422" y="172" width="93" height="20" rx="3" fill="currentColor" opacity="0.2"/>
  <rect x="515" y="172" width="70" height="20" rx="3" fill="none" stroke="currentColor" stroke-width="1.2"/>
  <text x="207" y="187" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace">150</text>
  <text x="358" y="187" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace">110</text>
  <text x="468" y="187" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace">80</text>
  <text x="550" y="187" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace">60</text>
  <text x="120" y="216" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">same budget, four strata genuinely represented — capped by what each one can supply</text>
  <text x="360" y="256" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">evenness is a dial, not a switch: 0.7 leaves the dominant stratum largest without letting it crowd out the rest</text>
  <text x="360" y="274" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">and once the loop is running, uncertainty decides — this allocation is for the batches before that</text>
</svg>

### Step 5 — Hand Over on a Measurement

The switch from coverage to uncertainty is not a milestone in a schedule; it is a property of the model. Uncertainty sampling only works when the model's confidence tracks its accuracy, and that is measurable.

```python
import numpy as np

def expected_calibration_error(conf: np.ndarray, correct: np.ndarray, bins: int = 15) -> float:
    """Standard ECE over equal-width confidence bins."""
    edges = np.linspace(0.0, 1.0, bins + 1)
    ece = 0.0
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (conf > lo) & (conf <= hi)
        if not m.any():
            continue
        ece += m.mean() * abs(correct[m].mean() - conf[m].mean())
    return float(ece)

def ready_for_uncertainty(conf: np.ndarray, correct: np.ndarray, threshold: float = 0.05) -> bool:
    """Is the model's confidence trustworthy enough to rank an annotation queue?"""
    return expected_calibration_error(conf, correct) <= threshold
```

Until that returns `True`, keep at least half the batch on coverage. The intermediate mix costs little and protects against the common failure of a project that switched to uncertainty at 500 labels, spent three rounds annotating whatever the under-trained model found confusing, and produced a training set concentrated on one kind of confusion. Fitting the temperature that makes the check meaningful is covered in [calibrating confidence scores with temperature scaling](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/confidence-scoring-for-geospatial-labels/calibrating-confidence-scores-with-temperature-scaling/).

## Cold-Start Parameters & Configuration Reference

| Parameter | Typical | Notes |
|---|---|---|
| First batch size | 300 – 800 tiles | Large enough to train something, small enough to redirect after |
| `evenness` | 0.6 – 0.8 | 1.0 over-weights strata with 30 tiles in them |
| Seed eval share | 10 – 15% of the pool's blocks | Frozen before the first training run |
| Pre-label min area | 20 m² | Below this, correcting the proposal costs more than drawing it |
| ECE handover threshold | ≤ 0.05 | Measured on a held-out slice, after temperature fitting |
| Coverage share during transition | 50%, decaying | Reaches zero when ECE has been under threshold for two rounds |

## Edge Cases & Gotchas

**A stratum with almost nothing in it.** Three winter tiles is not a stratum; it is a gap in the archive. Allocating it 60 tiles is impossible and allocating it three tells the model nothing. Record it as a known coverage gap and, if the model must work there, acquire imagery rather than pretending.

**Pre-labels that make annotators lazy.** Proposal acceptance rates above about 90% usually mean people are accepting rather than checking. Sample a slice for adjudication as described in [annotation quality metrics and agreement](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/annotation-quality-metrics-and-agreement/), and watch whether the corrected fraction changes when the model improves.

**Farthest-point sampling on a lopsided extent.** A pool that includes one tile from a distant island will always pick it first, and possibly a few of its neighbours, because it is far from everything. Run the spread sample inside strata rather than over the whole pool.

**Evaluation ground labelled by the least experienced annotator.** Because the seed evaluation set is labelled first, it is often labelled by whoever is available before the team is trained. That set then defines the ceiling for every future measurement. Label it last within the cold-start phase, or re-adjudicate it once the guide has stabilised — and version that change explicitly.

**Switching to uncertainty because a round number was hit.** "We have 2 000 labels, turn on active learning" is the failure this phase exists to prevent. Use the calibration check.

## Integration & Automation Hooks

The cold-start selection is a batch job that runs once per round and writes a task list. It fits the same [Airflow DAG](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/orchestrating-annotation-pipelines-with-airflow/) as the harvest, as an upstream task that reads the pool metadata and writes the next batch's tile ids. Two details make it safe to re-run: the selection is seeded, so the same round produces the same batch; and already-labelled tiles are excluded by a join rather than by exclusion lists that drift.

Once the handover happens, the same task keeps running with a different scorer — coverage becomes one term in the score rather than the whole of it — which is why it is worth building the selection as a scoring function from the start rather than as a script that shuffles.

## Validation & Testing

```python
def test_allocation_never_exceeds_supply() -> None:
    counts = pd.Series({"a": 500, "b": 40, "c": 12})
    alloc = allocate(counts, batch_size=300, evenness=0.8)
    for k, v in alloc.items():
        assert v <= counts[k], f"asked for {v} from a stratum holding {counts[k]}"

def test_spread_sample_is_deterministic() -> None:
    a = spread_sample(tiles, n=25, seed=7)
    b = spread_sample(tiles, n=25, seed=7)
    assert a == b

def test_uncertainty_handover_refuses_an_uncalibrated_model() -> None:
    """The check must refuse the model this phase exists to protect against."""
    conf = np.full(500, 0.95)                 # confident everywhere
    correct = np.random.default_rng(0).random(500) < 0.60   # right 60% of the time
    assert not ready_for_uncertainty(conf, correct)
```

The last test feeds the machinery exactly the over-confident under-trained model that a young project produces, and asserts the handover check refuses it.

## Frequently Asked Questions

### Can I skip the cold start by fine-tuning a published model?

Often yes, and it changes the phase rather than removing it. A model fine-tuned from an open building-footprint checkpoint starts with usable uncertainty far sooner, so the coverage phase can be one batch instead of four. Run the calibration check anyway: a transferred model is frequently confident and wrong on a new sensor, which is precisely the state that makes uncertainty ranking useless.

### How do I choose strata when the project spans several countries?

Use the coarsest axis that changes what the imagery looks like. Administrative boundaries matter less than the built form, sensor and season, so a stratification on those three is usually better than one on country. Where building style genuinely differs across a border, it will show up as a region term anyway.

### Is diversity sampling worth the embedding model?

For the first batch, geographic spread captures most of it and costs nothing. Feature-space diversity earns its keep later, when the loop is ranking by uncertainty and neighbouring tiles all score alike — the problem described in [prioritizing tiles by model disagreement](https://www.geospatialannotation.com/active-learning-model-feedback-loops/uncertainty-sampling-for-geospatial-active-learning/prioritizing-tiles-by-model-disagreement/).

### What if the pool grows after the cold-start batches?

New tiles join the pool and the strata are recomputed, which may create strata that did not exist. That is a coverage gap and should trigger a coverage batch even if the project has already moved to uncertainty sampling — the model has no basis for being uncertain about ground it has never seen.

## Related

- [Uncertainty Sampling for Geospatial Active Learning](https://www.geospatialannotation.com/active-learning-model-feedback-loops/uncertainty-sampling-for-geospatial-active-learning/) — the phase this one hands over to, and the scoring it depends on
- [Automating Pre-Labeling with Foundation Models](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/automating-pre-labeling-with-foundation-models/) — how the zero-shot proposals in Step 3 are generated over a tiled scene
- [Reproducible Train/Validation Splits for Spatial Data](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/reproducible-train-validation-splits/) — the blocked assignment the frozen evaluation set is drawn from
- [Calibrating Confidence Scores with Temperature Scaling](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/confidence-scoring-for-geospatial-labels/calibrating-confidence-scores-with-temperature-scaling/) — the fit that makes the handover check meaningful

Cold start is the first stage of the broader [Active Learning & Model Feedback Loops](https://www.geospatialannotation.com/active-learning-model-feedback-loops/) cycle, which takes over once the model has something to be uncertain about.
