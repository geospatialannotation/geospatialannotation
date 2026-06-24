---
title: "Defining ROI Label Taxonomies for Aerial Imagery"
description: "A production workflow for designing, validating, and automating ROI label taxonomies for aerial and satellite imagery — covering schema engineering, Pydantic validation, CI/CD integration, and spatial quality gates."
slug: "defining-roi-label-taxonomies-for-aerial-imagery"
type: "cluster"
breadcrumb:
  - label: "Home"
    url: "/"
  - label: "Geospatial Annotation Fundamentals & Architecture"
    url: "/geospatial-annotation-fundamentals-architecture/"
  - label: "Defining ROI Label Taxonomies for Aerial Imagery"
    url: "/geospatial-annotation-fundamentals-architecture/defining-roi-label-taxonomies-for-aerial-imagery/"
datePublished: "2025-01-15"
dateModified: "2026-06-24"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Defining ROI Label Taxonomies for Aerial Imagery",
      "description": "A production workflow for designing, validating, and automating ROI label taxonomies for aerial and satellite imagery — covering schema engineering, Pydantic validation, CI/CD integration, and spatial quality gates.",
      "datePublished": "2025-01-15",
      "dateModified": "2026-06-24",
      "author": {"@type": "Organization", "name": "GeoSpatialAnnotation"},
      "publisher": {"@type": "Organization", "name": "GeoSpatialAnnotation"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://geospatialannotation.com/"},
        {"@type": "ListItem", "position": 2, "name": "Geospatial Annotation Fundamentals & Architecture", "item": "https://geospatialannotation.com/geospatial-annotation-fundamentals-architecture/"},
        {"@type": "ListItem", "position": 3, "name": "Defining ROI Label Taxonomies for Aerial Imagery", "item": "https://geospatialannotation.com/geospatial-annotation-fundamentals-architecture/defining-roi-label-taxonomies-for-aerial-imagery/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Build a Production ROI Label Taxonomy for Aerial Imagery",
      "description": "Design, validate, and automate ROI label taxonomies for aerial and satellite imagery ML pipelines.",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Map domain ontology to discrete ROI classes", "text": "Translate business objectives into mutually exclusive ROI classes with explicit inclusion/exclusion criteria."},
        {"@type": "HowToStep", "position": 2, "name": "Establish a hierarchical label structure", "text": "Implement parent-child class hierarchies that support multi-task learning and coarse-to-fine inference."},
        {"@type": "HowToStep", "position": 3, "name": "Standardize attribute and metadata payloads", "text": "Attach annotation_id, class_id, confidence, annotator_id, and validation_status fields to every ROI."},
        {"@type": "HowToStep", "position": 4, "name": "Implement programmatic schema validation", "text": "Enforce taxonomy compliance with Pydantic v2 validators and shapely geometry checks before data enters training."},
        {"@type": "HowToStep", "position": 5, "name": "Automate taxonomy deployment via CI/CD", "text": "Run schema validators on every annotation commit via pre-commit hooks and GitHub Actions workflows."},
        {"@type": "HowToStep", "position": 6, "name": "Apply statistical quality gates", "text": "Monitor inter-annotator agreement, class distribution balance, and spatial consistency across annotation batches."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "How granular should a label taxonomy be for aerial imagery?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Granularity should match your model architecture and inference requirements. A two-level hierarchy (parent class + subclass) balances annotation cost against model specificity. Avoid more than three hierarchy levels — annotators struggle with deep trees and inter-annotator agreement collapses below class 3."
          }
        },
        {
          "@type": "Question",
          "name": "What causes class ID mismatches in GeoJSON annotations?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Class ID mismatches occur when the taxonomy JSON file is updated without re-exporting existing annotations. Version the taxonomy file alongside annotations and enforce a Pydantic validator that cross-checks class_id against class_name on every ingest."
          }
        },
        {
          "@type": "Question",
          "name": "How do you handle seasonal class ambiguity in vegetation labels?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Add an acquisition_season field to each annotation and define class-specific seasonal decision rules (e.g., deciduous_canopy is only valid for leaf-on imagery). Store the acquisition date in annotation metadata and validate it against the class definition during schema validation."
          }
        }
      ]
    }
  ]
}
</script>

# Defining ROI Label Taxonomies for Aerial Imagery

Without a structured ontology, annotation teams produce inconsistent labels, model training suffers from class imbalance, and downstream inference pipelines break under schema drift. A concrete failure mode: a six-class land-cover taxonomy that allows annotators to choose between `vegetation` and `ground_cover` based on visual prominence produces Cohen's Kappa scores below 0.6, making validation metrics meaningless and gradient descent unstable. This guide provides a production-ready workflow for designing, validating, and automating ROI taxonomies tailored to aerial and satellite imagery, aligned with the broader [Geospatial Annotation Fundamentals & Architecture](/geospatial-annotation-fundamentals-architecture/) framework.

## Prerequisites & Toolchain Alignment

Before building a taxonomy, verify your environment against these requirements. Silent data corruption from skipped prerequisites typically surfaces only at model evaluation — after weeks of annotation work.

**Python packages (pinned):**

```
geopandas==0.14.4
shapely==2.0.4
pydantic==2.7.1
pyproj==3.6.1
rasterio==1.3.10
```

Install with:

```bash
pip install "geopandas==0.14.4" "shapely==2.0.4" "pydantic==2.7.1" \
            "pyproj==3.6.1" "rasterio==1.3.10"
```

**System dependencies:** GDAL 3.8+, PROJ 9.3+. On Ubuntu: `sudo apt-get install gdal-bin libgdal-dev proj-bin`.

**Spatial prerequisites:**

- Orthorectified aerial tiles at GSD ≤ 0.5 m with documented acquisition metadata (sensor type, sun elevation, cloud cover).
- All source imagery and annotation outputs aligned to a single [coordinate reference system](/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) — projection mismatches silently corrupt spatial joins, area calculations, and IoU metrics. Enforce `EPSG:4326` for storage and a local metric CRS (e.g., `EPSG:32633` for UTM zone 33N) for all area or distance computations.
- GeoJSON (`RFC 7946`), Parquet, or COCO-compatible annotation outputs. GeoJSON is the most interoperable format for vector ROI storage.

**Domain prerequisite:** a preliminary class hierarchy aligned with project objectives before opening the annotation interface — retrofitting taxonomy structure onto existing annotations is expensive and error-prone.

## Taxonomy Architecture: From Ontology to Schema

The diagram below shows how a domain ontology flows through hierarchy design, schema enforcement, and CI validation into a training-ready dataset.

<svg viewBox="0 0 760 320" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="ROI taxonomy pipeline: domain ontology flows through hierarchy design, Pydantic schema validation, and CI gates into a training-ready GeoJSON dataset" style="width:100%;max-width:760px;display:block;font-family:inherit">
  <title>ROI Label Taxonomy Pipeline</title>
  <desc>Domain ontology maps to a class hierarchy, which is encoded in a versioned taxonomy JSON. Pydantic validators and shapely geometry checks run on every annotation commit via CI, producing a validated GeoJSON training dataset.</desc>
  <!-- Background -->
  <rect width="760" height="320" rx="8" fill="none"/>
  <!-- Stage boxes -->
  <rect x="10" y="120" width="120" height="56" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="70" y="144" text-anchor="middle" font-size="11" fill="currentColor" font-weight="600">Domain</text>
  <text x="70" y="159" text-anchor="middle" font-size="11" fill="currentColor" font-weight="600">Ontology</text>
  <text x="70" y="174" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">objectives → classes</text>
  <rect x="175" y="120" width="130" height="56" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="240" y="144" text-anchor="middle" font-size="11" fill="currentColor" font-weight="600">Hierarchy</text>
  <text x="240" y="159" text-anchor="middle" font-size="11" fill="currentColor" font-weight="600">Design</text>
  <text x="240" y="174" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">parent → child tree</text>
  <rect x="350" y="120" width="130" height="56" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="415" y="144" text-anchor="middle" font-size="11" fill="currentColor" font-weight="600">Schema</text>
  <text x="415" y="159" text-anchor="middle" font-size="11" fill="currentColor" font-weight="600">Validation</text>
  <text x="415" y="174" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">Pydantic + shapely</text>
  <rect x="525" y="120" width="120" height="56" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="585" y="144" text-anchor="middle" font-size="11" fill="currentColor" font-weight="600">CI Gate</text>
  <text x="585" y="159" text-anchor="middle" font-size="11" fill="currentColor" font-weight="600">(pre-commit)</text>
  <text x="585" y="174" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">fail on schema error</text>
  <rect x="660" y="120" width="88" height="56" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="704" y="144" text-anchor="middle" font-size="11" fill="currentColor" font-weight="600">Training</text>
  <text x="704" y="159" text-anchor="middle" font-size="11" fill="currentColor" font-weight="600">Dataset</text>
  <text x="704" y="174" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">GeoJSON / Parquet</text>
  <!-- Arrows -->
  <line x1="130" y1="148" x2="173" y2="148" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr)"/>
  <line x1="305" y1="148" x2="348" y2="148" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr)"/>
  <line x1="480" y1="148" x2="523" y2="148" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr)"/>
  <line x1="645" y1="148" x2="658" y2="148" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr)"/>
  <!-- Reject feedback loop -->
  <path d="M585 176 Q585 260 415 260 Q245 260 240 178" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="5 3" marker-end="url(#arr)"/>
  <text x="415" y="278" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">schema error → revise hierarchy</text>
  <!-- Taxonomy JSON annotation -->
  <text x="240" y="108" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">taxonomy.json (versioned)</text>
  <line x1="240" y1="112" x2="240" y2="120" stroke="currentColor" stroke-width="1" stroke-dasharray="3 2"/>
  <!-- Arrowhead marker -->
  <defs>
    <marker id="arr" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">
      <path d="M0,0 L7,3.5 L0,7 Z" fill="currentColor"/>
    </marker>
  </defs>
</svg>

## Core Workflow

### Step 1 — Map Domain Ontology to Discrete ROI Classes

Translate business or research objectives into discrete, mutually exclusive ROI classes. Avoid overlapping definitions that force annotators into subjective decision trees. Separate `vegetation_canopy` from `ground_cover` rather than allowing annotators to choose based on visual prominence; document explicit inclusion and exclusion criteria for each class, including edge-case handling for partially occluded structures and seasonal vegetation changes.

A well-scoped ontology reduces inter-annotator variance and simplifies downstream loss function design. When classes overlap conceptually, models learn conflicting gradients, which manifests as unstable validation metrics and poor generalization on unseen tiles.

```python
# taxonomy.json — version-controlled alongside annotation data
{
  "version": "1.2.0",
  "classes": [
    {
      "class_id": 1,
      "class_name": "residential",
      "parent": "land_use",
      "geometry_types": ["Polygon"],
      "min_area_m2": 25.0,
      "exclusion_rules": ["Do not label if structure footprint < 25 m²", "Exclude structures with >50% occlusion by vegetation"]
    },
    {
      "class_id": 4,
      "class_name": "vegetation_canopy",
      "parent": "land_cover",
      "geometry_types": ["Polygon"],
      "min_area_m2": 4.0,
      "exclusion_rules": ["Leaf-on imagery only (NDVI > 0.3)", "Exclude bare ground visible through canopy gaps >40%"]
    }
  ]
}
```

### Step 2 — Establish a Hierarchical Label Structure

A flat taxonomy rarely scales across complex aerial scenes. Implement a parent-child hierarchy that supports both coarse-grained scene classification and fine-grained object detection:

```
land_use
├── residential
│   ├── single_family
│   └── multi_unit
├── commercial
└── industrial
    ├── manufacturing
    └── logistics_hub

land_cover
├── vegetation_canopy
│   ├── deciduous
│   └── coniferous
├── impervious_surface
└── water
    ├── standing
    └── flowing
```

This structure enables multi-task learning architectures and allows models to predict at varying confidence thresholds. During inference, aggregate child-class probabilities to validate parent-class consistency — a useful automated sanity check for label quality.

When deciding which geometry type to attach to each hierarchy level, consult [best practices for polygon vs bounding box annotation](/geospatial-annotation-fundamentals-architecture/defining-roi-label-taxonomies-for-aerial-imagery/best-practices-for-polygon-vs-bounding-box-annotation/) to align annotation effort with model architecture requirements. Fine-grained subclasses typically require polygon outlines; coarse parent classes can use bounding boxes for faster annotation throughput.

### Step 3 — Standardize Attribute and Metadata Payloads

ROIs require more than geometry and a class name. Attach standardized attributes to support filtering, versioning, and [confidence scoring](/geospatial-annotation-fundamentals-architecture/confidence-scoring-for-geospatial-labels/) downstream:

```python
# Canonical attribute schema for every ROI feature
{
  "annotation_id": "550e8400-e29b-41d4-a716-446655440000",  # UUIDv4
  "class_id": 1,                          # Integer mapping to taxonomy
  "class_name": "residential",            # Immutable string from taxonomy.json
  "confidence": 0.92,                     # Float 0.0–1.0 (annotator certainty)
  "annotator_id": "ann_007",              # Traceable to individual annotator
  "created_at": "2026-06-24T09:15:00Z",  # ISO 8601
  "updated_at": "2026-06-24T11:32:00Z",
  "validation_status": "reviewed",        # Enum: draft | reviewed | approved | rejected
  "taxonomy_version": "1.2.0",           # Locked at annotation time
  "acquisition_date": "2026-04-10",       # Source imagery date for temporal filtering
  "gsd_m": 0.30                          # Ground sampling distance of source tile
}
```

When deciding between [vector vs raster annotation workflows](/geospatial-annotation-fundamentals-architecture/vector-vs-raster-annotation-workflows/) for storing these attributes, evaluate your pipeline's spatial query patterns — vector GeoJSON supports attribute filtering directly, while raster masks require a separate sidecar metadata file.

### Step 4 — Implement Programmatic Schema Validation

Manual review cannot scale to millions of ROIs. Enforce taxonomy compliance programmatically before annotations enter the training dataset. The validator below cross-checks class IDs, geometry validity, minimum area thresholds, and taxonomy version locks:

```python
from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Literal, Optional
from datetime import datetime
from shapely.geometry import shape
from shapely.validation import explain_validity
import uuid
import json

# Load versioned taxonomy at import time
with open("taxonomy.json") as f:
    TAXONOMY = {c["class_name"]: c for c in json.load(f)["classes"]}
    VALID_CLASS_IDS = {c["class_id"]: c["class_name"] for c in json.load(open("taxonomy.json"))["classes"]}

class ROIProperties(BaseModel):
    annotation_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    class_id: int
    class_name: str
    confidence: float = Field(ge=0.0, le=1.0)
    validation_status: Literal["draft", "reviewed", "approved", "rejected"] = "draft"
    taxonomy_version: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    gsd_m: float = Field(gt=0.0, le=2.0, description="Ground sampling distance in metres")

    @field_validator("class_name")
    @classmethod
    def validate_class_in_taxonomy(cls, v: str) -> str:
        if v not in TAXONOMY:
            raise ValueError(f"'{v}' is not a registered class in taxonomy.json")
        return v

    @model_validator(mode="after")
    def validate_class_id_name_consistency(self) -> "ROIProperties":
        expected_id = TAXONOMY[self.class_name]["class_id"]
        if self.class_id != expected_id:
            raise ValueError(
                f"class_id {self.class_id} does not match '{self.class_name}' "
                f"(expected {expected_id})"
            )
        return self

class ROIAnnotation(BaseModel):
    type: Literal["Feature"] = "Feature"
    properties: ROIProperties
    geometry: dict

    @model_validator(mode="before")
    @classmethod
    def validate_geojson_structure(cls, data: dict) -> dict:
        if data.get("type") != "Feature":
            raise ValueError("Top-level GeoJSON type must be 'Feature'")
        if "geometry" not in data or "properties" not in data:
            raise ValueError("Missing required 'geometry' or 'properties' fields")
        return data

    @model_validator(mode="after")
    def validate_geometry_integrity(self) -> "ROIAnnotation":
        geom = shape(self.geometry)
        if not geom.is_valid:
            reason = explain_validity(geom)
            raise ValueError(f"Invalid geometry: {reason}")
        # Enforce minimum area from taxonomy definition
        class_def = TAXONOMY.get(self.properties.class_name, {})
        min_area = class_def.get("min_area_m2", 0.0)
        # Note: geom.area is in CRS units; caller must reproject to metric CRS first
        if hasattr(geom, "area") and geom.area < min_area / 1e6:  # rough degree-to-m² guard
            raise ValueError(
                f"Geometry area below minimum {min_area} m² for class "
                f"'{self.properties.class_name}'"
            )
        return self


def validate_annotation_file(path: str) -> list[str]:
    """Validate all features in a GeoJSON file. Returns list of error strings."""
    errors = []
    with open(path) as f:
        fc = json.load(f)
    for i, feature in enumerate(fc.get("features", [])):
        try:
            ROIAnnotation.model_validate(feature)
        except Exception as e:
            errors.append(f"Feature {i}: {e}")
    return errors
```

### Step 5 — Automate Taxonomy Deployment via CI/CD

Schema validation must run automatically on every annotation commit. A pre-commit hook prevents invalid annotations from reaching the main branch:

```bash
#!/bin/bash
# .git/hooks/pre-commit — make executable with chmod +x
set -e

CHANGED_GEOJSON=$(git diff --cached --name-only --diff-filter=ACM | grep '\.geojson$' || true)

if [ -z "$CHANGED_GEOJSON" ]; then
  exit 0
fi

echo "Running ROI taxonomy validation..."
ERRORS=0
for file in $CHANGED_GEOJSON; do
    python - <<EOF
import sys
from validate_roi import validate_annotation_file
errs = validate_annotation_file("$file")
if errs:
    for e in errs:
        print(f"  ERROR in $file: {e}", file=sys.stderr)
    sys.exit(1)
EOF
    if [ $? -ne 0 ]; then
        ERRORS=$((ERRORS + 1))
    fi
done

if [ $ERRORS -gt 0 ]; then
    echo "Taxonomy validation failed: $ERRORS file(s) rejected. Fix schema errors and re-stage."
    exit 1
fi
echo "All annotation files passed taxonomy validation."
```

For GitHub Actions, add a workflow that runs the full validation suite on pull requests:

```yaml
# .github/workflows/annotation-qa.yml
name: Annotation Schema QA
on:
  pull_request:
    paths:
      - "annotations/**/*.geojson"
      - "taxonomy.json"

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"
      - run: pip install "pydantic==2.7.1" "shapely==2.0.4" "geopandas==0.14.4"
      - name: Validate all annotation files
        run: |
          python -c "
          import glob, sys
          from validate_roi import validate_annotation_file
          files = glob.glob('annotations/**/*.geojson', recursive=True)
          all_errors = []
          for f in files:
              errs = validate_annotation_file(f)
              all_errors.extend(errs)
          if all_errors:
              for e in all_errors:
                  print(e, file=sys.stderr)
              sys.exit(1)
          print(f'Validated {len(files)} annotation files — all passed.')
          "
```

When the taxonomy evolves — adding a subclass, deprecating a parent — bump `taxonomy.json` version, run a migration script to backfill `taxonomy_version` in existing annotations, and add a backward-compatibility shim in your training data loader. Pair this with [DVC pipelines](/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/) to snapshot annotation state at each taxonomy version, enabling clean rollbacks if a schema change corrupts downstream training runs.

## Spatial Parameters & Configuration Reference

| Parameter | Type | Valid Range | Spatial Implication |
|---|---|---|---|
| `gsd_m` | float | 0.05–2.0 | Controls minimum resolvable object size; GSD > 0.5 m limits fine-grained subclass annotation |
| `min_area_m2` | float | 1.0–10 000 | Prevents sub-pixel polygon fragments; set per class based on GSD |
| `confidence` | float | 0.0–1.0 | Values below 0.7 should flag annotations for human review before training inclusion |
| `taxonomy_version` | semver string | e.g. `"1.2.0"` | Must match the taxonomy.json version at commit time; mismatches block ingest |
| `geometry_types` | array of strings | `["Polygon", "MultiPolygon"]` | Restrict per class; mixed geometry types in a class break COCO export serialization |
| `crs_storage` | EPSG code | `EPSG:4326` | GeoJSON spec requires geographic CRS for storage; reproject to metric CRS for area validation |
| `crs_compute` | EPSG code | UTM zone for AOI | Use for IoU, area, and buffer computations to avoid angular distortion |
| `iou_threshold_coarse` | float | 0.40–0.55 | Appropriate for large land-cover classes (field, water body) |
| `iou_threshold_fine` | float | 0.65–0.75 | Required for structure-level objects (building, road segment); see [IoU threshold reference](/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/calculating-iou-thresholds-for-geospatial-object-detection/) |

## Edge Cases & Spatial Gotchas

**Self-intersecting polygons from manual digitizing.** Annotators drawing freehand polygons in web tools frequently produce bowtie or figure-eight geometries. `shapely.is_valid` returns `False` for these; `explain_validity()` identifies the crossing point. Fix with `shapely.make_valid()` and re-validate, but always log auto-corrections for annotator feedback:

```python
from shapely.geometry import shape
from shapely.validation import make_valid

def fix_and_log(geom_dict: dict, annotation_id: str) -> dict:
    geom = shape(geom_dict)
    if not geom.is_valid:
        fixed = make_valid(geom)
        print(f"Auto-corrected geometry for {annotation_id}: {geom.geom_type} → {fixed.geom_type}")
        return fixed.__geo_interface__
    return geom_dict
```

**Seasonal class drift in multi-temporal datasets.** A `deciduous` polygon valid in summer imagery becomes ambiguous in a winter tile. Add `acquisition_season` to the annotation schema and define class-specific seasonal validity rules in `taxonomy.json`. Validate `acquisition_date` against the class definition during ingest.

**Annotator disagreement on boundary features.** Road edges, shorelines, and building overhangs generate systematic boundary disagreement. Rather than forcing a single boundary, record all annotator boundaries and compute the consensus polygon using `shapely.ops.unary_union` on the intersection region. Pixels that fall outside the consensus zone are excluded from the training mask.

**Class ID collisions after taxonomy merge.** When merging annotations from two teams using different taxonomy versions, ID collisions silently reassign labels. Always remap class IDs through the canonical taxonomy before merging: load both taxonomy files, build a name-based mapping, and reject any annotation whose class name does not appear in the target taxonomy.

**CRS mismatch in area-based minimum filtering.** Computing geometry area in `EPSG:4326` (degrees) produces nonsensical values for area-threshold checks. Always reproject to a local metric CRS before computing `geom.area`:

```python
import geopandas as gpd

def validate_min_area(gdf: gpd.GeoDataFrame, min_area_m2: float, metric_crs: str = "EPSG:32633") -> gpd.GeoDataFrame:
    projected = gdf.to_crs(metric_crs)
    too_small = projected[projected.geometry.area < min_area_m2]
    if not too_small.empty:
        raise ValueError(f"{len(too_small)} features below {min_area_m2} m² minimum area threshold")
    return gdf
```

## Integration & Automation Hooks

**Label Studio integration.** Export taxonomy classes as a Label Studio XML config block. Use Label Studio's pre-annotation API to push taxonomy-validated predictions back into the review queue, reducing cold-annotation throughput:

```python
import label_studio_sdk

client = label_studio_sdk.Client(url="http://localhost:8080", api_key="<your-key>")
project = client.get_project(project_id=1)

# Push a validated prediction for human review
project.create_prediction(
    task_id=task_id,
    result=[{
        "from_name": "label",
        "to_name": "image",
        "type": "polygonlabels",
        "value": {"points": polygon_points, "polygonlabels": [class_name]},
        "score": confidence
    }]
)
```

**QGIS plugin hook.** Store `taxonomy.json` on a shared network path and load it into the QGIS annotation form at session start. Use a QGIS Python plugin to enforce dropdown class selection — preventing free-text entry that bypasses schema validation.

**DVC pipeline snapshot.** Lock annotation state at each taxonomy version with a DVC stage. Any taxonomy version bump triggers a full re-validation run:

```yaml
# dvc.yaml
stages:
  validate_annotations:
    cmd: python validate_roi.py --dir annotations/ --taxonomy taxonomy.json
    deps:
      - annotations/
      - taxonomy.json
      - validate_roi.py
    metrics:
      - validation_report.json:
          cache: false
```

## Validation & Testing

Verify your taxonomy stack end-to-end before opening the annotation interface to your team:

```python
import pytest
from shapely.geometry import mapping, Polygon
from validate_roi import ROIAnnotation

class TestROITaxonomyValidation:

    def test_valid_annotation_passes(self):
        polygon = Polygon([(0, 0), (0, 0.001), (0.001, 0.001), (0.001, 0), (0, 0)])
        feature = {
            "type": "Feature",
            "geometry": mapping(polygon),
            "properties": {
                "class_id": 1,
                "class_name": "residential",
                "confidence": 0.88,
                "taxonomy_version": "1.2.0",
                "gsd_m": 0.30
            }
        }
        result = ROIAnnotation.model_validate(feature)
        assert result.properties.class_name == "residential"

    def test_class_id_mismatch_raises(self):
        polygon = Polygon([(0, 0), (0, 0.001), (0.001, 0.001), (0.001, 0), (0, 0)])
        feature = {
            "type": "Feature",
            "geometry": mapping(polygon),
            "properties": {
                "class_id": 99,  # Wrong ID for "residential"
                "class_name": "residential",
                "confidence": 0.88,
                "taxonomy_version": "1.2.0",
                "gsd_m": 0.30
            }
        }
        with pytest.raises(Exception, match="class_id"):
            ROIAnnotation.model_validate(feature)

    def test_out_of_range_confidence_raises(self):
        polygon = Polygon([(0, 0), (0, 0.001), (0.001, 0.001), (0.001, 0), (0, 0)])
        feature = {
            "type": "Feature",
            "geometry": mapping(polygon),
            "properties": {
                "class_id": 1,
                "class_name": "residential",
                "confidence": 1.5,  # Invalid
                "taxonomy_version": "1.2.0",
                "gsd_m": 0.30
            }
        }
        with pytest.raises(Exception):
            ROIAnnotation.model_validate(feature)
```

Run with: `pytest test_taxonomy_validation.py -v`

## Statistical Quality Gates

Beyond structural validation, implement statistical gates to monitor annotation consistency across batches. These transform taxonomy management from a static documentation exercise into a dynamic feedback loop:

**Inter-Annotator Agreement (IAA).** Calculate Cohen's Kappa for overlapping ROI assignments using `sklearn.metrics.cohen_kappa_score`. Values below 0.75 indicate ambiguous class definitions requiring ontology refinement. Trigger an alert and open an ontology review when IAA drops below this threshold across any two annotators.

**Class distribution monitoring.** Track ROI counts per class across batches. Sudden spikes or drops signal annotator confusion or imagery bias. Alert when any class falls below 5% or exceeds 40% of the total ROI count in a batch, as these imbalances propagate directly to model precision/recall on underrepresented classes.

**Spatial consistency checks.** Validate that adjacent ROIs do not overlap unless explicitly permitted by the taxonomy (e.g., multi-layer `vegetation_canopy` over `impervious_surface`). Use `geopandas.overlay()` to detect illegal intersections:

```python
import geopandas as gpd

def check_illegal_overlaps(gdf: gpd.GeoDataFrame, permitted_pairs: list[tuple]) -> gpd.GeoDataFrame:
    """Returns GeoDataFrame of overlapping features that violate taxonomy rules."""
    overlaps = gpd.overlay(gdf, gdf, how="intersection")
    # Exclude self-intersections and permitted class pairs
    illegal = overlaps[
        (overlaps["annotation_id_1"] != overlaps["annotation_id_2"]) &
        ~overlaps.apply(
            lambda r: (r["class_name_1"], r["class_name_2"]) in permitted_pairs, axis=1
        )
    ]
    return illegal
```

**Confidence calibration audit.** Ensure annotator confidence scores correlate with IAA metrics. If high-confidence annotations consistently disagree with consensus, the confidence scale is miscalibrated — provide annotators with recalibration examples showing the real distribution of ambiguous boundary cases.

## Related

- [Best practices for polygon vs bounding box annotation](/geospatial-annotation-fundamentals-architecture/defining-roi-label-taxonomies-for-aerial-imagery/best-practices-for-polygon-vs-bounding-box-annotation/) — geometry type selection per taxonomy class
- [Coordinate Reference Systems in Annotation Pipelines](/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) — CRS enforcement and projection validation
- [Confidence Scoring for Geospatial Labels](/geospatial-annotation-fundamentals-architecture/confidence-scoring-for-geospatial-labels/) — per-annotation confidence models and active learning queues
- [Vector vs Raster Annotation Workflows](/geospatial-annotation-fundamentals-architecture/vector-vs-raster-annotation-workflows/) — storage format trade-offs for taxonomy-bearing annotations
- [Implementing DVC for Geospatial Training Data](/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/) — versioning taxonomy files alongside annotation snapshots

This workflow is one component of the broader [Geospatial Annotation Fundamentals & Architecture](/geospatial-annotation-fundamentals-architecture/) framework, which covers the full pipeline from CRS contracts through label schema design to training data export.
