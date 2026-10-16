# Auslan Tutor

A local, static lesson wiki for learning Auslan. Roman asks for lessons; Claude writes them
as HTML pages that embed Auslan Signbank videos. No build step and no dependencies.

Run it: `./serve.sh` → http://localhost:8000. It has to be localhost, not file://, because the camera
and `fetch()` need it.

## Layout
- `index.html`, `glossary.html`, `review.html`: pages that read `data/*.json`
- `lessons/NNN-slug.html`: one page per lesson. `lessons/_template.html` is the canonical skeleton.
- `data/lessons.json`: ordered lesson list `{id, slug, title, date, summary, signs[]}`
- `data/signs.json`: every sign taught, keyed by a kebab-case gloss key (`hello`, `thank-you`, `letter-a`):
  `{label, english, hint, category: "vocab"|"fingerspelling", video, poster, entry, region, lessons[]}`
- `assets/app.js`: custom elements `<auslan-sign>`, `<auslan-quiz>`, `<sign-phrase>`, `<fingerspell-drill>`,
  plus the mirror panel, record & compare, header, lesson nav and progress (localStorage)
- `curriculum.md`: the roadmap. Tick items off and add notes about Roman's progress.
- `tools/signbank.py`: look up signs on Signbank (JSON out, cached in `tools/.cache/`)
- `tools/framesheet.swift`: renders a sign video as a frame contact sheet so you can see how it's made
- `tools/check.py`: validates lessons and data (`--online` also checks every video URL)

## Delivering a lesson ("next lesson", "a lesson on X")
1. **Plan.** Read `curriculum.md`, `data/lessons.json` and the keys in `data/signs.json`. Pick the topic:
   the next unticked item, or what Roman asked for. Aim for 10–16 new signs. Reuse 3–5 known signs
   in phrases and quiz options.
2. **Look up every sign.** `python3 tools/signbank.py <word>` lists every numbered entry with
   definitions, keywords and region. `--search` lists related keywords.
   Choose the entry whose definition matches the meaning you're teaching. Prefer `AustraliaWide`.
   **Roman lives in WA, so use the Southern dialect.** When only regional variants exist, teach the
   `SouthernDialect` entry as the main card. The Northern one may go in a small "you may also see" aside
   (separate keys, e.g. `good-morning-s` and `-n`). Keys are case-sensitive on Signbank (`J`, `Japan`); the tool tries other casings.
   **Never guess or construct video URLs.** Use only what the tool returns.
3. **Look at the signs before describing them.** Compile once:
   `swiftc -O tools/framesheet.swift -o tools/.bin/framesheet`, then
   `tools/.bin/framesheet <mp4 url> <scratchpad>/sheet.png 8 4` and Read the PNG.
   Write the Hand / Where / Move / Face notes from what the frames show. Where the stills are
   ambiguous, say "watch at 0.5×" rather than inventing detail.
4. **Add the signs** to `data/signs.json` (keep letters first, then vocab), with `lessons: [id]`.
   If a sign already exists, append the lesson id instead of duplicating it.
5. **Write the page.** Copy `lessons/_template.html` to `lessons/NNN-slug.html` and set `<title>`,
   `data-lesson`, the hero, goals, vocab cards, notes, phrases, mirror steps, quiz and recap.
   Use `<sign-phrase>` glosses in Auslan word order, with a `face` hint. Put Deaf-culture notes in `.note.culture`.
6. **Register it.** Append to `data/lessons.json` and tick it off in `curriculum.md`.
7. **Verify.** Run `python3 tools/check.py --online`; it must print OK.
8. **Tell Roman** the lesson title, the URL (http://localhost:8000/lessons/NNN-slug.html) and a one-line summary.

## Teaching conventions
- Glosses go in CAPITALS with hyphens for multi-word signs (THANK-YOU). Fingerspelling is written R-O-M-A-N.
- Always teach the facial expression or non-manual features along with the hands.
- Be honest about uncertainty, and send Roman to the Signbank entry (each card links to it) or a Deaf teacher.
- Encourage real-world practice: Deaf community events and classes with Deaf teachers. This app is a supplement.
- Signbank videos are hotlinked (their pages block iframes, but the MP4s play fine). Every card links back to its entry as credit.
