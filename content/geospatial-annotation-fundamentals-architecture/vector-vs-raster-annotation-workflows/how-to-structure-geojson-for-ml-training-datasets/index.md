---
title: "How to Structure GeoJSON for ML Training Datasets"
description: "Enforce FeatureCollection root, EPSG:4326 coordinates, flat snake_case properties, and homogeneous geometry types so spatial annotations load directly into PyTorch and TorchGeo without custom parsing."
slug: "how-to-structure-geojson-for-ml-training-datasets"
type: "long_tail"
breadcrumb:
  - label: "Home"
    url: "/"
  - label: "Geospatial Annotation Fundamentals & Architecture"
    url: "/geospatial-annotation-fundamentals-architecture/"
  - label: "Vector vs Raster Annotation Workflows"
    url: "/geospatial-annotation-fundamentals-architecture/vector-vs-raster-annotation-workflows/"
  - label: "How to Structure GeoJSON for ML Training Datasets"
    url: "/geospatial-annotation-fundamentals-architecture/vector-vs-raster-annotation-workflows/how-to-structure-geojson-for-ml-training-datasets/"
datePublished: "2025-03-12"
dateModified: "2026-06-24"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "How to Structure GeoJSON for ML Training Datasets",
      "description": "Enforce FeatureCollection root, EPSG:4326 coordinates, flat snake_case properties, and homogeneous geometry types so spatial annotations load directly into PyTorch and TorchGeo without custom parsing.",
      "datePublished": "2025-03-12",
      "dateModified": "2026-06-24",
      "author": {"@type": "Organization", "name": "Geospatial Annotation"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://geospatialannotation.com/"},
        {"@type": "ListItem", "position": 2, "name": "Geospatial Annotation Fundamentals & Architecture", "item": "https://geospatialannotation.com/geospatial-annotation-fundamentals-architecture/"},
        {"@type": "ListItem", "position": 3, "name": "Vector vs Raster Annotation Workflows", "item": "https://geospatialannotation.com/geospatial-annotation-fundamentals-architecture/vector-vs-raster-annotation-workflows/"},
        {"@type": "ListItem", "position": 4, "name": "How to Structure GeoJSON for ML Training Datasets", "item": "https://geospatialannotation.com/geospatial-annotation-fundamentals-architecture/vector-vs-raster-annotation-workflows/how-to-structure-geojson-for-ml-training-datasets/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "How to Structure GeoJSON for ML Training Datasets",
      "description": "Step-by-step guide to normalizing raw GeoJSON annotation exports into a strict ML-ready structure: CRS conversion, property flattening, geometry validation, and dataloader integration.",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Enforce FeatureCollection root and RFC 7946 coordinate order"},
        {"@type": "HowToStep", "position": 2, "name": "Convert all geometries to EPSG:4326 and round coordinates"},
        {"@type": "HowToStep", "position": 3, "name": "Flatten and clean the properties dictionary"},
        {"@type": "HowToStep", "position": 4, "name": "Validate geometry topology with shapely"},
        {"@type": "HowToStep", "position": 5, "name": "Ingest with TorchGeo or a custom PyTorch Dataset"}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why does my dataloader crash on mixed geometry types in a GeoJSON file?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "PyTorch collation functions cannot batch-pad tensors of different ranks. A Polygon coordinate array is rank-3 while a Point is rank-1. Split mixed-geometry files by type and align them via a shared feature_id key."
          }
        },
        {
          "@type": "Question",
          "name": "What coordinate precision should I use in ML training GeoJSON?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "5–6 decimal places (~1–11 cm accuracy at the equator) is sufficient for most vision and segmentation tasks and reduces file size by 30–40% compared to full double-precision exports."
          }
        },
        {
          "@type": "Question",
          "name": "Should I store the CRS inside the GeoJSON properties?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "No. RFC 7946 mandates EPSG:4326 as the only legal CRS in GeoJSON. Store any projected CRS used for downstream metric calculations in a separate pipeline config file, not inside the GeoJSON itself."
          }
        }
      ]
    }
  ]
}
</script>

# How to Structure GeoJSON for ML Training Datasets

Wrap all annotated features in a single `FeatureCollection`, enforce `EPSG:4326` (WGS84) coordinates throughout, and store model targets in a flat `properties` dictionary with consistent `snake_case` keys. Each `Feature` must contain exactly one `geometry` object and a `properties` object that maps directly to your label schema — classification IDs, segmentation mask references, or bounding box coordinates. Avoid nested dictionaries, mixed geometry types within a batch, or non-standard [coordinate reference system](/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) declarations — these break batch loaders and spatial join operations in automated pipelines.

## Why GeoJSON Structure Breaks ML Pipelines

GeoJSON's inherent flexibility is the root cause of most training-data failures. An annotation tool that exports a valid GeoJSON file can still produce data that silently corrupts your model. Three failure modes are common:

**Silent spatial misalignment.** If your tool exports in `EPSG:3857` (Web Mercator) rather than the RFC 7946-mandated `EPSG:4326`, longitude/latitude values appear superficially correct but are actually projected meter-based offsets. When a dataloader maps these values to pixel coordinates using a geotransform, every bounding box lands in the wrong location. The model trains without error but learns to detect objects at systematically wrong positions.

**Collation failures from mixed geometry.** PyTorch's default collation function tries to stack arrays of identical shape. A `Polygon` coordinate array is rank-3 (rings × vertices × 2), a `Point` is rank-1. Mixing both in a single batch raises a `RuntimeError` or silently drops features, corrupting ground-truth label counts without a traceable exception.

**Feature leakage from nested properties.** Annotation tools frequently export metadata — annotator IDs, review timestamps, confidence flags — nested inside `properties`. If a custom parser flattens these alongside training targets, the model receives annotator identity as a feature, producing inflated validation metrics that disappear at inference time.

Understanding where [vector vs raster annotation workflows](/geospatial-annotation-fundamentals-architecture/vector-vs-raster-annotation-workflows/) diverge explains why these issues are GeoJSON-specific: raster masks bake CRS and pixel alignment into the file format, while GeoJSON delegates both to the consuming application.

## Step-by-Step Implementation

The following steps take a raw annotation export — any CRS, nested properties, unvalidated geometries — and produce an ML-ready `FeatureCollection` that loads without custom parsing.

### Step 1: Enforce FeatureCollection Root and RFC 7946 Coordinate Order

The root object must always be `{"type": "FeatureCollection"}`. Never use a bare array of `Feature` objects at the root; most spatial dataloaders test for the `FeatureCollection` type before iterating features. RFC 7946 also mandates `[longitude, latitude]` coordinate order — not `[lat, lon]`. Many GIS exports reverse this silently.

```python
import json

def assert_featurecollection(path: str) -> dict:
    with open(path) as f:
        fc = json.load(f)
    assert fc.get("type") == "FeatureCollection", (
        f"Root type must be 'FeatureCollection', got '{fc.get('type')}'"
    )
    assert "features" in fc and isinstance(fc["features"], list), (
        "Missing 'features' array at root"
    )
    return fc
```

### Step 2: Convert All Geometries to `EPSG:4326` and Round Coordinates

All source data must be converted to `EPSG:4326` before ingestion, regardless of what the annotation tool used internally. If your training targets later require projected coordinates (e.g., metre-scale bounding boxes for loss functions that use Euclidean distance), perform that projection **after** validation and store the target CRS in a separate pipeline config — never inside the GeoJSON.

Rounding coordinates to 5–6 decimal places (~11 cm accuracy at the equator) is sufficient for all aerial and satellite vision tasks and reduces file size by 30–40%.

```python
import pyproj
from shapely.geometry import shape, mapping
from shapely.ops import transform

def to_wgs84(geom_dict: dict, source_crs: str, precision: int = 6) -> dict:
    """Convert a geometry dict from source_crs to EPSG:4326 and round coords."""
    transformer = pyproj.Transformer.from_crs(
        source_crs, "EPSG:4326", always_xy=True
    )
    geom = shape(geom_dict)
    geom_wgs84 = transform(transformer.transform, geom)

    def _round(x, y, z=None):
        if z is not None:
            return round(x, precision), round(y, precision), round(z, precision)
        return round(x, precision), round(y, precision)

    return mapping(transform(_round, geom_wgs84))
```

### Step 3: Flatten and Clean the Properties Dictionary

Your `properties` dictionary must act as a direct bridge to your model's label space. Flatten hierarchical annotation exports into a single namespace. If your tool outputs:

```json
{"labels": {"vehicle": {"type": "car", "occluded": false}}}
```

flatten during export to:

```json
{"vehicle_type": "car", "vehicle_occluded": false}
```

Prefix non-training keys — annotation tool version, annotator ID, review timestamp — with `__meta_` and strip them during preprocessing. Maintain a separate label mapping file (JSON or YAML) that maps property keys to integer class IDs. This decouples annotation schema changes from model architecture updates and prevents accidental [annotation confidence scores](/geospatial-annotation-fundamentals-architecture/confidence-scoring-for-geospatial-labels/) from leaking into training targets.

```python
def flatten_properties(
    props: dict,
    strip_prefix: str = "__meta_"
) -> dict:
    """Return flat, snake_case properties with meta keys removed."""
    return {
        k.lower().replace(" ", "_"): v
        for k, v in props.items()
        if not k.startswith(strip_prefix)
    }
```

### Step 4: Validate Geometry Topology with `shapely`

Raw annotations frequently contain self-intersections, duplicate vertices, or unclosed rings. These artifacts crash spatial join operations and corrupt mask generation. Call `shapely.validation.make_valid()` on every geometry before writing the output file.

Enforce a single geometry type per dataset split. If your pipeline requires mixed types — points for object centroids alongside polygons for instance masks — split them into separate GeoJSON files and align them via a shared `feature_id` key during batch construction.

```python
from shapely.validation import make_valid
from shapely.geometry import shape, mapping

def validate_geometry(geom_dict: dict) -> dict:
    """Repair invalid geometry; raise if the result is empty."""
    geom = make_valid(shape(geom_dict))
    if geom.is_empty:
        raise ValueError("Geometry is empty after make_valid — check source annotation")
    return mapping(geom)
```

### Step 5: Assemble and Ingest with TorchGeo or a Custom Dataset

Once normalized, the `FeatureCollection` can be ingested by `TorchGeo`, `rasterio`+`shapely`, or a custom `torch.utils.data.Dataset` without custom parsing. Map `properties` keys directly to tensor targets inside `__getitem__`, never inside the training loop.

```python
import json
import numpy as np
import torch
from torch.utils.data import Dataset

class GeoJSONAnnotationDataset(Dataset):
    """Minimal Dataset wrapping a normalized FeatureCollection."""

    def __init__(self, geojson_path: str, class_key: str = "class_id"):
        with open(geojson_path) as f:
            fc = json.load(f)
        self.features = fc["features"]
        self.class_key = class_key

    def __len__(self) -> int:
        return len(self.features)

    def __getitem__(self, idx: int):
        feat = self.features[idx]
        # Polygon exterior ring: shape (N, 2)
        coords = np.array(
            feat["geometry"]["coordinates"][0], dtype=np.float32
        )
        label = int(feat["properties"][self.class_key])
        return torch.tensor(coords), torch.tensor(label)
```

Avoid on-the-fly CRS transformations or property parsing inside `__getitem__`. Precompute and cache the normalized structure — this is where [dataset versioning with DVC](/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/) provides the most value: version the normalized file, not the raw export.

The diagram below shows the normalization pipeline from raw export to DataLoader:

<svg viewBox="0 0 680 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="GeoJSON normalization pipeline: raw export through four stages to DataLoader" style="width:100%;max-width:680px;display:block;margin:1.5rem auto;">
  <title>GeoJSON normalization pipeline</title>
  <desc>Five boxes connected by arrows: Raw GeoJSON Export, then CRS → EPSG:4326, then Flatten Properties, then Validate Geometry, then ML-Ready FeatureCollection feeding into DataLoader.</desc>
  <rect x="4" y="70" width="112" height="44" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="60" y="88" text-anchor="middle" font-size="11" fill="currentColor">Raw GeoJSON</text>
  <text x="60" y="103" text-anchor="middle" font-size="11" fill="currentColor">Export</text>
  <line x1="116" y1="92" x2="136" y2="92" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr)"/>
  <rect x="136" y="70" width="110" height="44" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="191" y="88" text-anchor="middle" font-size="11" fill="currentColor">CRS →</text>
  <text x="191" y="103" text-anchor="middle" font-size="11" fill="currentColor">EPSG:4326</text>
  <line x1="246" y1="92" x2="266" y2="92" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr)"/>
  <rect x="266" y="70" width="110" height="44" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="321" y="88" text-anchor="middle" font-size="11" fill="currentColor">Flatten</text>
  <text x="321" y="103" text-anchor="middle" font-size="11" fill="currentColor">Properties</text>
  <line x1="376" y1="92" x2="396" y2="92" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr)"/>
  <rect x="396" y="70" width="110" height="44" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="451" y="88" text-anchor="middle" font-size="11" fill="currentColor">Validate</text>
  <text x="451" y="103" text-anchor="middle" font-size="11" fill="currentColor">Geometry</text>
  <line x1="506" y1="92" x2="526" y2="92" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr)"/>
  <rect x="526" y="55" width="130" height="74" rx="6" fill="none" stroke="currentColor" stroke-width="2"/>
  <text x="591" y="83" text-anchor="middle" font-size="11" fill="currentColor">ML-Ready</text>
  <text x="591" y="98" text-anchor="middle" font-size="11" fill="currentColor">FeatureCollection</text>
  <text x="591" y="113" text-anchor="middle" font-size="10" fill="currentColor">→ DataLoader</text>
  <defs>
    <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor"/>
    </marker>
  </defs>
</svg>

## Key Parameters and Thresholds

| Parameter | Recommended value | Spatial implication |
|---|---|---|
| Root `type` | `"FeatureCollection"` | Required by all spatial dataloaders |
| Coordinate order | `[longitude, latitude]` | RFC 7946 — reversal causes silent bbox misalignment |
| CRS | `EPSG:4326` | Any other CRS violates the GeoJSON spec |
| Coordinate precision | 5–6 decimal places | ~11 cm accuracy; 30–40% smaller files |
| Geometry type per split | Homogeneous | Mixed types break PyTorch collation |
| Properties depth | Flat (`depth == 1`) | Nested dicts require custom recursive parsers |
| Meta key prefix | `__meta_` | Strip before training to prevent feature leakage |

## Common Errors and Fixes

**`AssertionError: Root type must be 'FeatureCollection'`**
Cause: Export was saved as a bare `Feature` or a `GeometryCollection`. Fix: Wrap in a `FeatureCollection` during the export step — never at load time inside the training loop.

**`RuntimeError: stack expects each tensor to be equal size`**
Cause: Mixed geometry types (`Polygon` and `Point`) in the same batch. Fix: Split the `FeatureCollection` by `geometry.type` into separate files; align via `feature_id` during batch construction.

**Silent bounding box offset in model predictions**
Cause: Source data was in `EPSG:3857` or a UTM zone; coordinates were never reprojected. Fix: Run `pyproj.Transformer.from_crs(source_crs, "EPSG:4326", always_xy=True)` on every geometry before writing the output file.

**`KeyError: 'class_id'` in `__getitem__`**
Cause: The property key differs between annotation batches (e.g., `classId` vs `class_id`). Fix: Enforce `k.lower().replace(" ", "_")` normalization in `flatten_properties` and validate the label mapping file against the output schema before training.

**`TopologicalError` from `shapely.ops.unary_union`**
Cause: Self-intersecting polygon from a rushed annotation session. Fix: Run `shapely.validation.make_valid()` during the validation step; log the feature ID for human review rather than silently dropping it.

---

This page is part of the [Vector vs Raster Annotation Workflows](/geospatial-annotation-fundamentals-architecture/vector-vs-raster-annotation-workflows/) guide, which covers the full decision framework for choosing annotation formats in geospatial ML pipelines.

**Related**

- [Vector vs Raster Annotation Workflows](/geospatial-annotation-fundamentals-architecture/vector-vs-raster-annotation-workflows/) — parent guide covering format selection, topology trade-offs, and pipeline architecture
- [Coordinate Reference Systems in Annotation Pipelines](/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) — CRS contracts, datum shifts, and PROJ configuration for spatial ML
- [Confidence Scoring for Geospatial Labels](/geospatial-annotation-fundamentals-architecture/confidence-scoring-for-geospatial-labels/) — per-annotation quality scores and how to separate them from training targets
- [Implementing DVC for Geospatial Training Data](/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/) — version the normalized FeatureCollection, not the raw export
- [Preserving Metadata Across Dataset Versions](/dataset-versioning-spatial-data-sync/preserving-metadata-across-dataset-versions/) — COCO/YOLO/GeoJSON schema enforcement across pipeline updates
