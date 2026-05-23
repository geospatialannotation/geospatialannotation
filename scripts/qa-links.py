#!/usr/bin/env python3
"""QA external links in content/*.md.

Extract every http/https URL from markdown link syntax, then probe each one
with HEAD (falling back to GET) and report failures.
"""
import re
import sys
import urllib.request
import urllib.error
import ssl
import socket
import concurrent.futures
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "content"

# Match markdown links [text](url) and bare <url> autolinks
MD_LINK = re.compile(r"\[[^\]]+\]\((https?://[^)\s]+)\)")
BARE_LINK = re.compile(r"<(https?://[^>\s]+)>")

UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120 Safari/537.36"
)

def collect_links():
    """Return {url: [(file, line), ...]}"""
    refs = defaultdict(list)
    for md in sorted(CONTENT.rglob("*.md")):
        rel = md.relative_to(ROOT)
        with open(md, encoding="utf-8") as f:
            for i, line in enumerate(f, start=1):
                for m in MD_LINK.finditer(line):
                    refs[m.group(1)].append((str(rel), i))
                for m in BARE_LINK.finditer(line):
                    refs[m.group(1)].append((str(rel), i))
    return refs

def probe(url, timeout=15):
    """Return (status_code:int or None, reason:str). Try HEAD, then GET."""
    ctx = ssl.create_default_context()
    for method in ("HEAD", "GET"):
        req = urllib.request.Request(url, method=method, headers={
            "User-Agent": UA,
            "Accept": "*/*",
            "Accept-Language": "en-US,en;q=0.9",
        })
        try:
            with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
                return resp.status, resp.reason or ""
        except urllib.error.HTTPError as e:
            # Some servers reject HEAD with 4xx/405; let GET retry.
            if method == "HEAD" and e.code in (400, 403, 404, 405, 501):
                continue
            return e.code, e.reason or str(e)
        except urllib.error.URLError as e:
            err = getattr(e, "reason", str(e))
            if method == "HEAD":
                continue
            return None, f"URLError: {err}"
        except socket.timeout:
            if method == "HEAD":
                continue
            return None, "timeout"
        except Exception as e:
            if method == "HEAD":
                continue
            return None, f"{type(e).__name__}: {e}"
    return None, "all methods failed"

def main():
    refs = collect_links()
    print(f"--- {len(refs)} unique external URLs found across content/")

    results = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as ex:
        future_to_url = {ex.submit(probe, u): u for u in refs}
        for fut in concurrent.futures.as_completed(future_to_url):
            url = future_to_url[fut]
            try:
                results[url] = fut.result()
            except Exception as e:
                results[url] = (None, f"exception: {e}")

    ok = []
    redirects = []
    failures = []
    for url, (code, reason) in results.items():
        if code is None:
            failures.append((url, code, reason))
        elif 200 <= code < 300:
            ok.append((url, code, reason))
        elif 300 <= code < 400:
            redirects.append((url, code, reason))
        else:
            failures.append((url, code, reason))

    if failures:
        print("\n=== FAILURES ===")
        for url, code, reason in sorted(failures):
            print(f"  [{code}] {url}  ({reason})")
            for f, line in refs[url][:3]:
                print(f"      → {f}:{line}")

    if "-v" in sys.argv or "--verbose" in sys.argv:
        if redirects:
            print("\n=== REDIRECTS ===")
            for url, code, reason in sorted(redirects):
                print(f"  [{code}] {url}  ({reason})")
        if ok:
            print("\n=== OK ===")
            for url, code, _ in sorted(ok):
                print(f"  [{code}] {url}")

    print(f"\n--- ok: {len(ok)}   redirects: {len(redirects)}   failures: {len(failures)}")
    return 1 if failures else 0

if __name__ == "__main__":
    sys.exit(main())
