---
title: "Embedding Geotransform Metadata in COCO Exports"
description: "Attach the affine geotransform and EPSG code to COCO exports via a sidecar and custom fields so pixel-space detections can be reprojected to real-world coordinates at inference time."
slug: "embedding-geotransform-metadata-in-coco-exports"
type: "tutorial"
breadcrumb:
  - label: "Home"
    url: "/"
  - label: "Dataset Versioning & Spatial Data Sync"
    url: "/dataset-versioning-spatial-data-sync/"
  - label: "Preserving Metadata Across Dataset Versions"
    url: "/dataset-versioning-spatial-data-sync/preserving-metadata-across-dataset-versions/"
  - label: "Embedding Geotransform Metadata in COCO Exports"
    url: "/dataset-versioning-spatial-data-sync/preserving-metadata-across-dataset-versions/embedding-geotransform-metadata-in-coco-exports/"
datePublished: "2026-07-13"
dateModified: "2026-07-13"
schema:
  - Article
  - BreadcrumbList
  - HowTo
  - FAQPage
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Embedding Geotransform Metadata in COCO Exports",
      "description": "Attach the affine geotransform and EPSG code to COCO exports via a sidecar and custom fields so pixel-space detections can be reprojected to real-world coordinates at inference time.",
      "datePublished": "2026-07-13",
      "dateModified": "2026-07-13",
      "author": {"@type": "Organization", "name": "Geospatial Annotation"},
      "publisher": {"@type": "Organization", "name": "Geospatial Annotation"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.geospatialannotation.com/"},
        {"@type": "ListItem", "position": 2, "name": "Dataset Versioning & Spatial Data Sync", "item": "https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/"},
        {"@type": "ListItem", "position": 3, "name": "Preserving Metadata Across Dataset Versions", "item": "https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/preserving-metadata-across-dataset-versions/"},
        {"@type": "ListItem", "position": 4, "name": "Embedding Geotransform Metadata in COCO Exports", "item": "https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/preserving-metadata-across-dataset-versions/embedding-geotransform-metadata-in-coco-exports/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Embedding Geotransform Metadata in COCO Exports",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Read the affine transform and CRS from each tile", "text": "Open each tile Cloud-Optimized GeoTIFF with rasterio and read its six-coefficient affine geotransform and EPSG code so every COCO image can carry its own georeference."},
        {"@type": "HowToStep", "position": 2, "name": "Inject transform and crs into COCO image records", "text": "Add custom transform and crs fields to each entry in the COCO images array, serialising the affine as a list of six floats and the CRS as an EPSG authority string."},
        {"@type": "HowToStep", "position": 3, "name": "Write a sidecar manifest", "text": "Emit a separate JSON sidecar keyed by image id that duplicates the geotransform and CRS, so georeference survives even when a downstream tool strips unknown COCO fields."},
        {"@type": "HowToStep", "position": 4, "name": "Reproject a pixel bbox to world coordinates", "text": "At inference, apply the stored affine to the pixel corners of each detection and reproject the resulting map coordinates to the target CRS with pyproj."},
        {"@type": "HowToStep", "position": 5, "name": "Verify the roundtrip", "text": "Transform a known pixel back to world coordinates and compare against the tile's expected bounds to confirm axis order and CRS are correct before trusting the export."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why does the standard COCO format not preserve geospatial coordinates?",
          "acceptedAnswer": {"@type": "Answer", "text": "The COCO specification defines images purely in pixel space: an image has width, height, and file_name, and bounding boxes are [x, y, width, height] in pixels with the origin at the top-left corner. There is no field for a coordinate reference system or an affine geotransform, so once imagery is tiled and exported the link between a pixel and its real-world position on Earth is lost. You must add that link yourself through custom fields and a sidecar manifest."}
        },
        {
          "@type": "Question",
          "name": "What are the six coefficients of an affine geotransform?",
          "acceptedAnswer": {"@type": "Answer", "text": "In rasterio the affine is (a, b, c, d, e, f). c and f are the map x and y of the top-left corner of the top-left pixel; a is the pixel width in map units and e is the pixel height, which is normally negative because image rows increase downward while map y increases upward; b and d are rotation and shear terms that are zero for a north-up image. World x equals a*col + b*row + c and world y equals d*col + e*row + f."}
        },
        {
          "@type": "Question",
          "name": "Should I store the geotransform on each image or once for the whole dataset?",
          "acceptedAnswer": {"@type": "Answer", "text": "Store it per image. Tiles cut from a large mosaic each have a different top-left origin even when they share a pixel size and CRS, so a single dataset-level transform only works for a single untiled scene. Attaching the affine to every COCO image record keeps each tile independently georeferenceable and survives shuffling, filtering, and re-splitting of the dataset."}
        },
        {
          "@type": "Question",
          "name": "Do I still need a sidecar if I add custom COCO fields?",
          "acceptedAnswer": {"@type": "Answer", "text": "Yes. Many COCO parsers silently drop keys they do not recognise when they load and re-serialise a file, so custom transform and crs fields can disappear after a single roundtrip through a training or augmentation tool. The sidecar manifest is a plain JSON file keyed by image id that no COCO-aware tool touches, giving you a durable second copy of the georeference to fall back on."}
        }
      ]
    }
  ]
}
</script>

# Embedding Geotransform Metadata in COCO Exports

COCO is a pixel-space annotation format: an image record carries only `width`, `height`, and `file_name`, and every bounding box is `[x, y, width, height]` measured in pixels from the top-left corner. It has no notion of a coordinate reference system and no place to store an affine geotransform, so the moment you tile satellite or drone imagery and export labels to COCO, each detection is stranded in pixel coordinates with no way back to a position on Earth. The fix is to attach two pieces of georeference to every image: the tile's six-coefficient affine geotransform and its EPSG code, written both as custom fields on the COCO `image` record and into a standalone sidecar manifest. With those in place, a pixel bounding box produced at inference can be run through the affine and reprojected to real-world map coordinates.

## Why Pixel-Space Detections Need Georeference

A model trained on COCO tiles predicts boxes in pixels relative to the tile it saw. That is fine while you stay inside the tile, but any downstream use — writing detections into a GIS layer, deduplicating objects across overlapping tiles, measuring real areas, or joining to parcel data — needs the box expressed in a metric or geographic coordinate reference system. Without the affine transform, a box at pixel column 512, row 340 is unmoored: you cannot tell whether it sits at `EPSG:32633` easting 500 000 or somewhere a thousand kilometres away, and you cannot even establish which way the y-axis runs.

The affine geotransform is the missing bridge. It is a compact six-number mapping from `(column, row)` pixel indices to `(x, y)` map coordinates in the tile's CRS. Store it next to the pixel labels and the export becomes self-describing: any consumer can reconstruct the world position of a detection from the tile it came from. Keeping that context bound to each versioned snapshot is exactly the discipline that [preserving metadata across dataset versions](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/preserving-metadata-across-dataset-versions/) is built around — a COCO file that has lost its geotransform is not reproducible, no matter how carefully the imagery itself is hashed.

<svg viewBox="0 0 720 320" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Flow from a COCO image record and geotransform sidecar through a pixel bounding box to real-world coordinates" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>From COCO pixel box to world coordinates via the geotransform sidecar</title>
  <desc>A COCO image record and a geotransform sidecar supply the affine and CRS. A pixel bounding box is passed through the affine transform, producing map coordinates, which are reprojected to a target CRS to give real-world longitude and latitude.</desc>
  <defs>
    <marker id="ah" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto">
      <polygon points="0 0, 9 3.5, 0 7" fill="currentColor" opacity="0.55"/>
    </marker>
  </defs>
  <!-- COCO image record -->
  <rect x="12" y="24" width="196" height="104" rx="7" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>
  <text x="110" y="46" text-anchor="middle" font-size="12" fill="currentColor" opacity="0.9" font-family="sans-serif" font-weight="bold">COCO image record</text>
  <text x="26" y="68" font-size="10" fill="currentColor" opacity="0.6" font-family="monospace">"id": 7</text>
  <text x="26" y="84" font-size="10" fill="currentColor" opacity="0.6" font-family="monospace">"file_name": "t_07.tif"</text>
  <text x="26" y="100" font-size="10" fill="currentColor" opacity="0.6" font-family="monospace">"width": 1024</text>
  <text x="26" y="116" font-size="10" fill="currentColor" opacity="0.6" font-family="monospace">"transform": [...], "crs"</text>
  <!-- Sidecar -->
  <rect x="12" y="150" width="196" height="86" rx="7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="6 3" opacity="0.4"/>
  <text x="110" y="172" text-anchor="middle" font-size="12" fill="currentColor" opacity="0.9" font-family="sans-serif" font-weight="bold">Geotransform sidecar</text>
  <text x="26" y="194" font-size="10" fill="currentColor" opacity="0.6" font-family="monospace">a,b,c,d,e,f  (affine)</text>
  <text x="26" y="210" font-size="10" fill="currentColor" opacity="0.6" font-family="monospace">"epsg": 32633</text>
  <text x="26" y="226" font-size="10" fill="currentColor" opacity="0.55" font-family="monospace">keyed by image id</text>
  <!-- Pixel bbox -->
  <rect x="266" y="86" width="150" height="86" rx="7" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>
  <text x="341" y="108" text-anchor="middle" font-size="12" fill="currentColor" opacity="0.9" font-family="sans-serif" font-weight="bold">Pixel bbox</text>
  <text x="341" y="130" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6" font-family="monospace">[x, y, w, h]</text>
  <text x="341" y="150" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.55" font-family="sans-serif">col / row, top-left origin</text>
  <!-- Affine box -->
  <rect x="470" y="86" width="150" height="86" rx="7" fill="currentColor" fill-opacity="0.08" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="545" y="108" text-anchor="middle" font-size="12" fill="currentColor" opacity="0.9" font-family="sans-serif" font-weight="bold">Map coords</text>
  <text x="545" y="130" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6" font-family="monospace">x = a·col + c</text>
  <text x="545" y="146" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6" font-family="monospace">y = e·row + f</text>
  <text x="545" y="162" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.55" font-family="sans-serif">tile CRS metres</text>
  <!-- World coords -->
  <rect x="470" y="216" width="150" height="80" rx="7" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>
  <text x="545" y="244" text-anchor="middle" font-size="12" fill="currentColor" opacity="0.9" font-family="sans-serif" font-weight="bold">World coords</text>
  <text x="545" y="266" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6" font-family="monospace">lon, lat</text>
  <text x="545" y="284" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.55" font-family="sans-serif">reprojected, EPSG:4326</text>
  <!-- Arrows -->
  <line x1="208" y1="90" x2="264" y2="120" stroke="currentColor" stroke-width="1.5" opacity="0.5" marker-end="url(#ah)"/>
  <line x1="208" y1="190" x2="264" y2="140" stroke="currentColor" stroke-width="1.5" opacity="0.5" marker-end="url(#ah)"/>
  <line x1="416" y1="129" x2="468" y2="129" stroke="currentColor" stroke-width="1.5" opacity="0.5" marker-end="url(#ah)"/>
  <line x1="545" y1="172" x2="545" y2="214" stroke="currentColor" stroke-width="1.5" opacity="0.5" marker-end="url(#ah)"/>
  <text x="437" y="122" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.5" font-family="sans-serif">affine</text>
  <text x="560" y="196" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.5" font-family="sans-serif">pyproj</text>
</svg>

## Reading, Injecting, and Reversing the Geotransform

Pin the two libraries this workflow depends on:

```bash
pip install rasterio==1.3.10 pyproj==3.6.1
```

### Step 1 — Read the Transform and CRS from Each Tile

Each tile is a Cloud-Optimized GeoTIFF, and `rasterio` exposes both the affine transform and the coordinate reference system directly. Read them once per tile and normalise the affine into the six-float form COCO can serialise:

```python
from __future__ import annotations

from pathlib import Path

import rasterio
from rasterio.transform import Affine


def read_georeference(tile_path: Path) -> tuple[list[float], int]:
    """Return the six affine coefficients and the EPSG code for a tile COG.

    The affine is ordered (a, b, c, d, e, f) where c/f are the map
    coordinates of the top-left corner and a/e are the pixel sizes.
    """
    with rasterio.open(tile_path) as src:
        aff: Affine = src.transform
        if src.crs is None:
            raise ValueError(f"{tile_path} has no CRS; cannot georeference")
        epsg: int | None = src.crs.to_epsg()
        if epsg is None:
            raise ValueError(f"{tile_path} CRS is not an EPSG authority code")
    coefficients: list[float] = [aff.a, aff.b, aff.c, aff.d, aff.e, aff.f]
    return coefficients, epsg
```

### Step 2 — Inject `transform` and `crs` into the COCO Image Records

The COCO `images` array is a list of dictionaries. Walk it, match each entry to its source tile by `file_name`, and add two custom keys. Serialising the CRS as an EPSG authority string keeps it unambiguous; the first `EPSG:` code here refers back to the wider mechanics of a [coordinate reference system in an annotation pipeline](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/):

```python
import json


def enrich_coco_images(coco: dict, tile_dir: Path) -> dict:
    """Add `transform` (6 floats) and `crs` (EPSG:xxxx) to every image record."""
    for image in coco["images"]:
        tile_path = tile_dir / image["file_name"]
        coefficients, epsg = read_georeference(tile_path)
        image["transform"] = coefficients
        image["crs"] = f"EPSG:{epsg}"
    return coco


def load_coco(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)
```

An enriched image record now looks like this — the two custom keys sit alongside the standard COCO fields and are ignored by tools that do not understand them:

```json
{
  "id": 7,
  "file_name": "tile_07.tif",
  "width": 1024,
  "height": 1024,
  "transform": [0.5, 0.0, 500000.0, 0.0, -0.5, 5300000.0],
  "crs": "EPSG:32633"
}
```

### Step 3 — Write a Sidecar Manifest

Custom COCO keys are fragile: many loaders discard unknown fields when they re-serialise a file, so the georeference can vanish after one pass through an augmentation or training tool. Emit a sidecar keyed by image `id` as an independent, durable copy. Content-addressed sidecars like this are the same artifacts that [DVC versioning](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/) tracks alongside the imagery, so the georeference travels with every dataset snapshot:

```python
def write_sidecar(coco: dict, sidecar_path: Path) -> None:
    """Write a georeference manifest keyed by COCO image id."""
    manifest: dict[str, dict[str, object]] = {}
    for image in coco["images"]:
        manifest[str(image["id"])] = {
            "file_name": image["file_name"],
            "transform": image["transform"],
            "crs": image["crs"],
        }
    with sidecar_path.open("w", encoding="utf-8") as fh:
        json.dump({"version": 1, "images": manifest}, fh, indent=2)
```

### Step 4 — Reproject a Pixel Bounding Box to World Coordinates

At inference the model returns a pixel box `[x, y, w, h]`. Rebuild the tile's affine from the stored six floats, apply it to the box corners to get map coordinates in the tile CRS, then reproject to your target CRS with `pyproj`. Passing `always_xy=True` forces `(x, y)` / `(lon, lat)` ordering and sidesteps the most common axis-order trap:

```python
from rasterio.transform import Affine
from pyproj import Transformer


def pixel_bbox_to_world(
    bbox_xywh: tuple[float, float, float, float],
    transform: list[float],
    src_crs: str,
    dst_crs: str = "EPSG:4326",
) -> tuple[float, float, float, float]:
    """Map a COCO pixel bbox to a world-coordinate bbox (min_x, min_y, max_x, max_y).

    `transform` is the six-float affine stored on the COCO image record.
    """
    x, y, w, h = bbox_xywh
    aff = Affine(*transform)

    # Column/row corners -> map coordinates in the tile CRS.
    top_left_x, top_left_y = aff * (x, y)
    bot_right_x, bot_right_y = aff * (x + w, y + h)

    transformer = Transformer.from_crs(src_crs, dst_crs, always_xy=True)
    wx1, wy1 = transformer.transform(top_left_x, top_left_y)
    wx2, wy2 = transformer.transform(bot_right_x, bot_right_y)

    return (min(wx1, wx2), min(wy1, wy2), max(wx1, wx2), max(wy1, wy2))
```

### Step 5 — Verify the Roundtrip Before You Trust It

A one-line sanity check catches a flipped axis or a forgotten CRS before it silently corrupts thousands of detections. Feed the tile's own top-left pixel `(0, 0)` through the affine and confirm it lands on the coordinates stored as `c` and `f`:

```python
def verify_origin(transform: list[float]) -> bool:
    """The affine applied to pixel (0, 0) must return (c, f)."""
    aff = Affine(*transform)
    ox, oy = aff * (0, 0)
    return abs(ox - transform[2]) < 1e-6 and abs(oy - transform[5]) < 1e-6
```

## Geotransform Field Reference

Each entry you add to the COCO image record and the sidecar has a precise meaning. Getting any of them wrong shifts every detection on the tile.

| Field | Meaning |
|---|---|
| `a` (coefficient 0) | Pixel width in map units — positive, the ground distance covered by one column step |
| `b` (coefficient 1) | Row rotation term — `0.0` for a north-up tile; non-zero only for rotated imagery |
| `c` (coefficient 2) | Map x of the top-left corner of the top-left pixel — the tile's x origin |
| `d` (coefficient 3) | Column rotation term — `0.0` for a north-up tile |
| `e` (coefficient 4) | Pixel height in map units — normally negative because rows increase downward while map y increases upward |
| `f` (coefficient 5) | Map y of the top-left corner of the top-left pixel — the tile's y origin |
| `crs` | EPSG authority string (e.g. `EPSG:32633`) naming the CRS the affine outputs into |

## Common Errors and Fixes

**Longitude and latitude come out swapped after reprojection**
Root cause: `pyproj` respects the authority axis order, and geographic CRS definitions like `EPSG:4326` declare latitude first, so a transformer built without `always_xy=True` returns `(lat, lon)`.
Fix: always construct the transformer with `Transformer.from_crs(src, dst, always_xy=True)` so it consumes and emits `(x, y)` / `(lon, lat)` order.

**World coordinates are correct in metres but land in the wrong hemisphere or continent**
Root cause: the affine was applied but the CRS was never recorded, so a consumer assumed the wrong EPSG and interpreted UTM easting/northing as if they were another zone or as raw degrees.
Fix: store `crs` on every image record and in the sidecar, and reject any tile whose `src.crs.to_epsg()` returns `None` rather than exporting an unlabelled affine.

**Every box is offset by roughly the tile height, or the y-axis is mirrored**
Root cause: the affine was applied with row and column swapped — `aff * (row, col)` instead of `aff * (col, row)`. The affine expects `(column, row)`, i.e. `(x, y)` in pixel space, not `(row, col)` array indexing order.
Fix: pass the COCO bbox as `(x, y)` — column then row — and remember `e` is negative, so a larger row index correctly yields a smaller map y.

## Related

- [Preserving Metadata Across Dataset Versions](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/preserving-metadata-across-dataset-versions/) — the topic area this guide sits within, covering how CRS, geotransform, and acquisition context stay bound to each versioned snapshot
- [COCO vs GeoParquet for Annotation Export](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/validating-annotation-export-formats/coco-vs-geoparquet-for-annotation-export/) — when a georeferenced COCO export is enough and when a natively spatial format serves the pipeline better
- [Coordinate Reference Systems in Annotation Pipelines](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) — the CRS contracts and reprojection patterns that the affine and EPSG code depend on
- [Implementing DVC for Geospatial Training Data](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/) — track the sidecar manifest alongside imagery so georeference is reproducible across versions

This guide is part of the broader [Preserving Metadata Across Dataset Versions](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/preserving-metadata-across-dataset-versions/) topic area within [Dataset Versioning & Spatial Data Sync](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/).
