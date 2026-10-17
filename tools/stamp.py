#!/usr/bin/env python3
"""Cache-bust the shared assets: rewrite every page's link to assets/app.js and
assets/app.css as `app.js?v=<content hash>`, so browsers fetch the new version
whenever the file changes (instead of serving a stale cached copy).

Also keeps search-engine metadata in sync: each page's <meta name="description"> and
canonical link (lesson descriptions come from data/lessons.json), and sitemap.xml.

    python3 tools/stamp.py          # update all pages
    python3 tools/stamp.py --check  # exit 1 if any page has a stale stamp (used by check.py)
"""
import hashlib
import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ["app.js", "app.css"]
SITE = "https://romansedition.github.io/Auslan-Tutor/"
DESCRIPTIONS = {
    "index.html": "Free Auslan (Australian Sign Language) lessons for beginners, with Auslan Signbank videos, "
                  "a camera mirror to practise signing, and review games. Regional signs for your state.",
    "glossary.html": "Every Auslan sign taught in Auslan Tutor, with Signbank videos. Search by English word or category.",
    "review.html": "Practise Auslan: flashcards, multiple choice, match pairs, phrase builder and a fingerspelling game.",
}


def digest(name):
    return hashlib.sha1((ROOT / "assets" / name).read_bytes()).hexdigest()[:10]


def pages():
    return sorted([*ROOT.glob("*.html"), *ROOT.glob("lessons/*.html")])


def published():
    """{relative path: description} for every public page, in site order."""
    out = dict(DESCRIPTIONS)
    for l in json.loads((ROOT / "data/lessons.json").read_text()):
        out[f"lessons/{l['slug']}.html"] = f"Auslan lesson {l['id']}: {l['summary']}"
    return out


def with_meta(text, rel, desc):
    url = SITE if rel == "index.html" else SITE + rel
    tags = (f'  <meta name="description" content="{html.escape(desc)}">\n'
            f'  <link rel="canonical" href="{url}">\n')
    text = re.sub(r'  <meta name="description"[^>]*>\n|  <link rel="canonical"[^>]*>\n', "", text)
    return re.sub(r"(  <title>.*</title>\n)", lambda m: m.group(1) + tags, text, count=1)


def sitemap(rels):
    urls = "".join(f"  <url><loc>{SITE if r == 'index.html' else SITE + r}</loc></url>\n" for r in rels)
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls + "</urlset>\n")


def stamp(check=False):
    stale = []
    hashes = {a: digest(a) for a in ASSETS}
    meta = published()
    for page in pages():
        rel = page.relative_to(ROOT).as_posix()
        text = page.read_text()
        new = text
        for name, h in hashes.items():
            new = re.sub(rf'(assets/{re.escape(name)})(\?v=[0-9a-f]+)?"', rf'\1?v={h}"', new)
        if rel in meta:
            new = with_meta(new, rel, meta[rel])
        if new != text:
            stale.append(page.relative_to(ROOT))
            if not check:
                page.write_text(new)
    smap = ROOT / "sitemap.xml"
    want = sitemap(meta)
    if not smap.exists() or smap.read_text() != want:
        stale.append(smap.relative_to(ROOT))
        if not check:
            smap.write_text(want)
    return stale


if __name__ == "__main__":
    check = "--check" in sys.argv
    stale = stamp(check)
    if check:
        for p in stale:
            print(f"✗ stale asset stamp: {p} (run python3 tools/stamp.py)")
        sys.exit(1 if stale else 0)
    print(f"stamped {len(stale)} page(s)" if stale else "all pages already up to date")
