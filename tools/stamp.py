#!/usr/bin/env python3
"""Cache-bust the shared assets: rewrite every page's link to assets/app.js and
assets/app.css as `app.js?v=<content hash>`, so browsers fetch the new version
whenever the file changes (instead of serving a stale cached copy).

    python3 tools/stamp.py          # update all pages
    python3 tools/stamp.py --check  # exit 1 if any page has a stale stamp (used by check.py)
"""
import hashlib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ["app.js", "app.css"]


def digest(name):
    return hashlib.sha1((ROOT / "assets" / name).read_bytes()).hexdigest()[:10]


def pages():
    return sorted([*ROOT.glob("*.html"), *ROOT.glob("lessons/*.html")])


def stamp(check=False):
    stale = []
    hashes = {a: digest(a) for a in ASSETS}
    for page in pages():
        text = page.read_text()
        new = text
        for name, h in hashes.items():
            new = re.sub(rf'(assets/{re.escape(name)})(\?v=[0-9a-f]+)?"', rf'\1?v={h}"', new)
        if new != text:
            stale.append(page.relative_to(ROOT))
            if not check:
                page.write_text(new)
    return stale


if __name__ == "__main__":
    check = "--check" in sys.argv
    stale = stamp(check)
    if check:
        for p in stale:
            print(f"✗ stale asset stamp: {p} (run python3 tools/stamp.py)")
        sys.exit(1 if stale else 0)
    print(f"stamped {len(stale)} page(s)" if stale else "all pages already up to date")
