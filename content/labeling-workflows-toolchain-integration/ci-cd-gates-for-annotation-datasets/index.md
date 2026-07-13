---
title: "CI/CD Gates for Annotation Datasets"
description: "Build CI/CD gates that block broken geospatial annotations from reaching training: geometry validation, CRS assertions, class-balance checks, and schema enforcement wired into GitHub Actions and DVC pipelines."
slug: "ci-cd-gates-for-annotation-datasets"
type: "guide"
breadcrumb: "Labeling Workflows & Toolchain Integration > CI/CD Gates for Annotation Datasets"
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
      "headline": "CI/CD Gates for Annotation Datasets",
      "description": "Build CI/CD gates that block broken geospatial annotations from reaching training: geometry validation, CRS assertions, class-balance checks, and schema enforcement wired into GitHub Actions and DVC pipelines.",
      "datePublished": "2026-07-13",
      "dateModified": "2026-07-13",
      "author": {"@type": "Organization", "name": "Geospatial Annotation"},
      "publisher": {"@type": "Organization", "name": "Geospatial Annotation"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.geospatialannotation.com/"},
        {"@type": "ListItem", "position": 2, "name": "Labeling Workflows & Toolchain Integration", "item": "https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/"},
        {"@type": "ListItem", "position": 3, "name": "CI/CD Gates for Annotation Datasets", "item": "https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/ci-cd-gates-for-annotation-datasets/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Build a CI/CD Gate for Geospatial Annotation Datasets",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Write a validation script", "text": "Implement a Python entrypoint that runs geometry, CRS, class-balance, and schema checks over changed annotation files and exits non-zero on any error-severity finding."},
        {"@type": "HowToStep", "position": 2, "name": "Trigger the gate on annotation pull requests", "text": "Add a GitHub Actions workflow with a paths filter so the validation job runs only when files under the annotations directory change."},
        {"@type": "HowToStep", "position": 3, "name": "Pull versioned data before validating", "text": "Restore LFS or DVC-tracked assets in the runner so the gate validates real geometry rather than pointer files."},
        {"@type": "HowToStep", "position": 4, "name": "Mirror the gate as a DVC stage", "text": "Register the same validation command as a DVC pipeline stage so local runs and reproducible pipelines enforce identical rules."},
        {"@type": "HowToStep", "position": 5, "name": "Post a summary report", "text": "Write a per-check summary to the workflow step summary and comment it on the pull request so reviewers see exactly what failed."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What should block a merge versus only raise a warning?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Block on defects that silently corrupt training: invalid or empty geometry, a wrong or missing coordinate reference system, and schema violations that break the loader. Downgrade taste-driven or statistical signals such as mild class imbalance or a rise in tiny polygons to warnings, so annotators see the trend without a hard stop that trains them to bypass the gate."
          }
        },
        {
          "@type": "Question",
          "name": "How do I keep the geometry check from failing on valid multipart features?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Test validity with the same predicate your training loader uses. A MultiPolygon of disjoint parts is valid; a bow-tie ring is not. Rely on shapely is_valid plus explain_validity rather than ad hoc part-count heuristics, and treat empty geometries and zero-area polygons as separate, explicit checks so legitimate multipart labels pass."
          }
        },
        {
          "@type": "Question",
          "name": "Should the gate run on every commit or only on pull requests?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run the full gate on pull requests targeting your protected branch, and require it as a status check before merge. On feature-branch commits, run a lighter fast subset for quick feedback. This keeps main protected while avoiding an expensive full data pull on every intermediate push."
          }
        },
        {
          "@type": "Question",
          "name": "How do I stop large imagery checkouts from making the gate flaky?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Validate only the files the pull request changed instead of the whole dataset, cache the DVC or LFS store between runs keyed on the lockfile, and pull the specific paths rather than the full remote. Add a bounded retry around the data-pull step so a single transient network error does not fail an otherwise clean batch."
          }
        }
      ]
    }
  ]
}
</script>

# CI/CD Gates for Annotation Datasets

A junior annotator finishes a batch of 400 building footprints on Friday afternoon, opens a pull request, and a teammate approves it on the strength of a clean visual diff. The merge looks routine. What the diff did not show is that the export tool wrote the footprints in the imagery's native `EPSG:32633` while the rest of the training store is normalized to `EPSG:4326`, and that three of the polygons self-intersect where the annotator clicked back across an existing edge. The nightly retraining job ingests the batch without complaint — the loader happily reads whatever coordinates it finds — and the model quietly loses two points of mean average precision on the validation set. Nobody notices for a week, because nothing gated the batch. By the time the regression is traced back, four more batches have been built on the corrupted convention.

This is the failure mode a CI/CD gate exists to prevent. In software, no one merges code that fails the build; annotation datasets deserve the same discipline. This guide shows how to build an automated gate for the [labeling workflows and toolchain integration](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/) that sit between your annotators and your training queue — a script that runs geometry, coordinate reference system, class-balance, and schema checks, exits non-zero on failure, and blocks the merge until the batch is fixed. You will wire that script into GitHub Actions so it runs on every pull request that touches annotations, mirror it as a reproducible DVC stage, and post a per-check report so reviewers see exactly what broke.

<svg viewBox="0 0 880 200" role="img" aria-label="CI gate pipeline for annotation datasets from pull request through validation to merge or block" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:880px;display:block;margin:1.5rem auto;">
  <title>Annotation CI Gate Pipeline</title>
  <desc>A pull request that touches annotations flows through checkout, dependency install, and a validation stage running geometry, CRS, schema, and class-balance checks; a passing run merges while a failing run blocks the pull request.</desc>
  <defs>
    <marker id="ga" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor" opacity="0.6"/>
    </marker>
  </defs>
  <rect x="8" y="60" width="104" height="66" rx="8" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="60" y="88" text-anchor="middle" font-size="12" font-weight="600" fill="currentColor" font-family="sans-serif">PR touches</text>
  <text x="60" y="106" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.75">annotations</text>
  <rect x="140" y="60" width="96" height="66" rx="8" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="188" y="88" text-anchor="middle" font-size="12" font-weight="600" fill="currentColor" font-family="sans-serif">Checkout</text>
  <text x="188" y="106" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.75">+ LFS / DVC</text>
  <rect x="264" y="60" width="96" height="66" rx="8" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="312" y="88" text-anchor="middle" font-size="12" font-weight="600" fill="currentColor" font-family="sans-serif">Install</text>
  <text x="312" y="106" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.75">pinned deps</text>
  <rect x="388" y="26" width="176" height="134" rx="8" fill="none" stroke="currentColor" stroke-width="1.8" opacity="0.65"/>
  <text x="476" y="50" text-anchor="middle" font-size="13" font-weight="700" fill="currentColor" font-family="sans-serif">Validate gate</text>
  <text x="476" y="76" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace" opacity="0.85">geometry</text>
  <text x="476" y="98" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace" opacity="0.85">CRS</text>
  <text x="476" y="120" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace" opacity="0.85">schema</text>
  <text x="476" y="142" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace" opacity="0.85">class balance</text>
  <rect x="700" y="28" width="164" height="56" rx="8" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="782" y="52" text-anchor="middle" font-size="12" font-weight="600" fill="currentColor" font-family="sans-serif">exit 0 → merge</text>
  <text x="782" y="70" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.75">status check green</text>
  <rect x="700" y="104" width="164" height="56" rx="8" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="782" y="128" text-anchor="middle" font-size="12" font-weight="600" fill="currentColor" font-family="sans-serif">exit 1 → block</text>
  <text x="782" y="146" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.75">merge disabled</text>
  <line x1="112" y1="93" x2="138" y2="93" stroke="currentColor" stroke-width="1.5" marker-end="url(#ga)" opacity="0.6"/>
  <line x1="236" y1="93" x2="262" y2="93" stroke="currentColor" stroke-width="1.5" marker-end="url(#ga)" opacity="0.6"/>
  <line x1="360" y1="93" x2="386" y2="93" stroke="currentColor" stroke-width="1.5" marker-end="url(#ga)" opacity="0.6"/>
  <path d="M564,80 C620,80 640,56 698,56" fill="none" stroke="currentColor" stroke-width="1.5" marker-end="url(#ga)" opacity="0.6"/>
  <path d="M564,106 C620,106 640,132 698,132" fill="none" stroke="currentColor" stroke-width="1.5" marker-end="url(#ga)" opacity="0.6"/>
</svg>

## Prerequisites & Pinned Toolchain

A gate is only trustworthy if it runs the same code with the same library versions on every machine — the CI runner, the reviewer's laptop, and the reproducible pipeline. Pin everything. Floating versions are how a `shapely` minor release quietly changes what counts as a valid geometry and turns a green build red overnight.

Install the validation dependencies from a lockfile-style block:

```bash
pip install \
  shapely==2.0.6 \
  pyproj==3.6.1 \
  geopandas==0.14.4 \
  jsonschema==4.23.0
```

You also need two pieces of infrastructure:

- **GitHub Actions** (or an equivalent CI service) with branch protection enabled on your default branch, so the gate can be marked a *required status check*. Without branch protection the gate reports failures but cannot actually stop a merge.
- **A data layer** that stores the heavy assets outside Git. This guide assumes either Git LFS for imagery or [DVC for versioning geospatial training data](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/implementing-dvc-for-geospatial-training-data/), which keeps multi-gigabyte rasters and their annotation exports content-addressed rather than committed as blobs.

A minimal repository layout the gate expects:

```text
repo/
├── annotations/            # GeoJSON / GeoParquet label files (PRs touch these)
├── schemas/
│   └── feature.schema.json # JSON Schema contract for feature properties
├── scripts/
│   └── validate_annotations.py
├── dvc.yaml
└── .github/workflows/annotation-gate.yml
```

The gate operates on the files under `annotations/`. Every label file is expected to carry a declared [coordinate reference system](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) and a `class` property on each feature that matches your agreed [label taxonomy](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/defining-roi-label-taxonomies-for-aerial-imagery/). Those two contracts are what the checks below enforce.

## Structuring the Four-Check Validation Gate

The gate is a single Python entrypoint that runs four independent checks and aggregates their findings. Each check returns a list of `Issue` records tagged with a severity; the entrypoint decides the exit code from the worst severity it sees. Keeping the checks independent means you can add a fifth later without touching the others, and you can unit-test each in isolation.

Start with the shared vocabulary — an `Issue` dataclass and a severity ranking:

```python
from __future__ import annotations

from dataclasses import dataclass
from enum import IntEnum


class Severity(IntEnum):
    WARNING = 1
    ERROR = 2


@dataclass(frozen=True)
class Issue:
    check: str
    severity: Severity
    feature_id: str | int | None
    message: str
```

### Geometry validity checks with shapely

Invalid geometry is the defect most likely to slip past a visual review and then break rasterization or [IoU threshold calculations](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/calculating-iou-thresholds-for-geospatial-object-detection/) downstream. The check flags three distinct failure classes — topological invalidity, empty geometries, and zero-area polygons — because conflating them produces confusing reports.

```python
import geopandas as gpd
from shapely.validation import explain_validity


def check_geometry(gdf: gpd.GeoDataFrame) -> list[Issue]:
    issues: list[Issue] = []
    for fid, geom in gdf.geometry.items():
        if geom is None or geom.is_empty:
            issues.append(Issue("geometry", Severity.ERROR, fid, "empty or null geometry"))
            continue
        if not geom.is_valid:
            reason = explain_validity(geom)
            issues.append(Issue("geometry", Severity.ERROR, fid, f"invalid: {reason}"))
            continue
        if geom.geom_type in ("Polygon", "MultiPolygon") and geom.area == 0.0:
            issues.append(Issue("geometry", Severity.WARNING, fid, "zero-area polygon"))
    return issues
```

Note the deliberate choice: an invalid ring is an `ERROR` that blocks the merge, but a zero-area polygon is a `WARNING`, because it is occasionally a legitimate degenerate label an annotator will fix on the next pass rather than a corruption.

### CRS assertions with pyproj

The Friday-afternoon bug in the opening scenario was a silent CRS mismatch. The gate asserts that every file declares a CRS and that it matches the pipeline's canonical projection. Comparing normalized EPSG codes is more robust than comparing WKT strings, which differ cosmetically across PROJ versions.

```python
from pyproj import CRS


def check_crs(gdf: gpd.GeoDataFrame, expected_epsg: int) -> list[Issue]:
    if gdf.crs is None:
        return [Issue("crs", Severity.ERROR, None, "no CRS declared on layer")]
    actual = CRS.from_user_input(gdf.crs).to_epsg()
    if actual is None:
        return [Issue("crs", Severity.ERROR, None, "CRS does not resolve to an EPSG code")]
    if actual != expected_epsg:
        return [Issue("crs", Severity.ERROR, None,
                      f"CRS EPSG:{actual} != expected EPSG:{expected_epsg}")]
    return []
```

### Class-balance checks

A batch that is 98% "vehicle" and 2% everything else will not crash training, but it skews the class distribution and is worth surfacing. The check computes per-class frequency and flags any class that falls below a minimum share of the batch. This is a `WARNING` by default — imbalance is a signal, not a corruption — but you can promote it to `ERROR` for classes your model is known to be fragile on.

```python
from collections import Counter


def check_class_balance(
    gdf: gpd.GeoDataFrame,
    class_field: str,
    min_share: float,
) -> list[Issue]:
    if class_field not in gdf.columns:
        return [Issue("balance", Severity.ERROR, None, f"missing '{class_field}' column")]
    counts = Counter(gdf[class_field].dropna())
    total = sum(counts.values())
    if total == 0:
        return [Issue("balance", Severity.ERROR, None, "no labeled features in batch")]
    issues: list[Issue] = []
    for cls, n in counts.items():
        share = n / total
        if share < min_share:
            issues.append(Issue("balance", Severity.WARNING, None,
                                 f"class '{cls}' is {share:.1%} of batch (< {min_share:.0%})"))
    return issues
```

### Schema enforcement with jsonschema

Geometry and CRS guard the spatial layer; JSON Schema guards the attribute layer. A contract in `schemas/feature.schema.json` pins which properties every feature must carry, their types, and their allowed values — for example, that `class` is one of an enumerated taxonomy and `confidence` is a number between 0 and 1. This is where a formal export contract, described in [validating annotation export formats](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/validating-annotation-export-formats/), becomes an executable check.

```python
import json
from pathlib import Path

from jsonschema import Draft202012Validator


def check_schema(gdf: gpd.GeoDataFrame, schema_path: Path) -> list[Issue]:
    schema = json.loads(schema_path.read_text())
    validator = Draft202012Validator(schema)
    issues: list[Issue] = []
    for fid, row in gdf.drop(columns="geometry").iterrows():
        record = {k: (None if v != v else v) for k, v in row.to_dict().items()}
        for err in validator.iter_errors(record):
            path = ".".join(str(p) for p in err.path) or "<root>"
            issues.append(Issue("schema", Severity.ERROR, fid, f"{path}: {err.message}"))
    return issues
```

### The gate entrypoint that exits non-zero

The entrypoint ties the checks together over the files a pull request changed, prints a report, and — critically — exits with a non-zero status when any `ERROR` is present. That exit code is the entire mechanism by which CI blocks the merge.

```python
import argparse
import sys
from pathlib import Path

import geopandas as gpd


def validate_file(path: Path, expected_epsg: int, schema_path: Path,
                  class_field: str, min_share: float) -> list[Issue]:
    gdf = gpd.read_file(path)
    return [
        *check_geometry(gdf),
        *check_crs(gdf, expected_epsg),
        *check_class_balance(gdf, class_field, min_share),
        *check_schema(gdf, schema_path),
    ]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("files", nargs="+", type=Path)
    parser.add_argument("--expected-epsg", type=int, default=4326)
    parser.add_argument("--schema", type=Path, default=Path("schemas/feature.schema.json"))
    parser.add_argument("--class-field", default="class")
    parser.add_argument("--min-share", type=float, default=0.02)
    args = parser.parse_args()

    all_issues: list[Issue] = []
    for path in args.files:
        all_issues.extend(
            validate_file(path, args.expected_epsg, args.schema,
                          args.class_field, args.min_share)
        )

    errors = [i for i in all_issues if i.severity is Severity.ERROR]
    warnings = [i for i in all_issues if i.severity is Severity.WARNING]
    for issue in all_issues:
        tag = issue.severity.name
        print(f"[{tag}] {issue.check} feature={issue.feature_id}: {issue.message}")
    print(f"\n{len(errors)} error(s), {len(warnings)} warning(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
```

Running `python scripts/validate_annotations.py annotations/batch_412.geojson` now prints a labelled report and returns `1` if anything blocks the merge. Everything that follows is about invoking this exact command in the right places.

## Wiring the Gate into GitHub Actions on Annotation Pull Requests

The workflow runs the gate only when a pull request changes files under `annotations/`, using a `paths` filter so unrelated code PRs are not slowed by a data pull. It checks out the branch, restores the versioned data, installs the pinned dependencies, and runs the validation command against the changed files.

```yaml
# .github/workflows/annotation-gate.yml
name: Annotation validation gate
on:
  pull_request:
    paths:
      - "annotations/**"
      - "schemas/**"

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          lfs: true
          fetch-depth: 0

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.11"

      - name: Install pinned dependencies
        run: pip install shapely==2.0.6 pyproj==3.6.1 geopandas==0.14.4 jsonschema==4.23.0

      - name: Determine changed annotation files
        id: changed
        run: |
          git fetch origin "${{ github.base_ref }}" --depth=1
          files=$(git diff --name-only --diff-filter=ACM \
            "origin/${{ github.base_ref }}"...HEAD -- 'annotations/**' | tr '\n' ' ')
          echo "files=$files" >> "$GITHUB_OUTPUT"

      - name: Run validation gate
        if: steps.changed.outputs.files != ''
        run: python scripts/validate_annotations.py ${{ steps.changed.outputs.files }} --expected-epsg 4326
        env:
          PROJ_NETWORK: "ON"
```

Two details make this reliable. The `Determine changed annotation files` step scopes validation to exactly what the pull request touched, so a 30-file batch does not trigger a full-dataset scan. And once the job is added as a required status check in branch-protection settings, a non-zero exit from the gate physically disables the merge button — the corrupted batch cannot reach the training branch until it is green.

## Running the Gate as a DVC Pipeline Stage

CI protects the shared branch, but annotators want the same verdict locally before they push, and reproducible pipelines want it as a tracked dependency. Registering the identical command as a DVC stage gives you both. Because DVC stages are content-addressed, the gate re-runs only when the annotations or the schema actually change.

```yaml
# dvc.yaml
stages:
  validate_annotations:
    cmd: >
      python scripts/validate_annotations.py annotations/*.geojson
      --expected-epsg 4326 --schema schemas/feature.schema.json
    deps:
      - scripts/validate_annotations.py
      - schemas/feature.schema.json
      - annotations
    always_changed: false
```

Running `dvc repro validate_annotations` executes the same checks the CI runner does. Wiring the gate before your training stage in the same `dvc.yaml` means a failing validation halts the pipeline: `dvc repro` stops at the gate and never reaches the training stage, so a bad batch cannot be baked into a snapshot. This mirrors how CI blocks the merge, giving you one rule enforced in two places.

## Posting a Validation Summary to the Pull Request

A red X on a status check tells a reviewer *that* the batch failed, not *why*. Writing a structured summary turns the gate into a teaching tool. GitHub Actions renders anything appended to the `$GITHUB_STEP_SUMMARY` file as Markdown on the run page, and a short step can also comment the report directly on the pull request.

```python
import os
from pathlib import Path


def write_summary(issues: list[Issue]) -> None:
    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if not summary_path:
        return
    lines = ["## Annotation gate report", "", "| Severity | Check | Feature | Message |",
             "|---|---|---|---|"]
    for i in sorted(issues, key=lambda x: -x.severity):
        lines.append(f"| {i.severity.name} | {i.check} | {i.feature_id} | {i.message} |")
    if not issues:
        lines.append("| — | — | — | All checks passed |")
    Path(summary_path).write_text("\n".join(lines) + "\n")
```

To surface the same table as a pull-request comment, pipe it through the GitHub CLI in a final workflow step:

```yaml
      - name: Comment report on PR
        if: always()
        run: gh pr comment "${{ github.event.pull_request.number }}" --body-file report.md
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Now a failing batch produces a per-feature list an annotator can act on directly — "feature 118: invalid: Self-intersection at or near point 6.14, 46.2" — instead of a mysterious build failure.

## Gate Parameters & Severity Reference

The table below summarizes each check, the library that implements it, the condition that trips it, and its default severity. Tune the severities and thresholds to your model's sensitivities rather than accepting these blindly.

| Check | Tool | Failure condition | Default severity |
|---|---|---|---|
| Geometry validity | `shapely` | Self-intersection, null, or empty geometry | Error |
| Zero-area polygon | `shapely` | Polygon or multipolygon with `area == 0` | Warning |
| CRS declared | `pyproj` | Layer has no CRS or CRS lacks an EPSG code | Error |
| CRS match | `pyproj` | EPSG code differs from canonical projection | Error |
| Class balance | `geopandas` / `Counter` | A class falls below `min_share` of the batch | Warning |
| Schema conformance | `jsonschema` | Property missing, wrong type, or out of enum | Error |
| Empty batch | `geopandas` | Zero labeled features in a changed file | Error |

## Edge Cases & Gotchas

**Flaky large-file checkouts.** Cloning a repository with gigabytes of imagery on every run is slow and occasionally times out. Scope the checkout and validation to the changed paths, and cache the data layer between runs keyed on the DVC lockfile hash. A gate that pulls only the tiles a pull request touched runs in seconds and rarely flakes.

**LFS and DVC pull in CI.** If you forget `lfs: true` on the checkout — or forget an explicit `dvc pull` before validating — the runner sees pointer files, not real geometry. `geopandas.read_file` then either errors on a text pointer or, worse, reads a stale cached copy and passes a batch that would fail on real data. Always restore the actual assets before the validation step, and prefer `dvc pull annotations` to a full-remote pull so you fetch only what the gate needs.

**False positives from make_valid repairs.** It is tempting to auto-repair geometry in the gate with `buffer(0)` or `make_valid` and then validate the repaired result. Resist it in the gate itself. A repair can silently change a polygon's area or split it into parts, so a batch that "passes" after repair is not the batch the annotator drew. Keep the gate read-only: it reports invalidity and blocks the merge, and repair happens as a deliberate, reviewed commit — not an invisible CI side effect.

**Threshold tuning.** A `min_share` set too high fails every small specialist batch and trains annotators to ignore the gate; set too low, it never fires. Start permissive, watch which warnings recur over a few weeks, and tighten from evidence. The same applies to promoting balance or zero-area findings from warning to error — do it per class, driven by which classes your model actually regresses on, not uniformly.

## Validation & Testing

The gate is code, so it needs its own tests. Feed it deliberately broken fixtures and assert the exit code and the issues, so a future refactor cannot silently weaken a check.

```python
import geopandas as gpd
from shapely.geometry import Polygon


def test_bowtie_polygon_is_error() -> None:
    bowtie = Polygon([(0, 0), (1, 1), (1, 0), (0, 1)])  # self-intersecting
    gdf = gpd.GeoDataFrame({"class": ["road"]}, geometry=[bowtie], crs="EPSG:4326")
    issues = check_geometry(gdf)
    assert any(i.severity is Severity.ERROR and i.check == "geometry" for i in issues)


def test_wrong_crs_is_error() -> None:
    poly = Polygon([(0, 0), (0, 1), (1, 1), (1, 0)])
    gdf = gpd.GeoDataFrame({"class": ["road"]}, geometry=[poly], crs="EPSG:3857")
    issues = check_crs(gdf, expected_epsg=4326)
    assert issues and issues[0].severity is Severity.ERROR
```

Complement the unit tests with an end-to-end smoke run that invokes the entrypoint on a known-bad file and asserts a non-zero return:

```python
import subprocess


def test_entrypoint_blocks_bad_batch() -> None:
    result = subprocess.run(
        ["python", "scripts/validate_annotations.py", "tests/fixtures/bad_batch.geojson"],
        capture_output=True, text=True,
    )
    assert result.returncode == 1
    assert "ERROR" in result.stdout
```

Pin these tests into the same CI workflow, and pair the gate with content-addressed change detection so it re-runs only when a batch truly changes. The techniques in [tracking annotation changes with SHA hashing](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/tracking-annotation-changes-with-sha-hashing/) give you stable per-batch hashes, letting the gate skip untouched files and making its verdicts reproducible across machines and re-exports.

## Frequently Asked Questions

### What should block a merge versus only raise a warning?

Block on defects that silently corrupt training: invalid or empty geometry, a wrong or missing coordinate reference system, and schema violations that break the loader. Downgrade taste-driven or statistical signals such as mild class imbalance or a rise in tiny polygons to warnings, so annotators see the trend without a hard stop that trains them to bypass the gate.

### How do I keep the geometry check from failing on valid multipart features?

Test validity with the same predicate your training loader uses. A MultiPolygon of disjoint parts is valid; a bow-tie ring is not. Rely on shapely is_valid plus explain_validity rather than ad hoc part-count heuristics, and treat empty geometries and zero-area polygons as separate, explicit checks so legitimate multipart labels pass.

### Should the gate run on every commit or only on pull requests?

Run the full gate on pull requests targeting your protected branch, and require it as a status check before merge. On feature-branch commits, run a lighter fast subset for quick feedback. This keeps main protected while avoiding an expensive full data pull on every intermediate push.

### How do I stop large imagery checkouts from making the gate flaky?

Validate only the files the pull request changed instead of the whole dataset, cache the DVC or LFS store between runs keyed on the lockfile, and pull the specific paths rather than the full remote. Add a bounded retry around the data-pull step so a single transient network error does not fail an otherwise clean batch.

## Related

- [A GitHub Actions Geometry Validation Gate](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/ci-cd-gates-for-annotation-datasets/github-actions-geometry-validation-gate/) — a complete, copy-ready workflow focused on catching self-intersections, zero-area polygons, and CRS mismatches on every pull request
- [Validating Annotation Export Formats: COCO, YOLO, and GeoJSON](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/validating-annotation-export-formats/) — the schema contracts and format checks your gate enforces before training
- [Tracking Annotation Changes with SHA Hashing](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/tracking-annotation-changes-with-sha-hashing/) — content-addressed change detection that lets the gate re-run only on batches that actually changed
- [Coordinate Reference Systems in Annotation Pipelines](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) — the CRS normalization rules the gate's projection assertions depend on

This guide is part of the broader [Labeling Workflows & Toolchain Integration for Geospatial AI](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/) topic area, which connects annotation tooling to the automated pipelines that turn labels into trained models.
