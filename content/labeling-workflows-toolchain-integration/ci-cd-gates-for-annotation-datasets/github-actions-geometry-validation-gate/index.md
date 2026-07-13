---
title: "A GitHub Actions Geometry Validation Gate"
description: "A complete GitHub Actions workflow that validates annotation geometry on every pull request — self-intersections, zero-area polygons, and CRS mismatches — failing the build with an annotated report."
slug: "github-actions-geometry-validation-gate"
type: "long_tail"
breadcrumb:
  - label: "Home"
    url: "/"
  - label: "Labeling Workflows & Toolchain Integration for Geospatial AI"
    url: "/labeling-workflows-toolchain-integration/"
  - label: "CI/CD Gates for Annotation Datasets"
    url: "/labeling-workflows-toolchain-integration/ci-cd-gates-for-annotation-datasets/"
  - label: "A GitHub Actions Geometry Validation Gate"
    url: "/labeling-workflows-toolchain-integration/ci-cd-gates-for-annotation-datasets/github-actions-geometry-validation-gate/"
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
      "headline": "A GitHub Actions Geometry Validation Gate",
      "description": "A complete GitHub Actions workflow that validates annotation geometry on every pull request — self-intersections, zero-area polygons, and CRS mismatches — failing the build with an annotated report.",
      "datePublished": "2026-07-13",
      "dateModified": "2026-07-13",
      "author": {"@type": "Organization", "name": "Geospatial Annotation"},
      "publisher": {"@type": "Organization", "name": "Geospatial Annotation"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://geospatialannotation.com/"},
        {"@type": "ListItem", "position": 2, "name": "Labeling Workflows & Toolchain Integration for Geospatial AI", "item": "https://geospatialannotation.com/labeling-workflows-toolchain-integration/"},
        {"@type": "ListItem", "position": 3, "name": "CI/CD Gates for Annotation Datasets", "item": "https://geospatialannotation.com/labeling-workflows-toolchain-integration/ci-cd-gates-for-annotation-datasets/"},
        {"@type": "ListItem", "position": 4, "name": "A GitHub Actions Geometry Validation Gate", "item": "https://geospatialannotation.com/labeling-workflows-toolchain-integration/ci-cd-gates-for-annotation-datasets/github-actions-geometry-validation-gate/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Build a GitHub Actions geometry validation gate for annotation datasets",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Write the geometry validator", "text": "Author a Python 3.10+ script that loads every changed GeoJSON with geopandas, checks each geometry for self-intersection, zero area, and CRS mismatch, and collects a list of violations with feature identifiers."},
        {"@type": "HowToStep", "position": 2, "name": "Emit a Markdown step summary", "text": "Append a Markdown table of failing features to the file named by the GITHUB_STEP_SUMMARY environment variable so reviewers see exactly which features broke and why."},
        {"@type": "HowToStep", "position": 3, "name": "Return a meaningful exit code", "text": "Exit with status 1 when any violation is found and status 0 when the dataset is clean, so the CI step succeeds or fails on the validator's verdict."},
        {"@type": "HowToStep", "position": 4, "name": "Wire up the workflow with path filters", "text": "Add a GitHub Actions workflow triggered on pull_request with a paths filter of '**/*.geojson' that checks out the code, installs shapely and geopandas, and runs the validator against the changed files."},
        {"@type": "HowToStep", "position": 5, "name": "Make the check required", "text": "In branch protection settings, mark the workflow's job as a required status check so a pull request cannot merge while geometry validation is failing."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why validate annotation geometry in CI instead of at training time?",
          "acceptedAnswer": {"@type": "Answer", "text": "Catching a self-intersecting polygon at training time means the corrupt feature already merged to the main branch, propagated to a versioned dataset, and possibly trained a checkpoint before anyone noticed. A pull-request gate rejects the geometry while it is still an isolated diff owned by one annotator, so the fix is a one-line edit rather than a dataset rollback and a retraining run."}
        },
        {
          "@type": "Question",
          "name": "How does the gate detect a CRS mismatch?",
          "acceptedAnswer": {"@type": "Answer", "text": "The validator reads each GeoJSON's declared CRS through geopandas and compares it against an expected authority code such as EPSG:4326. It also range-checks coordinate values: longitude and latitude that fall outside plausible degree bounds while the file claims a geographic CRS signal that the data was written in a projected metric CRS but mislabeled, which is the most common silent mismatch."}
        },
        {
          "@type": "Question",
          "name": "Will the workflow run on pull requests that do not touch GeoJSON?",
          "acceptedAnswer": {"@type": "Answer", "text": "No. The paths filter of '**/*.geojson' means GitHub Actions only starts the workflow when at least one changed file matches that glob. Pull requests that touch only code, documentation, or configuration skip the gate entirely, so the check adds no latency to unrelated work."}
        },
        {
          "@type": "Question",
          "name": "How do I make the geometry gate block merges rather than just warn?",
          "acceptedAnswer": {"@type": "Answer", "text": "A failing job only warns until you mark it as a required status check in the repository's branch protection rules. Once required, GitHub disables the merge button while the geometry validation job reports failure, so a pull request with a broken polygon cannot reach the protected branch regardless of approvals."}
        }
      ]
    }
  ]
}
</script>

# A GitHub Actions Geometry Validation Gate

A geometry validation gate is a GitHub Actions job that runs on any pull request touching a `*.geojson` file, checks out the branch, installs `shapely` and `geopandas`, and runs a validator that flags self-intersections, zero-area polygons, and CRS mismatches. When it finds a broken feature it fails the check and writes a Markdown step summary, so a reviewer opening the pull request sees exactly which feature identifiers are invalid and why — before the geometry ever reaches a training set. This guide gives you the validator, the full workflow YAML with path filters, and the branch-protection step that turns the job into a hard merge blocker.

## Why a Pull-Request Gate Beats Training-Time Validation

Broken annotation geometry rarely announces itself. A bowtie polygon still renders, a zero-area sliver still serializes to valid JSON, and a layer written in a metric projection but tagged as WGS84 loads without complaint. The corruption only surfaces downstream: `shapely` returns an empty intersection during evaluation, a rasterizer emits an all-background mask, or reprojected coordinates land in the ocean. By then the feature has merged, propagated into a versioned snapshot, and possibly trained a checkpoint.

Moving the check to the pull request inverts that cost. The invalid feature is still an isolated diff attributed to one annotator, the fix is a single edit, and no dataset rollback or retraining is required. This is the same shift-left logic behind [validating annotation export formats](/labeling-workflows-toolchain-integration/validating-annotation-export-formats/) at the schema level — geometry validation is the topological half of the same contract. Where schema checks confirm the JSON is shaped correctly, the geometry gate confirms the shapes themselves are usable.

<svg viewBox="0 0 760 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Flow diagram: a pull request passes through a GeoJSON path filter, then a geometry validator, which writes a step summary and either passes or blocks the merge" style="width:100%;max-width:760px;display:block;margin:1.5rem auto;">
  <title>Geometry validation gate flow in GitHub Actions</title>
  <desc>A pull request enters a path filter matching GeoJSON files. Matching pull requests run the validator, which writes a Markdown step summary and returns an exit code. Exit code zero passes the check; exit code one blocks the merge.</desc>
  <defs>
    <marker id="ga-arrow" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto">
      <polygon points="0 0, 9 3.5, 0 7" fill="currentColor" opacity="0.5"/>
    </marker>
  </defs>
  <!-- PR -->
  <rect x="10" y="74" width="104" height="52" rx="8" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-width="1.5" opacity="0.85"/>
  <text x="62" y="97" text-anchor="middle" font-size="12" fill="currentColor" opacity="0.9" font-family="sans-serif">Pull request</text>
  <text x="62" y="113" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.55" font-family="sans-serif">diff of features</text>
  <!-- Path filter -->
  <rect x="150" y="74" width="118" height="52" rx="8" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="209" y="93" text-anchor="middle" font-size="12" fill="currentColor" opacity="0.9" font-family="sans-serif">Path filter</text>
  <text x="209" y="109" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.55" font-family="sans-serif">**/*.geojson</text>
  <text x="209" y="121" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.4" font-family="sans-serif">else: skip</text>
  <!-- Validate -->
  <rect x="304" y="74" width="118" height="52" rx="8" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="363" y="93" text-anchor="middle" font-size="12" fill="currentColor" opacity="0.9" font-family="sans-serif">Validate</text>
  <text x="363" y="109" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.55" font-family="sans-serif">shapely + geopandas</text>
  <text x="363" y="121" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.4" font-family="sans-serif">self-∩ · area · CRS</text>
  <!-- Step summary -->
  <rect x="458" y="74" width="118" height="52" rx="8" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="517" y="93" text-anchor="middle" font-size="12" fill="currentColor" opacity="0.9" font-family="sans-serif">Step summary</text>
  <text x="517" y="109" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.55" font-family="sans-serif">Markdown table</text>
  <text x="517" y="121" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.4" font-family="sans-serif">$GITHUB_STEP_SUMMARY</text>
  <!-- Pass -->
  <rect x="618" y="40" width="128" height="44" rx="8" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <text x="682" y="59" text-anchor="middle" font-size="12" fill="currentColor" opacity="0.9" font-family="sans-serif">Pass — merge ok</text>
  <text x="682" y="74" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.5" font-family="sans-serif">exit 0</text>
  <!-- Block -->
  <rect x="618" y="116" width="128" height="44" rx="8" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-width="1.5" opacity="0.85"/>
  <text x="682" y="135" text-anchor="middle" font-size="12" fill="currentColor" opacity="0.9" font-family="sans-serif">Block merge</text>
  <text x="682" y="150" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.5" font-family="sans-serif">exit 1</text>
  <!-- Arrows -->
  <line x1="114" y1="100" x2="148" y2="100" stroke="currentColor" stroke-width="1.5" opacity="0.5" marker-end="url(#ga-arrow)"/>
  <line x1="268" y1="100" x2="302" y2="100" stroke="currentColor" stroke-width="1.5" opacity="0.5" marker-end="url(#ga-arrow)"/>
  <line x1="422" y1="100" x2="456" y2="100" stroke="currentColor" stroke-width="1.5" opacity="0.5" marker-end="url(#ga-arrow)"/>
  <line x1="576" y1="90" x2="616" y2="66" stroke="currentColor" stroke-width="1.5" opacity="0.5" marker-end="url(#ga-arrow)"/>
  <line x1="576" y1="110" x2="616" y2="134" stroke="currentColor" stroke-width="1.5" opacity="0.5" marker-end="url(#ga-arrow)"/>
</svg>

## Building the Geometry Validator

Install the packages the gate depends on. Pin exact versions so a CI runner cannot silently upgrade `shapely` and change topology behaviour underneath you:

```bash
pip install shapely==2.0.6 geopandas==0.14.4 pyproj==3.6.1
```

The validator loads each file with `geopandas`, iterates its features, and records a violation for every geometry that fails a check. It returns the violation list so the caller decides how to report and what exit code to emit:

```python
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import geopandas as gpd
from shapely.geometry.base import BaseGeometry

EXPECTED_EPSG: int = 4326
MIN_AREA_DEG2: float = 1e-12  # anything smaller is a degenerate sliver


@dataclass(frozen=True)
class Violation:
    file: str
    feature_id: str
    rule: str
    detail: str


def validate_geometry(geom: BaseGeometry | None, fid: str, path: Path) -> list[Violation]:
    """Return every geometry violation for a single feature."""
    problems: list[Violation] = []
    name = path.name

    if geom is None or geom.is_empty:
        problems.append(Violation(name, fid, "empty-geometry", "feature has no geometry"))
        return problems

    if not geom.is_valid:
        # shapely reports the failing coordinate for self-intersections
        from shapely.validation import explain_validity
        problems.append(Violation(name, fid, "self-intersection", explain_validity(geom)))

    if geom.geom_type in ("Polygon", "MultiPolygon") and geom.area < MIN_AREA_DEG2:
        problems.append(Violation(name, fid, "zero-area", f"area={geom.area:.3e} deg²"))

    return problems


def validate_file(path: Path) -> list[Violation]:
    """Load a GeoJSON and validate its CRS plus every feature geometry."""
    frame = gpd.read_file(path)
    problems: list[Violation] = []

    epsg = frame.crs.to_epsg() if frame.crs is not None else None
    if epsg != EXPECTED_EPSG:
        problems.append(
            Violation(path.name, "-", "crs-mismatch", f"declared EPSG:{epsg}, expected EPSG:{EXPECTED_EPSG}")
        )

    for idx, geom in enumerate(frame.geometry):
        fid = str(frame.index[idx])
        problems.extend(validate_geometry(geom, fid, path))

    return problems
```

The first `EPSG:4326` reference above is the WGS84 [coordinate reference system](/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) that most web-tile annotation exports declare. The `crs-mismatch` rule is deliberately strict: a file whose declared CRS is not the expected authority code is rejected outright, because a wrong CRS silently poisons every downstream reprojection and area computation.

The reporting layer converts violations into a Markdown table, appends it to the file named by `$GITHUB_STEP_SUMMARY`, and chooses the exit code. Writing to that file is how a job publishes rich output on its summary page:

```python
import os
import sys
from pathlib import Path


def write_summary(violations: list[Violation]) -> None:
    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_path is None:
        return

    lines: list[str] = ["## Geometry validation", ""]
    if not violations:
        lines.append("All changed GeoJSON features passed geometry validation.")
    else:
        lines.append(f"**{len(violations)} violation(s) found.**")
        lines.append("")
        lines.append("| File | Feature | Rule | Detail |")
        lines.append("|---|---|---|---|")
        for v in violations:
            lines.append(f"| `{v.file}` | `{v.feature_id}` | {v.rule} | {v.detail} |")

    Path(summary_path).write_text("\n".join(lines) + "\n", encoding="utf-8")


def main(paths: list[str]) -> int:
    all_violations: list[Violation] = []
    for p in paths:
        all_violations.extend(validate_file(Path(p)))

    write_summary(all_violations)
    return 1 if all_violations else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
```

The `return 1 if all_violations else 0` line is the entire contract with GitHub Actions: a non-zero exit fails the step, and a failed step fails the job. Everything else — the table, the feature identifiers, the rule names — is there to make the failure legible to a human reviewer rather than a wall of stack traces.

## The Full Workflow with Path Filters

The workflow triggers only on pull requests that change a GeoJSON file. The `paths` filter is what keeps the gate off unrelated pull requests; without it the job runs on every push and wastes runner minutes. Save this as `.github/workflows/geometry-gate.yml`:

```yaml
name: Geometry validation gate

on:
  pull_request:
    paths:
      - "**/*.geojson"

jobs:
  validate-geometry:
    name: Validate annotation geometry
    runs-on: ubuntu-latest
    steps:
      - name: Check out pull request
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.10"

      - name: Install geometry dependencies
        run: pip install shapely==2.0.6 geopandas==0.14.4 pyproj==3.6.1

      - name: Collect changed GeoJSON files
        id: changed
        run: |
          git fetch origin "${{ github.base_ref }}" --depth=1
          files=$(git diff --name-only "origin/${{ github.base_ref }}"...HEAD -- '**/*.geojson')
          echo "files<<EOF" >> "$GITHUB_OUTPUT"
          echo "$files" >> "$GITHUB_OUTPUT"
          echo "EOF" >> "$GITHUB_OUTPUT"

      - name: Run geometry validator
        if: steps.changed.outputs.files != ''
        run: |
          echo "${{ steps.changed.outputs.files }}" | xargs python scripts/validate_geometry.py
```

Two details matter for correctness. `fetch-depth: 0` gives the checkout enough history for the `git diff` against the base branch to resolve; a shallow clone would leave `origin/${{ github.base_ref }}` unreachable. And validating only the *changed* GeoJSON, rather than every file in the repository, keeps runtime proportional to the diff — a one-feature edit does not re-scan a million-feature archive.

## Checks, Failure Conditions, and Making the Gate Required

The validator enforces four rules. Each maps to a concrete failure mode that corrupts training if it slips through:

| Check | Failure condition | Rule name | Consequence if unblocked |
|---|---|---|---|
| Non-empty geometry | Feature geometry is `None` or `is_empty` | `empty-geometry` | Blank mask; skipped sample degrades class balance |
| Topological validity | `geom.is_valid` is false (bowtie, unclosed ring) | `self-intersection` | Empty `.intersection()` at eval; silent zero IoU |
| Positive area | Polygon area below `1e-12 deg²` | `zero-area` | Sliver rasterizes to nothing; wasted annotation |
| CRS agreement | Declared EPSG differs from expected authority code | `crs-mismatch` | Reprojection lands features off-target; whole file suspect |

A job that fails on these conditions still only warns until you promote it to a required status check. Open the repository's **Settings → Branches**, add or edit the branch protection rule for your default branch, enable **Require status checks to pass before merging**, and select **Validate annotation geometry** from the list of recent checks. GitHub only lists a check after it has run at least once, so open a throwaway pull request that touches a GeoJSON if the name does not appear. Once required, the merge button is disabled while the job reports failure — approvals cannot override it, and the broken polygon never reaches the protected branch.

## Common Errors and Fixes

**Workflow never runs on a pull request that added a GeoJSON**
Root cause: the file lives in a path the glob does not match, or the pull request came from a fork with restricted `pull_request` permissions.
Fix: confirm the glob is `"**/*.geojson"` (double star matches nested directories) and that the added file has the `.geojson` extension, not `.json`.

**`fatal: origin/main...HEAD: no merge base` in the changed-files step**
Root cause: a shallow checkout left the base branch history unavailable to `git diff`.
Fix: set `fetch-depth: 0` on `actions/checkout`, and keep the explicit `git fetch origin "${{ github.base_ref }}"` before the diff.

**Every file reports `crs-mismatch` even though the data looks correct**
Root cause: `geopandas` read a CRS-less GeoJSON as `None`, or the file declares a projected CRS while the expected code is geographic.
Fix: confirm the export writes a CRS, then set `EXPECTED_EPSG` to the authority code your pipeline actually standardises on rather than assuming `4326`.

**Validator passes locally but the step summary is empty in CI**
Root cause: the script wrote to a hard-coded path instead of the runner-provided `$GITHUB_STEP_SUMMARY` location.
Fix: always resolve `os.environ["GITHUB_STEP_SUMMARY"]` at runtime — it points to a per-step file that GitHub renders on the job page.

**`shapely.errors.GEOSException` while calling `is_valid` on a `MultiPolygon`**
Root cause: a shapely 1.x geometry object was deserialized into a 2.x runtime.
Fix: pin `shapely==2.0.6`, and let `geopandas==0.14.4` construct geometries from the raw GeoJSON rather than reusing pickled 1.x objects.

## Related

- [Validating Annotation Export Formats: COCO, YOLO, and GeoJSON](/labeling-workflows-toolchain-integration/validating-annotation-export-formats/) — the schema-contract half of the same gate, confirming the JSON is shaped correctly before topology is checked
- [CI/CD Gates for Annotation Datasets](/labeling-workflows-toolchain-integration/ci-cd-gates-for-annotation-datasets/) — the parent guide covering geometry, CRS, class-balance, and schema gates wired into GitHub Actions and DVC pipelines
- [Coordinate Reference Systems in Annotation Pipelines](/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/) — how the `crs-mismatch` rule fits a pipeline-wide CRS contract, including datum handling and reprojection patterns
- [Calculating IoU Thresholds for Geospatial Object Detection](/geospatial-annotation-fundamentals-architecture/coordinate-reference-systems-in-annotation-pipelines/calculating-iou-thresholds-for-geospatial-object-detection/) — why an invalid or zero-area geometry silently collapses IoU evaluation downstream

This guide is one gate within the broader [CI/CD Gates for Annotation Datasets](/labeling-workflows-toolchain-integration/ci-cd-gates-for-annotation-datasets/) topic area, itself part of [Labeling Workflows & Toolchain Integration for Geospatial AI](/labeling-workflows-toolchain-integration/).
