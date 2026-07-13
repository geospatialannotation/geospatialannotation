---
title: "Tracking Annotation Changes with SHA Hashing"
description: "Implement deterministic SHA-256 hashing to detect silent annotation drift in geospatial ML datasets—covering normalization, manifest generation, spatial edge cases, and CI/CD integration."
slug: "tracking-annotation-changes-with-sha-hashing"
type: "guide"
breadcrumb: "Dataset Versioning & Spatial Data Sync"
datePublished: "2025-03-10"
dateModified: "2026-06-25"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Tracking Annotation Changes with SHA Hashing",
      "description": "Implement deterministic SHA-256 hashing to detect silent annotation drift in geospatial ML datasets—covering normalization, manifest generation, spatial edge cases, and CI/CD integration.",
      "datePublished": "2025-03-10",
      "dateModified": "2026-06-25",
      "author": {"@type": "Organization", "name": "Geospatial Annotation"},
      "publisher": {"@type": "Organization", "name": "Geospatial Annotation"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.geospatialannotation.com/"},
        {"@type": "ListItem", "position": 2, "name": "Dataset Versioning & Spatial Data Sync", "item": "https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/"},
        {"@type": "ListItem", "position": 3, "name": "Tracking Annotation Changes with SHA Hashing", "item": "https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/tracking-annotation-changes-with-sha-hashing/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Track Annotation Changes with SHA-256 Hashing",
      "description": "Build a deterministic annotation integrity pipeline using SHA-256 digests, version manifests, and CI/CD validation gates.",
      "step": [
        {"@type": "HowToStep", "name": "Normalize annotation payloads", "text": "Strip volatile metadata fields and enforce consistent JSON key ordering and coordinate precision."},
        {"@type": "HowToStep", "name": "Canonicalize spatial geometry", "text": "Round coordinates to 6 decimal places in EPSG:4326 and enforce RFC 7946 winding order on polygon rings."},
        {"@type": "HowToStep", "name": "Compute SHA-256 digests", "text": "Serialize normalized annotations to canonical UTF-8 bytes and hash with hashlib.sha256."},
        {"@type": "HowToStep", "name": "Generate version manifests", "text": "Build a JSON registry mapping every annotation file to its digest, feature count, and timestamp."},
        {"@type": "HowToStep", "name": "Validate against baseline", "text": "Compare the current manifest to a stored baseline before every training run to gate on integrity."},
        {"@type": "HowToStep", "name": "Integrate into CI/CD", "text": "Run validation scripts in GitHub Actions or GitLab CI on every pull request touching the annotations directory."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why do filesystem timestamps fail to detect geospatial annotation drift?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Modification timestamps update whenever a file is touched, even if re-saving with no semantic change. They cannot distinguish a coordinate nudge, a class relabel, or a polygon vertex reorder from a no-op file access. SHA-256 hashing of the normalized payload catches all three while ignoring volatile metadata such as annotator IDs or session timestamps."
          }
        },
        {
          "@type": "Question",
          "name": "What precision should I round coordinates to before hashing?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Six decimal places in WGS84 (EPSG:4326) represents approximately 0.11 m of ground precision, which is well within the resolution of sub-meter aerial imagery. Round all coordinate values to 6 decimal places before serialization to eliminate insignificant floating-point noise introduced by GIS software round-trips."
          }
        },
        {
          "@type": "Question",
          "name": "How do I handle polygon vertex ordering inconsistencies when hashing GeoJSON?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Rotate each ring's coordinate list so it starts at the lexicographically smallest (longitude, latitude) pair, then enforce a consistent winding order (counter-clockwise exterior rings per RFC 7946). Apply this canonicalization before serialization so geometrically identical polygons always produce the same hash regardless of the tool that generated them."
          }
        },
        {
          "@type": "Question",
          "name": "When should I hash in a projected CRS versus WGS84?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Always hash in a single consistent CRS chosen before the manifest is first generated for a dataset. For datasets where absolute coordinates matter (e.g. comparing annotations from multiple sources), normalize to EPSG:4326 first. For object detection workflows where metric distances or IoU thresholds are validated, normalize to a local projected CRS, compute any spatial checks, then hash. Never change the target CRS between manifest versions—it will invalidate every existing baseline hash."
          }
        }
      ]
    }
  ]
}
</script>

# Tracking Annotation Changes with SHA Hashing

Geospatial ML pipelines fail silently in ways that are difficult to catch after the fact. A bounding box shifts two pixels during a Label Studio re-export, a polygon ring reverses its winding order after a QGIS edit, or a class label is reassigned by a second annotator—none of these changes alter the file's modification timestamp or byte count. Training proceeds, metrics shift, and the root cause is invisible. **SHA-256 hashing applied to normalized annotation payloads** is the only reliable mechanism to catch all of these mutations deterministically, because it reduces the entire semantic state of an annotation to a 64-character hexadecimal string that changes if and only if the training-relevant content changes.

This workflow is one component of the broader [Dataset Versioning & Spatial Data Sync](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/) pipeline, where annotation integrity feeds directly into reproducible model checkpoints and rollback capability.

## Prerequisites & Toolchain Alignment

Install the following packages before starting. The standard library `hashlib` and `json` modules are sufficient for core hashing; `shapely` and `pyproj` are needed for spatial canonicalization.

```
hashlib          # stdlib — SHA-256
json             # stdlib — canonical serialization
pathlib          # stdlib — file traversal
shapely==2.0.6   # polygon normalization and winding-order enforcement
pyproj==3.6.1    # CRS transformation before hashing
orjson==3.10.3   # optional high-throughput JSON parsing for large datasets
```

**System requirements:** GDAL 3.8+ and PROJ 9.3+ installed at the system level. Python 3.10+ with explicit type hints throughout.

**Spatial knowledge prerequisites:** Understanding of [coordinate reference systems in annotation pipelines](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) is essential — hashing must occur after CRS normalization, not before. Annotations stored in mixed projections that are hashed before transformation produce manifests that cannot be compared across ingestion sources.

For foundational context on the broader pipeline these hashes live within, see the parent [Dataset Versioning & Spatial Data Sync](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/) overview, which covers DVC integration, metadata preservation, and rollback architecture.

## SHA Hashing Pipeline: Architecture Overview

The pipeline follows five deterministic stages. Every stage either transforms the annotation data into a more canonical form or uses the canonical form to make a binary pass/fail decision.

<svg viewBox="0 0 780 200" role="img" aria-label="SHA hashing pipeline: five stages from raw annotation through normalization, hashing, manifest generation, and validation gate" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:780px;display:block;margin:1.5rem auto;">
  <title>SHA-256 Annotation Hashing Pipeline</title>
  <desc>Five sequential pipeline stages connected by arrows: Raw Annotation (GeoJSON or COCO input), Normalize Payload (strip volatile keys, sort, round coordinates), Compute SHA-256 (hashlib.sha256), Build Manifest (version registry JSON), and Validation Gate (pass or halt training).</desc>
  <defs>
    <marker id="arr-sha" markerWidth="9" markerHeight="9" refX="8" refY="4" orient="auto">
      <path d="M0,0 L9,4 L0,8 Z" fill="currentColor" opacity="0.55"/>
    </marker>
  </defs>
  <!-- Stage 1 -->
  <rect x="6" y="56" width="126" height="76" rx="7" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.35"/>
  <text x="69" y="84" text-anchor="middle" font-size="12" fill="currentColor" font-family="system-ui,sans-serif" font-weight="700">Raw</text>
  <text x="69" y="100" text-anchor="middle" font-size="12" fill="currentColor" font-family="system-ui,sans-serif" font-weight="700">Annotation</text>
  <text x="69" y="118" text-anchor="middle" font-size="10" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.6">GeoJSON / COCO</text>
  <!-- Arrow 1→2 -->
  <line x1="133" y1="94" x2="152" y2="94" stroke="currentColor" stroke-width="1.5" opacity="0.5" marker-end="url(#arr-sha)"/>
  <!-- Stage 2 -->
  <rect x="154" y="56" width="126" height="76" rx="7" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.35"/>
  <text x="217" y="84" text-anchor="middle" font-size="12" fill="currentColor" font-family="system-ui,sans-serif" font-weight="700">Normalize</text>
  <text x="217" y="100" text-anchor="middle" font-size="12" fill="currentColor" font-family="system-ui,sans-serif" font-weight="700">Payload</text>
  <text x="217" y="118" text-anchor="middle" font-size="10" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.6">strip volatile keys</text>
  <!-- Arrow 2→3 -->
  <line x1="281" y1="94" x2="300" y2="94" stroke="currentColor" stroke-width="1.5" opacity="0.5" marker-end="url(#arr-sha)"/>
  <!-- Stage 3 -->
  <rect x="302" y="56" width="126" height="76" rx="7" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.35"/>
  <text x="365" y="84" text-anchor="middle" font-size="12" fill="currentColor" font-family="system-ui,sans-serif" font-weight="700">Compute</text>
  <text x="365" y="100" text-anchor="middle" font-size="12" fill="currentColor" font-family="system-ui,sans-serif" font-weight="700">SHA-256</text>
  <text x="365" y="118" text-anchor="middle" font-size="10" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.6">hashlib.sha256</text>
  <!-- Arrow 3→4 -->
  <line x1="429" y1="94" x2="448" y2="94" stroke="currentColor" stroke-width="1.5" opacity="0.5" marker-end="url(#arr-sha)"/>
  <!-- Stage 4 -->
  <rect x="450" y="56" width="126" height="76" rx="7" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.35"/>
  <text x="513" y="84" text-anchor="middle" font-size="12" fill="currentColor" font-family="system-ui,sans-serif" font-weight="700">Build</text>
  <text x="513" y="100" text-anchor="middle" font-size="12" fill="currentColor" font-family="system-ui,sans-serif" font-weight="700">Manifest</text>
  <text x="513" y="118" text-anchor="middle" font-size="10" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.6">version registry</text>
  <!-- Arrow 4→5 -->
  <line x1="577" y1="94" x2="596" y2="94" stroke="currentColor" stroke-width="1.5" opacity="0.5" marker-end="url(#arr-sha)"/>
  <!-- Stage 5 -->
  <rect x="598" y="56" width="176" height="76" rx="7" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.35"/>
  <text x="686" y="84" text-anchor="middle" font-size="12" fill="currentColor" font-family="system-ui,sans-serif" font-weight="700">Validation Gate</text>
  <text x="686" y="100" text-anchor="middle" font-size="12" fill="currentColor" font-family="system-ui,sans-serif" font-weight="700">pass / halt</text>
  <text x="686" y="118" text-anchor="middle" font-size="10" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.6">compare to baseline</text>
</svg>

## Core Workflow

### Step 1: Normalize Annotation Payloads

Annotation files always carry volatile fields that change on every save — `created_at`, `updated_at`, `annotator_id`, `review_status`, `session_id` — but carry no information about the geometry or class label. Including them in a hash makes every routine file touch look like a semantic change. Normalization strips these fields and enforces strict key ordering so that two JSON objects representing the same spatial feature always serialize to the same byte stream.

```python
import json
from typing import Any

VOLATILE_KEYS: frozenset[str] = frozenset({
    "created_at", "updated_at", "annotator_id",
    "review_status", "session_id", "comment", "created_by"
})

def normalize_annotation(annotation: dict[str, Any]) -> dict[str, Any]:
    """Remove volatile metadata and enforce deterministic key ordering.

    Recursively processes nested dicts so COCO info/licenses blocks
    and GeoJSON feature properties are both cleaned.
    """
    cleaned: dict[str, Any] = {}
    for k, v in annotation.items():
        if k in VOLATILE_KEYS:
            continue
        if isinstance(v, dict):
            cleaned[k] = normalize_annotation(v)
        elif isinstance(v, list):
            cleaned[k] = [
                normalize_annotation(i) if isinstance(i, dict) else i
                for i in v
            ]
        else:
            cleaned[k] = v
    # Round-trip through JSON with sort_keys to get stable ordering
    return json.loads(json.dumps(cleaned, sort_keys=True))
```

The round-trip through `json.dumps`/`json.loads` with `sort_keys=True` collapses any Python dict ordering variance into a single canonical form without requiring an external library.

### Step 2: Canonicalize Spatial Geometry

Generic normalization is not sufficient for geospatial annotations. Two sources of hash divergence are unique to spatial data and must be addressed before serialization.

**Coordinate precision:** Different GIS tools serialize `EPSG:4326` coordinates to different decimal place counts — see the full projection decision matrix on the [coordinate reference systems in annotation pipelines](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) page. A coordinate written as `12.300000000000001` by QGIS and `12.3` by Label Studio represents the same point but yields a different hash. Round every coordinate value to 6 decimal places (approximately 0.11 m at the equator, well within sub-meter imagery resolution) before hashing.

**Polygon vertex ordering:** GeoJSON polygons can be written starting at any vertex and traversing either clockwise or counter-clockwise. IETF RFC 7946 mandates counter-clockwise exterior rings, but many tools ignore this. Two annotators drawing the same field boundary will produce geometrically identical but byte-level different polygons. Canonicalize by rotating each ring to start at its lexicographically smallest coordinate pair and enforcing RFC 7946 winding order.

```python
import shapely
from shapely.geometry import shape, mapping as geom_to_dict
from shapely.validation import make_valid
from typing import Any

COORD_PRECISION = 6  # 0.11 m at equator in EPSG:4326

def round_coords(coords: list | tuple, precision: int = COORD_PRECISION) -> list:
    """Recursively round all coordinate values to a fixed precision."""
    if isinstance(coords[0], (int, float)):
        return [round(c, precision) for c in coords]
    return [round_coords(ring, precision) for ring in coords]

def canonical_geojson_geometry(geometry: dict[str, Any]) -> dict[str, Any]:
    """Return a geometry dict with rounded, winding-order-normalised coordinates."""
    geom = shape(geometry)
    geom = make_valid(geom)
    # shapely.normalize enforces canonical vertex ordering (CCW exterior / CW holes)
    if geom.geom_type in ("Polygon", "MultiPolygon"):
        geom = shapely.normalize(geom)

    raw = geom_to_dict(geom)
    raw["coordinates"] = round_coords(raw["coordinates"])
    return raw
```

Pair this with a CRS check: hashing must occur after all annotations have been projected to a consistent reference system. For datasets that mix imagery from different UTM zones, normalize to `EPSG:4326` before this step. For object detection workflows where metric distances matter, normalize to a local metric CRS first, compute any spatial checks, then hash.

### Step 3: Compute Deterministic SHA-256 Digests

Once the payload is normalized and geometries are canonical, serialize to compact UTF-8 bytes (no whitespace) and hash with SHA-256. SHA-256 is preferred over MD5 or SHA-1 because it is collision-resistant, FIPS 140-2 approved, and natively supported by DVC and most content-addressable storage systems.

```python
import hashlib
import json
from typing import Any

def compute_annotation_hash(annotation: dict[str, Any]) -> str:
    """Return SHA-256 hex digest of a normalized annotation object.

    Uses compact separators to eliminate any whitespace-induced variance.
    The payload must already be normalized (no volatile keys, sorted keys,
    coordinates rounded and winding-order enforced).
    """
    canonical_bytes = json.dumps(
        annotation,
        sort_keys=True,
        separators=(",", ":"),  # compact — no spaces
        ensure_ascii=False,     # preserve Unicode class labels
    ).encode("utf-8")
    return hashlib.sha256(canonical_bytes).hexdigest()
```

The `ensure_ascii=False` flag is important for datasets with non-Latin class labels (Arabic, Chinese, Cyrillic script in regional projects) — forcing ASCII escape sequences would produce different byte sequences for the same string depending on Python version and platform.

### Step 4: Generate Version Manifests

Individual file hashes are only useful in aggregate. A version manifest maps every annotation file in a dataset to its digest, feature count, and format, creating a single document that represents the complete annotation state of a dataset version. This is the artifact you store, diff, and validate against.

```python
import pathlib
import json
from datetime import datetime, timezone
from typing import Any

def build_manifest(
    annotation_dir: pathlib.Path,
    label: str = "v1.0.0",
) -> dict[str, Any]:
    """Scan a directory, normalize, hash, and return a versioned manifest.

    Handles both single-feature files and multi-feature GeoJSON FeatureCollections.
    """
    manifest: dict[str, Any] = {
        "version": label,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "annotations": {},
    }

    for file_path in sorted(annotation_dir.rglob("*.json")):
        with open(file_path, "r", encoding="utf-8") as f:
            raw_data = json.load(f)

        # Unpack FeatureCollection, plain list, or single feature
        if isinstance(raw_data, list):
            features = raw_data
        elif raw_data.get("type") == "FeatureCollection":
            features = raw_data.get("features", [])
        else:
            features = [raw_data]

        normalized = []
        for feat in features:
            feat = normalize_annotation(feat)
            if "geometry" in feat and feat["geometry"]:
                feat["geometry"] = canonical_geojson_geometry(feat["geometry"])
            normalized.append(feat)

        file_hash = compute_annotation_hash(normalized)
        rel_path = str(file_path.relative_to(annotation_dir))
        manifest["annotations"][rel_path] = {
            "sha256": file_hash,
            "feature_count": len(normalized),
            "format": "geojson",
        }

    return manifest
```

When you integrate this with [DVC for geospatial training data](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/), the manifest file itself becomes a tracked DVC artifact — a lightweight JSON sidecar that lets you reproduce any dataset state by checking out a Git commit without pulling the full imagery or annotation files.

### Step 5: Validate Against Baseline

The manifest is only valuable if it gates downstream processes. Run validation before every training trigger and halt execution on any divergence.

<svg viewBox="0 0 680 260" role="img" aria-label="Manifest validation flow: current manifest compared against baseline, branching to pass or fail paths" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:680px;display:block;margin:1.5rem auto;">
  <title>Annotation Manifest Baseline Comparison</title>
  <desc>Flowchart showing current manifest and baseline manifest feeding into a comparison step. If hashes match the training run proceeds (pass path). If hashes differ, errors are logged and training is halted (fail path), with an optional rollback to the last known-good state.</desc>
  <defs>
    <marker id="arr-val" markerWidth="9" markerHeight="9" refX="8" refY="4" orient="auto">
      <path d="M0,0 L9,4 L0,8 Z" fill="currentColor" opacity="0.55"/>
    </marker>
  </defs>
  <!-- Current manifest box -->
  <rect x="20" y="20" width="150" height="50" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.35"/>
  <text x="95" y="41" text-anchor="middle" font-size="11" fill="currentColor" font-family="system-ui,sans-serif" font-weight="700">Current Manifest</text>
  <text x="95" y="58" text-anchor="middle" font-size="10" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.6">build_manifest()</text>
  <!-- Baseline manifest box -->
  <rect x="510" y="20" width="150" height="50" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.35"/>
  <text x="585" y="41" text-anchor="middle" font-size="11" fill="currentColor" font-family="system-ui,sans-serif" font-weight="700">Baseline Manifest</text>
  <text x="585" y="58" text-anchor="middle" font-size="10" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.6">stored in git / DVC</text>
  <!-- Arrows into compare -->
  <line x1="95" y1="70" x2="95" y2="115" stroke="currentColor" stroke-width="1.5" opacity="0.45"/>
  <line x1="95" y1="115" x2="300" y2="115" stroke="currentColor" stroke-width="1.5" opacity="0.45" marker-end="url(#arr-val)"/>
  <line x1="585" y1="70" x2="585" y2="115" stroke="currentColor" stroke-width="1.5" opacity="0.45"/>
  <line x1="585" y1="115" x2="380" y2="115" stroke="currentColor" stroke-width="1.5" opacity="0.45" marker-end="url(#arr-val)"/>
  <!-- Compare diamond -->
  <polygon points="340,100 420,130 340,160 260,130" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="340" y="127" text-anchor="middle" font-size="11" fill="currentColor" font-family="system-ui,sans-serif" font-weight="700">Compare</text>
  <text x="340" y="143" text-anchor="middle" font-size="10" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.6">hashes equal?</text>
  <!-- Pass path (right) -->
  <line x1="420" y1="130" x2="530" y2="130" stroke="currentColor" stroke-width="1.5" opacity="0.45" marker-end="url(#arr-val)"/>
  <text x="475" y="122" text-anchor="middle" font-size="10" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.7">yes</text>
  <rect x="530" y="108" width="130" height="44" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.35"/>
  <text x="595" y="128" text-anchor="middle" font-size="11" fill="currentColor" font-family="system-ui,sans-serif" font-weight="700">Training</text>
  <text x="595" y="143" text-anchor="middle" font-size="11" fill="currentColor" font-family="system-ui,sans-serif" font-weight="700">proceeds</text>
  <!-- Fail path (down) -->
  <line x1="340" y1="160" x2="340" y2="198" stroke="currentColor" stroke-width="1.5" opacity="0.45" marker-end="url(#arr-val)"/>
  <text x="354" y="183" text-anchor="middle" font-size="10" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.7">no</text>
  <rect x="220" y="200" width="240" height="44" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.35"/>
  <text x="340" y="220" text-anchor="middle" font-size="11" fill="currentColor" font-family="system-ui,sans-serif" font-weight="700">Log errors + halt training</text>
  <text x="340" y="236" text-anchor="middle" font-size="10" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.6">trigger rollback if configured</text>
</svg>

```python
def validate_against_baseline(
    current_manifest: dict[str, Any],
    baseline_path: pathlib.Path,
) -> tuple[bool, list[str]]:
    """Compare current manifest to stored baseline.

    Returns (passed: bool, errors: list[str]).
    Empty errors list means integrity confirmed.
    """
    errors: list[str] = []

    if not baseline_path.exists():
        return True, []  # First run: establish baseline

    with open(baseline_path, "r", encoding="utf-8") as f:
        baseline = json.load(f)

    current_files = set(current_manifest["annotations"])
    baseline_files = set(baseline["annotations"])

    added = current_files - baseline_files
    removed = baseline_files - current_files
    if added:
        errors.append(f"Files added since baseline: {sorted(added)}")
    if removed:
        errors.append(f"Files removed since baseline: {sorted(removed)}")

    for rel_path in current_files & baseline_files:
        cur_hash = current_manifest["annotations"][rel_path]["sha256"]
        base_hash = baseline["annotations"][rel_path]["sha256"]
        if cur_hash != base_hash:
            errors.append(
                f"Integrity failure: {rel_path} "
                f"(expected {base_hash[:12]}…, got {cur_hash[:12]}…)"
            )

    return len(errors) == 0, errors
```

When validation fails, the [rollback strategies for corrupted spatial datasets](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/rollback-strategies-for-corrupted-spatial-datasets/) page covers how to restore a known-good annotation state from a DVC remote or object storage backup without interrupting the broader MLOps pipeline.

## Spatial Parameters & Configuration Reference

| Parameter | Type | Recommended value | Spatial implication |
|-----------|------|------------------|---------------------|
| `COORD_PRECISION` | `int` | `6` | 0.11 m at equator in `EPSG:4326`; safe for sub-metre aerial imagery |
| `VOLATILE_KEYS` | `frozenset[str]` | See Step 1 above | Extends to any per-session or annotator-scoped field |
| Winding order | convention | RFC 7946 CCW exterior | Required for cross-tool polygon comparability |
| Hash algorithm | `hashlib` name | `sha256` | FIPS 140-2, collision-resistant; avoid `md5`, `sha1` |
| Manifest label scheme | `str` | Semantic versioning (`v1.2.0`) | Enables ordered comparison; append-only in object storage |
| CRS before hashing | EPSG code | `EPSG:4326` (WGS84) | Hash after projection; never mix UTM zones in one manifest |
| Batch parallelism | workers | `os.cpu_count()` | Use `ProcessPoolExecutor` above 100 k features |

## Edge Cases & Spatial Gotchas

**Datum shifts masquerading as coordinate drift.** If annotations are ingested from a source using NAD83 (`EPSG:4269`) and compared against a WGS84 baseline, coordinate values will differ by up to 2 m even for identical features — enough to change every hash. Always reproject to a single CRS before normalization. The datum transformation must use a grid shift file (NADCON5 for North America, NTv2 for Europe); a simple parameter-based transformation is insufficiently accurate.

**Self-intersecting polygons producing inconsistent canonical forms.** `shapely.normalize()` and winding-order enforcement both assume valid geometry. A self-intersecting polygon (butterfly polygon) will produce different `make_valid()` outputs depending on the Shapely/GEOS version. Pin `shapely==2.0.6` and `GEOS>=3.12` to lock this behavior. Log a warning and flag any feature where `make_valid()` changes the geometry type (e.g., Polygon → MultiPolygon) before including it in the manifest.

**COCO JSON feature ordering.** COCO format stores annotations as a flat list with integer IDs. Sorting by `id` before hashing is not sufficient if IDs were reassigned during a re-export. Sort instead by `(image_id, category_id, bbox[0], bbox[1])` to achieve a stable ordering that survives ID reassignment. The [preserving metadata across dataset versions](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/preserving-metadata-across-dataset-versions/) page covers COCO metadata field handling in depth.

**Floating-point round-trip through projection libraries.** A coordinate projected from UTM to WGS84 and back may not round-trip exactly due to PROJ's internal floating-point arithmetic. Always hash in the target CRS, not in an intermediate representation, and never hash a coordinate that has been projected more than once.

**Multi-temporal annotation misalignment.** Annotations covering the same geographic extent but generated from imagery at different acquisition dates may hash identically if the geometry and labels are the same — even if the underlying scene has changed. Include the imagery acquisition date as a non-volatile metadata field in the canonical payload (distinct from `created_at`, which tracks the annotation session, not the imagery).

**[Confidence score](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/confidence-scoring-for-geospatial-labels/) fields and hashing.** Per-feature confidence scores assigned during [human-in-the-loop validation](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/human-in-the-loop-validation-cycles/) should be treated as training-relevant content — do not strip them as volatile metadata. If confidence scores change because a reviewer upgraded a borderline annotation, the hash should change so the training gate catches the update.

## Integration & Automation Hooks

### DVC Integration

Store the manifest alongside `.dvc` tracking files so that `dvc repro` automatically regenerates and validates hashes as part of the training pipeline. See [using DVC pipelines for automated dataset snapshots](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/tracking-annotation-changes-with-sha-hashing/using-dvc-pipelines-for-automated-dataset-snapshots/) for the full `dvc.yaml` stage definition.

```yaml
# dvc.yaml integration snippet
stages:
  build_annotation_manifest:
    cmd: python scripts/build_manifest.py --dir annotations/ --label ${version} --out manifests/current.json
    deps:
      - annotations/
      - scripts/build_manifest.py
    outs:
      - manifests/current.json
  validate_annotation_integrity:
    cmd: python scripts/validate_manifest.py --current manifests/current.json --baseline manifests/baseline.json
    deps:
      - manifests/current.json
      - manifests/baseline.json
```

### Label Studio Export Hook

Attach the normalization and hashing step directly to Label Studio's export webhook so every export automatically appends a hash sidecar:

```python
from flask import Flask, request, jsonify
import hashlib
import pathlib
import json

app = Flask(__name__)

@app.post("/ls-export-hook")
def on_export() -> dict:
    payload = request.json
    annotation_dir = pathlib.Path(payload["export_path"])
    manifest = build_manifest(annotation_dir, label=payload.get("version", "draft"))
    sidecar_path = annotation_dir / "manifest.json"
    sidecar_path.write_text(json.dumps(manifest, indent=2))
    return jsonify({"manifest_sha256": hashlib.sha256(
        json.dumps(manifest, sort_keys=True).encode()
    ).hexdigest()})
```

### GitHub Actions CI Gate

```yaml
# .github/workflows/annotation-integrity.yml
name: Validate Annotation Integrity
on:
  pull_request:
    paths:
      - "annotations/**"

jobs:
  integrity-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.10"
      - name: Install deps
        run: pip install shapely==2.0.6 pyproj==3.6.1 orjson==3.10.3
      - name: Build current manifest
        run: python scripts/build_manifest.py --dir annotations/ --out manifests/current.json
      - name: Validate against baseline
        run: python scripts/validate_manifest.py --current manifests/current.json --baseline manifests/baseline.json
```

This gate runs on every pull request that touches the `annotations/` directory. A hash mismatch fails the check and blocks the merge, making annotation drift visible in code review before it reaches a training run. Pair this gate with a per-feature [confidence score](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/confidence-scoring-for-geospatial-labels/) check so low-confidence annotations surface alongside integrity failures.

## Validation & Testing

Verify the entire pipeline with a determinism test suite — run the same annotations through the pipeline twice with a random sleep in between and assert identical manifests, then introduce a one-pixel coordinate shift and assert different hashes.

```python
import pytest
import copy
import time

SAMPLE_FEATURE = {
    "type": "Feature",
    "geometry": {
        "type": "Polygon",
        "coordinates": [[[12.3456789, 51.9876543], [12.3460000, 51.9876543],
                          [12.3460000, 51.9880000], [12.3456789, 51.9880000],
                          [12.3456789, 51.9876543]]]
    },
    "properties": {"label": "building", "annotator_id": "u-42", "created_at": "2025-01-01T00:00:00Z"}
}

def test_normalization_strips_volatile_keys():
    norm = normalize_annotation(SAMPLE_FEATURE)
    assert "annotator_id" not in norm.get("properties", {})
    assert "created_at" not in norm.get("properties", {})
    assert "label" in norm.get("properties", {})

def test_hash_is_deterministic():
    norm = normalize_annotation(SAMPLE_FEATURE)
    norm["geometry"] = canonical_geojson_geometry(norm["geometry"])
    h1 = compute_annotation_hash(norm)
    time.sleep(0.01)  # elapsed time must not affect hash
    h2 = compute_annotation_hash(norm)
    assert h1 == h2

def test_coordinate_shift_changes_hash():
    a = copy.deepcopy(SAMPLE_FEATURE)
    b = copy.deepcopy(SAMPLE_FEATURE)
    # Shift one vertex by ~11 m (beyond 6 d.p. precision)
    b["geometry"]["coordinates"][0][0][0] += 0.0001
    norm_a = normalize_annotation(a)
    norm_b = normalize_annotation(b)
    norm_a["geometry"] = canonical_geojson_geometry(norm_a["geometry"])
    norm_b["geometry"] = canonical_geojson_geometry(norm_b["geometry"])
    assert compute_annotation_hash(norm_a) != compute_annotation_hash(norm_b)

def test_volatile_metadata_change_does_not_change_hash():
    a = copy.deepcopy(SAMPLE_FEATURE)
    b = copy.deepcopy(SAMPLE_FEATURE)
    b["properties"]["annotator_id"] = "u-99"
    b["properties"]["created_at"] = "2026-01-01T00:00:00Z"
    norm_a = normalize_annotation(a)
    norm_b = normalize_annotation(b)
    norm_a["geometry"] = canonical_geojson_geometry(norm_a["geometry"])
    norm_b["geometry"] = canonical_geojson_geometry(norm_b["geometry"])
    assert compute_annotation_hash(norm_a) == compute_annotation_hash(norm_b)

def test_sub_precision_coordinate_noise_ignored():
    """Floating-point noise below 6 d.p. must not change the hash."""
    a = copy.deepcopy(SAMPLE_FEATURE)
    b = copy.deepcopy(SAMPLE_FEATURE)
    # Add noise at the 9th decimal place (~0.1 mm) — below COORD_PRECISION threshold
    b["geometry"]["coordinates"][0][0][0] += 0.000000001
    norm_a = normalize_annotation(a)
    norm_b = normalize_annotation(b)
    norm_a["geometry"] = canonical_geojson_geometry(norm_a["geometry"])
    norm_b["geometry"] = canonical_geojson_geometry(norm_b["geometry"])
    assert compute_annotation_hash(norm_a) == compute_annotation_hash(norm_b)
```

Run these tests in CI before the manifest build step — they verify the pipeline's correctness assumptions rather than a specific dataset's state.

## Production Checklist

Use this checklist before treating annotation hashing as a production integrity gate:

- [ ] All annotation sources normalized to `EPSG:4326` (or an agreed projected CRS) before hashing
- [ ] `VOLATILE_KEYS` list reviewed and extended to cover all tool-specific metadata fields (e.g. Label Studio `reviewed_by`, CVAT `z_order`)
- [ ] Shapely and GEOS versions pinned (`shapely==2.0.6`, `GEOS>=3.12`) and locked in `requirements.txt`
- [ ] `make_valid()` geometry-type changes logged and flagged; features that change type are quarantined before manifest inclusion
- [ ] COCO feature lists sorted by `(image_id, category_id, bbox[0], bbox[1])` before hashing, not by raw `id`
- [ ] Imagery acquisition date included as a non-volatile field to distinguish multi-temporal annotation sets
- [ ] Baseline manifest stored in append-only object storage (S3/GCS/R2) with versioning enabled; semantic version incremented on every intentional update
- [ ] Validation gate wired into CI and training trigger; a manifest mismatch halts the run before any GPU cost is incurred
- [ ] Perceptual hash (`imagehash.phash`) added to manifest for raster tile sidecars alongside the SHA-256 digest
- [ ] Audit log receives manifest diffs with annotator-ID attribution for drift frequency tracking per tool

## Production Best Practices

**Pre-commit hooks for local drift detection.** Run a lightweight hash check with `pre-commit` on every commit to the annotation repository. Use fast mode that only hashes modified files rather than rebuilding the full manifest.

**Immutable manifest storage.** Store manifests in append-only object storage (S3, GCS, R2) with versioning enabled. Never overwrite a baseline manifest; increment semantic versions instead (`v1.2.0` → `v1.3.0`). The baseline manifest for a model checkpoint is a permanent record.

**Batch parallelism for large datasets.** For datasets exceeding 100 k features, parallelize with `concurrent.futures.ProcessPoolExecutor(max_workers=os.cpu_count())`. I/O is the dominant bottleneck; use `orjson` for 3–5x faster JSON parsing on large GeoJSON files.

**Hybrid perceptual hashing for raster sidecars.** SHA-256 detects byte-level changes. For raster tiles paired with vector annotations, add a perceptual hash (e.g., `imagehash.phash`) to detect visually equivalent images that have undergone format conversion or lossy recompression. Store both in the manifest under `sha256` and `phash` keys.

**Audit log integration.** Pipe manifest diffs to a centralized logging system. Track hash mismatch frequency per annotator ID (recovered from the pre-normalization payload) to identify tools or workflows that consistently introduce drift.

---

This workflow is one component of the broader [Dataset Versioning & Spatial Data Sync](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/) pipeline.

**Related**

- [Implementing DVC for Geospatial Training Data](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/) — version-control heavy annotation assets with DVC remotes alongside SHA manifests
- [Rollback Strategies for Corrupted Spatial Datasets](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/rollback-strategies-for-corrupted-spatial-datasets/) — restore a known-good annotation state when validation fails
- [Preserving Metadata Across Dataset Versions](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/preserving-metadata-across-dataset-versions/) — keep COCO/GeoJSON schema fields consistent across manifest versions
- [Using DVC Pipelines for Automated Dataset Snapshots](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/tracking-annotation-changes-with-sha-hashing/using-dvc-pipelines-for-automated-dataset-snapshots/) — chain manifest generation with training triggers in `dvc.yaml`
- [Coordinate Reference Systems in Annotation Pipelines](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) — project all geometries to a consistent CRS before hashing
- [Confidence Scoring for Geospatial Labels](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/confidence-scoring-for-geospatial-labels/) — treat per-feature scores as non-volatile training signal in manifests
