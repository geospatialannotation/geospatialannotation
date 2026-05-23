# Defining ROI Label Taxonomies for Aerial Imagery

Defining ROI Label Taxonomies for Aerial Imagery is a foundational step in building reproducible, high-fidelity geospatial machine learning pipelines. Without a structured ontology, annotation teams produce inconsistent labels, model training suffers from class imbalance, and downstream inference pipelines break under schema drift. This guide provides a production-ready workflow for designing, validating, and automating ROI taxonomies tailored to aerial and satellite imagery. It aligns with broader [Geospatial Annotation Fundamentals & Architecture](/geospatial-annotation-fundamentals-architecture/) principles while focusing on schema engineering, validation patterns, and pipeline integration.

## Prerequisites & Environment Baseline

Before structuring a taxonomy, ensure your annotation environment meets these baseline requirements. Skipping these steps often results in silent data corruption that only surfaces during model evaluation.

- **Imagery Specifications:** Orthorectified aerial tiles (GSD ≤ 0.5m), consistent radiometric calibration, and documented acquisition metadata (sensor type, sun elevation, cloud cover).
- **Coordinate Reference System Alignment:** All source imagery and annotation outputs must share a unified projection. Misaligned geometries will corrupt spatial joins, area calculations, and model training. Review [Coordinate Reference Systems in Annotation Pipelines](/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) to enforce EPSG consistency and validate projection metadata before schema deployment.
- **Annotation Format Standardization:** GeoJSON, Parquet, or COCO-compatible outputs. GeoJSON remains the most interoperable for vector ROI storage, as formally defined in [RFC 7946](https://www.rfc-editor.org/rfc/rfc7946).
- **Schema Validation Stack:** Python 3.10+, `pydantic` (v2), `shapely`, `geopandas`, and a CI/CD pipeline capable of running automated taxonomy checks.
- **Domain Ontology Baseline:** A preliminary class hierarchy (e.g., `infrastructure → road → paved/unpaved`) aligned with project objectives and stakeholder requirements.

## Step-by-Step Workflow

### 1. Map Domain Ontology to Discrete ROI Classes

Start by translating business or research objectives into discrete, mutually exclusive ROI classes. Avoid overlapping definitions that force annotators into subjective decision trees. For example, separate `vegetation_canopy` from `ground_cover` rather than allowing annotators to choose based on visual prominence. Document explicit inclusion/exclusion criteria for each class, including edge-case handling (e.g., how to label partially occluded structures or seasonal vegetation changes).

A well-scoped ontology reduces inter-annotator variance and simplifies downstream loss function design. When classes overlap conceptually, models learn conflicting gradients, which manifests as unstable validation metrics and poor generalization on unseen tiles.

### 2. Establish a Hierarchical Label Structure

A flat taxonomy rarely scales across complex aerial scenes. Implement a parent-child hierarchy that supports both coarse-grained scene classification and fine-grained object detection. Example:

```
land_use
├── residential
│   ├── single_family
│   └── multi_unit
├── commercial
└── industrial
    ├── manufacturing
    └── logistics_hub
```

This structure enables multi-task learning architectures and allows models to predict at varying confidence thresholds. During inference, you can aggregate child-class probabilities to validate parent-class consistency, providing an automated sanity check for label quality. When deciding which geometry type to attach to each hierarchy level, consult [Best practices for polygon vs bounding box annotation](/geospatial-annotation-fundamentals-architecture/defining-roi-label-taxonomies-for-aerial-imagery/best-practices-for-polygon-vs-bounding-box-annotation/) to align annotation effort with model architecture requirements.

### 3. Standardize Attributes & Metadata Payloads

ROIs require more than geometry and a class name. Attach standardized attributes to support filtering, versioning, and confidence scoring. Common fields include:
- `annotation_id` (UUIDv4)
- `class_id` (integer mapping to taxonomy)
- `class_name` (string, immutable)
- `confidence` (float, 0.0–1.0)
- `annotator_id` (string)
- `created_at` / `updated_at` (ISO 8601 timestamps)
- `validation_status` (enum: `draft`, `reviewed`, `approved`, `rejected`)

Standardizing these payloads ensures that downstream training scripts can parse annotations without brittle string parsing or regex fallbacks. When deciding between vector and raster storage for these attributes, evaluate your pipeline's I/O constraints and spatial query patterns. A detailed comparison of trade-offs is available in [Vector vs Raster Annotation Workflows](/geospatial-annotation-fundamentals-architecture/vector-vs-raster-annotation-workflows/).

### 4. Implement Programmatic Schema Validation

Manual review cannot scale to millions of ROIs. Enforce taxonomy compliance programmatically using a validation layer that runs before annotations enter the training dataset. Below is a production-ready Pydantic v2 schema that validates ROI structure, geometry integrity, and taxonomy constraints:

```python
from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Literal, Optional
from datetime import datetime
import uuid

class ROIProperties(BaseModel):
    annotation_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    class_id: int
    class_name: Literal["residential", "commercial", "industrial", "vegetation", "water", "road"]
    confidence: float = Field(ge=0.0, le=1.0)
    validation_status: Literal["draft", "reviewed", "approved", "rejected"] = "draft"
    created_at: datetime = Field(default_factory=datetime.utcnow)

    @field_validator("class_name")
    @classmethod
    def validate_class_mapping(cls, v: str, info) -> str:
        # Enforce strict taxonomy mapping
        class_map = {
            "residential": 1, "commercial": 2, "industrial": 3,
            "vegetation": 4, "water": 5, "road": 6
        }
        if info.data.get("class_id") != class_map.get(v):
            raise ValueError(f"Class ID mismatch for {v}")
        return v

class ROIAnnotation(BaseModel):
    type: Literal["Feature"] = "Feature"
    properties: ROIProperties
    geometry: dict  # Validate GeoJSON structure separately via shapely/geojson

    @model_validator(mode="before")
    @classmethod
    def validate_geojson_structure(cls, data: dict) -> dict:
        if data.get("type") != "Feature":
            raise ValueError("Top-level type must be 'Feature'")
        if "geometry" not in data or "properties" not in data:
            raise ValueError("Missing required geometry or properties fields")
        return data
```

This schema catches common failures: mismatched class IDs, out-of-bounds confidence scores, and malformed GeoJSON wrappers. For advanced geometric validation (e.g., self-intersection checks, minimum area thresholds), integrate `shapely` validation routines before ingestion. The official [Pydantic v2 documentation](https://docs.pydantic.dev/latest/) provides extensive examples for custom validators and model serialization.

### 5. Automate Taxonomy Deployment & CI/CD Integration

Schema validation must run automatically on every annotation commit. Implement a pre-commit hook that:
1. Parses new or modified annotation files
2. Runs the Pydantic schema against each ROI
3. Validates geometry integrity using `shapely.is_valid_reason()`
4. Fails the commit if validation errors exceed a configurable threshold

Integrate this into your CI/CD pipeline using GitHub Actions or GitLab CI. Store the taxonomy mapping as a version-controlled JSON/YAML file. When the taxonomy evolves, bump the schema version, run a migration script to backfill legacy annotations, and enforce backward compatibility flags in your training data loader. This prevents silent schema drift from corrupting model checkpoints.

## Validation Patterns & Quality Gates

Beyond structural validation, implement statistical quality gates to monitor annotation consistency across batches:

- **Inter-Annotator Agreement (IAA):** Calculate Cohen’s Kappa or Fleiss’ Kappa for overlapping ROI assignments. Values below 0.75 indicate ambiguous class definitions requiring ontology refinement.
- **Class Distribution Monitoring:** Track ROI counts per class across batches. Sudden spikes or drops often signal annotator confusion or imagery bias. Implement automated alerts when any class falls below 5% or exceeds 40% of the total ROI count.
- **Spatial Consistency Checks:** Validate that adjacent ROIs do not overlap unless explicitly permitted (e.g., multi-layer vegetation/ground cover). Use `geopandas.overlay()` to detect illegal intersections.
- **Confidence Calibration:** Ensure annotator confidence scores correlate with IAA metrics. If high-confidence annotations consistently disagree with consensus, recalibrate the annotation interface or provide additional training examples.

These gates transform taxonomy management from a static documentation exercise into a dynamic, data-driven feedback loop.

## Common Pitfalls & Mitigation Strategies

| Pitfall | Impact | Mitigation |
|---------|--------|------------|
| **Ambiguous Class Boundaries** | High inter-annotator variance, unstable loss curves | Publish visual exemplars and explicit exclusion rules per class |
| **Flat Taxonomy Scaling** | Model confusion on fine-grained objects, poor generalization | Implement parent-child hierarchies with multi-task heads |
| **Unvalidated Geometry** | Corrupted spatial joins, NaN losses during training | Enforce `shapely` validity checks and minimum area thresholds |
| **Schema Drift in Production** | Broken data loaders, checkpoint incompatibility | Version taxonomy files, enforce CI validation, run migration scripts |
| **Over-Reliance on Confidence Scores** | False sense of label quality, hidden systematic bias | Cross-validate confidence with IAA metrics and spatial consistency checks |

## Next Steps & Pipeline Integration

Once your ROI taxonomy is defined, validated, and automated, integrate it into your broader geospatial ML stack. Export validated annotations to Parquet for efficient training data loading, or serialize to COCO format if your detection framework requires it. Ensure your data augmentation pipeline respects taxonomy constraints (e.g., avoid flipping annotations that break directional class semantics).

For teams scaling to multi-temporal or multi-sensor datasets, extend the taxonomy with temporal alignment fields and sensor-specific calibration metadata. The principles outlined here remain constant: enforce structure programmatically, validate continuously, and treat your taxonomy as versioned infrastructure rather than static documentation.