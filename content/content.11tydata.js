const fs = require("fs");

function readMarkdown(inputPath) {
  try { return fs.readFileSync(inputPath, "utf8"); } catch (e) { return ""; }
}

function extractTitle(md) {
  const m = md.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : null;
}

function extractDescription(md) {
  const lines = md.split(/\r?\n/);
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
  const text = buf.join(" ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  // Truncate to 160 chars max (search-snippet length guidance, 50–165 chars), breaking at a word boundary
  if (text.length <= 160) return text;
  const cut = text.slice(0, 160);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 100 ? cut.slice(0, lastSpace) : cut).trimEnd();
}

module.exports = {
  layout: "layouts/content.njk",
  ogType: "article",
  eleventyComputed: {
    permalink: (data) => {
      const stem = data.page.filePathStem;
      const url = stem
        .replace(/^\/content/, "")
        .replace(/\/index$/, "/");
      const cleanUrl = url.endsWith("/") ? url : url + "/";
      return cleanUrl + "index.html";
    },
    pageUrl: (data) => {
      const stem = data.page.filePathStem;
      const url = stem
        .replace(/^\/content/, "")
        .replace(/\/index$/, "/");
      return url.endsWith("/") ? url : url + "/";
    },
    title: (data) => {
      if (data.title) return data.title;
      const md = readMarkdown(data.page.inputPath);
      return extractTitle(md) || "";
    },
    description: (data) => {
      if (data.description) return data.description;
      const md = readMarkdown(data.page.inputPath);
      return extractDescription(md) || "";
    },
  },
};
