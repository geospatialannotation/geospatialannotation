# How to Structure GeoJSON for ML Training Datasets

To structure GeoJSON for ML training datasets, wrap all annotated features in a single `FeatureCollection`, enforce `EPSG:4326` (WGS84) coordinates, and store model targets in a flat `properties` dictionary with consistent, snake_case keys. Each `Feature` must contain exactly one `geometry` object and a `properties` object that maps directly to your label schema (classification IDs, bounding box coordinates, or segmentation masks). Avoid nested dictionaries, mixed geometry types, or non-standard CRS definitions—these break batch loaders and spatial join operations in automated pipelines.

### Core Schema Requirements
ML frameworks expect deterministic, tabular-like structures. GeoJSON’s inherent flexibility becomes a liability in training pipelines if left unchecked. Enforce these constraints before ingestion:

- **Root Type:** Always `{"type": "FeatureCollection"}`. Never use bare `Feature` arrays at the root; most dataloaders expect a standard GeoJSON object.
- **Coordinate Order:** Strictly `[longitude, latitude]`. The [RFC 7946 specification](https://datatracker.ietf.org/doc/html/rfc7946) mandates this order, and violating it causes silent spatial misalignment during tensor conversion.
- **Properties Flattening:** Labels must be top-level keys under `properties`. Use `{"class_id": 3, "bbox_conf": 0.95, "tile_id": "a1b2"}`. Nested objects require custom recursive parsers that degrade `DataLoader` throughput.
- **Geometry Consistency:** Use `Polygon` for instance segmentation, `Point` for keypoints, and `MultiPolygon` for complex boundaries. Never mix geometry types within a single training batch; collation functions will fail on heterogeneous shapes.
- **Metadata Isolation:** Keep pipeline metadata (annotation tool version, annotator ID, timestamp) separate from training targets to prevent feature leakage. Prefix non-training keys with `__meta_` and strip them during preprocessing.

### Coordinate System & CRS Enforcement
Spatial ML pipelines assume a unified reference frame. Many GIS tools export in `EPSG:3857` (Web Mercator) or local UTM zones, which distort distance metrics and break loss functions that rely on Euclidean or geodesic calculations. Convert all source data to `EPSG:4326` before ingestion. If your training targets require projected coordinates (e.g., for meter-scale bounding boxes), perform the projection **after** validation and explicitly store the target CRS in a separate pipeline config, not inside the GeoJSON.

Coordinate precision also impacts storage and I/O. Rounding to 5–6 decimal places (~11 cm accuracy at the equator) is sufficient for most vision and segmentation tasks and reduces file size by 30–40%.

### Property Flattening & Label Mapping
Your `properties` dictionary should act as a direct bridge to your model’s label space. Flatten hierarchical annotation exports into a single namespace. If your annotation tool outputs nested structures like `{"labels": {"vehicle": {"type": "car", "occluded": false}}}`, flatten them during export:
```json
{
  "properties": {
    "vehicle_type": "car",
    "vehicle_occluded": false
  }
}
```
Maintain a strict label mapping file (JSON or YAML) that maps these keys to integer class IDs or tensor shapes. This decouples annotation schema changes from model architecture updates.

### Geometry Consistency & Validation
When designing [Geospatial Annotation Fundamentals & Architecture](/geospatial-annotation-fundamentals-architecture/), you’ll quickly notice that vector annotations preserve topological relationships that raster masks lose. However, raw annotations frequently contain self-intersections, duplicate vertices, or unclosed rings. These artifacts crash spatial join operations and corrupt mask generation.

Validate every geometry using `shapely.validation.make_valid()` before ingestion. Enforce a single geometry type per dataset split. If your pipeline requires mixed geometries (e.g., points for centroids + polygons for masks), split them into separate GeoJSON files and align them via a shared `feature_id` during batch construction.

### Production-Ready Transformation Script
The following script normalizes raw annotation exports into an ML-ready GeoJSON structure. It handles CRS transformation, coordinate rounding, property flattening, and topology validation.

```python
import json
from shapely.geometry import shape, mapping
from shapely.validation import make_valid
from shapely.ops import transform
import pyproj

def _round_coords(x, y, z=None, precision=6):
    """Recursively rounds coordinates to specified precision."""
    if z is not None:
        return (round(x, precision), round(y, precision), round(z, precision))
    return (round(x, precision), round(y, precision))

def prepare_geojson_for_ml(
    raw_features: list, 
    source_crs: str = "EPSG:3857", 
    precision: int = 6,
    strip_meta_prefix: str = "__meta_"
) -> dict:
    """
    Normalizes raw annotation exports into a strict ML-ready GeoJSON structure.
    """
    transformer = pyproj.Transformer.from_crs(source_crs, "EPSG:4326", always_xy=True)
    ml_features = []

    for feat in raw_features:
        try:
            # 1. Parse & validate geometry
            geom = shape(feat.get("geometry"))
            geom = make_valid(geom)
            
            # 2. Transform CRS
            geom_wgs84 = transform(transformer.transform, geom)
            
            # 3. Round coordinates to reduce I/O overhead
            def round_geom_coords(geom_obj):
                return transform(lambda x, y, z=None: _round_coords(x, y, z, precision), geom_obj)
            geom_rounded = round_geom_coords(geom_wgs84)
            
            # 4. Flatten & clean properties
            props = feat.get("properties", {})
            clean_props = {
                k.lower().replace(" ", "_"): v
                for k, v in props.items()
                if not k.startswith(strip_meta_prefix)
            }
            
            ml_features.append({
                "type": "Feature",
                "geometry": mapping(geom_rounded),
                "properties": clean_props
            })
        except Exception as e:
            # In production: log.warning(f"Skipping malformed feature: {e}")
            continue

    return {"type": "FeatureCollection", "features": ml_features}

# Usage example:
# ml_geojson = prepare_geojson_for_ml(raw_export, source_crs="EPSG:3857")
# with open("train_dataset.geojson", "w") as f:
#     json.dump(ml_geojson, f)
```

### Pipeline Integration & Batch Loading
Once normalized, the GeoJSON file can be ingested by modern spatial dataloaders without custom parsing. Frameworks like `TorchGeo` or `rasterio` + `shapely` expect this exact structure. When loading, map `properties` keys directly to tensor targets:

```python
import numpy as np
import torch

# Example: iterate features and convert to tensors for a custom Dataset
def geojson_to_tensors(geojson_data: dict):
    """Yield (coords_tensor, label_tensor) pairs from a FeatureCollection."""
    for feature in geojson_data["features"]:
        coords = np.array(feature["geometry"]["coordinates"][0], dtype=np.float32)
        label = int(feature["properties"]["class_id"])
        yield torch.tensor(coords), torch.tensor(label)
```

Avoid on-the-fly CRS transformations or property parsing inside the training loop. Precompute and cache the normalized structure. This aligns with best practices in [Vector vs Raster Annotation Workflows](/geospatial-annotation-fundamentals-architecture/vector-vs-raster-annotation-workflows/), where deterministic preprocessing separates data engineering from model optimization.

### Final Checklist Before Training
- [ ] Root object is `FeatureCollection`
- [ ] All coordinates are `[lon, lat]` in `EPSG:4326`
- [ ] `properties` contains only flat, snake_case training targets
- [ ] No `__meta_` keys remain
- [ ] All geometries are valid and homogeneous per batch
- [ ] Coordinate precision is capped at 5–6 decimals
- [ ] File validates against the official GeoJSON spec

Adhering to this structure eliminates silent spatial misalignments, accelerates dataloader throughput, and ensures your vector annotations scale cleanly from annotation tools to distributed training clusters.