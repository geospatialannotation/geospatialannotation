# Syncing QGIS Edits to Cloud Annotation Platforms

Syncing QGIS edits to cloud annotation platforms requires a deterministic export-transform-upload pipeline that preserves geometry topology, enforces schema compliance, and handles API rate limits. The production-ready approach leverages QGIS’s embedded Python environment (`PyQGIS`) to extract active edits, converts them to a platform-agnostic intermediate format, normalizes attributes to match your target annotation schema, and pushes payloads via authenticated REST endpoints with idempotency controls. This eliminates manual CSV/shapefile handoffs and keeps your [Labeling Workflows & Toolchain Integration](/labeling-workflows-toolchain-integration/) synchronized with automated validation gates.

### Core Pipeline Architecture
A reliable sync operation follows three strict phases. Skipping any step introduces data drift or silent failures in downstream ML training loops.

1. **Extract:** Pull only modified features from the active QGIS editing session using `QgsVectorLayerEditBuffer`. Querying the full layer on every sync generates redundant payloads, increases network overhead, and risks overwriting concurrent annotations.
2. **Transform:** Re-project geometries to `EPSG:4326` (WGS 84), flatten nested attribute structures, and explicitly map QGIS field names to the cloud platform’s expected schema. Most ML annotation engines reject mixed coordinate reference systems or non-standard geometry encodings.
3. **Upload:** Batch `POST` payloads with exponential backoff, attach per-request idempotency keys, and reconcile conflicts using platform-specific version tokens. Wrap all network calls in retry logic to gracefully handle transient `429` (rate limit) and `5xx` (server) errors.

Cloud annotation systems rarely accept native QGIS `.qgz` or `.shp` formats. They expect structured JSON payloads with explicit coordinate arrays, label dictionaries, and metadata tags. Bypassing format conversion causes silent geometry corruption or outright batch rejection.

### Production-Ready PyQGIS Implementation
The following script runs directly in the QGIS Python Console or as a standalone module. It extracts pending edits, transforms coordinates, batches records, and uploads via REST with built-in retry logic.

```python
import json
import math
import time
import uuid
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from qgis.core import (
    QgsProject, QgsCoordinateTransform, QgsCoordinateReferenceSystem
)

# Configuration
TARGET_API_URL = "https://api.your-platform.com/v1/annotations/batch"
AUTH_TOKEN = "YOUR_API_KEY"
BATCH_SIZE = 50
LAYER_NAME = "annotation_edits"

def setup_session():
    session = requests.Session()
    retry_strategy = Retry(
        total=3,
        backoff_factor=1.5,
        status_forcelist=[429, 500, 502, 503, 504]
    )
    session.mount("https://", HTTPAdapter(max_retries=retry_strategy))
    session.headers.update({
        "Authorization": f"Bearer {AUTH_TOKEN}",
        "Content-Type": "application/json"
    })
    return session

def transform_geometry(geom, source_crs):
    if not geom or geom.isEmpty():
        return None
    target_crs = QgsCoordinateReferenceSystem("EPSG:4326")
    transform = QgsCoordinateTransform(source_crs, target_crs, QgsProject.instance())
    geom.transform(transform)
    return json.loads(geom.asJson())

def sanitize_value(v):
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None
    return v

def sync_qgis_edits_to_cloud():
    layers = QgsProject.instance().mapLayersByName(LAYER_NAME)
    if not layers:
        raise RuntimeError(f"Layer '{LAYER_NAME}' not found in project.")
    layer = layers[0]
    
    if not layer.isEditable():
        raise RuntimeError(f"Layer '{LAYER_NAME}' must be in edit mode to capture pending changes.")

    edit_buffer = layer.editBuffer()
    changed_ids = list(edit_buffer.changedAttributeValues().keys())
    added_ids = list(edit_buffer.addedFeatures().keys())
    target_ids = list(set(changed_ids + added_ids))

    if not target_ids:
        print("No pending edits detected.")
        return

    source_crs = layer.crs()
    payload_batch = []
    session = setup_session()

    for fid in target_ids:
        feature = layer.getFeature(fid)
        if not feature.isValid():
            continue

        geom_dict = transform_geometry(feature.geometry(), source_crs)
        if not geom_dict:
            continue

        attributes = {
            field.name(): sanitize_value(feature[field.name()]) 
            for field in layer.fields()
        }
        
        record = {
            "id": str(fid),
            "geometry": geom_dict,
            "properties": attributes,
            "sync_timestamp": time.time()
        }
        payload_batch.append(record)

        if len(payload_batch) >= BATCH_SIZE:
            headers = {"Idempotency-Key": str(uuid.uuid4())}
            response = session.post(TARGET_API_URL, json={"features": payload_batch}, headers=headers)
            response.raise_for_status()
            print(f"Uploaded batch of {len(payload_batch)} features. Status: {response.status_code}")
            payload_batch.clear()

    if payload_batch:
        headers = {"Idempotency-Key": str(uuid.uuid4())}
        response = session.post(TARGET_API_URL, json={"features": payload_batch}, headers=headers)
        response.raise_for_status()
        print(f"Final batch uploaded: {len(payload_batch)} features.")

    print("Sync complete.")
```

**Key implementation notes:**
- `QgsCoordinateTransform` handles CRS conversion in-memory without writing intermediate files.
- `sanitize_value()` strips `NaN` floats that break JSON serialization in strict ML parsers.
- Per-batch `Idempotency-Key` headers prevent duplicate ingestion if network retries fire.
- The script relies on the [QGIS PyQGIS Developer Cookbook](https://docs.qgis.org/latest/en/docs/pyqgis_developer_cookbook/) for stable layer and geometry APIs.

### Schema Mapping & Validation
Cloud platforms enforce strict JSON schemas. Before uploading, verify that attribute names, data types, and geometry structures align with the target specification. The [GeoJSON specification](https://geojson.org/) defines the standard coordinate ordering (`[longitude, latitude]`) and polygon ring closure rules that most annotation APIs expect.

Automated validation should run immediately after the transform phase. Reject malformed records before they hit the network, log the feature IDs, and surface warnings in the QGIS message log. This feedback loop is critical for maintaining data quality across [Human-in-the-Loop Validation Cycles](/labeling-workflows-toolchain-integration/human-in-the-loop-validation-cycles/), where annotators correct edge cases and feed refined labels back into the training dataset.

### Deployment & Automation Best Practices
- **Trigger Sync on Commit:** Hook the sync function to `QgsVectorLayer.committedChanges` signals to automate uploads when users save edits.
- **Credential Management:** Never hardcode tokens. Use QGIS authentication configurations (`QgsAuthManager`) or environment variables injected at runtime.
- **Delta Tracking:** Maintain a local SQLite log of synced feature IDs and timestamps. This enables incremental recovery if the pipeline fails mid-batch.
- **Rate Limit Awareness:** Respect platform `X-RateLimit-Remaining` headers. Implement a sliding window delay if the API returns `429 Too Many Requests`.
- **Geometry Validation:** Run `QgsGeometryValidator` on transformed features before batching. Self-intersecting polygons or unclosed rings will cause downstream annotation rendering failures.

By standardizing the extract-transform-upload sequence and embedding idempotent network controls, teams can safely bridge desktop GIS editing with cloud-native ML annotation pipelines.