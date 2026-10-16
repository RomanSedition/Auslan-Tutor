#!/usr/bin/env python3
"""Look up signs on Auslan Signbank (auslan.org.au) and print JSON.

Usage:
    python3 tools/signbank.py hello            # every numbered entry for "hello"
    python3 tools/signbank.py "thank you"      # multi-word keywords work too
    python3 tools/signbank.py thank --search   # list related keywords from the search page
    python3 tools/signbank.py hello --first    # only entry 1

Each entry looks like:
    {"word": "hello", "n": 1, "entry": "https://auslan.org.au/dictionary/words/hello-1.html",
     "video": "...mp4", "poster": "...jpg", "keywords": ["hello", "hi"],
     "definitions": [{"role": "As a Noun", "text": "A greeting made to someone."}],
     "regions": ["AustraliaWide-traditional"]}

Pages are cached in tools/.cache/ so repeat lookups don't hit the server.
Stdlib only.
"""
import hashlib
import html
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE = "https://auslan.org.au"
CACHE = Path(__file__).resolve().parent / ".cache"
UA = "AuslanTutor-personal-study/1.0 (local learning tool)"


def fetch(url):
    CACHE.mkdir(exist_ok=True)
    key = CACHE / (hashlib.sha1(url.encode()).hexdigest() + ".html")
    if key.exists():
        text = key.read_text(encoding="utf-8")
        return None if text == "__404__" else text
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            final = r.geturl()
            text = r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            key.write_text("__404__", encoding="utf-8")
            return None
        raise
    # Unknown words redirect to the search page rather than 404ing.
    if "/dictionary/words/" in url and "/dictionary/words/" not in final:
        key.write_text("__404__", encoding="utf-8")
        return None
    key.write_text(text, encoding="utf-8")
    time.sleep(0.3)  # be polite
    return text


def clean(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", s))).strip()


def entry_url(word, n):
    return f"{BASE}/dictionary/words/{urllib.parse.quote(word)}-{n}.html"


def parse_entry(page):
    # Only the main block; some pages also have a #variantdefinitionblock.
    main = page.split('id="definitionblock"', 1)[-1]
    main = main.split('id="variantdefinitionblock"', 1)[0]

    video = re.search(r'<source src="([^"]+\.mp4)"', main)
    poster = re.search(r'poster="([^"]+)"', main)

    keywords = []
    kw = re.search(r'<div id="keywords">(.*?)</div>', main, re.S)
    if kw:
        body = re.sub(r"<strong>Keywords:</strong>", "", kw.group(1))
        keywords = [k for k in (clean(x) for x in clean(body).split(",")) if k]

    definitions = []
    for chunk in main.split("<h3 class='panel-title'>")[1:]:
        role = clean(chunk.split("</h3>", 1)[0])
        for d in re.finditer(r'definition-counter">\d+\.</span>(.*?)</div>', chunk, re.S):
            definitions.append({"role": role, "text": clean(d.group(1))})

    regions = re.findall(r'/static/img/maps/Auslan/([^"/]+)\.png', main)

    count = re.findall(r'href="[^"]*?-(\d+)\.html">\d+</a>', page)
    return {
        "video": video.group(1) if video else None,
        "poster": poster.group(1) if poster else None,
        "keywords": keywords,
        "definitions": definitions,
        "regions": regions,
        "_max_n": max([1] + [int(c) for c in count]),
    }


def lookup(word, first_only=False):
    word = word.strip()
    out = []
    n, max_n = 1, 1
    while n <= max_n:
        page = fetch(entry_url(word, n))
        if page is None:
            break
        info = parse_entry(page)
        if not info["video"]:
            break
        max_n = 1 if first_only else max(max_n, info.pop("_max_n"))
        info.pop("_max_n", None)
        out.append({"word": word, "n": n, "entry": entry_url(word, n), **info})
        n += 1
    return out


def search(query):
    page = fetch(f"{BASE}/dictionary/search/?query={urllib.parse.quote(query)}")
    if page is None:
        return []
    # An exact match redirects straight to the entry page.
    if 'id="definitionblock"' in page:
        return [query]
    found = re.findall(r'href="/dictionary/words/([^"]+)-1\.html"', page)
    return list(dict.fromkeys(urllib.parse.unquote(f) for f in found))


def main(argv):
    args = [a for a in argv if not a.startswith("--")]
    flags = {a for a in argv if a.startswith("--")}
    if not args:
        print(__doc__)
        return 1
    word = " ".join(args)
    if "--search" in flags:
        print(json.dumps({"query": word, "keywords": search(word)}, indent=2))
        return 0
    # Signbank keys are case-sensitive ("J", "Japan"): try as typed, then the other casings.
    entries = []
    for w in dict.fromkeys([word, word.lower(), word.capitalize(), word.upper()]):
        entries += lookup(w, first_only="--first" in flags)
    if not entries:
        print(json.dumps({"word": word, "entries": [], "suggestions": search(word)}, indent=2))
        return 2
    print(json.dumps({"word": word, "entries": entries}, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
