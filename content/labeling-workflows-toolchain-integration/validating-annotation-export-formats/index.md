---
title: "Validating Annotation Export Formats: COCO, YOLO, and GeoJSON"
description: "Enforce schema validity on COCO, YOLO, and GeoJSON annotation exports before training: JSON Schema contracts, geometry checks with shapely, and CRS/geotransform sidecar verification for geospatial datasets."
slug: "validating-annotation-export-formats"
type: "guide"
breadcrumb: "Labeling Workflows & Toolchain Integration > Validating Annotation Export Formats"
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
      "headline": "Validating Annotation Export Formats: COCO, YOLO, and GeoJSON",
      "description": "Enforce schema validity on COCO, YOLO, and GeoJSON annotation exports before training: JSON Schema contracts, geometry checks with shapely, and CRS/geotransform sidecar verification for geospatial datasets.",
      "datePublished": "2026-07-13",
      "dateModified": "2026-07-13",
      "author": {"@type": "Organization", "name": "Geospatial Annotation"},
      "publisher": {"@type": "Organization", "name": "Geospatial Annotation"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.geospatialannotation.com/"},
        {"@type": "ListItem", "position": 2, "name": "Labeling Workflows & Toolchain Integration for Geospatial AI", "item": "https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/"},
        {"@type": "ListItem", "position": 3, "name": "Validating Annotation Export Formats: COCO, YOLO, and GeoJSON", "item": "https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/validating-annotation-export-formats/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Validate COCO, YOLO, and GeoJSON Annotation Exports Before Training",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Validate the COCO schema", "text": "Check the COCO JSON against a JSON Schema for required keys and types before any semantic checks run."},
        {"@type": "HowToStep", "position": 2, "name": "Check COCO referential integrity", "text": "Confirm every annotation category_id and image_id resolves to a declared category and image, and that bbox falls inside image bounds."},
        {"@type": "HowToStep", "position": 3, "name": "Validate YOLO normalized coordinates", "text": "Assert every YOLO label row has a class index in range and center/size values inside the closed interval zero to one."},
        {"@type": "HowToStep", "position": 4, "name": "Validate GeoJSON against RFC 7946", "text": "Verify FeatureCollection structure, geometry validity with shapely, and winding order compliance."},
        {"@type": "HowToStep", "position": 5, "name": "Verify the CRS and geotransform sidecar", "text": "Confirm the accompanying sidecar declares an EPSG code and affine transform so pixel labels can be georeferenced."},
        {"@type": "HowToStep", "position": 6, "name": "Wire the gate into CI", "text": "Fail the pipeline on any validation error so a malformed export never reaches the training queue."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why does a COCO export pass json.load but still break training?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Valid JSON only guarantees the file parses, not that it is semantically consistent. A COCO file can parse cleanly while an annotation references a category_id that no category declares, or carries a bbox that runs off the image. Those defects surface only at training time as silent label drops or index errors, so referential integrity and bbox-bounds checks must run on top of schema validation."
          }
        },
        {
          "@type": "Question",
          "name": "How do I attach a coordinate reference system to a YOLO export?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "YOLO stores only normalized pixel coordinates and has no place for georeferencing, so you attach a sidecar file next to each label set that records the EPSG code and the affine geotransform of the source tile. The validator asserts the sidecar exists and parses, letting pixel-space detections be reprojected to real-world coordinates downstream."
          }
        },
        {
          "@type": "Question",
          "name": "What is the difference between RLE and polygon segmentation in COCO?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "COCO segmentation is either a list of polygon vertex arrays or a run-length encoding dict with size and counts keys. A validator that assumes only polygons will crash on RLE masks, and vice versa. Detect the type first: a list means polygon, a dict means RLE, and each branch needs its own integrity check."
          }
        },
        {
          "@type": "Question",
          "name": "Why does GeoJSON winding order matter for annotation exports?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "RFC 7946 requires exterior polygon rings to be counter-clockwise and interior holes clockwise. Tools that ignore the rule still produce parseable GeoJSON, but strict consumers may interpret a reversed exterior ring as a hole covering the whole planet. Normalizing winding order during validation keeps geometry meaning stable across libraries."
          }
        }
      ]
    }
  ]
}
</script>

# Validating Annotation Export Formats: COCO, YOLO, and GeoJSON

A drone-survey team exports 40,000 building footprints from their labeling tool as COCO JSON, the file loads without error, and the training run kicks off overnight. By morning the detector's mean average precision has collapsed. The export was silently malformed in three ways at once: a batch of annotations pointed at a `category_id` that a taxonomy rename had deleted, several bounding boxes ran past the right edge of their tiles after a tiling offset bug, and the geotransform that tied pixel coordinates back to real-world positions was dropped entirely because COCO has no field for it. Nothing raised an exception. The loader simply skipped the dangling annotations, clamped or ignored the out-of-bounds boxes, and trained a model that learned a distorted version of the ground truth.

This is the failure mode export validation exists to prevent. An annotation export can be perfectly valid JSON or a perfectly readable text file and still be unusable as training data, because format correctness and *semantic* correctness are different guarantees. This guide, part of the broader [labeling workflows and toolchain integration](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/) practice, shows how to build runnable validators for the three formats that dominate geospatial annotation pipelines — COCO, YOLO, and GeoJSON — covering schema conformance, referential integrity, geometry validity, and the CRS and geotransform metadata that keeps pixel labels georeferenced.

---

## What Each Format Actually Guarantees

Before writing a validator you need a clear picture of what each format promises and, more importantly, what it does not. COCO carries structure but no geometry validity guarantees and no georeferencing. YOLO carries almost nothing — just class index and normalized box — and pushes every other concern onto convention. GeoJSON is the only one of the three with a formal specification (RFC 7946) that mandates coordinate order and geometry semantics, yet it still says nothing about the coordinate reference system beyond an assumed default. The matrix below shows which checks each format requires you to enforce yourself.

<svg viewBox="0 0 740 260" role="img" aria-label="What each export format guarantees and what it leaves to a sidecar, across geometry, class ids, coordinate reference system and pixel geotransform" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:740px;display:block;margin:1.5rem auto;">
  <title>What the file promises, and what it quietly leaves to you</title>
  <desc>COCO guarantees geometry and class ids but carries no coordinate reference system and no geotransform. YOLO guarantees only normalized boxes and a class index, with no names, no CRS and no geotransform. GeoJSON guarantees geometry and, by specification, WGS84, but has no pixel geotransform. Anything a format does not guarantee has to travel beside it in a sidecar or it is simply lost.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <text x="330" y="38" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.85">geometry</text>
  <text x="440" y="38" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.85">class names</text>
  <text x="560" y="38" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.85">CRS</text>
  <text x="670" y="38" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.85">geotransform</text>
  <line x1="20" y1="48" x2="720" y2="48" stroke="currentColor" stroke-width="1" opacity="0.4"/>
  <text x="20" y="84" font-size="12" fill="currentColor" font-family="monospace">COCO</text>
  <text x="20" y="102" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.65">pixel space, one JSON per split</text>
  <circle cx="330" cy="80" r="9" fill="currentColor" opacity="0.55"/>
  <circle cx="440" cy="80" r="9" fill="currentColor" opacity="0.55"/>
  <circle cx="560" cy="80" r="9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 2"/>
  <circle cx="670" cy="80" r="9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 2"/>
  <line x1="20" y1="116" x2="720" y2="116" stroke="currentColor" stroke-width="1" opacity="0.2"/>
  <text x="20" y="148" font-size="12" fill="currentColor" font-family="monospace">YOLO</text>
  <text x="20" y="166" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.65">one .txt per image, values in 0–1</text>
  <circle cx="330" cy="144" r="9" fill="currentColor" opacity="0.55"/>
  <circle cx="440" cy="144" r="9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 2"/>
  <circle cx="560" cy="144" r="9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 2"/>
  <circle cx="670" cy="144" r="9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 2"/>
  <line x1="20" y1="180" x2="720" y2="180" stroke="currentColor" stroke-width="1" opacity="0.2"/>
  <text x="20" y="212" font-size="12" fill="currentColor" font-family="monospace">GeoJSON</text>
  <text x="20" y="230" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.65">world space, RFC 7946</text>
  <circle cx="330" cy="208" r="9" fill="currentColor" opacity="0.55"/>
  <circle cx="440" cy="208" r="9" fill="currentColor" opacity="0.55"/>
  <circle cx="560" cy="208" r="9" fill="currentColor" opacity="0.55"/>
  <circle cx="670" cy="208" r="9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 2"/>
  <!-- Legend -->
  <circle cx="30" cy="252" r="8" fill="currentColor" opacity="0.55"/>
  <text x="44" y="256" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">guaranteed by the format</text>
  <circle cx="220" cy="252" r="8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 2"/>
  <text x="234" y="256" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">must travel in a sidecar, or it is lost</text>
</svg>

<svg viewBox="0 0 820 340" role="img" aria-label="Validation gate matrix comparing COCO, YOLO, and GeoJSON across schema, geometry, CRS, and referential integrity checks" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:820px;display:block;margin:1.5rem auto;">
  <title>Validation Gate Matrix Across COCO, YOLO, and GeoJSON</title>
  <desc>A four-by-three grid showing which validation gates — schema conformance, geometry validity, CRS and geotransform, and referential integrity — are enforced natively, must be added by the validator, or are not applicable for the COCO, YOLO, and GeoJSON annotation formats.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <!-- Column headers -->
  <text x="360" y="40" text-anchor="middle" font-size="14" font-weight="700" fill="currentColor" font-family="sans-serif">COCO</text>
  <text x="530" y="40" text-anchor="middle" font-size="14" font-weight="700" fill="currentColor" font-family="sans-serif">YOLO</text>
  <text x="700" y="40" text-anchor="middle" font-size="14" font-weight="700" fill="currentColor" font-family="sans-serif">GeoJSON</text>
  <!-- Row labels -->
  <text x="20" y="90"  font-size="12" font-weight="600" fill="currentColor" font-family="sans-serif">Schema</text>
  <text x="20" y="150" font-size="12" font-weight="600" fill="currentColor" font-family="sans-serif">Geometry</text>
  <text x="20" y="210" font-size="12" font-weight="600" fill="currentColor" font-family="sans-serif">CRS /</text>
  <text x="20" y="224" font-size="12" font-weight="600" fill="currentColor" font-family="sans-serif">geotransform</text>
  <text x="20" y="284" font-size="12" font-weight="600" fill="currentColor" font-family="sans-serif">Referential</text>
  <text x="20" y="298" font-size="12" font-weight="600" fill="currentColor" font-family="sans-serif">integrity</text>
  <!-- Grid cells: helper legend -->
  <text x="820" y="20" text-anchor="end" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">solid = you must enforce, dashed = native, dotted = n/a</text>
  <!-- Row 1: Schema -->
  <rect x="280" y="66" width="160" height="44" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.55"/>
  <text x="360" y="93" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">JSON Schema</text>
  <rect x="450" y="66" width="160" height="44" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.55"/>
  <text x="530" y="93" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">row grammar</text>
  <rect x="620" y="66" width="180" height="44" rx="6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="5 4" opacity="0.55"/>
  <text x="710" y="93" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">RFC 7946</text>
  <!-- Row 2: Geometry -->
  <rect x="280" y="126" width="160" height="44" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.55"/>
  <text x="360" y="153" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">bbox bounds</text>
  <rect x="450" y="126" width="160" height="44" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.55"/>
  <text x="530" y="153" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">coords in [0,1]</text>
  <rect x="620" y="126" width="180" height="44" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.55"/>
  <text x="710" y="149" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">shapely is_valid</text>
  <text x="710" y="163" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">+ winding</text>
  <!-- Row 3: CRS -->
  <rect x="280" y="186" width="160" height="44" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.55"/>
  <text x="360" y="209" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">sidecar</text>
  <text x="360" y="223" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">required</text>
  <rect x="450" y="186" width="160" height="44" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.55"/>
  <text x="530" y="209" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">sidecar</text>
  <text x="530" y="223" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">required</text>
  <rect x="620" y="186" width="180" height="44" rx="6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="5 4" opacity="0.55"/>
  <text x="710" y="209" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">assumed 4326,</text>
  <text x="710" y="223" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">verify sidecar</text>
  <!-- Row 4: Referential -->
  <rect x="280" y="246" width="160" height="44" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.55"/>
  <text x="360" y="269" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">id cross-refs</text>
  <text x="360" y="283" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">must resolve</text>
  <rect x="450" y="246" width="160" height="44" rx="6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2 4" opacity="0.5"/>
  <text x="530" y="273" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">class map</text>
  <rect x="620" y="246" width="180" height="44" rx="6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2 4" opacity="0.5"/>
  <text x="710" y="273" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">property schema</text>
</svg>

The practical takeaway: no format hands you a fully validated export for free. COCO needs the most work on referential integrity, YOLO needs the most work on external metadata, and GeoJSON gives you geometry semantics but leaves the [coordinate reference system](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) to convention. A single validation library that treats all three uniformly will miss the failure that actually matters for each.

---

## Prerequisites & Toolchain

Install the pinned dependencies below. Version pinning matters here because both `pycocotools` mask handling and `shapely` geometry predicates have changed behaviour across releases, and a validator that silently adapts to whichever version is installed is itself a source of drift.

```bash
pip install pycocotools==2.0.7 \
            jsonschema==4.21.1 \
            shapely==2.0.6 \
            geopandas==0.14.4 \
            pyproj==3.6.1
```

You should be comfortable reading a COCO annotation record, know that YOLO stores one text file per image with one object per line, and understand that GeoJSON coordinates are ordered longitude-first. If your labeling stack routes through [Label Studio](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/integrating-label-studio-with-geospatial-workflows/) or a desktop [QGIS](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/qgis-plugin-ecosystem-for-annotation-teams/) workflow, the validators here run downstream of whichever tool produced the export — they are format checks, not tool integrations, so they apply regardless of origin.

---

## Core Validation Workflow

Each validator below returns a list of human-readable error strings rather than raising on the first defect. Collecting all errors in one pass is what makes the output useful in review: an annotator fixing an export wants the full list, not a whack-a-mole sequence of single failures.

### Validate COCO: Schema, Referential Integrity, and Bounds

COCO validation is three checks stacked in order. First, a JSON Schema pass confirms the top-level structure — `images`, `annotations`, and `categories` arrays with the required keys and types. Second, referential integrity confirms every `annotation.category_id` and `annotation.image_id` resolves to a declared entity. Third, bbox-bounds checking confirms each `[x, y, width, height]` box sits inside its image's declared width and height. The dangling-id and out-of-bounds defects from the opening scenario are exactly what steps two and three catch.

```python
from __future__ import annotations

import json
from pathlib import Path

from jsonschema import Draft202012Validator

COCO_SCHEMA: dict = {
    "type": "object",
    "required": ["images", "annotations", "categories"],
    "properties": {
        "images": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["id", "width", "height", "file_name"],
                "properties": {
                    "id": {"type": "integer"},
                    "width": {"type": "integer", "minimum": 1},
                    "height": {"type": "integer", "minimum": 1},
                    "file_name": {"type": "string"},
                },
            },
        },
        "annotations": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["id", "image_id", "category_id", "bbox"],
                "properties": {
                    "id": {"type": "integer"},
                    "image_id": {"type": "integer"},
                    "category_id": {"type": "integer"},
                    "bbox": {
                        "type": "array",
                        "items": {"type": "number"},
                        "minItems": 4,
                        "maxItems": 4,
                    },
                },
            },
        },
        "categories": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["id", "name"],
                "properties": {
                    "id": {"type": "integer"},
                    "name": {"type": "string"},
                },
            },
        },
    },
}


def validate_coco(path: str | Path) -> list[str]:
    errors: list[str] = []
    data: dict = json.loads(Path(path).read_text())

    # 1. Schema conformance
    validator = Draft202012Validator(COCO_SCHEMA)
    for err in validator.iter_errors(data):
        loc = "/".join(str(p) for p in err.absolute_path) or "<root>"
        errors.append(f"schema: {loc}: {err.message}")
    if errors:
        return errors  # structure is broken; deeper checks would be noise

    # 2. Referential integrity
    image_ids: dict[int, dict] = {img["id"]: img for img in data["images"]}
    category_ids: set[int] = {cat["id"] for cat in data["categories"]}

    for ann in data["annotations"]:
        if ann["category_id"] not in category_ids:
            errors.append(
                f"annotation {ann['id']}: dangling category_id "
                f"{ann['category_id']}"
            )
        img = image_ids.get(ann["image_id"])
        if img is None:
            errors.append(
                f"annotation {ann['id']}: dangling image_id {ann['image_id']}"
            )
            continue

        # 3. bbox bounds check against the referenced image
        x, y, w, h = ann["bbox"]
        if w <= 0 or h <= 0:
            errors.append(f"annotation {ann['id']}: non-positive bbox size")
        if x < 0 or y < 0 or x + w > img["width"] or y + h > img["height"]:
            errors.append(
                f"annotation {ann['id']}: bbox {ann['bbox']} out of bounds "
                f"for image {img['width']}x{img['height']}"
            )
    return errors
```

Returning early after schema errors is deliberate: if the arrays themselves are malformed, referential checks would emit dozens of cascading, misleading messages. Fix structure first, then meaning.

### Validate YOLO: Normalized Coordinates and Class Range

YOLO's grammar is unforgiving in its simplicity. Each line is `class_index cx cy w h`, where the four geometry values are normalized to the image dimensions and must lie in the closed interval `[0, 1]`. A value of `1.0001` is not a rounding curiosity — it means an object edge sits outside the image, and depending on the loader it will be clamped, dropped, or trigger an index error during augmentation. The class index must also fall within the range declared by the dataset's class list; an off-by-one from a renamed [label taxonomy](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/defining-roi-label-taxonomies-for-aerial-imagery/) is the most common cause of a mislabeled model.

```python
from __future__ import annotations

from pathlib import Path

# small epsilon absorbs benign float printing; anything larger is a real defect
_EPS: float = 1e-6


def validate_yolo(label_path: str | Path, num_classes: int) -> list[str]:
    errors: list[str] = []
    lines: list[str] = Path(label_path).read_text().splitlines()

    for line_no, raw in enumerate(lines, start=1):
        line = raw.strip()
        if not line:
            continue
        parts: list[str] = line.split()
        if len(parts) != 5:
            errors.append(
                f"line {line_no}: expected 5 fields, got {len(parts)}"
            )
            continue

        try:
            class_idx = int(parts[0])
            cx, cy, w, h = (float(v) for v in parts[1:])
        except ValueError:
            errors.append(f"line {line_no}: non-numeric field in {line!r}")
            continue

        if not (0 <= class_idx < num_classes):
            errors.append(
                f"line {line_no}: class index {class_idx} outside "
                f"[0, {num_classes})"
            )

        for name, value in (("cx", cx), ("cy", cy), ("w", w), ("h", h)):
            if not (-_EPS <= value <= 1 + _EPS):
                errors.append(
                    f"line {line_no}: {name}={value} outside normalized [0, 1]"
                )
        if w <= 0 or h <= 0:
            errors.append(f"line {line_no}: non-positive box size w={w} h={h}")
    return errors
```

Because YOLO has nowhere to record which image dimensions the normalization was computed against, this validator cannot detect a box that is correctly in `[0, 1]` but was normalized against the wrong tile size. That gap is precisely why a georeferencing sidecar becomes mandatory, covered next.

### Validate GeoJSON: RFC 7946 Structure, Geometry, and Winding

GeoJSON is the only one of the three formats with geometry semantics baked into its specification, so its validator leans on `shapely` for validity and does real work on winding order. RFC 7946 fixes the CRS to WGS 84 with longitude-first axis order and requires that polygon exterior rings wind counter-clockwise while holes wind clockwise. A self-intersecting footprint or a reversed exterior ring parses fine but corrupts area calculations and rasterization downstream.

```python
from __future__ import annotations

import json
from pathlib import Path

from shapely.geometry import shape
from shapely.geometry.polygon import orient, Polygon


def validate_geojson(path: str | Path) -> list[str]:
    errors: list[str] = []
    data: dict = json.loads(Path(path).read_text())

    if data.get("type") != "FeatureCollection":
        errors.append(f"top-level type must be FeatureCollection, got {data.get('type')!r}")
        return errors
    if not isinstance(data.get("features"), list):
        errors.append("FeatureCollection.features must be an array")
        return errors

    for idx, feature in enumerate(data["features"]):
        if feature.get("type") != "Feature":
            errors.append(f"feature {idx}: type must be Feature")
            continue
        geom_dict = feature.get("geometry")
        if geom_dict is None:
            errors.append(f"feature {idx}: null geometry")
            continue

        try:
            geom = shape(geom_dict)
        except (ValueError, KeyError) as exc:
            errors.append(f"feature {idx}: unparseable geometry ({exc})")
            continue

        if not geom.is_valid:
            errors.append(f"feature {idx}: invalid geometry ({geom.geom_type})")

        # RFC 7946 winding: exterior CCW, holes CW
        if isinstance(geom, Polygon):
            if not geom.equals(orient(geom, sign=1.0)):
                errors.append(
                    f"feature {idx}: exterior ring not counter-clockwise "
                    "(RFC 7946 winding)"
                )

        # RFC 7946 axis order sanity: lon in [-180,180], lat in [-90,90]
        minx, miny, maxx, maxy = geom.bounds
        if not (-180 <= minx <= 180 and -180 <= maxx <= 180):
            errors.append(f"feature {idx}: longitude out of range, check axis order")
        if not (-90 <= miny <= 90 and -90 <= maxy <= 90):
            errors.append(f"feature {idx}: latitude out of range, check axis order")
    return errors
```

The out-of-range coordinate check does double duty: it flags data that was accidentally left in a projected CRS (metre-scale coordinates land far outside `[-180, 180]`) as well as data with swapped axis order, both of which are common when an export skips the reprojection step.

### Verify the CRS and Geotransform Sidecar

COCO and YOLO both store pixel-space coordinates with no room for georeferencing. To make their detections usable in a spatial pipeline you attach a sidecar file recording the source tile's [`EPSG:4326`](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) or projected code and the affine geotransform that maps pixels to world coordinates. The validator asserts the sidecar exists, declares a resolvable CRS, and carries a well-formed six-element transform.

```python
from __future__ import annotations

import json
from pathlib import Path

from pyproj import CRS
from pyproj.exceptions import CRSError


def validate_geo_sidecar(sidecar_path: str | Path) -> list[str]:
    errors: list[str] = []
    p = Path(sidecar_path)
    if not p.exists():
        return [f"missing sidecar: {p} (pixel labels cannot be georeferenced)"]

    meta: dict = json.loads(p.read_text())

    code = meta.get("crs")
    if code is None:
        errors.append("sidecar: no 'crs' key")
    else:
        try:
            CRS.from_user_input(code)
        except CRSError:
            errors.append(f"sidecar: unresolvable CRS {code!r}")

    transform = meta.get("transform")
    if not isinstance(transform, list) or len(transform) != 6:
        errors.append("sidecar: 'transform' must be a 6-element affine list")
    elif transform[0] == 0 or transform[4] == 0:
        errors.append("sidecar: degenerate affine (zero pixel size)")
    return errors
```

Pairing a pixel-format export with a verified sidecar is what lets a COCO detection reproject cleanly back to ground coordinates; the same principle underpins [preserving metadata across dataset versions](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/preserving-metadata-across-dataset-versions/), where the geotransform must survive every snapshot.

---

## Format Validation Reference

The table consolidates the specification each format follows, the checks a validator must run, and how each handles the georeferencing that geospatial annotation demands.

| Format | Governing spec | Key checks | Geospatial metadata handling |
|---|---|---|---|
| COCO | Dataset convention (no formal RFC) | JSON Schema, category/image id cross-refs, bbox inside image, RLE vs polygon segmentation | None native — requires a CRS + geotransform sidecar |
| YOLO | Text-line convention | 5-field grammar, class index in range, `cx cy w h` in `[0, 1]`, positive box size | None native — requires a sidecar; cannot store source tile size |
| GeoJSON | RFC 7946 | FeatureCollection structure, `shapely` validity, exterior-ring winding, lon/lat range | CRS fixed to WGS 84 by spec; verify sidecar if a projected CRS is intended |

---

## Edge Cases & Gotchas

### RLE versus polygon segmentation in COCO

COCO's `segmentation` field is polymorphic. For a single object it is a list of flat vertex arrays (polygons); for a crowd or mask it is a run-length-encoding dict with `size` and `counts` keys. A validator that iterates `segmentation` as if it were always a list of polygons will crash the moment it hits an RLE mask, and one that assumes RLE will silently skip polygon labels. Branch on the type: a `list` means polygon and each sub-array must have an even length of at least six values; a `dict` means RLE and should be decoded with `pycocotools.mask.decode` to confirm it produces a non-empty mask matching the image dimensions.

### YOLO has no CRS, so the sidecar is not optional

It is tempting to treat the sidecar as a nice-to-have. For a purely pixel-space workflow it would be, but the moment a YOLO detection needs to become a map feature — which is the whole point of geospatial annotation — the missing geotransform makes the export unrecoverable. There is no way to reconstruct the mapping after the fact from the label file alone. Treat a missing or unresolvable sidecar as a hard validation failure for any format that stores pixel coordinates.

### GeoJSON winding order silently flips polygon meaning

Reversing a polygon's exterior ring produces valid, parseable GeoJSON, but a strict RFC 7946 consumer interprets a clockwise exterior as an interior hole. In the worst case a reversed outer ring is read as a hole punched in an implied planet-sized polygon, and the feature's area computes as enormous or negative. Normalizing with `shapely.geometry.polygon.orient(geom, sign=1.0)` during validation — rather than only flagging it — keeps geometry meaning stable no matter which library reads the file next.

<svg viewBox="0 0 700 290" role="img" aria-label="The two winding orders of a polygon ring and what each means to a reader that honours the specification" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:700px;display:block;margin:1.5rem auto;">
  <title>Winding order is meaning, not formatting</title>
  <desc>RFC 7946 requires exterior rings to wind counter-clockwise and holes clockwise. The same five coordinates written in the opposite order describe, to a strict reader, a hole rather than a footprint. Most tools tolerate it and a few do not, which is why the export step normalises winding rather than trusting whatever the editor produced.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <!-- Correct -->
  <text x="170" y="34" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">counter-clockwise exterior</text>
  <polygon points="80,70 260,70 260,190 80,190" fill="currentColor" opacity="0.18"/>
  <polygon points="80,70 260,70 260,190 80,190" fill="none" stroke="currentColor" stroke-width="2"/>
  <path d="M100 190 L100 88" fill="none" stroke="currentColor" stroke-width="1.5" marker-end="url(#wd-arr)"/>
  <path d="M100 70 L240 70" fill="none" stroke="currentColor" stroke-width="1.5" marker-end="url(#wd-arr)" opacity="0.6"/>
  <defs>
    <marker id="wd-arr" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor"/>
    </marker>
  </defs>
  <text x="170" y="136" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">a footprint</text>
  <text x="170" y="220" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace" opacity="0.75">shapely: is_ccw → True</text>
  <text x="170" y="240" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">what RFC 7946 requires</text>
  <!-- Reversed -->
  <text x="500" y="34" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">the same points, reversed</text>
  <polygon points="410,70 590,70 590,190 410,190" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="5 3"/>
  <path d="M430 70 L430 172" fill="none" stroke="currentColor" stroke-width="1.5" marker-end="url(#wd-arr)"/>
  <path d="M430 190 L570 190" fill="none" stroke="currentColor" stroke-width="1.5" marker-end="url(#wd-arr)" opacity="0.6"/>
  <text x="500" y="136" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">a hole, to a strict reader</text>
  <text x="500" y="220" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace" opacity="0.75">shapely: is_ccw → False</text>
  <text x="500" y="240" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">accepted silently by most tools</text>
  <!-- Note -->
  <text x="350" y="272" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">normalise winding on export with orient(); do not rely on the editor, and do not rely on the reader being lenient</text>
</svg>

### Coordinate precision loss on roundtrip

Exporters that serialize coordinates as single-precision floats or truncate decimals to save space introduce sub-metre drift that accumulates across a reproject-and-back roundtrip. For sub-metre imagery this can shift a building corner by a full pixel. When validation runs on data that has been reprojected, assert that coordinates retain enough decimal places for the working CRS — roughly seven decimals for geographic degrees — and prefer formats that store native double precision over lossy text truncation.

---

## Integration Hooks

### Wire the validators into a dataset gate

The three validators plus the sidecar check compose into a single gate that runs on every export. Rather than calling them ad hoc, aggregate their error lists and fail loudly on any non-empty result. This is the unit that belongs in [CI/CD gates for annotation datasets](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/ci-cd-gates-for-annotation-datasets/), where the same function runs on every pull request that touches label data.

```python
from __future__ import annotations

from pathlib import Path


def gate_export(coco_path: str, sidecar_path: str) -> None:
    errors: list[str] = []
    errors += validate_coco(coco_path)
    errors += validate_geo_sidecar(sidecar_path)

    if errors:
        report = "\n".join(f"  - {e}" for e in errors)
        raise SystemExit(f"Export validation FAILED:\n{report}")
    print(f"Export {Path(coco_path).name} passed all gates.")
```

### Carry metadata through versioned snapshots

A validated export is only durable if its georeferencing metadata survives every version bump. When the sidecar is stored alongside the annotations under version control, [preserving metadata across dataset versions](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/preserving-metadata-across-dataset-versions/) ensures the CRS and transform stay bound to the exact annotation snapshot they describe, so a rollback never resurrects labels without their coordinate context.

---

## Validation & Testing

Validators need their own tests, because a validator that passes everything is worse than none — it manufactures false confidence. Build fixtures that are deliberately broken in each dimension and assert the validator catches them.

```python
from __future__ import annotations

import json
from pathlib import Path


def test_coco_catches_dangling_category(tmp_path: Path) -> None:
    broken: dict = {
        "images": [{"id": 1, "width": 256, "height": 256, "file_name": "t.png"}],
        "categories": [{"id": 1, "name": "building"}],
        "annotations": [
            {"id": 1, "image_id": 1, "category_id": 99, "bbox": [0, 0, 10, 10]},
        ],
    }
    p = tmp_path / "broken.json"
    p.write_text(json.dumps(broken))
    errors = validate_coco(p)
    assert any("dangling category_id 99" in e for e in errors)


def test_coco_catches_out_of_bounds_bbox(tmp_path: Path) -> None:
    broken: dict = {
        "images": [{"id": 1, "width": 100, "height": 100, "file_name": "t.png"}],
        "categories": [{"id": 1, "name": "building"}],
        "annotations": [
            {"id": 1, "image_id": 1, "category_id": 1, "bbox": [90, 90, 30, 30]},
        ],
    }
    p = tmp_path / "oob.json"
    p.write_text(json.dumps(broken))
    assert any("out of bounds" in e for e in validate_coco(p))


def test_yolo_catches_denormalized_coords(tmp_path: Path) -> None:
    p = tmp_path / "labels.txt"
    p.write_text("0 0.5 0.5 1.4 0.2\n")  # width 1.4 is impossible
    errors = validate_yolo(p, num_classes=3)
    assert any("outside normalized" in e for e in errors)
```

Run the suite in the same CI job that runs the gate, and treat a validator that stops catching a known-bad fixture as a build break. A green validation gate should mean the export is safe to train on — nothing less.

---

## Frequently Asked Questions

### Why does a COCO export pass json.load but still break training?

Valid JSON only guarantees the file parses, not that it is semantically consistent. A COCO file can parse cleanly while an annotation references a category id that no category declares, or carries a bounding box that runs off the image. Those defects surface only at training time as silent label drops or index errors, so referential integrity and bbox-bounds checks must run on top of schema validation.

### How do I attach a coordinate reference system to a YOLO export?

YOLO stores only normalized pixel coordinates and has no place for georeferencing, so you attach a sidecar file next to each label set that records the EPSG code and the affine geotransform of the source tile. The validator asserts the sidecar exists and parses, letting pixel-space detections be reprojected to real-world coordinates downstream.

### What is the difference between RLE and polygon segmentation in COCO?

COCO segmentation is either a list of polygon vertex arrays or a run-length encoding dict with size and counts keys. A validator that assumes only polygons will crash on RLE masks, and vice versa. Detect the type first: a list means polygon, a dict means RLE, and each branch needs its own integrity check.

### Why does GeoJSON winding order matter for annotation exports?

RFC 7946 requires exterior polygon rings to be counter-clockwise and interior holes clockwise. Tools that ignore the rule still produce parseable GeoJSON, but strict consumers may interpret a reversed exterior ring as a hole covering the whole planet. Normalizing winding order during validation keeps geometry meaning stable across libraries.

---

## Related

- [Enforcing the COCO JSON Schema in CI](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/validating-annotation-export-formats/enforcing-coco-json-schema-in-ci/) — a runnable jsonschema gate for category, image, and RLE integrity inside continuous integration
- [COCO vs GeoParquet for Annotation Export](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/validating-annotation-export-formats/coco-vs-geoparquet-for-annotation-export/) — a decision guide weighing CRS fidelity, query speed, and interoperability between the two export targets
- [CI/CD Gates for Annotation Datasets](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/ci-cd-gates-for-annotation-datasets/) — wiring these validators into GitHub Actions and DVC so broken exports never merge
- [Preserving Metadata Across Dataset Versions](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/preserving-metadata-across-dataset-versions/) — keeping the CRS and geotransform sidecar bound to each versioned annotation snapshot

This guide is part of the broader [Labeling Workflows & Toolchain Integration for Geospatial AI](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/) practice that connects annotation tooling to reproducible ML training pipelines.
