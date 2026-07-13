<a href="https://www.geospatialannotation.com/">
  <img src="https://www.geospatialannotation.com/icons/og-image.png" alt="Geospatial Annotation — annotate, version, and ship geospatial ML datasets with confidence" width="100%">
</a>

# Geospatial Annotation &amp; ML Pipeline Automation

**Production-grade guides for building geospatial data annotation pipelines that feed AI/ML training.**

[**Visit the site → www.geospatialannotation.com**](https://www.geospatialannotation.com/)

Geospatial machine learning lives or dies on the quality of its labels. Satellite and drone imagery arrives with heterogeneous projections, multi-spectral bands, and gigabyte-scale extents that generic computer-vision tooling was never designed for. This site is a deep, practitioner-focused reference for the engineers, spatial data scientists, and GIS annotation teams who turn that raw imagery into clean, versioned, model-ready training data — with runnable Python, real coordinate-system handling, and the validation gates that keep a bad batch of labels from ever reaching a training run.

Every guide is written to be used, not skimmed: concept grounding first, then production-ready code with pinned dependency versions, then the spatial-specific failure modes that only show up at scale.

## What you'll find

The material is organized into four connected areas, each with in-depth guides and focused how-tos:

- **[Geospatial Annotation Fundamentals &amp; Architecture](https://www.geospatialannotation.com/geospatial-annotation-fundamentals-architecture/)** — coordinate reference systems, ROI label taxonomies, confidence scoring, vector vs. raster workflows, and the spatial data formats (Cloud-Optimized GeoTIFF, GeoParquet, STAC) that hold a pipeline together.
- **[Labeling Workflows &amp; Toolchain Integration](https://www.geospatialannotation.com/labeling-workflows-toolchain-integration/)** — Label Studio, CVAT, and QGIS integration, model-assisted pre-labeling with foundation models, human review cycles, export-format validation for COCO/YOLO/GeoJSON, and CI/CD gates for annotation datasets.
- **[Dataset Versioning &amp; Spatial Data Sync](https://www.geospatialannotation.com/dataset-versioning-spatial-data-sync/)** — DVC for large imagery, metadata preservation, SHA-based change tracking, cross-remote sync, and rollback strategies for corrupted spatial datasets.
- **[Active Learning &amp; Model Feedback Loops](https://www.geospatialannotation.com/active-learning-model-feedback-loops/)** — uncertainty sampling on spatial tiles, automated retraining triggers, and distribution-drift detection that focuses annotation effort where the model is weakest.

## Why it's useful

- **Runnable, version-pinned code.** Python 3.10+ with explicit type hints, using `geopandas`, `pyproj`, `rasterio`, and `shapely` the way production pipelines actually use them.
- **Coordinate systems taken seriously.** Reprojection, datum-transformation grids, roundtrip testing, and the projection mistakes that silently corrupt IoU scores and training labels.
- **Validation you can wire into CI.** Schema enforcement, geometry checks, and class-balance monitors designed to run as GitHub Actions or DVC pipeline stages.
- **Original, hand-authored diagrams** on every guide, built to stay legible in light and dark themes.

## How the site is built

A fast, dependency-light static site with no client-side framework:

- **[Eleventy](https://www.11ty.dev/)** static site generator, Nunjucks + Markdown.
- Hand-authored inline SVG diagrams; Prism for code highlighting.
- Structured data (Article, BreadcrumbList, HowTo, FAQPage) on every page.
- Deployed on **[Cloudflare Pages](https://pages.cloudflare.com/)**.

### Run it locally

```bash
npm install
npm run serve   # local dev server at http://localhost:8080
npm run build   # production build into _site/
```

## Contributing &amp; commit policy

Commits to this repository are made under a single maintainer identity, and commit messages carry **no co-author trailers**. Please keep that convention if you open a pull request.

## License

Content and code © Geospatial Annotation. All rights reserved.
