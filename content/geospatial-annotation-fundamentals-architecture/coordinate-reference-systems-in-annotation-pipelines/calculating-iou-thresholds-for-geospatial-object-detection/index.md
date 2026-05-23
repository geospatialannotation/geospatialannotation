# Calculating IoU thresholds for geospatial object detection

Calculating IoU thresholds for geospatial object detection requires projection-aware area computation, topology validation, and adaptive cutoffs calibrated to ground sample distance (GSD) and mission requirements. Convert all coordinates to a local metric CRS, compute intersections using robust geometry libraries, and apply dynamic thresholds (typically 0.35–0.75) instead of a static 0.50. Geographic projections distort area at scale, making unprojected IoU calculations unreliable for aerial and satellite pipelines.

## Why Standard IoU Fails in Geospatial Pipelines

Standard computer vision evaluation assumes Euclidean space and uniform pixel spacing. Geospatial imagery breaks this assumption. WGS84 (EPSG:4326) uses decimal degrees, which compress longitudinal distances toward the poles. A 100×100 meter building near the equator occupies a different angular footprint than the same structure in Scandinavia. Calculating IoU directly on lat/lon coordinates inflates union areas, suppresses intersection scores, and triggers false negatives during model evaluation.

Additionally, varying GSD across flight altitudes or satellite passes alters bounding box proportions. A 0.50 threshold that works at 10 cm/pixel may penalize valid detections at 50 cm/pixel due to boundary pixelation and annotation tolerance bands. Treating IoU as a pure pixel-math problem introduces systematic bias that degrades precision-recall curves and misguides model iteration.

## Step-by-Step Calculation Workflow

Reliable geospatial IoU evaluation follows a deterministic pipeline:

1. **Normalize to a Metric CRS**: Transform all geometries to a local projected system (e.g., UTM or state plane) where units are meters. This eliminates degree compression and ensures area calculations reflect real-world scale.
2. **Enforce Topology Validity**: Close rings, remove self-intersections, and standardize orientation. Invalid geometries silently return zero-area intersections or crash geometry engines.
3. **Compute Intersection & Union**: Use a topology-aware engine to calculate exact overlap. Handle edge cases like touching boundaries, nested boxes, and degenerate polygons.
4. **Apply Adaptive Thresholding**: Match the IoU cutoff to object scale, GSD, and annotation tolerance.

Understanding how [Coordinate Reference Systems in Annotation Pipelines](/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) interact with metric conversions prevents silent evaluation drift. When teams export GeoJSON or COCO-formatted labels, embedded CRS metadata must be parsed and enforced before any overlap calculation.

## Dynamic Threshold Calibration & GSD Scaling

Static thresholds assume uniform annotation quality and consistent spatial resolution. Geospatial missions require calibrated ranges:

| Mission Type | Typical Object Scale | Recommended IoU Cutoff | Rationale |
|---|---|---|---|
| Infrastructure Mapping | Small (<100 m²) | 0.65–0.75 | High precision required; false positives carry compliance risk |
| Vehicle/Asset Detection | Medium (1–50 m²) | 0.50–0.60 | Standard balance of recall and precision |
| Land Cover / Agriculture | Large (>10,000 m²) | 0.35–0.50 | Boundary ambiguity; GSD variance dominates |
| Multi-Scale Detection | Mixed | 0.40–0.60 (adaptive) | Scale-dependent weighting or size-binned evaluation |

Thresholds should scale inversely with GSD. At coarse resolutions (≥30 cm/pixel), boundary uncertainty increases. Lowering the cutoff to 0.40–0.50 prevents penalizing models for sub-pixel misalignment that human annotators cannot consistently resolve.

## Production-Ready Python Implementation

The following implementation uses `shapely` 2.0+ and `pyproj` to handle CRS transformation, geometry validation, and threshold-aware matching. It works with both axis-aligned bounding boxes and arbitrary polygons.

```python
import numpy as np
from shapely.geometry import Polygon, box
from shapely.validation import make_valid
from shapely.ops import transform
from pyproj import Transformer
from typing import List, Tuple, Union

def calculate_geospatial_iou(
    pred_coords: Union[List, np.ndarray],
    gt_coords: Union[List, np.ndarray],
    source_crs: str = "EPSG:4326",
    target_crs: str = "EPSG:32633",  # UTM Zone 33N (metric)
    threshold: float = 0.50
) -> Tuple[float, bool]:
    """
    Calculate projection-aware IoU for geospatial object detection.
    Automatically transforms coordinates to a metric CRS, validates topology,
    and returns the IoU score with a boolean match flag.
    """
    # 1. Initialize transformer (always_xy ensures lon/lat matches x/y)
    transformer = Transformer.from_crs(source_crs, target_crs, always_xy=True)
    
    # 2. Convert inputs to Shapely Polygons
    def to_polygon(coords: Union[List, np.ndarray]) -> Polygon:
        if len(coords) == 4:
            return box(*coords)
        return Polygon(coords)

    pred_poly = make_valid(to_polygon(pred_coords))
    gt_poly = make_valid(to_polygon(gt_coords))

    # 3. Project to metric CRS
    project = lambda x, y: transformer.transform(x, y)
    pred_proj = transform(project, pred_poly)
    gt_proj = transform(project, gt_poly)

    # 4. Compute IoU
    intersection = pred_proj.intersection(gt_proj).area
    union = pred_proj.union(gt_proj).area

    if union == 0.0:
        return 0.0, False

    iou = intersection / union
    is_match = iou >= threshold
    return float(iou), bool(is_match)
```

For coordinate order handling across different EPSG codes, consult the official [PyProj Transformer documentation](https://pyproj4.github.io/pyproj/stable/api/transformer.html). For complex polygon operations, [Shapely’s geometry API](https://shapely.readthedocs.io/en/stable/manual.html) provides optimized C-level routines that prevent floating-point drift during union/intersection calculations.

## Size-Stratified Evaluation & mAP Adaptation

When evaluating models across heterogeneous object scales, aggregate IoU scores mask performance disparities. Adopt size-stratified evaluation:

- **Bin by Projected Area**: Group predictions into small (<100 m²), medium (100–10,000 m²), and large (>10,000 m²) categories after CRS transformation.
- **Compute Per-Bin mAP**: Calculate mean Average Precision independently for each bin. This reveals whether a model excels at detecting large agricultural fields but fails on rooftop HVAC units.
- **Weight by Mission Priority**: Apply custom weighting (e.g., 0.4×small + 0.3×medium + 0.3×large) to align evaluation metrics with operational KPIs.

This approach replaces the COCO standard's fixed `[0.50:0.95]` IoU sweep with geospatially meaningful cutoffs that reflect real-world detection tolerance.

## Avoiding Silent Evaluation Failures

- **Mixed CRS Inputs**: Never assume all tiles share the same projection. Parse `.prj` files or GeoJSON `crs` properties explicitly before batch processing.
- **Annotation Drift**: Inconsistent labeling conventions artificially depress IoU. Audit your training data against [Geospatial Annotation Fundamentals & Architecture](/geospatial-annotation-fundamentals-architecture/) guidelines to standardize tolerance bands before evaluation.
- **Empty Intersections**: Touching edges or sub-pixel overlaps often return `0.0` due to floating-point precision. Apply a minimal buffer (`polygon.buffer(0.01)`) only if your mission explicitly requires fuzzy matching.
- **Memory Overhead**: Loading entire tile sets into memory for union/intersection computation scales poorly. Use spatial indexing (e.g., `shapely.strtree.STRtree`) to filter candidate pairs before calculating exact IoU.

## Conclusion

Accurate evaluation in aerial and satellite pipelines depends on treating IoU as a geodetic metric, not a pixel-space heuristic. By projecting to a local CRS, enforcing topology, and calibrating thresholds to GSD and object scale, teams eliminate projection-induced bias and produce reliable precision/recall curves. Implementing size-stratified evaluation and validating annotation consistency ensures that model improvements translate directly to operational performance.