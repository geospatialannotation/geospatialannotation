# Automating batch pre-labeling with SAM and QGIS

Automating batch pre-labeling with SAM and QGIS eliminates manual digitizing bottlenecks by running Meta’s Segment Anything Model on georeferenced raster tiles, converting binary masks to vector polygons, and exporting spatially aligned GeoJSON layers. This headless Python pipeline generates high-confidence initial annotations that spatial data scientists and GIS annotation teams can rapidly validate, merge, or correct inside QGIS. By decoupling inference from the desktop environment, teams achieve reproducible, scalable pre-labeling that plugs directly into modern [Labeling Workflows & Toolchain Integration](/labeling-workflows-toolchain-integration/) systems.

## Pipeline Architecture

The automation workflow follows four deterministic stages:

1. **Raster Tiling & CRS Normalization:** Large orthomosaics or satellite scenes are split into overlapping tiles (typically 1024×1024 pixels) to match SAM’s optimal receptive field. All tiles are projected to a common metric CRS (e.g., EPSG:3857 or local UTM) to preserve area/length calculations during vectorization.
2. **Batch SAM Inference:** Each tile passes through a pre-loaded SAM checkpoint. The `SamAutomaticMaskGenerator` runs with fixed IoU and stability thresholds to suppress fragmented or low-probability segments. Inference is batched across GPU memory to maximize throughput.
3. **Georeferenced Polygon Conversion:** Pixel-space masks are transformed back to map coordinates using the raster’s affine transform. `shapely` and `geopandas` handle topology cleaning, hole filling, and attribute assignment before export.
4. **QGIS Import & Review:** The output vector layer loads directly into QGIS with symbology pre-configured for rapid editing. Teams use snapping, topology checks, and attribute forms to finalize training-ready datasets.

## Production-Ready Python Implementation

The following script demonstrates a complete batch processor. It assumes you have downloaded a SAM checkpoint (`sam_vit_h_4b8939.pth`) and installed the official `segment-anything` package. For geospatial I/O, refer to the [Rasterio Documentation](https://rasterio.readthedocs.io/en/stable/) for advanced tiling and CRS handling.

```python
import os
import glob
import torch
import numpy as np
import rasterio
from rasterio.transform import Affine
from shapely.geometry import shape, mapping
from shapely.ops import transform as shapely_transform
import geopandas as gpd
from segment_anything import sam_model_registry, SamAutomaticMaskGenerator
import cv2

# Configuration
CHECKPOINT_PATH = "checkpoints/sam_vit_h_4b8939.pth"
INPUT_DIR = "rasters/tiles/"
OUTPUT_GEOJSON = "prelabels/sam_batch_output.geojson"
IOU_THRESHOLD = 0.85
AREA_FILTER = 500  # Minimum pixel area to keep

# Initialize SAM
sam = sam_model_registry["vit_h"](checkpoint=CHECKPOINT_PATH)
sam.to(device="cuda" if torch.cuda.is_available() else "cpu")
mask_generator = SamAutomaticMaskGenerator(
    model=sam,
    points_per_side=32,
    pred_iou_thresh=IOU_THRESHOLD,
    stability_score_thresh=0.92,
    crop_n_layers=1,
    min_mask_region_area=AREA_FILTER
)

def pixel_to_geo(mask_binary, transform):
    """Convert a binary mask to georeferenced Shapely polygons."""
    contours, _ = cv2.findContours(
        mask_binary.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
    )
    polys = []
    for contour in contours:
        if cv2.contourArea(contour) >= AREA_FILTER:
            # Convert OpenCV contour to Shapely Polygon
            poly = shape({"type": "Polygon", "coordinates": [contour.squeeze().tolist()]})
            # Apply raster affine transform to shift from pixel to map space
            geo_poly = shapely_transform(
                lambda x, y: transform * (x, y, 1), poly
            )
            polys.append(geo_poly)
    return polys

def process_batch():
    all_features = []
    tile_paths = sorted(glob.glob(os.path.join(INPUT_DIR, "*.tif")))
    
    for tile_path in tile_paths:
        with rasterio.open(tile_path) as src:
            img = src.read().transpose(1, 2, 0)
            transform = src.transform
            crs = src.crs
            
            # Run SAM inference
            masks = mask_generator.generate(img)
            
            for m in masks:
                geo_polys = pixel_to_geo(m["segmentation"], transform)
                for poly in geo_polys:
                    all_features.append({
                        "geometry": mapping(poly),
                        "properties": {
                            "source_tile": os.path.basename(tile_path),
                            "confidence": float(m["predicted_iou"]),
                            "area_px": int(m["area"]),
                            "crs": crs.to_string()
                        }
                    })
    
    # Export to GeoJSON
    gdf = gpd.GeoDataFrame.from_features(all_features, crs=crs)
    gdf.to_file(OUTPUT_GEOJSON, driver="GeoJSON")
    print(f"Exported {len(gdf)} polygons to {OUTPUT_GEOJSON}")

if __name__ == "__main__":
    process_batch()
```

## QGIS Integration & Validation Workflow

Once the GeoJSON is generated, load it into QGIS via **Layer > Add Layer > Add Vector Layer**. Apply a categorical symbology based on the `confidence` field to visually separate high-certainty segments from edge cases. Enable **Snapping** (Settings > Snapping Options) and configure a tolerance of 5–10 map units to align pre-labels with existing basemaps or survey boundaries.

For teams managing large annotation campaigns, integrating this pipeline into a broader [QGIS Plugin Ecosystem for Annotation Teams](/labeling-workflows-toolchain-integration/qgis-plugin-ecosystem-for-annotation-teams/) streamlines handoff between ML inference and human review. Use QGIS’s built-in **Topology Checker** to flag overlapping polygons, slivers, or unclosed rings before exporting to COCO or YOLO formats. Attribute forms can be configured to auto-populate `class_id` fields, reducing manual entry errors during final validation.

## Scaling & Performance Optimization

Running SAM at scale requires careful resource management. The official [Segment Anything Repository](https://github.com/facebookresearch/segment-anything) recommends using `vit_b` or `vit_l` checkpoints for production environments where `vit_h` exceeds available VRAM. To optimize throughput:

- **Tile Overlap Management:** Maintain a 15–20% overlap between adjacent tiles to prevent edge-cut artifacts. Deduplicate intersecting polygons post-inference using `gpd.overlay()` with the `intersection` operator.
- **Batched GPU Inference:** Wrap `mask_generator.generate()` in a `torch.no_grad()` context and enable mixed-precision (`torch.autocast(device_type="cuda", dtype=torch.float16)`) to reduce memory pressure by ~40%.
- **CRS Consistency:** Always normalize input rasters to a projected CRS before inference. Geographic CRS (WGS84) distorts pixel-to-meter ratios, causing SAM to misinterpret object scale and generate fragmented masks.
- **Post-Processing Filters:** Apply a minimum area threshold (`AREA_FILTER`) and a convexity check to remove noise. Use `shapely.simplify()` with a tolerance of 0.5–1.0 map units to reduce vertex count without compromising geometric accuracy.

By standardizing these steps, spatial teams can transition from manual digitizing to automated, human-in-the-loop annotation pipelines. The result is faster dataset curation, consistent spatial topology, and direct compatibility with downstream computer vision training frameworks.