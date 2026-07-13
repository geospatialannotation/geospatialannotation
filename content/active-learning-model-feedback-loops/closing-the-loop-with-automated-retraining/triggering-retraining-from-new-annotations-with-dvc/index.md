---
title: "Triggering Retraining from New Annotations with DVC"
description: "Set up a DVC pipeline stage that detects newly validated geospatial annotations and automatically launches a retraining job, with dependency hashing and a manifest-driven trigger."
slug: "triggering-retraining-from-new-annotations-with-dvc"
type: "tutorial"
breadcrumb:
  - label: "Home"
    url: "/"
  - label: "Active Learning & Model Feedback Loops"
    url: "/active-learning-model-feedback-loops/"
  - label: "Closing the Loop with Automated Model Retraining"
    url: "/active-learning-model-feedback-loops/closing-the-loop-with-automated-retraining/"
  - label: "Triggering Retraining from New Annotations with DVC"
    url: "/active-learning-model-feedback-loops/closing-the-loop-with-automated-retraining/triggering-retraining-from-new-annotations-with-dvc/"
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
      "headline": "Triggering Retraining from New Annotations with DVC",
      "description": "Set up a DVC pipeline stage that detects newly validated geospatial annotations and automatically launches a retraining job, with dependency hashing and a manifest-driven trigger.",
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
        {"@type": "ListItem", "position": 3, "name": "Closing the Loop with Automated Model Retraining", "item": "https://www.geospatialannotation.com/active-learning-model-feedback-loops/closing-the-loop-with-automated-retraining/"},
        {"@type": "ListItem", "position": 4, "name": "Triggering Retraining from New Annotations with DVC", "item": "https://www.geospatialannotation.com/active-learning-model-feedback-loops/closing-the-loop-with-automated-retraining/triggering-retraining-from-new-annotations-with-dvc/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Triggering Retraining from New Annotations with DVC",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Declare the pipeline stages in dvc.yaml", "text": "Define three stages — annotations, dataset build, and train — where the build stage depends on the validated-annotations directory so any change to its content hash marks the pipeline out of date."},
        {"@type": "HowToStep", "position": 2, "name": "Write a manifest-driven trigger", "text": "Write a Python 3.10+ trigger that parses dvc status, counts newly added or changed features against the last committed manifest, and only proceeds when the count exceeds a minimum threshold."},
        {"@type": "HowToStep", "position": 3, "name": "Run dvc repro to rebuild and train", "text": "When the dependency hash of the annotations directory changes and the threshold is met, call dvc repro to rebuild the dataset version and run the downstream train stage."},
        {"@type": "HowToStep", "position": 4, "name": "Schedule the check in CI", "text": "Run the trigger on a schedule or on merge in CI, invoking dvc pull, the trigger, and dvc repro, then dvc push to persist the new dataset and checkpoint."},
        {"@type": "HowToStep", "position": 5, "name": "Guard the trigger with thresholds", "text": "Apply a minimum-new-annotation count, a cooldown window, and a class-coverage floor so a single stray edit never launches an expensive retraining run."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why not just retrain on every commit instead of hashing the annotations directory?",
          "acceptedAnswer": {"@type": "Answer", "text": "A geospatial retraining run can occupy a GPU for hours and cost real money, so firing it on every commit — including README edits, config tweaks, or a single relabeled tile — wastes compute and floods your checkpoint registry. Making the dataset-build stage depend on the validated-annotations directory means DVC only marks the pipeline out of date when the content hash of the annotations actually changes, and the minimum-new-annotations threshold suppresses runs that are too small to move the model."}
        },
        {
          "@type": "Question",
          "name": "How does DVC know new annotations arrived without scanning every file myself?",
          "acceptedAnswer": {"@type": "Answer", "text": "DVC stores a hash of each dependency in dvc.lock. When you run dvc status, it re-hashes the tracked annotations directory and compares against dvc.lock; a mismatch reports the stage as changed. Your trigger reads that status output rather than diffing files by hand, so the detection is content-addressed and reproducible across machines."}
        },
        {
          "@type": "Question",
          "name": "What minimum number of new annotations should trigger a retraining run?",
          "acceptedAnswer": {"@type": "Answer", "text": "There is no universal number, but a common floor is 200 to 500 newly validated features for a detector fine-tune, scaled to how many the model already trained on. Set the threshold as a fraction — for example 2 to 5 percent of the current training set — so it grows with the dataset and small correction batches accumulate before they justify a run."}
        },
        {
          "@type": "Question",
          "name": "Can the same trigger run locally with a watcher and in CI on a schedule?",
          "acceptedAnswer": {"@type": "Answer", "text": "Yes. The trigger is a plain Python function that inspects dvc status and the manifest, so a filesystem watcher can call it on directory changes for fast local iteration while a scheduled CI job calls the identical function nightly. Keep the threshold logic in one module and import it from both entry points to avoid drift between the two paths."}
        }
      ]
    }
  ]
}
</script>

# Triggering Retraining from New Annotations with DVC

To retrain automatically when reviewers approve fresh labels, define a [DVC](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/) pipeline stage whose dependency is the validated-annotations directory. When new annotations land, the content hash of that directory changes; `dvc status` reports the stage as out of date; and `dvc repro` — run from a scheduled CI job or a local filesystem watcher — rebuilds the versioned dataset and launches the downstream training stage. Guard the whole thing with a manifest so you only fire above a minimum-new-annotations threshold, and a single corrected tile never burns a GPU-hour. This turns the human review step of an [active learning loop](https://www.geospatialannotation.com/active-learning-model-feedback-loops/) into a hands-off retraining event without a bespoke orchestration server.

## Why Hash-Driven Triggers Beat Commit Hooks

The naive approach — retrain on every push to the annotations repo — collapses the moment your team scales. Reviewers touch the annotations directory dozens of times a day: fixing a mislabeled building, adjusting a polygon vertex, adding a note in a sidecar file. Most of those edits are far too small to shift a geospatial detector's weights, yet each one would enqueue an expensive run and pollute your checkpoint registry with near-identical models you then have to evaluate and prune.

Content hashing solves this at the level DVC already operates on. DVC records a hash of every tracked dependency in `dvc.lock`; a stage is "changed" only when the recomputed hash of its inputs differs from the recorded one. By pointing the dataset-build stage at the validated-annotations directory, you get a precise, reproducible signal — the same one that survives across machines and CI runners — instead of the noisy "someone committed something" signal a Git hook gives you. Layering a minimum-new-features threshold on top means the pipeline distinguishes a meaningful batch of new labels from a one-line touch, and only the former reaches the training stage.

## The Pipeline: Annotations, Dataset Build, Train

Install the toolchain first, pinning versions so the hash algorithm and CLI flags stay stable across every runner:

```bash
pip install dvc==3.55.2 geopandas==0.14.4 pyproj==3.6.1 shapely==2.0.6 pyyaml==6.0.2
```

Declare three stages in `dvc.yaml`. The `build_dataset` stage lists the validated-annotations directory as a dependency, so DVC re-hashes it on every `dvc status`. The `train` stage depends on the built dataset, which chains the two: a new dataset version forces a retraining run.

```yaml
stages:
  validate_annotations:
    cmd: python -m pipeline.validate --src annotations/raw --out annotations/validated
    deps:
      - annotations/raw
      - pipeline/validate.py
    outs:
      - annotations/validated

  build_dataset:
    cmd: python -m pipeline.build_dataset --annotations annotations/validated --out data/dataset
    deps:
      - annotations/validated
      - pipeline/build_dataset.py
    outs:
      - data/dataset
    params:
      - dataset.tile_size
      - dataset.crs

  train:
    cmd: python -m pipeline.train --dataset data/dataset --out models/detector.pt
    deps:
      - data/dataset
      - pipeline/train.py
    params:
      - train.epochs
      - train.lr
    outs:
      - models/detector.pt
    metrics:
      - metrics/eval.json:
          cache: false
```

The `validate_annotations` stage matters: it is the boundary between raw reviewer edits and the hash that drives retraining. Only labels that pass geometry and CRS checks land in `annotations/validated`, so an invalid polygon never changes the dependency hash that fires training. Keep the tile size and target [coordinate reference system](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) in `params.yaml` — for example a metric projection such as [`EPSG:32633`](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) — so a projection change also invalidates the build without touching the pipeline code.

<svg viewBox="0 0 720 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Flow from a dependency-hash change through dvc repro to the train stage" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>Hash-change to retraining flow</title>
  <desc>Newly validated annotations change the content hash of the annotations directory. dvc status detects the mismatch against dvc.lock. A manifest threshold gate checks the count of new features. When the count exceeds the minimum, dvc repro rebuilds the dataset stage and runs the train stage, producing a new checkpoint.</desc>
  <defs>
    <marker id="ah" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto">
      <polygon points="0 0, 9 3.5, 0 7" fill="currentColor" opacity="0.5"/>
    </marker>
  </defs>
  <!-- Node 1: new annotations -->
  <rect x="10" y="30" width="150" height="58" rx="7" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-width="1.5" opacity="0.8"/>
  <text x="85" y="54" text-anchor="middle" font-size="12" fill="currentColor" opacity="0.9" font-family="sans-serif">New validated</text>
  <text x="85" y="70" text-anchor="middle" font-size="12" fill="currentColor" opacity="0.9" font-family="sans-serif">annotations</text>
  <!-- Node 2: hash change -->
  <rect x="10" y="128" width="150" height="58" rx="7" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.55"/>
  <text x="85" y="152" text-anchor="middle" font-size="12" fill="currentColor" opacity="0.85" font-family="sans-serif">Content hash</text>
  <text x="85" y="168" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.6" font-family="sans-serif">differs from dvc.lock</text>
  <!-- Node 3: dvc status -->
  <rect x="210" y="128" width="150" height="58" rx="7" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.55"/>
  <text x="285" y="152" text-anchor="middle" font-size="12" fill="currentColor" opacity="0.85" font-family="sans-serif">dvc status</text>
  <text x="285" y="168" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.6" font-family="sans-serif">stage out of date</text>
  <!-- Node 4: threshold gate (diamond) -->
  <polygon points="470,157 525,120 580,157 525,194" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.7"/>
  <text x="525" y="153" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85" font-family="sans-serif">new ≥ min?</text>
  <text x="525" y="169" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.55" font-family="sans-serif">manifest gate</text>
  <!-- Node 5: dvc repro -->
  <rect x="560" y="30" width="150" height="58" rx="7" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-width="1.5" opacity="0.8"/>
  <text x="635" y="54" text-anchor="middle" font-size="12" fill="currentColor" opacity="0.9" font-family="sans-serif">dvc repro</text>
  <text x="635" y="70" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.6" font-family="sans-serif">build → train</text>
  <!-- Node 6: checkpoint -->
  <rect x="560" y="200" width="150" height="42" rx="7" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.55"/>
  <text x="635" y="226" text-anchor="middle" font-size="12" fill="currentColor" opacity="0.85" font-family="sans-serif">new checkpoint</text>
  <!-- Arrows -->
  <line x1="85" y1="88" x2="85" y2="126" stroke="currentColor" stroke-width="1.5" opacity="0.5" marker-end="url(#ah)"/>
  <line x1="160" y1="157" x2="208" y2="157" stroke="currentColor" stroke-width="1.5" opacity="0.5" marker-end="url(#ah)"/>
  <line x1="360" y1="157" x2="468" y2="157" stroke="currentColor" stroke-width="1.5" opacity="0.5" marker-end="url(#ah)"/>
  <line x1="580" y1="140" x2="620" y2="90" stroke="currentColor" stroke-width="1.5" opacity="0.5" marker-end="url(#ah)"/>
  <text x="612" y="118" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6" font-family="sans-serif">yes</text>
  <line x1="635" y1="88" x2="635" y2="198" stroke="currentColor" stroke-width="1.5" opacity="0.5" marker-end="url(#ah)"/>
  <!-- no path -->
  <line x1="525" y1="194" x2="525" y2="222" stroke="currentColor" stroke-width="1.3" stroke-dasharray="5 3" opacity="0.4"/>
  <text x="525" y="238" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.5" font-family="sans-serif">no — skip, wait for more</text>
</svg>

## The Manifest-Driven Trigger

The trigger is the gate between "something changed" and "spend a GPU-hour." It reads `dvc status` in JSON, confirms the `build_dataset` stage is out of date, then counts how many new features the validated directory holds compared to the last committed manifest. Only when that count clears the threshold does it return `True`.

```python
from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from pathlib import Path

import geopandas as gpd


@dataclass(frozen=True)
class TriggerConfig:
    stage: str = "build_dataset"
    annotations_dir: Path = Path("annotations/validated")
    manifest_path: Path = Path("annotations/manifest.json")
    min_new_features: int = 300
    min_new_fraction: float = 0.03


def stage_is_stale(stage: str) -> bool:
    """Return True if `dvc status` reports the given stage as changed."""
    proc = subprocess.run(
        ["dvc", "status", "--json", stage],
        capture_output=True, text=True, check=True,
    )
    status: dict[str, object] = json.loads(proc.stdout or "{}")
    return stage in status


def count_features(directory: Path) -> int:
    """Total feature count across every GeoJSON in the validated directory."""
    total = 0
    for path in sorted(directory.glob("**/*.geojson")):
        total += len(gpd.read_file(path))
    return total


def load_baseline(manifest_path: Path) -> int:
    if not manifest_path.exists():
        return 0
    data: dict[str, int] = json.loads(manifest_path.read_text())
    return int(data.get("feature_count", 0))


def should_retrain(cfg: TriggerConfig) -> tuple[bool, int]:
    """Decide whether a retraining run is justified.

    Returns (fire, new_feature_count).
    """
    if not stage_is_stale(cfg.stage):
        return False, 0

    current = count_features(cfg.annotations_dir)
    baseline = load_baseline(cfg.manifest_path)
    new = max(current - baseline, 0)

    absolute_ok = new >= cfg.min_new_features
    relative_ok = baseline == 0 or (new / baseline) >= cfg.min_new_fraction
    return (absolute_ok and relative_ok), new


def write_manifest(cfg: TriggerConfig, feature_count: int) -> None:
    """Persist the new baseline after a successful run."""
    cfg.manifest_path.write_text(
        json.dumps({"feature_count": feature_count}, indent=2)
    )
```

Two conditions must both hold: an absolute floor (`min_new_features`) and a relative floor (`min_new_fraction`). The relative check keeps the threshold meaningful as the dataset grows — 300 new features matter on a 2,000-feature set but are noise on a 200,000-feature set. Call `write_manifest` only after `dvc repro` succeeds, so a failed or skipped run leaves the baseline untouched and the new labels accumulate toward the next attempt. For local iteration, a `watchdog` observer on `annotations/validated` can call `should_retrain` on every change; the CI path calls the identical function on a schedule, keeping one source of truth.

One subtlety worth designing for early: the manifest stores a scalar feature count, which is enough to gate on volume but blind to which labels changed. If reviewers correct 300 existing polygons rather than adding 300 new ones, the count stays flat while the training signal shifts substantially. When that pattern matters for your workflow, extend the manifest to record a per-file hash map alongside the count, and treat any file whose hash changed as contributing to the "new" tally. That keeps corrections visible to the trigger without abandoning the cheap volume check for the common append-only case, and it composes cleanly with the class-coverage floor described in the threshold table below.

## Running It in CI on a Schedule

A scheduled GitHub Actions job pulls the tracked data, runs the trigger, and reproduces the pipeline only when the trigger fires. This is where hash detection pays off: the runner is stateless, but `dvc.lock` and the remote cache give it exactly the state it needs to decide.

```yaml
name: retrain-on-new-annotations
on:
  schedule:
    - cron: "0 3 * * *"   # nightly at 03:00 UTC
  workflow_dispatch: {}

jobs:
  maybe-retrain:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"
      - run: pip install dvc[s3]==3.55.2 geopandas==0.14.4 shapely==2.0.6 pyproj==3.6.1
      - run: dvc pull annotations/validated.dvc
      - name: Evaluate trigger and reproduce
        run: |
          python - <<'PY'
          import sys
          from pipeline.trigger import TriggerConfig, should_retrain
          fire, new = should_retrain(TriggerConfig())
          print(f"new_features={new} fire={fire}")
          sys.exit(0 if fire else 78)
          PY
      - name: Retrain
        if: success()
        run: |
          dvc repro train
          dvc push
          python -m pipeline.trigger_update   # write_manifest after success
```

Exit code `78` is a neutral "nothing to do" that many CI systems treat as a non-failure skip; the `Retrain` step runs `dvc repro train`, which walks the dependency graph, rebuilds `build_dataset` because its annotations hash changed, then executes `train`. `dvc push` uploads both the new dataset version and the checkpoint so they are reproducible from the committed `dvc.lock`. This mirrors the snapshot mechanics in [using DVC pipelines for automated snapshots](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/tracking-annotation-changes-with-sha-hashing/using-dvc-pipelines-for-automated-dataset-snapshots/), reused here as a retraining trigger rather than an archival one.

## Threshold Reference

Tune these guards to your model's data appetite and the cost of a run. Start conservative — a threshold too low is worse than too high, because a flood of marginal checkpoints is expensive to evaluate.

| Guard | Purpose | Suggested starting value | When to raise it |
|---|---|---|---|
| `min_new_features` (absolute) | Ignore trivial edits | 300 features | Detector needs large batches to move; runs are costly |
| `min_new_fraction` (relative) | Scale with dataset size | 0.03 (3%) | Dataset already large; small batches rarely help |
| Cooldown window | Prevent back-to-back runs | 12–24 hours | GPU queue is shared; nightly cadence is enough |
| Class-coverage floor | Avoid single-class batches | ≥ 2 classes represented | Rare-class recall is the goal of the loop |
| Eval-regression gate | Block bad checkpoints | mAP drop > 1% aborts promotion | Model is deployed and drift is costly |

The class-coverage floor is worth a note: a batch of 400 new features that are all one class can skew a detector toward that class. Extend `should_retrain` to inspect the label distribution of the new features and require a minimum spread before firing.

## Common Errors and Fixes

**`dvc status` reports the stage stale on a fresh checkout even though nothing changed**
Root cause: the annotations directory was pulled with different line endings or file ordering, changing the tree hash.
Fix: commit `dvc.lock` and pull the exact cached version with `dvc pull` before running the trigger; never re-add the directory with `dvc add` inside CI.

**Retraining fires on a one-line correction to a single tile**
Root cause: the trigger only checked `stage_is_stale` and skipped the feature-count gate.
Fix: ensure `should_retrain` returns after the `min_new_features` and `min_new_fraction` checks, and confirm the manifest baseline was written on the previous run.

**`subprocess` raises `CalledProcessError` from `dvc status --json`**
Root cause: DVC exits non-zero when the stage name is unknown or the repo has no `dvc.lock` yet.
Fix: run one `dvc repro` to initialise `dvc.lock`, and verify the stage name in `TriggerConfig` matches `dvc.yaml` exactly.

**The manifest baseline drifts and the threshold never triggers again**
Root cause: `write_manifest` ran even when `dvc repro` failed, advancing the baseline past labels that were never trained on.
Fix: call `write_manifest` only in the success branch of the CI job, after `dvc push` completes.

**`geopandas` count differs between the watcher and CI**
Root cause: one environment read a stale local copy of the annotations directory.
Fix: point both entry points at the DVC-tracked path and run `dvc checkout` before counting so the working tree matches `dvc.lock`.

## Related

- [Closing the Loop with Automated Model Retraining](https://www.geospatialannotation.com/active-learning-model-feedback-loops/closing-the-loop-with-automated-retraining/) — the topic area covering checkpoint promotion gates and evaluation guards that this trigger feeds into
- [Implementing DVC for Geospatial Training Data](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/) — set up DVC remotes, tracking, and cache before wiring a retraining stage on top
- [Using DVC Pipelines for Automated Dataset Snapshots](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/tracking-annotation-changes-with-sha-hashing/using-dvc-pipelines-for-automated-dataset-snapshots/) — the snapshot pipeline pattern this guide reuses as a retraining trigger
- [Active Learning & Model Feedback Loops for Geospatial Annotation](https://www.geospatialannotation.com/active-learning-model-feedback-loops/) — how automated retraining fits the wider loop of uncertainty sampling and drift detection

This guide is part of the broader [Closing the Loop with Automated Model Retraining](https://www.geospatialannotation.com/active-learning-model-feedback-loops/closing-the-loop-with-automated-retraining/) topic area within [Active Learning & Model Feedback Loops for Geospatial Annotation](https://www.geospatialannotation.com/active-learning-model-feedback-loops/).
