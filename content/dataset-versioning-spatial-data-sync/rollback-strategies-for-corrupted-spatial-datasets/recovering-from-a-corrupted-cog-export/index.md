---
title: "Recovering from a Corrupted COG Export"
description: "Diagnose and recover from a corrupted Cloud-Optimized GeoTIFF export — truncated IFDs, broken overviews, invalid geotransform — using gdalinfo, rio-cogeo validation, and a versioned rollback."
slug: "recovering-from-a-corrupted-cog-export"
type: "tutorial"
breadcrumb:
  - label: "Home"
    url: "/"
  - label: "Dataset Versioning & Spatial Data Sync"
    url: "/dataset-versioning-spatial-data-sync/"
  - label: "Rollback Strategies for Corrupted Spatial Datasets"
    url: "/dataset-versioning-spatial-data-sync/rollback-strategies-for-corrupted-spatial-datasets/"
  - label: "Recovering from a Corrupted COG Export"
    url: "/dataset-versioning-spatial-data-sync/rollback-strategies-for-corrupted-spatial-datasets/recovering-from-a-corrupted-cog-export/"
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
      "headline": "Recovering from a Corrupted COG Export",
      "description": "Diagnose and recover from a corrupted Cloud-Optimized GeoTIFF export — truncated IFDs, broken overviews, invalid geotransform — using gdalinfo, rio-cogeo validation, and a versioned rollback.",
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
        {"@type": "ListItem", "position": 3, "name": "Rollback Strategies for Corrupted Spatial Datasets", "item": "https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/rollback-strategies-for-corrupted-spatial-datasets/"},
        {"@type": "ListItem", "position": 4, "name": "Recovering from a Corrupted COG Export", "item": "https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/rollback-strategies-for-corrupted-spatial-datasets/recovering-from-a-corrupted-cog-export/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Recovering from a Corrupted COG Export",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Diagnose with gdalinfo and rio cogeo validate", "text": "Run gdalinfo to surface truncated IFDs, missing overviews, and geotransform anomalies, then run rio cogeo validate to confirm whether the file still satisfies the Cloud-Optimized GeoTIFF layout contract."},
        {"@type": "HowToStep", "position": 2, "name": "Classify the failure as structural or data loss", "text": "Determine whether the primary raster band data reads cleanly. Overview loss, an unset geotransform, or an out-of-order layout are structural and repairable in place; a truncated primary IFD or read errors on the base band mean the pixel data itself is gone."},
        {"@type": "HowToStep", "position": 3, "name": "Rebuild a valid COG in place when the data survives", "text": "When the base band reads, use rasterio to detect and reassign a valid geotransform, then rewrite the file through rio-cogeo's cog_translate so overviews and IFD ordering are regenerated to spec."},
        {"@type": "HowToStep", "position": 4, "name": "Roll back to the last valid DVC version when data is lost", "text": "If the primary band cannot be read, restore the last known-good COG from version control using dvc checkout against a prior commit or dvc get from the remote, then re-verify with rio cogeo validate before returning the asset to the pipeline."},
        {"@type": "HowToStep", "position": 5, "name": "Re-validate and re-hash the recovered asset", "text": "Confirm the recovered COG passes rio cogeo validate, then record a stable content hash so downstream annotation and training stages can detect any future drift."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What does a truncated IFD mean in a corrupted COG?",
          "acceptedAnswer": {"@type": "Answer", "text": "The Image File Directory (IFD) is the TIFF header structure that indexes each raster level's tile offsets and byte counts. A truncated IFD means the write was interrupted before the directory or its referenced tile data was fully flushed to disk, so gdalinfo reports a read error or a smaller-than-expected raster size. If the truncation hits the primary full-resolution IFD, the base pixel data is unrecoverable and you must roll back; if it only affects overview IFDs, you can rebuild the overviews and keep the original data."}
        },
        {
          "@type": "Question",
          "name": "Can I repair a COG with a missing geotransform without re-exporting?",
          "acceptedAnswer": {"@type": "Answer", "text": "Yes, when you know the correct affine geotransform and CRS from a sidecar, a STAC item, or an intact sibling tile. Read the raster with rasterio, assign the recovered Affine transform and CRS to the profile, and rewrite the file through rio-cogeo. The pixel data is untouched — only the georeferencing metadata is restored. If the transform is unknown and cannot be reconstructed, the raster is effectively unusable for annotation and a versioned rollback is safer."}
        },
        {
          "@type": "Question",
          "name": "Why does rio cogeo validate fail even though gdalinfo opens the file?",
          "acceptedAnswer": {"@type": "Answer", "text": "gdalinfo will open any readable TIFF, but rio cogeo validate enforces the stricter Cloud-Optimized GeoTIFF layout contract: tiled internal organization, an overview pyramid, and IFDs ordered so headers precede image data for efficient range reads. A plain GeoTIFF, or a COG whose overviews were stripped or reordered during a partial rewrite, opens fine in gdalinfo but fails validation. Rewriting the file through cog_translate restores the required layout."}
        },
        {
          "@type": "Question",
          "name": "When should I rebuild a COG in place versus roll back to a versioned copy?",
          "acceptedAnswer": {"@type": "Answer", "text": "Rebuild in place whenever the primary raster band reads without error and only the structure — overviews, IFD ordering, or geotransform — is broken, because rebuilding preserves the exact original pixels. Roll back to the last valid DVC-tracked version whenever the base band itself throws read errors, the primary IFD is truncated, or checksums no longer match, because at that point the underlying imagery is lost and any in-place fix would only produce a valid container around missing data."}
        }
      ]
    }
  ]
}
</script>

# Recovering from a Corrupted COG Export

A Cloud-Optimized GeoTIFF (COG) that fails midway through an export leaves a file that may still open, still preview, and still pass a casual glance — yet break the moment a training loader tries to range-read a tile or a reprojection step reads its geotransform. Recovery follows one disciplined path: diagnose the exact failure with `gdalinfo` and `rio cogeo validate`, decide whether the primary pixel data survived, and then either rebuild a valid COG around the intact data or roll back to the last known-good copy tracked in [DVC versioning](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/). The one decision that governs everything is whether the corruption is structural — overviews, layout, or georeferencing metadata — or whether the base raster band itself is gone. Structural damage is repairable in place; lost primary data is not, and the only correct response is a versioned restore.

## Why a Silently Corrupted COG Poisons Downstream Training

A COG packs the full-resolution image plus a pyramid of downsampled overviews into a single tiled TIFF, with Image File Directories (IFDs) arranged so that headers precede pixel data. That layout is what lets a remote reader fetch a 512-pixel tile over HTTP range requests without downloading gigabytes. When an export is interrupted — a killed process, a full disk, a dropped network mount, a partial multipart upload — the IFD chain or the tile offsets it references can be truncated. The damage is often invisible: the file still carries a valid magic number and an openable primary header, so a thumbnail renders and `gdalinfo` prints dimensions.

The failure surfaces later and far from its cause. An annotation loader that reads the highest overview to draw a slippy-map preview works fine, but the training pipeline that range-reads full-resolution tiles hits a byte offset that points past the end of the file. Or the geotransform came back as the identity affine, so every polygon annotation reprojects to the wrong ground coordinates and the model trains on systematically mislocated labels. Because the corruption is structural rather than a crash, nothing throws until deep inside a batch. Catching it at the point of export — and knowing immediately whether to repair or roll back — is what keeps a bad file out of a training run.

The cost of a wrong diagnosis runs in both directions. Treat a data-loss failure as structural and you will happily rewrite a valid-looking COG around zeroed or missing pixels, then ship it downstream where it silently degrades every model that touches it. Treat a merely structural failure as data loss and you roll back further than necessary, discarding a perfectly recoverable export and forcing an expensive re-acquisition or re-processing run. The diagnostic steps below exist to remove that ambiguity: they force the primary band to be read, so the repair-versus-restore decision is driven by evidence rather than by how the file happens to open in a viewer.

## Diagnosing the Corruption with gdalinfo and rio cogeo validate

Install the toolchain with pinned versions so diagnosis is reproducible across machines:

<svg viewBox="0 0 720 250" role="img" aria-label="What gdalinfo and the COG validator each report for a file that opens but is no longer cloud-optimized" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>The two tools disagree, and that disagreement is the diagnosis</title>
  <desc>For a re-saved scene, gdalinfo reports size, bands, CRS and transform without complaint, because the file is a perfectly valid GeoTIFF. The COG validator reports that the image is striped rather than tiled and that the overviews are missing. A file can be readable and still be unusable for range requests, which is the state a naive re-save leaves it in.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <rect x="20" y="46" width="330" height="150" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="185" y="70" text-anchor="middle" font-size="12" fill="currentColor" font-family="monospace" font-weight="600">gdalinfo scene.tif</text>
  <text x="38" y="98" font-size="10" fill="currentColor" font-family="monospace">Size is 40000, 40000</text>
  <text x="38" y="118" font-size="10" fill="currentColor" font-family="monospace">Coordinate System is EPSG:25832</text>
  <text x="38" y="138" font-size="10" fill="currentColor" font-family="monospace">Pixel Size = (0.300, -0.300)</text>
  <text x="38" y="158" font-size="10" fill="currentColor" font-family="monospace">Band 1..4  Type=UInt16</text>
  <text x="185" y="184" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">no complaint — it is a valid GeoTIFF</text>
  <rect x="370" y="46" width="330" height="150" rx="6" fill="none" stroke="currentColor" stroke-width="2"/>
  <text x="535" y="70" text-anchor="middle" font-size="12" fill="currentColor" font-family="monospace" font-weight="600">rio cogeo validate scene.tif</text>
  <text x="388" y="98" font-size="10" fill="currentColor" font-family="monospace">The file is greater than 512xH or W,</text>
  <text x="388" y="116" font-size="10" fill="currentColor" font-family="monospace">it is recommended to include overviews</text>
  <text x="388" y="140" font-size="10" fill="currentColor" font-family="monospace">The file is not tiled</text>
  <text x="388" y="164" font-size="10" fill="currentColor" font-family="monospace">→ scene.tif is NOT a valid COG</text>
  <text x="535" y="184" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">the structure was lost on the last re-save</text>
  <text x="360" y="226" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">any tool that opens, edits and writes a GeoTIFF without COG options produces exactly this file —</text>
  <text x="360" y="242" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">readable everywhere, and slow from object storage forever</text>
</svg>

```bash
pip install rasterio==1.3.10 rio-cogeo==5.3.0 numpy==1.26.4
```

Start with `gdalinfo`. It reports the driver, raster dimensions, the geotransform (the `Origin` and `Pixel Size` lines), the CRS, and the overview levels attached to each band. Add `-stats` to force a read of the primary band — this is the single most useful signal, because a truncated primary IFD or missing tile data throws an I/O error here rather than staying hidden:

```bash
gdalinfo -stats suspect_export.tif
```

Read the output for three things. A geotransform reported as `Origin = (0.0, 0.0)` with `Pixel Size = (1.0, -1.0)` is the GDAL default — the real georeferencing was never written. An `Overviews:` line that is absent from a file that should carry a pyramid means the overview IFDs were stripped or never flushed. An `ERROR 1: ... failed to read` during `-stats` means the primary band data itself is unreadable, which is the one symptom you cannot repair in place.

Then run the strict layout check. `gdalinfo` opens any readable TIFF, but `rio cogeo validate` enforces the Cloud-Optimized contract specifically — internal tiling, an overview pyramid, and IFD ordering:

```bash
rio cogeo validate suspect_export.tif
```

A response of `is_valid: False` with a message such as `The file is not tiled` or `The offset of the IFD for overview ... is not greater than the previous` tells you the pixels may be fine but the layout is broken, which `cog_translate` can rewrite. A hard read error during validation points back to lost primary data.

## Choosing Between In-Place Repair and Versioned Rollback

The diagnosis funnels into a single branch. If the primary band reads cleanly and only the structure is wrong — no overviews, a bad geotransform, or an out-of-order layout — rebuild the COG in place and keep the exact original pixels. If the base band throws read errors or the primary IFD is truncated, the imagery is lost and no rewrite can recreate it; restore the last valid copy from version control instead.

<svg viewBox="0 0 720 280" role="img" aria-label="Deciding between repairing a corrupted export in place and rolling back to the last valid version" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>Repair or roll back — the question is whether the pixels survived</title>
  <desc>If the pixel data still decodes and only the structure is wrong, rebuilding the COG from the same pixels is safe and keeps the version lineage. If pixels fail to decode, or the source scene is gone, rolling back to the last verified version is the only honest option. Rebuilding from partially readable pixels produces a file that validates and lies.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <defs>
    <marker id="cc-arr" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor"/>
    </marker>
  </defs>
  <rect x="250" y="30" width="220" height="46" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="360" y="58" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">do all bands decode cleanly?</text>
  <line x1="360" y1="76" x2="360" y2="98" stroke="currentColor" stroke-width="1.5" marker-end="url(#cc-arr)"/>
  <rect x="250" y="100" width="220" height="46" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="360" y="128" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">does the checksum match?</text>
  <!-- yes branch -->
  <line x1="470" y1="123" x2="530" y2="123" stroke="currentColor" stroke-width="1.5" marker-end="url(#cc-arr)"/>
  <text x="500" y="115" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">yes</text>
  <rect x="532" y="98" width="176" height="50" rx="6" fill="none" stroke="currentColor" stroke-width="2"/>
  <text x="620" y="120" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">rebuild the COG</text>
  <text x="620" y="138" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">structure was wrong, not the data</text>
  <!-- no branch -->
  <line x1="360" y1="146" x2="360" y2="170" stroke="currentColor" stroke-width="1.5" marker-end="url(#cc-arr)"/>
  <text x="352" y="164" text-anchor="end" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">no</text>
  <rect x="250" y="172" width="220" height="46" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="360" y="200" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">is the source scene still available?</text>
  <line x1="470" y1="195" x2="530" y2="195" stroke="currentColor" stroke-width="1.5" marker-end="url(#cc-arr)"/>
  <text x="500" y="187" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">yes</text>
  <rect x="532" y="170" width="176" height="50" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="620" y="192" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">re-export from source</text>
  <text x="620" y="210" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">then re-verify the hash</text>
  <line x1="360" y1="218" x2="360" y2="240" stroke="currentColor" stroke-width="1.5" marker-end="url(#cc-arr)"/>
  <text x="352" y="234" text-anchor="end" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">no</text>
  <rect x="184" y="242" width="352" height="32" rx="6" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="5 3"/>
  <text x="360" y="263" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">roll back to the last verified version</text>
  <!-- Warning -->
  <text x="120" y="60" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">never rebuild from</text>
  <text x="120" y="76" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">partially readable pixels —</text>
  <text x="120" y="92" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">the result validates cleanly</text>
  <text x="120" y="108" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">and is still wrong</text>
</svg>

<svg viewBox="0 0 640 360" role="img" aria-label="Decision flow for recovering a corrupted COG export: validate, then either rebuild in place or roll back to the last good version" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:640px;display:block;margin:1.5rem auto;">
  <title>COG recovery decision flow</title>
  <desc>A flowchart. Start at a suspect COG export. Run gdalinfo and rio cogeo validate. Ask whether the primary band reads. If yes, the damage is structural and repairable, so detect and fix the geotransform and rewrite the COG through cog_translate, then re-validate. If no, the primary data is lost, so roll back to the last valid DVC-tracked version with dvc checkout or dvc get, then re-validate. Both branches converge on a re-validate and re-hash step.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <defs>
    <marker id="flowarrow" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto">
      <polygon points="0 0, 9 3.5, 0 7" fill="currentColor" opacity="0.55"/>
    </marker>
  </defs>
  <rect x="220" y="10" width="200" height="42" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>
  <text x="320" y="30" text-anchor="middle" font-size="12" fill="currentColor" opacity="0.85" font-family="sans-serif">Suspect COG export</text>
  <text x="320" y="45" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.55" font-family="sans-serif">gdalinfo -stats  +  rio cogeo validate</text>
  <line x1="320" y1="52" x2="320" y2="76" stroke="currentColor" stroke-width="1.5" opacity="0.5" marker-end="url(#flowarrow)"/>
  <polygon points="320,80 430,124 320,168 210,124" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>
  <text x="320" y="120" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85" font-family="sans-serif">Primary band</text>
  <text x="320" y="134" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85" font-family="sans-serif">reads cleanly?</text>
  <text x="150" y="118" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.7" font-family="sans-serif" font-weight="bold">yes</text>
  <text x="150" y="132" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.5" font-family="sans-serif">structural damage</text>
  <line x1="210" y1="124" x2="150" y2="124" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <line x1="90" y1="124" x2="90" y2="210" stroke="currentColor" stroke-width="1.5" opacity="0.5" marker-end="url(#flowarrow)"/>
  <line x1="150" y1="124" x2="90" y2="124" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="500" y="118" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.7" font-family="sans-serif" font-weight="bold">no</text>
  <text x="500" y="132" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.5" font-family="sans-serif">data loss</text>
  <line x1="430" y1="124" x2="550" y2="124" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <line x1="550" y1="124" x2="550" y2="210" stroke="currentColor" stroke-width="1.5" opacity="0.5" marker-end="url(#flowarrow)"/>
  <rect x="10" y="212" width="160" height="52" rx="6" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-width="1.5" opacity="0.45"/>
  <text x="90" y="234" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9" font-family="sans-serif">Rebuild in place</text>
  <text x="90" y="250" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.6" font-family="sans-serif">fix geotransform +</text>
  <text x="90" y="261" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.6" font-family="sans-serif">cog_translate rewrite</text>
  <rect x="470" y="212" width="160" height="52" rx="6" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-width="1.5" opacity="0.45"/>
  <text x="550" y="234" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9" font-family="sans-serif">Roll back</text>
  <text x="550" y="250" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.6" font-family="sans-serif">last valid version</text>
  <text x="550" y="261" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.6" font-family="sans-serif">dvc checkout / dvc get</text>
  <line x1="90" y1="264" x2="90" y2="308" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <line x1="90" y1="308" x2="240" y2="308" stroke="currentColor" stroke-width="1.5" opacity="0.5" marker-end="url(#flowarrow)"/>
  <line x1="550" y1="264" x2="550" y2="308" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <line x1="550" y1="308" x2="400" y2="308" stroke="currentColor" stroke-width="1.5" opacity="0.5" marker-end="url(#flowarrow)"/>
  <rect x="240" y="288" width="160" height="52" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>
  <text x="320" y="310" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9" font-family="sans-serif">Re-validate + re-hash</text>
  <text x="320" y="326" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.6" font-family="sans-serif">rio cogeo validate → record content hash</text>
</svg>

## Rebuilding a Valid COG When the Pixels Survive

When the base band reads, the fix is to reassign a correct geotransform if one is missing and rewrite the file through `rio-cogeo`, which regenerates the overview pyramid and orders the IFDs to spec. The first mention of a georeferencing frame here is worth grounding: the geotransform and its [coordinate reference system](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) together map pixel indices to ground coordinates, and a COG that lost either is spatially meaningless even when its pixels are intact.

The helper below detects an invalid (identity or degenerate) geotransform, substitutes a recovered `Affine` and CRS when supplied, and rewrites a compliant COG:

```python
from pathlib import Path

import rasterio
from rasterio.crs import CRS
from rasterio.transform import Affine
from rio_cogeo.cogeo import cog_translate
from rio_cogeo.profiles import cog_profiles


def geotransform_is_invalid(transform: Affine) -> bool:
    """A default identity transform or zero-scale pixel is unusable for georeferencing."""
    is_identity: bool = transform == Affine.identity()
    has_zero_scale: bool = transform.a == 0.0 or transform.e == 0.0
    return is_identity or has_zero_scale


def rebuild_cog(
    src_path: Path,
    dst_path: Path,
    recovered_transform: Affine | None = None,
    recovered_crs: CRS | None = None,
) -> None:
    """Rewrite a structurally broken COG, restoring georeferencing when supplied."""
    with rasterio.open(src_path) as src:
        profile = src.profile.copy()
        data = src.read()  # raises if the primary band data is truncated

        if geotransform_is_invalid(src.transform):
            if recovered_transform is None or recovered_crs is None:
                raise ValueError(
                    "Geotransform is invalid and no recovery values were provided; "
                    "roll back to a versioned copy instead."
                )
            profile.update(transform=recovered_transform, crs=recovered_crs)

    # Write a temporary plain GeoTIFF with corrected metadata, then translate to COG.
    tmp_path = dst_path.with_suffix(".tmp.tif")
    with rasterio.open(tmp_path, "w", **profile) as tmp:
        tmp.write(data)

    cog_translate(
        tmp_path,
        dst_path,
        cog_profiles.get("deflate"),
        overview_resampling="average",
        in_memory=False,
        quiet=True,
    )
    tmp_path.unlink(missing_ok=True)
```

The `src.read()` call is deliberate: if the primary IFD is truncated, it raises here and the rebuild aborts before producing a valid-looking container around missing data. When it succeeds, `cog_translate` rebuilds the overview pyramid with `average` resampling and writes IFDs in the order `rio cogeo validate` expects. If the export's origin coordinates use a specific `[`EPSG:32633`](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/)` UTM frame, pass that as `recovered_crs` so the rewritten file carries the correct projection rather than an unset one.

Confirm the rebuild before releasing it back to the pipeline:

```bash
rio cogeo validate rebuilt_export.tif
```

## Rolling Back to the Last Valid Version

When the primary band cannot be read, no rewrite helps — the pixels are gone. Restore the last known-good asset from version control. If the corrupted file is DVC-tracked, check out the version from the commit before the bad export landed:

```bash
# Inspect the history of the tracked COG pointer.
git log --oneline -- data/tiles/scene_0421.tif.dvc

# Restore the pointer to the last good commit, then materialize the data.
git checkout <good_commit_sha> -- data/tiles/scene_0421.tif.dvc
dvc checkout data/tiles/scene_0421.tif.dvc
```

`git checkout` rewinds the small `.dvc` pointer file to the known-good content hash, and `dvc checkout` pulls the matching COG from the local cache or remote into the workspace. To fetch a specific historical version straight from the remote without touching the working tree — useful when recovering into a clean staging area — use `dvc get` against the good revision:

```bash
dvc get . data/tiles/scene_0421.tif \
  --rev <good_commit_sha> \
  --out recovered/scene_0421.tif
```

Always re-validate the restored file with `rio cogeo validate` before returning it to service, then record a fresh content hash so downstream stages can detect future drift — [computing stable content hashes for COGs](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/tracking-annotation-changes-with-sha-hashing/computing-stable-content-hashes-for-cogs/) covers hashing that ignores volatile metadata so an identical raster always hashes identically across re-exports.

## Symptom-to-Fix Reference

| Symptom | gdalinfo / validate check | Fix |
|---|---|---|
| File opens but training range-reads fail | `gdalinfo -stats` throws `ERROR 1: failed to read`; validate reports read error on primary | Primary IFD truncated — data lost; roll back with `dvc checkout` |
| Preview renders, full-res tiles missing | `Overviews:` line absent; `rio cogeo validate` says not tiled / no overviews | Structural — rebuild pyramid via `cog_translate` |
| Annotations reproject to wrong location | `Origin = (0.0, 0.0)`, `Pixel Size = (1.0, -1.0)` | Reassign recovered `Affine` + CRS, then rewrite COG |
| `is_valid: False` but pixels read fine | Validate reports IFD offset ordering error | Rewrite through `cog_translate` to reorder IFDs |
| CRS reported as `Unknown` / empty | `gdalinfo` shows no `PROJCRS` block | Set `recovered_crs` from sidecar or STAC item and rebuild |
| Hash mismatch vs. tracked version | Content hash differs from `.dvc` record | Silent corruption; restore with `dvc get --rev` |

## Common Errors and Fixes

**`rasterio.errors.RasterioIOError: ... not recognized as a supported file format`**
Root cause: the export was truncated before the TIFF header magic bytes were written, so the file is not a valid TIFF at all.
Fix: the file is unrecoverable in place; roll back to the last DVC-tracked version.

**`rio cogeo validate` prints `is_valid: True` but tiles still fail remotely**
Root cause: the local copy is valid but a partial multipart upload left a truncated object on the remote.
Fix: re-upload from the validated local file, or `dvc checkout` to force the cache-verified copy back to the remote.

**`cog_translate` produces a valid COG but every pixel is nodata**
Root cause: `src.read()` returned an array of fill values because the base band data was zeroed during a failed write, and the truncation did not raise.
Fix: compare against the tracked content hash; if it differs, discard the rebuild and roll back rather than shipping a valid container of empty pixels.

**`ValueError: Geotransform is invalid and no recovery values were provided`**
Root cause: the georeferencing metadata is gone and no sidecar, STAC item, or sibling tile supplies the correct affine transform.
Fix: recover the transform from an intact adjacent tile in the same acquisition, or roll back to the versioned copy that still carries it.

## Related

- [Rollback Strategies for Corrupted Spatial Datasets](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/rollback-strategies-for-corrupted-spatial-datasets/) — the broader topic area covering how to detect, isolate, and reverse corruption across a versioned spatial dataset
- [Computing Stable Content Hashes for COGs](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/tracking-annotation-changes-with-sha-hashing/computing-stable-content-hashes-for-cogs/) — hash imagery in a way that ignores volatile metadata so silent corruption and drift are detectable
- [Implementing DVC for Geospatial Training Data](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/) — set up the version control that makes a clean rollback to a known-good COG possible
- [Debugging Annotation Drift Across Dataset Versions](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/rollback-strategies-for-corrupted-spatial-datasets/debugging-annotation-drift-across-dataset-versions/) — a sibling guide on tracing when and how labels diverge between versioned snapshots

This guide is part of the broader [Rollback Strategies for Corrupted Spatial Datasets](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/rollback-strategies-for-corrupted-spatial-datasets/), itself one topic within [Dataset Versioning & Spatial Data Sync](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/).
