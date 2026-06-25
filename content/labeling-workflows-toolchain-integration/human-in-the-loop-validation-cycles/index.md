---
title: "Human-in-the-Loop Validation Cycles for Geospatial AI Training"
description: "Build production-grade human-in-the-loop validation pipelines for geospatial annotation: confidence-based routing, topology QA, CRS enforcement, active learning integration, and Python implementation patterns."
slug: "human-in-the-loop-validation-cycles"
type: "cluster"
breadcrumb: "Labeling Workflows & Toolchain Integration > Human-in-the-Loop Validation Cycles"
datePublished: "2025-03-12"
dateModified: "2026-06-25"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Human-in-the-Loop Validation Cycles for Geospatial AI Training",
      "description": "Build production-grade human-in-the-loop validation pipelines for geospatial annotation: confidence-based routing, topology QA, CRS enforcement, active learning integration, and Python implementation patterns.",
      "datePublished": "2025-03-12",
      "dateModified": "2026-06-25",
      "author": {"@type": "Organization", "name": "Geospatial Annotation"},
      "publisher": {"@type": "Organization", "name": "Geospatial Annotation"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://geospatialannotation.com/"},
        {"@type": "ListItem", "position": 2, "name": "Labeling Workflows & Toolchain Integration", "item": "https://geospatialannotation.com/labeling-workflows-toolchain-integration/"},
        {"@type": "ListItem", "position": 3, "name": "Human-in-the-Loop Validation Cycles", "item": "https://geospatialannotation.com/labeling-workflows-toolchain-integration/human-in-the-loop-validation-cycles/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Implement Human-in-the-Loop Validation Cycles for Geospatial Annotation",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Configure toolchain and CRS baseline"},
        {"@type": "HowToStep", "position": 2, "name": "Generate pre-labels with confidence scores"},
        {"@type": "HowToStep", "position": 3, "name": "Route predictions into review queues"},
        {"@type": "HowToStep", "position": 4, "name": "Run human review and spatial correction"},
        {"@type": "HowToStep", "position": 5, "name": "Execute automated topology QA"},
        {"@type": "HowToStep", "position": 6, "name": "Export validated data and trigger retraining"}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What confidence thresholds should I use for routing geospatial predictions?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Start with 0.85 for auto-approval and 0.50 for senior review escalation, but calibrate against your ground sampling distance and feature class. Dense urban parcels need tighter thresholds (0.90+) than large agricultural polygons (0.75+). Use rolling percentiles rather than static cutoffs to adapt across biomes and sensor types."
          }
        },
        {
          "@type": "Question",
          "name": "How do I prevent CRS drift between the pre-labeling stage and human review?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Enforce a single exchange CRS (EPSG:4326) at ingestion and reject any payload lacking explicit CRS metadata. Store the source CRS in a sidecar JSON alongside every prediction batch. Convert to a local metric projection only within analysis functions, and convert back before exporting to the annotation platform."
          }
        },
        {
          "@type": "Question",
          "name": "Should automated topology repair run before or after human review?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run a lightweight repair pass (make_valid) before presenting geometries to reviewers so they work on structurally sound shapes. Run a second, stricter QA pass after human edits to catch artifacts introduced by manual vertex manipulation. Never silently mutate ground-truth — log every repair with the geometry ID and repair type."
          }
        },
        {
          "@type": "Question",
          "name": "Does area computed in EPSG:4326 give correct sliver thresholds?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "No. GeoDataFrame .area returns degree-squared values when the CRS is EPSG:4326. Always reproject to EPSG:3857 or a local UTM zone before any area comparison — otherwise sliver filters are silently wrong by several orders of magnitude."
          }
        },
        {
          "@type": "Question",
          "name": "What happens when make_valid() repairs a self-intersecting polygon?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "make_valid() can split a self-intersecting polygon into a MultiPolygon, changing feature count. Always log the repair type and geometry ID, and never repair without a flag downstream tools can inspect. In production, set allow_auto_repair=False and re-queue invalid geometries for human correction instead."
          }
        }
      ]
    }
  ]
}
</script>

# Human-in-the-Loop Validation Cycles for Geospatial AI Training

Automated pre-labeling consistently produces prediction batches where 15–40% of geometries contain topological errors, [coordinate reference system](/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) ambiguities, or semantic misclassifications that compound into training noise. A well-structured human-in-the-loop validation cycle intercepts these defects before they reach the ground-truth dataset — routing predictions by confidence, applying spatial QA, and feeding reviewer corrections back into the model. Without this cycle, a single bad prediction batch can silently shift IoU metrics by several percentage points across an entire training run.

This page details a production-tested validation architecture: from toolchain prerequisites through confidence-based routing, topology enforcement, and active learning integration. It is one component of the broader [Labeling Workflows & Toolchain Integration](/labeling-workflows-toolchain-integration/) pipeline.

---

<svg viewBox="0 0 820 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Human-in-the-loop validation cycle data flow diagram" style="width:100%;max-width:820px;display:block;margin:2rem auto;">
  <title>Human-in-the-Loop Validation Cycle</title>
  <desc>Data flow from pre-label generation through confidence routing, human review, topology QA, and retraining feedback loop. High-confidence predictions bypass human review via auto-approve. Topology failures are re-queued for human correction. Validated exports feed active learning for improved pre-labels.</desc>
  <defs>
    <marker id="arrow-hitl" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor" opacity="0.7"/>
    </marker>
  </defs>
  <!-- Stage boxes -->
  <!-- 1: Pre-label -->
  <rect x="10" y="110" width="120" height="56" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="70" y="132" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">Pre-Label</text>
  <text x="70" y="148" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">+ Confidence</text>
  <text x="70" y="161" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">Score</text>
  <!-- Arrow 1→2 -->
  <line x1="130" y1="138" x2="168" y2="138" stroke="currentColor" stroke-width="1.5" marker-end="url(#arrow-hitl)" opacity="0.6"/>
  <!-- 2: Router -->
  <rect x="170" y="110" width="120" height="56" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="230" y="132" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">Threshold</text>
  <text x="230" y="148" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">Router</text>
  <text x="230" y="161" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">3 queues</text>
  <!-- High-conf bypass arrow (top) -->
  <path d="M290,122 Q380,55 460,122" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="5,3" marker-end="url(#arrow-hitl)" opacity="0.45"/>
  <text x="378" y="44" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.65">High conf</text>
  <text x="378" y="56" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.65">→ auto-approve</text>
  <!-- Arrow 2→3 (medium/low) -->
  <line x1="290" y1="138" x2="328" y2="138" stroke="currentColor" stroke-width="1.5" marker-end="url(#arrow-hitl)" opacity="0.6"/>
  <!-- 3: Human Review -->
  <rect x="330" y="110" width="128" height="56" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="394" y="132" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">Human</text>
  <text x="394" y="148" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">Review &amp;</text>
  <text x="394" y="161" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">Correction</text>
  <!-- Arrow 3→4 -->
  <line x1="458" y1="138" x2="496" y2="138" stroke="currentColor" stroke-width="1.5" marker-end="url(#arrow-hitl)" opacity="0.6"/>
  <!-- 4: Topology QA -->
  <rect x="498" y="110" width="128" height="56" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="562" y="132" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">Topology</text>
  <text x="562" y="148" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">QA &amp; CRS</text>
  <text x="562" y="161" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">Validation</text>
  <!-- Reject back arrow (bottom) -->
  <path d="M498,162 Q420,240 330,162" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="4,3" marker-end="url(#arrow-hitl)" opacity="0.45"/>
  <text x="414" y="230" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.65">Topology failures</text>
  <text x="414" y="242" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.65">→ re-queue</text>
  <!-- Arrow 4→5 -->
  <line x1="626" y1="138" x2="664" y2="138" stroke="currentColor" stroke-width="1.5" marker-end="url(#arrow-hitl)" opacity="0.6"/>
  <!-- 5: Export + Retrain -->
  <rect x="666" y="110" width="140" height="56" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="736" y="132" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">Export &amp;</text>
  <text x="736" y="148" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">DVC Version</text>
  <text x="736" y="161" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">+ Retrain</text>
  <!-- Feedback arrow (bottom, long) -->
  <path d="M736,166 L736,285 L70,285 L70,166" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="5,3" marker-end="url(#arrow-hitl)" opacity="0.35"/>
  <text x="400" y="297" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.55">Active learning feedback → improved pre-labels</text>
</svg>

## Prerequisites & Toolchain Alignment

Before implementing a validation loop, ensure your infrastructure supports bidirectional data flow, spatial validation, and version control. The baseline stack:

```
# Python dependencies (pin in requirements.txt)
geopandas==0.14.4
shapely==2.0.6
pyproj==3.6.1
rasterio==1.3.10
requests==2.32.3
```

System dependencies: GDAL 3.6+ with PROJ 9.2+ (install via `conda install -c conda-forge gdal` or the OS package manager; pip-only installs frequently produce PROJ grid mismatches).

Annotation platform: [Label Studio](/labeling-workflows-toolchain-integration/integrating-label-studio-with-geospatial-workflows/) or CVAT, both of which expose REST APIs for programmatic queue management.

Spatial knowledge prerequisites: understand [coordinate reference systems in annotation pipelines](/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) before configuring any CRS enforcement layer — projection mismatches at this stage are the most common cause of silent accuracy regressions.

---

## Core Validation Workflow

### Step 1 — Pre-Label Generation and Confidence Scoring

Foundation models process raw satellite, aerial, or drone imagery to generate initial vector predictions. Each geometry receives a model confidence score and an uncertainty metric from the model's softmax or MC-dropout output.

Batch-process large tile grids while preserving metadata for downstream routing. Configure [automating pre-labeling with foundation models](/labeling-workflows-toolchain-integration/automating-pre-labeling-with-foundation-models/) to write confidence scores into a dedicated `pred_confidence` column and source `EPSG:4326` coordinates directly from the geotransform. Do not allow models to write in arbitrary CRS — enforce `EPSG:4326` at the model output layer.

```python
import geopandas as gpd
from shapely.validation import make_valid

def load_predictions(path: str, target_crs: str = "EPSG:4326") -> gpd.GeoDataFrame:
    """Load and normalise a prediction GeoJSON batch."""
    gdf = gpd.read_file(path)

    # Reject batches with no CRS metadata — do not silently assume
    if gdf.crs is None:
        raise ValueError(f"Prediction file {path} has no CRS metadata. Rejecting batch.")

    if gdf.crs.to_epsg() != int(target_crs.split(":")[1]):
        gdf = gdf.to_crs(target_crs)

    # Pre-repair before scoring — prevents downstream make_valid churn
    gdf["geometry"] = gdf["geometry"].apply(
        lambda g: make_valid(g) if not g.is_valid else g
    )

    if "pred_confidence" not in gdf.columns:
        raise KeyError("Prediction batch must contain a 'pred_confidence' column.")

    return gdf
```

### Step 2 — Threshold-Based Routing and Queue Management

Predictions split into three operational queues based on confidence thresholds and spatial complexity. The function below handles routing and writes each queue to a dedicated GeoJSON file for the annotation platform to ingest.

```python
import logging
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

def route_predictions(
    gdf: gpd.GeoDataFrame,
    high_thresh: float = 0.85,
    low_thresh: float = 0.50,
    output_dir: str = "queues/",
) -> dict[str, gpd.GeoDataFrame]:
    """
    Partition a prediction GeoDataFrame into three review queues.
    Returns a dict keyed by queue name.
    """
    if gdf.empty:
        logging.warning("Empty GeoDataFrame — nothing to route.")
        return {"high": gdf.iloc[0:0], "medium": gdf.iloc[0:0], "low": gdf.iloc[0:0]}

    conf = gdf["pred_confidence"]
    high  = gdf[conf >= high_thresh].copy()
    medium = gdf[(conf >= low_thresh) & (conf < high_thresh)].copy()
    low   = gdf[conf < low_thresh].copy()

    # Sliver filter on the auto-approve queue only
    # Use metric projection for area — never compute area in EPSG:4326
    high_metric = high.to_crs("EPSG:3857")
    sliver_mask = high_metric.geometry.area < 100  # 100 m²
    if sliver_mask.any():
        logging.warning(f"Dropping {sliver_mask.sum()} sliver(s) from high-confidence queue.")
        high = high[~sliver_mask.values]

    queues = {"high": high, "medium": medium, "low": low}
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)
    for name, q in queues.items():
        q.to_file(out / f"{name}.geojson", driver="GeoJSON")

    logging.info(
        "Routing complete | high=%d  medium=%d  low=%d",
        len(high), len(medium), len(low),
    )
    return queues
```

**Dynamic thresholding:** Replace static cutoffs with rolling percentiles that adapt to model performance across biomes and sensor types. Compute the 85th-percentile confidence within each tile grid cell and use that as the high-threshold for that cell rather than a global constant.

### Step 3 — Human Review and Spatial Correction

Reviewers interact with pre-labeled geometries through the annotation platform. Ensure annotators can snap vertices, merge fragmented polygons, correct class labels, and validate attribute tables without leaving the browser.

Enforce these editing rules at the platform level before submission:

- Prohibit self-intersecting polygons (most platforms support a live topology check toggle).
- Require a minimum vertex count appropriate to the feature class (e.g. 4 for parcels, 6 for complex buildings).
- Block submission if required attributes are empty (class label, review timestamp, annotator ID).

Log all edits with user IDs, timestamps, and diff metadata. This audit trail feeds [confidence scoring for geospatial labels](/geospatial-annotation-fundamentals-architecture/confidence-scoring-for-geospatial-labels/) in the next training cycle and enables inter-annotator agreement analysis.

### Step 4 — Topology Validation and Automated QA

Human corrections introduce new spatial artifacts — vertex snapping creates bowties, polygon merges leave unclosed rings, and attribute copy-paste produces duplicate features. Run an automated QA pass before exporting:

```python
import geopandas as gpd
from shapely.validation import make_valid, explain_validity
from shapely.geometry import MultiPolygon, Polygon

def topology_qa(
    gdf: gpd.GeoDataFrame,
    min_area_m2: float = 100.0,
    allow_auto_repair: bool = False,
) -> tuple[gpd.GeoDataFrame, gpd.GeoDataFrame]:
    """
    Run topology QA on reviewed geometries.
    Returns (clean_gdf, rejected_gdf).
    Rejected rows include an 'error' column describing the failure.
    """
    errors: list[dict] = []
    clean_rows: list[int] = []

    metric = gdf.to_crs("EPSG:3857")

    for idx, row in metric.iterrows():
        geom = row.geometry
        if geom is None or geom.is_empty:
            errors.append({"orig_idx": idx, "error": "null_or_empty_geometry"})
            continue

        if not geom.is_valid:
            reason = explain_validity(geom)
            if allow_auto_repair:
                geom = make_valid(geom)
                metric.at[idx, "geometry"] = geom
                logging.info("Auto-repaired %s: %s", idx, reason)
            else:
                errors.append({"orig_idx": idx, "error": f"invalid_geometry: {reason}"})
                continue

        if geom.area < min_area_m2:
            errors.append({"orig_idx": idx, "error": f"sliver: area={geom.area:.1f}m²"})
            continue

        clean_rows.append(idx)

    # Duplicate detection by geometry hash
    clean = metric.loc[clean_rows].to_crs("EPSG:4326")
    clean["_geom_hash"] = clean.geometry.apply(lambda g: hash(g.wkb))
    dup_mask = clean.duplicated("_geom_hash", keep="first")
    if dup_mask.any():
        logging.warning("Found %d duplicate geometries — dropping.", dup_mask.sum())
        clean = clean[~dup_mask].drop(columns=["_geom_hash"])
    else:
        clean = clean.drop(columns=["_geom_hash"])

    import pandas as pd
    rejected = gpd.GeoDataFrame(errors, crs="EPSG:4326") if errors else gpd.GeoDataFrame()
    return clean, rejected
```

Rejected features must be routed back to the reviewer queue with the `error` field as an explicit flag rather than silently dropped. Never mutate ground truth without a logged rationale.

### Step 5 — DVC Versioning and Training Export

Validated exports merge with the ground-truth dataset, get versioned via [DVC for geospatial training data](/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/), and stage for model retraining:

```python
import subprocess
from pathlib import Path

def commit_validated_export(
    clean_gdf: gpd.GeoDataFrame,
    export_path: str = "data/validated/ground_truth.geojson",
    dvc_remote: str = "myremote",
) -> None:
    """Write validated GeoDataFrame and push to DVC remote."""
    out = Path(export_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    clean_gdf.to_file(out, driver="GeoJSON")

    subprocess.run(["dvc", "add", str(out)], check=True)
    subprocess.run(["dvc", "push", "--remote", dvc_remote], check=True)
    subprocess.run(["git", "add", f"{out}.dvc", ".gitignore"], check=True)
    subprocess.run(["git", "commit", "-m", f"chore: validated export {out.name}"], check=True)
    logging.info("Exported and versioned %s", out)
```

An active learning scheduler then samples high-entropy regions and complex geometries from the rejected queue to seed the next pre-labeling batch, closing the feedback loop.

---

## Spatial Parameters and Configuration Reference

| Parameter | Type | Recommended Range | Notes |
|---|---|---|---|
| `high_thresh` | float | 0.80 – 0.92 | Raise for fine-grained urban parcels; lower for large agricultural polygons |
| `low_thresh` | float | 0.40 – 0.60 | Below this = senior annotator or domain expert queue |
| `min_area_m2` | float | 50 – 500 | Calibrate to GSD × minimum feature footprint |
| `target_crs` | str | `EPSG:4326` | Exchange CRS; convert to metric only for area/length calculations |
| `metric_crs` | str | `EPSG:3857` or local UTM | Area computation; reconvert before export |
| `allow_auto_repair` | bool | `False` in production | Only `True` in dev environments; all repairs must be logged |
| `dvc_remote` | str | your remote alias | Set in `dvc config core.remote` |

---

## Edge Cases and Spatial-Specific Failure Modes

**CRS drift between pipeline stages.** The most common silent failure: pre-labels exit the model in one CRS, the annotation platform reprojects on load, and the export assumes a third. Enforce `EPSG:4326` at every I/O boundary and reject any payload without explicit CRS metadata. Store the source CRS in a sidecar JSON alongside every prediction batch.

**Sliver polygons from vertex snapping.** Manual snapping introduces 1–5 m² slivers along shared boundaries. Computing area in `EPSG:4326` gives meaningless degree-squared values — always reproject to a metric CRS (local UTM or `EPSG:3857`) before any area filter. See [tracking annotation changes with SHA hashing](/dataset-versioning-spatial-data-sync/tracking-annotation-changes-with-sha-hashing/) for detecting these across dataset versions.

**Duplicate geometry from merge operations.** Annotators merging fragmented polygons sometimes submit the merged feature while the original fragments remain in the queue. A geometry hash (`hash(geom.wkb)`) catches exact duplicates; use a spatial index with a buffer tolerance (0.5 m in metric projection) to catch near-duplicates introduced by rounding.

**Annotation sync conflicts in distributed teams.** When reviewers across time zones edit the same tile, cloud sync delays cause version conflicts. Implement optimistic concurrency control with ETags or version hashes. [Syncing QGIS edits to cloud annotation platforms](/labeling-workflows-toolchain-integration/human-in-the-loop-validation-cycles/syncing-qgis-edits-to-cloud-annotation-platforms/) provides a reliable bridge between local GIS workflows and centralized ML pipelines.

**Z-coordinate inconsistencies in 3D datasets.** Lidar-derived 3D polygon layers carry Z coordinates that `make_valid()` does not handle correctly — it can collapse Z extents or introduce NaN altitudes. Strip Z coordinates with `shapely.ops.transform` before topology repair, then restore from the original elevation model if needed.

**Confidence score miscalibration across sensor types.** A model calibrated on Sentinel-2 multispectral imagery produces systematically overconfident scores on 10 cm drone RGB. Maintain separate confidence percentile tables per sensor type and apply isotonic regression calibration on a held-out set before deploying any new sensor into the routing pipeline.

---

## Integration and Automation Hooks

### Label Studio REST API Integration

```python
import requests

def push_queue_to_label_studio(
    geojson_path: str,
    project_id: int,
    base_url: str,
    api_token: str,
) -> list[int]:
    """Upload a GeoJSON queue file as Label Studio tasks."""
    import json
    with open(geojson_path) as f:
        features = json.load(f)["features"]

    tasks = [
        {
            "data": {
                "geojson": feat,
                "pred_confidence": feat["properties"].get("pred_confidence"),
            }
        }
        for feat in features
    ]

    resp = requests.post(
        f"{base_url}/api/projects/{project_id}/import",
        headers={"Authorization": f"Token {api_token}"},
        json=tasks,
        timeout=60,
    )
    resp.raise_for_status()
    return [t["id"] for t in resp.json()]
```

### GitHub Actions CI Gate

Add this job to your annotation dataset repository to block merges when topology QA fails:

```yaml
name: Annotation QA Gate

on:
  pull_request:
    paths:
      - 'data/reviewed/**'

jobs:
  topology-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"
      - run: pip install geopandas==0.14.4 shapely==2.0.6
      - name: Run topology QA
        run: |
          python - <<'EOF'
          import geopandas as gpd, sys
          gdf = gpd.read_file("data/reviewed/ground_truth.geojson")
          invalid = gdf[~gdf.geometry.is_valid]
          if not invalid.empty:
              print(f"FAIL: {len(invalid)} invalid geometries")
              sys.exit(1)
          print(f"PASS: {len(gdf)} geometries valid")
          EOF
```

---

## Validation and Testing

Assert correctness end-to-end before merging any validated export:

```python
import pytest
import geopandas as gpd
from shapely.validation import explain_validity

def test_export_geometry_validity(export_path: str = "data/validated/ground_truth.geojson") -> None:
    gdf = gpd.read_file(export_path)
    assert not gdf.empty, "Export must not be empty"
    assert gdf.crs is not None, "Export must have CRS metadata"
    assert gdf.crs.to_epsg() == 4326, f"Export CRS must be EPSG:4326, got {gdf.crs.to_epsg()}"

    invalid = gdf[~gdf.geometry.is_valid]
    messages = [explain_validity(g) for g in invalid.geometry]
    assert invalid.empty, f"Invalid geometries in export: {messages}"

def test_no_duplicate_geometries(export_path: str = "data/validated/ground_truth.geojson") -> None:
    gdf = gpd.read_file(export_path)
    hashes = gdf.geometry.apply(lambda g: hash(g.wkb))
    assert not hashes.duplicated().any(), "Export contains duplicate geometries"

def test_crs_roundtrip(export_path: str = "data/validated/ground_truth.geojson") -> None:
    """CRS roundtrip: EPSG:4326 → EPSG:3857 → EPSG:4326 must not drift > 1 cm."""
    from pyproj import Transformer
    gdf = gpd.read_file(export_path)
    metric = gdf.to_crs("EPSG:3857")
    back = metric.to_crs("EPSG:4326")
    max_drift = gdf.geometry.distance(back.geometry).max()
    assert max_drift < 1e-7, f"CRS roundtrip drift exceeds threshold: {max_drift}"
```

Run with `pytest -v tests/test_validation_export.py` as the final gate before pushing to the DVC remote.

---

## Common Pipeline Gotchas

**Area computed in `EPSG:4326` silently gives wrong sliver thresholds.**
GeoDataFrame `.area` returns degree-squared values when the CRS is `EPSG:4326`. Reproject to `EPSG:3857` or a local UTM before any area comparison.

**`make_valid()` changes polygon topology.**
It can split a self-intersecting polygon into a MultiPolygon, changing feature count. Always log the repair type and geometry ID; never repair without a flag downstream tools can inspect.

**Label Studio task import silently truncates large batches.**
The `/api/projects/{id}/import` endpoint defaults to a 1000-task limit per request. Chunk imports into batches of 500 and check the returned task count.

**DVC push fails silently when remote credentials expire.**
Add a post-push verification step: `dvc status --remote myremote` should return no "new" files after a successful push.

**Annotator ID missing from edit log.**
Without annotator IDs in the diff metadata, inter-annotator agreement analysis is impossible. Enforce this at the platform level — block submission if `annotator_id` is null.

---

## Related

- [Automating Pre-Labeling with Foundation Models](/labeling-workflows-toolchain-integration/automating-pre-labeling-with-foundation-models/) — configure the upstream stage that produces the prediction batches this cycle consumes
- [Integrating Label Studio with Geospatial Workflows](/labeling-workflows-toolchain-integration/integrating-label-studio-with-geospatial-workflows/) — REST API configuration, GeoJSON task format, and export hooks
- [QGIS Plugin Ecosystem for Annotation Teams](/labeling-workflows-toolchain-integration/qgis-plugin-ecosystem-for-annotation-teams/) — desktop-side review tooling for complex topology corrections
- [Syncing QGIS Edits to Cloud Annotation Platforms](/labeling-workflows-toolchain-integration/human-in-the-loop-validation-cycles/syncing-qgis-edits-to-cloud-annotation-platforms/) — bridge between local GIS edits and the centralized validation queue
- [Implementing DVC for Geospatial Training Data](/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/) — version control for validated exports and rollback strategies

This workflow is one component of the broader [Labeling Workflows & Toolchain Integration](/labeling-workflows-toolchain-integration/) pipeline.
