#!/usr/bin/env python3
"""Sanity-check the lesson wiki.

    python3 tools/check.py           # structure checks only (fast, offline)
    python3 tools/check.py --online  # also HEAD every video/poster URL

Checks:
  * every lesson in data/lessons.json has its HTML file, with a matching data-lesson id
  * every sign key used in lessons (sign=, options=, signs=) exists in data/signs.json
  * every sign in data/signs.json has video/poster/entry and lists lessons that exist
  * (--online) every video and poster URL answers 200
"""
import json
import re
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
errors = []


def err(msg):
    errors.append(msg)
    print("✗", msg)


signs = json.loads((ROOT / "data/signs.json").read_text())
lessons = json.loads((ROOT / "data/lessons.json").read_text())
lesson_ids = {l["id"] for l in lessons}

for l in lessons:
    path = ROOT / "lessons" / f"{l['slug']}.html"
    if not path.exists():
        err(f"lesson {l['id']}: missing {path.name}")
        continue
    html = path.read_text()
    m = re.search(r'<body[^>]*data-lesson="(\d+)"', html)
    if not m or int(m.group(1)) != l["id"]:
        err(f"{path.name}: data-lesson should be {l['id']}")
    used = set(re.findall(r'<auslan-(?:sign|quiz)[^>]*\ssign="([^"]+)"', html))
    for opts in re.findall(r'options="([^"]+)"', html):
        used |= {o.strip() for o in opts.split("|") if o.strip()}
    for seq in re.findall(r'<sign-phrase[^>]*\ssigns="([^"]+)"', html):
        used |= {t for t in seq.split() if not t.startswith("fs:")}
        for t in seq.split():
            if t.startswith("fs:"):
                used |= {f"letter-{c}" for c in t[3:].lower() if c.isalpha()}
    for key in sorted(used - set(signs)):
        err(f"{path.name}: sign '{key}' not in data/signs.json")
    for key in l.get("signs", []):
        if key not in signs:
            err(f"lessons.json lesson {l['id']}: sign '{key}' not in data/signs.json")

for key, s in signs.items():
    for field in ("label", "video", "poster", "entry", "lessons"):
        if not s.get(field):
            err(f"signs.json '{key}': missing {field}")
    for lid in s.get("lessons", []):
        if lid not in lesson_ids:
            err(f"signs.json '{key}': lesson {lid} doesn't exist")
    for i, v in enumerate(s.get("variants", [])):
        for field in ("region", "video", "poster", "entry"):
            if not v.get(field):
                err(f"signs.json '{key}': variant {i} missing {field}")

if "--online" in sys.argv:
    records = [r for s in signs.values() for r in [s, *s.get("variants", [])]]
    urls = sorted({r[f] for r in records for f in ("video", "poster") if r.get(f)})

    def head(url):
        try:
            req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "AuslanTutor-check"})
            with urllib.request.urlopen(req, timeout=20) as r:
                return url, r.status
        except Exception as e:  # noqa: BLE001
            return url, getattr(e, "code", str(e))

    with ThreadPoolExecutor(8) as ex:
        for url, status in ex.map(head, urls):
            if status != 200:
                err(f"{status}: {url}")
    print(f"checked {len(urls)} URLs")

print(f"{len(lessons)} lessons, {len(signs)} signs —", "OK" if not errors else f"{len(errors)} problem(s)")
sys.exit(1 if errors else 0)
