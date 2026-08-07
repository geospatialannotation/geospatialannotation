---
title: "Computing Stable Content Hashes for COGs"
description: "Compute reproducible content hashes for Cloud-Optimized GeoTIFFs that ignore volatile metadata (timestamps, ordering) so identical imagery hashes identically across re-exports and machines."
slug: "computing-stable-content-hashes-for-cogs"
type: "tutorial"
breadcrumb:
  - label: "Home"
    url: "/"
  - label: "Dataset Versioning & Spatial Data Sync"
    url: "/dataset-versioning-spatial-data-sync/"
  - label: "Tracking Annotation Changes with SHA Hashing"
    url: "/dataset-versioning-spatial-data-sync/tracking-annotation-changes-with-sha-hashing/"
  - label: "Computing Stable Content Hashes for COGs"
    url: "/dataset-versioning-spatial-data-sync/tracking-annotation-changes-with-sha-hashing/computing-stable-content-hashes-for-cogs/"
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
      "headline": "Computing Stable Content Hashes for COGs",
      "description": "Compute reproducible content hashes for Cloud-Optimized GeoTIFFs that ignore volatile metadata (timestamps, ordering) so identical imagery hashes identically across re-exports and machines.",
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
        {"@type": "ListItem", "position": 3, "name": "Tracking Annotation Changes with SHA Hashing", "item": "https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/tracking-annotation-changes-with-sha-hashing/"},
        {"@type": "ListItem", "position": 4, "name": "Computing Stable Content Hashes for COGs", "item": "https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/tracking-annotation-changes-with-sha-hashing/computing-stable-content-hashes-for-cogs/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Computing Stable Content Hashes for COGs",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Open the COG and read decoded pixels band by band", "text": "Open the Cloud-Optimized GeoTIFF with rasterio and read each band into a NumPy array so the hash reflects decoded pixel values rather than the compressed byte layout on disk."},
        {"@type": "HowToStep", "position": 2, "name": "Hash pixel arrays incrementally", "text": "Feed each band's raw buffer into a hashlib.sha256 object with update() so memory stays bounded and large multi-band rasters never load into a single concatenated buffer."},
        {"@type": "HowToStep", "position": 3, "name": "Append canonicalized geo-metadata", "text": "Serialize the affine transform to six fixed-precision floats and the CRS to its authority EPSG code, then feed that canonical string into the same hash so georeferencing is part of the identity."},
        {"@type": "HowToStep", "position": 4, "name": "Emit the hex digest", "text": "Call hexdigest() to produce a stable content id string that identifies the decoded imagery independent of TIFF tag order, timestamps, or the GDAL version that wrote the file."},
        {"@type": "HowToStep", "position": 5, "name": "Verify two re-exports match", "text": "Re-export the same source imagery to a new COG and confirm the content hash is identical even though the raw file SHA differs, proving the hash is re-export stable."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why does the SHA-256 of a COG file change every time I re-export it?",
          "acceptedAnswer": {"@type": "Answer", "text": "A GeoTIFF embeds volatile metadata in its header: the GDAL library version, a software tag, TIFF tag ordering, IFD offsets, and sometimes a creation timestamp. Re-running the same export with a newer GDAL, a different tag order, or on another machine rewrites those bytes even when every pixel is identical, so a raw-file SHA-256 changes while the imagery does not. Hashing the decoded pixel array plus canonical geo-metadata removes that volatility."}
        },
        {
          "@type": "Question",
          "name": "Should nodata pixels be included in a content hash?",
          "acceptedAnswer": {"@type": "Answer", "text": "Include the raw pixel buffer exactly as stored, including nodata fill values, and hash the declared nodata value itself as metadata. Masking nodata to a separate sentinel before hashing makes the result depend on your masking convention rather than the file, and two files with different nodata declarations but the same fill bytes would collide. Treat nodata as data plus a metadata field."}
        },
        {
          "@type": "Question",
          "name": "Is a content hash of pixels deterministic across machines for float rasters?",
          "acceptedAnswer": {"@type": "Answer", "text": "Yes, as long as you hash the stored bytes rather than recomputed values. Reading a float32 band with rasterio returns the exact IEEE-754 bytes that were written, so tobytes() is bit-identical everywhere. Determinism only breaks if you apply a scale, offset, resample, or dtype cast before hashing, because those operations can round differently across BLAS builds. Hash the array as read."}
        },
        {
          "@type": "Question",
          "name": "Does band order affect the content hash?",
          "acceptedAnswer": {"@type": "Answer", "text": "Yes. Hashing bands in a different sequence produces a different digest, so a three-band RGB and a BGR reordering of the same pixels hash differently. Always iterate bands in ascending index order (1..count) and record the band count in the metadata block so the hash is reproducible and reflects the intended channel semantics."}
        }
      ]
    }
  ]
}
</script>

# Computing Stable Content Hashes for COGs

A raw file SHA of a Cloud-Optimized GeoTIFF changes on almost every re-export, even when not a single pixel moved. GeoTIFF headers carry volatile bytes — a creation timestamp, a GDAL version tag, TIFF tag ordering, and shifting IFD offsets — so re-running the identical export on a newer library or a different machine rewrites the header and flips the digest. If your versioning layer keys on that file-level SHA, it will report phantom changes on every rebuild and mask real ones. The fix is to hash the *decoded* pixel array plus a *canonical* slice of geo-metadata (the affine transform and the CRS), producing a stable content id that stays identical across re-exports of the same imagery.

## Why a File-Level SHA Reports Phantom Changes

The SHA-256 of a byte stream is only as stable as the bytes. A COG is a container: compressed pixel tiles, overview pyramids, and a metadata header (the image file directory, or IFD). The pixel tiles are deterministic for a given codec, but the header is not. `gdal_translate` stamps a `TIFFTAG_SOFTWARE` string that names the GDAL version; tag write order can differ between builds; and the byte offsets that point to each tile shift when overview blocks are laid out differently. None of that alters the imagery a model trains on, yet all of it alters the file hash.

This matters most in a content-addressed workflow. When you track datasets with [DVC versioning](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/), the tool records each file's MD5 or SHA to decide what changed and what to re-upload. If a nightly pipeline re-exports rasters from a source archive, a file-level hash flags every raster as modified, triggering needless re-uploads across cloud remotes and burying the one tile that genuinely changed. A content hash that ignores header noise lets the versioning layer see the truth: same pixels, same georeferencing, same identity.

The diagram below contrasts the two hashing strategies on two re-exports of one scene.

<svg viewBox="0 0 640 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Comparison of a raw-file SHA that changes across re-exports versus a content SHA over pixels and geo-metadata that stays stable" style="width:100%;max-width:640px;display:block;margin:1.5rem auto;">
  <title>Raw-file SHA versus content SHA across two re-exports</title>
  <desc>Two re-exports of the same imagery are shown. The raw-file SHA reads the whole file including volatile header bytes and produces two different digests. The content SHA reads only decoded pixels plus canonical transform and EPSG, and produces one identical digest for both re-exports.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <!-- Export A -->
  <rect x="16" y="24" width="150" height="120" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>
  <text x="91" y="44" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85" font-family="sans-serif" font-weight="bold">Re-export A</text>
  <rect x="30" y="54" width="122" height="22" rx="3" fill="currentColor" opacity="0.22"/>
  <text x="91" y="69" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.75" font-family="sans-serif">header: GDAL 3.8, ts=10:02</text>
  <rect x="30" y="82" width="122" height="24" rx="3" fill="currentColor" opacity="0.1" stroke="currentColor" stroke-width="1" stroke-opacity="0.4"/>
  <text x="91" y="98" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.7" font-family="sans-serif">pixels + transform + EPSG</text>
  <!-- Export B -->
  <rect x="16" y="160" width="150" height="120" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>
  <text x="91" y="180" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85" font-family="sans-serif" font-weight="bold">Re-export B</text>
  <rect x="30" y="190" width="122" height="22" rx="3" fill="currentColor" opacity="0.22"/>
  <text x="91" y="205" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.75" font-family="sans-serif">header: GDAL 3.9, ts=11:47</text>
  <rect x="30" y="218" width="122" height="24" rx="3" fill="currentColor" opacity="0.1" stroke="currentColor" stroke-width="1" stroke-opacity="0.4"/>
  <text x="91" y="234" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.7" font-family="sans-serif">pixels + transform + EPSG</text>
  <!-- Raw path -->
  <line x1="166" y1="65" x2="300" y2="65" stroke="currentColor" stroke-width="1.5" opacity="0.45" marker-end="url(#ah)"/>
  <line x1="166" y1="201" x2="300" y2="201" stroke="currentColor" stroke-width="1.5" opacity="0.45" marker-end="url(#ah)"/>
  <text x="360" y="52" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6" font-family="sans-serif">raw-file SHA</text>
  <text x="360" y="70" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9" font-family="monospace">a91f…</text>
  <text x="360" y="214" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9" font-family="monospace">7c30…</text>
  <text x="420" y="133" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75" font-family="sans-serif">unstable — differs</text>
  <!-- Content path -->
  <line x1="152" y1="94" x2="470" y2="133" stroke="currentColor" stroke-width="1.5" opacity="0.45" stroke-dasharray="5 3" marker-end="url(#ah)"/>
  <line x1="152" y1="230" x2="470" y2="140" stroke="currentColor" stroke-width="1.5" opacity="0.45" stroke-dasharray="5 3" marker-end="url(#ah)"/>
  <rect x="472" y="120" width="150" height="34" rx="5" fill="currentColor" opacity="0.14" stroke="currentColor" stroke-width="1.5" stroke-opacity="0.5"/>
  <text x="547" y="135" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7" font-family="sans-serif">content SHA</text>
  <text x="547" y="149" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.95" font-family="monospace">e5b2…</text>
  <text x="547" y="176" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.8" font-family="sans-serif">stable — identical</text>
  <defs>
    <marker id="ah" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
      <polygon points="0 0, 8 3, 0 6" fill="currentColor" opacity="0.5"/>
    </marker>
  </defs>
</svg>

## Step-by-Step Implementation

Install the pinned toolchain once. `rasterio` bundles its own GDAL, so the decoded pixel values are consistent regardless of any system GDAL:

```bash
pip install rasterio==1.3.10 numpy==1.26.4
```

### Step 1 — Read Decoded Pixels Band by Band

Open the COG with `rasterio` and read one band at a time. Reading with `rasterio` decodes the compression and returns the stored sample values as a NumPy array, so the codec, tiling scheme, and overview layout drop out of the hash entirely. Iterating band by band keeps memory bounded for large multi-band scenes:

```python
import hashlib
import rasterio
from rasterio.io import DatasetReader


def _hash_pixels(dataset: DatasetReader, digest: "hashlib._Hash") -> None:
    """Feed each band's decoded bytes into the running digest, in index order."""
    for band_index in range(1, dataset.count + 1):
        band = dataset.read(band_index)          # 2D ndarray, dtype preserved
        digest.update(band.tobytes(order="C"))   # exact stored IEEE/int bytes
```

`band.tobytes(order="C")` serializes the array in a fixed row-major order so the byte stream never depends on NumPy's internal memory layout. Because `read()` returns the values exactly as stored, `float32` and `int16` rasters are bit-reproducible across machines.

### Step 2 — Hash Pixel Buffers Incrementally

Use a single `hashlib.sha256` object and `update()` it per band rather than concatenating every band into one buffer. This bounds peak memory to a single band and makes the order of bands explicit — a property that becomes part of the content identity:

<svg viewBox="0 40 720 217" role="img" aria-label="Hashing decoded bands one at a time so memory stays flat regardless of scene size" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>Feed the hasher band by band, not scene by scene</title>
  <desc>Each band is decoded into a buffer, fed to the running SHA-256 state and discarded before the next band is read. Peak memory is one band, not four, and the digest is identical to hashing the concatenated array. The band order must be fixed, because feeding the same four bands in a different sequence produces a different digest.</desc>
  <rect x="0" y="40" width="720" height="217" style="fill:var(--bg)"/>
  <defs>
    <marker id="hb-arr" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor"/>
    </marker>
  </defs>
  <rect x="20" y="60" width="92" height="46" rx="5" fill="none" stroke="currentColor" stroke-width="1.4"/>
  <text x="66" y="88" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">band 1</text>
  <rect x="20" y="116" width="92" height="46" rx="5" fill="none" stroke="currentColor" stroke-width="1.4"/>
  <text x="66" y="144" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">band 2</text>
  <rect x="130" y="60" width="92" height="46" rx="5" fill="none" stroke="currentColor" stroke-width="1.4"/>
  <text x="176" y="88" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">band 3</text>
  <rect x="130" y="116" width="92" height="46" rx="5" fill="none" stroke="currentColor" stroke-width="1.4"/>
  <text x="176" y="144" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">band 4</text>
  <text x="121" y="184" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">read in a fixed order, one at a time</text>
  <line x1="224" y1="111" x2="272" y2="111" stroke="currentColor" stroke-width="1.5" marker-end="url(#hb-arr)"/>
  <rect x="274" y="82" width="170" height="58" rx="6" fill="none" stroke="currentColor" stroke-width="2"/>
  <text x="359" y="106" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">h.update(buffer)</text>
  <text x="359" y="124" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">state is 32 bytes, always</text>
  <line x1="444" y1="111" x2="490" y2="111" stroke="currentColor" stroke-width="1.5" marker-end="url(#hb-arr)"/>
  <rect x="492" y="82" width="208" height="58" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="596" y="106" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">then transform + EPSG</text>
  <text x="596" y="124" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace" opacity="0.75">h.hexdigest()</text>
  <text x="360" y="216" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">peak memory is one band, whatever the scene size — and the digest matches hashing the whole array at once</text>
  <text x="360" y="234" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">provided the band order never varies, because the hasher has no idea it is looking at bands</text>
</svg>

```python
def _new_digest() -> "hashlib._Hash":
    """A fresh SHA-256 accumulator, domain-separated with a version tag."""
    digest = hashlib.sha256()
    digest.update(b"cog-content-hash-v1\x00")   # guards against format drift
    return digest
```

The leading version tag (`cog-content-hash-v1`) domain-separates this scheme, so if you ever change what goes into the hash you can bump the tag and avoid silent collisions with previously computed ids.

### Step 3 — Append Canonicalized Transform and EPSG

Pixels alone are not the whole identity: two rasters can share pixel values while sitting at different map locations. Fold the georeferencing in, but *canonicalize* it first so formatting noise cannot leak in. Serialize the affine transform to six fixed-precision floats and reduce the CRS to its authority code. The first raster in your pipeline is typically stored in a projected CRS such as [`EPSG:32633`](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/); reducing it to that integer code makes the hash independent of the exact WKT string GDAL happened to emit:

<svg viewBox="0 0 720 260" role="img" aria-label="A canonical form for the transform and CRS before they enter the hash" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>Canonicalise the spatial metadata or it will hash differently every time</title>
  <desc>The same transform can be printed as 0.3 or 0.30000000000000004 depending on the code path, and the same CRS can arrive as an EPSG code, a PROJ string or a multi-kilobyte WKT with different whitespace. Both are reduced to one form — fixed-precision decimals and the integer authority code — before being appended to the hash.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <text x="180" y="38" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">as it arrives</text>
  <text x="540" y="38" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">as it is hashed</text>
  <line x1="20" y1="48" x2="700" y2="48" stroke="currentColor" stroke-width="1" opacity="0.4"/>
  <rect x="20" y="62" width="320" height="76" rx="6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="5 3"/>
  <text x="36" y="86" font-size="10" fill="currentColor" font-family="monospace">0.30000000000000004</text>
  <text x="36" y="106" font-size="10" fill="currentColor" font-family="monospace">512340.2000000001</text>
  <text x="36" y="128" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">float repr varies by code path</text>
  <rect x="380" y="62" width="320" height="76" rx="6" fill="none" stroke="currentColor" stroke-width="2"/>
  <text x="396" y="86" font-size="10" fill="currentColor" font-family="monospace">"0.300000"</text>
  <text x="396" y="106" font-size="10" fill="currentColor" font-family="monospace">"512340.200000"</text>
  <text x="396" y="128" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">six decimals, always — a sub-micron rule</text>
  <rect x="20" y="152" width="320" height="76" rx="6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="5 3"/>
  <text x="36" y="176" font-size="10" fill="currentColor" font-family="monospace">PROJCS["ETRS89 / UTM zone 32N",…</text>
  <text x="36" y="196" font-size="10" fill="currentColor" font-family="monospace">+proj=utm +zone=32 +ellps=GRS80…</text>
  <text x="36" y="218" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">same CRS, three spellings, different bytes</text>
  <rect x="380" y="152" width="320" height="76" rx="6" fill="none" stroke="currentColor" stroke-width="2"/>
  <text x="396" y="180" font-size="12" fill="currentColor" font-family="monospace">25832</text>
  <text x="396" y="204" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">the integer authority code, resolved once</text>
  <text x="396" y="220" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">with to_epsg(); fail loudly if it is None</text>
  <text x="360" y="252" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">canonicalise before hashing, not after comparing — the second is a debugging session, the first is a rule</text>
</svg>

```python
from rasterio.transform import Affine
from rasterio.crs import CRS


def _canonical_geo(transform: Affine, crs: CRS | None) -> bytes:
    """Format the geotransform and CRS into a stable, whitespace-free byte string."""
    coeffs = (transform.a, transform.b, transform.c,
              transform.d, transform.e, transform.f)
    transform_str = ",".join(f"{c:.10g}" for c in coeffs)
    epsg = crs.to_epsg() if crs is not None else None
    crs_str = f"EPSG:{epsg}" if epsg is not None else (crs.to_wkt() if crs else "NONE")
    return f"|transform={transform_str}|crs={crs_str}".encode("utf-8")
```

Using `{c:.10g}` fixes the printed precision so `10.0` and `10.000000001` never both appear from equivalent transforms, and falling back to WKT only when a raster lacks an EPSG code keeps unusual custom projections hashable.

### Step 4 — Produce the Hex Digest

Assemble the pieces into one entry point. It opens the file, hashes pixels, appends the metadata block (including band count, dtype, and declared nodata so those are part of the identity too), and returns the hex string:

```python
def content_hash_cog(path: str) -> str:
    """Return a re-export-stable SHA-256 hex digest for a COG's content."""
    digest = _new_digest()
    with rasterio.open(path) as dataset:
        _hash_pixels(dataset, digest)
        meta = (
            f"|bands={dataset.count}"
            f"|dtype={dataset.dtypes[0]}"
            f"|nodata={dataset.nodata}"
        ).encode("utf-8")
        digest.update(meta)
        digest.update(_canonical_geo(dataset.transform, dataset.crs))
    return digest.hexdigest()
```

### Step 5 — Verify Two Re-exports Match

Prove the property that motivated the whole exercise: re-export the same source imagery and confirm the content hash is identical even though the file SHA differs. This assertion belongs in your test suite so a future GDAL upgrade cannot silently break reproducibility:

```python
import hashlib
from pathlib import Path


def raw_file_sha(path: str) -> str:
    """Plain SHA-256 of the on-disk bytes — the unstable baseline."""
    h = hashlib.sha256()
    h.update(Path(path).read_bytes())
    return h.hexdigest()


def assert_reexport_stable(export_a: str, export_b: str) -> None:
    """export_a and export_b are two COG exports of identical imagery."""
    assert content_hash_cog(export_a) == content_hash_cog(export_b), "content drifted"
    assert raw_file_sha(export_a) != raw_file_sha(export_b), "headers identical?"
    print("content hash stable:", content_hash_cog(export_a))
```

The content hash now serves as a durable id in a manifest — the same manifest that drives [content-addressed sync across cloud remotes](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/syncing-annotations-across-cloud-remotes/), where re-uploading a raster only because its header changed is pure waste.

## What Goes Into the Hash — and What Must Not

Deciding which inputs belong in the digest is the whole design. The table below records the ruling for each candidate input and the reason.

| Input to hash | Included? | Why |
|---|---|---|
| Decoded pixel values (per band) | Yes | The imagery itself — the primary content identity |
| Band count and order | Yes | RGB vs BGR are different data; order must be fixed and recorded |
| Sample dtype (e.g. `float32`) | Yes | `1.0` as int and as float are different bytes; dtype disambiguates |
| Affine geotransform (6 coeffs) | Yes | Same pixels at a different map location are a different tile |
| CRS as EPSG authority code | Yes | Georeferencing identity, canonicalized to dodge WKT string noise |
| Declared nodata value | Yes | Distinguishes fill semantics; hashed as metadata, not masked |
| TIFF tag ordering / IFD offsets | No | Volatile across GDAL builds; irrelevant to imagery |
| Creation timestamp / software tag | No | Changes every export; the main source of phantom diffs |
| Compression codec & tiling | No | `read()` decodes these away; LZW vs DEFLATE yield identical pixels |
| Overview pyramids | No | Derived from the base raster; not independent content |
| Full WKT projection string | No | Verbose and build-dependent; the EPSG code is the stable form |

## Common Errors and Fixes

**Content hash differs after masking nodata**
Root cause: the code replaced nodata fill with `np.nan` or a sentinel before hashing, so the result depends on the masking convention rather than the stored bytes.
Fix: hash `dataset.read(i).tobytes()` on the raw array and fold the declared nodata value in as a separate metadata field, exactly as `content_hash_cog` does. Never mutate the array before `tobytes()`.

**Float rasters hash differently on another machine**
Root cause: a scale, offset, `astype()` cast, or resample was applied before hashing, and those operations round differently across BLAS or GDAL builds.
Fix: hash the array precisely as `read()` returns it. `read()` yields the stored IEEE-754 bytes with no recomputation, so `tobytes()` is bit-identical everywhere. Move any scaling downstream of the hash.

**RGB and BGR versions of one scene collide or diverge unexpectedly**
Root cause: bands were read in an unstable order — for example by iterating a Python set of indices or by relying on a color-interpretation lookup that varies between files.
Fix: always iterate `range(1, dataset.count + 1)` in ascending order and record `bands=` in the metadata block. Reordered channels then hash to distinct, reproducible ids.

**`content_hash_cog` raises on a raster with no CRS**
Root cause: `dataset.crs` is `None` for an ungeoreferenced TIFF and `to_epsg()` cannot be called on it.
Fix: the `_canonical_geo` guard handles this by emitting `crs=NONE`. If you require georeferencing, validate `dataset.crs is not None` before hashing and reject the file, which also catches the truncated headers described in [recovering from a corrupted COG export](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/rollback-strategies-for-corrupted-spatial-datasets/recovering-from-a-corrupted-cog-export/).

## Related

- [Tracking Annotation Changes with SHA Hashing](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/tracking-annotation-changes-with-sha-hashing/) — the topic area this guide belongs to, covering content-addressed change detection across a versioned annotation pipeline
- [Recovering from a Corrupted COG Export](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/rollback-strategies-for-corrupted-spatial-datasets/recovering-from-a-corrupted-cog-export/) — diagnose truncated IFDs and broken overviews that a content hash will also expose as unreadable
- [Syncing Annotations Across Cloud Remotes](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/syncing-annotations-across-cloud-remotes/) — use stable content ids so a re-export with a fresh header never triggers a needless re-upload
- [Implementing DVC for Geospatial Training Data](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/) — the versioning layer that keys on file hashes and benefits most from a stable content id
- [Coordinate Reference Systems in Annotation Pipelines](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) — why the EPSG authority code, not raw WKT, is the canonical CRS identity to fold into a hash

This guide is one detailed technique within [Tracking Annotation Changes with SHA Hashing](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/tracking-annotation-changes-with-sha-hashing/), which is itself part of [Dataset Versioning & Spatial Data Sync](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/).
