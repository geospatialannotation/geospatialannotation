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
dateModified: "2026-06-25"
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
      "dateModified": "2026-06-25",
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

Wrap all annotated features in a single `FeatureCollection`, enforce [`EPSG:4326`](/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) (WGS84) coordinates throughout, and store model targets in a flat `properties` dictionary with consistent `snake_case` keys. Each `Feature` must contain exactly one `geometry` object and a `properties` object that maps directly to your label schema — classification IDs, segmentation mask references, or bounding box coordinates. Avoid nested dictionaries, mixed geometry types within a batch, or non-standard coordinate reference system declarations — these break batch loaders and spatial join operations in automated pipelines.

## Where GeoJSON Structure Breaks ML Pipelines

GeoJSON's inherent flexibility is the root cause of most training-data failures. An annotation tool that exports a valid GeoJSON file can still produce data that silently corrupts your model. Three failure modes are common:

**Silent spatial misalignment.** If your tool exports in `EPSG:3857` (Web Mercator) rather than the RFC 7946-mandated `EPSG:4326`, longitude/latitude values appear superficially correct but are actually projected meter-based offsets. When a dataloader maps these values to pixel coordinates using a geotransform, every bounding box lands in the wrong location. The model trains without error but learns to detect objects at systematically wrong positions.

**Collation failures from mixed geometry.** PyTorch's default collation function tries to stack arrays of identical shape. A `Polygon` coordinate array is rank-3 (rings × vertices × 2), a `Point` is rank-1. Mixing both in a single batch raises a `RuntimeError` or silently drops features, corrupting ground-truth label counts without a traceable exception.

**Feature leakage from nested properties.** Annotation tools frequently export metadata — annotator IDs, review timestamps, [confidence flags](/geospatial-annotation-fundamentals-architecture/confidence-scoring-for-geospatial-labels/) — nested inside `properties`. If a custom parser flattens these alongside training targets, the model receives annotator identity as a feature, producing inflated validation metrics that disappear at inference time.

Understanding where [vector vs raster annotation workflows](/geospatial-annotation-fundamentals-architecture/vector-vs-raster-annotation-workflows/) diverge explains why these issues are GeoJSON-specific: raster masks bake CRS and pixel alignment into the file format, while GeoJSON delegates both to the consuming application.

## GeoJSON Normalization Pipeline

The diagram below shows the full normalization flow from a raw annotation export to a dataloader-ready `FeatureCollection`. Each stage corresponds to a step in the implementation below.

<svg viewBox="0 0 720 260" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="GeoJSON normalization pipeline showing five stages from raw export to ML-ready FeatureCollection" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>GeoJSON normalization pipeline</title>
  <desc>Five processing stages connected by arrows: (1) Raw GeoJSON Export, (2) Assert FeatureCollection root and RFC 7946 coordinate order, (3) Reproject to EPSG:4326 and round coordinates, (4) Flatten properties and strip meta keys, (5) Validate topology with shapely — producing an ML-Ready FeatureCollection for the DataLoader.</desc>
  <defs>
    <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="currentColor"/>
    </marker>
  </defs>
  <!-- Stage boxes -->
  <!-- Box 1: Raw GeoJSON -->
  <rect x="10" y="90" width="118" height="52" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="69" y="112" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">Raw GeoJSON</text>
  <text x="69" y="128" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">Export</text>
  <!-- Arrow 1→2 -->
  <line x1="128" y1="116" x2="148" y2="116" stroke="currentColor" stroke-width="1.5" marker-end="url(#arrowhead)"/>
  <!-- Box 2: Assert FeatureCollection -->
  <rect x="148" y="78" width="126" height="76" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="211" y="100" text-anchor="middle" font-size="10.5" fill="currentColor" font-family="sans-serif">Assert</text>
  <text x="211" y="115" text-anchor="middle" font-size="10.5" fill="currentColor" font-family="sans-serif">FeatureCollection</text>
  <text x="211" y="130" text-anchor="middle" font-size="10.5" fill="currentColor" font-family="sans-serif">root + lon/lat</text>
  <text x="211" y="145" text-anchor="middle" font-size="10.5" fill="currentColor" font-family="sans-serif">order</text>
  <!-- Arrow 2→3 -->
  <line x1="274" y1="116" x2="294" y2="116" stroke="currentColor" stroke-width="1.5" marker-end="url(#arrowhead)"/>
  <!-- Box 3: Reproject -->
  <rect x="294" y="78" width="126" height="76" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="357" y="100" text-anchor="middle" font-size="10.5" fill="currentColor" font-family="sans-serif">Reproject to</text>
  <text x="357" y="115" text-anchor="middle" font-size="10.5" fill="currentColor" font-family="sans-serif">EPSG:4326</text>
  <text x="357" y="130" text-anchor="middle" font-size="10.5" fill="currentColor" font-family="sans-serif">+ round coords</text>
  <text x="357" y="145" text-anchor="middle" font-size="10.5" fill="currentColor" font-family="sans-serif">to 6 d.p.</text>
  <!-- Arrow 3→4 -->
  <line x1="420" y1="116" x2="440" y2="116" stroke="currentColor" stroke-width="1.5" marker-end="url(#arrowhead)"/>
  <!-- Box 4: Flatten properties -->
  <rect x="440" y="78" width="126" height="76" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="503" y="100" text-anchor="middle" font-size="10.5" fill="currentColor" font-family="sans-serif">Flatten props</text>
  <text x="503" y="115" text-anchor="middle" font-size="10.5" fill="currentColor" font-family="sans-serif">+ strip</text>
  <text x="503" y="130" text-anchor="middle" font-size="10.5" fill="currentColor" font-family="sans-serif">__meta_ keys</text>
  <text x="503" y="145" text-anchor="middle" font-size="10.5" fill="currentColor" font-family="sans-serif">+ validate</text>
  <!-- Arrow 4→5 -->
  <line x1="566" y1="116" x2="586" y2="116" stroke="currentColor" stroke-width="1.5" marker-end="url(#arrowhead)"/>
  <!-- Box 5: ML-Ready -->
  <rect x="586" y="68" width="124" height="96" rx="7" fill="none" stroke="currentColor" stroke-width="2"/>
  <text x="648" y="94" text-anchor="middle" font-size="10.5" fill="currentColor" font-family="sans-serif" font-weight="bold">ML-Ready</text>
  <text x="648" y="109" text-anchor="middle" font-size="10.5" fill="currentColor" font-family="sans-serif">FeatureCollection</text>
  <text x="648" y="127" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif">homogeneous geom</text>
  <text x="648" y="142" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif">flat props</text>
  <text x="648" y="157" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif">→ DataLoader</text>
  <!-- Step labels below boxes -->
  <text x="69" y="160" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.7">Step 0</text>
  <text x="211" y="165" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.7">Step 1</text>
  <text x="357" y="165" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.7">Step 2</text>
  <text x="503" y="165" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.7">Steps 3–4</text>
  <text x="648" y="175" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.7">Step 5</text>
</svg>

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

All source data must be converted to `EPSG:4326` before ingestion, regardless of what the annotation tool used internally. If your training targets later require projected coordinates — for example, metre-scale bounding boxes for loss functions that use Euclidean distance — perform that projection **after** validation and store the target CRS in a separate pipeline config, never inside the GeoJSON.

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

    def _round(x: float, y: float, z: float | None = None):
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
        raise ValueError(
            "Geometry is empty after make_valid — check source annotation"
        )
    return mapping(geom)
```

### Step 5: Assemble and Ingest with TorchGeo or a Custom Dataset

Once normalized, the `FeatureCollection` can be ingested by TorchGeo, `rasterio`+`shapely`, or a custom `torch.utils.data.Dataset` without custom parsing. Map `properties` keys directly to tensor targets inside `__getitem__`, never inside the training loop.

```python
import json
import numpy as np
import torch
from torch.utils.data import Dataset

class GeoJSONAnnotationDataset(Dataset):
    """Minimal Dataset wrapping a normalized FeatureCollection."""

    def __init__(self, geojson_path: str, class_key: str = "class_id") -> None:
        with open(geojson_path) as f:
            fc = json.load(f)
        self.features = fc["features"]
        self.class_key = class_key

    def __len__(self) -> int:
        return len(self.features)

    def __getitem__(self, idx: int) -> tuple[torch.Tensor, torch.Tensor]:
        feat = self.features[idx]
        # Polygon exterior ring: shape (N, 2)
        coords = np.array(
            feat["geometry"]["coordinates"][0], dtype=np.float32
        )
        label = int(feat["properties"][self.class_key])
        return torch.tensor(coords), torch.tensor(label)
```

Avoid on-the-fly CRS transformations or property parsing inside `__getitem__`. Precompute and cache the normalized structure — this is where [dataset versioning with DVC](/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/) provides the most value: version the normalized file, not the raw export.

## Spatial Parameters and Thresholds Reference

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

---

**`RuntimeError: stack expects each tensor to be equal size`**

Cause: Mixed geometry types (`Polygon` and `Point`) in the same batch. Fix: Split the `FeatureCollection` by `geometry.type` into separate files; align via `feature_id` during batch construction.

---

**Silent bounding box offset in model predictions**

Cause: Source data was in `EPSG:3857` or a UTM zone; coordinates were never reprojected. Fix: Run `pyproj.Transformer.from_crs(source_crs, "EPSG:4326", always_xy=True)` on every geometry before writing the output file.

---

**`KeyError: 'class_id'` in `__getitem__`**

Cause: The property key differs between annotation batches (e.g., `classId` vs `class_id`). Fix: Enforce `k.lower().replace(" ", "_")` normalization in `flatten_properties` and validate the label mapping file against the output schema before training.

---

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
