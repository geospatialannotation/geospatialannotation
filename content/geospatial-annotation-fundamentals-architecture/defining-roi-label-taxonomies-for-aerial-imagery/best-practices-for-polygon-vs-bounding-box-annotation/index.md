---
title: "Best Practices for Polygon vs Bounding Box Annotation in Aerial Imagery"
description: "Choose between polygon and bounding box annotation for aerial imagery: decision criteria, runnable Python validation code, spatial thresholds, and a hybrid active-learning pipeline that cuts manual labeling by 40–70%."
slug: "best-practices-for-polygon-vs-bounding-box-annotation"
type: "tutorial"
breadcrumb: "Polygon vs Bounding Box"
datePublished: "2024-03-15"
dateModified: "2026-06-25"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Best Practices for Polygon vs Bounding Box Annotation in Aerial Imagery",
      "description": "Choose between polygon and bounding box annotation for aerial imagery: decision criteria, runnable Python validation code, spatial thresholds, and a hybrid active-learning pipeline that cuts manual labeling by 40–70%.",
      "datePublished": "2024-03-15",
      "dateModified": "2026-06-25",
      "author": {"@type": "Organization", "name": "Geospatial Annotation"},
      "publisher": {"@type": "Organization", "name": "Geospatial Annotation"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "/"},
        {"@type": "ListItem", "position": 2, "name": "Geospatial Annotation Fundamentals", "item": "/geospatial-annotation-fundamentals-architecture/"},
        {"@type": "ListItem", "position": 3, "name": "Defining ROI Label Taxonomies", "item": "/geospatial-annotation-fundamentals-architecture/defining-roi-label-taxonomies-for-aerial-imagery/"},
        {"@type": "ListItem", "position": 4, "name": "Polygon vs Bounding Box", "item": "/geospatial-annotation-fundamentals-architecture/defining-roi-label-taxonomies-for-aerial-imagery/best-practices-for-polygon-vs-bounding-box-annotation/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "How to Choose and Validate Polygon vs Bounding Box Annotation",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Classify object types by required spatial fidelity"},
        {"@type": "HowToStep", "position": 2, "name": "Bootstrap with bounding boxes on a lightweight detector"},
        {"@type": "HowToStep", "position": 3, "name": "Route uncertain or boundary-critical instances to polygon annotators"},
        {"@type": "HowToStep", "position": 4, "name": "Validate polygon topology with Shapely before export"},
        {"@type": "HowToStep", "position": 5, "name": "Measure Boundary IoU per class to confirm annotation quality"}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why do polygons produce TopologicalError in Shapely?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Self-intersecting rings fail Shapely's is_valid check. Apply buffer(0) to auto-repair, then re-check is_valid before export."
          }
        },
        {
          "@type": "Question",
          "name": "Why does IoU collapse when annotating in EPSG:4326?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Degree-based coordinates produce distorted area and distance calculations at mid-latitudes. Reproject to a local metric CRS such as EPSG:32633 before computing any IoU or area metric."
          }
        },
        {
          "@type": "Question",
          "name": "When should I use bounding boxes instead of polygons?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Use bounding boxes for compact, near-rectangular objects (vehicles, shipping containers) where annotation speed matters and boundary precision does not directly affect downstream metrics."
          }
        }
      ]
    }
  ]
}
</script>

# Best practices for polygon vs bounding box annotation

Use bounding boxes for rapid, coarse localization when instance separation and throughput matter more than pixel-perfect edges. Use polygons when precise spatial extent, area calculation, or boundary-aware model training is required — for example, building footprint extraction, solar-array delineation, or regulatory land-cover mapping. The optimal strategy depends on your target architecture, annotation budget, and downstream inference constraints. When working within a [defined ROI label taxonomy for aerial imagery](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/defining-roi-label-taxonomies-for-aerial-imagery/), assign annotation fidelity per class tier: reserve polygons for high-precision categories and use bounding boxes for auxiliary or rapidly changing objects. For most aerial imagery pipelines, bootstrap large-scale datasets with bounding boxes, then refine high-value classes with polygons where boundary precision directly impacts model performance, regulatory compliance, or geospatial analytics.

---

<svg viewBox="0 0 720 320" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Decision flow: choose bounding box or polygon annotation based on object type and pipeline requirements" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>Polygon vs Bounding Box annotation decision flow</title>
  <desc>Flowchart showing how object compactness, model architecture, and downstream analytics requirements drive the choice between bounding box and polygon annotation, with a hybrid path for active-learning refinement.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <defs>
    <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor" opacity="0.7"/>
    </marker>
  </defs>
  <!-- Start node -->
  <rect x="270" y="10" width="180" height="38" rx="19" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="360" y="34" text-anchor="middle" font-size="13" fill="currentColor" font-family="sans-serif">New object class</text>
  <!-- Arrow down -->
  <line x1="360" y1="48" x2="360" y2="78" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr)" opacity="0.7"/>
  <!-- Decision diamond: compact? -->
  <polygon points="360,78 465,118 360,158 255,118" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.6"/>
  <text x="360" y="113" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif">Compact /</text>
  <text x="360" y="130" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif">rectangular?</text>
  <!-- Yes path left -->
  <line x1="255" y1="118" x2="110" y2="118" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr)" opacity="0.7"/>
  <text x="183" y="111" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.8">Yes</text>
  <!-- No path right -->
  <line x1="465" y1="118" x2="610" y2="118" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr)" opacity="0.7"/>
  <text x="538" y="111" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.8">No</text>
  <!-- Bounding box node -->
  <rect x="20" y="92" width="90" height="52" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="65" y="114" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif">Bounding</text>
  <text x="65" y="130" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif">box</text>
  <!-- Polygon node -->
  <rect x="610" y="92" width="90" height="52" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="655" y="114" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif">Polygon</text>
  <text x="655" y="130" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif">mask</text>
  <!-- Arrow down from bbox -->
  <line x1="65" y1="144" x2="65" y2="178" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr)" opacity="0.7"/>
  <!-- Arrow down from polygon -->
  <line x1="655" y1="144" x2="655" y2="178" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr)" opacity="0.7"/>
  <!-- Model labels -->
  <text x="65" y="196" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">YOLO / DETR</text>
  <text x="65" y="212" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">detector</text>
  <text x="655" y="196" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">Mask R-CNN</text>
  <text x="655" y="212" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">/ SAM</text>
  <!-- Dashed lines to hybrid -->
  <line x1="110" y1="118" x2="210" y2="238" stroke="currentColor" stroke-width="1" stroke-dasharray="5,4" opacity="0.5" marker-end="url(#arr)"/>
  <line x1="610" y1="118" x2="510" y2="238" stroke="currentColor" stroke-width="1" stroke-dasharray="5,4" opacity="0.5" marker-end="url(#arr)"/>
  <!-- Hybrid node -->
  <rect x="195" y="228" width="330" height="48" rx="8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="6,3" opacity="0.55"/>
  <text x="360" y="250" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif">Hybrid: boxes → uncertainty routing</text>
  <text x="360" y="268" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif">→ polygon refinement (active learning)</text>
  <!-- Final arrow to QA -->
  <line x1="360" y1="276" x2="360" y2="302" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr)" opacity="0.7"/>
  <text x="360" y="316" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.8">Shapely topology + BIoU QA before export</text>
</svg>

## Why geometry choice breaks geospatial pipelines

Annotation geometry determines not just labeling speed but model behaviour, CRS-correctness of area calculations, and the validity of downstream geospatial analytics. Using bounding boxes where polygons are needed floods segmentation heads with background noise and prevents accurate footprint extraction. Conversely, forcing polygon annotation on every class stalls throughput, raises QA failure rates from self-intersecting rings, and inflates GPU memory during mask rasterization — effects that compound across [coordinate reference systems in annotation pipelines](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) when geometries are stored in geographic degrees (`EPSG:4326`) rather than a local metric CRS, causing IoU metrics to distort at mid-latitudes.

<svg viewBox="0 0 700 330" role="img" aria-label="A rotated building footprint with its axis-aligned bounding box, showing how much background the box admits compared with the polygon" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:700px;display:block;margin:1.5rem auto;">
  <title>What an axis-aligned box costs on a rotated footprint</title>
  <desc>A thirty by twelve metre building rotated thirty degrees has a footprint of 360 square metres. Its axis-aligned bounding box measures 32.0 by 25.4 metres, or 812 square metres, so 56 percent of the box is background. The polygon tracks the footprint exactly; the box teaches the segmentation head to expect roof texture across an area more than twice the building.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <!-- Imagery frame -->
  <rect x="30" y="30" width="330" height="250" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="42" y="50" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.6">tile at 30 cm GSD</text>
  <!-- Bounding box (drawn first, so the polygon reads on top) -->
  <rect x="99" y="86" width="192" height="152" fill="currentColor" opacity="0.14"/>
  <rect x="99" y="86" width="192" height="152" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="6 3"/>
  <!-- Rotated footprint -->
  <polygon points="99,176 255,86 291,148 135,238" fill="currentColor" opacity="0.3"/>
  <polygon points="99,176 255,86 291,148 135,238" fill="none" stroke="currentColor" stroke-width="2"/>
  <text x="195" y="166" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">footprint</text>
  <!-- Box dimension labels, outside the box -->
  <text x="195" y="78" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace" opacity="0.75">32.0 m</text>
  <text x="308" y="166" font-size="10" fill="currentColor" font-family="monospace" opacity="0.75">25.4 m</text>
  <!-- Numbers panel -->
  <text x="400" y="56" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">the same object, two geometries</text>
  <rect x="400" y="72" width="270" height="62" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="414" y="94" font-size="11" fill="currentColor" font-family="sans-serif">polygon, 4 vertices</text>
  <text x="656" y="94" text-anchor="end" font-size="12" fill="currentColor" font-family="monospace">360 m²</text>
  <text x="414" y="118" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">30 m × 12 m, rotated 30°</text>
  <rect x="400" y="146" width="270" height="62" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="6 3"/>
  <text x="414" y="168" font-size="11" fill="currentColor" font-family="sans-serif">axis-aligned box, 4 floats</text>
  <text x="656" y="168" text-anchor="end" font-size="12" fill="currentColor" font-family="monospace">812 m²</text>
  <text x="414" y="192" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">32.0 m × 25.4 m envelope</text>
  <rect x="400" y="220" width="270" height="60" rx="6" fill="none" stroke="currentColor" stroke-width="2"/>
  <text x="535" y="244" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">56% of the box is background</text>
  <text x="535" y="264" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">and it grows with rotation and elongation</text>
  <!-- Note -->
  <text x="195" y="302" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">a box aligned to the raster, on an object aligned to the street grid</text>
</svg>

## Step-by-step implementation

### Step 1 — Classify object types by spatial fidelity tier

Group every class in your taxonomy into one of three tiers before annotation begins:

```python
# Python 3.10+ | shapely==2.0.6, geopandas==1.0.1
from dataclasses import dataclass
from enum import Enum

class AnnotationTier(Enum):
    BBOX = "bbox"          # compact, near-rectangular, low boundary importance
    POLYGON = "polygon"    # irregular shape, area analytics, or seg model training
    HYBRID = "hybrid"      # start with bbox; refine to polygon via active learning

@dataclass
class ClassSpec:
    name: str
    tier: AnnotationTier
    rationale: str

taxonomy: list[ClassSpec] = [
    ClassSpec("vehicle",            AnnotationTier.BBOX,    "compact, high density, throughput priority"),
    ClassSpec("building",           AnnotationTier.POLYGON, "footprint area analytics, cadastral compliance"),
    ClassSpec("solar_array",        AnnotationTier.POLYGON, "boundary-precise for area/output estimation"),
    ClassSpec("vegetation_patch",   AnnotationTier.HYBRID,  "box for detection; polygon where area > 500 m²"),
    ClassSpec("shipping_container", AnnotationTier.BBOX,    "rectangular, change-detection use case"),
]
```

### Step 2 — Bootstrap the detector with bounding boxes

Train a lightweight detector on the full dataset using bounding boxes first. This surfaces which classes and spatial regions generate the most uncertainty before expensive polygon work begins.

```python
# Python 3.10+ | ultralytics==8.2.0
from ultralytics import YOLO
from pathlib import Path

def train_bbox_bootstrapper(data_yaml: Path, epochs: int = 50) -> Path:
    """Train a YOLOv8n detector on bounding-box annotations."""
    model = YOLO("yolov8n.pt")
    result = model.train(
        data=str(data_yaml),
        epochs=epochs,
        imgsz=1024,        # typical aerial tile size
        batch=8,
        device="cuda",
    )
    return Path(result.save_dir) / "weights" / "best.pt"
```

### Step 3 — Route high-uncertainty instances to polygon annotators

Use prediction confidence and box IoU variance to identify which instances need polygon refinement. This avoids blanket polygon annotation and focuses expert time on the highest-ambiguity objects. Per-annotation [confidence scores](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/confidence-scoring-for-geospatial-labels/) are the key signal driving this routing decision.

```python
# Python 3.10+ | ultralytics==8.2.0, numpy==1.26.4
import numpy as np
from ultralytics import YOLO
from pathlib import Path

CONFIDENCE_THRESHOLD = 0.55    # below this → route to polygon annotation queue
IOU_VARIANCE_THRESHOLD = 0.08  # high variance across augmentations → ambiguous boundary

def route_uncertain_predictions(
    model_path: Path,
    image_path: Path,
    n_augment: int = 5,
) -> list[dict]:
    """Return instances that should be refined with polygon masks."""
    model = YOLO(str(model_path))
    all_confs: list[np.ndarray] = []

    for _ in range(n_augment):
        results = model.predict(str(image_path), augment=True, verbose=False)
        confs = results[0].boxes.conf.cpu().numpy()
        all_confs.append(confs)

    # Flag objects where confidence is low OR varies across augmentations
    mean_conf = np.mean(all_confs, axis=0)
    conf_variance = np.var(all_confs, axis=0)

    flagged: list[dict] = []
    results_base = model.predict(str(image_path), verbose=False)[0]
    for i, box in enumerate(results_base.boxes.xyxy.cpu().numpy()):
        if mean_conf[i] < CONFIDENCE_THRESHOLD or conf_variance[i] > IOU_VARIANCE_THRESHOLD:
            flagged.append({
                "box_xyxy": box.tolist(),
                "mean_conf": float(mean_conf[i]),
                "conf_variance": float(conf_variance[i]),
                "action": "polygon_annotation_required",
            })
    return flagged
```

### Step 4 — Validate polygon topology with Shapely before export

Self-intersecting polygons and duplicate vertices corrupt COCO masks and cause silent failures in Mask R-CNN dataloaders. Run this validation as a mandatory pre-export gate; the same check integrates into a [DVC pipeline step for automated dataset snapshots](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/tracking-annotation-changes-with-sha-hashing/using-dvc-pipelines-for-automated-dataset-snapshots/).

```python
# Python 3.10+ | shapely==2.0.6, geopandas==1.0.1
import geopandas as gpd
from shapely.validation import explain_validity
from pathlib import Path

def validate_and_repair_polygons(geojson_path: Path) -> gpd.GeoDataFrame:
    """
    Load, validate, and auto-repair a GeoJSON annotation file.
    Raises ValueError if any geometry cannot be repaired.
    """
    gdf: gpd.GeoDataFrame = gpd.read_file(geojson_path)

    invalid_mask = ~gdf.geometry.is_valid
    if invalid_mask.any():
        print(f"Repairing {invalid_mask.sum()} invalid geometries …")
        for idx in gdf[invalid_mask].index:
            reason = explain_validity(gdf.at[idx, "geometry"])
            repaired = gdf.at[idx, "geometry"].buffer(0)
            if not repaired.is_valid:
                raise ValueError(f"Row {idx} cannot be repaired: {reason}")
            gdf.at[idx, "geometry"] = repaired

    # Simplify vertex density: 1 vertex per ~5 px at 30 cm GSD → ~0.15 m tolerance
    gdf["geometry"] = gdf.geometry.simplify(tolerance=0.15, preserve_topology=True)

    return gdf
```

### Step 5 — Measure Boundary IoU per class to confirm quality

Standard IoU is insensitive to jagged edges. Boundary IoU (BIoU) penalises misaligned contours and is the correct QA metric when confidence scores drive active-learning queue prioritisation.

```python
# Python 3.10+ | shapely==2.0.6
from shapely.geometry import Polygon
from shapely.ops import unary_union

def boundary_iou(pred: Polygon, gt: Polygon, dilation_m: float = 0.5) -> float:
    """
    Compute Boundary IoU between predicted and ground-truth polygons.
    dilation_m: boundary band width in metres (assumes metric CRS, e.g. EPSG:32633).
    """
    pred_boundary = pred.boundary.buffer(dilation_m)
    gt_boundary   = gt.boundary.buffer(dilation_m)

    intersection = pred_boundary.intersection(gt_boundary).area
    union        = unary_union([pred_boundary, gt_boundary]).area

    return intersection / union if union > 0 else 0.0
```

Always reproject geometries to a [local metric CRS](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) (e.g. `EPSG:32633` for UTM Zone 33N) before calling `boundary_iou` — computing BIoU in geographic degrees (`EPSG:4326`) produces meaningless results at mid-latitudes.

## Spatial parameters and thresholds reference

| Parameter | Bounding boxes | Polygons | Notes |
|---|---|---|---|
| Annotation speed | 3–5× faster than polygons | Baseline | Varies by annotator experience |
| Storage per instance | 4 floats | Variable vertex count | Polygons grow with shape complexity |
| Min IoU for QA pass | 0.70 (standard) | 0.65 BIoU (boundary-sensitive) | Lower BIoU threshold accounts for contour difficulty |
| Vertex simplification tolerance | n/a | 0.10–0.25 m at 30 cm GSD | Douglas-Peucker; target 1 vertex per 5–10 px |
| Max vertices per polygon | n/a | 500 | Above this, rasterisation stalls COCO dataloader |
| Min object area (boxes) | 32 × 32 px | n/a | Below this threshold, annotation noise exceeds signal |
| Recommended CRS for QA | `EPSG:32633` / local UTM | `EPSG:32633` / local UTM | Never compute IoU in `EPSG:4326` |


<svg viewBox="0 0 740 260" role="img" aria-label="The same building contour at three simplification tolerances, with vertex counts and the consequences of each" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:740px;display:block;margin:1.5rem auto;">
  <title>Vertex budget: what Douglas-Peucker tolerance buys and costs</title>
  <desc>Three versions of one building contour. Raw auto-traced output carries 512 vertices and stalls the dataloader. Simplified at 0.10 metres it keeps 78 vertices and every real corner. Simplified at 0.60 metres it drops to 21 vertices and the corners round off, losing the wall lines the footprint exists to record.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <!-- Raw -->
  <text x="120" y="30" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">raw auto-trace</text>
  <text x="120" y="46" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">no tolerance</text>
  <path d="M40 80 L58 74 L60 82 L78 76 L80 84 L98 78 L100 86 L118 80 L136 76 L154 82 L172 78 L190 84 L194 104 L188 122 L192 140 L186 158 L190 176 L168 180 L150 174 L132 180 L114 174 L96 180 L78 174 L60 180 L44 176 L48 158 L42 140 L46 122 L40 104 Z" fill="currentColor" opacity="0.16"/>
  <path d="M40 80 L58 74 L60 82 L78 76 L80 84 L98 78 L100 86 L118 80 L136 76 L154 82 L172 78 L190 84 L194 104 L188 122 L192 140 L186 158 L190 176 L168 180 L150 174 L132 180 L114 174 L96 180 L78 174 L60 180 L44 176 L48 158 L42 140 L46 122 L40 104 Z" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="120" y="208" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">512 vertices</text>
  <text x="120" y="228" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">rasterisation stalls the</text>
  <text x="120" y="242" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">COCO dataloader</text>
  <!-- Good -->
  <text x="370" y="30" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">tolerance 0.10 m</text>
  <text x="370" y="46" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">≈ 1 vertex per 5–10 px at 30 cm GSD</text>
  <path d="M290 78 L444 78 L444 104 L440 140 L444 178 L290 178 L294 140 L290 104 Z" fill="currentColor" opacity="0.16"/>
  <path d="M290 78 L444 78 L444 104 L440 140 L444 178 L290 178 L294 140 L290 104 Z" fill="none" stroke="currentColor" stroke-width="2"/>
  <text x="370" y="208" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">78 vertices</text>
  <text x="370" y="228" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">corners intact, walls straight —</text>
  <text x="370" y="242" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">the target for QA</text>
  <!-- Over-simplified -->
  <text x="620" y="30" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">tolerance 0.60 m</text>
  <text x="620" y="46" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">past the useful range</text>
  <path d="M545 84 L690 78 L694 172 L548 176 Z" fill="currentColor" opacity="0.16"/>
  <path d="M545 84 L690 78 L694 172 L548 176 Z" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="5 3"/>
  <text x="620" y="208" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">21 vertices</text>
  <text x="620" y="228" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">corners rounded off — the wall</text>
  <text x="620" y="242" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">lines the footprint exists for</text>
</svg>

## Common errors and fixes

`TopologicalError: This operation could not be performed`
: Cause: self-intersecting ring generated by vertex snapping or annotator trace error.
: Fix: `geom = geom.buffer(0)` — Shapely's zero-buffer trick dissolves self-intersections; verify with `geom.is_valid` after.

`ValueError: A LinearRing requires at least 4 coordinates`
: Cause: a degenerate polygon with fewer than 4 vertices, often from rushed polygon closure on tiny objects.
: Fix: filter `gdf[gdf.geometry.apply(lambda g: len(g.exterior.coords) >= 4)]` before export; log discarded instances.

IoU scores collapse at mid-latitudes despite correct pixel alignment
: Cause: IoU computed in `EPSG:4326`; degree-based distances distort area calculations.
: Fix: `gdf = gdf.to_crs("EPSG:32633")` (or the appropriate UTM zone) before any metric computation.

COCO mask export produces out-of-memory error during training
: Cause: polygon vertex count is too high for dense rasterisation across a full batch.
: Fix: apply `simplify(tolerance=0.15, preserve_topology=True)` and cap at 500 vertices per instance before converting to RLE masks.

---

This page is one focused how-to within the broader [Defining ROI Label Taxonomies for Aerial Imagery](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/defining-roi-label-taxonomies-for-aerial-imagery/) workflow, which covers class hierarchy design, confidence scoring, and multi-sensor taxonomy alignment.

**Related**

- [Defining ROI Label Taxonomies for Aerial Imagery](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/defining-roi-label-taxonomies-for-aerial-imagery/) — class hierarchy design and taxonomy governance
- [Coordinate Reference Systems in Annotation Pipelines](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) — CRS contracts, datum alignment, and projected IoU computation
- [Calculating IoU Thresholds for Geospatial Object Detection](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/calculating-iou-thresholds-for-geospatial-object-detection/) — per-class IoU cutoffs by GSD and mission type
- [Confidence Scoring for Geospatial Labels](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/confidence-scoring-for-geospatial-labels/) — per-annotation scoring to drive active-learning queues
- [Using DVC Pipelines for Automated Dataset Snapshots](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/tracking-annotation-changes-with-sha-hashing/using-dvc-pipelines-for-automated-dataset-snapshots/) — integrate polygon validation as a reproducible pipeline step
