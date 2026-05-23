# Automating Pre-Labeling with Foundation Models

Foundation models have fundamentally shifted geospatial annotation from manual digitization to AI-assisted pre-labeling. By leveraging vision foundation models like Segment Anything Model (SAM), Grounding DINO, or satellite-optimized variants, spatial data scientists can generate high-quality polygon and bounding box candidates at scale. The real engineering challenge lies not in running inference, but in building a deterministic pipeline that handles coordinate systems, tile boundaries, confidence filtering, and downstream export. This guide details a production-ready workflow for **Automating Pre-Labeling with Foundation Models** within modern geospatial ML training pipelines. When integrated correctly, these systems reduce manual overhead by 60–80% while establishing a scalable baseline for broader [Labeling Workflows & Toolchain Integration](/labeling-workflows-toolchain-integration/) strategies.

## Prerequisites & Environment Setup

Before implementing the pipeline, ensure your environment meets the following baseline requirements:

- **Python 3.10+** with isolated virtual environment (`venv` or `conda`)
- **Geospatial stack**: `rasterio>=1.3.0`, `shapely>=2.0.0`, `pyproj`, `geopandas>=0.14.0`
- **ML inference stack**: `torch>=2.1.0`, `transformers>=4.36.0`, `accelerate` (optional for mixed precision)
- **Hardware**: NVIDIA GPU with ≥8GB VRAM recommended for batch inference; CPU fallback supported with aggressive tiling and `torch.compile`
- **Data**: Orthorectified imagery with embedded CRS metadata (GeoTIFF preferred), consistent radiometric calibration
- **API/Weights**: Access to open foundation model checkpoints (e.g., Hugging Face Hub) or commercial vision API endpoints

Lock dependency versions explicitly. Foundation model inference is highly sensitive to transformer and CUDA compatibility. Use a `requirements.txt` or `environment.yml` to prevent silent degradation during pipeline scaling. For reproducible builds, consider pinning `torch` and `rasterio` to specific wheels matching your OS and CUDA toolkit version. Consult the official [PyTorch CUDA best practices](https://pytorch.org/docs/stable/notes/cuda.html) to avoid common memory fragmentation issues during long-running inference jobs.

## Core Pipeline Architecture

A robust pre-labeling pipeline follows a deterministic sequence. Skipping validation or CRS alignment at any stage compounds errors downstream. The architecture below is designed for idempotency, meaning interrupted runs can resume without duplicating work or corrupting spatial references.

### Raster Tiling & Memory Management

Large orthomosaics routinely exceed GPU memory limits. Splitting imagery into fixed-size tiles (e.g., 1024×1024 or 2048×2048) with 10–15% overlap prevents edge truncation of features. Overlap is critical because foundation models lose spatial context near tile boundaries, causing fragmented masks or truncated bounding boxes.

Implement windowed reads to avoid loading full rasters into RAM. The `rasterio.windows` module allows you to stream tiles directly from disk while preserving the original affine transform and CRS metadata. After inference, overlapping regions must be deduplicated using spatial joins or non-maximum suppression (NMS) to prevent duplicate geometries in the final output. For implementation details on streaming large rasters efficiently, refer to the official [Rasterio windowed reading documentation](https://rasterio.readthedocs.io/en/stable/topics/windowed-rw.html).

### Model Inference & Prompt Engineering

Once tiles are prepared, pass them through the foundation model. Architecture selection depends on your annotation target:

- **Instance Segmentation**: SAM, MobileSAM, or FastSAM generate pixel-accurate masks. Use automatic mask generators for dense feature extraction, or prompt-based generators for targeted classes.
- **Open-Vocabulary Detection**: Grounding DINO or OWL-ViT accept text prompts to return bounding boxes without fine-tuning. This is ideal for zero-shot geospatial tasks (e.g., "solar panels", "construction cranes", "flooded roads").

Batch tiles using `torch.utils.data.DataLoader` with `pin_memory=True` and `num_workers` tuned to your CPU core count. Apply mixed precision (`torch.autocast(device_type="cuda", dtype=torch.float16)`) to halve VRAM consumption without sacrificing mask quality. Log inference latency and memory peaks per batch to identify bottlenecks before scaling to regional datasets.

### Vectorization & Geospatial Alignment

Raw model outputs are typically binary masks or pixel-space coordinates. Converting these to georeferenced vectors requires precise affine transformation. Use `rasterio.features.shapes` or `cv2.findContours` to extract polygon boundaries, then map pixel coordinates back to geographic space using the tile's original transform matrix.

Apply morphological operations (closing, opening, erosion) to fill small holes and remove salt-and-pepper noise before vectorization. Once converted, validate that all geometries align with the source CRS using `pyproj`. Mismatched projections are a common source of downstream training failure. For robust geometry manipulation and validation, consult the [Shapely geometry operations manual](https://shapely.readthedocs.io/en/stable/manual.html).

### Confidence Thresholding & Spatial Filtering

Foundation models produce raw confidence scores that rarely correlate directly with spatial accuracy. Apply a two-stage filtering process:

1. **Score Thresholding**: Discard predictions below a confidence threshold (typically 0.65–0.80). Calibrate this threshold using a small validation set of manually labeled tiles.
2. **Spatial & Area Filtering**: Remove micro-polygons that represent noise rather than target features. Use `geopandas` to filter by minimum area (e.g., `>50 m²` for building footprints) and apply `buffer(0)` to fix self-intersecting geometries.

Merge overlapping predictions using spatial intersection logic. If multiple masks cover the same geographic footprint, retain the one with the highest confidence score or largest valid area. This step dramatically reduces false positives before human review.

### Export & Platform Integration

Serialize validated predictions to GeoJSON, Parquet, or Shapefile. Ensure the output schema includes mandatory fields: `geometry`, `confidence`, `class_name`, `tile_id`, and `timestamp`. Push the dataset directly to your annotation platform for human-in-the-loop validation. Teams frequently route these pre-labels into [Integrating Label Studio with Geospatial Workflows](/labeling-workflows-toolchain-integration/integrating-label-studio-with-geospatial-workflows/) to enable rapid correction, versioning, and quality scoring.

For local review and spatial QA, many GIS teams load the pre-labeled outputs into desktop environments. The [QGIS Plugin Ecosystem for Annotation Teams](/labeling-workflows-toolchain-integration/qgis-plugin-ecosystem-for-annotation-teams/) provides specialized tools for visualizing confidence heatmaps, snapping geometries to orthomosaics, and batch-editing attributes before final export.

## Production Hardening & Code Reliability

A research notebook does not scale to production. Hardening your pipeline requires explicit error handling, checkpointing, and schema validation.

```python
import geopandas as gpd
import rasterio
from rasterio.windows import Window
from pathlib import Path

def process_tile(tile_path: Path, model, threshold: float = 0.7) -> gpd.GeoDataFrame:
    with rasterio.open(tile_path) as src:
        affine = src.transform
        crs = src.crs
        # 1. Inference logic (pseudo-code)
        masks, scores = model.predict(src.read())
        
        # 2. Vectorization & filtering
        geoms = []
        for mask, score in zip(masks, scores):
            if score >= threshold:
                poly = mask_to_polygon(mask, affine)
                if poly.is_valid and poly.area > 10.0:  # m²
                    geoms.append({"geometry": poly, "confidence": score})
                    
    return gpd.GeoDataFrame(geoms, crs=crs)
```

Wrap inference loops in `try/except` blocks with explicit retry logic for transient GPU OOM errors. Implement idempotent checkpointing by writing intermediate GeoParquet files per tile. If the pipeline crashes, it can resume from the last successfully processed tile without re-running expensive inference.

Validate all outputs against an OGC-compliant schema before committing to storage. Use `pydantic` or `great_expectations` to enforce geometry types, CRS consistency, and required metadata fields. When pre-labels are finalized, they often feed directly into model training pipelines. For teams transitioning from annotation platforms to object detection frameworks, [Converting Label Studio exports to YOLOv8 format](/labeling-workflows-toolchain-integration/automating-pre-labeling-with-foundation-models/converting-label-studio-exports-to-yolov8-format/) ensures seamless compatibility with modern training scripts.

## Validation & Human-in-the-Loop Cycles

Pre-labeling does not replace human annotators; it redefines their role. Instead of drawing polygons from scratch, GIS specialists verify, correct, and approve AI-generated candidates. Implement a feedback loop where corrected labels are stored separately, enabling active learning pipelines to fine-tune the foundation model on domain-specific edge cases.

Track key metrics:
- **Acceptance Rate**: Percentage of pre-labels approved without modification
- **Edit Distance**: Average vertex changes required per polygon
- **False Positive Rate**: Proportion of predictions discarded during review

These metrics directly inform threshold calibration and prompt refinement. Over time, the pipeline shifts from zero-shot inference to domain-adapted pre-labeling, compounding efficiency gains across subsequent annotation cycles.

## Conclusion

Automating Pre-Labeling with Foundation Models transforms geospatial annotation from a bottleneck into a scalable, engineering-driven process. Success depends on rigorous CRS handling, deterministic tiling, confidence-aware filtering, and seamless handoff to human validators. By treating the pipeline as production software rather than a research script, spatial data teams can achieve consistent, high-throughput labeling while maintaining strict spatial accuracy. As model architectures evolve and open-vocabulary detection matures, these foundational workflows will remain the backbone of modern geospatial ML operations.