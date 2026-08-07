---
title: "Enforcing the COCO JSON Schema in CI"
description: "Validate COCO annotation JSON against a strict schema inside CI — category/image/annotation cross-references, bbox bounds, and segmentation RLE integrity — with a runnable jsonschema gate."
slug: "enforcing-coco-json-schema-in-ci"
type: "tutorial"
breadcrumb:
  - label: "Home"
    url: "/"
  - label: "Labeling Workflows & Toolchain Integration for Geospatial AI"
    url: "/labeling-workflows-toolchain-integration/"
  - label: "Validating Annotation Export Formats: COCO, YOLO, and GeoJSON"
    url: "/labeling-workflows-toolchain-integration/validating-annotation-export-formats/"
  - label: "Enforcing the COCO JSON Schema in CI"
    url: "/labeling-workflows-toolchain-integration/validating-annotation-export-formats/enforcing-coco-json-schema-in-ci/"
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
      "headline": "Enforcing the COCO JSON Schema in CI",
      "description": "Validate COCO annotation JSON against a strict schema inside CI — category/image/annotation cross-references, bbox bounds, and segmentation RLE integrity — with a runnable jsonschema gate.",
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
        {"@type": "ListItem", "position": 3, "name": "Validating Annotation Export Formats: COCO, YOLO, and GeoJSON", "item": "https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/validating-annotation-export-formats/"},
        {"@type": "ListItem", "position": 4, "name": "Enforcing the COCO JSON Schema in CI", "item": "https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/validating-annotation-export-formats/enforcing-coco-json-schema-in-ci/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Enforcing the COCO JSON Schema in CI",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Declare the COCO JSON Schema", "text": "Define a Draft 2020-12 schema dict that requires the images, annotations, and categories arrays and pins the field types of each object so malformed shapes fail before any semantic check runs."},
        {"@type": "HowToStep", "position": 2, "name": "Validate structural shape with jsonschema", "text": "Run jsonschema.Draft202012Validator over the parsed export and collect every schema error so a single run reports all shape violations at once."},
        {"@type": "HowToStep", "position": 3, "name": "Check referential integrity", "text": "Build id sets for images and categories, then assert every annotation.image_id and category_id resolves to an existing record and that no id is duplicated."},
        {"@type": "HowToStep", "position": 4, "name": "Enforce bbox bounds and non-empty segmentation", "text": "Confirm each bbox has positive width and height, sits inside its parent image dimensions, and that segmentation is non-empty when the annotation is not a crowd region."},
        {"@type": "HowToStep", "position": 5, "name": "Wrap the checks as a CLI returning exit codes", "text": "Aggregate all failures, print them, and return exit code 1 when any check fails and 0 when the file is clean so CI can treat the script as a gate."},
        {"@type": "HowToStep", "position": 6, "name": "Call the gate from GitHub Actions", "text": "Add a workflow step that installs the pinned dependency and runs the validator against every COCO file so a broken export blocks the pull request."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Does JSON Schema alone guarantee a valid COCO file?",
          "acceptedAnswer": {"@type": "Answer", "text": "No. JSON Schema validates shape and types — that images, annotations, and categories are arrays of objects with the right field types. It cannot express that every annotation.image_id resolves to a real image, that a bbox fits inside its image, or that segmentation is non-empty. Those are cross-record invariants, so you must pair the schema with a custom-check pass that walks the id references and geometry."}
        },
        {
          "@type": "Question",
          "name": "Why should the CI script exit with a non-zero code?",
          "acceptedAnswer": {"@type": "Answer", "text": "CI runners decide pass or fail from the process exit code, not from printed text. A validator that prints errors but returns 0 lets a broken COCO export merge silently. Return 1 the moment any structural, referential, or bounds check fails, and 0 only when the file is clean, so the job turns red and blocks the pull request."}
        },
        {
          "@type": "Question",
          "name": "How do I validate an empty bbox or crowd annotation?",
          "acceptedAnswer": {"@type": "Answer", "text": "A bbox must have positive width and height and lie within the parent image dimensions. For crowd regions, COCO sets iscrowd to 1 and stores segmentation as RLE rather than a polygon list, so require a non-empty polygon segmentation only when iscrowd is 0. Treat a zero-area bbox or an empty segmentation on a non-crowd annotation as a hard failure."}
        },
        {
          "@type": "Question",
          "name": "Should schema validation collect all errors or stop at the first?",
          "acceptedAnswer": {"@type": "Answer", "text": "Collect all of them. Use Draft202012Validator(schema).iter_errors(document) rather than validate(), which raises on the first violation. A batch report that lists every bad annotation in one run lets an annotation team fix an entire export in a single pass instead of re-triggering CI once per error."}
        }
      ]
    }
  ]
}
</script>

# Enforcing the COCO JSON Schema in CI

A COCO annotation file that parses as JSON and even passes a shape schema can still crash a training run. Real validity needs three layers that a schema alone cannot express: **structural shape** (the `images`, `annotations`, and `categories` arrays hold objects with the right field types), **referential integrity** (every `annotation.image_id` and `category_id` resolves to a record that exists), and **geometry sanity** (each `bbox` has positive width and height and sits inside its image, and `segmentation` is non-empty for non-crowd regions). The reliable pattern is a two-stage gate: run `jsonschema==4.21.1` for the shape, then a custom-check script for the cross-record invariants, and have the combined tool **exit non-zero** so continuous integration blocks the merge. This guide builds that gate end to end and wires it into GitHub Actions.

## Why a Shape Schema Is Not Enough

JSON Schema is a language for describing the *form* of a document — which keys exist, what types they hold, which are required. That catches a `bbox` stored as a string or a missing `categories` array, and it should run first because it is cheap and it fails fast. But COCO's correctness lives in the relationships *between* records, and those relationships are invisible to a schema.

<svg viewBox="0 0 720 290" role="img" aria-label="A COCO file that satisfies its JSON schema while still carrying three defects a schema cannot express" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>Three defects that pass every schema check</title>
  <desc>A schema can require that image_id is an integer, that bbox has four numbers and that segmentation is an array. It cannot say that the image_id must exist in the images array, that the box must lie inside the image it references, or that the segmentation must contain at least three points. Each of those needs the document read as a graph, not as a shape.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <!-- Schema layer -->
  <rect x="20" y="40" width="200" height="210" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="120" y="66" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">what the schema sees</text>
  <text x="36" y="96" font-size="10" fill="currentColor" font-family="monospace">"image_id": 17</text>
  <text x="36" y="118" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.7">integer ✓</text>
  <text x="36" y="150" font-size="10" fill="currentColor" font-family="monospace">"bbox": [8, 12, 40, 30]</text>
  <text x="36" y="172" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.7">four numbers ✓</text>
  <text x="36" y="204" font-size="10" fill="currentColor" font-family="monospace">"segmentation": [[]]</text>
  <text x="36" y="226" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.7">array of arrays ✓</text>
  <!-- Gap -->
  <line x1="222" y1="145" x2="278" y2="145" stroke="currentColor" stroke-width="1.5" marker-end="url(#sch-arr)"/>
  <defs>
    <marker id="sch-arr" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor"/>
    </marker>
  </defs>
  <text x="250" y="136" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.7">but</text>
  <!-- Reality layer -->
  <rect x="280" y="40" width="420" height="60" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 3"/>
  <text x="300" y="64" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">dangling reference</text>
  <text x="300" y="84" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">image 17 was dropped from the split — nothing points at it</text>
  <rect x="280" y="112" width="420" height="60" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 3"/>
  <text x="300" y="136" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">box outside its image</text>
  <text x="300" y="156" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">x + w is 48 on a 40-pixel-wide chip; the loss reads garbage pixels</text>
  <rect x="280" y="184" width="420" height="60" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 3"/>
  <text x="300" y="208" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">empty segmentation</text>
  <text x="300" y="228" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">a polygon with no points trains the mask head on nothing</text>
  <text x="360" y="274" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">the schema validates one object at a time; these three need the whole document, which is why the gate has two layers</text>
</svg>

Consider an export where an annotation carries `"category_id": 7` but the `categories` array only defines ids 1 through 5. The document is perfectly well-shaped; every field has the right type. Yet `pycocotools` will raise a `KeyError` the instant it builds its category index, and a training loop that ignores the exception will learn against a phantom class. The same blind spot hides duplicate `image_id` values, a `bbox` whose corner falls twenty pixels outside a 512-pixel tile, and an empty `segmentation: []` on a polygon annotation that a mask-based loss will silently skip. These are exactly the failures that a validation gate exists to stop, and none of them are shape errors.

This matters more for geospatial data than for consumer photo datasets. Aerial and satellite exports are tiled, stitched, and reprojected by pipelines that touch pixel coordinates directly, so an off-by-one in image dimensions or a `bbox` clipped at a tile seam is common. When the geotransform and CRS are carried alongside the pixels — as covered in [embedding geotransform metadata in COCO exports](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/preserving-metadata-across-dataset-versions/embedding-geotransform-metadata-in-coco-exports/) — a bounds error is not just a bad label, it reprojects to the wrong place on Earth. The gate below treats that geometry as a first-class check rather than an afterthought.

<svg viewBox="0 0 640 340" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The COCO object graph showing images, annotations, and categories with the referential-integrity, bounds, and segmentation checks applied to each edge" style="width:100%;max-width:640px;display:block;margin:1.5rem auto;">
  <title>COCO object graph with CI validation checks</title>
  <desc>Three record types are shown: images on the left, annotations in the centre, categories on the right. An annotation references an image by image_id and a category by category_id. Three checks are annotated: referential integrity on both id edges, bbox bounds against image width and height, and non-empty segmentation on the annotation itself.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <defs>
    <marker id="ah" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto">
      <polygon points="0 0, 9 3.5, 0 7" fill="currentColor" opacity="0.55"/>
    </marker>
  </defs>
  <!-- images box -->
  <rect x="20" y="120" width="150" height="96" rx="8" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-width="1.5" stroke-opacity="0.5"/>
  <text x="95" y="146" text-anchor="middle" font-size="13" fill="currentColor" opacity="0.9" font-family="sans-serif" font-weight="bold">images[]</text>
  <text x="95" y="168" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6" font-family="sans-serif">id</text>
  <text x="95" y="184" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6" font-family="sans-serif">width, height</text>
  <text x="95" y="200" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6" font-family="sans-serif">file_name</text>
  <!-- annotations box -->
  <rect x="245" y="108" width="160" height="120" rx="8" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-width="1.5" stroke-opacity="0.5"/>
  <text x="325" y="132" text-anchor="middle" font-size="13" fill="currentColor" opacity="0.9" font-family="sans-serif" font-weight="bold">annotations[]</text>
  <text x="325" y="154" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6" font-family="sans-serif">id</text>
  <text x="325" y="170" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6" font-family="sans-serif">image_id  →</text>
  <text x="325" y="186" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6" font-family="sans-serif">category_id  →</text>
  <text x="325" y="202" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6" font-family="sans-serif">bbox, segmentation</text>
  <!-- categories box -->
  <rect x="480" y="120" width="150" height="96" rx="8" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-width="1.5" stroke-opacity="0.5"/>
  <text x="555" y="146" text-anchor="middle" font-size="13" fill="currentColor" opacity="0.9" font-family="sans-serif" font-weight="bold">categories[]</text>
  <text x="555" y="168" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6" font-family="sans-serif">id</text>
  <text x="555" y="184" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6" font-family="sans-serif">name</text>
  <text x="555" y="200" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6" font-family="sans-serif">supercategory</text>
  <!-- edges -->
  <line x1="245" y1="170" x2="172" y2="168" stroke="currentColor" stroke-width="1.5" opacity="0.55" marker-end="url(#ah)"/>
  <line x1="405" y1="176" x2="478" y2="168" stroke="currentColor" stroke-width="1.5" opacity="0.55" marker-end="url(#ah)"/>
  <text x="205" y="150" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.5" font-family="sans-serif">image_id</text>
  <text x="445" y="150" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.5" font-family="sans-serif">category_id</text>
  <!-- check 1: referential -->
  <text x="325" y="40" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85" font-family="sans-serif" font-weight="bold">Check 1 — referential integrity</text>
  <text x="325" y="56" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.5" font-family="sans-serif">both id edges must resolve; ids unique</text>
  <line x1="205" y1="62" x2="205" y2="146" stroke="currentColor" stroke-width="1" stroke-dasharray="3 3" opacity="0.35"/>
  <line x1="445" y1="62" x2="445" y2="146" stroke="currentColor" stroke-width="1" stroke-dasharray="3 3" opacity="0.35"/>
  <!-- check 2: bounds -->
  <rect x="235" y="255" width="180" height="30" rx="5" fill="none" stroke="currentColor" stroke-width="1" stroke-opacity="0.4"/>
  <text x="325" y="274" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75" font-family="sans-serif">Check 2 — bbox inside width×height</text>
  <line x1="325" y1="228" x2="325" y2="255" stroke="currentColor" stroke-width="1" stroke-dasharray="3 3" opacity="0.35"/>
  <!-- check 3: segmentation -->
  <rect x="235" y="298" width="180" height="30" rx="5" fill="none" stroke="currentColor" stroke-width="1" stroke-opacity="0.4"/>
  <text x="325" y="317" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75" font-family="sans-serif">Check 3 — segmentation non-empty</text>
</svg>

## Building the Validation Gate

Install the single pinned dependency once. The standard library covers JSON parsing and the command-line surface, so the gate stays lightweight enough to run on every push:

```bash
pip install jsonschema==4.21.1
```

### Step 1 — Declare the COCO JSON Schema

Define the shape contract as a Draft 2020-12 schema dict. Require the three top-level arrays and pin the field types inside each object. Keeping `additionalProperties` permissive lets vendor-specific extensions through while still enforcing the fields COCO consumers depend on:

```python
from typing import Any

COCO_SCHEMA: dict[str, Any] = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
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
                    "file_name": {"type": "string", "minLength": 1},
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
                    "iscrowd": {"type": "integer", "enum": [0, 1]},
                    "bbox": {
                        "type": "array",
                        "items": {"type": "number"},
                        "minItems": 4,
                        "maxItems": 4,
                    },
                    "segmentation": {"type": ["array", "object"]},
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
                    "name": {"type": "string", "minLength": 1},
                },
            },
        },
    },
}
```

### Step 2 — Validate Structural Shape

Use `iter_errors` rather than `validate` so a single run reports *every* shape violation instead of aborting on the first. Each error is flattened to a readable path so the CI log points straight at the offending record:

```python
from jsonschema import Draft202012Validator

def check_shape(document: dict[str, Any]) -> list[str]:
    """Return every JSON Schema violation as a human-readable string."""
    validator = Draft202012Validator(COCO_SCHEMA)
    errors: list[str] = []
    for err in sorted(validator.iter_errors(document), key=lambda e: e.path):
        location = "/".join(str(p) for p in err.path) or "<root>"
        errors.append(f"shape: {location}: {err.message}")
    return errors
```

### Step 3 — Check Referential Integrity

Build the id sets once, then walk the annotations. This is the pass that catches the dangling `category_id`, the missing image, and duplicate ids that a shape schema cannot see:

<svg viewBox="0 0 700 270" role="img" aria-label="The COCO document read as a graph, with the two reference edges a referential-integrity pass has to walk" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:700px;display:block;margin:1.5rem auto;">
  <title>COCO is a graph with two edges worth walking</title>
  <desc>Annotations reference images by image_id and categories by category_id. The integrity pass builds the two id sets once and checks every annotation against them, reporting the annotation ids that point nowhere. Walking it per annotation instead turns a linear check into a quadratic one, which is what makes large exports feel like the validator has hung.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <defs>
    <marker id="gr-arr" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor"/>
    </marker>
  </defs>
  <rect x="250" y="40" width="200" height="66" rx="6" fill="none" stroke="currentColor" stroke-width="2"/>
  <text x="350" y="64" text-anchor="middle" font-size="12" fill="currentColor" font-family="monospace">annotations[ ]</text>
  <text x="350" y="84" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">id · image_id · category_id · bbox</text>
  <text x="350" y="98" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">segmentation · area · iscrowd</text>
  <path d="M250 76 L180 76 L180 156" fill="none" stroke="currentColor" stroke-width="1.5" marker-end="url(#gr-arr)"/>
  <text x="188" y="122" font-size="10" fill="currentColor" font-family="monospace" opacity="0.8">image_id</text>
  <path d="M450 76 L520 76 L520 156" fill="none" stroke="currentColor" stroke-width="1.5" marker-end="url(#gr-arr)"/>
  <text x="528" y="122" font-size="10" fill="currentColor" font-family="monospace" opacity="0.8">category_id</text>
  <rect x="80" y="158" width="200" height="60" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="180" y="182" text-anchor="middle" font-size="12" fill="currentColor" font-family="monospace">images[ ]</text>
  <text x="180" y="202" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">id · file_name · width · height</text>
  <rect x="420" y="158" width="200" height="60" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="520" y="182" text-anchor="middle" font-size="12" fill="currentColor" font-family="monospace">categories[ ]</text>
  <text x="520" y="202" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">id · name · supercategory</text>
  <text x="350" y="248" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">build both id sets once, then check every annotation against them — one pass, not one scan per annotation</text>
</svg>

```python
def check_references(document: dict[str, Any]) -> list[str]:
    """Assert every annotation id edge resolves and ids are unique."""
    errors: list[str] = []
    image_ids: set[int] = set()
    for img in document["images"]:
        if img["id"] in image_ids:
            errors.append(f"ref: duplicate image id {img['id']}")
        image_ids.add(img["id"])

    category_ids: set[int] = {cat["id"] for cat in document["categories"]}

    seen_ann: set[int] = set()
    for ann in document["annotations"]:
        if ann["id"] in seen_ann:
            errors.append(f"ref: duplicate annotation id {ann['id']}")
        seen_ann.add(ann["id"])
        if ann["image_id"] not in image_ids:
            errors.append(
                f"ref: annotation {ann['id']} -> missing image_id {ann['image_id']}"
            )
        if ann["category_id"] not in category_ids:
            errors.append(
                f"ref: annotation {ann['id']} -> missing category_id {ann['category_id']}"
            )
    return errors
```

### Step 4 — Enforce bbox Bounds and Non-Empty Segmentation

Index images by id, then check each annotation's geometry against its parent frame. COCO's `bbox` is `[x, y, width, height]` in pixel space; the box must have positive extent and stay inside the image. Require a non-empty `segmentation` only when the annotation is not a crowd region, because crowd masks are stored as run-length encoding rather than a polygon list:

```python
def check_geometry(document: dict[str, Any]) -> list[str]:
    """Validate bbox bounds and segmentation presence per annotation."""
    errors: list[str] = []
    images_by_id: dict[int, dict[str, Any]] = {
        img["id"]: img for img in document["images"]
    }
    for ann in document["annotations"]:
        img = images_by_id.get(ann["image_id"])
        if img is None:
            continue  # already reported by check_references

        x, y, w, h = ann["bbox"]
        if w <= 0 or h <= 0:
            errors.append(f"bbox: annotation {ann['id']} has non-positive size {w}x{h}")
        if x < 0 or y < 0 or x + w > img["width"] or y + h > img["height"]:
            errors.append(
                f"bbox: annotation {ann['id']} escapes image "
                f"{img['width']}x{img['height']} at [{x},{y},{w},{h}]"
            )

        if ann.get("iscrowd", 0) == 0:
            seg = ann.get("segmentation")
            if not seg:  # None, [], or {} all fail for a non-crowd polygon
                errors.append(f"seg: annotation {ann['id']} has empty segmentation")
    return errors
```

### Step 5 — Wrap the Checks as a CLI Returning Exit Codes

Aggregate the three passes, print the failures, and translate the result into a process exit code. This is the piece that makes the script a *gate* rather than a report: CI reads the exit code, so returning `1` on any failure is what turns the job red:

```python
import json
import sys
from pathlib import Path

def validate_coco(path: Path) -> list[str]:
    document = json.loads(path.read_text(encoding="utf-8"))
    errors = check_shape(document)
    if errors:
        return errors  # semantic checks assume a well-shaped document
    return check_references(document) + check_geometry(document)

def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print("usage: validate_coco.py <file.json> [<file.json> ...]")
        return 2
    total = 0
    for arg in argv[1:]:
        problems = validate_coco(Path(arg))
        if problems:
            total += len(problems)
            print(f"FAIL {arg} ({len(problems)} error(s)):")
            for p in problems:
                print(f"  - {p}")
        else:
            print(f"OK   {arg}")
    return 1 if total else 0

if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
```

### Step 6 — Call the Gate from GitHub Actions

Add a workflow that installs the pinned dependency and runs the validator against every COCO file on each pull request. A non-zero exit fails the step, which blocks the merge:

```yaml
name: validate-coco
on: [pull_request]

jobs:
  coco-schema:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"
      - run: pip install jsonschema==4.21.1
      - name: Validate COCO exports
        run: python validate_coco.py annotations/*.json
```

## Validation Thresholds and Flags

Each check maps to a specific COCO field, a pass condition, and the exit behaviour CI relies on. Treat every row as a hard gate — none of these should be warnings, because a warning that does not change the exit code lets a broken export merge.

| Check | COCO field | Pass condition | Flag on failure | Exit |
|---|---|---|---|---|
| Shape | `images`/`annotations`/`categories` | Arrays present, field types correct | `shape:` | 1 |
| Image reference | `annotation.image_id` | Resolves to an `images[].id` | `ref:` missing image_id | 1 |
| Category reference | `annotation.category_id` | Resolves to a `categories[].id` | `ref:` missing category_id | 1 |
| Unique ids | `id` on all records | No duplicate id within a record type | `ref:` duplicate id | 1 |
| bbox extent | `bbox` = `[x,y,w,h]` | `w > 0` and `h > 0` | `bbox:` non-positive size | 1 |
| bbox bounds | `bbox` vs `width`/`height` | `0 ≤ x`, `0 ≤ y`, `x+w ≤ width`, `y+h ≤ height` | `bbox:` escapes image | 1 |
| Segmentation | `segmentation`, `iscrowd` | Non-empty when `iscrowd == 0` | `seg:` empty segmentation | 1 |

This gate sits naturally alongside the geometry and CRS assertions described in [CI/CD gates for annotation datasets](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/ci-cd-gates-for-annotation-datasets/); run the shape and reference checks first because they are the cheapest, then layer geometry validation on the survivors.

## Common Errors and Fixes

**`jsonschema.exceptions.ValidationError` raised on the first bad record**
Cause: calling `Draft202012Validator(schema).validate(document)`, which stops at the first violation.
Fix: use `iter_errors(document)` and collect the results so one CI run reports every shape problem at once.

**`KeyError` in `pycocotools` despite a green schema check**
Cause: an `annotation.category_id` or `image_id` points at an id that no record defines — a referential failure a shape schema cannot detect.
Fix: run the `check_references` pass that builds id sets from `images` and `categories` and asserts every annotation edge resolves.

**bbox validation passes but masks render outside the tile**
Cause: `bbox` treated as `[x1, y1, x2, y2]` instead of COCO's `[x, y, width, height]`, so the bounds math is wrong.
Fix: unpack as `x, y, w, h` and test `x + w <= image["width"]` and `y + h <= image["height"]`.

**Crowd annotations wrongly flagged for empty segmentation**
Cause: requiring a polygon `segmentation` list on every annotation, including crowd regions stored as RLE.
Fix: gate the non-empty segmentation check behind `iscrowd == 0` so RLE crowd masks pass.

**CI reports failures but the job still turns green**
Cause: the script prints errors but returns exit code 0.
Fix: return `1` from `main` whenever `total` errors is non-zero so the runner marks the step failed and blocks the merge.

## Related

- [Validating Annotation Export Formats: COCO, YOLO, and GeoJSON](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/validating-annotation-export-formats/) — the topic area this gate belongs to, covering schema contracts, geometry checks, and CRS sidecar verification across every export format
- [COCO vs GeoParquet for Annotation Export](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/validating-annotation-export-formats/coco-vs-geoparquet-for-annotation-export/) — a decision guide on when COCO's JSON graph is the right export target versus a columnar spatial format
- [CI/CD Gates for Annotation Datasets](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/ci-cd-gates-for-annotation-datasets/) — wire this validator into a broader gate stack with geometry validation, CRS assertions, and class-balance checks
- [Embedding Geotransform Metadata in COCO Exports](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/preserving-metadata-across-dataset-versions/embedding-geotransform-metadata-in-coco-exports/) — attach the affine transform and EPSG code so validated pixel detections can be reprojected to real-world coordinates

This guide is one specialised check within [Validating Annotation Export Formats: COCO, YOLO, and GeoJSON](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/validating-annotation-export-formats/), part of the broader [Labeling Workflows & Toolchain Integration for Geospatial AI](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/) topic area.
