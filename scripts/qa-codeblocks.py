#!/usr/bin/env python3
"""QA all fenced code blocks in content/*.md.

For each block, validate syntax according to its language hint.
Reports: file:line  language  status  details
"""
import ast
import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "content"

FENCE = re.compile(r"^```([A-Za-z0-9_+-]*)\s*$")

def iter_blocks(md_path):
    with open(md_path, encoding="utf-8") as f:
        lines = f.readlines()
    in_block = False
    lang = None
    start = 0
    buf = []
    for i, line in enumerate(lines, start=1):
        m = FENCE.match(line.rstrip("\n"))
        if m and not in_block:
            in_block = True
            lang = m.group(1).lower() or ""
            start = i
            buf = []
            continue
        if line.rstrip("\n") == "```" and in_block:
            yield (start, lang, "".join(buf))
            in_block = False
            lang = None
            buf = []
            continue
        if in_block:
            buf.append(line)
    if in_block:
        yield (start, lang or "", "".join(buf))

def check_python(code):
    try:
        ast.parse(code)
        return "ok", ""
    except SyntaxError as e:
        return "FAIL", f"line {e.lineno} col {e.offset}: {e.msg}"

def check_json(code):
    try:
        json.loads(code)
        return "ok", ""
    except json.JSONDecodeError as e:
        return "FAIL", f"line {e.lineno} col {e.colno}: {e.msg}"

def check_yaml(code):
    try:
        import yaml
    except ImportError:
        return "skip", "no pyyaml"
    try:
        list(yaml.safe_load_all(code))
        return "ok", ""
    except yaml.YAMLError as e:
        return "FAIL", str(e).replace("\n", " | ")

def check_xml(code):
    try:
        from lxml import etree
    except ImportError:
        return "skip", "no lxml"
    last_err = ""
    for s in (code, f"<__root__>\n{code}\n</__root__>"):
        try:
            etree.fromstring(s.encode("utf-8"))
            return "ok", ""
        except etree.XMLSyntaxError as e:
            last_err = str(e).splitlines()[0]
    return "FAIL", last_err

def check_bash(code):
    p = subprocess.run(
        ["bash", "-n", "-"], input=code, text=True, capture_output=True
    )
    if p.returncode == 0:
        return "ok", ""
    return "FAIL", (p.stderr or "").strip().replace("\n", " | ")

def check_dockerfile(code):
    # Best-effort: just look for blatantly broken instructions
    return "skip", "no docker check"

def detect_indent_issues(code, lang):
    """Look for mixed tabs/spaces or stray trailing-whitespace surprises in code blocks."""
    issues = []
    if "\t" in code and "    " in code:
        issues.append("mixed tabs and spaces")
    if lang == "python":
        # Detect inconsistent indent unit
        indents = set()
        for line in code.splitlines():
            stripped = line.lstrip(" ")
            n = len(line) - len(stripped)
            if n and stripped and not stripped.startswith("#"):
                indents.add(n)
        # If we see indents that aren't multiples of the smallest
        if indents:
            base = min(indents)
            if base and any(n % base != 0 for n in indents):
                issues.append(f"inconsistent python indent (saw {sorted(indents)})")
    return issues

CHECKERS = {
    "python": check_python,
    "py": check_python,
    "json": check_json,
    "yaml": check_yaml,
    "yml": check_yaml,
    "xml": check_xml,
    "bash": check_bash,
    "sh": check_bash,
    "shell": check_bash,
    "dockerfile": check_dockerfile,
    "docker": check_dockerfile,
}

def main():
    failures = []
    skipped = []
    total = 0
    verbose = "--verbose" in sys.argv or "-v" in sys.argv
    for md in sorted(CONTENT.rglob("*.md")):
        for line_no, lang, code in iter_blocks(md):
            total += 1
            rel = md.relative_to(ROOT)
            checker = CHECKERS.get(lang)
            if not checker:
                skipped.append((rel, line_no, lang, "no checker"))
                continue
            status, detail = checker(code)
            if status == "FAIL":
                failures.append((rel, line_no, lang, detail, code))
                print(f"FAIL  {rel}:{line_no}  ({lang})  {detail}")
            elif status == "skip":
                skipped.append((rel, line_no, lang, detail))
            indent_issues = detect_indent_issues(code, lang)
            for ii in indent_issues:
                print(f"WARN  {rel}:{line_no}  ({lang})  indent: {ii}")
    print()
    print(f"--- total blocks: {total}")
    print(f"--- failures:     {len(failures)}")
    print(f"--- skipped:      {len(skipped)} (no language hint or no checker)")
    if verbose:
        for s in skipped:
            print(f"SKIP  {s[0]}:{s[1]}  ({s[2] or 'no lang'})  {s[3]}")
    return 1 if failures else 0

if __name__ == "__main__":
    sys.exit(main())
