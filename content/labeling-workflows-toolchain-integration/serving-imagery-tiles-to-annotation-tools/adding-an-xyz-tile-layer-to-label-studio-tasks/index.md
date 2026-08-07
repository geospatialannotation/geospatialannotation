---
title: "Adding an XYZ Tile Layer to Label Studio Tasks"
description: "Point Label Studio tasks at a tile service instead of uploaded chips: the task JSON, the fixed zoom and extent per task, and the manifest that turns percentage coordinates back into ground truth."
slug: "adding-an-xyz-tile-layer-to-label-studio-tasks"
type: "tutorial"
breadcrumb:
  - label: "Home"
    url: "/"
  - label: "Labeling Workflows & Toolchain Integration for Geospatial AI"
    url: "/labeling-workflows-toolchain-integration/"
  - label: "Serving Imagery Tiles to Annotation Tools"
    url: "/labeling-workflows-toolchain-integration/serving-imagery-tiles-to-annotation-tools/"
  - label: "Adding an XYZ Tile Layer to Label Studio Tasks"
    url: "/labeling-workflows-toolchain-integration/serving-imagery-tiles-to-annotation-tools/adding-an-xyz-tile-layer-to-label-studio-tasks/"
datePublished: "2026-08-08"
dateModified: "2026-08-08"
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
      "headline": "Adding an XYZ Tile Layer to Label Studio Tasks",
      "description": "Point Label Studio tasks at a tile service instead of uploaded chips: the task JSON, the fixed zoom and extent per task, and the manifest that turns percentage coordinates back into ground truth.",
      "datePublished": "2026-08-08",
      "dateModified": "2026-08-08",
      "author": {"@type": "Organization", "name": "Geospatial Annotation"},
      "publisher": {"@type": "Organization", "name": "Geospatial Annotation"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.geospatialannotation.com/"},
        {"@type": "ListItem", "position": 2, "name": "Labeling Workflows & Toolchain Integration for Geospatial AI", "item": "https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/"},
        {"@type": "ListItem", "position": 3, "name": "Serving Imagery Tiles to Annotation Tools", "item": "https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/serving-imagery-tiles-to-annotation-tools/"},
        {"@type": "ListItem", "position": 4, "name": "Adding an XYZ Tile Layer to Label Studio Tasks", "item": "https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/serving-imagery-tiles-to-annotation-tools/adding-an-xyz-tile-layer-to-label-studio-tasks/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Point a Label Studio task at a tile service",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Fix one extent and zoom per task", "text": "Compute a bounding box and a single zoom level for each task so the annotator always sees the same pixels and the image dimensions are known in advance."},
        {"@type": "HowToStep", "position": 2, "name": "Build the task image URL", "text": "Render that extent through the tile service's bbox endpoint at the fixed size, so the platform receives one static image rather than a slippy map."},
        {"@type": "HowToStep", "position": 3, "name": "Store the georeference in task data", "text": "Attach the bounding box, CRS, image size and render profile as task fields, because the platform's export carries only percentages."},
        {"@type": "HowToStep", "position": 4, "name": "Convert percentages back to world coordinates", "text": "On export, multiply percentages by the image size to get pixels, then map pixels through the stored bounding box to ground coordinates."},
        {"@type": "HowToStep", "position": 5, "name": "Assert the roundtrip on one task", "text": "Reproject a known corner back and confirm it lands where it should before importing a whole batch."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Can Label Studio display a slippy map that annotators pan and zoom?",
          "acceptedAnswer": {"@type": "Answer", "text": "Not natively for image annotation — its labelling surface expects a fixed image, and its coordinates are percentages of that image. That constraint is helpful: a fixed extent per task means every annotation is expressed against one known frame, so the conversion back to ground coordinates is exact rather than a function of wherever the annotator happened to be looking."}
        },
        {
          "@type": "Question",
          "name": "Why store the bounding box in the task instead of deriving it later?",
          "acceptedAnswer": {"@type": "Answer", "text": "Because the derivation depends on the tiler's configuration at the time the task was rendered, and that configuration changes. A bounding box, CRS and pixel size written into the task at creation are immutable facts about the image the annotator actually saw, which is exactly what the conversion needs."}
        },
        {
          "@type": "Question",
          "name": "What zoom level should a task use?",
          "acceptedAnswer": {"@type": "Answer", "text": "The one where the target object is comfortably resolvable and the task still covers useful ground — usually the zoom whose ground resolution is close to the imagery's native GSD. Rendering above native resolution wastes annotator time on interpolated pixels; rendering well below it hides the objects they are meant to find."}
        },
        {
          "@type": "Question",
          "name": "Does this work with pre-labels?",
          "acceptedAnswer": {"@type": "Answer", "text": "Yes, and the conversion runs in the opposite direction: world coordinates through the stored bounding box into pixels, then into percentages for the prediction payload. Because both directions use the same stored frame, a pre-label that round-trips exactly is a good end-to-end test of the whole setup."}
        }
      ]
    }
  ]
}
</script>

# Adding an XYZ Tile Layer to Label Studio Tasks

Label Studio annotates a fixed image and returns coordinates as percentages of it. A tile service serves an arbitrary window of a georeferenced archive. Bridging the two takes one decision — fix an extent and a zoom per task — and one discipline: write the georeference into the task data, because the export will not carry it. Do both and a batch of tasks can point at a 2 TB archive without a single chip being copied, and every returned polygon converts back to ground coordinates exactly. This guide gives the task JSON, both conversions, and the assertion that proves the setup before a batch is created.

## Why This Matters in Geospatial Pipelines

The naive alternative — export a chip per task, upload it, annotate it — duplicates the archive and loses the georeference at the upload boundary. Teams then reconstruct it from filenames, which works until a scene is renamed. Serving the pixels from the [tile service](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/serving-imagery-tiles-to-annotation-tools/) and carrying the georeference in the task payload keeps one copy of the imagery and makes the coordinate contract explicit rather than conventional.

<svg viewBox="0 50 720 232" role="img" aria-label="A task's fixed extent rendered to a fixed pixel size, with the three coordinate spaces the conversion passes through" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>Three coordinate spaces, two conversions</title>
  <desc>The task fixes a bounding box in a projected CRS and a pixel size. Label Studio returns a box as percentages of the image. Multiplying by the pixel size gives pixels; mapping pixels linearly through the stored bounding box gives ground coordinates. Both conversions use only values written into the task at creation time.</desc>
  <rect x="0" y="50" width="720" height="232" style="fill:var(--bg)"/>
  <defs>
    <marker id="ls-arr" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor"/>
    </marker>
  </defs>
  <rect x="20" y="70" width="180" height="110" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="110" y="94" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">percentages</text>
  <text x="110" y="116" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace">x 30.0  y 20.0</text>
  <text x="110" y="134" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace">w 25.0  h 40.0</text>
  <text x="110" y="158" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.75">what the export contains</text>
  <line x1="200" y1="125" x2="240" y2="125" stroke="currentColor" stroke-width="1.5" marker-end="url(#ls-arr)"/>
  <text x="220" y="115" text-anchor="middle" font-size="9" fill="currentColor" font-family="monospace">× size</text>
  <rect x="242" y="70" width="180" height="110" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="332" y="94" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">pixels</text>
  <text x="332" y="116" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace">307.2, 204.8</text>
  <text x="332" y="134" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace">256.0 × 409.6</text>
  <text x="332" y="158" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.75">on a 1024 × 1024 render</text>
  <line x1="422" y1="125" x2="462" y2="125" stroke="currentColor" stroke-width="1.5" marker-end="url(#ls-arr)"/>
  <text x="442" y="115" text-anchor="middle" font-size="9" fill="currentColor" font-family="monospace">× bbox</text>
  <rect x="464" y="70" width="236" height="110" rx="6" fill="none" stroke="currentColor" stroke-width="2"/>
  <text x="582" y="94" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">ground coordinates</text>
  <text x="582" y="116" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace">512 432.6, 5 401 795.2</text>
  <text x="582" y="134" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace">EPSG:25832</text>
  <text x="582" y="158" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.75">what the dataset stores</text>
  <rect x="20" y="206" width="680" height="56" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 3"/>
  <text x="360" y="228" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">both arrows use only values written into the task at creation</text>
  <text x="360" y="248" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">bbox, CRS, image size and render profile — none of which the export carries by itself</text>
</svg>

## Step-by-Step Implementation

### Step 1 — Fix an Extent and Size Per Task

```bash
pip install label-studio-sdk==1.0.10 geopandas==0.14.4 pyproj==3.6.1 httpx==0.27.0
```

Choose a ground extent per task — usually one tile of your working grid — and a render size. Both are then immutable properties of the task.

```python
from dataclasses import dataclass, asdict

@dataclass(frozen=True)
class TaskFrame:
    """The immutable frame a task's annotations are expressed against."""
    tile_id: str
    bbox: tuple[float, float, float, float]   # minx, miny, maxx, maxy in `crs`
    crs: str                                  # e.g. "EPSG:25832"
    width_px: int
    height_px: int
    profile: str                              # the render profile, part of provenance

def frame_for_tile(tile_id: str, bounds, crs: str, px: int = 1024) -> TaskFrame:
    minx, miny, maxx, maxy = bounds
    return TaskFrame(tile_id, (minx, miny, maxx, maxy), crs, px, px, "pleiades_rgb")
```

Keeping the frame square and the extent square keeps the pixel-to-ground scale identical on both axes, which removes an entire class of conversion bug.

### Step 2 — Build the Task Payload

The tiler's bbox endpoint renders an arbitrary extent to an arbitrary size, which is exactly what a fixed-frame task needs.

```python
def image_url(base: str, scene_uri: str, f: TaskFrame) -> str:
    minx, miny, maxx, maxy = f.bbox
    return (f"{base}/cog/bbox/{minx},{miny},{maxx},{maxy}/{f.width_px}x{f.height_px}.png"
            f"?url={scene_uri}&coord-crs={f.crs}&bidx=1&bidx=2&bidx=3"
            f"&rescale=0,3000&resampling=bilinear")

def task_payload(base: str, scene_uri: str, f: TaskFrame) -> dict:
    """One Label Studio task: an image plus every value needed to invert the coordinates."""
    return {
        "data": {
            "image": image_url(base, scene_uri, f),
            "frame": asdict(f),          # the georeference travels with the task
            "scene_uri": scene_uri,
        }
    }
```

Storing the whole frame in `data` rather than only a tile id is the difference between an export that can be converted by itself and one that needs a lookup against a database whose contents may have moved on.

<svg viewBox="0 0 700 240" role="img" aria-label="The three immutable values a task frame stores and what each one prevents" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:700px;display:block;margin:1.5rem auto;">
  <title>Three values in the task, three failures prevented</title>
  <desc>The bounding box and CRS prevent annotations landing in the wrong place when the tiler's defaults change. The pixel size prevents a rescaled render silently changing the conversion. The render profile records what the annotator was actually looking at, which is the first question asked when a batch turns out to be systematically poor.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <text x="150" y="40" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">stored in the task</text>
  <text x="470" y="40" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">what it prevents</text>
  <line x1="20" y1="50" x2="680" y2="50" stroke="currentColor" stroke-width="1" opacity="0.4"/>
  <text x="20" y="80" font-size="11" fill="currentColor" font-family="monospace">bbox + crs</text>
  <rect x="290" y="64" width="390" height="24" rx="4" fill="currentColor" opacity="0.28"/>
  <text x="485" y="81" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif">a tiler default change moving every annotation</text>
  <text x="20" y="126" font-size="11" fill="currentColor" font-family="monospace">width_px + height_px</text>
  <rect x="290" y="110" width="390" height="24" rx="4" fill="currentColor" opacity="0.28"/>
  <text x="485" y="127" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif">a rescaled render silently altering the conversion</text>
  <text x="20" y="172" font-size="11" fill="currentColor" font-family="monospace">profile</text>
  <rect x="290" y="156" width="390" height="24" rx="4" fill="none" stroke="currentColor" stroke-width="1.6"/>
  <text x="485" y="173" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif">not knowing what the annotator was looking at</text>
  <text x="350" y="212" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">the first three are geometry; the fourth is provenance, and it is the one people leave out</text>
  <text x="350" y="230" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">until a batch turns out to be systematically poor and nobody can say why</text>
</svg>

### Step 3 — Convert the Export Back to Ground Coordinates

Label Studio returns `x`, `y`, `width`, `height` as percentages, with the origin at the top-left of the image and `y` increasing downward. Ground northing increases upward, so the vertical axis flips.

```python
from shapely.geometry import box
from shapely.geometry.base import BaseGeometry

def result_to_world(result: dict, f: TaskFrame) -> BaseGeometry:
    """One Label Studio rectangle result → a polygon in the frame's CRS."""
    v = result["value"]
    px_x = v["x"] / 100.0 * f.width_px
    px_y = v["y"] / 100.0 * f.height_px
    px_w = v["width"] / 100.0 * f.width_px
    px_h = v["height"] / 100.0 * f.height_px

    minx, miny, maxx, maxy = f.bbox
    sx = (maxx - minx) / f.width_px
    sy = (maxy - miny) / f.height_px

    world_minx = minx + px_x * sx
    world_maxx = minx + (px_x + px_w) * sx
    world_maxy = maxy - px_y * sy              # top-left pixel is the HIGHEST northing
    world_miny = maxy - (px_y + px_h) * sy
    return box(world_minx, world_miny, world_maxx, world_maxy)
```

The two lines using `maxy` are where most implementations go wrong. Copying the pixel minimum into the world minimum produces annotations mirrored about the tile's horizontal centre line — a failure that looks plausible on a single square building and is glaring on a row of terraces.

### Step 4 — Assert the Roundtrip Before Creating a Batch

```python
def assert_frame_roundtrips(f: TaskFrame, tol_m: float = 0.01) -> None:
    """A full-frame annotation must convert back to the frame's own bounding box."""
    full = {"value": {"x": 0.0, "y": 0.0, "width": 100.0, "height": 100.0}}
    got = result_to_world(full, f).bounds
    want = f.bbox
    for g, w, axis in zip(got, want, "xyXY"):
        if abs(g - w) > tol_m:
            raise AssertionError(f"{axis} off by {abs(g - w):.3f} m — check the y-axis flip")
```

Run it once per frame shape, not per task. It catches the axis flip, a transposed width and height, and a CRS mismatch between the frame and the tiler's `coord-crs`, which are the three failures that otherwise surface as a whole batch of subtly wrong labels.

<svg viewBox="0 0 700 280" role="img" aria-label="The same annotation converted with and without the vertical axis flip" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:700px;display:block;margin:1.5rem auto;">
  <title>The axis flip, and what forgetting it looks like</title>
  <desc>An annotation near the top of the image should convert to the north of the tile, because pixel rows increase southward while northing increases upward. Copying pixel minimum to world minimum instead mirrors every annotation about the tile's horizontal centre line, which reads as plausible on one square building and is obvious on a row of terraces.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <!-- Image space -->
  <text x="120" y="36" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">image space</text>
  <rect x="40" y="52" width="160" height="160" fill="none" stroke="currentColor" stroke-width="1.4"/>
  <rect x="64" y="74" width="112" height="34" fill="currentColor" opacity="0.3"/>
  <text x="120" y="96" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif">y = 14%</text>
  <text x="120" y="230" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.75">row 0 at the top</text>
  <!-- Correct -->
  <text x="350" y="36" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">with the flip — correct</text>
  <rect x="270" y="52" width="160" height="160" fill="none" stroke="currentColor" stroke-width="1.4"/>
  <rect x="294" y="74" width="112" height="34" fill="currentColor" opacity="0.3"/>
  <text x="350" y="96" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif">north of the tile</text>
  <text x="350" y="230" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.75">maxy at the top</text>
  <!-- Wrong -->
  <text x="580" y="36" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">without it — mirrored</text>
  <rect x="500" y="52" width="160" height="160" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="5 3"/>
  <rect x="524" y="156" width="112" height="34" fill="currentColor" opacity="0.3"/>
  <text x="580" y="178" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif">south of the tile</text>
  <text x="580" y="230" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.75">every feature reflected</text>
  <text x="350" y="264" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">the full-frame assertion in Step 4 catches this in one call, before a batch of tasks exists</text>
</svg>

## Parameters and Thresholds Reference

| Setting | Typical | Note |
|---|---|---|
| Task extent | one working-grid tile | Matching the grid keeps task ids and tile ids the same thing |
| Render size | 1024 × 1024 px | Above 2048 the browser gets slow on polygon-heavy tasks |
| Ground resolution | ≈ native GSD | Rendering above native resolution annotates interpolation |
| `coord-crs` | the frame's CRS | Must match the bbox you pass, or the render silently shifts |
| Roundtrip tolerance | 0.01 m | Anything larger means a scale or flip error, not float noise |

## Common Errors and Fixes

**Every annotation is mirrored north–south**
Root cause: the vertical flip in Step 3 was skipped.
Fix: derive the world maximum from `maxy − px_y * sy`, and add the Step 4 assertion so it cannot regress.

**Features land hundreds of kilometres away**
Root cause: the bbox was passed in the frame's CRS but the tiler defaulted to interpreting it as WGS84.
Fix: always send `coord-crs` explicitly and store the same value in the frame.

**Annotations are systematically half a tile off**
Root cause: the render size and the extent have different aspect ratios, so `sx` and `sy` differ and one axis is stretched.
Fix: keep both square, or verify the roundtrip on a non-square frame before using it.

**The image loads in the browser but not in Label Studio**
Root cause: the tile service requires a token the platform does not send.
Fix: use a signed URL per task, or allow the platform's origin — the trade-offs are in the [parent topic](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/serving-imagery-tiles-to-annotation-tools/).

## Frequently Asked Questions

### Can one task show several bands or dates?

Yes — create one task per rendering and link them by tile id, or use a multi-image labelling config. What must not happen is one task whose image URL changes over time, because the annotations already stored against it were expressed against the old pixels.

### How do polygons differ from rectangles in the conversion?

Only in shape. A polygon result carries a list of percentage points; map each point through the same two conversions and build the ring. The axis flip applies identically, per point.

### Does this scale to tens of thousands of tasks?

The task creation is a bulk import and is not the bottleneck; the tile service is. Create tasks in batches and let the [cache](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/serving-imagery-tiles-to-annotation-tools/) warm naturally as annotators work, rather than pre-rendering every frame at import time.

### Where should the frame live if we later move to CVAT?

In the same place — attached to the task. CVAT's export is in pixels rather than percentages, which removes one multiplication and changes nothing else; the [CVAT setup guide](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/integrating-label-studio-with-geospatial-workflows/step-by-step-cvat-setup-for-drone-imagery-annotation/) covers the manifest form it uses.

## Related

- [Serving Imagery Tiles to Annotation Tools](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/serving-imagery-tiles-to-annotation-tools/) — the service this guide consumes, including the render profile that must stay fixed
- [Integrating Label Studio with Geospatial Workflows](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/integrating-label-studio-with-geospatial-workflows/) — the wider platform setup, labelling config and webhooks
- [Converting Label Studio Exports to YOLOv8 Format](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/automating-pre-labeling-with-foundation-models/converting-label-studio-exports-to-yolov8-format/) — the other conversion the same percentages feed

This task setup is one piece of the [Serving Imagery Tiles to Annotation Tools](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/serving-imagery-tiles-to-annotation-tools/) topic within [Labeling Workflows & Toolchain Integration](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/).
