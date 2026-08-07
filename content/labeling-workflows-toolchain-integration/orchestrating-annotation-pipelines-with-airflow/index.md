---
title: "Orchestrating Annotation Pipelines with Airflow"
description: "Run the harvest, validate, export and version steps of a geospatial annotation pipeline as an Airflow DAG — with idempotent tasks, spatial-aware retries, and backfills that do not re-label anything."
slug: "orchestrating-annotation-pipelines-with-airflow"
type: "guide"
breadcrumb:
  - label: "Home"
    url: "/"
  - label: "Labeling Workflows & Toolchain Integration for Geospatial AI"
    url: "/labeling-workflows-toolchain-integration/"
  - label: "Orchestrating Annotation Pipelines with Airflow"
    url: "/labeling-workflows-toolchain-integration/orchestrating-annotation-pipelines-with-airflow/"
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
      "headline": "Orchestrating Annotation Pipelines with Airflow",
      "description": "Run the harvest, validate, export and version steps of a geospatial annotation pipeline as an Airflow DAG — with idempotent tasks, spatial-aware retries, and backfills that do not re-label anything.",
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
        {"@type": "ListItem", "position": 3, "name": "Orchestrating Annotation Pipelines with Airflow", "item": "https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/orchestrating-annotation-pipelines-with-airflow/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Orchestrate a geospatial annotation pipeline with Airflow",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Make every task idempotent", "text": "Key each task's output on the data interval and the content hash of its inputs, so re-running it produces the same artifact instead of a duplicate."},
        {"@type": "HowToStep", "position": 2, "name": "Harvest completed annotations only", "text": "Pull annotations whose review state is final for the interval, never work in progress, so a rerun does not capture a half-finished tile."},
        {"@type": "HowToStep", "position": 3, "name": "Validate before anything downstream", "text": "Run the geometry, CRS and schema checks as their own task, and let the DAG fail there rather than versioning a batch that the training loader will reject."},
        {"@type": "HowToStep", "position": 4, "name": "Version the artifact, not the run", "text": "Write a content-hashed manifest and push it with the dataset versioning tool, so a rerun that produces identical data creates no new version."},
        {"@type": "HowToStep", "position": 5, "name": "Make backfills safe by construction", "text": "Ensure tasks read only from their own data interval, so backfilling a month of intervals reconstructs history rather than re-exporting today's data many times."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why use Airflow when DVC already has a pipeline?",
          "acceptedAnswer": {"@type": "Answer", "text": "They solve different halves. DVC expresses a dependency graph over data artifacts and decides what needs recomputing when a file changes; it has no scheduler, no retries and no view of an annotation platform's API. Airflow supplies the schedule, the retry policy, the credentials and the alerting, and calls DVC for the data-dependency part. Running one inside the other is the normal arrangement."}
        },
        {
          "@type": "Question",
          "name": "What makes an annotation harvest task idempotent?",
          "acceptedAnswer": {"@type": "Answer", "text": "Two things: it queries the platform for a closed time window taken from the data interval rather than 'since last run', and it writes to a path derived from that window. Re-running the same interval then overwrites the same file with the same content, so downstream tasks see no change. A task that queries 'everything updated since I last ran' cannot be rerun safely and cannot be backfilled at all."}
        },
        {
          "@type": "Question",
          "name": "How should retries be configured for tasks that call an annotation platform?",
          "acceptedAnswer": {"@type": "Answer", "text": "Retry the transport, never the semantics. Network timeouts, 502s and rate limits deserve three retries with exponential backoff. A 4xx that means the payload was rejected should fail immediately, because retrying it just repeats a request the server has already judged invalid, and on a partially-applied batch it can duplicate features."}
        },
        {
          "@type": "Question",
          "name": "Should the training run be a task in the same DAG?",
          "acceptedAnswer": {"@type": "Answer", "text": "Keep it separate and trigger it. The annotation DAG runs on a data schedule and finishes in minutes; a training run takes hours, needs GPUs, and has its own retry and promotion semantics. Have the annotation DAG emit a dataset version and let a trigger on that version start training, so a slow training run never blocks tomorrow's harvest."}
        }
      ]
    }
  ]
}
</script>

# Orchestrating Annotation Pipelines with Airflow

An annotation pipeline that works when a person runs four scripts in order stops working the first night nobody runs them. The steps are not hard — harvest yesterday's completed annotations, validate the geometry, export a training artifact, version it — but they need a schedule, credentials, retries that distinguish a timeout from a rejection, and a backfill story for the week the platform was down. That is the job Airflow does, and doing it badly produces the specific failure this topic exists to prevent: a DAG that, when rerun, exports today's data into yesterday's partition and silently doubles a class.

The design rule that makes everything else work is that each task reads only from its own data interval and writes to a path derived from it. Get that right and reruns are free, backfills reconstruct history correctly, and a failed task can be cleared without anyone reasoning about what it already did.

## Prerequisites & Toolchain Alignment

```bash
pip install "apache-airflow==2.9.3" \
            "apache-airflow-providers-amazon==8.25.0" \
            geopandas==0.14.4 shapely==2.0.6 pyproj==3.6.1 dvc[s3]==3.51.2
```

Three assumptions the DAG below makes:

- **The annotation platform can be queried by a closed time window.** Label Studio, CVAT and most hosted platforms support filtering by update timestamp and review state. If yours only offers "changed since my last poll", wrap it in a store that records what each interval saw, because that endpoint cannot be backfilled.
- **The validators already exist as a library.** Airflow should call the same checks the [CI/CD gate](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/ci-cd-gates-for-annotation-datasets/) runs on pull requests, not a second copy that drifts from it.
- **Dataset versioning is content-addressed.** The final task pushes a manifest; if the content is unchanged the version must not advance, which is the property [tracking annotation changes with SHA hashing](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/tracking-annotation-changes-with-sha-hashing/) provides.

<svg viewBox="-6 50 752 246" role="img" aria-label="The annotation DAG's four tasks with their data-interval keyed inputs and outputs" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:752px;display:block;margin:1.5rem auto;">
  <title>Four tasks, each keyed on the data interval</title>
  <desc>Harvest reads the annotation platform for one closed interval and writes raw GeoJSON to a path containing that interval. Validate reads that path and writes a report. Export reads the validated features and writes a training artifact. Version hashes the artifact and pushes it. Because every path contains the interval, rerunning any task overwrites its own output and nothing else.</desc>
  <rect x="-6" y="50" width="752" height="246" style="fill:var(--bg)"/>
  <defs>
    <marker id="dag-arr" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor"/>
    </marker>
  </defs>
  <rect x="14" y="70" width="150" height="62" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="89" y="94" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">harvest</text>
  <text x="89" y="112" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.75">platform API, closed window</text>
  <line x1="164" y1="101" x2="194" y2="101" stroke="currentColor" stroke-width="1.5" marker-end="url(#dag-arr)"/>
  <rect x="196" y="70" width="150" height="62" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="271" y="94" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">validate</text>
  <text x="271" y="112" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.75">geometry · CRS · schema</text>
  <line x1="346" y1="101" x2="376" y2="101" stroke="currentColor" stroke-width="1.5" marker-end="url(#dag-arr)"/>
  <rect x="378" y="70" width="150" height="62" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="453" y="94" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">export</text>
  <text x="453" y="112" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.75">GeoParquet + COCO</text>
  <line x1="528" y1="101" x2="558" y2="101" stroke="currentColor" stroke-width="1.5" marker-end="url(#dag-arr)"/>
  <rect x="560" y="70" width="166" height="62" rx="6" fill="none" stroke="currentColor" stroke-width="2"/>
  <text x="643" y="94" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">version</text>
  <text x="643" y="112" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.75">hash, then push if changed</text>
  <!-- Paths -->
  <text x="89" y="164" text-anchor="middle" font-size="9" fill="currentColor" font-family="monospace" opacity="0.8">raw/{ds}/features.geojson</text>
  <text x="271" y="164" text-anchor="middle" font-size="9" fill="currentColor" font-family="monospace" opacity="0.8">reports/{ds}/validation.json</text>
  <text x="453" y="164" text-anchor="middle" font-size="9" fill="currentColor" font-family="monospace" opacity="0.8">export/{ds}/labels.parquet</text>
  <text x="643" y="164" text-anchor="middle" font-size="9" fill="currentColor" font-family="monospace" opacity="0.8">manifests/{ds}.json</text>
  <line x1="89" y1="132" x2="89" y2="150" stroke="currentColor" stroke-width="1" opacity="0.45"/>
  <line x1="271" y1="132" x2="271" y2="150" stroke="currentColor" stroke-width="1" opacity="0.45"/>
  <line x1="453" y1="132" x2="453" y2="150" stroke="currentColor" stroke-width="1" opacity="0.45"/>
  <line x1="643" y1="132" x2="643" y2="150" stroke="currentColor" stroke-width="1" opacity="0.45"/>
  <!-- Rule -->
  <rect x="14" y="196" width="712" height="80" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 3"/>
  <text x="370" y="220" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">every path contains the interval, so every task is safe to rerun</text>
  <text x="370" y="242" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">clearing a failed task overwrites exactly its own output; a backfill of last month writes last month's paths</text>
  <text x="370" y="260" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">drop the interval from one path and that task becomes the one nobody dares rerun</text>
</svg>

## Building the DAG

### Step 1 — Harvest a Closed Window

The single most important line in the DAG is the query bound. `data_interval_start` and `data_interval_end` are supplied by Airflow for the interval being processed, not for now, which is what makes a backfill mean anything.

```python
from __future__ import annotations
import json
from datetime import datetime, timedelta
from pathlib import Path

import httpx
from airflow.decorators import dag, task

PLATFORM = "https://labels.internal/api"

@task(retries=3, retry_delay=timedelta(minutes=2), retry_exponential_backoff=True)
def harvest(data_interval_start: datetime, data_interval_end: datetime, ds: str) -> str:
    """Pull annotations REVIEWED within this interval; write one file keyed on it."""
    out = Path(f"/data/raw/{ds}/features.geojson")
    out.parent.mkdir(parents=True, exist_ok=True)
    params = {
        "reviewed_after": data_interval_start.isoformat(),
        "reviewed_before": data_interval_end.isoformat(),
        "state": "approved",          # never work in progress
        "page_size": 500,
    }
    features: list[dict] = []
    with httpx.Client(timeout=60.0) as client:
        url = f"{PLATFORM}/annotations"
        while url:
            resp = client.get(url, params=params)
            if 400 <= resp.status_code < 500 and resp.status_code != 429:
                raise RuntimeError(f"platform rejected the query: {resp.status_code} {resp.text[:200]}")
            resp.raise_for_status()
            body = resp.json()
            features.extend(body["results"])
            url, params = body.get("next"), None
    out.write_text(json.dumps(
        {"type": "FeatureCollection", "features": features},
        indent=2, sort_keys=True) + "\n")
    return str(out)
```

The `state` filter is not a detail. Harvesting in-progress annotations means a tile half-drawn at midnight enters the dataset, gets exported, and is then re-harvested the next night in its finished form — two versions of one feature, both real, with nothing to reconcile them.

<svg viewBox="0 26 720 239" role="img" aria-label="Retry policy split by failure kind: transport errors retried with backoff, semantic rejections failed immediately" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>Retry the transport, never the semantics</title>
  <desc>A timeout, a 502 and a 429 are transport failures: the request never reached a verdict, so retrying with exponential backoff is correct. A 400 or 422 means the server has already judged the payload invalid, and a retry repeats a request that cannot succeed — worse, on a partially applied batch it can duplicate features. Those fail the task at once so a human reads the message.</desc>
  <rect x="0" y="26" width="720" height="239" style="fill:var(--bg)"/>
  <!-- Transport -->
  <rect x="20" y="46" width="330" height="170" rx="8" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="185" y="72" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">no verdict reached — retry</text>
  <text x="40" y="102" font-size="11" fill="currentColor" font-family="monospace">connection timeout</text>
  <text x="40" y="126" font-size="11" fill="currentColor" font-family="monospace">502 / 503 / 504</text>
  <text x="40" y="150" font-size="11" fill="currentColor" font-family="monospace">429 too many requests</text>
  <text x="185" y="182" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">3 attempts, exponential backoff</text>
  <text x="185" y="200" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">the same request can still succeed</text>
  <!-- Semantic -->
  <rect x="370" y="46" width="330" height="170" rx="8" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="5 3"/>
  <text x="535" y="72" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">already judged — fail now</text>
  <text x="390" y="102" font-size="11" fill="currentColor" font-family="monospace">400 malformed query</text>
  <text x="390" y="126" font-size="11" fill="currentColor" font-family="monospace">422 rejected payload</text>
  <text x="390" y="150" font-size="11" fill="currentColor" font-family="monospace">403 wrong credentials</text>
  <text x="535" y="182" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">0 attempts — the message is the fix</text>
  <text x="535" y="200" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">retrying a partial batch duplicates features</text>
  <text x="360" y="242" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">a blanket retry policy is the reason a broken filter shows up as three identical failures an hour apart instead of one clear error</text>
</svg>

The explicit 4xx check before `raise_for_status` distinguishes the two failure kinds: a malformed query should stop the DAG immediately, while a 429 or a 502 falls through to Airflow's retry policy.

### Step 2 — Validate as Its Own Task

Validation is a separate task so that its failure is legible in the DAG graph and so a fix can be applied and only that task cleared.

```python
@task
def validate(raw_path: str, ds: str) -> str:
    """Run the same checks the pull-request gate runs. Fail the task on any error."""
    import geopandas as gpd
    from annotation_gates import check_geometry, check_crs, check_schema   # shared library

    gdf = gpd.read_file(raw_path)
    errors: list[str] = []
    errors += check_geometry(gdf)
    errors += check_crs(gdf, expected="EPSG:4326")
    errors += check_schema(gdf, schema_path="/config/label_schema.json")

    report = Path(f"/data/reports/{ds}/validation.json")
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(json.dumps({"errors": errors, "n_features": len(gdf)}, indent=2) + "\n")
    if errors:
        raise ValueError(f"{len(errors)} validation error(s); first: {errors[0]}")
    return raw_path
```

Writing the report *before* raising is deliberate: the task fails, the DAG stops, and the artifact explaining why is already on disk rather than trapped in a log the on-call engineer has to page through.

### Step 3 — Export, Then Version Only If Something Changed

```python
@task
def export(validated_path: str, ds: str) -> str:
    import geopandas as gpd
    gdf = gpd.read_file(validated_path).to_crs("EPSG:4326")
    out = Path(f"/data/export/{ds}/labels.parquet")
    out.parent.mkdir(parents=True, exist_ok=True)
    gdf.to_parquet(out, index=False, compression="zstd")
    return str(out)

@task
def version(export_path: str, ds: str) -> str | None:
    """Hash the export; push a new dataset version only when the content moved."""
    import hashlib
    import subprocess

    digest = hashlib.sha256(Path(export_path).read_bytes()).hexdigest()
    marker = Path("/data/manifests/last_digest.txt")
    if marker.exists() and marker.read_text().strip() == digest:
        print(f"{ds}: content unchanged ({digest[:12]}) — no new version")
        return None
    subprocess.run(["dvc", "add", export_path], check=True)
    subprocess.run(["dvc", "push"], check=True)
    marker.parent.mkdir(parents=True, exist_ok=True)
    marker.write_text(digest + "\n")
    return digest
```

A nightly DAG that tags a version every night produces 365 versions a year and no way to find the ones that mattered. The digest comparison is what keeps the history readable.

### Step 4 — Wire It Up

```python
@dag(
    dag_id="annotation_harvest",
    schedule="0 2 * * *",                 # 02:00, after the review shift closes
    start_date=datetime(2026, 1, 1),
    catchup=False,                        # turn on deliberately for a backfill
    max_active_runs=1,                    # the export path is per interval, not per run
    default_args={"owner": "annotation-platform", "retries": 0},
    tags=["annotation", "geospatial"],
)
def annotation_harvest():
    raw = harvest()
    ok = validate(raw)
    art = export(ok)
    version(art)

annotation_harvest()
```

`max_active_runs=1` matters more than it looks. Two concurrent runs of different intervals write different paths and are safe; two concurrent runs of the *same* interval — which a manual trigger during a scheduled run produces — race on one file.

<svg viewBox="0 0 720 290" role="img" aria-label="A backfill over five intervals with a task-level retry, showing which outputs are rewritten" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>What a backfill actually rewrites</title>
  <desc>Five daily intervals are backfilled. Each run writes only the paths carrying its own date, so the five runs never touch each other's outputs. When the export task of the third interval fails and is cleared, only that interval's export and version tasks re-run. Nothing about the other four changes, and the versioning step produces at most one new version across the whole backfill.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <!-- Column headers -->
  <text x="150" y="42" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace" opacity="0.8">2026-07-01</text>
  <text x="264" y="42" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace" opacity="0.8">07-02</text>
  <text x="378" y="42" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace" opacity="0.8">07-03</text>
  <text x="492" y="42" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace" opacity="0.8">07-04</text>
  <text x="606" y="42" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace" opacity="0.8">07-05</text>
  <line x1="20" y1="52" x2="676" y2="52" stroke="currentColor" stroke-width="1" opacity="0.4"/>
  <!-- Rows -->
  <text x="20" y="80" font-size="11" fill="currentColor" font-family="monospace">harvest</text>
  <rect x="112" y="64" width="76" height="22" rx="4" fill="currentColor" opacity="0.35"/>
  <rect x="226" y="64" width="76" height="22" rx="4" fill="currentColor" opacity="0.35"/>
  <rect x="340" y="64" width="76" height="22" rx="4" fill="currentColor" opacity="0.35"/>
  <rect x="454" y="64" width="76" height="22" rx="4" fill="currentColor" opacity="0.35"/>
  <rect x="568" y="64" width="76" height="22" rx="4" fill="currentColor" opacity="0.35"/>
  <text x="20" y="122" font-size="11" fill="currentColor" font-family="monospace">validate</text>
  <rect x="112" y="106" width="76" height="22" rx="4" fill="currentColor" opacity="0.35"/>
  <rect x="226" y="106" width="76" height="22" rx="4" fill="currentColor" opacity="0.35"/>
  <rect x="340" y="106" width="76" height="22" rx="4" fill="currentColor" opacity="0.35"/>
  <rect x="454" y="106" width="76" height="22" rx="4" fill="currentColor" opacity="0.35"/>
  <rect x="568" y="106" width="76" height="22" rx="4" fill="currentColor" opacity="0.35"/>
  <text x="20" y="164" font-size="11" fill="currentColor" font-family="monospace">export</text>
  <rect x="112" y="148" width="76" height="22" rx="4" fill="currentColor" opacity="0.35"/>
  <rect x="226" y="148" width="76" height="22" rx="4" fill="currentColor" opacity="0.35"/>
  <rect x="340" y="148" width="76" height="22" rx="4" fill="none" stroke="currentColor" stroke-width="2"/>
  <rect x="454" y="148" width="76" height="22" rx="4" fill="currentColor" opacity="0.35"/>
  <rect x="568" y="148" width="76" height="22" rx="4" fill="currentColor" opacity="0.35"/>
  <text x="20" y="206" font-size="11" fill="currentColor" font-family="monospace">version</text>
  <rect x="112" y="190" width="76" height="22" rx="4" fill="currentColor" opacity="0.35"/>
  <rect x="226" y="190" width="76" height="22" rx="4" fill="currentColor" opacity="0.35"/>
  <rect x="340" y="190" width="76" height="22" rx="4" fill="none" stroke="currentColor" stroke-width="2"/>
  <rect x="454" y="190" width="76" height="22" rx="4" fill="currentColor" opacity="0.35"/>
  <rect x="568" y="190" width="76" height="22" rx="4" fill="currentColor" opacity="0.35"/>
  <!-- Legend -->
  <rect x="20" y="238" width="18" height="14" rx="3" fill="currentColor" opacity="0.35"/>
  <text x="46" y="250" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">ran once, wrote its own interval's path</text>
  <rect x="300" y="238" width="18" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="2"/>
  <text x="326" y="250" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">failed, cleared, re-ran — and touched nothing else</text>
  <text x="20" y="276" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">a task that wrote to a path without the interval in it would have made this grid one shared mutable file</text>
</svg>

## Pipeline Parameters & Configuration Reference

| Setting | Value | Why |
|---|---|---|
| `schedule` | after the review shift closes | Harvesting mid-shift captures work in progress |
| `catchup` | `False` by default | A new DAG with `catchup=True` immediately backfills to `start_date` |
| `max_active_runs` | 1 | Two runs of one interval race on the same path |
| Harvest `retries` | 3, exponential backoff | Rate limits and gateway errors are transient |
| Export/version `retries` | 0 | These are local and deterministic; a failure is a bug, not a blip |
| `execution_timeout` | 30 min on harvest | A hung API call should fail the run, not hold the slot until morning |
| Pool for platform tasks | dedicated, size 2 | Keeps a backfill from opening fifty concurrent connections to the platform |
| `depends_on_past` | `False` | Each interval is independent by construction — if it is not, the paths are wrong |

## Edge Cases & Gotchas

**A backfill that hammers the annotation platform.** Fifty parallel interval runs each paginating the API is indistinguishable from an attack. Put the platform tasks in a pool of two, so a backfill is slow rather than disruptive.

**Timezones on the interval bounds.** Airflow's intervals are timezone-aware; annotation platforms frequently return naive local timestamps. Comparing the two silently drops or duplicates an hour twice a year. Normalise to UTC at the boundary and store UTC in the harvested file.

**Reviewers who reopen an approved annotation.** A feature approved on Monday and corrected on Wednesday appears in two intervals. That is correct and the versioning layer handles it — the later export supersedes the earlier — but only if the export writes whole batches rather than appending.

**Secrets in the DAG file.** The platform token belongs in a connection or a secrets backend, not in the DAG. DAG files are parsed constantly and their contents end up in logs and in the UI's code view.

**A validation failure that blocks the schedule forever.** If today's harvest fails validation and the DAG has `depends_on_past=True`, every subsequent night fails too. Keep intervals independent and let the alert, not the scheduler, get the problem fixed.

## Integration & Automation Hooks

**Triggering training.** The `version` task returns a digest or `None`. Feed that into a downstream DAG trigger so retraining starts only on a real change — the same condition [triggering retraining from new annotations with DVC](https://www.geospatialannotation.com/active-learning-model-feedback-loops/closing-the-loop-with-automated-retraining/triggering-retraining-from-new-annotations-with-dvc/) applies from the DVC side.

**Sharing the validators with CI.** Import the same `annotation_gates` package the pull-request gate uses. Two copies of the rules is the reliable way to get a batch that passes CI and fails the DAG.

**Reporting to the annotation team.** A short Slack or email summary — features harvested, validation errors, whether a version was created — closes the loop for the people whose work the DAG is consuming. Silence on success and noise on failure trains everyone to ignore it; a one-line daily summary does not.

## Validation & Testing

DAGs deserve tests that do not need a scheduler.

```python
from airflow.models import DagBag

def test_dag_imports_without_errors() -> None:
    bag = DagBag(include_examples=False)
    assert bag.import_errors == {}, bag.import_errors

def test_paths_are_interval_scoped() -> None:
    """Every artifact path must contain the run's date, or reruns overwrite the wrong thing."""
    import inspect
    from dags.annotation_harvest import harvest, validate, export
    for fn in (harvest, validate, export):
        src = inspect.getsource(fn.function)
        assert "{ds}" in src, f"{fn.function.__name__} writes a path with no interval in it"

def test_client_error_is_not_retried(monkeypatch) -> None:
    """A 422 must raise immediately rather than falling into the retry policy."""
    import httpx, pytest
    from dags.annotation_harvest import harvest

    class Rejecting(httpx.Client):
        def get(self, *a, **k):
            return httpx.Response(422, text="bad filter", request=httpx.Request("GET", "http://x"))

    monkeypatch.setattr(httpx, "Client", Rejecting)
    with pytest.raises(RuntimeError, match="platform rejected"):
        harvest.function(datetime(2026, 7, 1), datetime(2026, 7, 2), "2026-07-01")
```

The second test is the one worth keeping. It feeds the DAG's own source to an assertion that would reject the most damaging mistake in this whole topic — an artifact path with no interval in it — rather than trusting that nobody will ever write one.

## Frequently Asked Questions

### Does this work with Prefect or Dagster instead?

The mechanics translate directly: a closed data interval, interval-scoped output paths, transport-only retries and a content-hashed versioning step are properties of the pipeline, not of Airflow. Dagster's asset model expresses the artifact keying more naturally; Prefect's flow-run parameters need the interval passed explicitly. The failure this topic is about — a rerun overwriting the wrong partition — is available in all three.

### Where should the tile-serving and pre-labelling steps sit?

Pre-labelling belongs in its own DAG upstream of the annotation queue, because it runs when new imagery arrives rather than when annotations are completed. Tile serving is a service, not a task — see [serving imagery tiles to annotation tools](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/serving-imagery-tiles-to-annotation-tools/) — and should never be started or stopped by a DAG.

### How do I handle a platform that only supports "changed since last poll"?

Wrap it. Keep a small table of `(interval, cursor_before, cursor_after)`, have the harvest task advance the cursor and record which interval consumed which range, and serve backfills from that table. It is more code than a date filter and it is the only way to make an incremental endpoint repeatable.

### What belongs in the DAG versus in DVC?

Scheduling, credentials, retries, alerting and the platform API in Airflow; the data dependency graph and the cache in DVC. When the export step needs to know whether the tiling stage is stale, that is a DVC question, and the Airflow task should simply call `dvc repro` and let it decide — the pattern [implementing DVC for geospatial training data](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/) sets out.

## The Property Worth Protecting

Everything in this topic is downstream of a single property: a task reads only from its own data interval
and writes only to a path derived from it. It is worth restating because it is the property that erodes
first. A quick fix that writes to a shared "latest" path, a convenience symlink, an export step that
appends rather than replaces — each is individually reasonable and each removes the guarantee that makes
reruns free and backfills correct. The test in the validation section exists because that erosion is
invisible in review and expensive to discover.

## Related

- [CI/CD Gates for Annotation Datasets](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/ci-cd-gates-for-annotation-datasets/) — the validators this DAG calls, and why both paths must share one implementation
- [Implementing DVC for Geospatial Training Data](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/) — the data-dependency half of the pipeline that the version task delegates to
- [Human-in-the-Loop Validation Cycles](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/human-in-the-loop-validation-cycles/) — the review states the harvest filter depends on
- [Serving Imagery Tiles to Annotation Tools](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/serving-imagery-tiles-to-annotation-tools/) — the service side of the same toolchain, deliberately outside the DAG

Orchestration is the connective tissue of the broader [Labeling Workflows & Toolchain Integration](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/) pipeline, turning a sequence of scripts into something that runs unattended.
