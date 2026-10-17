#!/usr/bin/env python3
"""Collect every <sign-phrase> from the lesson pages into data/phrases.json, for the Review phrase game.

    python3 tools/phrases.py          # rewrite data/phrases.json
    python3 tools/phrases.py --check  # exit 1 if it's out of date (used by check.py)

Each entry: {"id": "002-3", "lesson": 2, "signs": "my name fs:@name", "english": "...", "face": "..."}
Only phrases with at least two tokens are kept (single signs aren't much of a phrase).
"""
import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data/phrases.json"
TAG = re.compile(r"<sign-phrase\b([^>]*)>")
ATTR = re.compile(r'(\w+)="([^"]*)"')


def collect():
    lessons = json.loads((ROOT / "data/lessons.json").read_text())
    out = []
    for l in lessons:
        page = (ROOT / "lessons" / f"{l['slug']}.html").read_text()
        for n, m in enumerate(TAG.finditer(page), 1):
            a = {k: html.unescape(v) for k, v in ATTR.findall(m.group(1))}
            if len(a.get("signs", "").split()) < 2:
                continue
            out.append({"id": f"{l['id']:03d}-{n}", "lesson": l["id"], "signs": a["signs"],
                        "english": a.get("english", ""), "face": a.get("face", "")})
    return out


def render(phrases):
    return json.dumps(phrases, indent=1, ensure_ascii=False) + "\n"


if __name__ == "__main__":
    text = render(collect())
    if "--check" in sys.argv:
        if not OUT.exists() or OUT.read_text() != text:
            print("✗ data/phrases.json is out of date (run python3 tools/phrases.py)")
            sys.exit(1)
        sys.exit(0)
    OUT.write_text(text)
    print(f"{len(json.loads(text))} phrases → data/phrases.json")
