---
title: "Vector vs Raster Annotation Workflows for Geospatial ML"
description: "A production-focused comparison of vector and raster annotation pipelines for satellite and aerial imagery: step-by-step Python implementation, spatial gotchas, CI integration, and a decision matrix for ML engineers."
slug: "vector-vs-raster-annotation-workflows"
type: "guide"
breadcrumb: "Geospatial Annotation Fundamentals > Vector vs Raster Annotation Workflows"
datePublished: "2025-11-10"
dateModified: "2026-06-24"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Vector vs Raster Annotation Workflows for Geospatial ML",
      "description": "A production-focused comparison of vector and raster annotation pipelines for satellite and aerial imagery: step-by-step Python implementation, spatial gotchas, CI integration, and a decision matrix for ML engineers.",
      "datePublished": "2025-11-10",
      "dateModified": "2026-06-24",
      "author": {"@type": "Organization", "name": "Geospatial Annotation"},
      "publisher": {"@type": "Organization", "name": "Geospatial Annotation"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.geospatialannotation.com/"},
        {"@type": "ListItem", "position": 2, "name": "Geospatial Annotation Fundamentals & Architecture", "item": "https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/"},
        {"@type": "ListItem", "position": 3, "name": "Vector vs Raster Annotation Workflows", "item": "https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/vector-vs-raster-annotation-workflows/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "How to Choose and Implement Vector or Raster Annotation Workflows",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Align prerequisites and toolchain", "text": "Pin geopandas, shapely, rasterio, and pyproj versions; verify GDAL and PROJ system libraries."},
        {"@type": "HowToStep", "position": 2, "name": "Validate source imagery CRS and tiling scheme", "text": "Extract affine transform, shape, and CRS from every GeoTIFF tile; store in sidecar JSON."},
        {"@type": "HowToStep", "position": 3, "name": "Implement vector delineation and topology enforcement", "text": "Load annotations, enforce CRS alignment, repair self-intersections with make_valid(), validate schema."},
        {"@type": "HowToStep", "position": 4, "name": "Rasterize annotations using exact affine transform", "text": "Use rasterio.features.rasterize with the template GeoTIFF transform; write uint8 mask with lossless compression."},
        {"@type": "HowToStep", "position": 5, "name": "Validate masks against source extent", "text": "Assert CRS match, affine transform identity, shape equality, and class-ID coverage before committing."},
        {"@type": "HowToStep", "position": 6, "name": "Hook validation into CI gates", "text": "Register topology validation and rasterization as DVC pipeline stages; add a pre-commit hook on .geojson files."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Should I store annotations as vector or raster for deep learning?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Store as vector for maximum editability and disk efficiency; rasterize at the data-loader stage (lazy rasterization) to give deep learning frameworks pixel-aligned masks without duplicating storage."
          }
        },
        {
          "@type": "Question",
          "name": "What causes boundary artifacts in rasterized annotation masks?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Mismatched affine transforms between the source imagery and the rasterization call, or using bilinear/cubic interpolation instead of nearest-neighbour. Always rasterize with the exact transform copied from the source GeoTIFF."
          }
        },
        {
          "@type": "Question",
          "name": "How do I validate that a GeoJSON annotation file is topology-safe?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Use shapely.is_valid on every geometry; repair self-intersections with make_valid() or buffer(0). Run these checks as a pre-commit hook or CI step before the annotations are merged into the dataset."
          }
        }
      ]
    }
  ]
}
</script>

# Vector vs Raster Annotation Workflows for Geospatial ML

The choice between vector and raster annotation formats is an architectural decision that propagates through every stage of a geospatial ML pipeline: storage costs, preprocessing complexity, model architecture compatibility, and inference latency all depend on it. A poorly chosen format discovered mid-project means weeks of reprocessing. The failure scenario is concrete: a segmentation team annotates 50,000 tiles in raw PNG masks at full resolution, only to learn their object-detection model expects polygon-level instance IDs — every annotation must be re-exported, [coordinate reference system](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) realigned, and rasterized from scratch.

This page gives you the step-by-step implementation for both workflows, a decision matrix, and the spatial-specific gotchas that cause silent pipeline failures. For the foundational concepts that underpin both approaches, see [Geospatial Annotation Fundamentals & Architecture](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/).

---

## Prerequisites & Toolchain Alignment

Before choosing a format, confirm the following are locked in. Misaligned prerequisites are the primary source of downstream crashes and degraded model convergence.

**Python packages (pin these versions):**
- `geopandas>=0.14.0` — spatial dataframes, CRS management, GeoJSON I/O
- `shapely>=2.0.0` — geometry validation, `make_valid`, topology operations
- `rasterio>=1.3.0` — raster I/O, affine transforms, `rasterize`
- `pyproj>=3.6.0` — CRS authority lookups, datum transformations
- `fiona>=1.9.0` — low-level vector I/O, schema inspection
- `numpy>=1.26.0` — mask array operations, dtype enforcement

**System dependencies:** GDAL 3.6+ and PROJ 9.2+ must be installed and on `PATH`. Mismatches between the GDAL C library version and the `rasterio`/`fiona` wheels cause cryptic import errors.

**Spatial knowledge prerequisites:**

1. **Source imagery metadata:** Verify GeoTIFF bit depth, band order, compression (LZW vs DEFLATE), and tile boundaries before annotation begins. Inconsistent tiling schemes produce boundary artifacts during rasterization and break spatial joins between adjacent tiles.
2. **[Label taxonomy](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/defining-roi-label-taxonomies-for-aerial-imagery/):** Establish a controlled class vocabulary with mutually exclusive categories and explicit boundary rules before any annotation starts. A taxonomy revised mid-project requires back-annotating all existing labels.
3. **CRS contract:** All annotation outputs must share the exact CRS as the source imagery. Sub-pixel misalignment from mixing `EPSG:4326` geographic coordinates with a projected CRS such as `EPSG:32618` (UTM zone 18N) distorts IoU calculations and breaks spatial indexing.

---

## Pipeline Architecture

The diagram below shows how vector annotations and raster masks fit into the same pipeline — the recommended hybrid stores vector annotations on disk and rasterizes lazily at the data-loader stage.

<svg viewBox="0 0 800 360" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Vector and raster annotation pipeline architecture" style="width:100%;max-width:800px;height:auto;display:block;margin:1.5rem auto;">
  <title>Vector and raster annotation pipeline architecture</title>
  <desc>Flowchart showing source imagery ingested into the annotation tool, producing vector annotations (GeoJSON/GeoPackage) that are validated and stored in version control. At training time, a data loader rasterizes vectors to pixel masks on the fly, feeding both object detection and segmentation model heads.</desc>
  <defs>
    <marker id="arr-vr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor" opacity="0.7"/>
    </marker>
  </defs>
  <!-- Source imagery box -->
  <rect x="10" y="142" width="145" height="56" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.6"/>
  <text x="82" y="166" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif">Source Imagery</text>
  <text x="82" y="182" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">GeoTIFF / COG</text>
  <!-- Annotation tool -->
  <rect x="200" y="142" width="145" height="56" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.6"/>
  <text x="272" y="166" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif">Annotation Tool</text>
  <text x="272" y="182" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">QGIS / Label Studio</text>
  <!-- Vector store -->
  <rect x="394" y="64" width="160" height="56" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.6"/>
  <text x="474" y="88" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif">Vector Annotations</text>
  <text x="474" y="104" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">GeoJSON / GeoPackage</text>
  <!-- Validation -->
  <rect x="394" y="220" width="160" height="56" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.6"/>
  <text x="474" y="244" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif">Validation Gate</text>
  <text x="474" y="260" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">topology + CRS + schema</text>
  <!-- Data loader -->
  <rect x="604" y="142" width="160" height="56" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.6"/>
  <text x="684" y="166" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif">Data Loader</text>
  <text x="684" y="182" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">lazy rasterize → mask</text>
  <!-- Model heads -->
  <rect x="604" y="40" width="160" height="48" rx="6" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.5"/>
  <text x="684" y="61" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">Object Detection</text>
  <text x="684" y="78" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">bounding box / polygon</text>
  <rect x="604" y="252" width="160" height="48" rx="6" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.5"/>
  <text x="684" y="273" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">Segmentation</text>
  <text x="684" y="290" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">pixel mask → CNN/ViT</text>
  <!-- Arrows -->
  <line x1="155" y1="170" x2="198" y2="170" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr-vr)" opacity="0.7"/>
  <line x1="345" y1="155" x2="392" y2="105" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr-vr)" opacity="0.7"/>
  <line x1="345" y1="185" x2="392" y2="235" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr-vr)" opacity="0.7"/>
  <line x1="554" y1="92" x2="602" y2="152" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr-vr)" opacity="0.7"/>
  <line x1="554" y1="248" x2="602" y2="188" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr-vr)" opacity="0.7"/>
  <line x1="764" y1="142" x2="764" y2="88" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr-vr)" opacity="0.7"/>
  <line x1="764" y1="198" x2="764" y2="252" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr-vr)" opacity="0.7"/>
</svg>

---

## Step 1 — Ingest Source Imagery and Verify the Affine Transform

Before any annotation begins, extract and record the affine transform, shape, and CRS from every source tile. Store these in a sidecar JSON so that downstream rasterization can always reconstruct the exact pixel grid.

```python
import rasterio
import json
from pathlib import Path

def extract_tile_metadata(tif_path: str) -> dict:
    """Return the spatial metadata needed to pin annotation CRS and rasterize correctly."""
    with rasterio.open(tif_path) as src:
        return {
            "path": tif_path,
            "crs_wkt": src.crs.to_wkt(),
            "epsg": src.crs.to_epsg(),
            "transform": list(src.transform),   # 6-element affine tuple
            "width": src.width,
            "height": src.height,
            "dtype": src.dtypes[0],
            "count": src.count,
        }

# Usage
meta = extract_tile_metadata("/data/tiles/tile_0042.tif")
Path("/data/tiles/tile_0042_meta.json").write_text(json.dumps(meta, indent=2))
```

Fail fast if `epsg` is `None` — that means the CRS is not registered in the PROJ authority and will silently break downstream transforms.

---

## Step 2 — Vector Annotation: Boundary Delineation and Topology Enforcement

Vector workflows produce discrete geometric primitives (points, lines, polygons) with attached attribute tables. They are ideal for object detection, instance segmentation, and feature extraction tasks where boundary precision, topological relationships, and attribute querying matter.

Annotators trace features in QGIS or a web-based polygon editor. Topology rules — no overlaps, closed rings, minimum vertex spacing, snap-to-grid alignment — must be enforced at the UI level or via post-processing. Invalid geometries (self-intersections, duplicate vertices, unclosed rings) break spatial indexing and cause silent failures during training data generation.

```python
import geopandas as gpd
from shapely.validation import make_valid
import logging

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

def validate_vector_annotations(
    input_path: str,
    output_path: str,
    target_epsg: int = 32618,
) -> gpd.GeoDataFrame:
    """
    Load, reproject, repair, and export a vector annotation file.

    Args:
        input_path:   Path to the raw GeoJSON or GeoPackage from the annotation tool.
        output_path:  Destination GeoJSON path for validated output.
        target_epsg:  EPSG code matching the source imagery CRS (default UTM 18N).
    Returns:
        Validated GeoDataFrame ready for rasterization or ML export.
    """
    gdf = gpd.read_file(input_path)
    logging.info("Loaded %d features. Source CRS: %s", len(gdf), gdf.crs)

    # --- CRS enforcement ---
    target_crs = f"EPSG:{target_epsg}"
    if gdf.crs is None:
        raise ValueError("Input file has no CRS. Declare it explicitly before export.")
    if gdf.crs.to_epsg() != target_epsg:
        logging.warning("Reprojecting from %s to %s", gdf.crs, target_crs)
        gdf = gdf.to_crs(target_crs)

    # --- Topology repair ---
    invalid_mask = ~gdf.geometry.is_valid
    n_invalid = int(invalid_mask.sum())
    if n_invalid:
        logging.warning("Repairing %d invalid geometries via make_valid().", n_invalid)
        gdf.loc[invalid_mask, "geometry"] = (
            gdf.loc[invalid_mask, "geometry"].apply(make_valid)
        )

    # --- Drop nulls and empty rings post-repair ---
    before = len(gdf)
    gdf = gdf[gdf.geometry.notna() & ~gdf.geometry.is_empty].copy()
    logging.info("Dropped %d null/empty geometries.", before - len(gdf))

    # --- Required attribute schema ---
    for col in ("class_id", "class_name", "annotator_id"):
        if col not in gdf.columns:
            raise ValueError(f"Missing required column: {col}")

    gdf.to_file(output_path, driver="GeoJSON")
    logging.info("Exported %d valid features → %s", len(gdf), output_path)
    return gdf
```

For production-grade attribute schema and property naming conventions, follow the [GeoJSON structuring guide for ML training datasets](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/vector-vs-raster-annotation-workflows/how-to-structure-geojson-for-ml-training-datasets/), which covers numeric typing, explicit CRS declarations, and embedding [confidence scores](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/confidence-scoring-for-geospatial-labels/) per feature.

---

## Step 3 — Raster Annotation: Pixel-Level Mask Generation

Raster workflows convert labeled regions into pixel-aligned masks where each pixel value encodes a class ID. This format is consumed directly by CNN and Vision Transformer architectures for semantic segmentation and change detection.

**Encoding rules:**
- Single-band `uint8`, values `0` (background) through `254` (active classes); `255` is reserved for "unlabeled / ignore".
- Nearest-neighbour fill — never bilinear or cubic, which blur class boundaries.
- Lossless compression: `compress="lzw"` or `compress="deflate"` in `rasterio.open`.

```python
import rasterio
from rasterio.features import rasterize
from rasterio.transform import Affine
import numpy as np
import geopandas as gpd
import logging

def generate_raster_mask(
    vector_path: str,
    template_tif: str,
    output_mask: str,
    class_mapping: dict[str, int],
) -> np.ndarray:
    """
    Rasterize validated vector annotations against a source imagery tile.

    Args:
        vector_path:   Path to validated GeoJSON.
        template_tif:  Source GeoTIFF whose grid pins the output mask.
        output_mask:   Output GeoTIFF mask path.
        class_mapping: Dict mapping class_name strings to uint8 IDs.
    Returns:
        The rasterized mask array (H, W) for downstream assertion.
    """
    with rasterio.open(template_tif) as src:
        transform: Affine = src.transform
        out_shape: tuple[int, int] = (src.height, src.width)
        crs = src.crs
        logging.info("Template: shape=%s  CRS=%s", out_shape, crs)

    gdf = gpd.read_file(vector_path)
    if gdf.crs.to_epsg() != crs.to_epsg():
        logging.warning("Reprojecting annotations to match tile CRS.")
        gdf = gdf.to_crs(crs)

    gdf["class_id"] = (
        gdf["class_name"].map(class_mapping).fillna(0).astype(np.uint8)
    )

    # Sort descending by class_id so higher-priority classes overwrite lower ones
    gdf = gdf.sort_values("class_id", ascending=False)
    shapes = (
        (geom, int(val))
        for geom, val in zip(gdf.geometry, gdf["class_id"])
        if geom is not None and not geom.is_empty
    )

    mask = rasterize(
        shapes,
        out_shape=out_shape,
        transform=transform,
        fill=0,
        dtype=np.uint8,
        merge_alg=rasterio.enums.MergeAlg.replace,
    )

    with rasterio.open(
        output_mask, "w",
        driver="GTiff",
        height=out_shape[0],
        width=out_shape[1],
        count=1,
        dtype=np.uint8,
        crs=crs,
        transform=transform,
        compress="lzw",
    ) as dst:
        dst.write(mask, 1)

    logging.info("Mask → %s  unique classes: %s", output_mask, np.unique(mask).tolist())
    return mask
```

Always version-control the `class_mapping` dictionary alongside the dataset — a renamed class breaks existing masks silently. Use [SHA-256 hashing of the lookup table](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/tracking-annotation-changes-with-sha-hashing/) to detect mapping drift across dataset versions.

---

## Step 4 — Lazy Rasterization in the PyTorch Data Loader

The recommended hybrid stores annotations as vector on disk and rasterizes at load time. This avoids storing large mask files while still feeding CNNs the pixel arrays they need.

```python
import torch
from torch.utils.data import Dataset
import rasterio
from rasterio.features import rasterize
import geopandas as gpd
import numpy as np
from pathlib import Path

class GeoAnnotationDataset(Dataset):
    """Lazy-rasterize vector annotations to uint8 masks per tile."""

    def __init__(
        self,
        tile_dir: str,
        annotation_dir: str,
        class_mapping: dict[str, int],
        transform=None,
    ):
        self.tiles = sorted(Path(tile_dir).glob("*.tif"))
        self.annotation_dir = Path(annotation_dir)
        self.class_mapping = class_mapping
        self.transform = transform

    def __len__(self) -> int:
        return len(self.tiles)

    def __getitem__(self, idx: int) -> dict:
        tif_path = self.tiles[idx]
        geojson_path = self.annotation_dir / tif_path.with_suffix(".geojson").name

        with rasterio.open(tif_path) as src:
            image = src.read().astype(np.float32)   # (C, H, W)
            t, shape, crs = src.transform, src.shape, src.crs

        gdf = gpd.read_file(geojson_path)
        if gdf.crs.to_epsg() != crs.to_epsg():
            gdf = gdf.to_crs(crs)

        gdf["class_id"] = gdf["class_name"].map(self.class_mapping).fillna(0).astype(np.uint8)
        shapes = ((g, int(v)) for g, v in zip(gdf.geometry, gdf["class_id"]) if g and not g.is_empty)
        mask = rasterize(shapes, out_shape=shape, transform=t, fill=0, dtype=np.uint8)

        sample = {"image": torch.from_numpy(image), "mask": torch.from_numpy(mask.astype(np.int64))}
        if self.transform:
            sample = self.transform(sample)
        return sample
```

---

## Spatial Parameters & Configuration Reference

| Parameter | Type | Valid Range / Values | Spatial Implication |
|---|---|---|---|
| `target_epsg` | `int` | Any PROJ-registered EPSG (e.g. `32618`) | Must match source tile; mixing with `EPSG:4326` shifts annotations sub-pixel |
| Mask dtype | `numpy.dtype` | `uint8` (0–255) | `uint16` wastes storage; float masks corrupt class boundaries |
| Rasterize fill | `int` | `0` | Background class; `255` is the standard "ignore" sentinel |
| Compression | `str` | `"lzw"` or `"deflate"` | Lossless only; JPEG introduces interpolation artifacts |
| Min vertex spacing | `float` (metres) | ≥ 0.5 × GSD | Below GSD produces sub-pixel slivers invisible in training |
| Confidence threshold | `float` | 0.0–1.0 | Labels below 0.6 should be flagged for human review before training |
| Tile overlap | `int` (pixels) | 32–256 px | Required for seamless predictions; must match inference stride |

---

## Edge Cases & Spatial Gotchas

**Silent CRS mismatch between annotation and tile.** `geopandas` will happily join two GeoDataFrames with different CRS without raising an error unless `check_crs=True` is set. The spatial join produces plausible-looking results offset by hundreds of metres. Always assert `gdf.crs.to_epsg() == tile_epsg` before rasterization.

**Self-intersecting polygons from undo/redo in annotation tools.** QGIS's undo stack occasionally produces bowtie polygons. `shapely.is_valid` returns `False`; `make_valid()` splits them into a `MultiPolygon`. Your rasterization loop must handle `MultiPolygon` geometry types or the extra parts are silently dropped.

**Tile boundary clipping corrupts polygons.** Features that span tile edges are clipped to the tile extent during export. The clipped edge becomes a straight line at the tile boundary, introducing artificial edges into training data. Use `gdf.clip(tile_bbox)` and flag boundary-touching features for potential exclusion from loss computation.

**Band order differs between tool and model.** `rasterio` reads tiles as `(C, H, W)` in band-file order, which may be `BGR` for imagery exported from certain platforms. Models pre-trained on RGB ImageNet weights expect `(R, G, B)`. Assert band order by reading the `ColorInterp` metadata and reorder with `np.flip(image, axis=0)` if needed.

**IoU collapse from unprojected coordinates.** Computing [IoU thresholds](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/calculating-iou-thresholds-for-geospatial-object-detection/) on geometries still in `EPSG:4326` produces degree-based areas rather than metric areas. A polygon over a mid-latitude tile will have its area underestimated by ~25–40%. Always reproject to a local metric CRS before any area or IoU calculation.

**Rasterization order determines class priority.** When two polygons overlap, the last one written wins in `rasterize`. Sort your GeoDataFrame by `class_id` descending (or by annotation priority) so that high-priority classes overwrite low-priority background.

---

## Integration & Automation Hooks

### Label Studio export hook

After annotation sessions, a webhook or post-export script should immediately run topology validation before committing:

```python
# label_studio_export_hook.py
import subprocess
import sys

def on_export_complete(export_path: str, target_epsg: int = 32618) -> None:
    """Called by Label Studio export webhook — validates before committing to dataset."""
    result = subprocess.run(
        ["python", "validate_annotations.py", export_path, str(target_epsg)],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Annotation validation failed:\n{result.stderr}")
    print(f"Validation passed: {export_path}")
```

For deeper [Label Studio integration](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/integrating-label-studio-with-geospatial-workflows/) patterns — including project configuration, ML backend wiring, and export format mapping — see the dedicated integration guide.

### DVC pipeline stage

Register vector validation and rasterization as explicit [DVC pipeline](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/) stages so dataset provenance is tracked end-to-end:

```yaml
# dvc.yaml
stages:
  validate_vectors:
    cmd: python validate_annotations.py data/raw_annotations data/validated_annotations
    deps:
      - data/raw_annotations
      - validate_annotations.py
    outs:
      - data/validated_annotations

  rasterize_masks:
    cmd: python rasterize_pipeline.py data/validated_annotations data/tiles data/masks
    deps:
      - data/validated_annotations
      - data/tiles
      - rasterize_pipeline.py
    outs:
      - data/masks
```

This makes every transformation reproducible and enables [rollback strategies](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/rollback-strategies-for-corrupted-spatial-datasets/) when a corrupted batch is detected downstream.

---

## Validation & Testing

Run these checks on every export before annotations enter version control:

```python
import geopandas as gpd
import rasterio
import numpy as np
from pathlib import Path

def assert_annotation_integrity(
    geojson_path: str,
    mask_path: str,
    template_tif: str,
    class_mapping: dict[str, int],
) -> None:
    """Raise AssertionError on any integrity violation."""

    # 1. All vector geometries valid
    gdf = gpd.read_file(geojson_path)
    assert gdf.geometry.is_valid.all(), "Invalid geometries detected — run make_valid()"

    # 2. CRS roundtrip: vector CRS matches tile CRS
    with rasterio.open(template_tif) as src:
        tile_epsg = src.crs.to_epsg()
        tile_transform = src.transform
        tile_shape = src.shape
    assert gdf.crs.to_epsg() == tile_epsg, (
        f"CRS mismatch: annotations={gdf.crs.to_epsg()} tile={tile_epsg}"
    )

    # 3. Mask shape matches tile shape
    with rasterio.open(mask_path) as msrc:
        mask = msrc.read(1)
        assert msrc.crs.to_epsg() == tile_epsg, "Mask CRS mismatch"
        assert msrc.transform == tile_transform, "Mask affine transform mismatch"
    assert mask.shape == tile_shape, f"Mask shape {mask.shape} ≠ tile shape {tile_shape}"

    # 4. Mask contains only known class IDs
    valid_ids = {0, 255} | set(class_mapping.values())
    observed_ids = set(np.unique(mask).tolist())
    unknown = observed_ids - valid_ids
    assert not unknown, f"Mask contains unknown class IDs: {unknown}"

    # 5. Non-empty annotation coverage
    coverage = float((mask > 0).sum()) / mask.size
    assert coverage > 0.001, f"Mask is nearly empty (coverage={coverage:.4f})"

    print(f"All integrity checks passed. Coverage: {coverage:.2%}")
```

Wire this as a pytest fixture or a pre-commit hook:

```bash
# .pre-commit-config.yaml
- repo: local
  hooks:
    - id: annotation-integrity
      name: Annotation integrity check
      entry: python scripts/assert_annotation_integrity.py
      language: python
      files: \.geojson$
```

---

## Decision Matrix: Format Trade-offs

| Criterion | Vector | Raster | Hybrid (recommended) |
|---|---|---|---|
| Storage per tile | Low (KB–MB) | High (MB–GB) | Low (vector on disk) |
| Deep learning compatibility | Needs rasterization | Direct CNN input | Lazy rasterize at load |
| Boundary precision | Sub-pixel | Pixel-grid constrained | Sub-pixel (stored) |
| Editability | High (per-feature) | Low (full regeneration) | High |
| Multi-class support | Attribute table | Integer LUT | Both |
| Preprocessing at training | ~15 ms/tile lazy | None | ~15 ms/tile lazy |
| Versioning & rollback | GeoJSON diffs via DVC | Binary diff (poor) | GeoJSON diffs via DVC |

The hybrid approach — vector annotation stored in version control, lazy rasterization at the data-loader stage — preserves full editability while satisfying model input requirements without duplicate storage.

---

## Related

- [How to Structure GeoJSON for ML Training Datasets](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/vector-vs-raster-annotation-workflows/how-to-structure-geojson-for-ml-training-datasets/) — attribute schema, property typing, and CRS declaration conventions
- [Coordinate Reference Systems in Annotation Pipelines](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) — CRS contract, datum transforms, and automated validation routines
- [Calculating IoU Thresholds for Geospatial Object Detection](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/calculating-iou-thresholds-for-geospatial-object-detection/) — metric-CRS IoU, GSD-based threshold selection
- [Defining ROI Label Taxonomies for Aerial Imagery](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/defining-roi-label-taxonomies-for-aerial-imagery/) — class hierarchy design before annotation begins
- [Rollback Strategies for Corrupted Spatial Datasets](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/rollback-strategies-for-corrupted-spatial-datasets/) — recovering from bad rasterization batches

This workflow is one component of the broader [Geospatial Annotation Fundamentals & Architecture](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/) section, which covers CRS contracts, label taxonomies, confidence scoring, and the full annotation stack for spatial ML pipelines.
