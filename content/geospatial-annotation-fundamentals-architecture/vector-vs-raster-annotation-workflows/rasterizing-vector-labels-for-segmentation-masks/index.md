---
title: "Rasterizing Vector Labels for Segmentation Masks"
description: "Rasterize GeoJSON polygon labels into aligned segmentation masks with rasterio.features.rasterize — matching the image geotransform, handling overlaps and class priority, and validating pixel alignment."
slug: "rasterizing-vector-labels-for-segmentation-masks"
type: "tutorial"
breadcrumb:
  - label: "Home"
    url: "/"
  - label: "Geospatial Annotation Fundamentals & Architecture"
    url: "/geospatial-annotation-fundamentals-architecture/"
  - label: "Vector vs Raster Annotation Workflows"
    url: "/geospatial-annotation-fundamentals-architecture/vector-vs-raster-annotation-workflows/"
  - label: "Rasterizing Vector Labels for Segmentation Masks"
    url: "/geospatial-annotation-fundamentals-architecture/vector-vs-raster-annotation-workflows/rasterizing-vector-labels-for-segmentation-masks/"
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
      "headline": "Rasterizing Vector Labels for Segmentation Masks",
      "description": "Rasterize GeoJSON polygon labels into aligned segmentation masks with rasterio.features.rasterize — matching the image geotransform, handling overlaps and class priority, and validating pixel alignment.",
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
        {"@type": "ListItem", "position": 3, "name": "Vector vs Raster Annotation Workflows", "item": "https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/vector-vs-raster-annotation-workflows/"},
        {"@type": "ListItem", "position": 4, "name": "Rasterizing Vector Labels for Segmentation Masks", "item": "https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/vector-vs-raster-annotation-workflows/rasterizing-vector-labels-for-segmentation-masks/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Rasterizing Vector Labels for Segmentation Masks",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Read the target raster's transform and shape", "text": "Open the reference image with rasterio and capture its affine transform, height, width, and CRS so the mask is generated on the exact same grid as the imagery."},
        {"@type": "HowToStep", "position": 2, "name": "Reproject vector labels to the raster CRS", "text": "Load the GeoJSON with geopandas and reproject every geometry to the raster's CRS before burning, so vector coordinates and pixel coordinates share one projection."},
        {"@type": "HowToStep", "position": 3, "name": "Build (geometry, class_value) shape pairs ordered by priority", "text": "Sort features so higher-priority classes are burned last, then pair each geometry with its integer class value for rasterize."},
        {"@type": "HowToStep", "position": 4, "name": "Call rasterio.features.rasterize with out_shape and transform", "text": "Pass the ordered shapes, the raster out_shape, the affine transform, a fill value for background, and an integer dtype to produce a class-indexed mask array."},
        {"@type": "HowToStep", "position": 5, "name": "Write a georeferenced mask GeoTIFF", "text": "Write the mask array with the same transform and CRS as the imagery so the mask carries georeferencing and stays reusable."},
        {"@type": "HowToStep", "position": 6, "name": "Validate pixel alignment by overlay", "text": "Re-read the mask, confirm its transform and shape match the imagery exactly, and overlay non-background pixels against the source polygons to confirm alignment."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why must I pass the target image's affine transform to rasterio.features.rasterize?",
          "acceptedAnswer": {"@type": "Answer", "text": "The transform maps world coordinates to pixel row/column indices. If you omit it, rasterize defaults to the identity transform and treats geometry coordinates as raw pixel positions, so a polygon at UTM easting 500000 lands at column 500000 instead of the correct pixel. Passing the imagery's exact transform and out_shape guarantees the burned mask sits on the same grid as the pixels the model sees, aligned to within a single pixel."}
        },
        {
          "@type": "Question",
          "name": "How do I resolve overlapping polygons of different classes when rasterizing?",
          "acceptedAnswer": {"@type": "Answer", "text": "rasterize burns shapes in order and later shapes overwrite earlier ones in overlapping cells, so sort the (geometry, value) pairs by a class-priority rank and place the highest-priority class last. This makes overlap resolution deterministic: a building polygon that sits inside a parcel polygon wins the shared pixels when building outranks parcel. Never rely on the incoming feature order from the GeoJSON — it is not stable."}
        },
        {
          "@type": "Question",
          "name": "What does all_touched=True change in a segmentation mask?",
          "acceptedAnswer": {"@type": "Answer", "text": "By default rasterize burns only pixels whose centre falls inside a polygon. With all_touched=True it burns every pixel the polygon boundary touches, which thickens thin features and inflates class area at object edges. Use all_touched=True for narrow linear features like roads that would otherwise drop out, and keep it False for area classes where centre-based sampling matches how detectors are trained and evaluated."}
        },
        {
          "@type": "Question",
          "name": "Why is my rasterized mask empty even though the GeoJSON has polygons?",
          "acceptedAnswer": {"@type": "Answer", "text": "The most common cause is a CRS mismatch: vector coordinates in one projection and a transform from imagery in another, so the geometries fall entirely outside the raster extent and nothing burns. Reproject the GeoDataFrame to the raster CRS before building shapes, and confirm the vector bounds intersect the raster bounds. A fill value equal to a real class value can also make a mask look empty when it is actually all background."}
        }
      ]
    }
  ]
}
</script>

# Rasterizing Vector Labels for Segmentation Masks

Semantic segmentation models train on dense per-pixel class arrays, but human annotators draw vector polygons. Converting those polygons into a mask that lines up with the imagery is the job of `rasterio.features.rasterize`, and the single rule that makes it correct is this: generate the mask with the **target image's affine transform and shape**, not a default grid. Pass the function a sequence of `(geometry, class_value)` pairs, set an explicit `fill` for background and the right `all_touched` behaviour, resolve overlapping polygons by burning higher-priority classes last, and write the result as a georeferenced GeoTIFF. Do that and every mask pixel corresponds to exactly the imagery pixel the network will read.

## Why Misaligned Masks Silently Teach the Wrong Pixels

A rasterization bug never raises an exception. `rasterize` happily returns an array of the shape you asked for whether or not the geometries landed where they should, so a mask that is shifted by a few pixels, flipped in the vertical axis, or burned on the wrong grid looks completely normal in a file listing. The damage surfaces only as a stubborn accuracy ceiling: the model is being taught that the roof pixels are sky and the road pixels are grass, and it dutifully learns the offset. Because the error is systematic rather than random, more training data does not wash it out — it reinforces it.

The alignment contract has two halves. The vector coordinates must be expressed in the same [coordinate reference system](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) as the raster, and the burn must use the raster's own affine transform to convert those world coordinates into row and column indices. Skip the reprojection and the polygons land off the tile entirely; skip the transform and `rasterize` falls back to the identity matrix, treating a UTM easting of 500000 as pixel column 500000. Both failures produce a file, and only a deliberate overlay check tells them apart from a correct mask.

<svg viewBox="0 0 640 300" role="img" aria-label="Diagram showing vector polygons and an image pixel grid combined through rasterize into a class-indexed mask aligned to the image transform" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:640px;display:block;margin:1.5rem auto;">
  <title>Rasterizing vector labels onto the image grid</title>
  <desc>On the left, two overlapping vector polygons labelled with class values sit over a georeferenced image pixel grid. A central rasterize step consumes the image affine transform and output shape. On the right, a class-indexed segmentation mask shows discrete pixel cells coloured by class, aligned one-to-one with the input grid.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <defs>
    <marker id="ar" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto">
      <polygon points="0 0, 9 3.5, 0 7" fill="currentColor" opacity="0.5"/>
    </marker>
  </defs>
  <!-- Left: vectors over grid -->
  <text x="105" y="28" text-anchor="middle" font-size="12" fill="currentColor" opacity="0.85" font-family="sans-serif" font-weight="bold">Vectors + image grid</text>
  <g stroke="currentColor" stroke-width="1" opacity="0.22">
    <line x1="30" y1="45" x2="30" y2="205"/>
    <line x1="60" y1="45" x2="60" y2="205"/>
    <line x1="90" y1="45" x2="90" y2="205"/>
    <line x1="120" y1="45" x2="120" y2="205"/>
    <line x1="150" y1="45" x2="150" y2="205"/>
    <line x1="180" y1="45" x2="180" y2="205"/>
    <line x1="30" y1="45" x2="180" y2="45"/>
    <line x1="30" y1="75" x2="180" y2="75"/>
    <line x1="30" y1="105" x2="180" y2="105"/>
    <line x1="30" y1="135" x2="180" y2="135"/>
    <line x1="30" y1="165" x2="180" y2="165"/>
    <line x1="30" y1="195" x2="180" y2="195"/>
    <line x1="30" y1="205" x2="180" y2="205"/>
  </g>
  <polygon points="48,66 138,58 150,132 60,150" fill="currentColor" fill-opacity="0.10" stroke="currentColor" stroke-width="2" stroke-opacity="0.75"/>
  <text x="92" y="100" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.8" font-family="sans-serif">parcel = 1</text>
  <polygon points="96,110 168,104 176,182 104,192" fill="currentColor" fill-opacity="0.22" stroke="currentColor" stroke-width="2" stroke-dasharray="5 3" stroke-opacity="0.8"/>
  <text x="140" y="160" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.85" font-family="sans-serif">building = 2</text>
  <!-- Center: rasterize -->
  <line x1="178" y1="125" x2="250" y2="125" stroke="currentColor" stroke-width="1.5" opacity="0.5" marker-end="url(#ar)"/>
  <rect x="256" y="95" width="128" height="72" rx="7" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="320" y="123" text-anchor="middle" font-size="12" fill="currentColor" opacity="0.9" font-family="sans-serif" font-weight="bold">rasterize()</text>
  <text x="320" y="141" text-anchor="middle" font-size="9.5" fill="currentColor" opacity="0.6" font-family="sans-serif">transform + out_shape</text>
  <text x="320" y="156" text-anchor="middle" font-size="9.5" fill="currentColor" opacity="0.6" font-family="sans-serif">priority order, fill=0</text>
  <line x1="390" y1="125" x2="444" y2="125" stroke="currentColor" stroke-width="1.5" opacity="0.5" marker-end="url(#ar)"/>
  <!-- Right: mask -->
  <text x="545" y="28" text-anchor="middle" font-size="12" fill="currentColor" opacity="0.85" font-family="sans-serif" font-weight="bold">Class-indexed mask</text>
  <g font-family="sans-serif" font-size="10" text-anchor="middle">
    <!-- 5x5 cells -->
    <!-- row build helper via explicit rects -->
    <rect x="460" y="45" width="30" height="30" fill="currentColor" fill-opacity="0.04" stroke="currentColor" stroke-opacity="0.25"/>
    <rect x="490" y="45" width="30" height="30" fill="currentColor" fill-opacity="0.10" stroke="currentColor" stroke-opacity="0.25"/>
    <rect x="520" y="45" width="30" height="30" fill="currentColor" fill-opacity="0.10" stroke="currentColor" stroke-opacity="0.25"/>
    <rect x="550" y="45" width="30" height="30" fill="currentColor" fill-opacity="0.04" stroke="currentColor" stroke-opacity="0.25"/>
    <rect x="580" y="45" width="30" height="30" fill="currentColor" fill-opacity="0.04" stroke="currentColor" stroke-opacity="0.25"/>
    <rect x="460" y="75" width="30" height="30" fill="currentColor" fill-opacity="0.10" stroke="currentColor" stroke-opacity="0.25"/>
    <rect x="490" y="75" width="30" height="30" fill="currentColor" fill-opacity="0.10" stroke="currentColor" stroke-opacity="0.25"/>
    <rect x="520" y="75" width="30" height="30" fill="currentColor" fill-opacity="0.22" stroke="currentColor" stroke-opacity="0.25"/>
    <rect x="550" y="75" width="30" height="30" fill="currentColor" fill-opacity="0.10" stroke="currentColor" stroke-opacity="0.25"/>
    <rect x="580" y="75" width="30" height="30" fill="currentColor" fill-opacity="0.04" stroke="currentColor" stroke-opacity="0.25"/>
    <rect x="460" y="105" width="30" height="30" fill="currentColor" fill-opacity="0.10" stroke="currentColor" stroke-opacity="0.25"/>
    <rect x="490" y="105" width="30" height="30" fill="currentColor" fill-opacity="0.22" stroke="currentColor" stroke-opacity="0.25"/>
    <rect x="520" y="105" width="30" height="30" fill="currentColor" fill-opacity="0.22" stroke="currentColor" stroke-opacity="0.25"/>
    <rect x="550" y="105" width="30" height="30" fill="currentColor" fill-opacity="0.22" stroke="currentColor" stroke-opacity="0.25"/>
    <rect x="580" y="105" width="30" height="30" fill="currentColor" fill-opacity="0.10" stroke="currentColor" stroke-opacity="0.25"/>
    <rect x="460" y="135" width="30" height="30" fill="currentColor" fill-opacity="0.04" stroke="currentColor" stroke-opacity="0.25"/>
    <rect x="490" y="135" width="30" height="30" fill="currentColor" fill-opacity="0.10" stroke="currentColor" stroke-opacity="0.25"/>
    <rect x="520" y="135" width="30" height="30" fill="currentColor" fill-opacity="0.22" stroke="currentColor" stroke-opacity="0.25"/>
    <rect x="550" y="135" width="30" height="30" fill="currentColor" fill-opacity="0.22" stroke="currentColor" stroke-opacity="0.25"/>
    <rect x="580" y="135" width="30" height="30" fill="currentColor" fill-opacity="0.04" stroke="currentColor" stroke-opacity="0.25"/>
    <rect x="460" y="165" width="30" height="30" fill="currentColor" fill-opacity="0.04" stroke="currentColor" stroke-opacity="0.25"/>
    <rect x="490" y="165" width="30" height="30" fill="currentColor" fill-opacity="0.04" stroke="currentColor" stroke-opacity="0.25"/>
    <rect x="520" y="165" width="30" height="30" fill="currentColor" fill-opacity="0.10" stroke="currentColor" stroke-opacity="0.25"/>
    <rect x="550" y="165" width="30" height="30" fill="currentColor" fill-opacity="0.10" stroke="currentColor" stroke-opacity="0.25"/>
    <rect x="580" y="165" width="30" height="30" fill="currentColor" fill-opacity="0.04" stroke="currentColor" stroke-opacity="0.25"/>
  </g>
  <!-- legend -->
  <rect x="460" y="212" width="13" height="13" fill="currentColor" fill-opacity="0.04" stroke="currentColor" stroke-opacity="0.3"/>
  <text x="479" y="223" font-size="10" fill="currentColor" opacity="0.7" font-family="sans-serif">0 background</text>
  <rect x="460" y="232" width="13" height="13" fill="currentColor" fill-opacity="0.10" stroke="currentColor" stroke-opacity="0.3"/>
  <text x="479" y="243" font-size="10" fill="currentColor" opacity="0.7" font-family="sans-serif">1 parcel</text>
  <rect x="560" y="232" width="13" height="13" fill="currentColor" fill-opacity="0.22" stroke="currentColor" stroke-opacity="0.3"/>
  <text x="579" y="243" font-size="10" fill="currentColor" opacity="0.7" font-family="sans-serif">2 building</text>
  <text x="320" y="250" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.6" font-family="sans-serif">building (higher priority) burned last wins shared cells</text>
</svg>

## Step-by-Step Implementation

Install the pinned toolchain once. These versions are mutually compatible and match the CRS-handling behaviour the rest of this guide assumes:

```bash
pip install rasterio==1.3.10 geopandas==0.14.4 shapely==2.0.6 numpy==1.26.4
```

### Step 1 — Read the Target Raster's Transform and Shape

The mask must be born on the imagery's grid, so the first move is to extract that grid. Open the reference GeoTIFF and capture its `transform`, `height`, `width`, and `crs`. Everything downstream is derived from these four values:

```python
from dataclasses import dataclass
import rasterio
from rasterio.transform import Affine
from rasterio.crs import CRS


@dataclass(frozen=True)
class RasterGrid:
    transform: Affine
    height: int
    width: int
    crs: CRS


def read_grid(image_path: str) -> RasterGrid:
    """Capture the exact grid definition of the reference imagery."""
    with rasterio.open(image_path) as src:
        return RasterGrid(
            transform=src.transform,
            height=src.height,
            width=src.width,
            crs=src.crs,
        )
```

### Step 2 — Reproject Vector Labels to the Raster CRS

Load the GeoJSON with `geopandas` and force it into the raster's CRS. Even when the labels claim to be in the imagery's projection, an explicit `to_crs` guards against silent axis-order and datum surprises. This mirrors the schema discipline covered in [how to structure GeoJSON for ML training datasets](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/vector-vs-raster-annotation-workflows/how-to-structure-geojson-for-ml-training-datasets/):

```python
import geopandas as gpd


def load_labels(geojson_path: str, grid: RasterGrid,
                class_field: str = "class_id") -> gpd.GeoDataFrame:
    """Load vector labels and reproject them onto the raster CRS."""
    gdf = gpd.read_file(geojson_path)
    if gdf.crs is None:
        raise ValueError("Label GeoJSON has no CRS; cannot align to imagery.")
    gdf = gdf.to_crs(grid.crs)
    gdf = gdf[gdf.geometry.notna() & ~gdf.geometry.is_empty]
    if class_field not in gdf.columns:
        raise KeyError(f"Expected class field '{class_field}' in labels.")
    return gdf
```

### Step 3 — Build (geometry, value) Shapes Ordered by Priority

`rasterize` burns shapes sequentially and later shapes overwrite earlier ones. That behaviour is a feature: sort features so that the highest-priority class is burned last, and overlap resolution becomes deterministic. Here a small priority map decides who wins shared pixels — a building inside a parcel keeps the pixels because building outranks parcel:

```python
from shapely.geometry.base import BaseGeometry


def build_shapes(
    gdf: gpd.GeoDataFrame,
    class_field: str,
    priority: dict[int, int],
) -> list[tuple[BaseGeometry, int]]:
    """
    Return (geometry, class_value) pairs sorted so higher-priority
    classes burn last and therefore win overlapping cells.
    """
    def rank(class_id: int) -> int:
        return priority.get(class_id, 0)

    ordered = gdf.sort_values(
        by=class_field, key=lambda s: s.map(rank)
    )
    shapes: list[tuple[BaseGeometry, int]] = [
        (geom, int(value))
        for geom, value in zip(ordered.geometry, ordered[class_field])
    ]
    return shapes
```

### Step 4 — Rasterize With out_shape and transform

This is the core call. Pass the ordered shapes, the raster `out_shape` as `(height, width)`, the imagery's `transform`, a background `fill`, and an integer `dtype`. Keep `all_touched=False` for area classes so only pixel centres inside a polygon are burned:

<svg viewBox="0 0 700 300" role="img" aria-label="The same polygon rasterized with all_touched false and true, showing which pixels each rule claims" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:700px;display:block;margin:1.5rem auto;">
  <title>all_touched changes which pixels the label owns</title>
  <desc>One polygon over a pixel grid, rasterized twice. With all_touched false, only pixels whose centre falls inside the polygon are burned, so thin features can vanish entirely. With all_touched true, every pixel the polygon touches is burned, which recovers thin features but inflates area and lets neighbouring classes fight over the same boundary pixels.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <!-- Panel A -->
  <text x="160" y="30" text-anchor="middle" font-size="12" fill="currentColor" font-family="monospace" font-weight="600">all_touched=False</text>
  <text x="160" y="46" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">pixel centre must fall inside</text>
  <g>
    <rect x="60" y="60" width="200" height="160" fill="none" stroke="currentColor" stroke-width="1" opacity="0.5"/>
    <rect x="100" y="100" width="120" height="80" fill="currentColor" opacity="0.28"/>
    <line x1="100" y1="60" x2="100" y2="220" stroke="currentColor" stroke-width="0.8" opacity="0.35"/>
    <line x1="140" y1="60" x2="140" y2="220" stroke="currentColor" stroke-width="0.8" opacity="0.35"/>
    <line x1="180" y1="60" x2="180" y2="220" stroke="currentColor" stroke-width="0.8" opacity="0.35"/>
    <line x1="220" y1="60" x2="220" y2="220" stroke="currentColor" stroke-width="0.8" opacity="0.35"/>
    <line x1="60" y1="100" x2="260" y2="100" stroke="currentColor" stroke-width="0.8" opacity="0.35"/>
    <line x1="60" y1="140" x2="260" y2="140" stroke="currentColor" stroke-width="0.8" opacity="0.35"/>
    <line x1="60" y1="180" x2="260" y2="180" stroke="currentColor" stroke-width="0.8" opacity="0.35"/>
    <polygon points="86,126 214,92 232,168 108,196" fill="none" stroke="currentColor" stroke-width="2"/>
    <circle cx="120" cy="120" r="2.5" fill="currentColor" opacity="0.5"/>
    <circle cx="160" cy="120" r="2.5" fill="currentColor" opacity="0.5"/>
    <circle cx="200" cy="120" r="2.5" fill="currentColor" opacity="0.5"/>
    <circle cx="120" cy="160" r="2.5" fill="currentColor" opacity="0.5"/>
    <circle cx="160" cy="160" r="2.5" fill="currentColor" opacity="0.5"/>
    <circle cx="200" cy="160" r="2.5" fill="currentColor" opacity="0.5"/>
  </g>
  <text x="160" y="244" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">6 pixels burned</text>
  <text x="160" y="264" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">a footpath narrower than one pixel</text>
  <text x="160" y="278" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">disappears from the mask entirely</text>
  <!-- Panel B -->
  <text x="500" y="30" text-anchor="middle" font-size="12" fill="currentColor" font-family="monospace" font-weight="600">all_touched=True</text>
  <text x="500" y="46" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">any overlap claims the pixel</text>
  <g>
    <rect x="400" y="60" width="200" height="160" fill="none" stroke="currentColor" stroke-width="1" opacity="0.5"/>
    <rect x="400" y="100" width="200" height="120" fill="currentColor" opacity="0.28"/>
    <line x1="440" y1="60" x2="440" y2="220" stroke="currentColor" stroke-width="0.8" opacity="0.35"/>
    <line x1="480" y1="60" x2="480" y2="220" stroke="currentColor" stroke-width="0.8" opacity="0.35"/>
    <line x1="520" y1="60" x2="520" y2="220" stroke="currentColor" stroke-width="0.8" opacity="0.35"/>
    <line x1="560" y1="60" x2="560" y2="220" stroke="currentColor" stroke-width="0.8" opacity="0.35"/>
    <line x1="400" y1="100" x2="600" y2="100" stroke="currentColor" stroke-width="0.8" opacity="0.35"/>
    <line x1="400" y1="140" x2="600" y2="140" stroke="currentColor" stroke-width="0.8" opacity="0.35"/>
    <line x1="400" y1="180" x2="600" y2="180" stroke="currentColor" stroke-width="0.8" opacity="0.35"/>
    <polygon points="426,126 554,92 572,168 448,196" fill="none" stroke="currentColor" stroke-width="2"/>
  </g>
  <text x="500" y="244" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">15 pixels burned</text>
  <text x="500" y="264" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">thin features survive, but area inflates and</text>
  <text x="500" y="278" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">adjacent classes contend for edge pixels</text>
</svg>

```python
import numpy as np
from rasterio.features import rasterize


def burn_mask(
    shapes: list[tuple[BaseGeometry, int]],
    grid: RasterGrid,
    fill: int = 0,
    all_touched: bool = False,
    dtype: str = "uint8",
) -> np.ndarray:
    """Burn vector shapes into a class-indexed mask on the imagery grid."""
    mask = rasterize(
        shapes=shapes,
        out_shape=(grid.height, grid.width),
        transform=grid.transform,
        fill=fill,
        all_touched=all_touched,
        dtype=dtype,
    )
    return mask
```

### Step 5 — Write a Georeferenced Mask GeoTIFF

Persist the mask with the same `transform` and `crs` as the imagery so it carries georeferencing and can be reprojected, tiled, or overlaid later without guesswork:

```python
def write_mask(mask: np.ndarray, grid: RasterGrid, out_path: str) -> None:
    """Write the mask as a single-band georeferenced GeoTIFF."""
    with rasterio.open(
        out_path,
        "w",
        driver="GTiff",
        height=grid.height,
        width=grid.width,
        count=1,
        dtype=mask.dtype,
        crs=grid.crs,
        transform=grid.transform,
        compress="deflate",
        nodata=None,
    ) as dst:
        dst.write(mask, 1)
```

### Step 6 — Validate Alignment by Overlay

Rasterization never throws on misalignment, so validate deliberately. Re-read the mask, assert its transform and shape match the imagery exactly, then confirm that burned pixels fall inside the original polygons by sampling a geometry's representative point back through the inverse transform:

<svg viewBox="0 0 720 290" role="img" aria-label="Overlay check comparing a correctly aligned mask against one shifted by half a pixel, with the resulting IoU" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>The overlay check that catches a half-pixel origin error</title>
  <desc>Two overlays of the rendered mask on the source imagery footprint. On the left the mask edge follows the roof line and the IoU against a reference rasterization is 0.99. On the right the mask sits half a pixel up and left, because the transform origin was read as a pixel centre rather than a corner; the edges no longer coincide and the IoU falls to 0.86, which at 30 cm ground sample distance is a 15 centimetre systematic shift on every label.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <!-- Correct -->
  <text x="170" y="30" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">origin read as pixel corner</text>
  <rect x="60" y="46" width="220" height="150" fill="none" stroke="currentColor" stroke-width="1" opacity="0.45"/>
  <polygon points="100,86 240,74 250,158 110,172" fill="none" stroke="currentColor" stroke-width="2"/>
  <polygon points="100,86 240,74 250,158 110,172" fill="currentColor" opacity="0.2"/>
  <text x="170" y="126" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">mask edge on the roof line</text>
  <text x="170" y="220" text-anchor="middle" font-size="12" fill="currentColor" font-family="monospace">IoU 0.99</text>
  <text x="170" y="242" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">residual is antialiasing at the corners</text>
  <!-- Shifted -->
  <text x="530" y="30" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">origin read as pixel centre</text>
  <rect x="420" y="46" width="220" height="150" fill="none" stroke="currentColor" stroke-width="1" opacity="0.45"/>
  <polygon points="460,86 600,74 610,158 470,172" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 3" opacity="0.6"/>
  <polygon points="452,78 592,66 602,150 462,164" fill="currentColor" opacity="0.2"/>
  <polygon points="452,78 592,66 602,150 462,164" fill="none" stroke="currentColor" stroke-width="2"/>
  <text x="530" y="126" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">mask sits half a pixel up and left</text>
  <text x="530" y="220" text-anchor="middle" font-size="12" fill="currentColor" font-family="monospace">IoU 0.86</text>
  <text x="530" y="242" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">15 cm of systematic shift at 30 cm GSD —</text>
  <text x="530" y="256" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">on every label, in the same direction</text>
  <text x="170" y="270" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">run this on one tile before rendering the batch</text>
</svg>

```python
from rasterio.transform import rowcol


def validate_alignment(
    mask_path: str,
    grid: RasterGrid,
    gdf: gpd.GeoDataFrame,
    class_field: str,
) -> None:
    """Assert grid parity and that sampled polygon interiors carry a class."""
    with rasterio.open(mask_path) as src:
        assert src.transform == grid.transform, "Mask transform drifted from imagery."
        assert (src.height, src.width) == (grid.height, grid.width), "Shape mismatch."
        mask = src.read(1)

    for geom, expected in zip(gdf.geometry, gdf[class_field]):
        pt = geom.representative_point()
        row, col = rowcol(grid.transform, pt.x, pt.y)
        if 0 <= row < grid.height and 0 <= col < grid.width:
            assert mask[row, col] != 0, "Polygon interior burned as background."
    print("Alignment OK: transform, shape, and interiors verified.")
```

Wire the six steps together and the run is linear — read the grid, load and reproject labels, order the shapes, burn, write, validate:

```python
grid = read_grid("tile_0007.tif")
labels = load_labels("tile_0007_labels.geojson", grid, class_field="class_id")
shapes = build_shapes(labels, "class_id", priority={1: 1, 2: 5})
mask = burn_mask(shapes, grid, fill=0, all_touched=False, dtype="uint8")
write_mask(mask, grid, "tile_0007_mask.tif")
validate_alignment("tile_0007_mask.tif", grid, labels, "class_id")
```

## Key rasterize Parameters

The five parameters below decide whether the mask aligns and how edges and overlaps resolve. Everything else in `rasterio.features.rasterize` has a sensible default:

| Parameter | Value to pass | Why it matters |
|---|---|---|
| `transform` | The imagery's `src.transform` (`Affine`) | Maps world coordinates to row/column. Omitting it falls back to the identity transform and burns nothing on the right grid. |
| `out_shape` | `(height, width)` from the imagery | Fixes mask dimensions to the pixel grid so the array is one-to-one with the image. |
| `fill` | `0` (background index) | Value written to every unburned cell. Must be a reserved background class, never a real class value. |
| `all_touched` | `False` for areas, `True` for thin features | `False` burns only pixel centres inside a polygon; `True` burns every touched pixel, thickening roads and inflating edge area. |
| `dtype` | `uint8` (≤255 classes) or `uint16` | Integer class-index dtype. Too small a dtype silently wraps class values above its range. |

## Common Errors and Fixes

**Mask is entirely `fill` value even though the GeoJSON has polygons**
Root cause: CRS mismatch — the vector coordinates and the imagery transform are in different projections, so the geometries fall outside the raster extent and nothing burns.
Fix: call `gdf.to_crs(grid.crs)` before `build_shapes`, and confirm `gdf.total_bounds` intersects the raster bounds. A first `EPSG:4326` label set over `EPSG:32633` imagery is the classic case — reproject rather than assume the codes match, as detailed on the [coordinate reference systems](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) guide.

**Mask is shifted by one row or column against the imagery**
Root cause: a hand-built transform that assumes pixel-corner versus pixel-centre origin, or a `height`/`width` swapped into `out_shape` as `(width, height)`.
Fix: never reconstruct the transform — reuse `src.transform` verbatim, and pass `out_shape=(grid.height, grid.width)` in that exact order.

**Overlapping classes resolve inconsistently between tiles**
Root cause: shapes were fed to `rasterize` in raw GeoJSON feature order, which is not stable, so which class wins a shared pixel varies from tile to tile.
Fix: sort `(geometry, value)` pairs by an explicit priority rank so the highest-priority class is always burned last.

**Thin roads or fences disappear from the mask**
Root cause: with `all_touched=False`, a linear feature narrower than a pixel rarely covers a pixel centre, so it drops out; but flipping the flag globally inflates every area class at its edges.
Fix: rasterize narrow classes in a separate pass with `all_touched=True` and composite them onto the area mask by priority, rather than setting one flag for all classes.

## Related

- [How to Structure GeoJSON for ML Training Datasets](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/vector-vs-raster-annotation-workflows/how-to-structure-geojson-for-ml-training-datasets/) — the upstream vector schema and class-field conventions the rasterizer consumes
- [Vector vs Raster Annotation Workflows](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/vector-vs-raster-annotation-workflows/) — where vector polygons and raster masks each fit in an annotation pipeline
- [Coordinate Reference Systems in Annotation Pipelines](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) — the reprojection contract that keeps vectors and pixels on one grid
- [Calculating IoU Thresholds for Geospatial Object Detection](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/calculating-iou-thresholds-for-geospatial-object-detection/) — evaluating the masks and detections this rasterization feeds

This guide is one specialised task within [Vector vs Raster Annotation Workflows](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/vector-vs-raster-annotation-workflows/), which is itself part of [Geospatial Annotation Fundamentals & Architecture](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/).
