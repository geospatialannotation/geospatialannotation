# Debugging Annotation Drift Across Dataset Versions

Debugging annotation drift across dataset versions requires isolating whether discrepancies originate from coordinate reference system (CRS) transformations, schema mutations, label taxonomy shifts, or pipeline serialization artifacts. The fastest resolution path is computing deterministic spatial and semantic deltas between consecutive version snapshots using geometry tolerance checks, attribute alignment, and statistical distribution profiling before allowing the data to enter training queues.

## Root Cause Taxonomy in Geospatial Pipelines

Annotation drift rarely manifests as a single failure mode. In production ML pipelines, discrepancies typically fall into four diagnostic categories:

| Drift Type | Symptom | Primary Trigger |
|------------|---------|-----------------|
| **Geometric** | Sub-pixel coordinate shifts, slivers, self-intersections, or topology breaks | Reprojection, clipping, tile stitching, or exporter rounding |
| **Schema** | Changed class IDs, renamed columns, or geometry type conversions (polygon → bbox) | Annotation tool updates, manual schema edits, or ORM migrations |
| **Statistical** | Skewed label distributions, spatial clustering anomalies, or aspect ratio shifts | Guideline revisions, annotator fatigue, or sampling bias |
| **Serialization** | Dropped metadata, reordered features, or truncated floating-point precision | Format conversions (GeoJSON → Parquet → COCO) or batch loaders |

## Step-by-Step Debugging Workflow

1. **Lock Immutable Baselines:** Never diff live streams. Export fixed snapshots and verify checksums. Align your diffing tools with established [Dataset Versioning & Spatial Data Sync](/dataset-versioning-spatial-data-sync/) practices to guarantee consistent lineage tracking.
2. **Validate CRS & Topology:** Confirm both versions share identical `EPSG` definitions. Run `is_valid` checks to catch invalid geometries that silently break spatial joins or rasterization steps.
3. **Compute Spatial Deltas:** Match features using centroid proximity or nearest-neighbor joins with a project-specific tolerance threshold. Flag pairs exceeding the threshold as geometrically drifted.
4. **Align Attributes & Labels:** Join spatially matched features and compare label columns, confidence scores, and custom metadata. Explicitly track class ID remappings; implicit mappings cause silent training degradation.
5. **Profile Statistical Shifts:** Calculate Jensen-Shannon distance or KL divergence on label distributions and spatial density grids. Sudden distributional spikes indicate guideline drift rather than technical errors.
6. **Trace Pipeline Artifacts:** Cross-reference drift timestamps with CI/CD logs, annotation tool version bumps, and exporter configuration changes. If drift exceeds acceptable thresholds, consult [Rollback Strategies for Corrupted Spatial Datasets](/dataset-versioning-spatial-data-sync/rollback-strategies-for-corrupted-spatial-datasets/) before retraining or promoting the dataset.

## Working Code: Spatial & Schema Drift Detector

The following Python snippet uses `geopandas`, `shapely`, and `scipy` to compute geometric and label drift between two versioned annotation files. It assumes consistent schemas and enforces explicit CRS alignment.

```python
import geopandas as gpd
import pandas as pd
import numpy as np
import shapely
from scipy.spatial.distance import jensenshannon

def detect_annotation_drift(
    v1_path: str, 
    v2_path: str, 
    tolerance_meters: float = 0.5,
    label_col: str = "class_id"
) -> tuple[pd.DataFrame, float]:
    """
    Computes spatial and semantic drift between two versioned geospatial datasets.
    Returns a matched DataFrame with drift metrics and a Jensen-Shannon distance score.
    """
    # 1. Load & align CRS
    v1 = gpd.read_file(v1_path)
    v2 = gpd.read_file(v2_path)
    
    if v1.crs != v2.crs:
        v2 = v2.to_crs(v1.crs)
        
    # 2. Enforce valid geometries
    v1.geometry = v1.geometry.apply(shapely.make_valid)
    v2.geometry = v2.geometry.apply(shapely.make_valid)
    
    # 3. Spatial matching with tolerance (requires geopandas >= 0.10)
    # Docs: https://geopandas.org/en/stable/docs/reference/api/geopandas.sjoin_nearest.html
    matched = gpd.sjoin_nearest(
        v1, v2, max_distance=tolerance_meters, how="inner", suffixes=("_v1", "_v2")
    )
    
    if matched.empty:
        raise ValueError("No spatial matches found. Verify CRS, tolerance, or data overlap.")
        
    # 4. Compute geometric drift
    matched["hausdorff_dist"] = matched.apply(
        lambda r: shapely.hausdorff_distance(r.geometry_v1, r.geometry_v2), axis=1
    )
    matched["centroid_shift_m"] = matched.geometry_v1.distance(matched.geometry_v2.centroid)
    
    # 5. Detect label/schema drift
    matched["label_mismatch"] = matched[f"{label_col}_v1"] != matched[f"{label_col}_v2"]
    
    # 6. Statistical distribution shift (Jensen-Shannon distance)
    # Docs: https://docs.scipy.org/doc/scipy/reference/generated/scipy.spatial.distance.jensenshannon.html
    dist_v1 = v1[label_col].value_counts(normalize=True).sort_index()
    dist_v2 = v2[label_col].value_counts(normalize=True).sort_index()
    
    # Align indices to prevent NaN padding
    common_idx = dist_v1.index.union(dist_v2.index)
    dist_v1 = dist_v1.reindex(common_idx, fill_value=0.0)
    dist_v2 = dist_v2.reindex(common_idx, fill_value=0.0)
    
    jsd = jensenshannon(dist_v1.values, dist_v2.values, base=2)
    
    return matched, jsd
```

### Interpreting Results & Next Steps

- **`hausdorff_dist` > 0.5m** (or your project tolerance): Investigate reprojection pipelines, tile boundary clipping, or coordinate truncation during export.
- **`label_mismatch == True`**: Audit annotation guidelines. Check if class IDs were remapped without a migration script.
- **`jsd > 0.1`**: Indicates meaningful distributional shift. Review annotator instructions, sampling strategy, or recent label taxonomy changes.
- **`matched` row count << `len(v1)`**: Features dropped during spatial join. Likely caused by topology breaks, CRS misalignment, or aggressive tolerance thresholds.

Once drift sources are isolated, quarantine the affected version, patch the pipeline step responsible, and regenerate the snapshot. If training jobs already consumed corrupted batches, revert to the last verified baseline using documented [Rollback Strategies for Corrupted Spatial Datasets](/dataset-versioning-spatial-data-sync/rollback-strategies-for-corrupted-spatial-datasets/) to prevent model degradation.