---
title: "Spatial Data Formats for ML Annotation: COG, GeoParquet, and STAC"
description: "Choose and validate the right spatial data formats for an annotation pipeline: Cloud-Optimized GeoTIFF for imagery, GeoParquet for vector labels, and STAC for cataloging — with conversion and integrity checks."
slug: "spatial-data-formats-for-ml-annotation"
type: "guide"
breadcrumb: "Geospatial Annotation Fundamentals & Architecture > Spatial Data Formats for ML Annotation"
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
      "headline": "Spatial Data Formats for ML Annotation: COG, GeoParquet, and STAC",
      "description": "Choose and validate the right spatial data formats for an annotation pipeline: Cloud-Optimized GeoTIFF for imagery, GeoParquet for vector labels, and STAC for cataloging — with conversion and integrity checks.",
      "datePublished": "2026-07-13",
      "dateModified": "2026-07-13",
      "author": {"@type": "Organization", "name": "Geospatial Annotation"},
      "publisher": {"@type": "Organization", "name": "Geospatial Annotation"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.geospatialannotation.com/"},
        {"@type": "ListItem", "position": 2, "name": "Geospatial Annotation Fundamentals & Architecture", "item": "https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/"},
        {"@type": "ListItem", "position": 3, "name": "Spatial Data Formats for ML Annotation", "item": "https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/spatial-data-formats-for-ml-annotation/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Standardize Spatial Data Formats for a Geospatial Annotation Pipeline",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Produce a Cloud-Optimized GeoTIFF", "text": "Translate source imagery into a COG with internal tiling and overviews so annotation clients stream tiles with range requests."},
        {"@type": "HowToStep", "position": 2, "name": "Validate the COG structure", "text": "Run rio cogeo validate to confirm internal tiling, overview levels, and IFD ordering meet the COG specification."},
        {"@type": "HowToStep", "position": 3, "name": "Store vector labels as GeoParquet", "text": "Write annotation geometries to GeoParquet with embedded CRS metadata and columnar attribute storage."},
        {"@type": "HowToStep", "position": 4, "name": "Catalog assets with STAC", "text": "Describe each COG and label file as a STAC Item with required fields and group them into a STAC Collection."},
        {"@type": "HowToStep", "position": 5, "name": "Validate the catalog and geometries", "text": "Validate STAC Items against the spec and assert geometry validity and CRS consistency before training."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the difference between a GeoTIFF and a Cloud-Optimized GeoTIFF?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "A plain GeoTIFF can be striped and unordered, forcing a client to download the whole file to read one region. A Cloud-Optimized GeoTIFF adds internal tiling, precomputed overviews, and a leading image-file-directory so a client can issue HTTP range requests and fetch only the pixels and zoom level it needs."
          }
        },
        {
          "@type": "Question",
          "name": "Does GeoParquet preserve the coordinate reference system?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes. GeoParquet stores CRS as PROJJSON in the geo file-level metadata attached to the geometry column, so the projection travels inside the file rather than in a separate sidecar. geopandas reads and writes this automatically, unlike a Shapefile which relies on an external .prj file that can drift or go missing."
          }
        },
        {
          "@type": "Question",
          "name": "What fields are required in a valid STAC item?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "A STAC Item requires a type of Feature, a stac_version, a unique id, a geometry with a matching bbox, a datetime in the properties, an assets object, and links back to its parent and root. When datetime is null you must instead supply start_datetime and end_datetime to describe the acquisition window."
          }
        },
        {
          "@type": "Question",
          "name": "Can I mix COG, GeoParquet, and STAC in one annotation pipeline?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "That is the intended design. COG carries the imagery, GeoParquet carries the vector labels, and STAC is the index that links each label file to the exact scene it annotates. The one rule is that every asset must declare the same EPSG code, or the catalog must record per-asset projection so downstream reprojection stays explicit."
          }
        }
      ]
    }
  ]
}
</script>

# Spatial Data Formats for ML Annotation: COG, GeoParquet, and STAC

A team ingests a few hundred gigabytes of aerial imagery as plain striped GeoTIFFs and stores its vector labels as Shapefiles on a shared bucket. It works for the first sprint. Then the dataset grows to tens of thousands of scenes, and three failures land in the same week. The annotation tool takes twelve seconds to open a single 2 GB scene because every tile read pulls the whole file across the network. A batch of newly exported labels silently loses attribute values because Shapefile `.dbf` columns truncate field names at ten characters and collapse `annotation_confidence` and `annotation_class` into the same key. And when an auditor asks which sensor and acquisition date produced a given label, nobody can answer, because the provenance lived only in a spreadsheet that stopped being updated months ago.

None of these are annotation-quality problems. They are format problems. This guide shows how three modern spatial formats — Cloud-Optimized GeoTIFF for imagery, GeoParquet for vector labels, and SpatioTemporal Asset Catalog (STAC) for the index — replace that fragile stack, and how to produce and validate each one with runnable Python. It sits inside the broader [Geospatial Annotation Fundamentals & Architecture](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/) foundation, which frames why explicit data contracts matter at every stage of a spatial ML pipeline.

---

<svg viewBox="0 0 860 300" role="img" aria-label="Diagram showing COG imagery, GeoParquet labels, and STAC catalog feeding an annotation pipeline" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:860px;display:block;margin:1.5rem auto;">
  <title>Format Roles Feeding an Annotation Pipeline</title>
  <desc>Three format boxes on the left — COG for imagery streaming, GeoParquet for vector labels, and STAC as the catalog and index — with arrows converging into a single annotation and training pipeline box on the right. STAC links the imagery and label boxes.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <defs>
    <marker id="fa" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor" opacity="0.6"/>
    </marker>
  </defs>
  <!-- COG box -->
  <rect x="12" y="18" width="250" height="76" rx="8" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="137" y="44" text-anchor="middle" font-size="14" font-weight="700" fill="currentColor" font-family="sans-serif">COG</text>
  <text x="137" y="64" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.75">Imagery streaming</text>
  <text x="137" y="80" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.75">tiled + overviews, range reads</text>
  <!-- GeoParquet box -->
  <rect x="12" y="112" width="250" height="76" rx="8" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="137" y="138" text-anchor="middle" font-size="14" font-weight="700" fill="currentColor" font-family="sans-serif">GeoParquet</text>
  <text x="137" y="158" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.75">Vector labels</text>
  <text x="137" y="174" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.75">columnar, CRS-aware</text>
  <!-- STAC box -->
  <rect x="12" y="206" width="250" height="76" rx="8" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="137" y="232" text-anchor="middle" font-size="14" font-weight="700" fill="currentColor" font-family="sans-serif">STAC</text>
  <text x="137" y="252" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.75">Catalog / index</text>
  <text x="137" y="268" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.75">items, collections, provenance</text>
  <!-- STAC links imagery + labels (dashed) -->
  <line x1="137" y1="206" x2="137" y2="188" stroke="currentColor" stroke-width="1" stroke-dasharray="4 3" opacity="0.45"/>
  <line x1="200" y1="206" x2="200" y2="94" stroke="currentColor" stroke-width="1" stroke-dasharray="4 3" opacity="0.45"/>
  <text x="216" y="150" text-anchor="start" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.55">indexes</text>
  <!-- Converging arrows -->
  <line x1="262" y1="56"  x2="556" y2="130" stroke="currentColor" stroke-width="1.5" marker-end="url(#fa)" opacity="0.6"/>
  <line x1="262" y1="150" x2="556" y2="150" stroke="currentColor" stroke-width="1.5" marker-end="url(#fa)" opacity="0.6"/>
  <line x1="262" y1="244" x2="556" y2="170" stroke="currentColor" stroke-width="1.5" marker-end="url(#fa)" opacity="0.6"/>
  <!-- Pipeline box -->
  <rect x="562" y="96" width="286" height="108" rx="10" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.6"/>
  <text x="705" y="132" text-anchor="middle" font-size="14" font-weight="700" fill="currentColor" font-family="sans-serif">Annotation &amp; Training</text>
  <text x="705" y="152" text-anchor="middle" font-size="14" font-weight="700" fill="currentColor" font-family="sans-serif">Pipeline</text>
  <text x="705" y="176" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.75">tile serving · label load · versioning</text>
</svg>

---

## Prerequisites & Format Contracts

Before converting anything, pin an environment so that COG structure, GeoParquet metadata, and STAC validation behave identically on every machine and in CI. The versions below are the ones the code in this guide is written against.

```bash
pip install \
  rasterio==1.3.10 \
  rio-cogeo==5.3.0 \
  geopandas==0.14.4 \
  pyarrow==16.1.0 \
  pystac==1.10.1 \
  shapely==2.0.6
```

**System dependencies**

- GDAL 3.6+ with the bindings that match your `rasterio` wheel.
- A working PROJ data directory — verify with `python -c "import pyproj; print(pyproj.datadir.get_data_dir())"`.
- Enough scratch disk for one uncompressed copy of the largest scene you convert.

**Format contracts to agree on up front**

Every asset in the pipeline should declare the same projection. The first time a batch mixes projections is the first time labels land in the wrong place, so document a canonical [coordinate reference system](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) — usually a local UTM zone such as [`EPSG:32633`](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) — and require imagery, labels, and catalog to agree on it. Decide a tile block size (512 pixels is a safe default), an overview resampling method, and a STAC identifier scheme that ties each label file back to the scene it annotates.

---

## Core Format Workflow

The three formats are not competitors; they occupy three roles. COG makes imagery streamable, GeoParquet makes labels queryable, and STAC makes the whole set discoverable. Build them in that order.

### Produce a Cloud-Optimized GeoTIFF for Imagery

A plain GeoTIFF stores pixels in horizontal strips with the metadata directory anywhere in the file. To read a 256×256 window a client may have to walk most of the file. A COG fixes this by writing internally tiled pixels, precomputed overviews (downsampled zoom levels), and a leading image-file-directory, so a client can read the file header, learn the byte ranges it needs, and fetch only those with HTTP range requests. That is the single change that turns a twelve-second scene open into a sub-second one.

<svg viewBox="0 0 760 320" role="img" aria-label="Internal layout of a Cloud-Optimized GeoTIFF: header first, then tiled full-resolution data and successively smaller overview levels, with a range request fetching one tile" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:760px;display:block;margin:1.5rem auto;">
  <title>What makes a GeoTIFF cloud-optimized</title>
  <desc>A COG places its header and tile index at the front of the file, followed by internal tiles of 512 by 512 pixels and a pyramid of overviews at half, quarter and eighth resolution. A client reads the header with one request, then issues a byte-range request for exactly the tiles it needs. A plain striped GeoTIFF has no tile index and no overviews, so the same view costs a full-file download.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <!-- COG layout bar -->
  <text x="30" y="36" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">cloud-optimized layout</text>
  <rect x="30" y="48" width="90" height="46" rx="4" fill="currentColor" opacity="0.25"/>
  <rect x="30" y="48" width="90" height="46" rx="4" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="75" y="70" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif">header</text>
  <text x="75" y="85" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.75">+ tile index</text>
  <rect x="124" y="48" width="290" height="46" rx="4" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="269" y="70" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif">full resolution, tiled 512 × 512</text>
  <text x="269" y="85" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.75">each tile independently addressable</text>
  <rect x="418" y="48" width="120" height="46" rx="4" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="478" y="70" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif">overview 1/2</text>
  <text x="478" y="85" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.75">tiled</text>
  <rect x="542" y="48" width="84" height="46" rx="4" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="584" y="74" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif">ovr 1/4</text>
  <rect x="630" y="48" width="60" height="46" rx="4" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="660" y="74" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif">1/8</text>
  <!-- Request flow -->
  <rect x="30" y="140" width="150" height="52" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="105" y="162" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">viewer asks for</text>
  <text x="105" y="179" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">one map tile</text>
  <line x1="180" y1="166" x2="216" y2="166" stroke="currentColor" stroke-width="1.5" marker-end="url(#cog-arr)"/>
  <defs>
    <marker id="cog-arr" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor"/>
    </marker>
  </defs>
  <rect x="218" y="140" width="180" height="52" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="308" y="162" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">read header once</text>
  <text x="308" y="179" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace" opacity="0.75">~16 KB</text>
  <line x1="398" y1="166" x2="434" y2="166" stroke="currentColor" stroke-width="1.5" marker-end="url(#cog-arr)"/>
  <rect x="436" y="140" width="254" height="52" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="563" y="162" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">range request for those tiles only</text>
  <text x="563" y="179" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace" opacity="0.75">Range: bytes=…  ·  a few hundred KB</text>
  <!-- Contrast -->
  <text x="30" y="238" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">plain striped GeoTIFF</text>
  <rect x="30" y="250" width="660" height="40" rx="4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="6 3"/>
  <text x="360" y="268" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">row-strip data, no tile index, no overviews</text>
  <text x="360" y="284" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">the same view costs a full-file download before the first pixel is drawn</text>
</svg>

```python
from pathlib import Path

from rio_cogeo.cogeo import cog_translate
from rio_cogeo.profiles import cog_profiles


def build_cog(src_path: str, dst_path: str, blocksize: int = 512) -> Path:
    """Translate a source raster into a Cloud-Optimized GeoTIFF.

    Uses DEFLATE compression, internal tiling at ``blocksize``, and
    power-of-two overviews so annotation clients can stream tiles.
    """
    profile = cog_profiles.get("deflate")
    profile.update(blockxsize=blocksize, blockysize=blocksize)

    cog_translate(
        src_path,
        dst_path,
        profile,
        overview_level=5,
        overview_resampling="average",
        web_optimized=False,
        in_memory=False,
    )
    return Path(dst_path)


if __name__ == "__main__":
    build_cog("data/raw/scene_0421.tif", "data/cog/scene_0421.tif")
```

`overview_resampling="average"` suits continuous imagery; for a categorical raster such as a rasterized label mask use `"nearest"` so class values are never blended. Keep `web_optimized=False` unless you are serving a web map, because web optimization reprojects to Web Mercator and you generally want annotation imagery to stay in its native projection.

### Validate the COG Structure

Producing a COG is not the same as producing a *valid* one — a wrong block size, missing overviews, or a trailing IFD all silently degrade to full-file reads. Validate structure explicitly rather than trusting the writer.

```bash
rio cogeo validate data/cog/scene_0421.tif
```

Wrap the same check in Python so it can run as a gate over a whole directory:

```python
from rio_cogeo.cogeo import cog_validate


def assert_valid_cog(path: str) -> None:
    """Raise if ``path`` is not a spec-compliant COG."""
    is_valid, errors, warnings = cog_validate(path)
    if warnings:
        print(f"{path}: warnings -> {warnings}")
    if not is_valid:
        raise ValueError(f"{path} is not a valid COG: {errors}")
    print(f"{path}: valid COG")


if __name__ == "__main__":
    assert_valid_cog("data/cog/scene_0421.tif")
```

`cog_validate` returns errors for hard spec violations (no internal tiling, overviews out of order) and warnings for softer issues (block size larger than the image, too few overview levels). Treat errors as build-breaking and log warnings for review.

### Store Vector Labels as GeoParquet

Shapefiles are where annotation attributes go to die: ten-character field names, a 2 GB size ceiling, no native typing beyond a handful of `.dbf` types, and a CRS held in a fragile external `.prj`. GeoParquet replaces all of that with a columnar, compressed, strongly typed format that embeds the projection as PROJJSON inside the file. Columns are read independently, so filtering a million-feature label set by class touches only the class column.

```python
import geopandas as gpd
from shapely.geometry import Polygon


def write_label_geoparquet(dst_path: str, target_epsg: int = 32633) -> None:
    """Write example annotation polygons to CRS-aware GeoParquet."""
    features: list[dict[str, object]] = [
        {
            "annotation_id": "a-0001",
            "annotation_class": "building",
            "annotation_confidence": 0.94,
            "geometry": Polygon([(0, 0), (0, 10), (10, 10), (10, 0)]),
        },
        {
            "annotation_id": "a-0002",
            "annotation_class": "solar_panel",
            "annotation_confidence": 0.81,
            "geometry": Polygon([(20, 20), (20, 26), (28, 26), (28, 20)]),
        },
    ]
    gdf = gpd.GeoDataFrame(features, geometry="geometry", crs=f"EPSG:{target_epsg}")
    # Full attribute names survive; no .dbf truncation.
    gdf.to_parquet(dst_path, index=False)


def read_and_check(dst_path: str, expected_epsg: int = 32633) -> None:
    gdf = gpd.read_parquet(dst_path)
    actual = gdf.crs.to_epsg()
    assert actual == expected_epsg, f"CRS drift: expected {expected_epsg}, got {actual}"
    print(f"Loaded {len(gdf)} labels, CRS EPSG:{actual}, columns={list(gdf.columns)}")


if __name__ == "__main__":
    write_label_geoparquet("data/labels/scene_0421.parquet")
    read_and_check("data/labels/scene_0421.parquet")
```

The full attribute names `annotation_class` and `annotation_confidence` round-trip intact — the exact failure the Shapefile stack could not survive. If your labels start life as Shapefiles, the dedicated walkthrough on [converting Shapefiles to GeoParquet for annotation](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/spatial-data-formats-for-ml-annotation/converting-shapefiles-to-geoparquet-for-annotation/) covers CRS preservation and field-name recovery across the roundtrip.

### Catalog Assets with STAC

With imagery in COGs and labels in GeoParquet, you still need to know which label file annotates which scene, in which projection, captured when, by which sensor. STAC answers that. A STAC Item is a GeoJSON Feature describing one spatiotemporal asset group; a STAC Collection groups related Items and holds shared metadata. Point the Item's assets at the COG and the GeoParquet, and the catalog becomes the single source of truth for provenance.

```python
from datetime import datetime, timezone

import pystac
from shapely.geometry import box, mapping


def build_stac_item(
    item_id: str,
    cog_href: str,
    label_href: str,
    bbox: tuple[float, float, float, float],
    acquired: datetime,
    epsg: int = 32633,
) -> pystac.Item:
    """Create a STAC Item linking a COG scene to its GeoParquet labels."""
    geometry = mapping(box(*bbox))
    item = pystac.Item(
        id=item_id,
        geometry=geometry,
        bbox=list(bbox),
        datetime=acquired,
        properties={"proj:epsg": epsg},
    )
    item.add_asset(
        "imagery",
        pystac.Asset(href=cog_href, media_type=pystac.MediaType.COG, roles=["data"]),
    )
    item.add_asset(
        "labels",
        pystac.Asset(
            href=label_href,
            media_type="application/x-parquet",
            roles=["labels"],
        ),
    )
    return item


def build_collection(items: list[pystac.Item]) -> pystac.Collection:
    spatial = pystac.SpatialExtent([[-180.0, -90.0, 180.0, 90.0]])
    temporal = pystac.TemporalExtent([[datetime(2024, 1, 1, tzinfo=timezone.utc), None]])
    collection = pystac.Collection(
        id="annotation-scenes",
        description="COG imagery with GeoParquet annotation labels.",
        extent=pystac.Extent(spatial, temporal),
    )
    for item in items:
        collection.add_item(item)
    return collection


if __name__ == "__main__":
    item = build_stac_item(
        item_id="scene_0421",
        cog_href="data/cog/scene_0421.tif",
        label_href="data/labels/scene_0421.parquet",
        bbox=(300000.0, 5800000.0, 301000.0, 5801000.0),
        acquired=datetime(2024, 6, 1, 10, 30, tzinfo=timezone.utc),
    )
    collection = build_collection([item])
    collection.normalize_hrefs("data/catalog")
    collection.save(catalog_type=pystac.CatalogType.SELF_CONTAINED)
```

The `proj:epsg` property comes from the STAC Projection extension and records the asset's native CRS, so a consumer never has to open the COG to learn how to reproject the labels. `normalize_hrefs` followed by `save` writes a self-contained catalog whose links resolve relative to the catalog root.

---

## Format Role & Validation Reference

| Format | Role in pipeline | Key advantage | Validation tool | CRS handling |
|---|---|---|---|---|
| COG | Streaming imagery source | Internal tiling + overviews enable range-read tile access | `rio cogeo validate` / `cog_validate` | Embedded in the GeoTIFF header (GeoKeys) |
| GeoParquet | Vector label storage | Columnar, typed, compressed; no field-name truncation | `geopandas.read_parquet` + geometry checks | PROJJSON in `geo` file metadata on the geometry column |
| STAC Item | Per-scene catalog entry | Ties imagery to labels with acquisition provenance | `pystac` `validate()` / `stac-validator` | `proj:epsg` property via the Projection extension |
| STAC Collection | Grouping + shared metadata | One discoverable index over the whole dataset | `pystac` `validate_all()` | Inherited or per-item projection metadata |

---


<svg viewBox="0 0 740 290" role="img" aria-label="Matrix of which format carries which responsibility across imagery, vector labels, catalog and training export" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:740px;display:block;margin:1.5rem auto;">
  <title>Which format owns which responsibility</title>
  <desc>Four formats against four responsibilities. COG owns imagery storage and partial reads. GeoParquet owns vector label storage with typed columns and a CRS. STAC owns discovery and catalog metadata. COCO owns the training export and owns nothing else. A filled marker means the format is the right owner, a hollow marker means it can do the job but should not own it, and a blank cell means it does not apply.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <!-- Header row -->
  <text x="210" y="42" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.85">imagery</text>
  <text x="210" y="56" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.85">storage</text>
  <text x="360" y="42" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.85">vector</text>
  <text x="360" y="56" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.85">labels</text>
  <text x="510" y="42" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.85">discovery</text>
  <text x="510" y="56" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.85">&amp; metadata</text>
  <text x="660" y="42" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.85">training</text>
  <text x="660" y="56" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.85">export</text>
  <line x1="30" y1="68" x2="710" y2="68" stroke="currentColor" stroke-width="1" opacity="0.4"/>
  <!-- Rows -->
  <text x="30" y="102" font-size="12" fill="currentColor" font-family="monospace">COG</text>
  <circle cx="210" cy="98" r="9" fill="currentColor" opacity="0.55"/>
  <circle cx="510" cy="98" r="9" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="30" y="118" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.65">tiled, overviewed raster</text>
  <line x1="30" y1="130" x2="710" y2="130" stroke="currentColor" stroke-width="1" opacity="0.2"/>
  <text x="30" y="164" font-size="12" fill="currentColor" font-family="monospace">GeoParquet</text>
  <circle cx="360" cy="160" r="9" fill="currentColor" opacity="0.55"/>
  <circle cx="660" cy="160" r="9" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="30" y="180" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.65">typed columns, CRS in metadata</text>
  <line x1="30" y1="192" x2="710" y2="192" stroke="currentColor" stroke-width="1" opacity="0.2"/>
  <text x="30" y="226" font-size="12" fill="currentColor" font-family="monospace">STAC</text>
  <circle cx="510" cy="222" r="9" fill="currentColor" opacity="0.55"/>
  <text x="30" y="242" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.65">items, assets, temporal extent</text>
  <line x1="30" y1="254" x2="710" y2="254" stroke="currentColor" stroke-width="1" opacity="0.2"/>
  <text x="30" y="282" font-size="12" fill="currentColor" font-family="monospace">COCO</text>
  <circle cx="660" cy="278" r="9" fill="currentColor" opacity="0.55"/>
  <!-- Legend -->
  <circle cx="210" cy="278" r="9" fill="currentColor" opacity="0.55"/>
  <text x="224" y="282" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">owns it</text>
  <circle cx="330" cy="278" r="9" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="344" y="282" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">can, but should not own it</text>
</svg>

## Edge Cases & Gotchas

### COG overviews and block size mismatches

The most common invalid COG has correct pixels but wrong structure. If the block size exceeds the image dimensions, the file has a single internal tile and behaves like a striped GeoTIFF under range reads. If overviews are missing, a zoomed-out annotation view forces a full-resolution read of the entire scene. Pick a block size (512) smaller than your smallest scene, request enough overview levels to reach a browsable thumbnail, and let `cog_validate` warnings flag both conditions before the file ships.

### GeoParquet CRS metadata and GeoArrow encoding

GeoParquet keeps CRS as PROJJSON in file-level `geo` metadata, not per row. If you build a `GeoDataFrame` without setting `crs`, the written file carries a null projection and every downstream reader has to guess — the same silent failure a missing `.prj` causes. Always set `crs` before writing. Be aware that GeoParquet 1.1 introduced GeoArrow-encoded geometry columns alongside the original well-known-binary encoding; pin your `geopandas` and `pyarrow` versions together so writer and reader agree on which encoding they emit and expect.

### STAC required fields and null datetime

A STAC Item that omits any of `type`, `stac_version`, `id`, `geometry`, `bbox`, `properties.datetime`, `assets`, or `links` will fail validation and be rejected by most catalog servers. The trap is `datetime`: for a scene captured over a time window rather than an instant, `datetime` may be `null`, but only if you supply `start_datetime` and `end_datetime` in properties instead. Validate items rather than assuming the constructor enforced this.

### Mixing formats with inconsistent projections

The formats compose cleanly only when their projections agree. A COG in one UTM zone with labels in a neighboring zone will render but place every annotation tens of thousands of meters off. Assert that each Item's `proj:epsg` matches the CRS recorded in its GeoParquet asset, and reproject explicitly where they differ rather than trusting a downstream tool to reconcile them silently.

---

## Integration & Automation Hooks

### Serving COGs to Label Studio

When you connect [Label Studio integrated with geospatial workflows](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/integrating-label-studio-with-geospatial-workflows/) to a bucket of COGs, the tiling backend issues range requests against each scene, so a valid COG is the difference between an annotator waiting on a full download and one panning smoothly. Gate the ingest step with `assert_valid_cog` so no striped GeoTIFF ever reaches the labeling queue, and expose the STAC Collection so tasks can be created directly from catalog Items rather than a hand-maintained file list.

### Versioning formatted assets with DVC

Once imagery is in COGs and labels in GeoParquet, track them with [DVC for geospatial training data](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/). Content-addressed storage plays well with these formats: a COG's bytes are stable across re-exports when you fix the compression and overview settings, and GeoParquet's deterministic column layout gives reproducible hashes. Commit the STAC catalog alongside the data so every dataset version resolves to the exact imagery and labels its Items reference.

---

## Validation & Testing

Structure validation and geometry validation are separate concerns — a file can be a perfect COG full of nonsense, or valid GeoParquet holding self-intersecting polygons. Run both.

### Catalog and item validation

```python
import pystac


def validate_catalog(catalog_path: str) -> None:
    """Validate every Item and Collection under a STAC catalog root."""
    catalog = pystac.Catalog.from_file(catalog_path)
    n = catalog.validate_all()
    print(f"Validated {n} STAC objects successfully")


if __name__ == "__main__":
    validate_catalog("data/catalog/collection.json")
```

### Geometry and CRS integrity check

```python
import geopandas as gpd


def check_label_integrity(path: str, expected_epsg: int = 32633) -> None:
    """Assert labels are valid, non-empty, and in the expected CRS."""
    gdf = gpd.read_parquet(path)

    assert gdf.crs is not None, f"{path}: missing CRS metadata"
    assert gdf.crs.to_epsg() == expected_epsg, (
        f"{path}: CRS mismatch, expected EPSG:{expected_epsg}"
    )
    assert gdf.geometry.is_valid.all(), f"{path}: contains invalid geometries"
    assert not gdf.geometry.is_empty.any(), f"{path}: contains empty geometries"
    print(f"{path}: {len(gdf)} labels valid in EPSG:{gdf.crs.to_epsg()}")


if __name__ == "__main__":
    check_label_integrity("data/labels/scene_0421.parquet")
```

Wire the COG validator, the catalog validator, and the geometry check into one pre-training gate. If any asset fails, the batch never enters the training queue — the cheapest place to catch a format defect is before it becomes a corrupted label a model learns from. Reprojection edge cases, such as reconciling a Shapefile whose `.prj` disagrees with its coordinates, are covered in depth by the [coordinate reference systems](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) guide.

---

## Frequently Asked Questions

### What is the difference between a GeoTIFF and a Cloud-Optimized GeoTIFF?

A plain GeoTIFF can be striped and unordered, forcing a client to download the whole file to read one region. A Cloud-Optimized GeoTIFF adds internal tiling, precomputed overviews, and a leading image-file-directory so a client can issue HTTP range requests and fetch only the pixels and zoom level it needs.

### Does GeoParquet preserve the coordinate reference system?

Yes. GeoParquet stores CRS as PROJJSON in the `geo` file-level metadata attached to the geometry column, so the projection travels inside the file rather than in a separate sidecar. `geopandas` reads and writes this automatically, unlike a Shapefile which relies on an external `.prj` file that can drift or go missing.

### What fields are required in a valid STAC item?

A STAC Item requires a type of `Feature`, a `stac_version`, a unique `id`, a `geometry` with a matching `bbox`, a `datetime` in the properties, an `assets` object, and links back to its parent and root. When `datetime` is null you must instead supply `start_datetime` and `end_datetime` to describe the acquisition window.

### Can I mix COG, GeoParquet, and STAC in one annotation pipeline?

That is the intended design. COG carries the imagery, GeoParquet carries the vector labels, and STAC is the index that links each label file to the exact scene it annotates. The one rule is that every asset must declare the same EPSG code, or the catalog must record per-asset projection so downstream reprojection stays explicit.

---

## Related

- [Converting Shapefiles to GeoParquet for Annotation](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/spatial-data-formats-for-ml-annotation/converting-shapefiles-to-geoparquet-for-annotation/) — a step-by-step migration off legacy Shapefiles, preserving CRS and recovering truncated field names
- [Coordinate Reference Systems in Annotation Pipelines](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) — how to normalize the projections these formats embed so imagery and labels stay aligned
- [Vector vs Raster Annotation Workflows](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/vector-vs-raster-annotation-workflows/) — when labels belong in GeoParquet vectors versus rasterized COG masks
- [Implementing DVC for Geospatial Training Data](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/) — version-controlling COGs, GeoParquet, and the STAC catalog together

This guide is part of the broader [Geospatial Annotation Fundamentals & Architecture](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/) foundation that underpins every production ML pipeline working with spatial data.
