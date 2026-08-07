---
title: "Backfilling a Month of Annotation Harvests"
description: "Re-run a month of missed annotation harvests without duplicating features or hammering the platform: interval-scoped paths, a concurrency pool, and the dry run that proves it before it starts."
slug: "backfilling-a-month-of-annotation-harvests"
type: "tutorial"
breadcrumb:
  - label: "Home"
    url: "/"
  - label: "Labeling Workflows & Toolchain Integration for Geospatial AI"
    url: "/labeling-workflows-toolchain-integration/"
  - label: "Orchestrating Annotation Pipelines with Airflow"
    url: "/labeling-workflows-toolchain-integration/orchestrating-annotation-pipelines-with-airflow/"
  - label: "Backfilling a Month of Annotation Harvests"
    url: "/labeling-workflows-toolchain-integration/orchestrating-annotation-pipelines-with-airflow/backfilling-a-month-of-annotation-harvests/"
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
      "headline": "Backfilling a Month of Annotation Harvests",
      "description": "Re-run a month of missed annotation harvests without duplicating features or hammering the platform: interval-scoped paths, a concurrency pool, and the dry run that proves it before it starts.",
      "datePublished": "2026-08-08",
      "dateModified": "2026-08-08",
      "author": {"@type": "Organization", "name": "Geospatial Annotation"},
      "publisher": {"@type": "Organization", "name": "Geospatial Annotation"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.geospatialannotation.com/"},
        {"@type": "ListItem", "position": 2, "name": "Labeling Workflows & Toolchain Integration for Geospatial AI", "item": "https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/"},
        {"@type": "ListItem", "position": 3, "name": "Orchestrating Annotation Pipelines with Airflow", "item": "https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/orchestrating-annotation-pipelines-with-airflow/"},
        {"@type": "ListItem", "position": 4, "name": "Backfilling a Month of Annotation Harvests", "item": "https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/orchestrating-annotation-pipelines-with-airflow/backfilling-a-month-of-annotation-harvests/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Backfill a month of annotation harvest runs",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Verify the paths are interval-scoped", "text": "Confirm every task writes to a path containing its own data interval, because a backfill of a DAG without that property overwrites one shared file thirty times."},
        {"@type": "HowToStep", "position": 2, "name": "Cap concurrency with a pool", "text": "Put the platform-facing tasks in a pool of two so thirty parallel runs cannot saturate the annotation API."},
        {"@type": "HowToStep", "position": 3, "name": "Dry-run one interval first", "text": "Run a single historical interval and compare its output against what that day originally produced, before committing to the whole range."},
        {"@type": "HowToStep", "position": 4, "name": "Backfill the range", "text": "Trigger the range with the scheduler's backfill command, ordered oldest first so downstream consumers see history arrive in sequence."},
        {"@type": "HowToStep", "position": 5, "name": "Reconcile the version count", "text": "Confirm the backfill produced one dataset version per genuinely distinct day, not one per run, which is what content hashing gives you."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Will a backfill duplicate annotations that were already harvested?",
          "acceptedAnswer": {"@type": "Answer", "text": "Not if each interval writes to its own path and each query is bounded by that interval. Re-running 12 July overwrites 12 July's file with the same content, and the content-hash check downstream then produces no new dataset version. If either property is missing, a backfill duplicates everything it touches, which is why the dry run comes first."}
        },
        {
          "@type": "Question",
          "name": "Should a backfill run oldest first or newest first?",
          "acceptedAnswer": {"@type": "Answer", "text": "Oldest first. Downstream consumers — a training trigger, a dashboard, an alerting rule — usually assume history arrives in order, and a newest-first backfill briefly presents a dataset whose latest version is older than the one before it. Oldest first also makes progress legible: the gap closes from one end."}
        },
        {
          "@type": "Question",
          "name": "How long should a month-long backfill take?",
          "acceptedAnswer": {"@type": "Answer", "text": "With a pool of two and a harvest that takes about four minutes, thirty intervals take roughly an hour. That is the right order of magnitude: fast enough to finish in a working session, slow enough that the annotation platform never notices. A backfill that finishes in five minutes is one that ran thirty concurrent requests against a production API."}
        },
        {
          "@type": "Question",
          "name": "What if the annotation platform has since deleted the data for those days?",
          "acceptedAnswer": {"@type": "Answer", "text": "Then the backfill will faithfully record that those intervals were empty, which is worse than leaving the gap because it looks like a real answer. Check the platform's retention window before backfilling beyond it, and if the data is gone, record the gap explicitly in the dataset's provenance rather than filling it with empty files."}
        }
      ]
    }
  ]
}
</script>

# Backfilling a Month of Annotation Harvests

The harvest DAG was broken for four weeks — a rotated credential nobody noticed — and the dataset has a month-shaped hole in it. Backfilling looks like one command, and on a DAG whose tasks are interval-scoped it very nearly is. On a DAG whose tasks are not, the same command writes today's data into thirty historical partitions and doubles a class in every one. This guide covers the check that tells you which DAG you have, the pool that keeps the backfill from taking the annotation platform down with it, and the dry run that proves the whole thing on one interval first.

## Why This Matters in Geospatial Pipelines

A gap in an annotation dataset is not merely missing rows. Annotations are harvested by review date, and the tiles reviewed in a given week cluster geographically — that is how work is assigned. A four-week gap is therefore usually a *spatial* gap, and a model trained without it has a hole in its coverage rather than slightly less data. That is also why filling the gap with empty files is worse than leaving it: it converts a visible absence into an apparent measurement.

<svg viewBox="0 0 720 260" role="img" aria-label="A four-week harvest gap shown as a spatial hole in the covered area rather than as missing rows" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>A month of missed harvests is a hole in the map</title>
  <desc>Work is assigned geographically, so the tiles reviewed during the four broken weeks are clustered in one part of the study area. The gap in the dataset is therefore a contiguous region with no labels, not a thin random sample missing from everywhere, and a model trained on it has a coverage hole rather than marginally less data.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <text x="180" y="36" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">what the gap looks like on the ground</text>
  <rect x="60" y="52" width="240" height="160" fill="none" stroke="currentColor" stroke-width="1.3"/>
  <g fill="currentColor" opacity="0.35">
    <rect x="60" y="52" width="60" height="40"/><rect x="120" y="52" width="60" height="40"/><rect x="180" y="52" width="60" height="40"/><rect x="240" y="52" width="60" height="40"/>
    <rect x="60" y="92" width="60" height="40"/><rect x="240" y="92" width="60" height="40"/>
    <rect x="60" y="132" width="60" height="40"/><rect x="240" y="132" width="60" height="40"/>
    <rect x="60" y="172" width="60" height="40"/><rect x="120" y="172" width="60" height="40"/><rect x="180" y="172" width="60" height="40"/><rect x="240" y="172" width="60" height="40"/>
  </g>
  <rect x="120" y="92" width="120" height="80" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="5 3"/>
  <text x="180" y="138" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif">the four broken weeks</text>
  <text x="180" y="234" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">a contiguous region with no labels at all</text>
  <!-- Right panel -->
  <rect x="380" y="60" width="320" height="66" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="540" y="84" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">backfilling restores the coverage</text>
  <text x="540" y="104" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">if the platform still holds those reviews</text>
  <rect x="380" y="140" width="320" height="80" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 3"/>
  <text x="540" y="164" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">writing empty files does not</text>
  <text x="540" y="184" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">it turns a visible absence into an apparent</text>
  <text x="540" y="200" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">measurement of zero — check retention first</text>
</svg>

## Step-by-Step Implementation

### Step 1 — Prove the Paths Are Interval-Scoped

Before triggering anything, confirm the property the whole operation rests on. The cheapest check is on the code, not on the data.

```python
import inspect

def assert_interval_scoped(*task_fns) -> None:
    """Every task must write to a path containing its own data interval."""
    for fn in task_fns:
        src = inspect.getsource(getattr(fn, "function", fn))
        writes = [ln for ln in src.splitlines() if "Path(" in ln or "open(" in ln]
        for ln in writes:
            if "{ds}" not in ln and "data_interval" not in ln:
                raise AssertionError(
                    f"{getattr(fn, '__name__', fn)}: writes a path with no interval in it:\n  {ln.strip()}")
```

If this fails, do not backfill. Fix the paths first, because a backfill over shared paths is not recoverable by re-running — the original contents are gone.

### Step 2 — Cap Concurrency With a Pool

Thirty parallel runs each paginating an annotation API is a denial-of-service attack on your own platform. A pool makes the backfill polite by construction.

```bash
airflow pools set annotation_api 2 "Serialises platform-facing tasks during backfills"
```

```python
@task(pool="annotation_api", retries=3, retry_delay=timedelta(minutes=2),
      retry_exponential_backoff=True, execution_timeout=timedelta(minutes=30))
def harvest(data_interval_start, data_interval_end, ds: str) -> str:
    ...
```

Only the platform-facing task needs the pool. Validation, export and versioning are local and can run at whatever parallelism the workers allow, so the backfill is serialised exactly where it needs to be and nowhere else.

### Step 3 — Dry-Run One Interval and Compare

Pick an interval that ran successfully before the outage, re-run it into a scratch prefix, and compare the result against what it produced originally. If the two match, the DAG is genuinely idempotent and the range is safe.

<svg viewBox="0 0 700 250" role="img" aria-label="A dry run comparing a re-harvested interval against what that interval originally produced" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:700px;display:block;margin:1.5rem auto;">
  <title>The dry run is one interval, and it decides the whole operation</title>
  <desc>A single past interval is re-harvested into a scratch prefix and its digest compared against the original. Matching digests prove the DAG is genuinely idempotent and the range is safe to run. Differing digests have three causes — reviews edited since, a taxonomy change, or a query bounded by last-run rather than by the interval — and only the third must stop the backfill.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <defs>
    <marker id="dry-arr" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor"/>
    </marker>
  </defs>
  <rect x="20" y="40" width="180" height="52" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="110" y="62" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">original 12 July output</text>
  <text x="110" y="80" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace" opacity="0.8">sha 4f2a…</text>
  <rect x="20" y="112" width="180" height="52" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="110" y="134" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">re-harvest of 12 July</text>
  <text x="110" y="152" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace" opacity="0.8">sha ?</text>
  <line x1="200" y1="66" x2="242" y2="94" stroke="currentColor" stroke-width="1.4" marker-end="url(#dry-arr)" opacity="0.7"/>
  <line x1="200" y1="138" x2="242" y2="110" stroke="currentColor" stroke-width="1.4" marker-end="url(#dry-arr)" opacity="0.7"/>
  <rect x="244" y="76" width="120" height="52" rx="6" fill="none" stroke="currentColor" stroke-width="2"/>
  <text x="304" y="106" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">compare</text>
  <line x1="364" y1="90" x2="404" y2="66" stroke="currentColor" stroke-width="1.4" marker-end="url(#dry-arr)"/>
  <line x1="364" y1="114" x2="404" y2="146" stroke="currentColor" stroke-width="1.4" marker-end="url(#dry-arr)"/>
  <rect x="406" y="40" width="274" height="52" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="543" y="62" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">identical → run the range</text>
  <text x="543" y="80" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">the DAG is genuinely idempotent</text>
  <rect x="406" y="120" width="274" height="70" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 3"/>
  <text x="543" y="142" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">different → find out why first</text>
  <text x="543" y="160" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">edited reviews and taxonomy changes are fine;</text>
  <text x="543" y="176" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">an unbounded query is not, and must stop it</text>
  <text x="350" y="224" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">one interval costs four minutes and is the only evidence that twenty-eight of them are safe</text>
</svg>

```python
import hashlib
from pathlib import Path

def compare_reharvest(original: str, reharvested: str) -> None:
    """A re-run of a past interval must reproduce that interval's content."""
    a = hashlib.sha256(Path(original).read_bytes()).hexdigest()
    b = hashlib.sha256(Path(reharvested).read_bytes()).hexdigest()
    if a != b:
        raise AssertionError(
            f"re-harvest of the same interval differs\n  was {a[:16]}\n  now {b[:16]}\n"
            "the query is not interval-bounded, or reviews were edited since")
```

A mismatch has two innocent explanations and one alarming one. Reviews genuinely edited since that day will change the content legitimately; so will a taxonomy change. A query bounded by "since last run" rather than by the interval will also differ, and that is the case that must stop the backfill.

### Step 4 — Run the Range, Oldest First

```bash
airflow dags backfill annotation_harvest \
  --start-date 2026-06-08 --end-date 2026-07-05 \
  --reset-dagruns --rerun-failed-tasks
```

Oldest first is the default and is the behaviour you want: downstream consumers see history arrive in order, and progress is legible as a gap closing from one end rather than as thirty runs in unpredictable states.

Watch the pool, not the DAG. With a pool of two and a four-minute harvest, twenty-eight intervals take roughly an hour, and a run queue that is not draining at that rate means the platform is throttling — which the retry policy will handle, more slowly.

### Step 5 — Reconcile the Version Count

A correct backfill produces one dataset version per genuinely distinct day, not one per run.

```python
def reconcile(expected_days: int, versions_created: int, unchanged_days: int) -> None:
    if versions_created + unchanged_days != expected_days:
        raise AssertionError(
            f"{expected_days} intervals backfilled but {versions_created} versions "
            f"and {unchanged_days} no-change days recorded — the content check is not running")
```

If the count comes out at one version per interval including days with no reviews, the content-hash comparison in the version task is not being consulted, and the dataset history has just gained a month of noise. That check is the one described in [triggering retraining from new annotations with DVC](https://www.geospatialannotation.com/active-learning-model-feedback-loops/closing-the-loop-with-automated-retraining/triggering-retraining-from-new-annotations-with-dvc/).

<svg viewBox="0 0 720 270" role="img" aria-label="A backfill of twenty-eight intervals through a pool of two, and the versions it should produce" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>Twenty-eight intervals, two at a time, nine new versions</title>
  <desc>The pool admits two platform-facing tasks at a time, so twenty-eight intervals drain steadily over about an hour rather than arriving at once. Of those intervals, nineteen fall on days with no completed reviews and produce no dataset version, while nine contain real work and produce one version each — which is what the content-hash comparison is for.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <!-- Queue -->
  <text x="20" y="46" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">28 queued intervals</text>
  <g fill="currentColor" opacity="0.28">
    <rect x="20" y="58" width="18" height="22" rx="3"/><rect x="42" y="58" width="18" height="22" rx="3"/>
    <rect x="64" y="58" width="18" height="22" rx="3"/><rect x="86" y="58" width="18" height="22" rx="3"/>
    <rect x="108" y="58" width="18" height="22" rx="3"/><rect x="130" y="58" width="18" height="22" rx="3"/>
    <rect x="152" y="58" width="18" height="22" rx="3"/><rect x="174" y="58" width="18" height="22" rx="3"/>
    <rect x="196" y="58" width="18" height="22" rx="3"/><rect x="218" y="58" width="18" height="22" rx="3"/>
    <rect x="240" y="58" width="18" height="22" rx="3"/><rect x="262" y="58" width="18" height="22" rx="3"/>
    <rect x="284" y="58" width="18" height="22" rx="3"/><rect x="306" y="58" width="18" height="22" rx="3"/>
  </g>
  <text x="334" y="74" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">…and 14 more</text>
  <!-- Pool -->
  <rect x="20" y="108" width="180" height="60" rx="6" fill="none" stroke="currentColor" stroke-width="2"/>
  <text x="110" y="132" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">pool: annotation_api</text>
  <text x="110" y="152" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">two slots, always</text>
  <line x1="200" y1="138" x2="234" y2="138" stroke="currentColor" stroke-width="1.5" marker-end="url(#bf-arr)"/>
  <defs>
    <marker id="bf-arr" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor"/>
    </marker>
  </defs>
  <rect x="236" y="108" width="180" height="60" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="326" y="132" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">≈ 4 min per interval</text>
  <text x="326" y="152" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">≈ 1 hour for the range</text>
  <line x1="416" y1="138" x2="450" y2="138" stroke="currentColor" stroke-width="1.5" marker-end="url(#bf-arr)"/>
  <!-- Outcome -->
  <rect x="452" y="96" width="248" height="40" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="576" y="121" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">19 days with no reviews → no version</text>
  <rect x="452" y="144" width="248" height="40" rx="6" fill="none" stroke="currentColor" stroke-width="2"/>
  <text x="576" y="169" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">9 days with work → 9 versions</text>
  <text x="360" y="222" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">28 versions instead of 9 means the content-hash comparison is not running,</text>
  <text x="360" y="240" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">and the history has just gained a month of entries nobody can navigate</text>
</svg>

## Parameters and Thresholds Reference

| Setting | Value | Reason |
|---|---|---|
| Pool size | 2 | Keeps the platform's request rate near a normal day's |
| Backfill order | oldest first | Downstream consumers assume history arrives in order |
| `execution_timeout` | 30 min | A hung interval should release its pool slot |
| `--reset-dagruns` | yes, for a known gap | Clears prior failed states so the range runs cleanly |
| Dry-run interval | one that previously succeeded | The only comparison that proves idempotence |
| Retention check | before starting | Beyond it, the backfill records absence as data |

## Common Errors and Fixes

**Every backfilled day produces a new dataset version**
Root cause: the version task is not comparing content hashes.
Fix: restore the digest comparison; then re-run the range, which is safe precisely because the paths are interval-scoped.

**The platform starts returning 429 halfway through**
Root cause: the pool is larger than the platform's rate allowance, or another job shares the token.
Fix: reduce the pool to one and let the retry backoff absorb the rest. The backfill takes twice as long and nobody else notices it.

**Backfilled files are all empty**
Root cause: the harvest filters on review state and those reviews were completed before the state field existed, or beyond the retention window.
Fix: stop the backfill, record the gap in the dataset's provenance, and do not ship empty files as though they were measurements.

**The DAG re-runs but downstream training does not**
Root cause: the training trigger fires on a dataset version, and the backfill produced versions with historical timestamps that the trigger's watermark has already passed.
Fix: trigger training once, explicitly, after the backfill completes — it is one decision, not twenty-eight.

## Frequently Asked Questions

### Can I backfill only the failed task rather than the whole DAG?

Yes, with `--rerun-failed-tasks`, and it is the right choice when the harvest succeeded and only the export broke. Clearing the failed task re-runs it against its own interval's inputs, which are still on disk.

### What if the taxonomy changed during the gap?

Then the backfilled annotations use the taxonomy in force when they were reviewed, and the export must map them into the current one. Version the taxonomy and record which version each batch was labelled under, as [defining ROI label taxonomies](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/defining-roi-label-taxonomies-for-aerial-imagery/) covers.

### Does a backfill need a separate approval?

For a month of production data, yes — treat it as a deployment. It writes to the dataset that models are trained from, and the dry run in Step 3 is the evidence that goes with the request.

### Should the backfill run on the same schedule slot as the nightly?

No. Set `max_active_runs` so the nightly and the backfill cannot both process the same interval, and prefer running the backfill while the schedule is paused. Two runs of one interval racing on one path is the one failure mode the interval-scoped design does not protect against.

## Related

- [Orchestrating Annotation Pipelines with Airflow](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/orchestrating-annotation-pipelines-with-airflow/) — the DAG design whose interval-scoped paths make this operation safe
- [Using DVC Pipelines for Automated Dataset Snapshots](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/tracking-annotation-changes-with-sha-hashing/using-dvc-pipelines-for-automated-dataset-snapshots/) — the content-hash comparison that keeps a backfill from flooding the version history
- [Human-in-the-Loop Validation Cycles](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/human-in-the-loop-validation-cycles/) — the review states the harvest query filters on

Backfilling is one operation within [Orchestrating Annotation Pipelines with Airflow](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/orchestrating-annotation-pipelines-with-airflow/), part of [Labeling Workflows & Toolchain Integration](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/).
