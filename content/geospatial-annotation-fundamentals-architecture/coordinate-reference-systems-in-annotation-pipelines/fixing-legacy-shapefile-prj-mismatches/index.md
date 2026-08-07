---
title: "Fixing Legacy Shapefile .prj Mismatches"
description: "Diagnose and repair Shapefiles whose .prj file disagrees with the actual coordinate values, using pyproj and Fiona to detect, override, and correctly re-assign the CRS before ingestion."
slug: "fixing-legacy-shapefile-prj-mismatches"
type: "tutorial"
breadcrumb:
  - label: "Home"
    url: "/"
  - label: "Geospatial Annotation Fundamentals & Architecture"
    url: "/geospatial-annotation-fundamentals-architecture/"
  - label: "Coordinate Reference Systems in Annotation Pipelines"
    url: "/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/"
  - label: "Fixing Legacy Shapefile .prj Mismatches"
    url: "/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/fixing-legacy-shapefile-prj-mismatches/"
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
      "headline": "Fixing Legacy Shapefile .prj Mismatches",
      "description": "Diagnose and repair Shapefiles whose .prj file disagrees with the actual coordinate values, using pyproj and Fiona to detect, override, and correctly re-assign the CRS before ingestion.",
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
        {"@type": "ListItem", "position": 3, "name": "Coordinate Reference Systems in Annotation Pipelines", "item": "https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/"},
        {"@type": "ListItem", "position": 4, "name": "Fixing Legacy Shapefile .prj Mismatches", "item": "https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/fixing-legacy-shapefile-prj-mismatches/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Fixing Legacy Shapefile .prj Mismatches",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Read the declared CRS from the .prj sidecar", "text": "Open the Shapefile with GeoPandas and inspect gdf.crs, which is parsed from the .prj WKT. This is the CRS the file claims, not necessarily the CRS its coordinates were recorded in."},
        {"@type": "HowToStep", "position": 2, "name": "Read the actual coordinate extent", "text": "Compute total_bounds on the raw geometries to obtain the real minx, miny, maxx, maxy of the stored coordinate values before any transformation is applied."},
        {"@type": "HowToStep", "position": 3, "name": "Test the extent against the declared CRS area of use", "text": "Query pyproj for the declared CRS bounds and check whether the coordinate extent plausibly falls inside them. Coordinates far outside the declared bounds prove a mismatch."},
        {"@type": "HowToStep", "position": 4, "name": "Decide override versus reproject", "text": "If the coordinates already sit inside the declared bounds the .prj is correct and only a normal reprojection is needed. If they fall outside, the .prj is wrong: override the CRS with set_crs and no transform before doing anything else."},
        {"@type": "HowToStep", "position": 5, "name": "Apply set_crs then to_crs to the canonical CRS", "text": "For a mismatch, call set_crs(true_crs, allow_override=True) to relabel the geometries without moving them, then to_crs(canonical) to reproject the now-correctly-labelled data into the pipeline's target CRS."},
        {"@type": "HowToStep", "position": 6, "name": "Re-save the repaired Shapefile", "text": "Write the corrected GeoDataFrame back to disk so the emitted .prj matches the coordinate values, guaranteeing every downstream annotation reader ingests the geometry in the right place on Earth."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Should I use set_crs or to_crs to fix a wrong .prj file?",
          "acceptedAnswer": {"@type": "Answer", "text": "Use set_crs when the .prj is wrong. A wrong .prj means the coordinate numbers are already in some CRS but mislabelled; set_crs(allow_override=True) relabels the geometry to its true CRS without moving a single coordinate. to_crs performs a mathematical reprojection and assumes the current label is correct, so calling it on a mislabelled file compounds the error by transforming from a CRS the data was never in. First relabel with set_crs, then reproject with to_crs to your canonical CRS."}
        },
        {
          "@type": "Question",
          "name": "How do I detect that a Shapefile's .prj disagrees with its coordinates?",
          "acceptedAnswer": {"@type": "Answer", "text": "Read the declared CRS from gdf.crs and the real coordinate extent from gdf.total_bounds, then compare the extent against the declared CRS area of use from pyproj. If the .prj claims a geographic CRS in degrees but the coordinates are in the hundreds of thousands, or the extent lies well outside the CRS bounding box, the .prj is lying about the coordinates. Degree-scale numbers where a projected CRS is declared, or the reverse, is the clearest tell."}
        },
        {
          "@type": "Question",
          "name": "Why does reprojecting a mismatched Shapefile move features into the ocean?",
          "acceptedAnswer": {"@type": "Answer", "text": "to_crs trusts the .prj. If the .prj says EPSG:4326 but the coordinates are actually easting/northing metres, pyproj interprets metre values as degrees, runs the WGS84-to-target formula on numbers that are thousands of times too large, and lands the features at nonsensical coordinates far from their true position. The fix is to override the label first so pyproj transforms from the CRS the data was truly recorded in."}
        },
        {
          "@type": "Question",
          "name": "What if a Shapefile has no .prj file at all?",
          "acceptedAnswer": {"@type": "Answer", "text": "A missing .prj leaves gdf.crs as None, so there is no declared CRS to contradict. Infer the true CRS from the coordinate extent and any project documentation, assign it with set_crs, and then reproject as normal. This is the same override path as a wrong .prj, minus the misleading label; the danger is guessing the wrong true CRS, so validate the extent against the candidate CRS bounds before committing."}
        }
      ]
    }
  ]
}
</script>

# Fixing Legacy Shapefile .prj Mismatches

A legacy Shapefile whose `.prj` sidecar declares one [coordinate reference system](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) while its coordinate values were actually recorded in another is one of the quietest data-corruption bugs in a geospatial annotation pipeline. The file loads without error, the geometries look valid, and every downstream tool trusts the `.prj`. The fix is counter-intuitive: you must **override** the CRS with `set_crs` (a pure relabel, no coordinate movement), never **reproject** it with `to_crs`. Reprojecting a mismatched file runs a transform from a CRS the data was never in and scatters features across the globe. Detect the mismatch by testing whether the raw coordinate extent falls inside the declared CRS's valid bounds; if it does not, override to the true CRS, then reproject to your canonical CRS.

## Why a Mislabelled .prj Silently Corrupts Labels

The `.prj` file is nothing more than a text sidecar holding a WKT string. Nothing enforces that it matches the numbers in the `.shp` geometry records. Legacy datasets accumulate mismatches for mundane reasons: someone copied a `.prj` from a neighbouring dataset, an export tool wrote a default WKT regardless of the true projection, or a datum was changed in metadata but never applied to the coordinates. The result is a file that claims `EPSG:4326` degrees while storing UTM eastings and northings, or claims a projected metric CRS while holding decimal degrees.

<svg viewBox="0 0 760 290" role="img" aria-label="The files that make up a Shapefile, showing that only the .prj carries the coordinate reference system and that nothing cross-checks it against the coordinates in the .shp" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:760px;display:block;margin:1.5rem auto;">
  <title>Only one file in the set knows the CRS, and nothing verifies it</title>
  <desc>A Shapefile is a set of sidecar files. The .shp holds raw coordinate pairs, the .dbf attributes, the .shx an index, and the .prj a single WKT string naming the coordinate reference system. Readers trust the .prj without ever testing it against the coordinates in the .shp, so a wrong or stale .prj is accepted silently.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <!-- File set -->
  <rect x="20" y="30" width="150" height="52" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="95" y="52" text-anchor="middle" font-size="12" fill="currentColor" font-family="monospace">parcels.shp</text>
  <text x="95" y="69" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">raw coordinate pairs</text>
  <rect x="20" y="92" width="150" height="52" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="95" y="114" text-anchor="middle" font-size="12" fill="currentColor" font-family="monospace">parcels.dbf</text>
  <text x="95" y="131" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">attribute table</text>
  <rect x="20" y="154" width="150" height="52" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="95" y="176" text-anchor="middle" font-size="12" fill="currentColor" font-family="monospace">parcels.shx</text>
  <text x="95" y="193" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">record index</text>
  <rect x="20" y="216" width="150" height="52" rx="6" fill="none" stroke="currentColor" stroke-width="2"/>
  <text x="95" y="238" text-anchor="middle" font-size="12" fill="currentColor" font-family="monospace" font-weight="600">parcels.prj</text>
  <text x="95" y="255" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">one WKT string</text>
  <!-- Coordinates panel -->
  <rect x="250" y="30" width="230" height="82" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="365" y="52" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.8">what the geometry says</text>
  <text x="365" y="72" text-anchor="middle" font-size="12" fill="currentColor" font-family="monospace">(512340.2, 5401882.7)</text>
  <text x="365" y="92" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">six-figure eastings — metres</text>
  <!-- Declaration panel -->
  <rect x="250" y="186" width="230" height="82" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="365" y="208" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.8">what the .prj declares</text>
  <text x="365" y="228" text-anchor="middle" font-size="12" fill="currentColor" font-family="monospace">GEOGCS["WGS 84"]</text>
  <text x="365" y="248" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">degrees, range −180 to 180</text>
  <!-- Contradiction marker -->
  <line x1="365" y1="112" x2="365" y2="184" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 3"/>
  <text x="374" y="152" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">contradiction</text>
  <!-- Reader -->
  <rect x="540" y="92" width="200" height="112" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 3"/>
  <text x="640" y="118" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">every reader</text>
  <text x="640" y="140" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.8">believes the .prj,</text>
  <text x="640" y="157" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.8">never checks the .shp</text>
  <text x="640" y="180" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">no exception is raised at any</text>
  <text x="640" y="194" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">point in the pipeline</text>
  <line x1="480" y1="148" x2="536" y2="148" stroke="currentColor" stroke-width="1.5"/>
</svg>

Because the file is internally consistent as *bytes*, it passes format validation. The corruption only surfaces geographically: a building footprint annotated at longitude 12.5°, latitude 41.9° gets read as if those degrees were metres, or a 500,000 m easting gets read as 500,000 degrees. When your annotation loader reprojects to the training CRS, the transform amplifies the error, and the label lands hundreds or thousands of kilometres from the imagery it belongs to. Every IoU comparison, every raster clip, every tile join against that feature is then wrong — and nothing raised an exception. This is exactly the failure that a disciplined CRS contract at ingestion is meant to stop.

The critical distinction is between *relabelling* and *transforming*. `set_crs` changes only the metadata attached to the geometries — it asserts "these numbers were always in CRS X" and moves nothing. `to_crs` performs the coordinate math to convert numbers from their currently-labelled CRS into a new one. If the current label is a lie, `to_crs` faithfully transforms garbage. You repair the lie with `set_crs` first, and only then is `to_crs` safe to run.

## Deciding Between Override and Reproject

<svg viewBox="0 0 640 420" role="img" aria-label="Decision tree for repairing a Shapefile whose .prj may disagree with its coordinate values" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:640px;display:block;margin:1.5rem auto;">
  <title>Override versus reproject decision tree for mismatched Shapefile .prj files</title>
  <desc>A flowchart. Start by reading the declared CRS and the raw coordinate extent. Ask whether the coordinates fall inside the declared CRS bounds. If yes, the .prj is correct, so reproject with to_crs to the canonical CRS. If no, the .prj is wrong, so override with set_crs to the true CRS, then reproject with to_crs to the canonical CRS. Both paths end by re-saving the file.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <defs>
    <marker id="dt-arrow" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto">
      <polygon points="0 0, 9 3.5, 0 7" fill="currentColor" opacity="0.55"/>
    </marker>
  </defs>
  <!-- Start -->
  <rect x="200" y="16" width="240" height="46" rx="6" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-width="1.5" opacity="0.85"/>
  <text x="320" y="36" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="bold">Read declared CRS + raw extent</text>
  <text x="320" y="52" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6" font-family="sans-serif">gdf.crs and gdf.total_bounds</text>
  <line x1="320" y1="62" x2="320" y2="90" stroke="currentColor" stroke-width="1.5" opacity="0.5" marker-end="url(#dt-arrow)"/>
  <!-- Decision diamond -->
  <polygon points="320,94 460,150 320,206 180,150" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.75"/>
  <text x="320" y="144" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="bold">Coordinates inside</text>
  <text x="320" y="160" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="bold">declared bounds?</text>
  <!-- Yes branch -->
  <line x1="460" y1="150" x2="540" y2="150" stroke="currentColor" stroke-width="1.5" opacity="0.5" marker-end="url(#dt-arrow)"/>
  <text x="500" y="142" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.75" font-family="sans-serif" font-weight="bold">YES</text>
  <rect x="500" y="196" width="120" height="60" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.6"/>
  <text x="560" y="220" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">.prj is correct</text>
  <text x="560" y="238" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.7" font-family="sans-serif">reproject only</text>
  <line x1="540" y1="150" x2="560" y2="150" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <line x1="560" y1="150" x2="560" y2="194" stroke="currentColor" stroke-width="1.5" opacity="0.5" marker-end="url(#dt-arrow)"/>
  <!-- No branch -->
  <line x1="180" y1="150" x2="100" y2="150" stroke="currentColor" stroke-width="1.5" opacity="0.5" marker-end="url(#dt-arrow)"/>
  <text x="140" y="142" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.75" font-family="sans-serif" font-weight="bold">NO</text>
  <rect x="20" y="196" width="160" height="60" rx="6" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-width="1.5" opacity="0.85"/>
  <text x="100" y="220" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="bold">.prj is wrong</text>
  <text x="100" y="238" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.7" font-family="sans-serif">set_crs(true, override)</text>
  <line x1="80" y1="150" x2="80" y2="150" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <line x1="100" y1="150" x2="100" y2="194" stroke="currentColor" stroke-width="1.5" opacity="0.5" marker-end="url(#dt-arrow)"/>
  <!-- Converge to to_crs -->
  <rect x="220" y="290" width="200" height="52" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.6"/>
  <text x="320" y="312" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="bold">to_crs(canonical CRS)</text>
  <text x="320" y="330" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6" font-family="sans-serif">reproject into pipeline target</text>
  <line x1="100" y1="256" x2="100" y2="316" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <line x1="100" y1="316" x2="218" y2="316" stroke="currentColor" stroke-width="1.5" opacity="0.5" marker-end="url(#dt-arrow)"/>
  <line x1="560" y1="256" x2="560" y2="316" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <line x1="560" y1="316" x2="422" y2="316" stroke="currentColor" stroke-width="1.5" opacity="0.5" marker-end="url(#dt-arrow)"/>
  <!-- Re-save -->
  <line x1="320" y1="342" x2="320" y2="368" stroke="currentColor" stroke-width="1.5" opacity="0.5" marker-end="url(#dt-arrow)"/>
  <rect x="230" y="372" width="180" height="40" rx="6" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-width="1.5" opacity="0.85"/>
  <text x="320" y="397" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="bold">Re-save repaired file</text>
</svg>

The branch that trips people up is the NO path. Both branches end at `to_crs`, but only the wrong-`.prj` branch first passes through `set_crs`. Never skip straight from a detected mismatch to `to_crs` — that is the operation that ruins the geometry.

## Step-by-Step Repair

Install the pinned toolchain once:

```bash
pip install geopandas==0.14.4 pyproj==3.6.1
```

### Step 1 — Read the Declared CRS and the Raw Extent

Load the file and separate two facts that are easy to conflate: what the `.prj` *claims* (`gdf.crs`) and where the coordinates *actually are* (`gdf.total_bounds`). GeoPandas parses the `.prj` WKT into `gdf.crs` on read.

```python
import geopandas as gpd
from pyproj import CRS

def inspect_shapefile(path: str) -> tuple[CRS | None, tuple[float, float, float, float]]:
    """Return the declared CRS from the .prj and the raw coordinate extent."""
    gdf: gpd.GeoDataFrame = gpd.read_file(path)
    declared: CRS | None = CRS.from_user_input(gdf.crs) if gdf.crs else None
    minx, miny, maxx, maxy = map(float, gdf.total_bounds)
    return declared, (minx, miny, maxx, maxy)
```

### Step 2 — Test the Extent Against the Declared CRS Area of Use

`pyproj` exposes each CRS's valid geographic bounds through `area_of_use`. For a projected CRS those bounds are in longitude/latitude, so transform the raw extent into geographic space *using the declared CRS* and check containment. A projected file whose coordinates are secretly degrees will fail this test dramatically, and a geographic file whose coordinates are secretly metres will produce out-of-range longitudes.

<svg viewBox="0 0 700 320" role="img" aria-label="Containment test comparing a declared CRS area of use against the actual extent of the file's coordinates" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:700px;display:block;margin:1.5rem auto;">
  <title>Testing the extent against the declared CRS area of use</title>
  <desc>Two panels. On the left the declared CRS area of use contains the file extent, so the declaration is plausible and only a reprojection is needed. On the right the file extent falls entirely outside the declared area of use, which is the signature of a mislabelled .prj that must be overridden before reprojecting.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <!-- Panel A -->
  <text x="170" y="28" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">extent inside the area of use</text>
  <rect x="40" y="44" width="260" height="180" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.55"/>
  <text x="52" y="64" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">declared CRS area of use</text>
  <rect x="104" y="104" width="120" height="76" rx="4" fill="currentColor" opacity="0.18"/>
  <rect x="104" y="104" width="120" height="76" rx="4" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="164" y="138" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">file extent</text>
  <text x="164" y="156" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">fully contained</text>
  <text x="170" y="248" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">the .prj is plausible</text>
  <text x="170" y="266" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">to_crs() only</text>
  <text x="170" y="288" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">widen the margin near a CRS edge</text>
  <!-- Panel B -->
  <text x="530" y="28" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">extent outside the area of use</text>
  <rect x="400" y="44" width="260" height="180" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.55"/>
  <text x="412" y="64" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">declared CRS area of use</text>
  <rect x="424" y="80" width="96" height="60" rx="4" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="3 2" opacity="0.5"/>
  <text x="472" y="115" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.55">where it should sit</text>
  <rect x="556" y="152" width="120" height="76" rx="4" fill="currentColor" opacity="0.18"/>
  <rect x="556" y="152" width="120" height="76" rx="4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 3"/>
  <text x="616" y="186" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">file extent</text>
  <text x="616" y="204" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">no overlap</text>
  <text x="530" y="248" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">the .prj is wrong</text>
  <text x="530" y="266" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">set_crs(allow_override=True)</text>
  <text x="530" y="288" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">then, and only then, to_crs()</text>
</svg>

```python
from pyproj import CRS, Transformer

def extent_fits_declared_crs(
    declared: CRS,
    extent: tuple[float, float, float, float],
    margin: float = 0.5,
) -> bool:
    """True if the raw extent plausibly falls inside the declared CRS area of use."""
    aou = declared.area_of_use
    if aou is None:
        return True  # cannot disprove; treat as inconclusive

    minx, miny, maxx, maxy = extent
    to_geographic = Transformer.from_crs(declared, declared.geodetic_crs, always_xy=True)
    try:
        lon_min, lat_min = to_geographic.transform(minx, miny)
        lon_max, lat_max = to_geographic.transform(maxx, maxy)
    except Exception:
        return False

    within_lon = (aou.west - margin) <= lon_min and lon_max <= (aou.east + margin)
    within_lat = (aou.south - margin) <= lat_min and lat_max <= (aou.north + margin)
    return within_lon and within_lat
```

### Step 3 — Decide Override Versus Reproject

Wrap the test in a decision. If the extent fits, the `.prj` is trustworthy and the file needs only a routine reprojection. If it does not, the `.prj` is wrong and must be overridden to the CRS the coordinates were truly recorded in — a value you supply from project documentation, the source system, or an educated read of the extent's magnitude and location.

```python
from dataclasses import dataclass

@dataclass
class RepairPlan:
    needs_override: bool
    reason: str

def plan_repair(declared: CRS, extent: tuple[float, float, float, float]) -> RepairPlan:
    """Decide whether the file needs a CRS override before reprojection."""
    if extent_fits_declared_crs(declared, extent):
        return RepairPlan(needs_override=False, reason="coordinates fit declared CRS")
    return RepairPlan(
        needs_override=True,
        reason="coordinates fall outside declared CRS bounds; .prj is mislabelled",
    )
```

### Step 4 — Apply set_crs Then to_crs

On the override path, `set_crs(true_crs, allow_override=True)` relabels the geometries in place — no coordinate moves — and only afterwards does `to_crs(canonical)` reproject into your pipeline's target. On the correct-`.prj` path you skip `set_crs` entirely. The canonical target here is `EPSG:4326`; the first appearance of that code links to the broader CRS reference. Choosing one canonical CRS for the whole pipeline is covered in [CRS roundtrip testing with pyproj](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/crs-roundtrip-testing-with-pyproj/).

```python
def repair_crs(
    path: str,
    true_crs: str,
    canonical: str = "EPSG:4326",
) -> gpd.GeoDataFrame:
    """Detect, override if needed, and reproject a Shapefile to the canonical CRS."""
    gdf: gpd.GeoDataFrame = gpd.read_file(path)
    declared = CRS.from_user_input(gdf.crs)
    extent = tuple(map(float, gdf.total_bounds))

    plan = plan_repair(declared, extent)
    if plan.needs_override:
        # RELABEL only — no coordinates move.
        gdf = gdf.set_crs(true_crs, allow_override=True)

    # Now the label is trustworthy, so transforming is safe.
    return gdf.to_crs(canonical)
```

The first appearance of [`EPSG:4326`](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) as the canonical target is deliberate: pick one target CRS and normalise every ingested file to it.

### Step 5 — Re-Save the Repaired File

Persist the corrected GeoDataFrame so the emitted `.prj` finally matches the coordinates. Every downstream reader — QGIS, a tiling job, a training-data loader — now ingests the geometry in the right place without needing to know the file was ever broken.

```python
def save_repaired(gdf: gpd.GeoDataFrame, out_path: str) -> None:
    """Write the repaired GeoDataFrame; the new .prj matches the coordinates."""
    gdf.to_file(out_path, driver="ESRI Shapefile")
```

## Symptom, Diagnosis, and the Right Call

| Symptom | Diagnosis | Correct operation |
|---|---|---|
| `.prj` says `EPSG:4326` but coordinates are in the hundreds of thousands | Coordinates are projected metres; label is geographic | `set_crs(true_utm, allow_override=True)` then `to_crs` |
| `.prj` says a UTM/metric CRS but coordinates are small decimals (−180…180) | Coordinates are degrees; label is projected | `set_crs("EPSG:4326", allow_override=True)` then `to_crs` |
| Features load at the correct place; only the target CRS differs | `.prj` is accurate; routine change of CRS | `to_crs` only — no override |
| `gdf.crs` is `None` (no `.prj`) | No declared CRS to contradict | `set_crs(inferred_crs)` then `to_crs` |
| Reprojected features land in the ocean or at (0, 0) | `to_crs` was run on a mislabelled file | Undo, `set_crs` the true CRS, then `to_crs` |
| Extent passes containment test after margin widening | `.prj` correct but near a CRS edge | `to_crs` only; do not override |

## Common Errors and Fixes

**Reprojected annotations land far from the imagery**
Root cause: `to_crs` was called on a file whose `.prj` disagreed with its coordinates, so the transform ran from the wrong source CRS.
Fix: re-read the original file, call `set_crs(true_crs, allow_override=True)` to correct the label, then `to_crs(canonical)`.

**`ValueError: The CRS attribute of a GeoDataFrame ... already has a CRS which is not equal`**
Root cause: `set_crs` was called on a file that already carries a CRS, without permission to replace it.
Fix: pass `allow_override=True` — you are intentionally relabelling a mislabelled file.

**Override produced no visible change and features are still wrong**
Root cause: `set_crs` relabels but never moves coordinates, so if you supplied the wrong `true_crs` the geometry stays misplaced.
Fix: verify `true_crs` against the extent magnitude and `area_of_use` before overriding; degree-scale numbers imply a geographic CRS, metre-scale numbers a projected one.

**`CRSError: Invalid projection` when reading the extent**
Root cause: the `.prj` WKT is malformed or empty, so `gdf.crs` is `None` or unparseable.
Fix: treat it as the missing-`.prj` case — infer the true CRS, assign with `set_crs`, then reproject.

**Round-tripped file still confuses a downstream tool**
Root cause: field-name truncation or geometry rewriting during `to_file`, unrelated to the CRS repair.
Fix: prefer a modern container; [converting Shapefiles to GeoParquet](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/spatial-data-formats-for-ml-annotation/converting-shapefiles-to-geoparquet-for-annotation/) removes the sidecar `.prj` entirely by embedding the CRS in the file.

## Related

- [Coordinate Reference Systems in Annotation Pipelines](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) — parent guide covering CRS contracts, datum handling, and reprojection patterns across a full annotation pipeline
- [CRS Roundtrip Testing with pyproj](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/crs-roundtrip-testing-with-pyproj/) — assert that a reproject-out-and-back drift stays under tolerance, catching the lossy transforms and axis-order bugs a repaired file can still hide
- [Converting Shapefiles to GeoParquet for Annotation](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/spatial-data-formats-for-ml-annotation/converting-shapefiles-to-geoparquet-for-annotation/) — retire the fragile `.prj` sidecar by embedding the CRS directly in a modern columnar format

This guide covers one repair within [Coordinate Reference Systems in Annotation Pipelines](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/), which is itself part of [Geospatial Annotation Fundamentals & Architecture](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/).
