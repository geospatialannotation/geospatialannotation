---
title: "Resolving Sync Conflicts in Distributed Annotation"
description: "Detect and resolve conflicting edits when multiple annotation sites push to the same versioned dataset — three-way merge on GeoJSON features, feature-id reconciliation, and a last-writer-wins guard."
slug: "resolving-sync-conflicts-in-distributed-annotation"
type: "tutorial"
breadcrumb:
  - label: "Home"
    url: "/"
  - label: "Dataset Versioning & Spatial Data Sync"
    url: "/dataset-versioning-spatial-data-sync/"
  - label: "Syncing Annotations Across Cloud Remotes"
    url: "/dataset-versioning-spatial-data-sync/syncing-annotations-across-cloud-remotes/"
  - label: "Resolving Sync Conflicts in Distributed Annotation"
    url: "/dataset-versioning-spatial-data-sync/syncing-annotations-across-cloud-remotes/resolving-sync-conflicts-in-distributed-annotation/"
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
      "headline": "Resolving Sync Conflicts in Distributed Annotation",
      "description": "Detect and resolve conflicting edits when multiple annotation sites push to the same versioned dataset — three-way merge on GeoJSON features, feature-id reconciliation, and a last-writer-wins guard.",
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
        {"@type": "ListItem", "position": 3, "name": "Syncing Annotations Across Cloud Remotes", "item": "https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/syncing-annotations-across-cloud-remotes/"},
        {"@type": "ListItem", "position": 4, "name": "Resolving Sync Conflicts in Distributed Annotation", "item": "https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/syncing-annotations-across-cloud-remotes/resolving-sync-conflicts-in-distributed-annotation/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Resolving Sync Conflicts in Distributed Annotation",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Load base, ours, and theirs keyed by feature id", "text": "Read the common-ancestor FeatureCollection and both diverged edits into geopandas GeoDataFrames indexed by a stable feature id property so each feature can be compared across all three versions."},
        {"@type": "HowToStep", "position": 2, "name": "Classify every feature as added, removed, or modified", "text": "Compare each side against the base by feature id and geometry/attribute hash to label the change type, producing a per-side changeset that drives the merge decision."},
        {"@type": "HowToStep", "position": 3, "name": "Auto-merge non-overlapping changes", "text": "When only one side touched a feature, apply that change directly to the merged output because there is no competing edit to reconcile."},
        {"@type": "HowToStep", "position": 4, "name": "Flag true conflicts for review", "text": "When both sides modified the same feature differently, route it to a conflict queue instead of guessing, recording base, ours, and theirs for a human decision."},
        {"@type": "HowToStep", "position": 5, "name": "Apply last-writer-wins as a bounded fallback", "text": "For conflicts that must resolve automatically, compare edit timestamps and keep the newer feature, logging the discarded version so the choice stays auditable."},
        {"@type": "HowToStep", "position": 6, "name": "Write merged output and a conflict report", "text": "Serialize the merged FeatureCollection and emit a machine-readable conflict report so downstream training and review tools see exactly what merged and what still needs a human."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why can't I just diff two GeoJSON files to merge distributed annotations?",
          "acceptedAnswer": {"@type": "Answer", "text": "A two-way diff has no common ancestor, so it cannot tell whether a difference means one site added a feature or the other site deleted it. A three-way merge compares each side against the shared base version, which distinguishes additions, deletions, and modifications and lets non-overlapping edits merge automatically while genuine same-feature conflicts are isolated for review."}
        },
        {
          "@type": "Question",
          "name": "What makes a stable feature id for GeoJSON annotations?",
          "acceptedAnswer": {"@type": "Answer", "text": "Assign each feature a UUID in a property such as feature_id at creation time and never reuse or regenerate it on edit. Do not key on array position or on a hash of the geometry, because both change the moment an annotator nudges a vertex, which makes an edited feature look like a delete-plus-add and defeats the merge."}
        },
        {
          "@type": "Question",
          "name": "When is last-writer-wins safe for annotation conflicts?",
          "acceptedAnswer": {"@type": "Answer", "text": "Last-writer-wins is acceptable only for low-stakes attribute edits or when a trustworthy edit timestamp exists and losing one side's change is recoverable from history. For geometry conflicts on labels destined for model training, prefer the review queue, because silently discarding a correct boundary in favour of a newer wrong one corrupts the dataset without any signal."}
        },
        {
          "@type": "Question",
          "name": "How do I keep the merge from silently dropping a feature deleted on one side but edited on the other?",
          "acceptedAnswer": {"@type": "Answer", "text": "Treat a delete-versus-modify pair as a conflict, not an auto-merge. If one site removed a feature while another refined its geometry, the deletion may be wrong; route the pair to the review queue with both states so a human confirms whether the feature should survive."}
        }
      ]
    }
  ]
}
</script>

# Resolving Sync Conflicts in Distributed Annotation

When two annotation sites edit the same versioned dataset and both push, a naive sync clobbers one side's work. The durable fix is to key every feature on a stable feature id and perform a three-way merge — comparing a common-ancestor GeoJSON against each site's version — rather than a two-way file diff. Geometry and attribute changes that touch *different* features merge automatically; edits to the *same* feature go to a review queue instead of being guessed at; and a last-writer-wins guard keyed on edit timestamps is the bounded fallback for conflicts that must resolve without a human. This turns "whoever pushed last wins the whole file" into "every non-conflicting edit survives, and real conflicts are surfaced, not lost."

## Why Silent Clobbering Corrupts Training Data

Distributed annotation teams rarely edit in lockstep. One site refines building footprints in a northern tile while another relabels vehicles in a southern tile of the same GeoJSON collection. Both branch from the same snapshot, both edit, both push. If your sync layer resolves this by keeping the last-uploaded object — the default for object stores and for a careless [DVC](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/) workflow that tracks the file as one opaque blob — one site's entire session vanishes with no error. The dataset still validates, still loads, still trains. It is simply missing labels, and the loss surfaces only as unexplained recall degradation weeks later.

A two-way diff does not save you either. Given only *ours* and *theirs*, a diff cannot distinguish "they added feature X" from "we deleted feature X" — both look like feature X being present on one side and absent on the other. Without the shared base version as a reference point, every merge decision is a guess. The three-way merge exists precisely to remove that ambiguity: by comparing each side against the common ancestor, an added feature, a removed feature, and a modified feature become three distinct, detectable events.

Two structural preconditions make this work. First, features must carry a **stable feature id** — a UUID minted at creation, stored in a property, and never regenerated on edit. Array index and geometry hash are both unstable: nudge one vertex and a hash-keyed feature reads as delete-plus-add, silently discarding the annotator's refinement. Second, features should carry an edit timestamp so the fallback guard has something principled to compare. Getting these two fields onto every feature is upstream work, but everything below depends on them.

<svg viewBox="0 0 640 340" role="img" aria-label="Three-way merge of GeoJSON annotations from a common base into ours and theirs, producing a merged output plus a conflict queue" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:640px;display:block;margin:1.5rem auto;">
  <title>Three-way merge for distributed GeoJSON annotations</title>
  <desc>A common base FeatureCollection diverges into two edited versions, ours and theirs. Non-overlapping changes auto-merge into a merged output, while edits to the same feature are routed to a conflict review queue.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <defs>
    <marker id="ah" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto">
      <polygon points="0 0, 9 3.5, 0 7" fill="currentColor" opacity="0.55"/>
    </marker>
  </defs>
  <!-- Base -->
  <rect x="250" y="18" width="140" height="52" rx="7" fill="currentColor" fill-opacity="0.08" stroke="currentColor" stroke-width="1.5" stroke-opacity="0.5"/>
  <text x="320" y="40" text-anchor="middle" font-size="13" fill="currentColor" opacity="0.9" font-family="sans-serif" font-weight="bold">base</text>
  <text x="320" y="57" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.55" font-family="sans-serif">common ancestor</text>
  <!-- Ours -->
  <rect x="70" y="128" width="150" height="56" rx="7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-opacity="0.5"/>
  <text x="145" y="151" text-anchor="middle" font-size="13" fill="currentColor" opacity="0.9" font-family="sans-serif" font-weight="bold">ours</text>
  <text x="145" y="169" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.55" font-family="sans-serif">site A edits</text>
  <!-- Theirs -->
  <rect x="420" y="128" width="150" height="56" rx="7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="6 3" stroke-opacity="0.5"/>
  <text x="495" y="151" text-anchor="middle" font-size="13" fill="currentColor" opacity="0.9" font-family="sans-serif" font-weight="bold">theirs</text>
  <text x="495" y="169" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.55" font-family="sans-serif">site B edits</text>
  <!-- base to ours/theirs -->
  <line x1="285" y1="70" x2="160" y2="126" stroke="currentColor" stroke-width="1.5" opacity="0.45" marker-end="url(#ah)"/>
  <line x1="355" y1="70" x2="480" y2="126" stroke="currentColor" stroke-width="1.5" opacity="0.45" marker-end="url(#ah)"/>
  <!-- Classify node -->
  <rect x="240" y="214" width="160" height="46" rx="7" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-width="1.5" stroke-opacity="0.5"/>
  <text x="320" y="236" text-anchor="middle" font-size="12" fill="currentColor" opacity="0.9" font-family="sans-serif" font-weight="bold">classify by feature id</text>
  <text x="320" y="252" text-anchor="middle" font-size="9.5" fill="currentColor" opacity="0.55" font-family="sans-serif">added / removed / modified</text>
  <line x1="145" y1="184" x2="255" y2="214" stroke="currentColor" stroke-width="1.5" opacity="0.45" marker-end="url(#ah)"/>
  <line x1="495" y1="184" x2="385" y2="214" stroke="currentColor" stroke-width="1.5" opacity="0.45" marker-end="url(#ah)"/>
  <!-- Outputs -->
  <rect x="90" y="290" width="200" height="42" rx="7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-opacity="0.5"/>
  <text x="190" y="308" text-anchor="middle" font-size="12" fill="currentColor" opacity="0.9" font-family="sans-serif" font-weight="bold">merged output</text>
  <text x="190" y="323" text-anchor="middle" font-size="9.5" fill="currentColor" opacity="0.55" font-family="sans-serif">non-overlapping edits auto-merged</text>
  <rect x="350" y="290" width="200" height="42" rx="7" fill="currentColor" fill-opacity="0.14" stroke="currentColor" stroke-width="1.5" stroke-opacity="0.6"/>
  <text x="450" y="308" text-anchor="middle" font-size="12" fill="currentColor" opacity="0.9" font-family="sans-serif" font-weight="bold">conflict queue</text>
  <text x="450" y="323" text-anchor="middle" font-size="9.5" fill="currentColor" opacity="0.55" font-family="sans-serif">same feature, both sides — review</text>
  <line x1="290" y1="260" x2="215" y2="288" stroke="currentColor" stroke-width="1.5" opacity="0.45" marker-end="url(#ah)"/>
  <line x1="350" y1="260" x2="425" y2="288" stroke="currentColor" stroke-width="1.5" opacity="0.45" marker-end="url(#ah)"/>
</svg>

## Step-by-Step Implementation

The workflow below loads three FeatureCollections, classifies every feature against the base, auto-merges non-overlapping changes, isolates true conflicts, and writes both a merged file and a conflict report. It assumes each feature stores a `feature_id` string and an `edited_at` ISO timestamp in its properties. Coordinates are geographic; the merge is CRS-agnostic as long as all three files share one [coordinate reference system](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) — mixing `EPSG:4326` on one side with a projected CRS on another would make identical geometries compare as modified, so normalise CRS before merging.

Install the pinned dependencies once:

```bash
pip install geopandas==0.14.4 shapely==2.0.6 pandas==2.2.2
```

### Step 1 — Load Base, Ours, and Theirs Keyed by Feature Id

Read all three versions into `geopandas` GeoDataFrames indexed by the stable id. Indexing by `feature_id` — not row order — is what lets the same feature line up across three files that may store features in different orders.

```python
from __future__ import annotations
import geopandas as gpd

def load_keyed(path: str, id_field: str = "feature_id") -> gpd.GeoDataFrame:
    """Load a GeoJSON FeatureCollection indexed by its stable feature id."""
    gdf: gpd.GeoDataFrame = gpd.read_file(path)
    if id_field not in gdf.columns:
        raise ValueError(f"{path}: every feature needs a stable '{id_field}'")
    if gdf[id_field].duplicated().any():
        raise ValueError(f"{path}: duplicate {id_field} values break the merge")
    return gdf.set_index(id_field, drop=False)

base: gpd.GeoDataFrame = load_keyed("base.geojson")
ours: gpd.GeoDataFrame = load_keyed("ours.geojson")
theirs: gpd.GeoDataFrame = load_keyed("theirs.geojson")
```

### Step 2 — Classify Each Feature Against the Base

For one side, compare every feature id to the base to label it `added`, `removed`, or `modified`. A feature is `modified` when its geometry or its non-metadata attributes differ from the base version. Comparing on WKB plus a sorted attribute tuple is stable and ignores property ordering.

<svg viewBox="0 0 720 290" role="img" aria-label="A change matrix classifying every feature by what each side did to it since the common base" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>Nine cases, and only three of them need a human</title>
  <desc>Each feature is classified by what our side did and what theirs did since the base version. Where only one side touched a feature, that side's version is taken. Where neither did, the base stands. Where both edited, both deleted, or one edited while the other deleted, the merge stops and writes a conflict record rather than guessing.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <text x="330" y="42" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.85">theirs: unchanged</text>
  <text x="480" y="42" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.85">theirs: edited</text>
  <text x="620" y="42" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.85">theirs: deleted</text>
  <line x1="20" y1="52" x2="700" y2="52" stroke="currentColor" stroke-width="1" opacity="0.4"/>
  <!-- Row 1 -->
  <text x="20" y="90" font-size="11" fill="currentColor" font-family="sans-serif">ours: unchanged</text>
  <rect x="260" y="70" width="140" height="30" rx="4" fill="none" stroke="currentColor" stroke-width="1.2"/>
  <text x="330" y="90" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif">keep base</text>
  <rect x="410" y="70" width="140" height="30" rx="4" fill="currentColor" opacity="0.28"/>
  <text x="480" y="90" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif">take theirs</text>
  <rect x="560" y="70" width="140" height="30" rx="4" fill="currentColor" opacity="0.28"/>
  <text x="630" y="90" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif">delete</text>
  <!-- Row 2 -->
  <text x="20" y="140" font-size="11" fill="currentColor" font-family="sans-serif">ours: edited</text>
  <rect x="260" y="120" width="140" height="30" rx="4" fill="currentColor" opacity="0.28"/>
  <text x="330" y="140" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif">take ours</text>
  <rect x="410" y="120" width="140" height="30" rx="4" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="4 2"/>
  <text x="480" y="140" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif">conflict</text>
  <rect x="560" y="120" width="140" height="30" rx="4" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="4 2"/>
  <text x="630" y="140" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif">conflict</text>
  <!-- Row 3 -->
  <text x="20" y="190" font-size="11" fill="currentColor" font-family="sans-serif">ours: deleted</text>
  <rect x="260" y="170" width="140" height="30" rx="4" fill="currentColor" opacity="0.28"/>
  <text x="330" y="190" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif">delete</text>
  <rect x="410" y="170" width="140" height="30" rx="4" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="4 2"/>
  <text x="480" y="190" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif">conflict</text>
  <rect x="560" y="170" width="140" height="30" rx="4" fill="none" stroke="currentColor" stroke-width="1.2"/>
  <text x="630" y="190" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif">delete — both agree</text>
  <!-- Legend -->
  <rect x="20" y="228" width="20" height="14" rx="3" fill="currentColor" opacity="0.28"/>
  <text x="48" y="240" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">resolved automatically</text>
  <rect x="220" y="228" width="20" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="4 2"/>
  <text x="248" y="240" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">written to the conflict report, untouched in the output</text>
  <text x="360" y="272" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">the edit-versus-delete cells are the ones worth arguing about: whoever deleted may have known something the editor did not</text>
</svg>

```python
from shapely.geometry.base import BaseGeometry

IGNORE_PROPS: set[str] = {"edited_at"}  # metadata that should not count as a change

def _fingerprint(row: "gpd.GeoSeries", geom: BaseGeometry) -> tuple[bytes, tuple]:
    props = tuple(
        (k, row[k]) for k in sorted(row.index)
        if k not in IGNORE_PROPS and k != "geometry"
    )
    return (geom.wkb, props)

def classify(side: gpd.GeoDataFrame, base: gpd.GeoDataFrame) -> dict[str, str]:
    """Return {feature_id: 'added' | 'removed' | 'modified'} for one side vs base."""
    changes: dict[str, str] = {}
    base_ids: set[str] = set(base.index)
    side_ids: set[str] = set(side.index)

    for fid in side_ids - base_ids:
        changes[fid] = "added"
    for fid in base_ids - side_ids:
        changes[fid] = "removed"
    for fid in side_ids & base_ids:
        if _fingerprint(side.loc[fid], side.geometry.loc[fid]) != \
           _fingerprint(base.loc[fid], base.geometry.loc[fid]):
            changes[fid] = "modified"
    return changes
```

### Step 3 — Merge Non-Overlapping Changes and Flag Conflicts

Now walk the union of both changesets. If only one side touched a feature, apply that side's version. If both sides touched the same feature, it is a conflict unless — the one safe exception — both made the *identical* edit, in which case either version serves.

```python
from dataclasses import dataclass, field

@dataclass
class Conflict:
    feature_id: str
    ours_change: str | None
    theirs_change: str | None

@dataclass
class MergeResult:
    features: dict[str, "gpd.GeoSeries"] = field(default_factory=dict)
    conflicts: list[Conflict] = field(default_factory=list)

def three_way_merge(base: gpd.GeoDataFrame,
                    ours: gpd.GeoDataFrame,
                    theirs: gpd.GeoDataFrame) -> MergeResult:
    ours_ch = classify(ours, base)
    theirs_ch = classify(theirs, base)
    result = MergeResult()

    # Start from base; unchanged features carry through untouched.
    for fid in base.index:
        result.features[fid] = base.loc[fid]

    touched: set[str] = set(ours_ch) | set(theirs_ch)
    for fid in touched:
        o, t = ours_ch.get(fid), theirs_ch.get(fid)
        if o and not t:                       # only we changed it
            _apply(result, fid, "ours", ours, o)
        elif t and not o:                     # only they changed it
            _apply(result, fid, "theirs", theirs, t)
        elif _same_edit(fid, o, t, ours, theirs):
            _apply(result, fid, "ours", ours, o)   # identical edit, no conflict
        else:                                 # same feature, different edits
            result.conflicts.append(Conflict(fid, o, t))
    return result

def _apply(result: MergeResult, fid: str, side: str,
           gdf: gpd.GeoDataFrame, change: str) -> None:
    if change == "removed":
        result.features.pop(fid, None)
    else:                                     # added or modified
        result.features[fid] = gdf.loc[fid]

def _same_edit(fid: str, o: str | None, t: str | None,
               ours: gpd.GeoDataFrame, theirs: gpd.GeoDataFrame) -> bool:
    if o != t or o == "removed":
        return o == "removed" and t == "removed"
    return _fingerprint(ours.loc[fid], ours.geometry.loc[fid]) == \
           _fingerprint(theirs.loc[fid], theirs.geometry.loc[fid])
```

### Step 4 — Apply the Last-Writer-Wins Guard

For pipelines that must produce a merged file with no human in the loop, resolve remaining conflicts by keeping the feature with the newer `edited_at`. Always log the discarded side so the choice stays auditable rather than silent.

<svg viewBox="0 0 720 260" role="img" aria-label="Last-writer-wins resolving a conflict by timestamp, and the clock skew that makes it unsafe" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>Last-writer-wins is only as trustworthy as the clocks</title>
  <desc>Two sites edit the same feature. Site A's edit is stamped 14:02:10 and site B's 14:02:04, so last-writer-wins keeps A. But site B's host clock runs 90 seconds fast, so B's edit actually happened later in real time and is the one being discarded. The guard is to require a monotonic generation number, and to refuse the automatic resolution when the two timestamps fall within the tolerated skew.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <rect x="20" y="52" width="300" height="96" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="170" y="76" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">what the timestamps say</text>
  <text x="40" y="102" font-size="11" fill="currentColor" font-family="monospace">site A   14:02:10   ← kept</text>
  <text x="40" y="126" font-size="11" fill="currentColor" font-family="monospace">site B   14:02:04   ← discarded</text>
  <rect x="400" y="52" width="300" height="96" rx="6" fill="none" stroke="currentColor" stroke-width="2"/>
  <text x="550" y="76" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">what actually happened</text>
  <text x="420" y="102" font-size="11" fill="currentColor" font-family="monospace">site A   14:02:10</text>
  <text x="420" y="126" font-size="11" fill="currentColor" font-family="monospace">site B   14:03:34   (clock +90 s)</text>
  <line x1="320" y1="100" x2="396" y2="100" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 3"/>
  <text x="358" y="92" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.7">but</text>
  <rect x="90" y="172" width="540" height="66" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 3"/>
  <text x="360" y="196" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">so the guard is not a better clock</text>
  <text x="360" y="216" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">order by the monotonic generation number, and when two edits fall inside the tolerated skew,</text>
  <text x="360" y="232" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">refuse to resolve automatically and write both to the conflict report</text>
</svg>

```python
from datetime import datetime

def resolve_last_writer_wins(result: MergeResult,
                             ours: gpd.GeoDataFrame,
                             theirs: gpd.GeoDataFrame) -> list[dict[str, str]]:
    """Auto-resolve conflicts by newest timestamp; return an audit log."""
    log: list[dict[str, str]] = []
    for c in list(result.conflicts):
        if c.feature_id not in ours.index or c.feature_id not in theirs.index:
            continue  # delete-vs-modify: leave for human review
        o_ts = datetime.fromisoformat(ours.loc[c.feature_id, "edited_at"])
        t_ts = datetime.fromisoformat(theirs.loc[c.feature_id, "edited_at"])
        winner = "ours" if o_ts >= t_ts else "theirs"
        src = ours if winner == "ours" else theirs
        result.features[c.feature_id] = src.loc[c.feature_id]
        result.conflicts.remove(c)
        log.append({"feature_id": c.feature_id, "kept": winner,
                    "reason": "last_writer_wins"})
    return log
```

### Step 5 — Write Merged Output and a Conflict Report

Serialize the surviving features back to GeoJSON and emit a JSON report so review tooling and downstream stages know exactly what merged cleanly and what still needs a decision.

```python
import json
import pandas as pd

def write_outputs(result: MergeResult, base: gpd.GeoDataFrame,
                  merged_path: str = "merged.geojson",
                  report_path: str = "conflict_report.json") -> None:
    rows = list(result.features.values())
    merged = gpd.GeoDataFrame(pd.DataFrame(rows), crs=base.crs)
    merged.to_file(merged_path, driver="GeoJSON")

    report = {
        "merged_feature_count": len(result.features),
        "unresolved_conflicts": [
            {"feature_id": c.feature_id, "ours": c.ours_change,
             "theirs": c.theirs_change} for c in result.conflicts
        ],
    }
    with open(report_path, "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2)

# End-to-end
res = three_way_merge(base, ours, theirs)
audit = resolve_last_writer_wins(res, ours, theirs)  # optional automatic pass
write_outputs(res, base)
```

## Change Type to Resolution Reference

The merge's entire decision surface reduces to how a feature changed on each side. This table is the contract the code above implements.

| Change on *ours* | Change on *theirs* | Resolution |
|---|---|---|
| Modified | Unchanged | Auto-merge — keep ours |
| Unchanged | Modified | Auto-merge — keep theirs |
| Added (new id) | Unchanged | Auto-merge — include the new feature |
| Removed | Unchanged | Auto-merge — drop the feature |
| Modified | Modified (identical) | Auto-merge — either version |
| Modified | Modified (different) | Conflict — review queue |
| Removed | Modified | Conflict — review queue (never auto-drop) |
| Added (same id, different geometry) | Added (same id) | Conflict — id collision, review queue |

The two rows that most often get mishandled are delete-versus-modify and same-id collisions. Never let a deletion win automatically over a refinement: the annotator who deleted may have been working from stale context, and dropping a corrected boundary is unrecoverable without digging through history. Same-id collisions usually signal that two sites minted the same UUID or that ids were reused — treat them as conflicts and fix the id generator upstream.

## Common Errors and Fixes

**Every feature reports as `modified` even when nothing changed**
Root cause: the three files use different CRS or different coordinate precision, so WKB fingerprints differ byte-for-byte. Fix: reproject all sides to one CRS and round coordinates to a fixed precision (for example `shapely.set_precision(geom, 1e-7)`) before fingerprinting.

**Edited features appear as a delete plus an add**
Root cause: features are keyed on array index or a geometry hash, so any vertex move changes the key. Fix: key strictly on a persistent `feature_id` UUID assigned at creation and preserved through every edit.

**`KeyError` on `edited_at` during last-writer-wins**
Root cause: some features predate the timestamp convention. Fix: backfill `edited_at` from version history, or skip the guard for those ids and route them to the review queue instead of crashing the merge.

**Merged file loses features that neither side changed**
Root cause: the merge started from the changesets alone and never seeded from base. Fix: initialise the result with every base feature first (Step 3 does this), then apply changes on top so untouched features always survive.

**Two sites both push a feature with the same id but different geometry**
Root cause: non-unique id generation across sites. Fix: mint UUIDs with a site prefix or a UUID4 source, and treat any residual collision as a conflict rather than overwriting — the same discipline that [tracking annotation changes with SHA hashing](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/tracking-annotation-changes-with-sha-hashing/) uses to keep identities stable.

## Related

- [Debugging Annotation Drift Across Dataset Versions](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/rollback-strategies-for-corrupted-spatial-datasets/debugging-annotation-drift-across-dataset-versions/) — trace how features changed between snapshots, the diff foundation this merge builds on
- [Tracking Annotation Changes with SHA Hashing](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/tracking-annotation-changes-with-sha-hashing/) — content-addressed identities that make base-versus-side comparison deterministic
- [Implementing DVC for Geospatial Training Data](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/) — version the datasets whose concurrent edits create these conflicts in the first place
- [Preserving Metadata Across Dataset Versions](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/preserving-metadata-across-dataset-versions/) — keep the feature ids and edit timestamps the merge depends on attached to every export

This guide is part of the broader [Syncing Annotations Across Cloud Remotes](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/syncing-annotations-across-cloud-remotes/) topic area within [Dataset Versioning & Spatial Data Sync](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/).
