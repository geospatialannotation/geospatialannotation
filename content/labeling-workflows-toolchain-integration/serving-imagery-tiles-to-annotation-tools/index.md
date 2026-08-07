---
title: "Serving Imagery Tiles to Annotation Tools"
description: "Put terabytes of COG imagery in front of annotators without copying it: dynamic tiling with TiTiler, XYZ and WMTS endpoints, sensible caching, and the georeferencing contract the annotation platform never sees."
slug: "serving-imagery-tiles-to-annotation-tools"
type: "guide"
breadcrumb:
  - label: "Home"
    url: "/"
  - label: "Labeling Workflows & Toolchain Integration for Geospatial AI"
    url: "/labeling-workflows-toolchain-integration/"
  - label: "Serving Imagery Tiles to Annotation Tools"
    url: "/labeling-workflows-toolchain-integration/serving-imagery-tiles-to-annotation-tools/"
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
      "headline": "Serving Imagery Tiles to Annotation Tools",
      "description": "Put terabytes of COG imagery in front of annotators without copying it: dynamic tiling with TiTiler, XYZ and WMTS endpoints, sensible caching, and the georeferencing contract the annotation platform never sees.",
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
        {"@type": "ListItem", "position": 3, "name": "Serving Imagery Tiles to Annotation Tools", "item": "https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/serving-imagery-tiles-to-annotation-tools/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Serve geospatial imagery tiles to an annotation platform",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Make the source cloud-optimized", "text": "Convert every scene to a tiled, overviewed Cloud-Optimized GeoTIFF in object storage so a tile server can read one window with a byte-range request instead of downloading the file."},
        {"@type": "HowToStep", "position": 2, "name": "Stand up a dynamic tiler", "text": "Run a tile server that reads the COGs in place and returns XYZ tiles on demand, so no pre-rendered pyramid has to be generated or stored."},
        {"@type": "HowToStep", "position": 3, "name": "Fix the rendering contract", "text": "Pin band order, rescale ranges and resampling per collection so the same scene never renders differently between two annotators or between two sessions."},
        {"@type": "HowToStep", "position": 4, "name": "Cache at the edge, key on the render parameters", "text": "Put a CDN or reverse-proxy cache in front of the tiler and include every rendering parameter in the cache key, so a changed stretch does not serve stale pixels."},
        {"@type": "HowToStep", "position": 5, "name": "Keep the georeferencing outside the tiles", "text": "Record the scene, CRS and transform in a manifest keyed by the annotation task, because an XYZ tile carries no georeferencing and the platform will hand back pixel coordinates."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Should I pre-render a tile pyramid or tile dynamically from COGs?",
          "acceptedAnswer": {"@type": "Answer", "text": "Tile dynamically unless you have a strong reason not to. A pre-rendered pyramid duplicates the archive, takes hours to generate per scene, and has to be regenerated whenever the stretch or band combination changes — which happens constantly during annotation setup. Dynamic tiling from COGs reads the same bytes the archive already holds and lets the render parameters be a URL argument."}
        },
        {
          "@type": "Question",
          "name": "Why do annotators see the same scene with different brightness?",
          "acceptedAnswer": {"@type": "Answer", "text": "Because the rescale range is being computed per request from the statistics of whatever window was asked for, so a tile over dark water stretches differently from a tile over bright roofs. Pin an explicit rescale per collection and per band. Auto-stretch is a viewer convenience and an annotation hazard: it makes the same object look different in two adjacent tiles."}
        },
        {
          "@type": "Question",
          "name": "Do XYZ tiles carry any coordinate information?",
          "acceptedAnswer": {"@type": "Answer", "text": "None. An XYZ tile is a PNG or JPEG whose position is encoded only in the URL, and the annotation platform stores boxes and polygons in the pixel space of the image it displayed. Reconstructing world coordinates needs the tile's z, x and y or the parent scene's transform, kept in a manifest the annotation task references."}
        },
        {
          "@type": "Question",
          "name": "How much cache does a tile server for annotation actually need?",
          "acceptedAnswer": {"@type": "Answer", "text": "Less than a public map service and with a very different shape. Annotation traffic is concentrated: a team works through a queue, so the same few hundred tiles are requested repeatedly within a session and then never again. A small cache with a short time to live in front of the tiler absorbs most of the load; a large long-lived cache mostly stores tiles nobody will open twice."}
        }
      ]
    }
  ]
}
</script>

# Serving Imagery Tiles to Annotation Tools

An annotation platform wants an image. A geospatial archive holds forty thousand Cloud-Optimized GeoTIFFs in object storage, each one 40 000 pixels square, and copying chips out of them into the platform is the step that quietly turns a 2 TB archive into a 6 TB one and loses the georeferencing on the way. The alternative is to serve the archive in place: a dynamic tile server reads a byte range from the COG, renders the requested XYZ tile, and hands the annotation tool exactly the pixels it asked for — with a manifest recording what those pixels were, so the labels can be put back on the ground afterwards.

This topic covers the serving path end to end: what the source files have to look like, how the tile server is configured so two annotators never see the same scene rendered differently, where caching genuinely helps, and how to keep the georeferencing contract intact through a stack whose middle layer does not know what a coordinate reference system is.

## Prerequisites & Toolchain Alignment

```bash
pip install "titiler.application==0.18.6" "rio-tiler==6.6.1" \
            rasterio==1.3.10 rio-cogeo==5.3.0 uvicorn==0.30.1
```

Beyond the packages:

- **Every source must be a valid COG.** A dynamic tiler on a striped GeoTIFF reads the whole file for every tile, which turns a 40 ms request into a 40 second one. Validate before serving, as [spatial data formats for ML annotation](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/spatial-data-formats-for-ml-annotation/) sets out.
- **Object storage with byte-range support.** S3, GCS, Azure Blob and any HTTP server honouring `Range` all work. A network filesystem works too and is slower for exactly the reason [CVAT deployments prefer local NVMe](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/integrating-label-studio-with-geospatial-workflows/step-by-step-cvat-setup-for-drone-imagery-annotation/): the access pattern is small random reads.
- **A decision about the tiling scheme.** Web Mercator (`EPSG:3857`) is what every slippy-map client speaks. It is not what your imagery is in, and the reprojection happens per tile inside the server.

<svg viewBox="0 0 740 290" role="img" aria-label="The path a tile request takes from the annotation tool through cache and tiler to a byte range in object storage" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:740px;display:block;margin:1.5rem auto;">
  <title>One tile request, four hops, no copies</title>
  <desc>The annotation tool requests tile z14 x8532 y5461. The edge cache answers if it has it. Otherwise the tiler resolves which COG covers that tile, reads the header, issues a byte-range request for the overlapping internal tiles, reprojects and renders a PNG, and the cache stores it on the way back. Nothing is written to disk and no chip is extracted from the archive.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <defs>
    <marker id="tile-arr" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor"/>
    </marker>
  </defs>
  <rect x="14" y="92" width="126" height="60" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="77" y="116" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">annotation tool</text>
  <text x="77" y="134" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace" opacity="0.75">/14/8532/5461.png</text>
  <line x1="140" y1="122" x2="168" y2="122" stroke="currentColor" stroke-width="1.5" marker-end="url(#tile-arr)"/>
  <rect x="170" y="92" width="126" height="60" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="233" y="116" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">edge cache</text>
  <text x="233" y="134" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">hit → done</text>
  <line x1="296" y1="122" x2="324" y2="122" stroke="currentColor" stroke-width="1.5" marker-end="url(#tile-arr)"/>
  <text x="310" y="112" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.7">miss</text>
  <rect x="326" y="80" width="150" height="84" rx="6" fill="none" stroke="currentColor" stroke-width="2"/>
  <text x="401" y="104" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">tiler</text>
  <text x="401" y="122" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">which COG covers it?</text>
  <text x="401" y="140" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">reproject · rescale · encode</text>
  <line x1="476" y1="122" x2="504" y2="122" stroke="currentColor" stroke-width="1.5" marker-end="url(#tile-arr)"/>
  <rect x="506" y="92" width="220" height="60" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="616" y="116" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">object storage</text>
  <text x="616" y="134" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace" opacity="0.75">Range: bytes=8421376-8683519</text>
  <!-- Notes -->
  <text x="370" y="40" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">the archive is read, never copied</text>
  <text x="370" y="62" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">one header read per scene per worker, then a few hundred KB per tile</text>
  <rect x="14" y="196" width="712" height="66" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 3"/>
  <text x="370" y="220" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">what the annotation tool never learns</text>
  <text x="370" y="240" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">the scene id, the source CRS, the geotransform — a PNG carries none of them,</text>
  <text x="370" y="256" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">so the task manifest has to carry them instead</text>
</svg>

## Serving Path

### Step 1 — Confirm the Sources Are Genuinely Cloud-Optimized

Dynamic tiling is only fast because the reader can fetch the exact bytes it needs. That property comes from the file layout, not the file extension.

```python
from rio_cogeo.cogeo import cog_validate

def assert_servable(uri: str) -> None:
    """Refuse to register a scene that will make every tile request read the whole file."""
    valid, errors, warnings = cog_validate(uri)
    if not valid:
        raise ValueError(f"{uri} is not a valid COG: {errors}")
    if warnings:
        print(f"warning for {uri}: {warnings}")
```

Run this at ingest, not at request time, and store the verdict in the scene registry. A scene that fails is re-encoded once, which is much cheaper than paying for it on every tile of every annotation session.

### Step 2 — Run the Tiler

TiTiler is a FastAPI application; the smallest useful deployment is the packaged app with a mounted COG endpoint.

```python
# tiler.py — a minimal single-collection tile server
from fastapi import FastAPI
from titiler.core.factory import TilerFactory
from titiler.core.errors import DEFAULT_STATUS_CODES, add_exception_handlers

app = FastAPI(title="annotation-tiles")
cog = TilerFactory(router_prefix="/cog")
app.include_router(cog.router, prefix="/cog", tags=["COG"])
add_exception_handlers(app, DEFAULT_STATUS_CODES)
```

```bash
uvicorn tiler:app --host 0.0.0.0 --port 8000 --workers 4
```

A tile URL then looks like this, with the source and the rendering fixed in the query string:

```
http://tiles.internal:8000/cog/tiles/WebMercatorQuad/{z}/{x}/{y}.png
  ?url=s3://imagery/2026/alpha/scene_0142.tif
  &bidx=1&bidx=2&bidx=3
  &rescale=0,3000
  &resampling=bilinear
```

### Step 3 — Pin the Rendering Contract

The single most common annotation complaint — "the imagery looked different yesterday" — is a rendering contract that was never written down. Three parameters decide it, and all three must be per collection rather than per request:

```python
from dataclasses import dataclass

@dataclass(frozen=True)
class RenderProfile:
    """The pixels an annotator sees, fixed for a whole collection."""
    bidx: tuple[int, ...]        # band order, e.g. (1, 2, 3) for true colour
    rescale: tuple[int, int]     # fixed stretch, NOT per-tile statistics
    resampling: str              # "bilinear" for imagery, "nearest" for masks
    nodata: float | None = None

PROFILES: dict[str, RenderProfile] = {
    "pleiades_rgb": RenderProfile(bidx=(1, 2, 3), rescale=(0, 3000), resampling="bilinear"),
    "sentinel2_swir": RenderProfile(bidx=(12, 8, 4), rescale=(0, 4000), resampling="bilinear"),
    "drone_rgb_8bit": RenderProfile(bidx=(1, 2, 3), rescale=(0, 255), resampling="bilinear"),
}

def tile_url(base: str, scene_uri: str, profile: RenderProfile) -> str:
    bands = "".join(f"&bidx={b}" for b in profile.bidx)
    lo, hi = profile.rescale
    return (f"{base}/cog/tiles/WebMercatorQuad/{{z}}/{{x}}/{{y}}.png"
            f"?url={scene_uri}{bands}&rescale={lo},{hi}&resampling={profile.resampling}")
```

Auto-stretch — letting the server compute the range from each requested window — is the default in most viewers and is wrong here. It makes a dark roof beside water render differently from the same roof beside a bright field, and annotators calibrate their judgement on brightness whether or not they mean to.

### Step 4 — Cache With the Render Parameters in the Key

Annotation traffic is bursty and narrow: a team works a queue, so a few hundred tiles are requested repeatedly for an hour and then never again. That shape rewards a small cache with a short time to live and punishes a large permanent one.

<svg viewBox="0 0 720 280" role="img" aria-label="Cache hit rate over one annotation session compared with a public map service, showing why the cache is small and short-lived" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>Annotation traffic is narrow and short-lived</title>
  <desc>Over a four hour annotation session the cache hit rate climbs quickly to around eighty percent as the team works within a small area, then collapses each time the queue moves to a new region. A public map service instead accumulates a broad, stable hit rate over days. The annotation shape rewards a small cache with a short time to live, because the tiles that were hot this morning will not be requested again.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <!-- Axes -->
  <line x1="90" y1="200" x2="660" y2="200" stroke="currentColor" stroke-width="1.4" opacity="0.6"/>
  <line x1="90" y1="200" x2="90" y2="46" stroke="currentColor" stroke-width="1.4" opacity="0.6"/>
  <text x="90" y="220" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.6">09:00</text>
  <text x="233" y="220" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.6">10:00</text>
  <text x="376" y="220" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.6">11:00</text>
  <text x="519" y="220" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.6">12:00</text>
  <text x="660" y="220" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.6">13:00</text>
  <text x="70" y="204" text-anchor="end" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.6">0%</text>
  <text x="70" y="126" text-anchor="end" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.6">50%</text>
  <text x="70" y="50" text-anchor="end" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.6">100%</text>
  <text x="34" y="124" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.75" transform="rotate(-90 34 124)">cache hit rate</text>
  <!-- Annotation session -->
  <path d="M90 200 L126 116 L162 80 L198 74 L233 78 L262 168 L298 96 L334 72 L376 70 L404 176 L440 100 L476 74 L519 68 L548 172 L584 104 L620 76 L660 70" fill="none" stroke="currentColor" stroke-width="2.4"/>
  <!-- Public service -->
  <path d="M90 200 L162 108 L233 86 L305 78 L376 74 L448 72 L519 71 L590 70 L660 70" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="6 4" opacity="0.7"/>
  <!-- Queue move markers -->
  <line x1="262" y1="52" x2="262" y2="196" stroke="currentColor" stroke-width="1" stroke-dasharray="2 4" opacity="0.5"/>
  <line x1="404" y1="52" x2="404" y2="196" stroke="currentColor" stroke-width="1" stroke-dasharray="2 4" opacity="0.5"/>
  <line x1="548" y1="52" x2="548" y2="196" stroke="currentColor" stroke-width="1" stroke-dasharray="2 4" opacity="0.5"/>
  <text x="404" y="44" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">the queue moves to a new area</text>
  <!-- Legend -->
  <line x1="90" y1="246" x2="126" y2="246" stroke="currentColor" stroke-width="2.4"/>
  <text x="134" y="250" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.85">annotation session — hot, narrow, and repeatedly reset</text>
  <line x1="90" y1="266" x2="126" y2="266" stroke="currentColor" stroke-width="1.6" stroke-dasharray="6 4" opacity="0.7"/>
  <text x="134" y="270" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.85">public map service — broad and stable, which is the cache most guides size for</text>
</svg>

```nginx
proxy_cache_path /var/cache/tiles levels=1:2 keys_zone=tiles:64m
                 max_size=8g inactive=2h use_temp_path=off;

server {
  listen 80;
  location /cog/ {
    proxy_pass http://127.0.0.1:8000;
    # the full query string is part of the key: a changed rescale is a different tile
    proxy_cache_key "$scheme$request_method$host$request_uri";
    proxy_cache tiles;
    proxy_cache_valid 200 2h;
    proxy_cache_use_stale error timeout updating;
    add_header X-Cache-Status $upstream_cache_status;
  }
}
```

Leaving the query string out of the cache key is the failure that produces the worst possible bug: an annotator changes the band combination, the URL changes, the cache does not, and they annotate the previous rendering for an afternoon.

### Step 5 — Keep the Georeferencing Outside the Image

A PNG tile has no CRS, no transform and no scene identity. The annotation platform stores boxes in the pixel space of whatever it displayed, so something outside the image has to remember what that was.

```python
import json
from dataclasses import dataclass, asdict

@dataclass(frozen=True)
class TaskRef:
    """Everything needed to put a pixel coordinate back on the ground."""
    task_id: str
    scene_uri: str
    scene_crs: str          # e.g. "EPSG:32633"
    tile_matrix: str        # "WebMercatorQuad"
    z: int
    x: int
    y: int
    profile: str            # key into PROFILES — the rendering is part of provenance

def write_task_manifest(path: str, refs: list[TaskRef]) -> None:
    with open(path, "w", encoding="utf-8") as fh:
        json.dump([asdict(r) for r in refs], fh, indent=2, sort_keys=True)
        fh.write("\n")
```

Recording `profile` alongside the geometry is not bureaucracy. When a batch of labels turns out to be systematically poor, the first question is what the annotator was actually looking at, and a rendering profile that changed mid-batch is a common answer.

<svg viewBox="0 0 720 280" role="img" aria-label="The same scene rendered with a fixed stretch and with per-window auto-stretch, showing the inconsistency auto-stretch introduces" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>Why the stretch is pinned per collection</title>
  <desc>Four adjacent tiles of one scene. With a fixed rescale of 0 to 3000 all four render consistently and a roof looks the same in each. With per-window auto-stretch, the tile that happens to contain dark water is brightened and the tile over bright fields is darkened, so the same roof appears in two different tones and annotators calibrate differently on each.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <!-- Fixed -->
  <text x="170" y="36" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">fixed rescale 0–3000</text>
  <rect x="60" y="52" width="106" height="80" fill="currentColor" opacity="0.25"/>
  <rect x="170" y="52" width="106" height="80" fill="currentColor" opacity="0.25"/>
  <rect x="60" y="136" width="106" height="80" fill="currentColor" opacity="0.25"/>
  <rect x="170" y="136" width="106" height="80" fill="currentColor" opacity="0.25"/>
  <rect x="60" y="52" width="216" height="164" fill="none" stroke="currentColor" stroke-width="1.3"/>
  <line x1="166" y1="52" x2="166" y2="216" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <line x1="60" y1="132" x2="276" y2="132" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <rect x="140" y="112" width="52" height="40" fill="none" stroke="currentColor" stroke-width="2"/>
  <text x="166" y="240" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">the roof reads the same in all four</text>
  <!-- Auto -->
  <text x="530" y="36" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">per-window auto-stretch</text>
  <rect x="420" y="52" width="106" height="80" fill="currentColor" opacity="0.5"/>
  <rect x="530" y="52" width="106" height="80" fill="currentColor" opacity="0.12"/>
  <rect x="420" y="136" width="106" height="80" fill="currentColor" opacity="0.18"/>
  <rect x="530" y="136" width="106" height="80" fill="currentColor" opacity="0.38"/>
  <rect x="420" y="52" width="216" height="164" fill="none" stroke="currentColor" stroke-width="1.3"/>
  <line x1="526" y1="52" x2="526" y2="216" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <line x1="420" y1="132" x2="636" y2="132" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <rect x="500" y="112" width="52" height="40" fill="none" stroke="currentColor" stroke-width="2"/>
  <text x="526" y="240" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">the same roof straddles two tones</text>
  <text x="360" y="266" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">annotators calibrate on brightness whether they mean to or not — which makes the stretch part of the label, not the display</text>
</svg>

## Serving Parameters & Configuration Reference

| Parameter | Recommended | Why |
|---|---|---|
| Tile size | 256 px (512 px for detail work) | 512 halves the request count and doubles the bytes per request |
| Tile matrix set | `WebMercatorQuad` | The only scheme every slippy-map client speaks |
| `resampling` | `bilinear` for imagery, `nearest` for masks | Bilinear on a class mask invents classes that do not exist |
| `rescale` | Fixed per collection | Per-window stretch makes identical objects look different |
| Cache TTL | 1 – 4 hours | Matches the length of an annotation session |
| Cache size | 4 – 16 GB | Annotation traffic is narrow; a huge cache mostly stores misses |
| Workers | 2 × cores | Requests are I/O-bound on object storage, not CPU-bound |
| `GDAL_DISABLE_READDIR_ON_OPEN` | `EMPTY_DIR` | Stops a directory listing on every open — the single biggest latency win |

## Edge Cases & Gotchas

**Scenes in different CRS in one collection.** The tiler reprojects per request, so mixed source projections work, but they cost a warp on every tile. If a collection is mostly one UTM zone, the tiles over the odd scene will be visibly slower, which annotators experience as the tool stalling on particular tasks.

**Nodata rendered as black.** Untagged nodata regions come through as valid zeros, so an annotator sees a black field and may label it. Set `nodata` on the profile and let the tiler render those pixels transparent.

**Overviews built with the wrong resampling.** A COG whose overviews were built with `average` shows blurred edges at low zoom, which is fine for imagery and wrong for anything an annotator zooms out to count. Build overviews once with the resampling that suits the content.

**Tile requests outside the scene.** A client at a zoom level covering a wide area asks for tiles that no scene covers. Return an empty transparent tile with a `204` or a cacheable `404`; letting those requests reach storage and fail slowly is a common source of a tiler that feels broken under load.

**Authorization forgotten until launch.** A tile URL that works in a browser works for anyone who has it. Annotation imagery is frequently under a licence that forbids that, and retrofitting auth means changing every task's stored URL. Decide it before the first batch, not after.

## Integration & Automation Hooks

**Label Studio.** Point a task's image at the tiler URL for a fixed zoom and extent rather than uploading a chip. The platform stores percentage coordinates, which the [conversion path](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/automating-pre-labeling-with-foundation-models/converting-label-studio-exports-to-yolov8-format/) turns back into pixels and then, with the manifest from Step 5, into world coordinates.

**QGIS.** The same tiler serves an XYZ layer, so reviewers can open the identical rendering in a desktop GIS with topology tools — the escalation path described in [Label Studio versus QGIS](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/qgis-plugin-ecosystem-for-annotation-teams/label-studio-vs-qgis-for-geospatial-annotation/) only works if both tools show the same pixels.

**Pre-labelling.** A model that runs over the same COGs should read them directly with windowed reads rather than through the tiler. The tiler exists to make pixels viewable; the model wants the source values, unstretched and in the source CRS.

## Validation & Testing

```python
import httpx

def test_tile_is_deterministic() -> None:
    """The same URL must return byte-identical pixels twice — otherwise nothing is cacheable."""
    url = ("http://127.0.0.1:8000/cog/tiles/WebMercatorQuad/14/8532/5461.png"
           "?url=s3://imagery/test/scene_0001.tif&bidx=1&bidx=2&bidx=3&rescale=0,3000")
    a = httpx.get(url, timeout=30.0).content
    b = httpx.get(url, timeout=30.0).content
    assert a == b

def test_auto_stretch_is_refused() -> None:
    """A request without an explicit rescale must fail, not silently auto-stretch."""
    url = ("http://127.0.0.1:8000/cog/tiles/WebMercatorQuad/14/8532/5461.png"
           "?url=s3://imagery/test/scene_0001.tif&bidx=1&bidx=2&bidx=3")
    assert httpx.get(url, timeout=30.0).status_code == 400
```

The second test is the one that earns its place: it feeds the service the request shape that produces inconsistent imagery and asserts the service refuses it. Wiring that refusal in means an annotator cannot construct an unpinned rendering by editing a URL.

## Frequently Asked Questions

### Can I serve tiles directly from a STAC catalog instead of scene URIs?

Yes, and it is usually better. A mosaic endpoint takes a STAC search rather than a single URL, so the tiler picks whichever scenes cover the tile, filtered by date and cloud cover. The provenance question then moves to which items the search returned, which is exactly what [integrating STAC catalogs with versioned datasets](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/integrating-stac-catalogs-with-versioned-datasets/) records.

### What latency should annotators experience?

Under 150 ms for a cached tile and under 600 ms for a cold one is comfortable. Above about a second, annotators start panning ahead of the imagery and mis-clicking. The usual cause of a slow cold tile is not the tiler but a source whose overviews are missing, so the server decodes full resolution to render a zoomed-out view.

### Does the tiler need to be inside the same network as the storage?

It should be in the same region. Every tile is several small range requests, and cross-region latency multiplies by that count. Co-locating the tiler with the bucket is usually a larger performance win than any amount of caching in front of it.

### How do I stop one heavy user saturating the tiler?

Rate-limit per token at the proxy rather than in the application, and give pre-labelling jobs a separate path that reads the COGs directly. Most tiler overload in annotation deployments is a batch job going through the tile API because that was the URL somebody had.

## Related

- [Integrating Label Studio with Geospatial Workflows](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/integrating-label-studio-with-geospatial-workflows/) — the platform side of the same contract, including how pixel coordinates come back
- [Spatial Data Formats for ML Annotation](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/spatial-data-formats-for-ml-annotation/) — what makes a GeoTIFF cloud-optimized, and why a tiler is helpless without it
- [Step-by-Step CVAT Setup for Drone Imagery Annotation](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/integrating-label-studio-with-geospatial-workflows/step-by-step-cvat-setup-for-drone-imagery-annotation/) — the chip-extraction alternative, and when its storage cost is worth paying
- [QGIS Plugin Ecosystem for Annotation Teams](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/qgis-plugin-ecosystem-for-annotation-teams/) — the desktop client that should be looking at the same rendering as the web queue

Serving imagery is one stage of the broader [Labeling Workflows & Toolchain Integration](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/) pipeline, which covers everything from ingest through export.
