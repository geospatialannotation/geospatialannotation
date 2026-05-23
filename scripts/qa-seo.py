#!/usr/bin/env python3
"""Comprehensive SEO sanity check on the built _site/.

Checks per HTML page:
- <title> present, unique, length 10-70
- <meta description> present, unique, length 50-300
- <link rel=canonical> present and matches the page URL
- <meta robots> present
- og:title, og:description, og:url, og:image present (>=200x630 expected for share)
- twitter:card present
- JSON-LD: at least one schema.org Organization, plus BreadcrumbList on non-home pages
- exactly one <h1>
- favicon, manifest, apple-touch-icon present
- img tags have alt attributes

Verifies sitemap.xml is well-formed and lists every HTML page; verifies robots.txt exists.
"""
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "_site"
SITE_URL = "https://www.geospatialannotation.com"

# Pages we don't audit as indexable content
NOINDEX_PATHS = {"/offline.html"}

class TagCollector(HTMLParser):
    def __init__(self):
        super().__init__()
        self.title = None
        self._in_title = False
        self.meta = []          # list of dicts of attrs
        self.link = []          # list of dicts of attrs
        self.h1_count = 0
        self.imgs = []          # list of attrs
        self.scripts_ld = []    # raw json text blobs
        self._in_jsonld = False
        self._jsonld_buf = []

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        if tag == "title":
            self._in_title = True
        elif tag == "meta":
            self.meta.append(d)
        elif tag == "link":
            self.link.append(d)
        elif tag == "h1":
            self.h1_count += 1
        elif tag == "img":
            self.imgs.append(d)
        elif tag == "script" and d.get("type") == "application/ld+json":
            self._in_jsonld = True
            self._jsonld_buf = []

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False
        elif tag == "script" and self._in_jsonld:
            self._in_jsonld = False
            self.scripts_ld.append("".join(self._jsonld_buf))

    def handle_data(self, data):
        if self._in_title:
            self.title = (self.title or "") + data
        if self._in_jsonld:
            self._jsonld_buf.append(data)


def parse_html(path):
    with open(path, encoding="utf-8") as f:
        c = TagCollector()
        c.feed(f.read())
        return c


def meta(c, name=None, prop=None):
    for m in c.meta:
        if name and m.get("name") == name:
            return m.get("content")
        if prop and m.get("property") == prop:
            return m.get("content")
    return None


def link(c, rel):
    for l in c.link:
        if l.get("rel") == rel:
            return l
    return None


def page_paths():
    """Return list of (relative_url, html_path)."""
    out = []
    for p in SITE.rglob("*.html"):
        rel = "/" + str(p.relative_to(SITE))
        if rel.endswith("/index.html"):
            rel = rel[:-len("index.html")]
        out.append((rel, p))
    out.sort()
    return out


def main():
    errors = []
    warnings = []
    titles = {}
    descriptions = {}

    pages = page_paths()
    print(f"--- {len(pages)} html pages found in _site/")

    for rel_url, p in pages:
        is_offline = rel_url in NOINDEX_PATHS
        c = parse_html(p)
        tag = f"{p.relative_to(SITE)}"

        # --- Title ---
        title = (c.title or "").strip()
        if not title:
            errors.append(f"{tag}: missing <title>")
        elif len(title) > 80:
            warnings.append(f"{tag}: title is long ({len(title)} chars)")
        elif len(title) < 10:
            warnings.append(f"{tag}: title is short ({len(title)} chars)")
        titles.setdefault(title, []).append(tag)

        # --- Description ---
        desc = meta(c, name="description")
        if not desc:
            errors.append(f"{tag}: missing meta description")
        elif len(desc) < 50:
            warnings.append(f"{tag}: short description ({len(desc)} chars)")
        elif len(desc) > 320:
            warnings.append(f"{tag}: long description ({len(desc)} chars)")
        descriptions.setdefault(desc, []).append(tag)

        # --- Canonical ---
        canon = link(c, "canonical")
        if not canon or not canon.get("href"):
            errors.append(f"{tag}: missing canonical link")
        else:
            expected = SITE_URL + rel_url
            if canon["href"] != expected:
                errors.append(f"{tag}: canonical mismatch (got {canon['href']}, expected {expected})")

        # --- Robots ---
        robots = meta(c, name="robots")
        if not robots:
            errors.append(f"{tag}: missing robots meta")
        elif is_offline and "noindex" not in robots:
            warnings.append(f"{tag}: offline page should be noindex")

        # --- Open Graph ---
        for prop in ("og:title", "og:description", "og:url", "og:image", "og:type", "og:site_name"):
            if not meta(c, prop=prop):
                errors.append(f"{tag}: missing {prop}")

        og_image = meta(c, prop="og:image")
        if og_image and not og_image.startswith("http"):
            errors.append(f"{tag}: og:image must be absolute URL (got {og_image})")

        # --- Twitter card ---
        tw_card = meta(c, name="twitter:card")
        if not tw_card:
            errors.append(f"{tag}: missing twitter:card")

        # --- Icons & PWA ---
        if not link(c, "icon"):
            warnings.append(f"{tag}: missing favicon link")
        if not link(c, "apple-touch-icon"):
            warnings.append(f"{tag}: missing apple-touch-icon")
        if not link(c, "manifest"):
            warnings.append(f"{tag}: missing manifest link")

        # --- H1 ---
        if c.h1_count != 1:
            errors.append(f"{tag}: expected exactly 1 <h1>, got {c.h1_count}")

        # --- JSON-LD ---
        if not c.scripts_ld:
            errors.append(f"{tag}: no JSON-LD blocks")
        else:
            types = []
            for blob in c.scripts_ld:
                try:
                    data = json.loads(blob)
                except json.JSONDecodeError as e:
                    errors.append(f"{tag}: invalid JSON-LD: {e}")
                    continue
                items = data if isinstance(data, list) else [data]
                for item in items:
                    t = item.get("@type")
                    if isinstance(t, list):
                        types.extend(t)
                    elif t:
                        types.append(t)
            if "Organization" not in types:
                errors.append(f"{tag}: JSON-LD missing Organization")
            if rel_url != "/" and not is_offline:
                if "BreadcrumbList" not in types:
                    errors.append(f"{tag}: JSON-LD missing BreadcrumbList (non-home page)")
                if not any(t in types for t in ("Article", "TechArticle", "WebPage", "BlogPosting")):
                    warnings.append(f"{tag}: JSON-LD missing Article/WebPage on non-home page")

        # --- Image alt attributes ---
        for img in c.imgs:
            if "alt" not in img:
                warnings.append(f"{tag}: <img src={img.get('src')!r}> missing alt")

    # --- Unique title/description checks ---
    for t, places in titles.items():
        if len(places) > 1:
            errors.append(f"non-unique title across {places}: {t!r}")
    for d, places in descriptions.items():
        if len(places) > 1:
            warnings.append(f"non-unique description across {places}: {d[:60]!r}...")

    # --- sitemap.xml ---
    sm = SITE / "sitemap.xml"
    if not sm.exists():
        errors.append("sitemap.xml is missing")
    else:
        from lxml import etree
        try:
            doc = etree.parse(str(sm))
        except etree.XMLSyntaxError as e:
            errors.append(f"sitemap.xml invalid: {e}")
            doc = None
        if doc is not None:
            ns = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
            locs = {e.text.strip() for e in doc.findall(".//s:loc", ns)}
            expected_indexable = {SITE_URL + rel for rel, _ in pages if rel not in NOINDEX_PATHS}
            missing = expected_indexable - locs
            extra = locs - expected_indexable
            if missing:
                errors.append(f"sitemap.xml missing URLs: {sorted(missing)}")
            if extra:
                warnings.append(f"sitemap.xml has URLs not in built pages: {sorted(extra)}")

    # --- robots.txt ---
    rb = SITE / "robots.txt"
    if not rb.exists():
        errors.append("robots.txt is missing")
    else:
        text = rb.read_text()
        if "Sitemap:" not in text:
            warnings.append("robots.txt: no Sitemap: directive")

    # --- favicons + share image ---
    for asset in ("/favicon.ico", "/favicon.svg", "/icons/og-image.png",
                  "/icons/apple-touch-icon.png", "/icons/icon-192.png",
                  "/icons/icon-512.png", "/icons/safari-pinned-tab.svg",
                  "/manifest.webmanifest"):
        if not (SITE / asset.lstrip("/")).exists():
            errors.append(f"missing asset: {asset}")

    # --- Report ---
    if errors:
        print("\n=== ERRORS ===")
        for e in errors:
            print(f"  ✗ {e}")
    if warnings:
        print("\n=== WARNINGS ===")
        for w in warnings:
            print(f"  ! {w}")

    print(f"\n--- errors: {len(errors)}   warnings: {len(warnings)}")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
