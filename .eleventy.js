const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const markdownIt = require("markdown-it");
const markdownItAnchor = require("markdown-it-anchor");
const markdownItAttrs = require("markdown-it-attrs");
const markdownItTaskLists = require("markdown-it-task-lists");
const Prism = require("prismjs");
require("prismjs/components/prism-python");
require("prismjs/components/prism-bash");
require("prismjs/components/prism-yaml");
require("prismjs/components/prism-json");
require("prismjs/components/prism-sql");
require("prismjs/components/prism-docker");

const SITE_TITLE = "Geospatial Annotation & ML Pipeline Automation";

// ---------- Slugify ----------
function slugify(s) {
  return String(s)
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ---------- Build markdown-it ----------
const md = markdownIt({
  html: true,
  linkify: false,
  typographer: true,
  breaks: false,
  highlight: function (code, lang) {
    const language = (lang || "").toLowerCase().trim();
    if (language === "mermaid") {
      // Render as a mermaid block; the client-side script renders it.
      return `<pre class="mermaid">${escapeHtml(code)}</pre>`;
    }
    let highlighted;
    if (language && Prism.languages[language]) {
      try {
        highlighted = Prism.highlight(code, Prism.languages[language], language);
      } catch (e) {
        highlighted = escapeHtml(code);
      }
    } else {
      highlighted = escapeHtml(code);
    }
    const langLabel = language ? `<span class="code-lang">${language}</span>` : "";
    // The copy button is added in post-processing because markdown-it doesn't
    // give us a wrapper hook here. We return raw and wrap later.
    return `<!--CODEBLOCK:${language}-->${highlighted}<!--/CODEBLOCK-->`;
  },
});

md.use(markdownItAnchor, {
  slugify,
  permalink: markdownItAnchor.permalink.linkInsideHeader({
    symbol: "<span aria-hidden=\"true\" class=\"anchor-symbol\">#</span>",
    placement: "before",
    ariaHidden: false,
    renderAttrs: (slug, state) => {
      // Extract plain-text heading so the link has a meaningful accessible name.
      const tokens = state.tokens;
      const idx = tokens.findIndex(t => t.type === "heading_open" && t.attrGet("id") === slug);
      let headingText = slug;
      if (idx !== -1 && tokens[idx + 1]) {
        headingText = (tokens[idx + 1].children || [])
          .filter(t => t.type === "text" || t.type === "code_inline")
          .map(t => t.content)
          .join("") || slug;
      }
      return { "aria-label": `Permalink to section "${headingText}"` };
    },
  }),
  level: [2, 3, 4],
});

md.use(markdownItAttrs);
md.use(markdownItTaskLists, { enabled: true, label: true, labelAfter: true });

// Wrap tables in a scroll container
const defaultTableOpen = md.renderer.rules.table_open ||
  function (tokens, idx, options, env, self) { return self.renderToken(tokens, idx, options); };
const defaultTableClose = md.renderer.rules.table_close ||
  function (tokens, idx, options, env, self) { return self.renderToken(tokens, idx, options); };

md.renderer.rules.table_open = function (tokens, idx, options, env, self) {
  return '<div class="table-scroll" tabindex="0">' + defaultTableOpen(tokens, idx, options, env, self);
};
md.renderer.rules.table_close = function (tokens, idx, options, env, self) {
  return defaultTableClose(tokens, idx, options, env, self) + "</div>";
};

// Style inline code with a class hook
const defaultInlineCode = md.renderer.rules.code_inline;
md.renderer.rules.code_inline = function (tokens, idx, options, env, self) {
  const token = tokens[idx];
  return `<code class="inline-code">${escapeHtml(token.content)}</code>`;
};

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---------- Post-processing ----------
// Wrap code blocks with a header + copy button.
function postProcessCodeBlocks(html) {
  return html.replace(
    /<pre><code[^>]*><!--CODEBLOCK:([^>]*?)-->([\s\S]*?)<!--\/CODEBLOCK--><\/code><\/pre>/g,
    (m, lang, code) => {
      const langClass = lang ? ` language-${lang}` : "";
      const label = lang ? `<span class="code-lang">${lang}</span>` : `<span class="code-lang">code</span>`;
      return `<div class="code-block">
  <div class="code-block__head">
    ${label}
    <button type="button" class="code-copy" aria-label="Copy code to clipboard">
      <span class="code-copy__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
      </span>
      <span class="code-copy__label">Copy</span>
    </button>
  </div>
  <pre class="code-block__pre" tabindex="0"><code class="code-block__code${langClass}">${code}</code></pre>
</div>`;
    }
  );
}

// Detect FAQ-style sections (h2 containing "FAQ" or "Frequently Asked Questions")
// and render Q/A as accordions. Q is the next-level heading (h3); A is content
// until the next h3 or until the next h2.
function transformFaqSections(html) {
  // Find <h2 ...>...FAQ...</h2> blocks and wrap the following content until next <h2>.
  const h2Re = /<h2([^>]*)>([\s\S]*?)<\/h2>/g;
  const sections = [];
  let m;
  while ((m = h2Re.exec(html)) !== null) {
    sections.push({ index: m.index, full: m[0], attrs: m[1], inner: m[2], end: h2Re.lastIndex });
  }
  if (!sections.length) return html;

  const isFaq = (s) => /faq|frequently\s+asked\s+question/i.test(s.inner.replace(/<[^>]+>/g, ""));
  let out = html;
  // Walk in reverse so substring replacement indexes remain valid.
  for (let i = sections.length - 1; i >= 0; i--) {
    const s = sections[i];
    if (!isFaq(s)) continue;
    const next = sections[i + 1];
    const sectionStart = s.end;
    const sectionEnd = next ? next.index : html.length;
    const sectionBody = html.slice(sectionStart, sectionEnd);
    const accordion = buildAccordion(sectionBody);
    out = out.slice(0, sectionStart) + accordion + out.slice(sectionEnd);
  }
  return out;
}

function buildAccordion(sectionBody) {
  // Split sectionBody by <h3>...<h3> boundaries.
  const parts = sectionBody.split(/(<h3[^>]*>[\s\S]*?<\/h3>)/g);
  // parts: [pre, h3, body, h3, body, ...]
  let head = parts.shift() || "";
  let html = head;
  if (parts.length === 0) return sectionBody;
  html += '<div class="faq">';
  for (let i = 0; i < parts.length; i += 2) {
    const h3 = parts[i] || "";
    const body = parts[i + 1] || "";
    const questionText = h3.replace(/<[^>]+>/g, "").trim();
    html += `<details class="faq-item"><summary class="faq-item__q">${escapeHtml(questionText)}<span class="faq-item__chev" aria-hidden="true">+</span></summary><div class="faq-item__a">${body}</div></details>`;
  }
  html += "</div>";
  return html;
}

// Add scroll-margin to in-page anchor targets (handled in CSS).
function addAnchorBehavior(html) {
  return html; // CSS handles it via scroll-margin-top on h2,h3,h4
}

// ---------- Site navigation data ----------
const CONTENT_ROOT = path.join(__dirname, "content");

function readFirstHeading(filePath) {
  try {
    const text = fs.readFileSync(filePath, "utf8");
    const m = text.match(/^#\s+(.+)$/m);
    return m ? m[1].trim() : path.basename(path.dirname(filePath));
  } catch (e) {
    return path.basename(path.dirname(filePath));
  }
}

function readFirstParagraph(filePath) {
  try {
    const text = fs.readFileSync(filePath, "utf8");
    const lines = text.split(/\r?\n/);
    let started = false;
    const buf = [];
    for (const line of lines) {
      if (!started) {
        if (/^#\s+/.test(line)) { started = true; continue; }
        continue;
      }
      if (/^\s*$/.test(line)) { if (buf.length) break; else continue; }
      if (/^#/.test(line)) break;
      buf.push(line.trim());
    }
    return stripMd(buf.join(" ")).slice(0, 320);
  } catch (e) { return ""; }
}

function stripMd(s) {
  return s
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildTree(dir, urlPath = "/") {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const node = { url: urlPath, children: [] };
  const indexFile = path.join(dir, "index.md");
  if (fs.existsSync(indexFile)) {
    node.title = readFirstHeading(indexFile);
    node.description = readFirstParagraph(indexFile);
  } else {
    node.title = path.basename(dir);
  }
  for (const ent of entries) {
    if (ent.isDirectory()) {
      const childUrl = urlPath.endsWith("/")
        ? `${urlPath}${ent.name}/`
        : `${urlPath}/${ent.name}/`;
      node.children.push(buildTree(path.join(dir, ent.name), childUrl));
    }
  }
  // Sort children by title
  node.children.sort((a, b) => a.title.localeCompare(b.title));
  return node;
}

// ---------- Eleventy ----------
module.exports = function (eleventyConfig) {
  eleventyConfig.setLibrary("md", md);

  // Pass through static assets and PWA files
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addPassthroughCopy({ "src/static": "/" });

  // Watch
  eleventyConfig.addWatchTarget("src/assets/");
  eleventyConfig.addWatchTarget("content/");

  // Ignore noise from the project root since input is "."
  eleventyConfig.ignores.add("node_modules/**");
  eleventyConfig.ignores.add("_site/**");
  eleventyConfig.ignores.add("README.md");
  eleventyConfig.ignores.add("CHECKLIST.md");
  eleventyConfig.ignores.add("CLAUDE.md");
  eleventyConfig.ignores.add("site_description_and_requirements.md");
  eleventyConfig.ignores.add("package.json");
  eleventyConfig.ignores.add("package-lock.json");
  eleventyConfig.ignores.add("_plan/**");

  // Global data: nav tree
  eleventyConfig.addGlobalData("siteTitle", SITE_TITLE);
  eleventyConfig.addGlobalData("siteBrand", "GeoAnnotation");
  eleventyConfig.addGlobalData("siteUrl", "https://www.geospatialannotation.com");
  eleventyConfig.addGlobalData("buildTime", () => new Date().toISOString());
  eleventyConfig.addGlobalData("currentYear", new Date().getFullYear());

  const tree = {
    title: SITE_TITLE,
    url: "/",
    children: fs.readdirSync(CONTENT_ROOT, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => buildTree(path.join(CONTENT_ROOT, e.name), `/${e.name}/`))
      .sort((a, b) => a.title.localeCompare(b.title)),
  };
  eleventyConfig.addGlobalData("navTree", tree);

  // Filter: find a node in the tree by URL
  eleventyConfig.addFilter("findNode", (root, url) => {
    function walk(n) {
      if (n.url === url) return n;
      for (const c of n.children || []) {
        const found = walk(c);
        if (found) return found;
      }
      return null;
    }
    return walk(root);
  });

  // Filter: breadcrumb trail for a URL
  eleventyConfig.addFilter("breadcrumbs", (root, url) => {
    const segs = url.replace(/^\/|\/$/g, "").split("/").filter(Boolean);
    const trail = [{ title: "Home", url: "/" }];
    let acc = "/";
    let node = root;
    for (const seg of segs) {
      acc += `${seg}/`;
      const child = (node.children || []).find(c => c.url === acc);
      if (child) {
        trail.push({ title: child.title, url: child.url });
        node = child;
      } else {
        trail.push({ title: seg, url: acc });
      }
    }
    return trail;
  });

  // Filter: parent node of a URL
  eleventyConfig.addFilter("parentOf", (root, url) => {
    const trimmed = url.replace(/\/$/, "");
    const parentUrl = trimmed.substring(0, trimmed.lastIndexOf("/") + 1);
    function walk(n) {
      if (n.url === parentUrl) return n;
      for (const c of n.children || []) {
        const f = walk(c);
        if (f) return f;
      }
      return null;
    }
    return walk(root);
  });

  // Filter: sibling nodes (children of parent excluding self)
  eleventyConfig.addFilter("siblings", (root, url) => {
    const trimmed = url.replace(/\/$/, "");
    const parentUrl = trimmed.substring(0, trimmed.lastIndexOf("/") + 1);
    function walk(n) {
      if (n.url === parentUrl) return n;
      for (const c of n.children || []) {
        const f = walk(c);
        if (f) return f;
      }
      return null;
    }
    const parent = walk(root);
    if (!parent) return [];
    return (parent.children || []).filter(c => c.url !== url);
  });

  // Filter: top-level section for a URL (e.g. /a/b/c/ -> /a/)
  eleventyConfig.addFilter("topSection", (url) => {
    const m = url.match(/^\/([^\/]+)\//);
    return m ? `/${m[1]}/` : "/";
  });

  // Filter: cache-bust asset URLs by appending a short content hash as ?v=<hash>
  // Assets are stored under src/assets/ and served at /assets/*.
  eleventyConfig.addFilter("assetHash", (url) => {
    try {
      const filePath = path.join(__dirname, "src", url.replace(/^\//, "").split("?")[0]);
      const hash = crypto.createHash("md5").update(fs.readFileSync(filePath)).digest("hex").slice(0, 8);
      return `${url}?v=${hash}`;
    } catch {
      return url;
    }
  });

  // Transform: post-process HTML for code blocks + FAQ accordions
  eleventyConfig.addTransform("postProcess", function (content) {
    if (this.page && this.page.outputPath && this.page.outputPath.endsWith(".html")) {
      let out = content;
      out = postProcessCodeBlocks(out);
      out = transformFaqSections(out);
      out = addAnchorBehavior(out);
      return out;
    }
    return content;
  });

  return {
    dir: {
      input: ".",
      includes: "src/_includes",
      data: "src/_data",
      output: "_site",
    },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
    templateFormats: ["md", "njk", "html", "11ty.js"],
  };
};
