/* geospatialannotation.com — client behaviors
   - Mobile nav toggle
   - Copy-to-clipboard buttons on code blocks
   - Mermaid rendering for ```mermaid blocks
   - Auto on-this-page TOC for the article
   - Persist task-list checkbox state per page (in-memory + sessionStorage)
   - Service worker registration
*/

(function () {
  "use strict";

  // ----- Mobile nav toggle -----
  const navToggle = document.querySelector(".nav-toggle");
  const nav = document.getElementById("primary-nav");
  if (navToggle && nav) {
    navToggle.addEventListener("click", () => {
      const open = nav.classList.toggle("is-open");
      navToggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    // Close on link click (mobile)
    nav.addEventListener("click", (e) => {
      if (e.target.tagName === "A" && nav.classList.contains("is-open")) {
        nav.classList.remove("is-open");
        navToggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  // ----- Copy code -----
  document.querySelectorAll(".code-copy").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const block = btn.closest(".code-block");
      const code = block && block.querySelector(".code-block__code");
      if (!code) return;
      const text = code.innerText;
      try {
        await navigator.clipboard.writeText(text);
        const label = btn.querySelector(".code-copy__label");
        const original = label ? label.textContent : "Copy";
        btn.classList.add("is-copied");
        if (label) label.textContent = "Copied";
        setTimeout(() => {
          btn.classList.remove("is-copied");
          if (label) label.textContent = original;
        }, 1600);
      } catch (err) {
        // Fallback: select text
        const range = document.createRange();
        range.selectNodeContents(code);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    });
  });

  // ----- Mermaid -----
  const mermaidNodes = document.querySelectorAll("pre.mermaid");
  if (mermaidNodes.length) {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js";
    s.onload = () => {
      if (window.mermaid) {
        window.mermaid.initialize({
          startOnLoad: false,
          theme: "base",
          themeVariables: {
            background: "#ffffff",
            primaryColor: "#e2f2f9",
            primaryTextColor: "#0e3548",
            primaryBorderColor: "#1f779e",
            lineColor: "#1f779e",
            secondaryColor: "#fff3cc",
            tertiaryColor: "#d3f0ec",
            fontFamily: "ui-sans-serif, system-ui, sans-serif",
          },
        });
        window.mermaid.run({ querySelector: "pre.mermaid" });
      }
    };
    document.head.appendChild(s);
  }

  // ----- Build right-rail TOC from h2/h3 in the article -----
  const toc = document.querySelector(".toc");
  const article = document.querySelector(".article");
  if (toc && article) {
    const headings = article.querySelectorAll("h2[id], h3[id]");
    if (headings.length > 2) {
      const list = document.createElement("ul");
      headings.forEach((h) => {
        const li = document.createElement("li");
        li.className = "toc-" + h.tagName.toLowerCase();
        const a = document.createElement("a");
        a.href = "#" + h.id;
        a.textContent = (h.innerText || h.textContent).replace(/^#\s*/, "").trim();
        li.appendChild(a);
        list.appendChild(li);
      });
      const heading = document.createElement("h4");
      heading.textContent = "On this page";
      toc.appendChild(heading);
      toc.appendChild(list);
    } else {
      toc.remove();
    }
  }

  // ----- Persist task-list checkbox state -----
  const cbs = document.querySelectorAll(".task-list-item-checkbox");
  if (cbs.length) {
    const storageKey = "tlist:" + location.pathname;
    let state = {};
    try { state = JSON.parse(sessionStorage.getItem(storageKey) || "{}"); } catch (e) {}
    cbs.forEach((cb, i) => {
      cb.removeAttribute("disabled");
      cb.disabled = false;
      const key = String(i);
      if (state[key]) cb.checked = true;
      cb.addEventListener("change", () => {
        state[key] = cb.checked;
        try { sessionStorage.setItem(storageKey, JSON.stringify(state)); } catch (e) {}
      });
    });
  }

  // ----- Service worker -----
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  }
})();
