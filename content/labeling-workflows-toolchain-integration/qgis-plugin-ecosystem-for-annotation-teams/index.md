---
title: "QGIS Plugin Ecosystem for Annotation Teams"
description: "Configure, extend, and automate the QGIS plugin stack for production geospatial annotation pipelines: CRS harmonization, schema enforcement, pre-label ingestion, FlatGeobuf export, and CI/CD integration."
slug: "qgis-plugin-ecosystem-for-annotation-teams"
type: "cluster"
breadcrumb: "Labeling Workflows & Toolchain Integration > QGIS Plugin Ecosystem for Annotation Teams"
datePublished: "2025-03-10"
dateModified: "2026-06-25"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "QGIS Plugin Ecosystem for Annotation Teams",
      "description": "Configure, extend, and automate the QGIS plugin stack for production geospatial annotation pipelines: CRS harmonization, schema enforcement, pre-label ingestion, FlatGeobuf export, and CI/CD integration.",
      "datePublished": "2025-03-10",
      "dateModified": "2026-06-25",
      "author": {"@type": "Organization", "name": "Geospatial Annotation"},
      "publisher": {"@type": "Organization", "name": "Geospatial Annotation"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://geospatialannotation.com/"},
        {"@type": "ListItem", "position": 2, "name": "Labeling Workflows & Toolchain Integration", "item": "https://geospatialannotation.com/labeling-workflows-toolchain-integration/"},
        {"@type": "ListItem", "position": 3, "name": "QGIS Plugin Ecosystem for Annotation Teams", "item": "https://geospatialannotation.com/labeling-workflows-toolchain-integration/qgis-plugin-ecosystem-for-annotation-teams/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Build a Production QGIS Annotation Stack",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Environment initialization and plugin deployment"},
        {"@type": "HowToStep", "position": 2, "name": "CRS harmonization across ingested layers"},
        {"@type": "HowToStep", "position": 3, "name": "Schema enforcement with field constraints"},
        {"@type": "HowToStep", "position": 4, "name": "Pre-label ingestion and human-in-the-loop refinement"},
        {"@type": "HowToStep", "position": 5, "name": "FlatGeobuf export and CI/CD integration"}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why do QGIS annotation layers produce misaligned polygons after export?",
          "acceptedAnswer": {"@type": "Answer", "text": "The most common cause is on-the-fly reprojection in QGIS combined with an annotation layer stored in a different CRS than the project. Lock project CRS before annotation begins and store all layers in the same projected CRS (e.g. EPSG:3857 or a local UTM zone) to prevent coordinate transformation drift at export time."}
        },
        {
          "@type": "Question",
          "name": "Which QGIS export format is best for ML training pipelines?",
          "acceptedAnswer": {"@type": "Answer", "text": "FlatGeobuf is preferred for large exports because it supports streaming reads and binary geometry encoding with no size limit. GeoJSON is acceptable for smaller datasets or web-based pipelines. Avoid Shapefile for new pipelines due to the 2 GB file limit and truncated field names."}
        },
        {
          "@type": "Question",
          "name": "How do I safely run heavy processing in QGIS without freezing the UI?",
          "acceptedAnswer": {"@type": "Answer", "text": "Use QgsTask subclasses for all processing that touches large datasets. Never call QgsVectorLayer methods directly from a background thread. Emit signals on completion and update the UI only from the main thread."}
        }
      ]
    }
  ]
}
</script>

# QGIS Plugin Ecosystem for Annotation Teams

When a polygon layer annotated in QGIS arrives at a model training job only to collapse IoU scores by 30 percentage points, the culprit is rarely the annotators. It is almost always a silent [coordinate reference system](/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) mismatch between the QGIS project, the background imagery, and the export format — compounded by missing schema constraints that let attribute drift accumulate undetected. QGIS has matured into a programmable orchestration layer for geospatial ML pipelines, but extracting that value requires deliberate plugin configuration, PyQGIS scripting discipline, and tight integration with downstream training infrastructure.

This page covers the full production workflow: plugin stack deployment, `EPSG:3857`-enforced CRS harmonization, attribute schema constraints, SAM-based pre-label ingestion, FlatGeobuf export, and CI/CD hooks — all grounded in the broader [Labeling Workflows & Toolchain Integration](/labeling-workflows-toolchain-integration/) pipeline.

<svg viewBox="0 0 820 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="QGIS annotation pipeline: from raw imagery through plugin stack, CRS enforcement, schema validation, pre-label ingestion, human review, and FlatGeobuf export to ML training" style="width:100%;max-width:820px;display:block;margin:2rem auto;">
  <title>QGIS Annotation Pipeline</title>
  <desc>Five-stage pipeline showing raw imagery entering the QGIS plugin stack, passing through CRS harmonization and schema validation, receiving SAM pre-labels, undergoing human-in-the-loop review, and exiting as FlatGeobuf to an ML training job.</desc>
  <defs>
    <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
      <polygon points="0 0, 8 3, 0 6" fill="currentColor" opacity="0.6"/>
    </marker>
  </defs>
  <!-- Stage boxes -->
  <rect x="10" y="70" width="120" height="80" rx="8" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="70" y="103" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">Raw Imagery</text>
  <text x="70" y="119" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">+ LiDAR / SAR</text>
  <text x="70" y="135" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">VRT tiling</text>
  <rect x="160" y="50" width="130" height="120" rx="8" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="225" y="82" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">QGIS Plugin Stack</text>
  <text x="225" y="99" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">QuickMapServices</text>
  <text x="225" y="114" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">Digitizing Tools</text>
  <text x="225" y="129" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">GeoJSON Validator</text>
  <text x="225" y="144" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">CRS lock: EPSG:3857</text>
  <rect x="320" y="50" width="130" height="120" rx="8" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="385" y="82" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">Schema + Pre-labels</text>
  <text x="385" y="99" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">Field constraints</text>
  <text x="385" y="114" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">SAM inference</text>
  <text x="385" y="129" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">polygonize masks</text>
  <text x="385" y="144" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">topology checks</text>
  <rect x="480" y="50" width="130" height="120" rx="8" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="545" y="82" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">Human Review</text>
  <text x="545" y="99" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">Advanced Digitizing</text>
  <text x="545" y="114" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">snapping rules</text>
  <text x="545" y="129" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">review_status flag</text>
  <text x="545" y="144" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">audit log JSON</text>
  <rect x="640" y="70" width="130" height="80" rx="8" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="705" y="103" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">Export + CI/CD</text>
  <text x="705" y="119" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">FlatGeobuf / GeoJSON</text>
  <text x="705" y="135" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">GitHub Actions gate</text>
  <!-- Arrows -->
  <line x1="130" y1="110" x2="158" y2="110" stroke="currentColor" stroke-width="1.5" marker-end="url(#arrowhead)" opacity="0.6"/>
  <line x1="290" y1="110" x2="318" y2="110" stroke="currentColor" stroke-width="1.5" marker-end="url(#arrowhead)" opacity="0.6"/>
  <line x1="450" y1="110" x2="478" y2="110" stroke="currentColor" stroke-width="1.5" marker-end="url(#arrowhead)" opacity="0.6"/>
  <line x1="610" y1="110" x2="638" y2="110" stroke="currentColor" stroke-width="1.5" marker-end="url(#arrowhead)" opacity="0.6"/>
  <!-- Stage labels -->
  <text x="70" y="168" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.5">Stage 1</text>
  <text x="225" y="185" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.5">Stage 2</text>
  <text x="385" y="185" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.5">Stage 3</text>
  <text x="545" y="185" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.5">Stage 4</text>
  <text x="705" y="165" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.5">Stage 5</text>
</svg>

## Prerequisites & Toolchain Alignment

Lock down your dependency stack before the first annotator opens a project. Version drift between QGIS releases and PyQGIS API changes causes subtle geometry handling regressions that are expensive to trace after data is collected.

**System dependencies (install via OS package manager):**

- QGIS 3.34 LTR or 3.36+ (PyQGIS API stable; Qt6; long-term security patches)
- GDAL 3.8+ / PROJ 9.3+ (required for `gdalwarp` resampling options and accurate datum grids)
- Python 3.11 (use a `conda` environment or system `venv`; never install into QGIS's bundled Python directly)

**Python packages with pinned versions:**

```
geopandas==1.0.1
rasterio==1.3.10
shapely==2.0.5
pyproj==3.6.1
gdal==3.8.5
requests==2.31.0
```

**Spatial knowledge prerequisites:** Annotators should understand projected vs. geographic CRS distinctions before editing. The [coordinate reference systems in annotation pipelines](/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) page covers datum transformations, EPSG code selection, and the consequences of mixing geographic and projected coordinates in the same processing chain.

## Core Workflow

### Step 1 — Environment Initialization & Plugin Stack Deployment

Provision a clean QGIS profile per project to isolate plugin versions from legacy desktop configurations. A dedicated profile prevents annotation plugins from breaking shared desktop GIS environments and allows reproducible rollout to all annotator workstations.

Install the following plugins via QGIS Plugin Manager, then pin them to the installed version (disable auto-updates in production):

- **QuickMapServices** — basemap context (aerial, OpenStreetMap, Esri)
- **Digitizing Tools** — topology-aware vertex editing and constraint snapping
- **GeoJSON Validator** — inline schema compliance checks against RFC 7946
- **fmtPlugin** (optional) — FlatGeobuf export with attribute pass-through

Automate profile provisioning for team rollouts:

```bash
# Create a named profile and launch QGIS with it
qgis --profile annotation-prod

# Distribute custom processing scripts via the profile's plugin directory
# Store in version control; sync to annotator machines via rsync or a config-management tool
rsync -av ./python/plugins/ ~/.local/share/QGIS/QGIS3/profiles/annotation-prod/python/plugins/
```

### Step 2 — CRS Harmonization Across Ingested Layers

Misaligned coordinate reference systems are the leading cause of silent topology errors in annotation exports. Even a small datum offset — a few metres between `EPSG:3857` and a local UTM zone — collapses IoU scores for small objects such as vehicles or roof segments.

The following PyQGIS script enforces a project-wide CRS at load time. It detects layers that do not match the target CRS and reprojects them using the native processing algorithm, which preserves attribute schemas and handles curved geometries correctly:

```python
from __future__ import annotations
from qgis.core import (
    QgsProject,
    QgsCoordinateReferenceSystem,
    QgsMapLayer,
    QgsTask,
    QgsApplication,
)
import processing

TARGET_EPSG = "EPSG:3857"
TARGET_CRS = QgsCoordinateReferenceSystem(TARGET_EPSG)
project = QgsProject.instance()

# Lock the project CRS before any layer is added
project.setCrs(TARGET_CRS)

layers_to_reproject: list[tuple[str, str]] = []

for layer_id, layer in project.mapLayers().items():
    if layer.type() == QgsMapLayer.VectorLayer and layer.crs() != TARGET_CRS:
        layers_to_reproject.append((layer_id, layer.name()))

for layer_id, name in layers_to_reproject:
    result = processing.run(
        "native:reprojectlayer",
        {
            "INPUT": layer_id,
            "TARGET_CRS": TARGET_CRS,
            "OUTPUT": "memory:",
        },
    )
    reprojected = result["OUTPUT"]
    reprojected.setName(f"{name}_reprojected")
    project.addMapLayer(reprojected)
    print(f"Reprojected {name!r} → {TARGET_EPSG}")
```

For raster layers, align before ingestion using `gdalwarp`. Use `-r lanczos` for continuous imagery and `-r nearest` for categorical masks or pre-existing annotation rasters to avoid introducing interpolated class values:

```bash
gdalwarp \
  -t_srs EPSG:3857 \
  -r lanczos \
  -of GTiff \
  -co TILED=YES \
  -co COMPRESS=DEFLATE \
  input_ortho.tif output_ortho_3857.tif
```

Build Virtual Raster Tables (VRT) for multi-gigabyte orthomosaics to avoid loading entire files into RAM:

```bash
gdalbuildvrt -resolution highest mosaic.vrt tile_*.tif
```

### Step 3 — Schema Enforcement with Field Constraints

Annotation quality degrades quickly when attribute schemas drift across annotators or sprints. QGIS field constraints block invalid entries at the point of data entry, before errors propagate into export files and corrupt training labels.

Define mandatory attributes for every feature class, then apply constraints via PyQGIS:

```python
from qgis.core import (
    QgsVectorLayer,
    QgsField,
    QgsFieldConstraints,
)
from qgis.PyQt.QtCore import QVariant

REQUIRED_FIELDS: dict[str, QVariant.Type] = {
    "class_id": QVariant.Int,
    "confidence": QVariant.Double,
    "annotator_id": QVariant.String,
    "review_status": QVariant.String,
}

def enforce_schema(layer: QgsVectorLayer) -> None:
    with layer.editCommandStarted("Enforce schema"):
        for field_name, field_type in REQUIRED_FIELDS.items():
            if layer.fields().indexFromName(field_name) == -1:
                layer.dataProvider().addAttributes([QgsField(field_name, field_type)])
            layer.updateFields()

            constraints = QgsFieldConstraints()
            constraints.setConstraint(
                QgsFieldConstraints.ConstraintNotNull,
                QgsFieldConstraints.ConstraintOriginLayer,
            )
            idx = layer.fields().indexFromName(field_name)
            layer.setFieldConstraint(idx, QgsFieldConstraints.ConstraintNotNull)
    print("Schema enforced on", layer.name())
```

Pair field constraints with QGIS form widgets: use **Value Maps** for `class_id` and `review_status` to prevent typos, **Range Sliders** (0.0–1.0) for `confidence`, and read-only expressions for `annotator_id` populated from the OS login. Assign per-annotation [confidence scores](/geospatial-annotation-fundamentals-architecture/confidence-scoring-for-geospatial-labels/) to drive active learning queues in downstream training workflows.

### Step 4 — Pre-Label Ingestion & Human-in-the-Loop Refinement

Manual digitization bottlenecks high-throughput pipelines. The recommended pattern injects foundation-model masks as draft features that annotators correct rather than draw from scratch. The [automating batch pre-labeling with SAM and QGIS](/labeling-workflows-toolchain-integration/qgis-plugin-ecosystem-for-annotation-teams/automating-batch-pre-labeling-with-sam-and-qgis/) workflow covers the full SAM inference chain; the integration points below show how to receive its output inside the plugin stack.

Vectorize SAM binary masks using GDAL's polygonize algorithm, then load results as editable draft features:

```python
import processing
from pathlib import Path

def ingest_sam_masks(mask_raster: str, output_dir: str) -> QgsVectorLayer:
    out_path = str(Path(output_dir) / "prelabels.gpkg")
    result = processing.run(
        "gdal:polygonize",
        {
            "INPUT": mask_raster,
            "BAND": 1,
            "FIELD": "class_id",
            "EIGHT_CONNECTEDNESS": False,
            "OUTPUT": out_path,
        },
    )
    layer = QgsVectorLayer(out_path, "pre_labels_draft", "ogr")
    # Mark all imported features as pending review
    layer.startEditing()
    for feature in layer.getFeatures():
        feature["review_status"] = "pending"
        layer.updateFeature(feature)
    layer.commitChanges()
    return layer
```

Configure QGIS rendering rules to visually separate pre-labels from manually digitized features. Use a rule-based renderer: show pre-labels with a dashed orange stroke and human-reviewed features with a solid green stroke. This lets annotators immediately identify regions that require attention.

For [automating pre-labeling with foundation models](/labeling-workflows-toolchain-integration/automating-pre-labeling-with-foundation-models/) beyond SAM — including segment-then-classify pipelines — enable QGIS's **Advanced Digitizing** panel to constrain correction angles and snapping distances during the refinement pass.

### Step 5 — FlatGeobuf Export & CI/CD Integration

Final exports must align with the attribute schema and geometry requirements of the ML framework. Strip null geometries, standardize column names to `snake_case`, validate geometry topology, and write to FlatGeobuf for streaming performance:

```python
from __future__ import annotations
import geopandas as gpd
from pathlib import Path

REQUIRED_COLUMNS = {"class_id", "confidence", "annotator_id", "review_status"}

def export_ml_ready(layer_path: str, output_dir: str) -> Path:
    gdf = gpd.read_file(layer_path)

    # Drop null and invalid geometries
    gdf = gdf.dropna(subset=["geometry"])
    gdf = gdf[gdf.geometry.is_valid]

    # Enforce only reviewed annotations enter training
    if "review_status" in gdf.columns:
        gdf = gdf[gdf["review_status"] == "approved"]

    # Standardize column names
    gdf.columns = [c.lower().replace(" ", "_") for c in gdf.columns]

    # Validate required columns
    missing = REQUIRED_COLUMNS - set(gdf.columns)
    if missing:
        raise ValueError(f"Export aborted — missing required fields: {missing}")

    out_path = Path(output_dir) / "annotations.fgb"
    gdf.to_file(str(out_path), driver="FlatGeobuf")
    print(f"Exported {len(gdf)} approved features → {out_path}")
    return out_path
```

Wire this export into a GitHub Actions workflow that triggers on pull requests to the annotation branch. The gate blocks merge if validation fails:

```yaml
name: Annotation Export Validation

on:
  pull_request:
    paths:
      - "annotations/**/*.gpkg"
      - "annotations/**/*.geojson"

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.11"
      - name: Install dependencies
        run: pip install geopandas==1.0.1 shapely==2.0.5
      - name: Run export validation
        run: python scripts/export_ml_ready.py annotations/ exports/
```

Version control `.qgz` project files alongside annotation layers to maintain reproducible environments. Store large spatial datasets using [DVC versioning for geospatial training data](/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/) rather than Git LFS, which handles binary diff and remote storage more efficiently for raster datasets exceeding a few hundred megabytes.

## Spatial Parameters & Configuration Reference

| Parameter | Type | Valid Range / Values | Spatial Implication |
|---|---|---|---|
| Project CRS | EPSG code | `EPSG:3857`, UTM zones | Controls coordinate storage precision; mismatches shift geometry |
| Tile overlap margin | % | 10–15% | Below 10% causes boundary artifacts in tiled inference |
| Minimum polygon area | m² | ≥ 1.0 (object-class dependent) | Sliver polygons below threshold inflate false-positive counts |
| Confidence threshold | float | 0.0–1.0 | Features below 0.5 should be routed to human review |
| Snapping tolerance | map units | 0.1–1.0 m (projected) | Too large merges distinct vertices; too small leaves topology gaps |
| GSD range (annotation quality) | cm/px | 5–30 cm/px (optimal for objects > 2 m) | Coarser GSD reduces polygon precision and increases boundary ambiguity |
| IoU acceptance threshold | float | 0.5 (detection), 0.75 (segmentation) | See [IoU thresholds for geospatial object detection](/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/calculating-iou-thresholds-for-geospatial-object-detection/) |
| Max feature count per layer | integer | ≤ 500 000 for in-memory layers | Larger layers require PostGIS or GeoPackage-backed approach |

## Edge Cases & Spatial Gotchas

These are the failure modes that most often reach a training job undetected. Each expands to the symptom, the root cause, and the fix.

<details>
<summary><strong>On-the-fly reprojection during annotation</strong></summary>

If a basemap layer uses `EPSG:4326` while the annotation layer uses `EPSG:3857`, QGIS reprojects the basemap at render time. Annotators see correctly aligned features in the canvas, but the underlying coordinates accumulate rounding error from the display transform. Lock the project CRS before opening annotation layers, and disable on-the-fly reprojection for the annotation layers specifically so vertices are digitized directly in stored coordinates.

</details>

<details>
<summary><strong>Datum shift between NAD83 and WGS84</strong></summary>

In North American projects, mixing `EPSG:4269` (NAD83) and `EPSG:4326` (WGS84) introduces a sub-metre offset that is invisible at country-scale zoom but material for 10 cm/px drone imagery. Apply the `+nadgrids=@null` PROJ flag only if datum grid files are genuinely absent; prefer installing `proj-data` so transformations use accurate grid-based shifts rather than a null approximation.

</details>

<details>
<summary><strong>Self-intersecting polygons from SAM masks</strong></summary>

Vectorized SAM output frequently produces self-intersecting rings at class boundaries where adjacent mask regions share pixels. Run `shapely.make_valid()` on every ingested polygon before storing it as an editable feature, and record the repair in the audit log so the geometry change is traceable back to its source mask.

</details>

<details>
<summary><strong>Thread-safety violations in background processing</strong></summary>

Calling `QgsVectorLayer.getFeatures()` directly from a worker thread without `QgsTask` causes random crashes that are impossible to reproduce deterministically. Always subclass `QgsTask`, perform all data access inside `run()`, and emit a custom signal that the main thread connects to for UI updates.

</details>

<details>
<summary><strong>Plugin conflicts between annotation releases</strong></summary>

QuickMapServices and custom digitizing plugins sometimes register overlapping keyboard shortcuts, causing silent action-hijacking. After installing a new plugin, run `QgsApplication.actionManager()` in the QGIS Python console to list every registered action and detect duplicate keybindings before distributing the profile to annotators.

</details>

<details>
<summary><strong>Sliver polygons at tile boundaries</strong></summary>

Tiled SAM inference with insufficient overlap (< 10%) generates narrow sliver polygons at tile edges where masks from adjacent tiles do not fully overlap. Apply a minimum-area filter and use `shapely.buffer(0)` to dissolve slivers before loading features into the annotation layer.

</details>

## Integration & Automation Hooks

The QGIS plugin stack integrates with [Label Studio for geospatial workflows](/labeling-workflows-toolchain-integration/integrating-label-studio-with-geospatial-workflows/) via its REST API. Export GeoPackage layers from QGIS and push them to Label Studio as pre-annotations, then pull human-reviewed results back as GeoJSON for final export:

```python
import requests
import json

LABEL_STUDIO_URL = "https://your-label-studio.example.com"
API_TOKEN = "your-api-token"

def push_prelabels_to_label_studio(
    task_id: int,
    geojson_path: str,
    project_id: int,
) -> dict:
    with open(geojson_path) as f:
        geojson = json.load(f)

    payload = {
        "task": task_id,
        "result": [
            {
                "type": "polygonlabels",
                "value": {
                    "points": feature["geometry"]["coordinates"][0],
                    "polygonlabels": [str(feature["properties"]["class_id"])],
                },
                "from_name": "label",
                "to_name": "image",
            }
            for feature in geojson.get("features", [])
        ],
        "was_cancelled": False,
    }

    resp = requests.post(
        f"{LABEL_STUDIO_URL}/api/predictions/",
        json=payload,
        headers={"Authorization": f"Token {API_TOKEN}"},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()
```

For DVC integration, track `.gpkg` and `.fgb` annotation files as DVC-managed artifacts. This enables [tracking annotation changes with SHA hashing](/dataset-versioning-spatial-data-sync/tracking-annotation-changes-with-sha-hashing/) at the file level and supports rollback if a corrupt export reaches the training pipeline.

## Validation & Testing

Run the following checks on every exported annotation file before it progresses to training:

```python
from __future__ import annotations
import geopandas as gpd
from shapely.validation import explain_validity

def validate_annotation_export(fgb_path: str) -> None:
    gdf = gpd.read_file(fgb_path)

    # 1. Geometry validity
    invalid_mask = ~gdf.geometry.is_valid
    if invalid_mask.any():
        for idx, geom in gdf[invalid_mask].geometry.items():
            print(f"Feature {idx}: {explain_validity(geom)}")
        raise ValueError(f"{invalid_mask.sum()} invalid geometries in export")

    # 2. CRS check
    expected_epsg = 3857
    if gdf.crs is None or gdf.crs.to_epsg() != expected_epsg:
        raise ValueError(f"Expected EPSG:{expected_epsg}, got {gdf.crs}")

    # 3. Required attribute presence
    required = {"class_id", "confidence", "annotator_id", "review_status"}
    missing = required - set(gdf.columns)
    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    # 4. Confidence range
    out_of_range = gdf[(gdf["confidence"] < 0.0) | (gdf["confidence"] > 1.0)]
    if not out_of_range.empty:
        raise ValueError(f"{len(out_of_range)} features have out-of-range confidence values")

    # 5. No null class_id
    null_class = gdf[gdf["class_id"].isna()]
    if not null_class.empty:
        raise ValueError(f"{len(null_class)} features have null class_id")

    print(f"Validation passed: {len(gdf)} features, CRS EPSG:{expected_epsg}")
```

Add a `ogrinfo` sanity check as a lightweight CI step that does not require Python:

```bash
ogrinfo -al -so annotations.fgb | grep -E "Geometry Type|Feature Count|Layer SRS"
```

Verify [metadata preservation across dataset versions](/dataset-versioning-spatial-data-sync/preserving-metadata-across-dataset-versions/) by comparing field checksums between the QGIS source layer and the exported FlatGeobuf to detect silent attribute truncation.

---

This workflow is one component of the broader [Labeling Workflows & Toolchain Integration](/labeling-workflows-toolchain-integration/) pipeline.

**Related**

- [Automating Batch Pre-Labeling with SAM and QGIS](/labeling-workflows-toolchain-integration/qgis-plugin-ecosystem-for-annotation-teams/automating-batch-pre-labeling-with-sam-and-qgis/) — step-by-step SAM tiling, inference, and mask vectorization inside QGIS
- [Human-in-the-Loop Validation Cycles](/labeling-workflows-toolchain-integration/human-in-the-loop-validation-cycles/) — structure review queues and track annotator disagreement across sprints
- [Integrating Label Studio with Geospatial Workflows](/labeling-workflows-toolchain-integration/integrating-label-studio-with-geospatial-workflows/) — webhook and REST API bridging between QGIS and Label Studio
- [Coordinate Reference Systems in Annotation Pipelines](/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) — CRS selection, datum transformation grids, and projection mismatch debugging
