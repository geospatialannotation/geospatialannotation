---
title: "Syncing Annotations Across Cloud Remotes"
description: "Keep geospatial annotations consistent across S3, GCS, and Azure remotes: content-addressed sync, conflict detection, and multi-site coordination that avoids clobbering concurrent labeling work."
slug: "syncing-annotations-across-cloud-remotes"
type: "guide"
breadcrumb: "Dataset Versioning & Spatial Data Sync > Syncing Annotations Across Cloud Remotes"
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
      "headline": "Syncing Annotations Across Cloud Remotes",
      "description": "Keep geospatial annotations consistent across S3, GCS, and Azure remotes: content-addressed sync, conflict detection, and multi-site coordination that avoids clobbering concurrent labeling work.",
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
        {"@type": "ListItem", "position": 3, "name": "Syncing Annotations Across Cloud Remotes", "item": "https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/syncing-annotations-across-cloud-remotes/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Sync Geospatial Annotations Safely Across Cloud Remotes",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Content-address every feature before push", "text": "Canonicalize each GeoJSON feature and hash it so identical labels resolve to the same object key on the remote."},
        {"@type": "HowToStep", "position": 2, "name": "Detect divergence against the remote manifest", "text": "Download the remote manifest and diff it against the local manifest to classify keys as added, removed, or conflicting before writing anything."},
        {"@type": "HowToStep", "position": 3, "name": "Order push and pull operations safely", "text": "Pull and reconcile the remote state first, upload immutable content-addressed objects, then commit the manifest pointer last."},
        {"@type": "HowToStep", "position": 4, "name": "Coordinate concurrent sites with a lease and generation number", "text": "Acquire a short-lived lease on the manifest and bump a monotonic generation number so a stale writer is rejected instead of clobbering newer work."},
        {"@type": "HowToStep", "position": 5, "name": "Validate the roundtrip", "text": "Re-download the committed manifest, verify every referenced object exists, and assert the feature hashes match before declaring the sync complete."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why does last-writer-wins silently lose annotations on object stores?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Object stores like S3 and GCS accept an unconditional PUT to a key regardless of who wrote it last, so two sites that write the same manifest key overwrite each other with no error. Guard the manifest with a conditional write keyed on a monotonic generation number so a stale writer is rejected instead of clobbering newer labels."
          }
        },
        {
          "@type": "Question",
          "name": "How does content addressing prevent sync conflicts?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Content addressing stores each feature under a key derived from the hash of its canonical bytes, so identical labels always map to the same immutable object and can never overwrite different content. Conflicts collapse to a single mutable pointer, the manifest, which is the only object that needs coordination."
          }
        },
        {
          "@type": "Question",
          "name": "Do I need a lock if I already use content-addressed objects?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "The immutable objects never need a lock because they are write-once and self-verifying. You only need a lease or a conditional generation bump on the single manifest pointer, which is the one mutable object two sites can race to update."
          }
        },
        {
          "@type": "Question",
          "name": "How do I handle eventual consistency when reading a manifest back?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Read the manifest and every referenced object by exact key rather than relying on a bucket listing, and verify each object hash on download. S3 offers strong read-after-write consistency on single keys, but bucket listings and cross-region replicas can lag, so never treat a listing as authoritative for a sync decision."
          }
        }
      ]
    }
  ]
}
</script>

# Syncing Annotations Across Cloud Remotes

Two annotation teams — one in Lisbon, one in Nairobi — spend a Tuesday labeling building footprints over the same city extent. Both pull the dataset in the morning, both work against a shared S3 bucket, and both run `sync` at the end of the day. The Nairobi run finishes ninety seconds after Lisbon's. Because the tool wrote the annotation index with an unconditional `PUT` to a fixed key, Nairobi's index overwrites Lisbon's. No error is raised, no exit code is non-zero, and the bucket reports success. The Lisbon team's entire day of GeoJSON — several hundred hand-drawn polygons — is now unreferenced garbage in the object store, discovered only a week later when a reviewer notices the count of labeled tiles has gone *down*.

This failure is not a bug in any one tool. It is the default behaviour of every object store: a write to a key clobbers whatever was there, and there is no built-in notion of "only if you have seen the latest version." This guide, part of the broader [dataset versioning and spatial data sync](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/) practice, shows how to make multi-site annotation sync safe by construction — using content-addressed storage so features never overwrite each other, a manifest diff so divergence is detected before any write, an explicit push/pull ordering so partial uploads never orphan a pointer, and a lease plus generation number so concurrent sites serialize instead of racing.

<svg viewBox="0 0 860 400" role="img" aria-label="Two annotation sites syncing to a shared content-addressed remote with conflict detection on a single manifest pointer" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:860px;display:block;margin:1.5rem auto;">
  <title>Multi-site sync to a content-addressed remote with manifest conflict detection</title>
  <desc>Site A and Site B each compute per-feature content hashes and a local manifest, push immutable objects to a shared object store, and compete to update a single manifest pointer guarded by a generation-number conflict check that admits one writer and rejects the stale one.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <defs>
    <marker id="ar" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor" opacity="0.6"/>
    </marker>
  </defs>
  <!-- Site A -->
  <rect x="12" y="30" width="200" height="110" rx="10" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="112" y="58" text-anchor="middle" font-size="13" font-weight="700" fill="currentColor" font-family="sans-serif">Site A (Lisbon)</text>
  <text x="112" y="80" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.8">hash each feature</text>
  <text x="112" y="98" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace" opacity="0.8">manifest gen=7</text>
  <text x="112" y="120" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.6">base seen: gen=6</text>
  <!-- Site B -->
  <rect x="12" y="258" width="200" height="110" rx="10" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="112" y="286" text-anchor="middle" font-size="13" font-weight="700" fill="currentColor" font-family="sans-serif">Site B (Nairobi)</text>
  <text x="112" y="308" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.8">hash each feature</text>
  <text x="112" y="326" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace" opacity="0.8">manifest gen=7</text>
  <text x="112" y="348" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.6">base seen: gen=6</text>
  <!-- Immutable object store -->
  <rect x="330" y="120" width="210" height="160" rx="10" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="435" y="150" text-anchor="middle" font-size="13" font-weight="700" fill="currentColor" font-family="sans-serif">Content-Addressed</text>
  <text x="435" y="168" text-anchor="middle" font-size="13" font-weight="700" fill="currentColor" font-family="sans-serif">Remote (S3 / GCS)</text>
  <text x="435" y="196" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace" opacity="0.8">objects/&lt;sha256&gt;</text>
  <text x="435" y="214" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.65">write-once, immutable</text>
  <text x="435" y="238" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.65">no object ever clobbered</text>
  <text x="435" y="262" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.65">dedup by hash</text>
  <!-- arrows sites -> store -->
  <line x1="212" y1="90" x2="328" y2="150" stroke="currentColor" stroke-width="1.5" marker-end="url(#ar)" opacity="0.6"/>
  <line x1="212" y1="308" x2="328" y2="250" stroke="currentColor" stroke-width="1.5" marker-end="url(#ar)" opacity="0.6"/>
  <!-- Conflict detector / manifest pointer -->
  <rect x="620" y="120" width="220" height="160" rx="10" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="730" y="150" text-anchor="middle" font-size="13" font-weight="700" fill="currentColor" font-family="sans-serif">Manifest Pointer</text>
  <text x="730" y="172" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.75">conditional write on gen</text>
  <text x="730" y="198" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace" opacity="0.85">A: 6→7 accepted</text>
  <text x="730" y="220" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace" opacity="0.85">B: 6→7 REJECTED</text>
  <text x="730" y="244" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.65">B re-pulls gen=7,</text>
  <text x="730" y="262" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.65">merges, retries 7→8</text>
  <!-- arrow store -> manifest -->
  <line x1="540" y1="200" x2="618" y2="200" stroke="currentColor" stroke-width="1.5" marker-end="url(#ar)" opacity="0.6"/>
</svg>

The rest of this guide builds each piece as runnable Python 3.10+ against pinned dependencies. The techniques compose with [DVC versioning](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/) for large binary assets and with [tracking annotation changes with SHA hashing](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/tracking-annotation-changes-with-sha-hashing/) for the per-feature identity that content addressing depends on.

---

## Prerequisites & Remote Configuration

Content-addressed sync depends on deterministic serialization and a client that can do conditional writes. Pin the toolchain so hashes are reproducible across every site.

**Required Python packages (pinned):**

```bash
pip install dvc==3.51.2 \
            boto3==1.34.128 \
            gcsfs==2024.6.1 \
            geopandas==0.14.4 \
            pyproj==3.6.1 \
            shapely==2.0.6
```

**Remote credentials and endpoints:**

- S3: an IAM role or key pair with `s3:GetObject`, `s3:PutObject`, and `s3:ListBucket`; enable bucket versioning so an accidental pointer overwrite stays recoverable.
- GCS: a service-account JSON keyed for `roles/storage.objectAdmin` on the target bucket, reachable through `gcsfs`.
- Azure Blob: a SAS token or account key scoped to a single container, used through the `adlfs` filesystem if you target Azure.

**Spatial and versioning prerequisites:**

- Every annotation feature carries a stable identifier and a declared coordinate reference system. If features arrive in mixed projections, normalize them first — the first stop for that is [coordinate reference systems in annotation pipelines](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/), and the canonical training projection is usually a local UTM zone rather than [`EPSG:4326`](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/).
- A per-feature content hash. This guide computes one inline, but the durable definition lives in the SHA hashing workflow linked above.

**Baseline checklist before your first multi-site sync:**

- [ ] All sites agree on one canonical CRS for stored labels
- [ ] The GeoJSON serialization is byte-deterministic (sorted keys, fixed coordinate precision)
- [ ] The remote bucket has object versioning enabled for recoverability
- [ ] Exactly one object key is designated the mutable manifest pointer
- [ ] Every site records the manifest generation number it based its edits on

---

## Content-Addressed Sync: Hash Features Before Push

The core move is to stop treating the remote as a mutable folder of files and start treating it as an immutable, content-addressed object store. Each annotation feature is serialized to canonical bytes, hashed, and stored under `objects/<sha256>`. Because the key *is* the content hash, two sites that independently draw the identical polygon produce the identical object — a harmless deduplicated write. Two sites that draw *different* polygons produce *different* keys and can never overwrite each other. All contention collapses onto a single mutable object: the manifest that lists which hashes belong to the current dataset.

Canonicalization is the load-bearing detail. If Site A serializes coordinates to six decimals and Site B to full float64, identical geometry hashes differently and deduplication fails. Fix the precision and sort keys before hashing.

```python
from __future__ import annotations

import hashlib
import json
from typing import Any

COORD_PRECISION = 7  # ~1 cm at the equator; match across all sites


def canonical_feature_bytes(feature: dict[str, Any]) -> bytes:
    """Serialize a GeoJSON feature to deterministic bytes for hashing."""
    def round_coords(obj: Any) -> Any:
        if isinstance(obj, float):
            return round(obj, COORD_PRECISION)
        if isinstance(obj, list):
            return [round_coords(x) for x in obj]
        if isinstance(obj, dict):
            return {k: round_coords(v) for k, v in obj.items()}
        return obj

    normalized = round_coords(feature)
    return json.dumps(
        normalized, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")


def feature_hash(feature: dict[str, Any]) -> str:
    return hashlib.sha256(canonical_feature_bytes(feature)).hexdigest()
```

With a stable hash per feature, building the local manifest is a plain map from feature id to content hash plus the object key. The manifest is the only thing a reviewer needs to reconstruct the exact labeled state.

```python
from dataclasses import dataclass, field


@dataclass
class Manifest:
    generation: int
    features: dict[str, str] = field(default_factory=dict)  # feature_id -> sha256

    def object_keys(self) -> set[str]:
        return {f"objects/{h}" for h in self.features.values()}


def build_manifest(
    features: dict[str, dict[str, Any]], generation: int
) -> Manifest:
    """Map each feature id to the content hash of its canonical bytes."""
    return Manifest(
        generation=generation,
        features={fid: feature_hash(feat) for fid, feat in features.items()},
    )
```

Uploading is now a write-once loop. Skip any object key that already exists — it is, by definition, byte-identical to what you would upload — and push only the missing ones.

```python
import boto3


def push_objects(
    features: dict[str, dict[str, Any]],
    manifest: Manifest,
    bucket: str,
    s3: "boto3.client" = None,
) -> int:
    s3 = s3 or boto3.client("s3")
    uploaded = 0
    for fid, sha in manifest.features.items():
        key = f"objects/{sha}"
        try:
            s3.head_object(Bucket=bucket, Key=key)
            continue  # already present, immutable, identical
        except s3.exceptions.ClientError:
            pass
        body = canonical_feature_bytes(features[fid])
        s3.put_object(Bucket=bucket, Key=key, Body=body)
        uploaded += 1
    return uploaded
```

### Detect Divergence Between Local and Remote Manifests

Before writing anything mutable, download the remote manifest and diff it against the local one. The diff classifies every feature id as added at your site, removed at your site, or *conflicting* — present in both but pointing at different content hashes. A conflict means two sites edited the same feature id since the common base and needs reconciliation rather than a blind overwrite.

```python
@dataclass
class ManifestDiff:
    added: dict[str, str]                 # feature_id -> local hash
    removed: dict[str, str]               # feature_id -> remote hash
    conflicting: dict[str, tuple[str, str]]  # id -> (local, remote)
    unchanged: int


def diff_manifests(local: Manifest, remote: Manifest) -> ManifestDiff:
    added, removed, conflicting = {}, {}, {}
    unchanged = 0
    all_ids = set(local.features) | set(remote.features)
    for fid in all_ids:
        lh = local.features.get(fid)
        rh = remote.features.get(fid)
        if lh == rh:
            unchanged += 1
        elif lh is not None and rh is None:
            added[fid] = lh
        elif lh is None and rh is not None:
            removed[fid] = rh
        else:  # both present, hashes differ
            conflicting[fid] = (lh, rh)
    return ManifestDiff(added, removed, conflicting, unchanged)
```

Because objects are immutable and hashed, a non-empty `conflicting` set is the only case that ever requires human or three-way-merge attention. The mechanics of resolving those cases — feature-id reconciliation and a last-writer-wins guard — are covered in depth in [resolving sync conflicts in distributed annotation](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/syncing-annotations-across-cloud-remotes/resolving-sync-conflicts-in-distributed-annotation/).

### Safe Multi-Remote Push/Pull Ordering

Ordering is what prevents a crash from leaving the dataset half-written. The invariant: the manifest pointer must only ever reference objects that already exist on the remote. That forces a strict sequence — pull and reconcile first, upload immutable content next, and commit the manifest pointer *last*. If the process dies after uploading objects but before committing the pointer, the extra objects are simply unreferenced and harmless; a later garbage-collection pass reclaims them. The reverse ordering — pointer first — would publish a manifest referencing objects that do not yet exist, breaking every reader.

<svg viewBox="0 40 720 208" role="img" aria-label="Push order that keeps the pointer commit valid: objects first, manifest second, pointer last" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>Push in the order that keeps every intermediate state readable</title>
  <desc>Objects go up first, then the manifest that names them, then the pointer commit that names the manifest. At every intermediate moment a reader following the current pointer sees a complete older version. Reversing the order — pointer first — publishes a version whose objects are still uploading, and readers get missing-key errors until the transfer finishes.</desc>
  <rect x="0" y="40" width="720" height="208" style="fill:var(--bg)"/>
  <defs>
    <marker id="po-arr" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor"/>
    </marker>
  </defs>
  <rect x="20" y="60" width="190" height="60" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="115" y="84" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">1 · content objects</text>
  <text x="115" y="102" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">addressed by hash — safe to re-upload</text>
  <line x1="210" y1="90" x2="248" y2="90" stroke="currentColor" stroke-width="1.5" marker-end="url(#po-arr)"/>
  <rect x="250" y="60" width="190" height="60" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="345" y="84" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">2 · manifest</text>
  <text x="345" y="102" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">names objects that already exist</text>
  <line x1="440" y1="90" x2="478" y2="90" stroke="currentColor" stroke-width="1.5" marker-end="url(#po-arr)"/>
  <rect x="480" y="60" width="220" height="60" rx="6" fill="none" stroke="currentColor" stroke-width="2"/>
  <text x="590" y="84" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">3 · pointer commit</text>
  <text x="590" y="102" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">the only step that publishes anything</text>
  <text x="360" y="152" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">at every moment in between, a reader following the pointer gets a complete older version</text>
  <rect x="90" y="176" width="540" height="52" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 3"/>
  <text x="360" y="198" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">reverse it and the pointer names a manifest naming objects still in flight</text>
  <text x="360" y="216" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">readers get missing-key errors for as long as the transfer takes — on a large batch, hours</text>
</svg>

```python
def sync_to_remote(
    local_features: dict[str, dict[str, Any]],
    bucket: str,
    s3: "boto3.client" = None,
) -> Manifest:
    s3 = s3 or boto3.client("s3")

    # 1. Pull the authoritative remote manifest and its generation.
    remote = pull_manifest(bucket, s3)

    # 2. Build the local manifest on top of the remote generation.
    local = build_manifest(local_features, generation=remote.generation)
    diff = diff_manifests(local, remote)
    if diff.conflicting:
        raise SyncConflict(diff.conflicting)  # resolve before proceeding

    # 3. Union the two feature sets and upload MISSING objects first.
    merged_features = {**remote.features, **local.features}
    merged = Manifest(generation=remote.generation, features=merged_features)
    push_objects(local_features, local, bucket, s3)

    # 4. Commit the manifest pointer LAST, guarded by the generation number.
    return commit_manifest(merged, bucket, s3)
```

Multi-remote fan-out (for example S3 as primary and GCS as a disaster-recovery mirror) reuses the same ordering per remote: fully commit the primary, then replicate the immutable objects and finally the manifest to each mirror. Never commit a mirror's pointer before its objects have finished transferring, or a failover read will hit dangling references.

### Coordinate Concurrent Sites With a Lease and Generation Number

The manifest pointer is the single mutable object, so it needs a concurrency guard. Two mechanisms work, and you can layer them. The first is a *monotonic generation number*: a writer records the generation it pulled, and its commit only succeeds if the remote is still at that generation. The second is a short-lived *lease* that gives one site an exclusive window to commit, which reduces wasted retries under heavy contention.

<svg viewBox="0 0 720 280" role="img" aria-label="A lease and generation number serialising two sites that try to publish at the same moment" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>The lease is what stops two sites publishing generation 42</title>
  <desc>Two sites finish work at the same time and both hold generation 41. Site A acquires the lease, writes generation 42 and releases. Site B's acquire fails, so it re-reads, finds 42, rebases its changes onto it and publishes 43. Without the lease both write 42 and the second write silently replaces the first.</desc>
  <rect x="0" y="0" width="100%" height="100%" style="fill:var(--bg)"/>
  <defs>
    <marker id="ls-arr" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor"/>
    </marker>
  </defs>
  <text x="90" y="44" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">site A</text>
  <text x="360" y="44" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">remote</text>
  <text x="630" y="44" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">site B</text>
  <line x1="90" y1="54" x2="90" y2="234" stroke="currentColor" stroke-width="1" opacity="0.4" stroke-dasharray="4 4"/>
  <line x1="360" y1="54" x2="360" y2="234" stroke="currentColor" stroke-width="1" opacity="0.4" stroke-dasharray="4 4"/>
  <line x1="630" y1="54" x2="630" y2="234" stroke="currentColor" stroke-width="1" opacity="0.4" stroke-dasharray="4 4"/>
  <line x1="94" y1="78" x2="352" y2="78" stroke="currentColor" stroke-width="1.5" marker-end="url(#ls-arr)"/>
  <text x="223" y="70" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace">acquire lease @ gen 41</text>
  <line x1="626" y1="104" x2="368" y2="104" stroke="currentColor" stroke-width="1.5" marker-end="url(#ls-arr)"/>
  <text x="497" y="96" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace">acquire lease @ gen 41</text>
  <line x1="356" y1="128" x2="98" y2="128" stroke="currentColor" stroke-width="1.5" marker-end="url(#ls-arr)" opacity="0.6"/>
  <text x="227" y="120" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">granted</text>
  <line x1="364" y1="152" x2="622" y2="152" stroke="currentColor" stroke-width="1.5" marker-end="url(#ls-arr)" opacity="0.6"/>
  <text x="493" y="144" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.8">refused — held by A</text>
  <line x1="94" y1="180" x2="352" y2="180" stroke="currentColor" stroke-width="1.5" marker-end="url(#ls-arr)"/>
  <text x="223" y="172" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace">publish gen 42, release</text>
  <line x1="626" y1="206" x2="368" y2="206" stroke="currentColor" stroke-width="1.5" marker-end="url(#ls-arr)"/>
  <text x="497" y="198" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace">re-read → rebase → publish gen 43</text>
  <rect x="150" y="240" width="420" height="32" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 3"/>
  <text x="360" y="261" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif">without the lease both write gen 42, and B's write erases A's work with no error anywhere</text>
</svg>

Object stores expose a conditional-write primitive that makes the generation check atomic. On S3, `IfMatch` on the pointer's ETag rejects a write if another site has already advanced it; on GCS, `ifGenerationMatch` does the same with the object's native generation number.

```python
import json


class StaleGenerationError(RuntimeError):
    pass


def commit_manifest(
    merged: Manifest, bucket: str, s3: "boto3.client"
) -> Manifest:
    key = "manifest.json"

    # Read the current pointer AND its ETag as the compare-and-swap token.
    head = s3.head_object(Bucket=bucket, Key=key)
    current_etag = head["ETag"]
    current = Manifest(**json.loads(
        s3.get_object(Bucket=bucket, Key=key)["Body"].read()
    ))

    if current.generation != merged.generation:
        raise StaleGenerationError(
            f"remote at gen={current.generation}, expected {merged.generation}"
        )

    merged.generation = current.generation + 1
    body = json.dumps(merged.__dict__, sort_keys=True).encode("utf-8")
    try:
        s3.put_object(
            Bucket=bucket, Key=key, Body=body, IfMatch=current_etag
        )
    except s3.exceptions.ClientError as exc:
        # 412 Precondition Failed => another site committed first.
        raise StaleGenerationError("manifest advanced during commit") from exc
    return merged
```

When `commit_manifest` raises `StaleGenerationError`, the losing site does exactly what the diagram's Site B does: re-pull the now-newer manifest, re-run the diff and merge, and retry. Wrapping that in a bounded retry loop turns a lost-update race into a serialized sequence with no manual intervention.

```python
import random
import time


def sync_with_retry(
    local_features: dict[str, dict[str, Any]],
    bucket: str,
    max_attempts: int = 5,
) -> Manifest:
    for attempt in range(max_attempts):
        try:
            return sync_to_remote(local_features, bucket)
        except StaleGenerationError:
            backoff = (2 ** attempt) * 0.1 + random.uniform(0, 0.1)
            time.sleep(backoff)  # jittered exponential backoff
    raise RuntimeError(f"sync failed after {max_attempts} attempts")
```

A lease is worth adding when many sites commit frequently and backoff retries start to dominate. Store a `lease.json` object holding a holder id and an expiry timestamp; acquire it with the same conditional-write primitive, hold it only for the commit window, and always set an expiry so a crashed holder cannot deadlock the dataset. The generation check remains the real correctness guarantee — the lease is only an optimization that reduces contention.

---

## Remote Behaviour & Sync Parameters Reference

Different object stores offer different consistency guarantees, and the safe conflict strategy follows from them. This table maps each remote to the primitive you rely on.

| Remote type | Consistency model | Conflict strategy | Note |
|---|---|---|---|
| Amazon S3 | Strong read-after-write per key; eventually consistent LIST | `IfMatch` ETag on manifest | Enable bucket versioning for pointer recovery |
| Google Cloud Storage | Strong per-object; metadata generation numbers | `ifGenerationMatch` on manifest | Native generation is a first-class CAS token |
| Azure Blob Storage | Strong per-blob; lease API built in | Blob lease + `If-Match` ETag | Server-side leases simplify the lease step |
| S3-compatible (MinIO/Ceph) | Varies by deployment | ETag CAS if supported, else external lock | Verify conditional writes are honored before trusting them |
| DVC remote (any backend) | Content-addressed by design | Delegate to DVC cache + one manifest | Pairs naturally with the hashing model here |

---

## Edge Cases & Gotchas

### Eventual consistency on bucket listings

S3 gives strong read-after-write for a single key, but a `LIST` of a prefix can lag seconds behind reality. Never decide "which objects exist" from a listing during a sync — resolve existence by exact-key `HEAD` on the hashes named in the manifest. Treating a listing as authoritative is how a reader concludes a just-uploaded object is missing and aborts a valid sync.

### Partial uploads and orphaned objects

A crash mid-upload leaves some `objects/<sha>` present and the pointer unadvanced. The strict push-then-pointer ordering makes this benign: the manifest never referenced the incomplete set, so readers are unaffected. Reclaim the orphans with a periodic mark-and-sweep that lists all object keys, subtracts every hash reachable from the current and recent manifests, and deletes the remainder. Keep a grace window so an in-flight sync is not swept.

### Clock skew across sites

Lease expiry and any "latest wins" tie-break must not trust wall-clock timestamps from different machines — a site whose clock is five minutes fast can steal or prematurely expire a lease. Anchor expiry to the remote's server time (S3 and GCS return authoritative `Date` headers) or to the monotonic generation number, never to a client clock. The generation number is skew-proof precisely because it is a counter, not a time.

### Large COG transfers stalling the pointer commit

When annotations reference large Cloud-Optimized GeoTIFF imagery, uploading a multi-gigabyte object under the manifest window can stall the whole commit. Keep heavy imagery on a content-addressed binary track managed by DVC and let the annotation manifest reference the COG by its stable content hash instead of re-uploading pixels. Use multipart uploads with retry for the imagery, and commit the small annotation pointer only after the multipart upload reports complete — a half-finished multipart upload has no visible key, so it can never be referenced early.

### Feature-id reuse across sites

If two sites mint the same feature id for genuinely different objects, content addressing correctly stores two distinct hashes, but the diff reports a conflict on that id. Prefix feature ids with a site identifier (or a UUID) at creation time so independent work never collides on the id space in the first place.

---

## Integration Hooks

### DVC as the binary and cache backend

DVC already stores tracked files in a content-addressed cache and pushes them to a configured remote, which is the same model this guide applies to annotation features. Let [DVC](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/) own the large raster and vector binaries, and keep the fine-grained per-feature manifest as a small tracked artifact alongside them. A `dvc push` moves the heavy objects; the manifest commit described above coordinates the label-level pointer.

```yaml
# dvc.yaml
stages:
  sync_annotations:
    cmd: python scripts/sync_annotations.py --bucket s3://annos --site lisbon
    deps:
      - scripts/sync_annotations.py
      - data/labels/
    outs:
      - data/manifest.json
```

### SHA hashing as the identity source

The `feature_hash` used here is one concrete instance of the identity scheme described in [tracking annotation changes with SHA hashing](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/tracking-annotation-changes-with-sha-hashing/). Reuse a single canonicalization routine across both workflows so the hash that tracks a change is the same hash that addresses the object — otherwise a feature can be "changed" by one system and "identical" to the other.

### CI push gate

Wire the sync into CI so a merge that would clobber the remote is caught before it runs. The job pulls the remote manifest, runs `diff_manifests`, and fails the build if the branch's base generation is stale relative to the remote.

```yaml
# .github/workflows/sync_gate.yml
name: Annotation sync gate
on: [push, pull_request]
jobs:
  sync-gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: {python-version: "3.11"}
      - run: pip install boto3==1.34.128 geopandas==0.14.4 shapely==2.0.6
      - name: Check manifest divergence
        run: python scripts/check_divergence.py --bucket s3://annos
        env:
          AWS_REGION: eu-west-1
```

---

## Validation & Testing

### Manifest diff assertion

The cheapest guard is asserting that a freshly built local manifest, when diffed against the remote you just committed, reports no conflicts and no surprises.

```python
def assert_clean_sync(
    local_features: dict[str, dict[str, Any]], bucket: str
) -> None:
    remote = pull_manifest(bucket)
    local = build_manifest(local_features, generation=remote.generation)
    diff = diff_manifests(local, remote)
    assert not diff.conflicting, f"unexpected conflicts: {list(diff.conflicting)}"
    assert not diff.added, f"local has unpushed features: {list(diff.added)}"
    print(f"Sync clean: {diff.unchanged} features aligned at gen={remote.generation}")
```

### Roundtrip integrity check

After a commit, re-download the manifest and verify that every referenced object exists and that its stored bytes still hash to the key it lives under. This catches silent truncation, a mismatched precision setting, or an eventual-consistency read that returned a stale body.

```python
import boto3


def verify_roundtrip(bucket: str, s3: "boto3.client" = None) -> None:
    s3 = s3 or boto3.client("s3")
    manifest = pull_manifest(bucket, s3)
    for fid, sha in manifest.features.items():
        key = f"objects/{sha}"
        body = s3.get_object(Bucket=bucket, Key=key)["Body"].read()
        actual = hashlib.sha256(body).hexdigest()
        assert actual == sha, f"corruption on {fid}: {key} hashes to {actual}"
    print(f"Roundtrip verified: {len(manifest.features)} objects intact")
```

### Concurrency race test

Simulate two sites committing against the same base generation and assert that exactly one succeeds while the other raises `StaleGenerationError` and then converges on retry. Running this against a real bucket (or a MinIO container in CI) is the only way to confirm your remote actually honors conditional writes — some S3-compatible backends silently ignore `IfMatch`, which would reintroduce the original clobbering bug.

---

## Frequently Asked Questions

### Why does last-writer-wins silently lose annotations on object stores?

Object stores like S3 and GCS accept an unconditional `PUT` to a key regardless of who wrote it last, so two sites that write the same manifest key overwrite each other with no error. Guard the manifest with a conditional write keyed on a monotonic generation number so a stale writer is rejected instead of clobbering newer labels.

### How does content addressing prevent sync conflicts?

Content addressing stores each feature under a key derived from the hash of its canonical bytes, so identical labels always map to the same immutable object and can never overwrite different content. Conflicts collapse to a single mutable pointer, the manifest, which is the only object that needs coordination.

### Do I need a lock if I already use content-addressed objects?

The immutable objects never need a lock because they are write-once and self-verifying. You only need a lease or a conditional generation bump on the single manifest pointer, which is the one mutable object two sites can race to update.

### How do I handle eventual consistency when reading a manifest back?

Read the manifest and every referenced object by exact key rather than relying on a bucket listing, and verify each object hash on download. S3 offers strong read-after-write consistency on single keys, but bucket listings and cross-region replicas can lag, so never treat a listing as authoritative for a sync decision.

---

## Related

- [Resolving Sync Conflicts in Distributed Annotation](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/syncing-annotations-across-cloud-remotes/resolving-sync-conflicts-in-distributed-annotation/) — three-way merge and feature-id reconciliation when the manifest diff reports a real conflict
- [Implementing DVC for Geospatial Training Data](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/) — the content-addressed binary backend that carries heavy imagery under this sync model
- [Tracking Annotation Changes with SHA Hashing](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/tracking-annotation-changes-with-sha-hashing/) — the per-feature identity scheme that content addressing reuses
- [Rollback Strategies for Corrupted Spatial Datasets](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/rollback-strategies-for-corrupted-spatial-datasets/) — how versioned pointers let you recover when a sync commits bad state
- [Coordinate Reference Systems in Annotation Pipelines](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) — normalizing projections so features hash consistently across sites

This guide is part of the broader [Dataset Versioning & Spatial Data Sync](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/) practice that keeps geospatial training data reproducible from raw labels through to model input.
