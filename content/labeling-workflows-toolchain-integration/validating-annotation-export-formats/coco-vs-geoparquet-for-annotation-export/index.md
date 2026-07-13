---
title: "COCO vs GeoParquet for Annotation Export"
description: "A decision guide comparing COCO JSON and GeoParquet for exporting geospatial annotations: CRS fidelity, query performance, file size, and interoperability with ML training vs spatial analytics."
slug: "coco-vs-geoparquet-for-annotation-export"
type: "tutorial"
breadcrumb:
  - label: "Home"
    url: "/"
  - label: "Labeling Workflows & Toolchain Integration"
    url: "/labeling-workflows-toolchain-integration/"
  - label: "Validating Annotation Export Formats"
    url: "/labeling-workflows-toolchain-integration/validating-annotation-export-formats/"
  - label: "COCO vs GeoParquet for Annotation Export"
    url: "/labeling-workflows-toolchain-integration/validating-annotation-export-formats/coco-vs-geoparquet-for-annotation-export/"
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
      "headline": "COCO vs GeoParquet for Annotation Export",
      "description": "A decision guide comparing COCO JSON and GeoParquet for exporting geospatial annotations: CRS fidelity, query performance, file size, and interoperability with ML training vs spatial analytics.",
      "datePublished": "2026-07-13",
      "dateModified": "2026-07-13",
      "author": {"@type": "Organization", "name": "Geospatial Annotation"},
      "publisher": {"@type": "Organization", "name": "Geospatial Annotation"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.geospatialannotation.com/"},
        {"@type": "ListItem", "position": 2, "name": "Labeling Workflows & Toolchain Integration", "item": "https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/"},
        {"@type": "ListItem", "position": 3, "name": "Validating Annotation Export Formats", "item": "https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/validating-annotation-export-formats/"},
        {"@type": "ListItem", "position": 4, "name": "COCO vs GeoParquet for Annotation Export", "item": "https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/validating-annotation-export-formats/coco-vs-geoparquet-for-annotation-export/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Export geospatial annotations as GeoParquet and derive a COCO training file",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Write annotations to GeoParquet with an embedded CRS", "text": "Build a GeoDataFrame of label geometries, set its CRS explicitly, and write it to GeoParquet so the coordinate reference system and column schema travel with the file."},
        {"@type": "HowToStep", "position": 2, "name": "Define the image geotransform", "text": "Record the affine geotransform and target EPSG code for each image tile so world coordinates can be mapped deterministically to pixel coordinates."},
        {"@type": "HowToStep", "position": 3, "name": "Project GeoParquet geometries into pixel space", "text": "Reproject each feature into the image CRS, apply the inverse geotransform to convert metres to pixels, and emit COCO bbox and segmentation entries."},
        {"@type": "HowToStep", "position": 4, "name": "Assemble and write the derived COCO JSON", "text": "Group per-image annotations under COCO images, annotations, and categories arrays and serialise the derived training artifact to disk."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Can COCO JSON store real-world coordinates?",
          "acceptedAnswer": {"@type": "Answer", "text": "Not in its standard schema. COCO bbox and segmentation values are pixel offsets relative to the top-left of an image, with no CRS field and no affine geotransform. You can attach a geotransform and EPSG code through a sidecar file or custom keys, but off-the-shelf training loops ignore them, so any georeferencing you add is advisory rather than enforced by the format."}
        },
        {
          "@type": "Question",
          "name": "Why keep GeoParquet as the source of truth instead of COCO?",
          "acceptedAnswer": {"@type": "Answer", "text": "GeoParquet retains the CRS, supports mixed geometry types, and can be queried with columnar predicate pushdown across millions of features without loading the whole file. COCO flattens everything to pixel space and must be parsed in full as a single JSON document. Keeping GeoParquet authoritative lets you run spatial joins and analytics on the same labels you train from, and regenerate COCO deterministically whenever the tiling or image set changes."}
        },
        {
          "@type": "Question",
          "name": "Is GeoParquet slower to read than COCO JSON?",
          "acceptedAnswer": {"@type": "Answer", "text": "For anything beyond a few thousand annotations GeoParquet is faster. It is a binary columnar format with compression, statistics, and row-group skipping, so a filtered read touches only the relevant columns and row groups. COCO JSON is a single text document that must be fully deserialised into Python objects before you can select a subset, and its memory footprint grows with the entire file rather than the query."}
        },
        {
          "@type": "Question",
          "name": "Do I need both formats in one pipeline?",
          "acceptedAnswer": {"@type": "Answer", "text": "Most geospatial teams do. GeoParquet is the durable, georeferenced record that survives re-tiling and cross-sensor joins, while COCO is a disposable, per-experiment artifact consumed by a detector or segmenter. Treat COCO as a build output derived from GeoParquet, version the GeoParquet, and regenerate COCO on demand rather than editing it by hand."}
        }
      ]
    }
  ]
}
</script>

# COCO vs GeoParquet for Annotation Export

Choose **COCO** when the immediate consumer is an off-the-shelf detector or segmenter training loop that expects pixel-space bounding boxes and masks with no notion of a coordinate reference system. Choose **GeoParquet** when the annotations must stay georeferenced — so they can participate in spatial joins, cross-sensor analytics, and large-scale columnar queries — and when the label store has to outlive any single training experiment. The two formats are not competitors in a well-designed pipeline: the durable answer for most geospatial teams is to keep GeoParquet as the source of truth and generate COCO as a derived training artifact, regenerated deterministically whenever the tiling scheme or image set changes.

## Why the Export Format Decision Outlasts the Model

The format you export to encodes an assumption about what the annotations are *for*. COCO was designed for natural-image object detection, where a photograph has no georeference and a box is defined purely in image pixels. That assumption is baked into its schema: `bbox` is `[x, y, width, height]` in pixels, `segmentation` is a polygon or RLE mask in pixels, and there is no field anywhere for a CRS, a datum, or an affine geotransform. Export straight to COCO and you have silently thrown away the one property that made your labels geospatial — the ability to know *where on Earth* each object sits.

That loss is invisible until the second use case arrives. A model retrains on a new acquisition, someone needs to join detections against a parcel boundary layer, or an auditor asks which annotations fall inside a flood zone. If COCO is your only record, every one of those questions requires reconstructing the geotransform you discarded, and if the imagery was re-tiled in between, the pixel coordinates no longer map to anything. GeoParquet inverts the failure mode: it stores geometries in a real [coordinate reference system](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/), so the labels remain meaningful independent of any particular image grid, and the pixel-space COCO file becomes a cheap, reproducible projection of them rather than the primary record.

## Dimension-by-Dimension Comparison

The table below contrasts the two formats across the properties that actually decide a geospatial export. Read it as *COCO is optimised for direct training ingestion; GeoParquet is optimised for durability, scale, and spatial reasoning.*

| Dimension | COCO JSON | GeoParquet |
|---|---|---|
| CRS fidelity | None — pixel coordinates only; CRS must be bolted on via sidecar | Native — CRS stored in file metadata (WKT/PROJJSON) |
| Geometry types | Axis-aligned bbox + polygon/RLE mask, pixel space | Point, LineString, Polygon, Multi\* and mixed collections in world coordinates |
| File size | Verbose UTF-8 text; grows fast with dense masks | Binary columnar with compression; typically 3–10× smaller |
| Read speed | Whole document parsed into memory before any subset | Row-group skipping + column pruning; partial reads are cheap |
| Tooling | pycocotools, most detectors/segmenters out of the box | geopandas, pyarrow, DuckDB, QGIS, GDAL, Spark |
| Streaming | Poor — single JSON blob, no random access | Strong — row groups readable independently, predicate pushdown |
| Schema enforcement | Convention only; validated externally with JSON Schema | Arrow schema + typed columns enforced at write time |

Two rows deserve emphasis. **Schema enforcement**: GeoParquet carries a typed Arrow schema, so a column declared as `int64` cannot silently hold a string, whereas COCO's structure is a convention you must police yourself — which is exactly why teams wrap COCO exports in a validation gate. **Streaming**: because GeoParquet row groups are independently readable, a spatial query over ten million features can skip everything outside its bounding box, while a COCO file of the same content must be deserialised in full before the first annotation is accessible.

<svg viewBox="0 0 640 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Diagram showing GeoParquet as the georeferenced source of truth that both feeds spatial analytics and derives a pixel-space COCO training file" style="width:100%;max-width:640px;display:block;margin:1.5rem auto;">
  <title>GeoParquet source of truth deriving a COCO training artifact</title>
  <desc>A GeoParquet store on the left, holding CRS-aware geometries, branches into two paths. The upper path keeps the data georeferenced for spatial joins and analytics. The lower path passes through a projection step that applies the inverse geotransform to produce a pixel-space COCO file for detector and segmenter training.</desc>
  <defs>
    <marker id="ah" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto">
      <polygon points="0 0, 9 3.5, 0 7" fill="currentColor" opacity="0.55"/>
    </marker>
  </defs>
  <!-- Source of truth -->
  <rect x="20" y="108" width="180" height="92" rx="8" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-width="2" opacity="0.8"/>
  <text x="110" y="140" text-anchor="middle" font-size="15" fill="currentColor" font-family="sans-serif" font-weight="bold">GeoParquet</text>
  <text x="110" y="160" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.7" font-family="sans-serif">source of truth</text>
  <text x="110" y="177" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.7" font-family="sans-serif">CRS-aware · versioned</text>
  <!-- Upper path: analytics -->
  <line x1="200" y1="132" x2="426" y2="72" stroke="currentColor" stroke-width="1.6" opacity="0.5" marker-end="url(#ah)"/>
  <text x="300" y="92" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.55" font-family="sans-serif">keep georeferenced</text>
  <rect x="432" y="36" width="188" height="74" rx="8" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>
  <text x="526" y="66" text-anchor="middle" font-size="12.5" fill="currentColor" opacity="0.85" font-family="sans-serif" font-weight="bold">Spatial joins</text>
  <text x="526" y="85" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.6" font-family="sans-serif">&amp; analytics</text>
  <!-- Lower path: derive -->
  <line x1="200" y1="176" x2="246" y2="222" stroke="currentColor" stroke-width="1.6" opacity="0.5" marker-end="url(#ah)"/>
  <rect x="252" y="196" width="156" height="66" rx="8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="6 3" opacity="0.5"/>
  <text x="330" y="223" text-anchor="middle" font-size="12" fill="currentColor" opacity="0.8" font-family="sans-serif" font-weight="bold">derive</text>
  <text x="330" y="241" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6" font-family="sans-serif">inverse geotransform</text>
  <line x1="408" y1="229" x2="432" y2="229" stroke="currentColor" stroke-width="1.6" opacity="0.5" marker-end="url(#ah)"/>
  <rect x="438" y="192" width="182" height="74" rx="8" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-width="2" opacity="0.8"/>
  <text x="529" y="222" text-anchor="middle" font-size="15" fill="currentColor" font-family="sans-serif" font-weight="bold">COCO</text>
  <text x="529" y="242" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.7" font-family="sans-serif">pixel-space · training</text>
</svg>

## Exporting GeoParquet, Then Deriving COCO

The reference pipeline writes labels once to GeoParquet with an explicit CRS, then projects them into pixel space to build a COCO file for a specific image set. Install the dependencies:

```bash
pip install geopandas==0.14.4 pyarrow==16.1.0 shapely==2.0.6 pyproj==3.6.1
```

### Step 1 — Write Annotations to GeoParquet With an Embedded CRS

Build a `GeoDataFrame`, set its CRS explicitly, and write GeoParquet. The CRS and the typed column schema are persisted in the file, so downstream readers never have to guess. Here the source labels are in WGS84 — the first EPSG code below links to the CRS reference:

```python
from __future__ import annotations

import geopandas as gpd
from shapely.geometry import Polygon

def build_label_store(path: str) -> gpd.GeoDataFrame:
    """Write annotation polygons to GeoParquet with an explicit CRS."""
    records: list[dict[str, object]] = [
        {"label_id": 1, "category": "building", "image_id": "tile_0007",
         "geometry": Polygon([(13.401, 52.520), (13.403, 52.520),
                              (13.403, 52.519), (13.401, 52.519)])},
        {"label_id": 2, "category": "building", "image_id": "tile_0007",
         "geometry": Polygon([(13.404, 52.521), (13.406, 52.521),
                              (13.406, 52.520), (13.404, 52.520)])},
    ]
    gdf = gpd.GeoDataFrame(records, geometry="geometry", crs="EPSG:4326")
    gdf.to_parquet(path, index=False)  # CRS + schema travel with the file
    return gdf
```

The CRS above is [`EPSG:4326`](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) (WGS84). Because GeoParquet stores this in file metadata, a later reader that reprojects the geometries can trust the declared source CRS rather than inferring it from coordinate magnitudes.

### Step 2 — Define the Image Geotransform

COCO coordinates are pixels, so each image tile needs an affine geotransform mapping world metres to pixel positions, plus the metric CRS the imagery is registered in. Model it explicitly so the mapping is auditable:

```python
from dataclasses import dataclass
from pyproj import Transformer

@dataclass(frozen=True)
class ImageGrid:
    """Georegistration for one raster tile."""
    image_id: str
    width: int
    height: int
    epsg: str                 # metric CRS of the raster, e.g. "EPSG:32633"
    # affine: world = (a*col + b*row + c, d*col + e*row + f)
    a: float; b: float; c: float
    d: float; e: float; f: float

    def world_to_pixel(self, x: float, y: float) -> tuple[float, float]:
        """Invert the affine transform to map world coords to (col, row)."""
        det = self.a * self.e - self.b * self.d
        col = (self.e * (x - self.c) - self.b * (y - self.f)) / det
        row = (-self.d * (x - self.c) + self.a * (y - self.f)) / det
        return col, row
```

### Step 3 — Project GeoParquet Geometries Into Pixel Space

Read the GeoParquet store, reproject each feature into the image CRS, and apply `world_to_pixel` to every vertex. Emit a COCO `bbox` and a flattened `segmentation` ring per annotation:

```python
def geometry_to_coco(
    gdf: gpd.GeoDataFrame,
    grid: ImageGrid,
) -> list[dict[str, object]]:
    """Project features registered to `grid` into COCO pixel-space annotations."""
    subset = gdf[gdf["image_id"] == grid.image_id].to_crs(grid.epsg)
    to_metric = Transformer.from_crs(gdf.crs, grid.epsg, always_xy=True)  # noqa

    annotations: list[dict[str, object]] = []
    for _, row in subset.iterrows():
        pixels = [grid.world_to_pixel(x, y)
                  for x, y in row.geometry.exterior.coords]
        cols = [c for c, _ in pixels]
        rows = [r for _, r in pixels]
        x0, y0 = min(cols), min(rows)
        w, h = max(cols) - x0, max(rows) - y0
        seg: list[float] = [coord for pt in pixels for coord in pt]
        annotations.append({
            "id": int(row["label_id"]),
            "image_id": grid.image_id,
            "category_id": 1,
            "bbox": [round(x0, 2), round(y0, 2), round(w, 2), round(h, 2)],
            "segmentation": [[round(v, 2) for v in seg]],
            "area": round(w * h, 2),
            "iscrowd": 0,
        })
    return annotations
```

### Step 4 — Assemble and Write the Derived COCO JSON

Wrap the per-image annotations in the COCO envelope and serialise. This file is a *build output*: never hand-edit it, and regenerate it whenever tiling changes.

```python
import json

def write_coco(
    grids: list[ImageGrid],
    gdf: gpd.GeoDataFrame,
    out_path: str,
) -> None:
    """Assemble a COCO document from GeoParquet labels across image grids."""
    images: list[dict[str, object]] = []
    anns: list[dict[str, object]] = []
    for g in grids:
        images.append({"id": g.image_id, "width": g.width, "height": g.height})
        anns.extend(geometry_to_coco(gdf, g))
    doc = {
        "images": images,
        "annotations": anns,
        "categories": [{"id": 1, "name": "building"}],
    }
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(doc, fh)
```

Because the geotransform lives in `ImageGrid` rather than in COCO, the pixel coordinates are fully reproducible from the georeferenced store. If you also want inference-time detections to be reprojectable, persist that geotransform alongside the COCO file — [embedding geotransform metadata in COCO exports](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/preserving-metadata-across-dataset-versions/embedding-geotransform-metadata-in-coco-exports/) covers the sidecar and custom-field conventions for doing so.

## Common Errors and Fixes

**`ValueError: Cannot write GeoDataFrame with no CRS to Parquet`**
Root cause: the `GeoDataFrame` was constructed without `crs=`, so GeoParquet has no CRS to embed.
Fix: set it explicitly with `gdf.set_crs("EPSG:4326", inplace=True)` before `to_parquet`, or pass `crs=` at construction.

**COCO boxes land in the wrong place / are mirrored vertically**
Root cause: raster geotransforms usually have a negative `e` term (row index increases as northing decreases), and treating it as positive flips the row axis.
Fix: read the true six affine coefficients from the raster (`rasterio` `dataset.transform`) and feed them unchanged into `ImageGrid`; do not assume a north-up sign.

**Pixel coordinates are enormous or negative**
Root cause: geometries were projected with the wrong target CRS, so world coordinates and the geotransform are in different units.
Fix: ensure `grid.epsg` matches the CRS the geotransform was computed in, and call `.to_crs(grid.epsg)` before `world_to_pixel`, as in Step 3.

**`pyarrow.lib.ArrowInvalid: Schema at index N was different`**
Root cause: appending frames whose columns have inconsistent dtypes (e.g. `label_id` as `int64` in one batch, `object` in another).
Fix: normalise dtypes before writing — `gdf = gdf.astype({"label_id": "int64"})` — so the enforced Arrow schema stays stable across partitions.

**COCO file balloons to gigabytes for dense masks**
Root cause: storing full-resolution polygon rings as text `segmentation` for every instance.
Fix: keep GeoParquet authoritative and export COCO per experiment at the needed resolution, or emit RLE masks instead of polygon rings for dense scenes.

## Related

- [Validating Annotation Export Formats](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/validating-annotation-export-formats/) — the parent guide covering schema contracts and geometry checks across COCO, YOLO, and GeoJSON exports
- [Enforcing the COCO JSON Schema in CI](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/validating-annotation-export-formats/enforcing-coco-json-schema-in-ci/) — gate the derived COCO artifact against a strict schema so cross-references and bbox bounds are validated before training
- [Embedding Geotransform Metadata in COCO Exports](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/preserving-metadata-across-dataset-versions/embedding-geotransform-metadata-in-coco-exports/) — attach the affine geotransform and EPSG code to COCO so pixel-space detections reproject to world coordinates
- [Coordinate Reference Systems in Annotation Pipelines](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) — the CRS handling that makes GeoParquet a trustworthy georeferenced source of truth

This guide sits within [Validating Annotation Export Formats](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/validating-annotation-export-formats/), part of [Labeling Workflows & Toolchain Integration for Geospatial AI](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/).
