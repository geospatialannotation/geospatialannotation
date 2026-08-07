---
title: "Closing the Loop with Automated Model Retraining"
description: "Wire newly reviewed annotations into an automated retraining loop: DVC-triggered pipelines, checkpoint promotion gates, and evaluation guards that stop a bad batch from degrading a deployed geospatial model."
slug: "closing-the-loop-with-automated-retraining"
type: "guide"
breadcrumb: "Active Learning & Model Feedback Loops > Closing the Loop with Automated Model Retraining"
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
      "headline": "Closing the Loop with Automated Model Retraining",
      "description": "Wire newly reviewed annotations into an automated retraining loop: DVC-triggered pipelines, checkpoint promotion gates, and evaluation guards that stop a bad batch from degrading a deployed geospatial model.",
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
        {"@type": "ListItem", "position": 3, "name": "Closing the Loop with Automated Model Retraining", "item": "https://www.geospatialannotation.com/active-learning-model-feedback-loops/closing-the-loop-with-automated-retraining/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Close the Retraining Loop for a Geospatial Model",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Assemble the incremental training set", "text": "Collect newly validated annotation tiles, deduplicate against the base manifest, and produce a content-addressed dataset version."},
        {"@type": "HowToStep", "position": 2, "name": "Define the evaluation gate", "text": "Fix a frozen hold-out set and a promotion rule that requires the candidate metric to match or beat the deployed baseline within tolerance."},
        {"@type": "HowToStep", "position": 3, "name": "Retrain or fine-tune the candidate", "text": "Warm-start from the production checkpoint, replay a fraction of old tiles to limit forgetting, and log the run."},
        {"@type": "HowToStep", "position": 4, "name": "Promote only if the gate passes", "text": "Evaluate the candidate on the frozen hold-out, and swap it into production only when it clears the gate."},
        {"@type": "HowToStep", "position": 5, "name": "Roll back on regression", "text": "If the gate fails or a post-deploy metric drops, restore the last known-good checkpoint and dataset version."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "How often should an automated retraining loop run?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Trigger on data volume, not the calendar. A common rule is to retrain once a batch of newly validated tiles crosses roughly five to ten percent of the base training set, or when a drift monitor fires. Fixed nightly schedules waste compute on days with no new labels and lag behind on days with a surge."
          }
        },
        {
          "@type": "Question",
          "name": "What is the safest evaluation gate metric for a geospatial detector?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Use a task-aligned metric such as mAP at a fixed IoU for detection or mean IoU for segmentation, computed on a frozen hold-out set that never receives fresh annotations. Guard it with a per-class floor so a gain in a common class cannot mask a collapse in a rare but important one."
          }
        },
        {
          "@type": "Question",
          "name": "How do I stop new annotations from leaking into the evaluation set?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Split by spatial region, not by random tile, and freeze the hold-out region before the loop starts. Tiles that overlap or neighbour a hold-out tile share ground features, so a random split lets adjacent tiles contaminate the evaluation and inflates the score."
          }
        },
        {
          "@type": "Question",
          "name": "Can I promote a checkpoint automatically without a human review?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes for the gate decision, but keep a human in the promotion path for the first few cycles and for any run where the metric change is within noise. Automate the reject-and-rollback branch fully, since reverting to a known-good checkpoint is always safe."
          }
        }
      ]
    }
  ]
}
</script>

# Closing the Loop with Automated Model Retraining

A geospatial detection team hits this wall constantly: annotators keep validating fresh satellite tiles, the reviewed labels pile up in a bucket, and yet the model in production has not changed in three months. Nobody wired the last step. The deployed checkpoint keeps mis-detecting the exact objects the new annotations were created to fix — new construction it reads as bare ground, a solar farm it labels as water — because those corrections never re-entered training. The labeling budget is spent, the model stays stale, and every inference run reproduces the same errors at scale.

Closing that gap is the whole point of an [active learning loop](https://www.geospatialannotation.com/active-learning-model-feedback-loops/): the model tells you which tiles to label, annotators label them, and the loop must then feed those labels back into a new model version safely. This guide covers the return path — how to turn a stream of validated annotations into a retrained checkpoint that only reaches production if it demonstrably does not regress. The hard part is not the training call; it is the promotion gate and the rollback that protect a live model from a bad batch.

<svg viewBox="0 0 900 320" role="img" aria-label="Retraining promotion pipeline: new annotations flow into a dataset version, a candidate is trained, an evaluation gate decides between promote and reject with rollback" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:900px;display:block;margin:1.5rem auto;">
  <title>Retraining Promotion Pipeline</title>
  <desc>A left-to-right pipeline. New annotations feed a build-dataset-version step, which feeds a train-candidate step, which feeds an evaluation gate drawn as a diamond. A passing gate promotes the candidate to production; a failing gate rejects it and a dashed feedback arrow restores the last known-good checkpoint.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <defs>
    <marker id="rp-arr" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor" opacity="0.65"/>
    </marker>
  </defs>
  <rect x="10" y="120" width="140" height="72" rx="8" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="80" y="150" text-anchor="middle" font-size="12" font-weight="700" fill="currentColor" font-family="sans-serif">New</text>
  <text x="80" y="167" text-anchor="middle" font-size="12" font-weight="700" fill="currentColor" font-family="sans-serif">annotations</text>
  <text x="80" y="184" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">validated tiles</text>
  <rect x="185" y="120" width="150" height="72" rx="8" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="260" y="150" text-anchor="middle" font-size="12" font-weight="700" fill="currentColor" font-family="sans-serif">Build dataset</text>
  <text x="260" y="167" text-anchor="middle" font-size="12" font-weight="700" fill="currentColor" font-family="sans-serif">version</text>
  <text x="260" y="184" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">DVC-tracked</text>
  <rect x="370" y="120" width="140" height="72" rx="8" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="440" y="150" text-anchor="middle" font-size="12" font-weight="700" fill="currentColor" font-family="sans-serif">Train</text>
  <text x="440" y="167" text-anchor="middle" font-size="12" font-weight="700" fill="currentColor" font-family="sans-serif">candidate</text>
  <text x="440" y="184" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">warm-start</text>
  <polygon points="600,105 685,156 600,207 515,156" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.6"/>
  <text x="600" y="152" text-anchor="middle" font-size="12" font-weight="700" fill="currentColor" font-family="sans-serif">Eval</text>
  <text x="600" y="168" text-anchor="middle" font-size="12" font-weight="700" fill="currentColor" font-family="sans-serif">gate</text>
  <rect x="740" y="40" width="150" height="66" rx="8" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="815" y="68" text-anchor="middle" font-size="12" font-weight="700" fill="currentColor" font-family="sans-serif">Promote</text>
  <text x="815" y="86" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">→ production</text>
  <rect x="740" y="206" width="150" height="66" rx="8" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="815" y="234" text-anchor="middle" font-size="12" font-weight="700" fill="currentColor" font-family="sans-serif">Reject</text>
  <text x="815" y="252" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">+ rollback</text>
  <line x1="150" y1="156" x2="183" y2="156" stroke="currentColor" stroke-width="1.5" marker-end="url(#rp-arr)" opacity="0.65"/>
  <line x1="335" y1="156" x2="368" y2="156" stroke="currentColor" stroke-width="1.5" marker-end="url(#rp-arr)" opacity="0.65"/>
  <line x1="510" y1="156" x2="513" y2="156" stroke="currentColor" stroke-width="1.5" marker-end="url(#rp-arr)" opacity="0.65"/>
  <path d="M600 105 L600 73 L736 73" fill="none" stroke="currentColor" stroke-width="1.5" marker-end="url(#rp-arr)" opacity="0.65"/>
  <text x="668" y="66" text-anchor="middle" font-size="10" font-weight="700" fill="currentColor" font-family="sans-serif" opacity="0.8">pass</text>
  <path d="M600 207 L600 239 L736 239" fill="none" stroke="currentColor" stroke-width="1.5" marker-end="url(#rp-arr)" opacity="0.65"/>
  <text x="668" y="232" text-anchor="middle" font-size="10" font-weight="700" fill="currentColor" font-family="sans-serif" opacity="0.8">fail</text>
  <path d="M815,272 L815,300 L440,300 L440,194" fill="none" stroke="currentColor" stroke-width="1.3" stroke-dasharray="5 4" marker-end="url(#rp-arr)" opacity="0.55"/>
  <text x="600" y="315" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">restore last known-good checkpoint</text>
</svg>

---

## Prerequisites & Pipeline Toolchain

The loop coordinates three subsystems: a versioned data store, a training runtime, and an experiment log. Pin every version so a retraining run months from now reproduces byte-for-byte.

**Required Python packages (pinned):**

- `dvc[s3]==3.51.2` — content-addressed dataset versions and pipeline stages
- `torch==2.3.1` — training and fine-tuning runtime
- `geopandas==0.14.4` — reading and joining validated annotation geometries
- `pyarrow==16.1.0` — GeoParquet I/O for annotation manifests
- `mlflow==2.14.1` **or** `wandb==0.17.4` (optional) — experiment tracking and checkpoint registry

Install the core stack with:

```bash
pip install "dvc[s3]==3.51.2" torch==2.3.1 geopandas==0.14.4 pyarrow==16.1.0
# optional experiment tracker (pick one)
pip install mlflow==2.14.1
```

The loop assumes your training data is already under [DVC versioning](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/), so that each dataset revision is content-addressed and every model can be traced to the exact tiles it saw. It also assumes annotations arrive pre-normalized to a single coordinate reference system — mixing projections silently shifts geometry and poisons a retraining set. Because distance-sensitive evaluation such as IoU depends on a metric CRS, keep the pipeline on a local UTM zone rather than [`EPSG:4326`](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/).

**Baseline checklist before wiring the loop:**

- [ ] Base training set is DVC-tracked with a resolvable revision hash
- [ ] A frozen hold-out evaluation region exists and is excluded from all labeling
- [ ] The deployed checkpoint and its hold-out score are recorded as the baseline
- [ ] A rollback path can restore the previous checkpoint and dataset revision atomically

---

## Core Retraining Loop Workflow

The five stages below map one-to-one onto the diagram above. Each returns a value the next stage consumes, so the whole loop can run as a single orchestrated job or as separate pipeline stages.

### Assemble the incremental training set from validated annotations

New annotations arrive as a stream of reviewed tiles. Before they touch training, deduplicate them against the base manifest, drop anything still pending review, and emit a single content-addressed dataset version. Deduplication by tile identity is what keeps a re-reviewed tile from being counted twice and skewing class balance.

```python
from __future__ import annotations

from pathlib import Path

import geopandas as gpd
import pandas as pd


def assemble_increment(
    validated_dir: Path,
    base_manifest: Path,
    replay_fraction: float = 0.15,
    seed: int = 13,
) -> gpd.GeoDataFrame:
    """Build the incremental training manifest from newly validated tiles.

    Returns a GeoDataFrame combining all fresh annotations with a small,
    randomly sampled replay slice of the base set to limit forgetting.
    """
    base: gpd.GeoDataFrame = gpd.read_parquet(base_manifest)

    fresh_parts: list[gpd.GeoDataFrame] = [
        gpd.read_parquet(p) for p in sorted(validated_dir.glob("*.parquet"))
    ]
    if not fresh_parts:
        raise RuntimeError("No validated annotation batches found — nothing to retrain on.")

    fresh: gpd.GeoDataFrame = pd.concat(fresh_parts, ignore_index=True)
    fresh = fresh[fresh["review_status"] == "validated"].copy()

    # Deduplicate: a re-reviewed tile must appear once, keeping the newest label.
    fresh = fresh.sort_values("reviewed_at").drop_duplicates("tile_id", keep="last")

    # Never train on tiles reserved for evaluation.
    fresh = fresh[~fresh["tile_id"].isin(base.loc[base["split"] == "holdout", "tile_id"])]

    replay: gpd.GeoDataFrame = (
        base[base["split"] == "train"]
        .sample(frac=replay_fraction, random_state=seed)
        .copy()
    )

    increment = pd.concat([fresh, replay], ignore_index=True)
    increment.attrs["n_fresh"] = int(len(fresh))
    increment.attrs["n_replay"] = int(len(replay))
    return gpd.GeoDataFrame(increment, crs=base.crs)
```

The `replay_fraction` slice is deliberate: fine-tuning purely on new tiles is the fastest route to catastrophic forgetting, covered in the gotchas below. Mixing in a random sample of previously seen tiles anchors the model to its existing competencies.

### Define an evaluation gate

The gate is the safety valve. It compares the candidate's score on a frozen hold-out set against the deployed baseline and returns a single boolean. Encode the rule as data, not scattered `if` statements, so the same policy governs every run and can be logged.

<svg viewBox="0 0 720 260" role="img" aria-label="Candidate metrics against the promotion gate, where one regression blocks promotion despite an overall gain" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>The gate is per-class, because the average hides the loss</title>
  <desc>The candidate improves overall mean IoU from 0.68 to 0.71 and improves three classes. The water class falls from 0.74 to 0.66, an eight point regression well past the tolerated two points. The gate blocks promotion on that one class, because a mean that improves while a class collapses is exactly the trade the average is bad at showing.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <text x="360" y="36" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.85">baseline → candidate, per class</text>
  <line x1="20" y1="46" x2="700" y2="46" stroke="currentColor" stroke-width="1" opacity="0.4"/>
  <text x="20" y="76" font-size="11" fill="currentColor" font-family="monospace">building</text>
  <text x="250" y="76" font-size="11" fill="currentColor" font-family="monospace">0.71 → 0.75</text>
  <rect x="400" y="62" width="120" height="18" rx="3" fill="currentColor" opacity="0.35"/>
  <text x="460" y="76" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif">+0.04</text>
  <text x="560" y="76" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">passes</text>
  <text x="20" y="112" font-size="11" fill="currentColor" font-family="monospace">road</text>
  <text x="250" y="112" font-size="11" fill="currentColor" font-family="monospace">0.66 → 0.70</text>
  <rect x="400" y="98" width="120" height="18" rx="3" fill="currentColor" opacity="0.35"/>
  <text x="460" y="112" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif">+0.04</text>
  <text x="560" y="112" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">passes</text>
  <text x="20" y="148" font-size="11" fill="currentColor" font-family="monospace">cropland</text>
  <text x="250" y="148" font-size="11" fill="currentColor" font-family="monospace">0.61 → 0.73</text>
  <rect x="400" y="134" width="120" height="18" rx="3" fill="currentColor" opacity="0.35"/>
  <text x="460" y="148" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif">+0.12</text>
  <text x="560" y="148" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">passes</text>
  <text x="20" y="184" font-size="11" fill="currentColor" font-family="monospace">water</text>
  <text x="250" y="184" font-size="11" fill="currentColor" font-family="monospace">0.74 → 0.66</text>
  <rect x="400" y="170" width="120" height="18" rx="3" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="4 2"/>
  <text x="460" y="184" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif">−0.08</text>
  <text x="560" y="184" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.9">blocks — tolerance is 0.02</text>
  <line x1="20" y1="198" x2="700" y2="198" stroke="currentColor" stroke-width="1" opacity="0.3"/>
  <text x="20" y="224" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">mean IoU</text>
  <text x="250" y="224" font-size="11" fill="currentColor" font-family="monospace">0.68 → 0.71</text>
  <text x="400" y="224" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">the number that would have promoted it</text>
  <text x="360" y="250" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">gate on the worst class, not the mean — the incremental batch that taught it cropland is what cost it water</text>
</svg>

```python
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class EvalGate:
    """Promotion policy for a retraining candidate.

    A candidate passes only if its hold-out metric clears the baseline
    minus a noise tolerance, with no per-class score falling below a floor.
    """

    metric: str = "map_50"
    baseline: float = 0.0
    tolerance: float = 0.004        # accepted noise band around the baseline
    required_gain: float = 0.0      # extra margin the candidate must earn
    per_class_floor: float = 0.30   # no class may drop under this

    def passes(self, overall: float, per_class: dict[str, float]) -> bool:
        clears_overall = overall >= self.baseline - self.tolerance + self.required_gain
        clears_classes = all(score >= self.per_class_floor for score in per_class.values())
        return clears_overall and clears_classes
```

Freezing the hold-out region is non-negotiable. The `assemble_increment` function above already refuses any tile whose `split` is `holdout`; the gate depends on that region never seeing a fresh label, or the comparison against the baseline becomes meaningless.

### Retrain or fine-tune the candidate

Warm-start from the production checkpoint rather than training from scratch. Fine-tuning on the incremental manifest is faster, cheaper, and — combined with the replay slice — far less destructive to prior knowledge. Log the run so the candidate is reproducible.

```python
from __future__ import annotations

from pathlib import Path

import torch
from torch.utils.data import DataLoader


def fine_tune_candidate(
    model: torch.nn.Module,
    train_loader: DataLoader,
    production_ckpt: Path,
    epochs: int = 4,
    lr: float = 1e-4,
    device: str = "cuda",
) -> torch.nn.Module:
    """Warm-start from production weights and fine-tune on the increment."""
    state = torch.load(production_ckpt, map_location=device)
    model.load_state_dict(state["model"])
    model.to(device).train()

    optimizer = torch.optim.AdamW(model.parameters(), lr=lr)
    for epoch in range(epochs):
        running: float = 0.0
        for images, targets in train_loader:
            images = images.to(device)
            targets = [{k: v.to(device) for k, v in t.items()} for t in targets]

            optimizer.zero_grad()
            loss_dict = model(images, targets)          # detection-style loss dict
            loss = sum(loss_dict.values())
            loss.backward()
            optimizer.step()
            running += float(loss.detach())

        print(f"epoch {epoch + 1}/{epochs}  mean_loss={running / len(train_loader):.4f}")

    return model
```

If you use an experiment tracker, wrap this call with `mlflow.start_run()` (or `wandb.init()`) and log `epochs`, `lr`, the dataset revision hash, and the resulting checkpoint as an artifact. The tracker becomes your checkpoint registry and your audit trail when a regression needs diagnosing weeks later.

### Promote the checkpoint only if the gate passes

Evaluate the fine-tuned candidate on the frozen hold-out, feed both the overall and per-class scores to the gate, and swap the production pointer only on a pass. The swap itself must be atomic — write the new checkpoint beside the old and move a symlink, never overwrite in place.

```python
from __future__ import annotations

import os
from pathlib import Path


def promote_if_gated(
    candidate_ckpt: Path,
    production_link: Path,
    gate: EvalGate,
    overall: float,
    per_class: dict[str, float],
) -> bool:
    """Atomically point production at the candidate iff it clears the gate."""
    if not gate.passes(overall, per_class):
        worst = min(per_class, key=per_class.get)
        print(
            f"REJECTED: {gate.metric}={overall:.4f} vs baseline {gate.baseline:.4f} "
            f"(worst class '{worst}'={per_class[worst]:.4f}). Production unchanged."
        )
        return False

    tmp_link = production_link.with_suffix(".swap")
    tmp_link.symlink_to(candidate_ckpt.resolve())
    os.replace(tmp_link, production_link)      # atomic pointer swap
    print(f"PROMOTED: {candidate_ckpt.name} → {production_link} ({gate.metric}={overall:.4f})")
    return True
```

### Roll back on regression

Rejection at the gate leaves production untouched — that is already a rollback in the pre-deploy sense. The dangerous case is a candidate that clears the gate but degrades on live traffic, caught by a post-deploy monitor. Restore both the checkpoint pointer and the dataset revision so the next loop iteration starts from a coherent known-good state.

```python
from __future__ import annotations

import os
import subprocess
from pathlib import Path


def rollback(
    production_link: Path,
    last_good_ckpt: Path,
    last_good_data_rev: str,
) -> None:
    """Restore the previous checkpoint and pin the dataset to its last good revision."""
    tmp_link = production_link.with_suffix(".swap")
    tmp_link.symlink_to(last_good_ckpt.resolve())
    os.replace(tmp_link, production_link)

    # Return the DVC-tracked data to the revision the good checkpoint trained on.
    subprocess.run(["dvc", "checkout", "--rev", last_good_data_rev], check=True)
    print(f"ROLLED BACK: production → {last_good_ckpt.name}, data → {last_good_data_rev}")
```

Detailed recovery playbooks for the data side of that restore live in the guide on [rollback strategies for corrupted spatial datasets](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/rollback-strategies-for-corrupted-spatial-datasets/); the loop here reuses the same revision-pinning discipline for the model side.

---

## Promotion Parameters & Configuration Reference

| Parameter | Type | Recommended value | Loop implication |
|---|---|---|---|
| `gate.metric` | `str` | `map_50` (detection), `miou` (segmentation) | Must be task-aligned and computed on the frozen hold-out |
| `gate.tolerance` | `float` | `0.004` | Noise band; too wide lets silent regressions through |
| `gate.required_gain` | `float` | `0.0`–`0.01` | Extra margin to demand before disrupting production |
| `gate.per_class_floor` | `float` | `0.30` | Blocks a rare-class collapse hidden by an overall gain |
| `replay_fraction` | `float` | `0.10`–`0.20` | Old-tile replay ratio to limit catastrophic forgetting |
| `retrain_trigger` | `str` | `≥ 5–10% new tiles` or drift alert | Volume/drift trigger beats a fixed schedule |
| `epochs` | `int` | `3`–`6` | Fine-tune, do not retrain to convergence from scratch |
| `rollback_trigger` | `str` | post-deploy metric drop `> 2σ` | Auto-restore last known-good on live regression |

---

## Edge Cases & Gotchas

### Catastrophic forgetting on the incremental batch

Fine-tuning a network on a small, homogeneous batch of new tiles will overwrite weights that encoded rare classes, so the model gets better at whatever the fresh batch contains and quietly worse at everything else. The `replay_fraction` slice is the first defence; the `per_class_floor` in the gate is the backstop. If forgetting persists, lower the learning rate, freeze the backbone and fine-tune only the detection or segmentation head, or add an elastic-weight-consolidation penalty that anchors important parameters to their production values.

### Label noise from fresh annotations

Newly validated tiles are not automatically trustworthy. A single annotator's systematic error — a mislabeled class, a consistently loose bounding box — enters training as ground truth and the model dutifully learns it. Before assembling the increment, cross-check fresh labels against model predictions and flag tiles where a high-confidence prediction disagrees sharply with the new label for a second review. Calibrated [confidence scores](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/confidence-scoring-for-geospatial-labels/) make that disagreement signal meaningful rather than noisy.

### Eval-set contamination via spatial autocorrelation

Adjacent tiles are not independent samples: they share roads, buildings, and terrain that spill across tile edges. A random train/hold-out split therefore places near-copies of hold-out content into training, and the evaluation score climbs for reasons that have nothing to do with real generalization. Split the hold-out by geographic block — an entire region or acquisition scene — and add a buffer so no training tile physically borders a hold-out tile. Freeze that block once and never label inside it.

<svg viewBox="0 0 700 280" role="img" aria-label="A spatially blocked evaluation split compared with a random one, showing why the random split reports a better number" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:700px;display:block;margin:1.5rem auto;">
  <title>A random split lets the model see the neighbours of its own test set</title>
  <desc>With a random tile split, validation tiles sit directly beside training tiles, sharing roofs, shadows and field boundaries, so validation accuracy overstates real performance by a wide margin. Holding out contiguous blocks instead means the evaluation tiles have no training neighbour, and the number it reports is the one that survives deployment.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <!-- Random split -->
  <text x="160" y="34" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">random tile split</text>
  <rect x="40" y="48" width="240" height="160" fill="none" stroke="currentColor" stroke-width="1.3"/>
  <g>
    <rect x="40" y="48" width="40" height="40" fill="currentColor" opacity="0.4"/><rect x="80" y="48" width="40" height="40" fill="none"/>
    <rect x="120" y="48" width="40" height="40" fill="currentColor" opacity="0.4"/><rect x="200" y="48" width="40" height="40" fill="currentColor" opacity="0.4"/>
    <rect x="40" y="88" width="40" height="40" fill="none"/><rect x="80" y="88" width="40" height="40" fill="currentColor" opacity="0.4"/>
    <rect x="160" y="88" width="40" height="40" fill="currentColor" opacity="0.4"/><rect x="240" y="88" width="40" height="40" fill="currentColor" opacity="0.4"/>
    <rect x="40" y="128" width="40" height="40" fill="currentColor" opacity="0.4"/><rect x="120" y="128" width="40" height="40" fill="currentColor" opacity="0.4"/>
    <rect x="200" y="128" width="40" height="40" fill="none"/><rect x="240" y="128" width="40" height="40" fill="currentColor" opacity="0.4"/>
    <rect x="80" y="168" width="40" height="40" fill="currentColor" opacity="0.4"/><rect x="160" y="168" width="40" height="40" fill="none"/>
    <rect x="200" y="168" width="40" height="40" fill="currentColor" opacity="0.4"/>
  </g>
  <g stroke="currentColor" stroke-width="0.8" opacity="0.4">
    <line x1="80" y1="48" x2="80" y2="208"/><line x1="120" y1="48" x2="120" y2="208"/><line x1="160" y1="48" x2="160" y2="208"/><line x1="200" y1="48" x2="200" y2="208"/><line x1="240" y1="48" x2="240" y2="208"/>
    <line x1="40" y1="88" x2="280" y2="88"/><line x1="40" y1="128" x2="280" y2="128"/><line x1="40" y1="168" x2="280" y2="168"/>
  </g>
  <text x="160" y="232" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">every held-out tile touches a training tile</text>
  <text x="160" y="252" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">the same roofs and field edges appear on both sides</text>
  <text x="160" y="270" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace" opacity="0.8">reported IoU 0.84</text>
  <!-- Blocked split -->
  <text x="500" y="34" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">spatially blocked split</text>
  <rect x="380" y="48" width="240" height="160" fill="none" stroke="currentColor" stroke-width="1.3"/>
  <rect x="380" y="48" width="160" height="160" fill="currentColor" opacity="0.4"/>
  <g stroke="currentColor" stroke-width="0.8" opacity="0.4">
    <line x1="420" y1="48" x2="420" y2="208"/><line x1="460" y1="48" x2="460" y2="208"/><line x1="500" y1="48" x2="500" y2="208"/><line x1="540" y1="48" x2="540" y2="208"/><line x1="580" y1="48" x2="580" y2="208"/>
    <line x1="380" y1="88" x2="620" y2="88"/><line x1="380" y1="128" x2="620" y2="128"/><line x1="380" y1="168" x2="620" y2="168"/>
  </g>
  <line x1="540" y1="48" x2="540" y2="208" stroke="currentColor" stroke-width="2.5"/>
  <text x="500" y="232" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">one boundary, no shared context</text>
  <text x="500" y="252" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">the evaluation area is genuinely unseen ground</text>
  <text x="500" y="270" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace" opacity="0.8">reported IoU 0.68 — and it holds up in production</text>
</svg>

### Silent metric regression

The most expensive failure is a candidate that clears the overall gate while collapsing on a class that barely registers in the aggregate. A one-point mean-average-precision gain can hide a rare-object recall dropping by half. Guarding the gate with a per-class floor catches most of these, but also track the full per-class table across loop iterations and alert on any class trending down for two consecutive promotions, even when each individual step stays above the floor.

---

## Integration & Automation Hooks

### DVC pipeline stage

Express the loop as pipeline stages so each dataset revision deterministically produces one candidate, and DVC's dependency hashing skips retraining when neither data nor code changed. The child guide on [triggering retraining from new annotations with DVC](https://www.geospatialannotation.com/active-learning-model-feedback-loops/closing-the-loop-with-automated-retraining/triggering-retraining-from-new-annotations-with-dvc/) walks through the full trigger wiring; the stage skeleton is:

```yaml
# dvc.yaml
stages:
  assemble_increment:
    cmd: python scripts/assemble_increment.py --validated data/validated/ --base data/base.parquet
    deps:
      - scripts/assemble_increment.py
      - data/validated/
    outs:
      - data/increment.parquet
  train_candidate:
    cmd: python scripts/train_candidate.py --data data/increment.parquet --out models/candidate.pt
    deps:
      - scripts/train_candidate.py
      - data/increment.parquet
    outs:
      - models/candidate.pt
  eval_gate:
    cmd: python scripts/eval_gate.py --candidate models/candidate.pt --holdout data/holdout.parquet
    deps:
      - scripts/eval_gate.py
      - models/candidate.pt
    metrics:
      - reports/gate.json
```

### CI promotion job

```yaml
# .github/workflows/retrain_gate.yml
name: retrain promotion gate
on:
  workflow_dispatch:
  schedule:
    - cron: "0 3 * * 1"      # weekly candidate build, gate decides promotion
jobs:
  gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: {python-version: "3.11"}
      - run: pip install "dvc[s3]==3.51.2" torch==2.3.1 geopandas==0.14.4
      - run: dvc repro eval_gate
      - name: Promote or reject
        run: python scripts/promote.py --report reports/gate.json --production models/production.pt
```

---

## Validation & Testing

Test the loop's decision logic in isolation, without a GPU, by driving the gate with synthetic scores. The gate is the component most likely to silently rot, so it deserves the most coverage.

```python
from __future__ import annotations


def test_gate_rejects_per_class_collapse() -> None:
    gate = EvalGate(baseline=0.62, tolerance=0.004, per_class_floor=0.30)
    # Overall improves, but one class collapses below the floor.
    passed = gate.passes(overall=0.64, per_class={"building": 0.71, "solar": 0.18})
    assert passed is False, "gate must reject a rare-class collapse hidden by overall gain"


def test_gate_accepts_within_tolerance() -> None:
    gate = EvalGate(baseline=0.62, tolerance=0.004, per_class_floor=0.30)
    passed = gate.passes(overall=0.618, per_class={"building": 0.70, "solar": 0.44})
    assert passed is True, "a candidate inside the noise band with healthy classes must pass"


def test_increment_excludes_holdout(tmp_path) -> None:
    import geopandas as gpd
    from shapely.geometry import box

    holdout = gpd.GeoDataFrame(
        {"tile_id": ["h1"], "split": ["holdout"], "review_status": ["validated"]},
        geometry=[box(0, 0, 1, 1)], crs="EPSG:32632",
    )
    holdout.to_parquet(tmp_path / "base.parquet")

    batch = gpd.GeoDataFrame(
        {"tile_id": ["h1", "t2"], "split": ["train", "train"],
         "review_status": ["validated", "validated"],
         "reviewed_at": [1, 2]},
        geometry=[box(0, 0, 1, 1), box(2, 2, 3, 3)], crs="EPSG:32632",
    )
    (tmp_path / "validated").mkdir()
    batch.to_parquet(tmp_path / "validated" / "b1.parquet")

    inc = assemble_increment(tmp_path / "validated", tmp_path / "base.parquet", replay_fraction=0.0)
    assert "h1" not in set(inc["tile_id"]), "hold-out tile must never enter the increment"
```

Run the suite with `pytest -q` inside the CI gate job so a broken promotion policy fails the build before any checkpoint moves. Pair it with a post-deploy monitor that samples live predictions and triggers `rollback` when the tracked metric drops more than two standard deviations below the promoted baseline.

---

## Frequently Asked Questions

### How often should an automated retraining loop run?

Trigger on data volume, not the calendar. A common rule is to retrain once a batch of newly validated tiles crosses roughly five to ten percent of the base training set, or when a drift monitor fires. Fixed nightly schedules waste compute on days with no new labels and lag behind on days with a surge.

### What is the safest evaluation gate metric for a geospatial detector?

Use a task-aligned metric such as mAP at a fixed IoU for detection or mean IoU for segmentation, computed on a frozen hold-out set that never receives fresh annotations. Guard it with a per-class floor so a gain in a common class cannot mask a collapse in a rare but important one.

### How do I stop new annotations from leaking into the evaluation set?

Split by spatial region, not by random tile, and freeze the hold-out region before the loop starts. Tiles that overlap or neighbour a hold-out tile share ground features, so a random split lets adjacent tiles contaminate the evaluation and inflates the score.

### Can I promote a checkpoint automatically without a human review?

Yes for the gate decision, but keep a human in the promotion path for the first few cycles and for any run where the metric change is within noise. Automate the reject-and-rollback branch fully, since reverting to a known-good checkpoint is always safe.

---

## Related

- [Triggering Retraining from New Annotations with DVC](https://www.geospatialannotation.com/active-learning-model-feedback-loops/closing-the-loop-with-automated-retraining/triggering-retraining-from-new-annotations-with-dvc/) — the DVC trigger stage that detects validated batches and launches the loop
- [Uncertainty Sampling for Geospatial Active Learning](https://www.geospatialannotation.com/active-learning-model-feedback-loops/uncertainty-sampling-for-geospatial-active-learning/) — how the loop chooses which tiles to send for labeling in the first place
- [Detecting Distribution Drift in Spatial Datasets](https://www.geospatialannotation.com/active-learning-model-feedback-loops/detecting-distribution-drift-in-spatial-datasets/) — the drift signal that fires the retraining trigger before a model decays
- [Implementing DVC for Geospatial Training Data](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/) — the content-addressed dataset versioning every retraining run depends on
- [Rollback Strategies for Corrupted Spatial Datasets](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/rollback-strategies-for-corrupted-spatial-datasets/) — restoring a known-good data revision when a candidate regresses in production

This guide is part of the broader [Active Learning & Model Feedback Loops for Geospatial Annotation](https://www.geospatialannotation.com/active-learning-model-feedback-loops/) topic area, which connects tile selection, retraining, and drift detection into one feedback system.
