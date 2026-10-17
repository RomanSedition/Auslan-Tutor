#!/usr/bin/env python3
"""Store where the signing happens in each Signbank clip, so the phrase player and fingerspelling drill can
skip the still lead-in/lead-out and run signs together smoothly.

    python3 tools/trim.py          # analyse any new videos in data/signs.json and write "trim": [start, end]

Needs macOS (tools/motion.swift, compiled to tools/.bin/motion). Results are cached in tools/.cache/trim.json.
Short clips (under 2 s) are left untrimmed; they're usually all signing already. The kept window is at least 1 s.
Fingerspelled letters also get "hold": [start, end], the still handshape between hands-up and hands-down, so
fingerspelling can flow letter to letter (except H, J, Z, which move).
"""
import concurrent.futures as cf
import hashlib
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BIN = ROOT / "tools/.bin/motion"
CACHE = ROOT / "tools/.cache/trim.json"
MIN_CLIP, MIN_KEEP = 2.0, 1.0
MOVING_LETTERS = {"letter-h", "letter-j", "letter-z"}


def analyse(url, tmp):
    f = os.path.join(tmp, hashlib.sha1(url.encode()).hexdigest() + ".mp4")
    try:
        subprocess.run(["curl", "-sf", "-o", f, url], check=True, timeout=60)
        d = json.loads(subprocess.run([str(BIN), f], capture_output=True, text=True, timeout=60).stdout)
        d.pop("file", None)
        return url, d
    except Exception as e:  # noqa: BLE001
        return url, {"error": str(e)}
    finally:
        if os.path.exists(f):
            os.remove(f)


def window(d):
    if "start" not in d or d["duration"] < MIN_CLIP:
        return None
    s, e = d["start"], d["end"]
    if e - s < MIN_KEEP:  # widen around the centre
        mid = (s + e) / 2
        s, e = max(0, mid - MIN_KEEP / 2), min(d["duration"], mid + MIN_KEEP / 2)
    if s < 0.15 and d["duration"] - e < 0.15:
        return None  # nothing worth trimming
    return [round(s, 2), round(e, 2)]


def main():
    if not BIN.exists():
        subprocess.run(["swiftc", "-O", str(ROOT / "tools/motion.swift"), "-o", str(BIN)], check=True)
    signs = json.loads((ROOT / "data/signs.json").read_text())
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    records = [r for s in signs.values() for r in [s, *s.get("variants", [])]]
    letter_videos = {r["video"] for k, s in signs.items() if s["category"] == "fingerspelling" for r in [s, *s.get("variants", [])]}
    # Re-analyse letters cached before hold detection existed.
    todo = sorted({r["video"] for r in records} - set(cache) | {u for u in letter_videos if u in cache and "start" in cache[u] and "hold_checked" not in cache[u]})
    if todo:
        print(f"analysing {len(todo)} new video(s)…", file=sys.stderr)
        with tempfile.TemporaryDirectory() as tmp, cf.ThreadPoolExecutor(8) as ex:
            for url, d in ex.map(lambda u: analyse(u, tmp), todo):
                d["hold_checked"] = True
                cache[url] = d
        CACHE.parent.mkdir(exist_ok=True)
        CACHE.write_text(json.dumps(cache))
    for k, s in signs.items():
        if s["category"] != "fingerspelling":
            continue
        for r in [s, *s.get("variants", [])]:
            hold = cache.get(r["video"], {}).get("hold")
            if hold and k not in MOVING_LETTERS:
                r["hold"] = hold
            else:
                r.pop("hold", None)
    trimmed = 0
    for r in records:
        w = window(cache.get(r["video"], {}))
        if w:
            r["trim"] = w
            trimmed += 1
        else:
            r.pop("trim", None)
    (ROOT / "data/signs.json").write_text(json.dumps(signs, indent=2, ensure_ascii=False))
    print(f"{trimmed} of {len(records)} clips have a trim window")


if __name__ == "__main__":
    main()
