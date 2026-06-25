---
title: "Integrating Label Studio with Geospatial Workflows"
description: "Production guide for connecting Label Studio to spatially aware annotation pipelines: CRS alignment, tile-based imagery ingestion, topology validation, and GeoJSON export with full coordinate reconstruction."
slug: integrating-label-studio-with-geospatial-workflows
type: cluster
breadcrumb:
  - label: "Labeling Workflows & Toolchain Integration"
    url: /labeling-workflows-toolchain-integration/
  - label: "Integrating Label Studio with Geospatial Workflows"
    url: /labeling-workflows-toolchain-integration/integrating-label-studio-with-geospatial-workflows/
datePublished: "2024-11-15"
dateModified: "2026-06-25"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Integrating Label Studio with Geospatial Workflows",
      "description": "Production guide for connecting Label Studio to spatially aware annotation pipelines: CRS alignment, tile-based imagery ingestion, topology validation, and GeoJSON export with full coordinate reconstruction.",
      "datePublished": "2024-11-15",
      "dateModified": "2026-06-25",
      "author": { "@type": "Organization", "name": "Geospatial Annotation" },
      "publisher": { "@type": "Organization", "name": "Geospatial Annotation" }
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://geospatialannotation.com/" },
        { "@type": "ListItem", "position": 2, "name": "Labeling Workflows & Toolchain Integration", "item": "https://geospatialannotation.com/labeling-workflows-toolchain-integration/" },
        { "@type": "ListItem", "position": 3, "name": "Integrating Label Studio with Geospatial Workflows", "item": "https://geospatialannotation.com/labeling-workflows-toolchain-integration/integrating-label-studio-with-geospatial-workflows/" }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Configure Label Studio for Geospatial Annotation Pipelines",
      "description": "Step-by-step process to connect Label Studio to tile servers, align coordinate reference systems, validate topology, and export GeoJSON training data.",
      "step": [
        { "@type": "HowToStep", "position": 1, "name": "Configure a geospatial-aware labeling interface" },
        { "@type": "HowToStep", "position": 2, "name": "Ingest imagery and standardize coordinate systems" },
        { "@type": "HowToStep", "position": 3, "name": "Automate task generation and pre-labeling" },
        { "@type": "HowToStep", "position": 4, "name": "Validate topology and enforce GIS standards" },
        { "@type": "HowToStep", "position": 5, "name": "Export and reconstruct geographic coordinates" },
        { "@type": "HowToStep", "position": 6, "name": "Automate the pipeline with webhooks" }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why do Label Studio polygon exports not align with the source imagery?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Label Studio stores annotations in normalized pixel coordinates (0–1 range relative to image dimensions). You must reconstruct geographic coordinates by multiplying pixel offsets by the tile bounding box extents and then applying a pyproj transformer from the tile's CRS to your target CRS. Skipping this step produces annotations that appear correct in the UI but are spatially meaningless."
          }
        },
        {
          "@type": "Question",
          "name": "Does Label Studio support GeoTIFF files directly?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "No. Label Studio renders imagery through HTTP and has no native GeoTIFF decoder. You must pre-process GeoTIFFs into web-mercator tile pyramids (e.g. via gdal2tiles) and serve them through a tile server. Geospatial metadata must be preserved separately for coordinate reconstruction at export time."
          }
        },
        {
          "@type": "Question",
          "name": "How do I prevent self-intersecting polygons from reaching training data?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Implement a shapely validation middleware as a Label Studio webhook handler. When an annotation is submitted, POST the geometry to your validation endpoint, run shapely.geometry.shape(geom).is_valid, and reject invalid submissions with a descriptive error message before they enter the task queue."
          }
        }
      ]
    }
  ]
}
</script>

# Integrating Label Studio with Geospatial Workflows

[Label Studio](https://labelstud.io/) is a capable general-purpose annotation platform, but geospatial pipelines expose several failure points that don't exist in standard computer vision workflows: browser-incompatible GeoTIFF formats, annotations stored in normalized pixel space rather than projected coordinates, no topology enforcement on polygon exports, and no concept of [coordinate reference system](/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) (CRS) propagation across the labeling→export boundary.

The concrete failure scenario looks like this: an annotator draws a precise polygon outline of a building footprint in the Label Studio UI; the export JSON contains normalized `[0.42, 0.17]`-style coordinates that map correctly to the displayed tile — but not to the Earth. Without a deliberate coordinate reconstruction step, every annotation silently loses its spatial meaning, and IoU computed against ground-truth GeoJSON will collapse to near-zero.

This guide gives you the production workflow to prevent that: tile-based imagery serving, CRS-aligned task ingestion, topology validation middleware, and geographic coordinate reconstruction at export time.

## Prerequisites & Toolchain Alignment

Install and pin the following stack before beginning. Version drift between `pyproj` and PROJ system libraries is a common silent failure source.

```bash
pip install \
  label-studio-sdk==0.0.32 \
  shapely==2.0.4 \
  pyproj==3.6.1 \
  rasterio==1.3.10 \
  geopandas==0.14.4 \
  geojson==3.1.0 \
  requests==2.31.0
```

System dependencies:

```bash
# Debian/Ubuntu
apt-get install gdal-bin libgdal-dev proj-bin proj-data

# macOS
brew install gdal proj
```

Spatial knowledge prerequisites:

- Understanding of [coordinate reference systems in annotation pipelines](/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) — specifically the difference between geographic (`EPSG:4326`), web mercator (`EPSG:3857`), and local UTM projections and when each is appropriate
- Familiarity with [vector vs raster annotation workflows](/geospatial-annotation-fundamentals-architecture/vector-vs-raster-annotation-workflows/) and when polygon labels are preferred over bounding boxes
- Label Studio v1.10+ deployed with persistent storage; API token with `read:task`, `read:annotation`, and `write:export` scopes

For foundational context on building labeling infrastructure, see the [Labeling Workflows & Toolchain Integration](/labeling-workflows-toolchain-integration/) pipeline overview.

---

<svg viewBox="0 0 760 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Label Studio geospatial pipeline: GeoTIFF to Tile Server to Label Studio UI to Webhook Validator to GeoJSON Export" style="width:100%;max-width:760px;display:block;margin:1.5rem auto;">
  <title>Label Studio Geospatial Annotation Pipeline</title>
  <desc>Five-stage pipeline showing GeoTIFF source converted to tile pyramid, served to Label Studio, annotations validated via webhook middleware, then exported as GeoJSON with reconstructed geographic coordinates.</desc>
  <defs>
    <marker id="ls-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor" opacity="0.6"/>
    </marker>
  </defs>
  <!-- Stage boxes -->
  <rect x="8" y="30" width="128" height="80" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.35"/>
  <text x="72" y="62" text-anchor="middle" font-size="11" fill="currentColor" font-family="system-ui,sans-serif" font-weight="600">GeoTIFF</text>
  <text x="72" y="78" text-anchor="middle" font-size="10" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.75">Source Raster</text>
  <text x="72" y="94" text-anchor="middle" font-size="10" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.75">+ CRS metadata</text>
  <rect x="162" y="30" width="128" height="80" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.35"/>
  <text x="226" y="62" text-anchor="middle" font-size="11" fill="currentColor" font-family="system-ui,sans-serif" font-weight="600">Tile Server</text>
  <text x="226" y="78" text-anchor="middle" font-size="10" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.75">gdal2tiles /</text>
  <text x="226" y="94" text-anchor="middle" font-size="10" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.75">TileServer GL</text>
  <rect x="316" y="30" width="128" height="80" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.35"/>
  <text x="380" y="62" text-anchor="middle" font-size="11" fill="currentColor" font-family="system-ui,sans-serif" font-weight="600">Label Studio</text>
  <text x="380" y="78" text-anchor="middle" font-size="10" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.75">Polygon / BBox /</text>
  <text x="380" y="94" text-anchor="middle" font-size="10" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.75">Point annotation</text>
  <rect x="470" y="30" width="128" height="80" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.35"/>
  <text x="534" y="62" text-anchor="middle" font-size="11" fill="currentColor" font-family="system-ui,sans-serif" font-weight="600">Webhook</text>
  <text x="534" y="78" text-anchor="middle" font-size="10" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.75">Topology +</text>
  <text x="534" y="94" text-anchor="middle" font-size="10" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.75">CRS validation</text>
  <rect x="624" y="30" width="128" height="80" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.35"/>
  <text x="688" y="62" text-anchor="middle" font-size="11" fill="currentColor" font-family="system-ui,sans-serif" font-weight="600">GeoJSON</text>
  <text x="688" y="78" text-anchor="middle" font-size="10" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.75">EPSG:4326</text>
  <text x="688" y="94" text-anchor="middle" font-size="10" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.75">training-ready</text>
  <!-- Arrows -->
  <line x1="136" y1="70" x2="158" y2="70" stroke="currentColor" stroke-width="1.5" marker-end="url(#ls-arrow)" opacity="0.6"/>
  <line x1="290" y1="70" x2="312" y2="70" stroke="currentColor" stroke-width="1.5" marker-end="url(#ls-arrow)" opacity="0.6"/>
  <line x1="444" y1="70" x2="466" y2="70" stroke="currentColor" stroke-width="1.5" marker-end="url(#ls-arrow)" opacity="0.6"/>
  <line x1="598" y1="70" x2="620" y2="70" stroke="currentColor" stroke-width="1.5" marker-end="url(#ls-arrow)" opacity="0.6"/>
  <!-- Stage labels below boxes -->
  <text x="72" y="128" text-anchor="middle" font-size="9" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.5">Stage 1</text>
  <text x="226" y="128" text-anchor="middle" font-size="9" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.5">Stage 2</text>
  <text x="380" y="128" text-anchor="middle" font-size="9" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.5">Stage 3</text>
  <text x="534" y="128" text-anchor="middle" font-size="9" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.5">Stage 4</text>
  <text x="688" y="128" text-anchor="middle" font-size="9" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.5">Stage 5</text>
  <!-- Key spatial concern note -->
  <text x="380" y="160" text-anchor="middle" font-size="10" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.55" font-style="italic">Annotations exit as normalized pixel coords — geographic reconstruction required at Stage 5</text>
</svg>

---

## Core Workflow

### Step 1: Configure a Geospatial-Aware Labeling Interface

Label Studio's XML labeling configuration must explicitly declare spatial primitive types. The `<PolygonLabels>`, `<RectangleLabels>`, and `<PointLabels>` tags handle vector geometry, but they require an image context with zoom enabled for high-resolution orthomosaics.

```xml
<View>
  <Image name="geo_image" value="$image_url" zoom="true" zoomControl="true" />
  <PolygonLabels name="geo_polygons" toName="geo_image" fillOpacity="0.3">
    <Label value="building" background="#4CAF50" />
    <Label value="road" background="#2196F3" />
    <Label value="water_body" background="#03A9F4" />
    <Label value="vegetation" background="#8BC34A" />
  </PolygonLabels>
  <RectangleLabels name="geo_rects" toName="geo_image" fillOpacity="0.3">
    <Label value="vehicle" background="#FF9800" />
    <Label value="aircraft" background="#E91E63" />
  </RectangleLabels>
</View>
```

Three configuration rules that prevent silent failures:

- Use `$image_url` pointing to pre-rendered tiles, not raw GeoTIFF paths. Label Studio has no GeoTIFF decoder; the browser receives whatever the URL resolves to.
- Enable `zoomControl="true"` on imagery above 5000×5000 pixels. Without it, browsers often load the full raster into memory and crash.
- Lock your label taxonomy at project creation time. Post-hoc label additions corrupt the annotation-to-class mapping in multi-annotator campaigns. For guidance on defining stable label sets, see [defining ROI label taxonomies for aerial imagery](/geospatial-annotation-fundamentals-architecture/defining-roi-label-taxonomies-for-aerial-imagery/).

### Step 2: Ingest Imagery and Standardize Coordinate Systems

Raw geospatial assets rarely arrive in a browser-renderable format. GeoTIFFs, multi-band rasters, and mosaicked orthophotos require preprocessing into tile pyramids. The ingestion function below produces a Leaflet-compatible tile directory and captures the tile metadata needed for coordinate reconstruction at export time.

```python
import subprocess
import json
from pathlib import Path
import rasterio
from rasterio.warp import transform_bounds
from pyproj import CRS


def ingest_geotiff(
    geotiff_path: str,
    output_dir: str,
    zoom_levels: str = "14-19",
    target_epsg: int = 3857,
) -> dict:
    """
    Convert a GeoTIFF to a web-mercator tile pyramid and return
    spatial metadata required for annotation coordinate reconstruction.

    Args:
        geotiff_path: Absolute path to source GeoTIFF.
        output_dir: Directory for output tile pyramid.
        zoom_levels: GDAL zoom range string, e.g. '14-19'.
        target_epsg: Tile projection (default EPSG:3857 web mercator).

    Returns:
        dict with source_crs, tile_crs, and bounding box in tile CRS.
    """
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    # Read source CRS and bounding box before tiling
    with rasterio.open(geotiff_path) as src:
        source_crs = src.crs.to_epsg()
        bounds_native = src.bounds
        # Reproject bounds to target tile CRS
        bounds_tile = transform_bounds(
            src.crs,
            CRS.from_epsg(target_epsg),
            *bounds_native,
        )

    metadata = {
        "source_crs": f"EPSG:{source_crs}",
        "tile_crs": f"EPSG:{target_epsg}",
        "tile_bounds": {
            "min_x": bounds_tile[0],
            "min_y": bounds_tile[1],
            "max_x": bounds_tile[2],
            "max_y": bounds_tile[3],
        },
    }

    # Write metadata alongside tiles for downstream reconstruction
    meta_path = Path(output_dir) / "spatial_meta.json"
    meta_path.write_text(json.dumps(metadata, indent=2))

    # Generate tile pyramid
    subprocess.run(
        [
            "gdal2tiles.py",
            "-z", zoom_levels,
            "-p", "mercator",
            "-w", "none",
            "--xyz",
            geotiff_path,
            output_dir,
        ],
        check=True,
    )

    return metadata
```

Store `spatial_meta.json` alongside your tiles and attach its contents to every Label Studio task. This metadata is the bridge between Label Studio's pixel-space annotations and geographic coordinates — without it, export reconstruction is impossible.

Standardize on `EPSG:4326` (WGS84) for long-term annotation storage and `EPSG:3857` or local UTM zones for tile rendering. Always log the source CRS and transformation method in task metadata to maintain auditability. For a deeper treatment of CRS selection rules and transformation pipelines, see [coordinate reference systems in annotation pipelines](/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/).

### Step 3: Automate Task Generation and Pre-Labeling

Manual annotation at geospatial scale is economically unviable. The productive pattern is to generate initial masks from a vision foundation model, push them to Label Studio as pre-labeled tasks, and route them to human annotators only for review and correction. This cuts labeling time by 60–80% while preserving spatial accuracy.

```python
import requests
from typing import Any


def build_task_payload(
    image_url: str,
    tile_bounds: dict,
    tile_crs: str,
    source_crs: str,
    prelabels: list[dict] | None = None,
) -> dict:
    """
    Construct a Label Studio task with embedded spatial metadata
    and optional pre-labels from a foundation model.

    Args:
        image_url: URL of the tile or orthomosaic.
        tile_bounds: Bounding box dict with min_x/min_y/max_x/max_y.
        tile_crs: EPSG string of the tile projection.
        source_crs: EPSG string of the original source raster.
        prelabels: Optional list of pre-annotation dicts in Label Studio format.

    Returns:
        Task payload dict ready for the Label Studio API.
    """
    task: dict[str, Any] = {
        "data": {
            "image_url": image_url,
            # Embed spatial metadata as task data fields — accessible in export
            "tile_bounds": tile_bounds,
            "tile_crs": tile_crs,
            "source_crs": source_crs,
        }
    }
    if prelabels:
        task["annotations"] = [{"result": prelabels}]
    return task


def push_tasks(
    tasks: list[dict],
    project_id: int,
    api_token: str,
    base_url: str = "https://your-labelstudio-instance.com",
    batch_size: int = 100,
) -> list[dict]:
    """Batch-upload tasks with exponential backoff on rate limit errors."""
    import time

    headers = {
        "Authorization": f"Token {api_token}",
        "Content-Type": "application/json",
    }
    results = []

    for i in range(0, len(tasks), batch_size):
        batch = tasks[i : i + batch_size]
        for attempt in range(4):
            resp = requests.post(
                f"{base_url}/api/projects/{project_id}/tasks/bulk",
                headers=headers,
                json=batch,
                timeout=30,
            )
            if resp.status_code == 429:
                time.sleep(2 ** attempt)
                continue
            resp.raise_for_status()
            results.extend(resp.json())
            break

    return results
```

For the foundation model pre-labeling step, see [automating pre-labeling with foundation models](/labeling-workflows-toolchain-integration/automating-pre-labeling-with-foundation-models/), which covers SAM-based mask generation with spatial-aware post-processing. Ensure that model output polygons are projected into the same CRS as your tile server before injection — mismatched projections here produce visually plausible but spatially incorrect pre-labels that annotators rarely catch.

### Step 4: Validate Topology and Enforce GIS Standards

Label Studio's UI does not enforce topology. Annotators can draw self-intersecting polygons, open rings, or degenerate multipolygons that pass UI validation but break downstream GIS tooling and inflate false-positive IoU scores. Validation must occur at export time or via a webhook interceptor.

```python
from shapely.geometry import shape
from shapely.validation import explain_validity, make_valid
import logging

logger = logging.getLogger(__name__)


def validate_and_repair_geometry(
    geom_dict: dict,
    auto_repair: bool = True,
) -> tuple[dict | None, str | None]:
    """
    Validate a GeoJSON-style geometry dict. Optionally attempt repair.

    Args:
        geom_dict: GeoJSON geometry dict (type + coordinates).
        auto_repair: If True, attempt make_valid() before rejecting.

    Returns:
        Tuple of (valid_geom_dict or None, error_message or None).
    """
    try:
        geom = shape(geom_dict)
    except Exception as exc:
        return None, f"Parse error: {exc}"

    if geom.is_valid:
        return geom_dict, None

    reason = explain_validity(geom)
    if auto_repair:
        repaired = make_valid(geom)
        if repaired.is_valid and not repaired.is_empty:
            logger.info("Auto-repaired geometry: %s", reason)
            return repaired.__geo_interface__, None
        return None, f"Irreparable: {reason}"

    return None, f"Invalid: {reason}"


def validate_annotation_batch(
    annotations: list[dict],
    auto_repair: bool = True,
) -> tuple[list[dict], list[dict]]:
    """
    Validate a list of annotation dicts containing GeoJSON geometries.

    Returns:
        Tuple of (valid_annotations, rejected_annotations).
    """
    valid, rejected = [], []
    for ann in annotations:
        geom_dict = ann.get("geometry")
        if not geom_dict:
            rejected.append({**ann, "_rejection_reason": "missing geometry"})
            continue
        result, error = validate_and_repair_geometry(geom_dict, auto_repair)
        if result is not None:
            valid.append({**ann, "geometry": result})
        else:
            rejected.append({**ann, "_rejection_reason": error})

    return valid, rejected
```

For teams that require desktop-grade topology enforcement — snapping to shared edges, enforcing minimum polygon area, or validating against a reference cadastral layer — integrating with the [QGIS plugin ecosystem for annotation teams](/labeling-workflows-toolchain-integration/qgis-plugin-ecosystem-for-annotation-teams/) provides a familiar GIS environment for pre-export QA. This hybrid pattern (web-scale annotation speed + desktop GIS rigor) is particularly effective for cadastral and infrastructure mapping campaigns.

### Step 5: Export and Reconstruct Geographic Coordinates

Label Studio exports polygon annotations as normalized coordinates in the range `[0, 100]` (percentages of image width/height), not pixel or geographic coordinates. Reconstruction requires the tile bounding box stored in task metadata.

The y-axis inversion is the most commonly missed detail: Label Studio measures `y_pct` from the top of the image (screen convention), while geographic coordinates increase upward (map convention). Swapping these produces polygons mirrored across the horizontal axis — an error that IoU-based QA can miss entirely if ground-truth labels were authored with the same tool.

<svg viewBox="0 0 680 260" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Coordinate reconstruction diagram: Label Studio pixel space versus geographic space, showing y-axis inversion" style="width:100%;max-width:680px;display:block;margin:1.5rem auto;">
  <title>Label Studio Coordinate Reconstruction — Y-Axis Inversion</title>
  <desc>Two side-by-side coordinate systems. Left: Label Studio image space with y=0 at top-left, increasing downward. Right: Geographic space with y=min at bottom-left, increasing upward. Arrows show the mapping formula applied to convert between them.</desc>
  <defs>
    <marker id="ls-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor" opacity="0.6"/>
    </marker>
  </defs>
  <!-- Left panel: Label Studio space -->
  <rect x="20" y="20" width="280" height="200" rx="4" fill="none" stroke="currentColor" stroke-width="1" opacity="0.25"/>
  <text x="160" y="14" text-anchor="middle" font-size="11" fill="currentColor" font-family="system-ui,sans-serif" font-weight="600" opacity="0.9">Label Studio pixel space</text>
  <!-- origin top-left -->
  <circle cx="40" cy="40" r="3" fill="currentColor" opacity="0.7"/>
  <text x="46" y="38" font-size="9" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.65">(x=0, y=0)</text>
  <!-- x axis -->
  <line x1="40" y1="195" x2="280" y2="195" stroke="currentColor" stroke-width="1" opacity="0.4" marker-end="url(#ls-arrow)"/>
  <text x="200" y="210" font-size="9" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.65">x_pct →</text>
  <!-- y axis (downward) -->
  <line x1="40" y1="40" x2="40" y2="190" stroke="currentColor" stroke-width="1" opacity="0.4" marker-end="url(#ls-arrow)"/>
  <text x="46" y="60" font-size="9" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.65">y_pct ↓ (100)</text>
  <!-- sample point in LS space -->
  <circle cx="170" cy="120" r="5" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.7"/>
  <text x="178" y="118" font-size="9" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.8">(x%=45, y%=40)</text>
  <!-- Right panel: Geographic space -->
  <rect x="380" y="20" width="280" height="200" rx="4" fill="none" stroke="currentColor" stroke-width="1" opacity="0.25"/>
  <text x="520" y="14" text-anchor="middle" font-size="11" fill="currentColor" font-family="system-ui,sans-serif" font-weight="600" opacity="0.9">Geographic space (EPSG:3857)</text>
  <!-- origin bottom-left -->
  <circle cx="400" cy="200" r="3" fill="currentColor" opacity="0.7"/>
  <text x="406" y="215" font-size="9" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.65">(min_x, min_y)</text>
  <!-- x axis -->
  <line x1="400" y1="200" x2="636" y2="200" stroke="currentColor" stroke-width="1" opacity="0.4" marker-end="url(#ls-arrow)"/>
  <text x="560" y="215" font-size="9" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.65">→ E</text>
  <!-- y axis (upward) -->
  <line x1="400" y1="200" x2="400" y2="44" stroke="currentColor" stroke-width="1" opacity="0.4" marker-end="url(#ls-arrow)"/>
  <text x="406" y="56" font-size="9" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.65">↑ N (max_y)</text>
  <!-- sample point in geo space (y is flipped) -->
  <circle cx="504" cy="118" r="5" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.7"/>
  <text x="512" y="116" font-size="9" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.8">(tile_x, tile_y)</text>
  <!-- Conversion formula in centre -->
  <text x="340" y="88" text-anchor="middle" font-size="9" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.55">tile_x =</text>
  <text x="340" y="100" text-anchor="middle" font-size="9" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.55">min_x + (x%/100)·Δx</text>
  <text x="340" y="118" text-anchor="middle" font-size="9" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.55">tile_y =</text>
  <text x="340" y="130" text-anchor="middle" font-size="9" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.55">max_y − (y%/100)·Δy</text>
  <text x="340" y="148" text-anchor="middle" font-size="9" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.45" font-style="italic">↑ inversion</text>
  <!-- connecting arrow -->
  <line x1="310" y1="120" x2="370" y2="120" stroke="currentColor" stroke-width="1.2" marker-end="url(#ls-arrow)" opacity="0.5"/>
</svg>

```python
import pyproj
import geojson as geojson_lib
from shapely.geometry import Polygon


def reconstruct_geographic_coords(
    normalized_points: list[tuple[float, float]],
    tile_bounds: dict,
    tile_crs: str,
    dst_crs: str = "EPSG:4326",
) -> list[tuple[float, float]]:
    """
    Convert Label Studio normalized polygon points to geographic coordinates.

    Label Studio stores points as (x_pct, y_pct) in 0-100 range,
    measured from the top-left corner of the image.

    Args:
        normalized_points: List of (x_pct, y_pct) from Label Studio export.
        tile_bounds: dict with min_x, min_y, max_x, max_y in tile_crs units.
        tile_crs: EPSG string of the tile projection (e.g. 'EPSG:3857').
        dst_crs: Target geographic CRS for export (default 'EPSG:4326').

    Returns:
        List of (lon, lat) tuples in dst_crs.
    """
    transformer = pyproj.Transformer.from_crs(tile_crs, dst_crs, always_xy=True)

    x_range = tile_bounds["max_x"] - tile_bounds["min_x"]
    y_range = tile_bounds["max_y"] - tile_bounds["min_y"]

    geo_coords = []
    for x_pct, y_pct in normalized_points:
        # Label Studio y=0 is top; geospatial y increases upward
        tile_x = tile_bounds["min_x"] + (x_pct / 100.0) * x_range
        tile_y = tile_bounds["max_y"] - (y_pct / 100.0) * y_range
        lon, lat = transformer.transform(tile_x, tile_y)
        geo_coords.append((lon, lat))

    return geo_coords


def export_annotations_to_geojson(
    ls_export: list[dict],
) -> dict:
    """
    Convert a full Label Studio JSON export to a GeoJSON FeatureCollection.

    Each task must have tile_bounds, tile_crs in its data field.
    """
    features = []

    for task in ls_export:
        task_data = task.get("data", {})
        tile_bounds = task_data.get("tile_bounds")
        tile_crs = task_data.get("tile_crs", "EPSG:3857")

        if not tile_bounds:
            continue

        for annotation in task.get("annotations", []):
            for result in annotation.get("result", []):
                if result.get("type") != "polygonlabels":
                    continue

                value = result["value"]
                label = value.get("polygonlabels", ["unknown"])[0]
                raw_points = [(p[0], p[1]) for p in value["points"]]

                geo_coords = reconstruct_geographic_coords(
                    raw_points, tile_bounds, tile_crs
                )
                poly = Polygon(geo_coords)
                features.append(
                    geojson_lib.Feature(
                        geometry=poly.__geo_interface__,
                        properties={
                            "label": label,
                            "task_id": task.get("id"),
                            "annotation_id": annotation.get("id"),
                            "tile_crs": tile_crs,
                        },
                    )
                )

    return geojson_lib.FeatureCollection(features)
```

Adhere to the RFC 7946 GeoJSON specification (coordinates in `EPSG:4326`, right-hand winding order for exterior rings) to ensure interoperability with PostGIS, QGIS, and vector databases. For converting the resulting GeoJSON into COCO or YOLO formats for model training, see [converting Label Studio exports to YOLOv8 format](/labeling-workflows-toolchain-integration/automating-pre-labeling-with-foundation-models/converting-label-studio-exports-to-yolov8-format/) and the broader treatment of [preserving metadata across dataset versions](/dataset-versioning-spatial-data-sync/preserving-metadata-across-dataset-versions/).

### Step 6: Automate the Pipeline with Webhooks

Webhooks eliminate the manual export bottleneck and enforce a "validate-before-persist" contract. Register a webhook in Label Studio that fires on `ANNOTATION_CREATED` and `ANNOTATION_UPDATED` events; your handler validates geometry and writes approved annotations directly to storage.

```python
from flask import Flask, request, jsonify
import logging

app = Flask(__name__)
logger = logging.getLogger(__name__)


@app.route("/webhook/annotation", methods=["POST"])
def handle_annotation_webhook():
    """
    Label Studio webhook handler for annotation events.
    Validates topology and writes valid annotations to object storage.
    """
    payload = request.get_json()
    event_type = payload.get("action")

    if event_type not in ("ANNOTATION_CREATED", "ANNOTATION_UPDATED"):
        return jsonify({"status": "ignored"}), 200

    annotation = payload.get("annotation", {})
    results = annotation.get("result", [])

    valid_results, rejected = [], []
    for result in results:
        if result.get("type") == "polygonlabels":
            # Reconstruct geometry for validation
            # (tile_bounds retrieved from task data in a real implementation)
            geom_dict = {"type": "Polygon", "coordinates": [result["value"]["points"]]}
            validated, error = validate_and_repair_geometry(geom_dict)
            if validated:
                valid_results.append(result)
            else:
                rejected.append({"result_id": result.get("id"), "error": error})
        else:
            valid_results.append(result)

    if rejected:
        logger.warning("Rejected %d invalid geometries: %s", len(rejected), rejected)
        return jsonify({"status": "partial", "rejected": rejected}), 207

    # Persist valid_results to your annotation store here
    logger.info("Persisted %d valid annotation results.", len(valid_results))
    return jsonify({"status": "ok", "accepted": len(valid_results)}), 200
```

## Spatial Parameters & Configuration Reference

| Parameter | Type | Recommended Value | Spatial Implication |
|---|---|---|---|
| `zoom_levels` | string | `"14-19"` | Z14 ≈ 10 m/px (regional), Z19 ≈ 0.3 m/px (parcel-level). Choose max based on GSD of source imagery. |
| `tile_crs` | EPSG string | `"EPSG:3857"` | Web mercator; required for XYZ tile servers and Leaflet compatibility. Do not store annotations in this CRS. |
| `storage_crs` | EPSG string | `"EPSG:4326"` | Long-term annotation storage. Required by RFC 7946 GeoJSON spec. |
| `batch_size` | int | 100–500 | Label Studio API rate limit; larger batches increase timeout risk. |
| `min_polygon_area_m2` | float | Mission-dependent | Urban mapping: ≥ 5 m². Agricultural: ≥ 500 m². Reject degenerate slivers below threshold. |
| `fill_opacity` | float | 0.3 | Lower opacity allows annotators to see underlying imagery through polygon fills. |
| `max_zoom_render` | int | 19 | Beyond Z19, tile server load multiplies by 4× per level. Cache aggressively above Z17. |

## Edge Cases and Spatial Failure Modes

**Datum shift misalignment.** When source imagery uses NAD83 and the tile server projects in WGS84, annotations visually align in the browser but are offset by up to 2 m in the exported GeoJSON. Always verify that `rasterio.open(path).crs` matches your intended tile projection before ingesting. Log EPSG codes at every pipeline stage.

**Normalized coordinate y-axis inversion.** Label Studio measures `y_pct` from the top of the image; geographic coordinates increase upward. Missing the `max_y - (y_pct / 100.0) * y_range` inversion in the reconstruction step produces annotations mirrored across the horizontal axis — a subtle error that IoU-based QA can miss if ground truth was authored in the same tool.

**Self-intersecting polygons from SAM outputs.** Segment Anything Model masks converted to polygons frequently contain self-intersections at concave boundary segments. Run `make_valid()` from shapely on all model outputs before injection into Label Studio. Do not rely on annotators to catch these visually.

**Browser memory exhaustion on large orthomosaics.** Loading a 200 MB orthomosaic via a static URL causes browser crashes on low-RAM devices. Always serve tile pyramids via a CDN-backed tile server; restrict `maxNativeZoom` in your Leaflet config to prevent the browser from requesting sub-pixel tiles.

**Band count mismatch in multi-spectral datasets.** Label Studio renders RGB tiles. If your source imagery is 4-band (RGBNIR) or 8-band multispectral, you must create a separate RGB visualization tile set for annotation while preserving the full-band raster for model training. Embedding the spectral configuration in task metadata prevents downstream band misalignment.

**Annotator disagreement on boundary features.** Roads, field edges, and coastlines are inherently ambiguous at fine scales. Establish explicit rules in your annotation guide for how to handle transitional zones: 50% rule (label predominant cover type), buffer rule (expand features by a fixed distance), or multi-label rule (allow overlapping polygons for ecotone boundaries). Track inter-annotator agreement with [confidence scoring for geospatial labels](/geospatial-annotation-fundamentals-architecture/confidence-scoring-for-geospatial-labels/) to detect label ambiguity early.

## Integration & Automation Hooks

### DVC Pipeline Integration

Version annotation exports alongside model training runs to enable reproducible experiments. Embed the Label Studio project ID and tile CRS in your DVC params so that any replay of the pipeline can reconstruct the exact export:

```yaml
# dvc.yaml
stages:
  export_annotations:
    cmd: python scripts/export_geojson.py --project-id ${LS_PROJECT_ID}
    deps:
      - scripts/export_geojson.py
    outs:
      - data/annotations/latest.geojson
    params:
      - params.yaml:
          - annotation.project_id
          - annotation.tile_crs
```

For full version control patterns on spatial datasets, see [implementing DVC for geospatial training data](/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/).

### CI Gate for Topology Validity

Add a topology validation step to your CI pipeline to prevent invalid geometries from entering training data:

```yaml
# .github/workflows/validate-annotations.yml
name: Validate Annotation Export
on:
  push:
    paths:
      - "data/annotations/**"
jobs:
  topology-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pip install shapely==2.0.4 geopandas==0.14.4
      - name: Validate GeoJSON topology
        run: |
          python -c "
          import geopandas as gpd
          gdf = gpd.read_file('data/annotations/latest.geojson')
          invalid = gdf[~gdf.geometry.is_valid]
          if len(invalid) > 0:
              print(f'FAIL: {len(invalid)} invalid geometries')
              exit(1)
          print(f'PASS: {len(gdf)} geometries valid')
          "
```

## Validation & Testing

Before routing annotations to training, run this verification suite against every export:

```python
import geopandas as gpd
import pyproj
from shapely.geometry import shape


def verify_geojson_export(
    geojson_path: str,
    expected_crs: str = "EPSG:4326",
) -> dict:
    """
    Assert correctness of a geospatial annotation export.

    Checks:
    - All geometries valid (shapely)
    - CRS matches expected
    - No empty geometries
    - Bounding box within valid geographic extent
    - All features have a non-null 'label' property

    Returns:
        dict with pass/fail counts and error details.
    """
    gdf = gpd.read_file(geojson_path)
    results: dict = {"total": len(gdf), "errors": []}

    # CRS check
    if str(gdf.crs.to_epsg()) != expected_crs.split(":")[1]:
        results["errors"].append(
            f"CRS mismatch: expected {expected_crs}, got {gdf.crs}"
        )

    # Geometry validity
    invalid_mask = ~gdf.geometry.is_valid
    if invalid_mask.any():
        results["errors"].append(
            f"{invalid_mask.sum()} invalid geometries at indices: "
            f"{list(gdf.index[invalid_mask])}"
        )

    # Empty geometry check
    empty_mask = gdf.geometry.is_empty
    if empty_mask.any():
        results["errors"].append(f"{empty_mask.sum()} empty geometries")

    # Geographic extent sanity check (WGS84 bounds)
    bounds = gdf.total_bounds  # [minx, miny, maxx, maxy]
    if expected_crs == "EPSG:4326":
        if not (-180 <= bounds[0] <= 180 and -90 <= bounds[1] <= 90):
            results["errors"].append(
                f"Coordinates outside WGS84 extent: {bounds}"
            )

    # Label completeness
    if "label" in gdf.columns:
        null_labels = gdf["label"].isna().sum()
        if null_labels > 0:
            results["errors"].append(f"{null_labels} features missing 'label'")

    results["passed"] = len(results["errors"]) == 0
    return results


# CRS roundtrip test
def test_crs_roundtrip(
    src_crs: str = "EPSG:3857",
    dst_crs: str = "EPSG:4326",
) -> bool:
    """Assert that forward + inverse CRS transformation is lossless within 1 cm."""
    t_fwd = pyproj.Transformer.from_crs(src_crs, dst_crs, always_xy=True)
    t_inv = pyproj.Transformer.from_crs(dst_crs, src_crs, always_xy=True)

    # Test with a known London coordinate in EPSG:3857
    x_orig, y_orig = -13_580.0, 6_711_140.0
    lon, lat = t_fwd.transform(x_orig, y_orig)
    x_back, y_back = t_inv.transform(lon, lat)

    tolerance_m = 0.01  # 1 cm
    return abs(x_back - x_orig) < tolerance_m and abs(y_back - y_orig) < tolerance_m
```

For annotation change tracking and SHA-based integrity checks across dataset versions, see [tracking annotation changes with SHA hashing](/dataset-versioning-spatial-data-sync/tracking-annotation-changes-with-sha-hashing/).

---

This workflow is one component of the broader [Labeling Workflows & Toolchain Integration](/labeling-workflows-toolchain-integration/) pipeline, which covers CVAT setup, QGIS plugin workflows, foundation model pre-labeling, and [human-in-the-loop validation cycles](/labeling-workflows-toolchain-integration/human-in-the-loop-validation-cycles/).

**Related**

- [Step-by-step CVAT setup for drone imagery annotation](/labeling-workflows-toolchain-integration/integrating-label-studio-with-geospatial-workflows/step-by-step-cvat-setup-for-drone-imagery-annotation/) — CVAT as an alternative platform with native 3D and LiDAR support
- [QGIS plugin ecosystem for annotation teams](/labeling-workflows-toolchain-integration/qgis-plugin-ecosystem-for-annotation-teams/) — desktop GIS topology enforcement and snapping tools
- [Automating pre-labeling with foundation models](/labeling-workflows-toolchain-integration/automating-pre-labeling-with-foundation-models/) — SAM and vision transformer pre-labeling for geospatial tasks
- [Coordinate reference systems in annotation pipelines](/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) — CRS selection, datum shifts, and EPSG code reference
- [Preserving metadata across dataset versions](/dataset-versioning-spatial-data-sync/preserving-metadata-across-dataset-versions/) — how to carry CRS, label taxonomy, and geotransform metadata through dataset exports
