/* geospatialannotation.com — client behaviors
   - Light/dark theme toggle (persisted; follows the OS preference until chosen)
   - Mobile nav toggle
   - Copy-to-clipboard buttons on code blocks
   - Mermaid rendering for ```mermaid blocks
   - Auto on-this-page TOC for the article
   - Persist task-list checkbox state per page (in-memory + sessionStorage)
   - Service worker registration
*/

(function () {
  "use strict";

  // ----- Theme toggle -----
  // The <head> script has already applied any stored choice. Here we only label the
  // control for the theme it will switch TO, and record the reader's choice. With no
  // stored choice the attribute stays off the root so the OS preference keeps control.
  const themeToggle = document.querySelector("[data-theme-toggle]");
  if (themeToggle) {
    const root = document.documentElement;
    const osDark = window.matchMedia
      ? window.matchMedia("(prefers-color-scheme: dark)")
      : { matches: false, addEventListener: () => {} };

    const isDark = () => {
      const explicit = root.getAttribute("data-theme");
      return explicit ? explicit === "dark" : osDark.matches;
    };
    const label = () => {
      const next = isDark() ? "light" : "dark";
      themeToggle.setAttribute("aria-label", "Switch to " + next + " theme");
      themeToggle.setAttribute("title", "Switch to " + next + " theme");
      themeToggle.setAttribute("aria-pressed", isDark() ? "true" : "false");
    };

    label();
    themeToggle.addEventListener("click", () => {
      const next = isDark() ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("theme", next); } catch (e) { /* private mode */ }
      label();
    });
    // Track the OS while the reader has not picked a side.
    if (osDark.addEventListener) {
      osDark.addEventListener("change", () => {
        if (!root.getAttribute("data-theme")) label();
      });
    }
  }

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

  // ----- FAQ accordions -----
  // Authored FAQs ship as plain markup under a "Frequently Asked Questions" <h2>:
  // a question paragraph `<p><strong>Q?</strong> …</p>` (answer may continue in the
  // same <p> or follow in one or more sibling <p>/list elements until the next
  // question). This rewrites each Q/A pair into a styled <details> accordion the
  // site CSS targets (.faq / .faq-item / .faq-item__q / .faq-item__chev / .faq-item__a).
  // The question is wrapped in a single <span> so the flex `space-between` summary
  // keeps the whole question as one item (inline <code>/<em> can't fragment the row).
  function initFAQAccordions() {
    const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
    const cleanQ = (s) => norm(s).replace(/[\s#¶]+$/, "");
    const isFaqHead = (h) => {
      if (h.tagName !== "H2") return false;
      const t = cleanQ(h.textContent).toLowerCase().replace(/^[\s#¶]+/, "");
      return /^frequently asked questions?$/.test(t);
    };
    // A question paragraph: <p> whose first element child is <strong> ending in "?".
    const questionStrong = (el) => {
      if (!el || el.tagName !== "P") return null;
      const strong = el.firstElementChild;
      if (!strong || strong.tagName !== "STRONG") return null;
      return cleanQ(strong.textContent).endsWith("?") ? strong : null;
    };

    const heads = [...document.querySelectorAll("h2")].filter(isFaqHead);
    heads.forEach((head) => {
      // Collect the FAQ region: every sibling up to the next <h2> or <hr>.
      const region = [];
      let el = head.nextElementSibling;
      while (el && el.tagName !== "H2" && el.tagName !== "HR") {
        region.push(el);
        el = el.nextElementSibling;
      }
      // Group into [questionStrong, [answer nodes…]] items.
      const items = [];
      let current = null;
      for (const node of region) {
        const strong = questionStrong(node);
        if (strong) {
          current = { strong, qPara: node, answers: [] };
          items.push(current);
        } else if (current) {
          current.answers.push(node);
        }
      }
      if (!items.length) return;

      const faq = document.createElement("div");
      faq.className = "faq";

      items.forEach((item) => {
        const details = document.createElement("details");
        details.className = "faq-item";

        const summary = document.createElement("summary");
        summary.className = "faq-item__q";
        const qSpan = document.createElement("span");
        qSpan.className = "faq-item__q-text";
        // Move the question's inline content (everything inside <strong>) into the span.
        while (item.strong.firstChild) qSpan.appendChild(item.strong.firstChild);
        const chev = document.createElement("span");
        chev.className = "faq-item__chev";
        chev.setAttribute("aria-hidden", "true");
        chev.textContent = "+";
        summary.appendChild(qSpan);
        summary.appendChild(chev);
        details.appendChild(summary);

        const answer = document.createElement("div");
        answer.className = "faq-item__a";
        // Same-paragraph answer: whatever remains in the question <p> after the <strong>.
        // (Separate-paragraph FAQs leave the <p> empty once the question moves out — drop it.)
        item.strong.remove();
        if (norm(item.qPara.textContent).length) {
          answer.appendChild(item.qPara);
        } else {
          item.qPara.remove();
        }
        // Sibling answer nodes.
        item.answers.forEach((n) => answer.appendChild(n));
        details.appendChild(answer);

        faq.appendChild(details);
      });

      // Insert the accordion immediately after the FAQ heading. The consumed
      // question/answer nodes were moved into `faq`, so nothing is duplicated; any
      // node we didn't consume (e.g. a trailing <hr>) stays where it was.
      head.parentNode.insertBefore(faq, head.nextSibling);
    });
  }
  initFAQAccordions();

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
