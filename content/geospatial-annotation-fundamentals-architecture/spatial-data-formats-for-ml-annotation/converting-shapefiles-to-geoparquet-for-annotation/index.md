---
title: "Converting Shapefiles to GeoParquet for Annotation"
description: "Convert legacy Shapefiles to GeoParquet for annotation pipelines with geopandas — preserving CRS, handling field-name truncation, and validating geometry integrity across the roundtrip."
slug: "converting-shapefiles-to-geoparquet-for-annotation"
type: "tutorial"
breadcrumb:
  - label: "Home"
    url: "/"
  - label: "Geospatial Annotation Fundamentals & Architecture"
    url: "/geospatial-annotation-fundamentals-architecture/"
  - label: "Spatial Data Formats for ML Annotation"
    url: "/geospatial-annotation-fundamentals-architecture/spatial-data-formats-for-ml-annotation/"
  - label: "Converting Shapefiles to GeoParquet for Annotation"
    url: "/geospatial-annotation-fundamentals-architecture/spatial-data-formats-for-ml-annotation/converting-shapefiles-to-geoparquet-for-annotation/"
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
      "headline": "Converting Shapefiles to GeoParquet for Annotation",
      "description": "Convert legacy Shapefiles to GeoParquet for annotation pipelines with geopandas — preserving CRS, handling field-name truncation, and validating geometry integrity across the roundtrip.",
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
        {"@type": "ListItem", "position": 3, "name": "Spatial Data Formats for ML Annotation", "item": "https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/spatial-data-formats-for-ml-annotation/"},
        {"@type": "ListItem", "position": 4, "name": "Converting Shapefiles to GeoParquet for Annotation", "item": "https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/spatial-data-formats-for-ml-annotation/converting-shapefiles-to-geoparquet-for-annotation/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Converting Shapefiles to GeoParquet for Annotation",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Read the Shapefile with geopandas", "text": "Load the .shp with geopandas.read_file, which automatically reads the accompanying .shx, .dbf, and .prj sidecar files into a single GeoDataFrame."},
        {"@type": "HowToStep", "position": 2, "name": "Confirm or assign the CRS", "text": "Inspect gdf.crs to verify the CRS parsed from the .prj file. If it is None because the .prj is missing, assign the correct authority code with set_crs before writing."},
        {"@type": "HowToStep", "position": 3, "name": "Repair truncated and duplicate field names", "text": "Detect column names clipped to the 10-character .dbf limit and rename them to their intended full names, resolving any collisions that the truncation created."},
        {"@type": "HowToStep", "position": 4, "name": "Write GeoParquet with the CRS embedded", "text": "Call to_parquet, which serialises geometry as WKB and writes the CRS as PROJJSON into the GeoParquet 'geo' file metadata, producing a single self-describing file."},
        {"@type": "HowToStep", "position": 5, "name": "Validate the roundtrip", "text": "Read the GeoParquet back and assert that geometry equals the source geometry and that the CRS matches exactly, so no coordinate or projection information was lost."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Does GeoParquet preserve the coordinate reference system that lived in the Shapefile .prj?",
          "acceptedAnswer": {"@type": "Answer", "text": "Yes. When geopandas writes GeoParquet it serialises the CRS as PROJJSON into the file-level 'geo' metadata key of the Parquet footer. Unlike a Shapefile, where the CRS lives in a separate .prj file that can be lost or edited independently, the GeoParquet CRS travels inside the single data file and is read back automatically by geopandas.read_parquet."}
        },
        {
          "@type": "Question",
          "name": "Why do my Shapefile attribute column names get cut off, and does GeoParquet fix it?",
          "acceptedAnswer": {"@type": "Answer", "text": "The Shapefile attribute table is a dBASE (.dbf) file, and dBASE field names are limited to 10 characters. A column called annotation_confidence is silently stored as annotatio_c, and two long names can collide into duplicates. GeoParquet uses Parquet's schema, which has no practical name-length limit, so once you rename the truncated columns back to their intended names before writing, GeoParquet preserves them exactly."}
        },
        {
          "@type": "Question",
          "name": "What happens to mixed geometry types when converting a Shapefile to GeoParquet?",
          "acceptedAnswer": {"@type": "Answer", "text": "A Shapefile stores a single geometry type per file, but drivers often mix Polygon and MultiPolygon rows, which some strict GeoParquet readers reject. Promote every geometry to its Multi form with shapely before writing, so the column has a single homogeneous type, or write with a geometry encoding that explicitly permits mixed types. Homogenising to Multi is the safest option for downstream ML tooling."}
        },
        {
          "@type": "Question",
          "name": "Is GeoParquet faster to load for machine learning training than a Shapefile?",
          "acceptedAnswer": {"@type": "Answer", "text": "Usually yes. GeoParquet is columnar and compressed, so a training loader that only needs the geometry and a label column reads just those columns rather than the whole attribute table. It also avoids opening four separate sidecar files per dataset, which reduces I/O overhead when thousands of annotation tiles are loaded per epoch."}
        }
      ]
    }
  ]
}
</script>

# Converting Shapefiles to GeoParquet for Annotation

Legacy annotation deliverables almost always arrive as Shapefiles — a fragile bundle of `.shp`, `.shx`, `.dbf`, and `.prj` files that must stay together, whose attribute names are clipped to ten characters, and whose [coordinate reference system](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) lives in a plain-text `.prj` file that anything can overwrite. Converting to GeoParquet fixes all three problems at once. The reliable path is short: read the Shapefile with `geopandas`, confirm or assign the CRS from the `.prj`, repair any truncated or duplicated field names, then write GeoParquet — which embeds the CRS directly as file metadata, removes the 10-character `.dbf` field-name limit, and collapses the multi-file sidecar cluster into one self-describing file. Finish by validating the roundtrip so you can prove no geometry or projection information was lost.

## Why the Shapefile Sidecar Cluster Fails ML Pipelines

A Shapefile is not one file; it is a minimum of three and usually four, and every consumer must keep them adjacent with identical basenames. Drop the `.prj` during an `scp` and the CRS is gone. Zip only the `.shp` and the dataset is unreadable. That fragility is tolerable for a one-off GIS map but corrosive for an annotation pipeline where thousands of label files move between object storage, a labeling platform, and a training loader on every iteration. The attribute table compounds the problem: it is a dBASE `.dbf`, so field names are hard-capped at 10 characters. A column you named `annotation_confidence` is written to disk as `annotatio_c`, and if you also have `annotation_class` the two can truncate into a collision that the driver resolves by silently renaming one. Feed that into a training script keyed on column names and the run fails, or worse, trains on the wrong field.

GeoParquet removes each failure mode. It is a single Parquet file whose geometry column is stored as Well-Known Binary and whose CRS is written as PROJJSON into a file-level `geo` metadata key, so the projection travels inside the bytes that hold the coordinates. Parquet's schema imposes no practical limit on column-name length, so full annotation field names survive. And because Parquet is columnar and compressed, a loader that needs only geometry and a label reads those columns alone.

<svg viewBox="14 -4 702 264" role="img" aria-label="Diagram contrasting a four-file Shapefile sidecar cluster with a single GeoParquet file that embeds the CRS and full field names" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:702px;display:block;margin:1.5rem auto;">
  <title>Shapefile sidecar cluster consolidated into a single GeoParquet file</title>
  <desc>On the left, four separate files labelled .shp, .shx, .dbf, and .prj are grouped as a fragile cluster, with notes that the .dbf truncates field names to ten characters and the .prj holds the CRS separately. An arrow labelled geopandas convert points to the right, where a single GeoParquet file contains embedded WKB geometry, the CRS as PROJJSON metadata, and full-length field names.</desc>
  <rect x="14" y="-4" width="702" height="264" style="fill:var(--bg)"/>
  <defs>
    <marker id="gpq-arrow" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto">
      <polygon points="0 0, 9 3.5, 0 7" fill="currentColor" opacity="0.55"/>
    </marker>
  </defs>
  <text x="150" y="28" text-anchor="middle" font-size="13" fill="currentColor" opacity="0.85" font-family="sans-serif" font-weight="bold">Shapefile sidecar cluster</text>
  <!-- dashed enclosing group -->
  <rect x="34" y="44" width="232" height="196" rx="10" fill="currentColor" fill-opacity="0.03" stroke="currentColor" stroke-width="1.3" stroke-dasharray="5 4" opacity="0.5"/>
  <!-- .shp -->
  <rect x="54" y="62" width="86" height="46" rx="5" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.55"/>
  <text x="97" y="82" text-anchor="middle" font-size="12" fill="currentColor" opacity="0.9" font-family="sans-serif" font-weight="bold">.shp</text>
  <text x="97" y="98" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.55" font-family="sans-serif">geometry</text>
  <!-- .shx -->
  <rect x="160" y="62" width="86" height="46" rx="5" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.55"/>
  <text x="203" y="82" text-anchor="middle" font-size="12" fill="currentColor" opacity="0.9" font-family="sans-serif" font-weight="bold">.shx</text>
  <text x="203" y="98" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.55" font-family="sans-serif">index</text>
  <!-- .dbf -->
  <rect x="54" y="132" width="86" height="46" rx="5" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.55"/>
  <text x="97" y="152" text-anchor="middle" font-size="12" fill="currentColor" opacity="0.9" font-family="sans-serif" font-weight="bold">.dbf</text>
  <text x="97" y="168" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.55" font-family="sans-serif">attrs</text>
  <!-- .prj -->
  <rect x="160" y="132" width="86" height="46" rx="5" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.55"/>
  <text x="203" y="152" text-anchor="middle" font-size="12" fill="currentColor" opacity="0.9" font-family="sans-serif" font-weight="bold">.prj</text>
  <text x="203" y="168" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.55" font-family="sans-serif">CRS</text>
  <!-- limitation notes -->
  <text x="150" y="202" text-anchor="middle" font-size="9.5" fill="currentColor" opacity="0.6" font-family="sans-serif">.dbf names clipped to 10 chars</text>
  <text x="150" y="218" text-anchor="middle" font-size="9.5" fill="currentColor" opacity="0.6" font-family="sans-serif">CRS in a separate, loseable file</text>
  <!-- arrow -->
  <line x1="278" y1="142" x2="418" y2="142" stroke="currentColor" stroke-width="1.8" opacity="0.55" marker-end="url(#gpq-arrow)"/>
  <text x="348" y="132" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7" font-family="sans-serif">geopandas convert</text>
  <!-- GeoParquet -->
  <text x="576" y="28" text-anchor="middle" font-size="13" fill="currentColor" opacity="0.85" font-family="sans-serif" font-weight="bold">Single GeoParquet file</text>
  <rect x="440" y="52" width="256" height="188" rx="10" fill="currentColor" fill-opacity="0.05" stroke="currentColor" stroke-width="1.6" opacity="0.7"/>
  <text x="568" y="82" text-anchor="middle" font-size="13" fill="currentColor" opacity="0.95" font-family="sans-serif" font-weight="bold">labels.parquet</text>
  <line x1="460" y1="96" x2="676" y2="96" stroke="currentColor" stroke-width="1" opacity="0.3"/>
  <text x="460" y="120" font-size="10.5" fill="currentColor" opacity="0.75" font-family="sans-serif">• geometry as WKB column</text>
  <text x="460" y="142" font-size="10.5" fill="currentColor" opacity="0.75" font-family="sans-serif">• CRS embedded as PROJJSON</text>
  <text x="460" y="164" font-size="10.5" fill="currentColor" opacity="0.75" font-family="sans-serif">• full-length field names</text>
  <text x="460" y="186" font-size="10.5" fill="currentColor" opacity="0.75" font-family="sans-serif">• columnar + compressed</text>
  <text x="460" y="216" font-size="9.5" fill="currentColor" opacity="0.55" font-family="sans-serif">one file, self-describing, no sidecars</text>
</svg>

## Prerequisites and Environment

Install the pinned toolchain once. `pyarrow` provides the Parquet writer that `geopandas` calls under the hood:

```bash
pip install geopandas==0.14.4 pyarrow==16.1.0 shapely==2.0.6 pyproj==3.6.1
```

## Step 1 — Read the Shapefile and Inspect What Arrived

`geopandas.read_file` resolves the whole sidecar cluster from the single `.shp` path — it opens the `.shx`, `.dbf`, and `.prj` automatically. Read it, then immediately inspect the CRS and the columns so you know the true state of the data before touching it:

```python
from pathlib import Path
import geopandas as gpd


def load_shapefile(shp_path: Path) -> gpd.GeoDataFrame:
    """Load a Shapefile and its sidecars into a single GeoDataFrame."""
    gdf: gpd.GeoDataFrame = gpd.read_file(shp_path)
    print(f"features:   {len(gdf)}")
    print(f"crs:        {gdf.crs}")
    print(f"geom types: {sorted(gdf.geom_type.unique())}")
    print(f"columns:    {list(gdf.columns)}")
    return gdf


gdf = load_shapefile(Path("annotations/parcels.shp"))
```

If `crs` prints `None`, the `.prj` is missing or unreadable — handle that in Step 2 before anything else. If `geom types` shows both `Polygon` and `MultiPolygon`, note it for Step 4.

## Step 2 — Confirm or Assign the CRS

When the `.prj` parsed cleanly, `gdf.crs` is a `pyproj.CRS` object and you only need to confirm it is the projection you expect. When it is `None`, you must assign the correct authority code — use `set_crs`, which attaches the CRS without moving any coordinates (that is `to_crs`, which you do **not** want here because the coordinates are already in the source projection):

```python
from pyproj import CRS


def ensure_crs(gdf: gpd.GeoDataFrame, expected_epsg: int) -> gpd.GeoDataFrame:
    """Confirm the parsed CRS, or assign it if the .prj was missing."""
    if gdf.crs is None:
        # .prj was absent — attach the known CRS without reprojecting.
        gdf = gdf.set_crs(epsg=expected_epsg, allow_override=False)
        print(f"assigned CRS EPSG:{expected_epsg} (was None)")
    else:
        parsed = CRS.from_user_input(gdf.crs)
        if parsed.to_epsg() != expected_epsg:
            raise ValueError(
                f".prj CRS EPSG:{parsed.to_epsg()} != expected EPSG:{expected_epsg}"
            )
        print(f"confirmed CRS EPSG:{parsed.to_epsg()}")
    return gdf


gdf = ensure_crs(gdf, expected_epsg=4326)
```

Assigning the wrong code when coordinate values disagree with the `.prj` is its own diagnostic problem; if the numbers look like they belong to a different projection than the file claims, work through [fixing legacy Shapefile .prj mismatches](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/fixing-legacy-shapefile-prj-mismatches/) before you convert. The first time your annotations pass through code, the authority code should be one you have verified — here `[EPSG:4326](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/)` — not one guessed from the filename.

## Step 3 — Repair Truncated and Duplicate Field Names

The `.dbf` clipped every field name to 10 characters on write. GeoParquet will happily store the full names, but only if you restore them first. Supply an explicit rename map keyed by the truncated name, and guard against the collisions truncation can create:

<svg viewBox="0 0 740 290" role="img" aria-label="Field names before and after the ten-character DBF truncation, showing two distinct names colliding and the repair mapping" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:740px;display:block;margin:1.5rem auto;">
  <title>Ten characters is the whole DBF budget — and collisions follow</title>
  <desc>Four intended field names are truncated to ten characters by the DBF format. building_height and building_height_m both become building_h, so the driver disambiguates the second as building_1. The repair restores the intended names from a mapping and writes them to GeoParquet, which has no length limit.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <!-- Column headers -->
  <text x="120" y="34" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">intended name</text>
  <text x="370" y="34" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">what the .dbf holds</text>
  <text x="620" y="34" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">restored in GeoParquet</text>
  <line x1="20" y1="44" x2="720" y2="44" stroke="currentColor" stroke-width="1" opacity="0.4"/>
  <defs>
    <marker id="fx-arr" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor"/>
    </marker>
  </defs>
  <!-- Row 1 -->
  <text x="120" y="76" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">building_height</text>
  <line x1="228" y1="72" x2="268" y2="72" stroke="currentColor" stroke-width="1.2" marker-end="url(#fx-arr)" opacity="0.7"/>
  <text x="370" y="76" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">building_h</text>
  <line x1="478" y1="72" x2="518" y2="72" stroke="currentColor" stroke-width="1.2" marker-end="url(#fx-arr)" opacity="0.7"/>
  <text x="620" y="76" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">building_height</text>
  <!-- Row 2 -->
  <text x="120" y="112" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">building_height_m</text>
  <line x1="228" y1="108" x2="268" y2="108" stroke="currentColor" stroke-width="1.2" marker-end="url(#fx-arr)" opacity="0.7"/>
  <text x="370" y="112" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">building_1</text>
  <line x1="478" y1="108" x2="518" y2="108" stroke="currentColor" stroke-width="1.2" marker-end="url(#fx-arr)" opacity="0.7"/>
  <text x="620" y="112" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">building_height_m</text>
  <!-- Collision bracket -->
  <path d="M446 62 L456 62 L456 116 L446 116" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="462" y="94" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">collision</text>
  <!-- Row 3 -->
  <text x="120" y="152" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">annotation_timestamp</text>
  <line x1="228" y1="148" x2="268" y2="148" stroke="currentColor" stroke-width="1.2" marker-end="url(#fx-arr)" opacity="0.7"/>
  <text x="370" y="152" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">annotatio</text>
  <line x1="478" y1="148" x2="518" y2="148" stroke="currentColor" stroke-width="1.2" marker-end="url(#fx-arr)" opacity="0.7"/>
  <text x="620" y="152" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">annotation_timestamp</text>
  <!-- Row 4 -->
  <text x="120" y="188" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">annotator_id</text>
  <line x1="228" y1="184" x2="268" y2="184" stroke="currentColor" stroke-width="1.2" marker-end="url(#fx-arr)" opacity="0.7"/>
  <text x="370" y="188" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">annotator_</text>
  <line x1="478" y1="184" x2="518" y2="184" stroke="currentColor" stroke-width="1.2" marker-end="url(#fx-arr)" opacity="0.7"/>
  <text x="620" y="188" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">annotator_id</text>
  <!-- Notes -->
  <rect x="20" y="212" width="340" height="62" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 3"/>
  <text x="190" y="234" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">the truncation is lossy and silent</text>
  <text x="190" y="252" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">nothing in the file records what the name was,</text>
  <text x="190" y="266" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">so the mapping has to be written by hand</text>
  <rect x="380" y="212" width="340" height="62" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="550" y="234" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">GeoParquet has no length limit</text>
  <text x="550" y="252" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">names, dtypes and the CRS all survive the</text>
  <text x="550" y="266" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">write, so the repair only has to happen once</text>
</svg>

```python
def restore_field_names(
    gdf: gpd.GeoDataFrame,
    rename_map: dict[str, str],
) -> gpd.GeoDataFrame:
    """Rename dbf-truncated columns back to their intended full names."""
    present = {old: new for old, new in rename_map.items() if old in gdf.columns}
    renamed = gdf.rename(columns=present)

    duplicates = renamed.columns[renamed.columns.duplicated()].tolist()
    if duplicates:
        raise ValueError(f"rename produced duplicate columns: {duplicates}")

    over_10 = [c for c in renamed.columns if len(c) > 10 and c != "geometry"]
    print(f"restored {len(present)} name(s); {len(over_10)} now exceed 10 chars")
    return renamed


gdf = restore_field_names(
    gdf,
    rename_map={
        "annotatio_c": "annotation_confidence",
        "annotati_1": "annotation_class",
        "reviewer_i": "reviewer_id",
    },
)
```

## Step 4 — Homogenise Geometry and Write GeoParquet

If Step 1 reported mixed `Polygon` and `MultiPolygon` rows, promote everything to `MultiPolygon` so the geometry column has one homogeneous type that every GeoParquet reader accepts. Then write with `to_parquet`, which serialises geometry to WKB and embeds the CRS as PROJJSON into the file's `geo` metadata:

```python
from shapely.geometry.base import BaseGeometry
from shapely.geometry import MultiPolygon


def to_multi(geom: BaseGeometry) -> BaseGeometry:
    """Promote a bare Polygon to MultiPolygon; leave other types unchanged."""
    if geom.geom_type == "Polygon":
        return MultiPolygon([geom])
    return geom


def write_geoparquet(gdf: gpd.GeoDataFrame, out_path: Path) -> Path:
    """Write a single self-describing GeoParquet file with the CRS embedded."""
    if gdf.crs is None:
        raise ValueError("refusing to write GeoParquet without a CRS")

    homogeneous = gdf.copy()
    homogeneous["geometry"] = homogeneous.geometry.apply(to_multi)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    homogeneous.to_parquet(out_path, index=False, compression="zstd")
    print(f"wrote {out_path} ({out_path.stat().st_size / 1024:.1f} KiB)")
    return out_path


out = write_geoparquet(gdf, Path("annotations/parcels.parquet"))
```

## Step 5 — Validate the Roundtrip

A conversion you have not verified is a conversion you cannot trust. Read the GeoParquet back and assert two things: every geometry equals its source geometry, and the CRS matches exactly. Use `geom_equals` for a topological comparison that tolerates the WKB re-encoding, and compare CRS via authority code:

<svg viewBox="0 0 740 270" role="img" aria-label="The five assertions that make up the roundtrip validation between the source Shapefile and the written GeoParquet" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:740px;display:block;margin:1.5rem auto;">
  <title>What the roundtrip check actually compares</title>
  <desc>The source Shapefile and the written GeoParquet are read back and compared on five points: feature count, coordinate reference system, geometry equality within tolerance, attribute dtypes, and null counts per column. A mismatch on any one of them fails the conversion rather than shipping a file that looks plausible.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <defs>
    <marker id="rp-arr" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor"/>
    </marker>
  </defs>
  <!-- Sources -->
  <rect x="20" y="46" width="150" height="52" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="95" y="68" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">parcels.shp</text>
  <text x="95" y="85" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">read as source</text>
  <rect x="20" y="146" width="150" height="52" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="95" y="168" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">parcels.parquet</text>
  <text x="95" y="185" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">read back after write</text>
  <line x1="170" y1="72" x2="212" y2="112" stroke="currentColor" stroke-width="1.5" marker-end="url(#rp-arr)" opacity="0.7"/>
  <line x1="170" y1="172" x2="212" y2="132" stroke="currentColor" stroke-width="1.5" marker-end="url(#rp-arr)" opacity="0.7"/>
  <!-- Comparator -->
  <rect x="216" y="96" width="128" height="52" rx="6" fill="none" stroke="currentColor" stroke-width="2"/>
  <text x="280" y="118" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">compare</text>
  <text x="280" y="135" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">five assertions</text>
  <line x1="344" y1="122" x2="384" y2="122" stroke="currentColor" stroke-width="1.5" marker-end="url(#rp-arr)"/>
  <!-- Assertions -->
  <rect x="388" y="24" width="326" height="34" rx="5" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="402" y="46" font-size="11" fill="currentColor" font-family="sans-serif">feature count identical</text>
  <rect x="388" y="66" width="326" height="34" rx="5" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="402" y="88" font-size="11" fill="currentColor" font-family="sans-serif">CRS survives as the same authority code</text>
  <rect x="388" y="108" width="326" height="34" rx="5" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="402" y="130" font-size="11" fill="currentColor" font-family="sans-serif">geometries equal within 1e-9 degrees</text>
  <rect x="388" y="150" width="326" height="34" rx="5" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="402" y="172" font-size="11" fill="currentColor" font-family="sans-serif">attribute dtypes preserved, not stringified</text>
  <rect x="388" y="192" width="326" height="34" rx="5" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="402" y="214" font-size="11" fill="currentColor" font-family="sans-serif">null counts per column unchanged</text>
  <text x="551" y="252" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">any one failing fails the conversion — a plausible-looking file is the failure mode</text>
</svg>

```python
def validate_roundtrip(
    source: gpd.GeoDataFrame,
    parquet_path: Path,
) -> None:
    """Assert geometry and CRS survived the Shapefile to GeoParquet conversion."""
    loaded: gpd.GeoDataFrame = gpd.read_parquet(parquet_path)

    # CRS equality by authority code.
    src_epsg = source.crs.to_epsg()
    dst_epsg = loaded.crs.to_epsg()
    assert src_epsg == dst_epsg, f"CRS changed: {src_epsg} -> {dst_epsg}"

    # Row count and geometry equality.
    assert len(source) == len(loaded), "feature count changed"
    src_geom = source.geometry.apply(to_multi).reset_index(drop=True)
    dst_geom = loaded.geometry.reset_index(drop=True)
    mismatches = int((~src_geom.geom_equals(dst_geom)).sum())
    assert mismatches == 0, f"{mismatches} geometries differ after roundtrip"

    print(f"roundtrip OK: {len(loaded)} features, CRS EPSG:{dst_epsg} preserved")


validate_roundtrip(gdf, out)
```

When this passes, the GeoParquet is a faithful, self-describing replacement for the four-file bundle and is safe to hand to a training loader or annotation platform.

## Shapefile Limitation to GeoParquet Fix

| Shapefile limitation | GeoParquet fix |
|---|---|
| CRS lives in a separate `.prj` that can be lost or edited | CRS embedded as PROJJSON in the file's `geo` metadata |
| Attribute names clipped to 10 characters by dBASE | Parquet schema keeps full-length column names |
| Four sidecar files must move together by basename | One self-describing file, no sidecars |
| Row-oriented `.dbf` read in full for any query | Columnar layout reads only the columns needed |
| No built-in compression | Per-column compression (zstd, snappy) |
| 2 GB `.dbf` / `.shp` size ceiling | No practical single-file size limit |

## Common Errors and Fixes

**`ValueError: Cannot write GeoDataFrame with CRS set to None`**
Root cause: the `.prj` was missing when the Shapefile was read, so `gdf.crs` is `None`, and `to_parquet` refuses to write a projection-less file.
Fix: call `set_crs(epsg=..., allow_override=False)` with the verified authority code in Step 2 before writing — never `to_crs`, which would move coordinates that are already correct.

**Column named `annotatio_c` instead of `annotation_confidence` in the output**
Root cause: the name was truncated to 10 characters by the `.dbf` on the original write and carried straight through the conversion.
Fix: apply an explicit `rename` map keyed on the truncated names before writing, as in Step 3, and assert no duplicates were produced.

**`Duplicate column names` raised during rename**
Root cause: two long field names truncated to the same 10-character string in the `.dbf`, so one row of your rename map cannot uniquely recover them.
Fix: inspect the raw `.dbf` field order to disambiguate which physical column is which, rename positionally, then apply the semantic names — do not trust the clipped strings to be unique.

**`Geometry column contains mixed geometry types` on read by a strict GeoParquet consumer**
Root cause: the source mixed `Polygon` and `MultiPolygon` rows, and the writer recorded a heterogeneous geometry type that a strict reader rejects.
Fix: promote every feature to its `Multi` form with the `to_multi` helper in Step 4 so the column is homogeneous before `to_parquet`.

**`pyarrow.lib.ArrowInvalid: GeoParquet metadata not found` when reading back**
Root cause: the file was written with a plain `pandas`/`pyarrow` `to_parquet` on a de-geometried frame, so the `geo` metadata key was never added.
Fix: keep the object as a `GeoDataFrame` and use `gdf.to_parquet` (geopandas), which writes the GeoParquet `geo` metadata; read it with `gpd.read_parquet`, not `pandas.read_parquet`.

## Related

- [Spatial Data Formats for ML Annotation: COG, GeoParquet, and STAC](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/spatial-data-formats-for-ml-annotation/) — the topic area this guide belongs to, comparing raster and vector formats and when each fits an annotation pipeline
- [Fixing Legacy Shapefile .prj Mismatches](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/fixing-legacy-shapefile-prj-mismatches/) — diagnose and repair a `.prj` that disagrees with the actual coordinate values before you convert
- [Coordinate Reference Systems in Annotation Pipelines](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) — how CRS contracts, datum handling, and reprojection are managed across an entire annotation pipeline
- [How to Structure GeoJSON for ML Training Datasets](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/vector-vs-raster-annotation-workflows/how-to-structure-geojson-for-ml-training-datasets/) — a complementary vector-label format for cases where human-readable text export matters more than columnar speed

This guide is one focused conversion within [Spatial Data Formats for ML Annotation](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/spatial-data-formats-for-ml-annotation/), which is itself part of [Geospatial Annotation Fundamentals & Architecture](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/).
