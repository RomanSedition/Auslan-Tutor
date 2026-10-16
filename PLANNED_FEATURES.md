# Planned features

Ideas that have been discussed but not built yet. Items marked **Decision needed** are waiting on a choice before work can start.

---

## 1. Private lessons (alongside the public ones)

**Goal:** anyone who clones the repo and has Claude Code can ask for their own lessons. Those lessons stay private on their machine and never interfere with the public lessons the author publishes. The author can make private lessons too, for example a drill on their own weak spots, without publishing them.

**Design:**
- [ ] **A gitignored `local/` folder** mirroring the public layout:
  - `local/lessons.json`, `local/signs.json`, `local/lessons/my-001-slug.html`
  - Because it's gitignored, private lessons are never committed or pushed, and `git pull` never conflicts with them.
  - On the public site the folder doesn't exist, so visitors see only public lessons.
- [ ] **app.js merges both sources.** It loads `data/*.json`, then `local/*.json` if they exist, quietly skipping a 404. Private signs extend the sign list, so private lessons can reuse public signs like HELLO. Glossary and Review include private signs, with a "Private" filter.
- [ ] **Separate lesson IDs.** Private lessons use IDs like `"my-1"` and `my-` filenames, so they never collide with public numbering. Progress keys stay distinct too.
- [ ] **Home page:** a "Your private lessons" section, shown only when `local/lessons.json` exists. Each private lesson gets a 🔒 tag.
- [ ] **CLAUDE.md routing rules:**
  - **Default is private:** "give me a lesson on X" writes to `local/` with no commit or push.
  - **Public only when explicit and allowed:** writes to `data/` and `lessons/` and publishes only if the person asks for a public lesson *and* has push access to the repo (checked with `gh repo view --json viewerPermission`). Otherwise Claude explains that it can only make private lessons in their copy.
  - **Promote:** "make my private lesson X public" moves it from `local/` to the public set, renumbers it, and publishes it (author only).
- [ ] **`tools/check.py`** validates `local/` too, including that private lessons only use sign keys from the public or private sign lists.

This covers most of §2 (fork-friendly): people don't need to fork, and pulling the author's new lessons never conflicts with their own.

## 1b. Sharing lessons

**Goal:** people can share their private lessons with each other, and the best ones can be contributed to the public site. Depends on §1.

**A. Lesson packs (person to person)**
- [ ] **Pack format.** One file, `something.auslan-lesson.json`, holding:
  - lesson metadata (title, summary, author name if they choose, created date)
  - the lesson body HTML
  - the full records of every sign it uses (video, poster, entry, variants)

  It's self-contained, so the recipient doesn't need the sender's other lessons. Share it any way you like: email, Discord, a Gist, AirDrop.
- [ ] **Export.** `python3 tools/pack.py export my-3`, or just ask Claude to "share my lesson on family".
- [ ] **Import.** `python3 tools/pack.py import file-or-url`, or ask Claude to "import this lesson". It installs into the recipient's private `local/` folder with a new `my-` ID and records who it came from ("Shared by Sam"). Signs the recipient already has are reused, not duplicated.
- [ ] **Safety checks on import.** A pack is untrusted content running on the recipient's local site, so the importer must:
  - remove `<script>` tags, inline event handlers (`onclick` etc.), `<iframe>`s and `javascript:` links
  - allow only known elements, including our custom elements (`<auslan-sign>`, `<sign-phrase>`, …)
  - accept video and poster URLs only from Signbank's media host (`object-store.rc.nectar.org.au/.../staticauslanorgau/`), and entry links only from `auslan.org.au`
  - then run `check.py` on the result

  Packs are imported through Claude or the tool, never straight in the browser, so nothing executes before it's been cleaned.

**B. Community lessons (contributed to the public site)**
- [ ] **A `community/` area** next to the author's own lessons: `community/lessons.json`, `community/lessons/…`. The site shows a "Community lessons" section, crediting each contributor by the name they choose.
- [ ] **How to contribute.** A contributor asks their Claude to "submit my lesson X to the public site". Claude forks the repo, adds the lesson under `community/`, runs `check.py --online`, and opens a pull request. Nobody can publish directly: the author reviews and merges.
- [ ] **Review checklist** (in CONTRIBUTING.md and as a PR template):
  - signs match their Signbank definitions
  - descriptions are accurate and hedge where unsure
  - non-manual features (facial expression etc.) are covered
  - Deaf-culture notes are respectful and correct
  - no personal details
  - the Signbank credit is intact

  Ideally a Deaf Auslan user reviews community lessons before they're merged.
- [ ] **Licence for contributions.** Contributors agree their lesson text is shared under the repo's licence (see §2, decision pending). Signbank media stays under CC BY-NC-ND.

## 2. Make the repo fork-friendly

**Goal:** anyone with Claude Code can clone or fork the repo and generate their own lessons locally.

That mostly works today, because Claude follows [CLAUDE.md](CLAUDE.md) in any copy of the repo. These gaps make it clumsy:

- [ ] **Conditional publishing in CLAUDE.md.** The workflow says "commit and push to `main`" and names the author's GitHub Pages URL. Change it so Claude only pushes when the repo belongs to the person running it (for example, `gh repo view` shows push access). Otherwise lessons stay local. The live URL should be worked out from the repo owner, not hard-coded.
- [ ] **Non-Mac fallback.** `tools/framesheet.swift` needs macOS (AVFoundation). Add instructions for other systems: use the Signbank poster image plus the entry's definitions, and describe movement more cautiously ("watch at 0.5×").
- [ ] **Lesson numbering in forks.** Solved by private lessons (§1): personal lessons live in the gitignored `local/` folder with `my-` IDs, so they never clash with upstream numbering.
- [ ] **README.md.** What the app is, a screenshot, quick start (`git clone` → `./serve.sh` → ask Claude "next lesson"), requirements (Python 3, a modern browser, Claude Code for lesson authoring), and a note that videos stream from Signbank, so it needs internet.
- [ ] **Licence.** There's no LICENSE file, so legally others can't reuse the code. **Decision needed:**
  - **MIT:** anyone can reuse the code, even commercially.
  - **CC BY-NC 4.0:** non-commercial only, which matches the spirit of Signbank's licence.
  - Either way, add a note that Signbank videos and entries stay under **CC BY-NC-ND 4.0** and aren't covered by the repo licence.

## 3. Let visitors request lessons

**Today:** only the author can create lessons (Claude Code on their machine, plus push access).

- [ ] **"Suggest a lesson" link (recommended first step).** Add a button on the home page that opens either:
  - a pre-filled GitHub issue (`/issues/new?title=Lesson request: …`), which needs a GitHub account, or
  - a Google Form or email link, which needs no account.

  The author reviews suggestions and asks Claude for the ones they want.
- [ ] **Automated lessons from requests (advanced).** A GitHub Action runs Claude on new lesson-request issues, writes the lesson following CLAUDE.md, and opens a **pull request** for the author to review before merging.
  - Needs an Anthropic API key stored as a repo secret, and each lesson costs API usage.
  - Always require human review before merge, because outside requests steer what gets published.
  - `framesheet.swift` won't run on Linux runners, so this depends on the non-Mac fallback in §2.

## 4. Progress sync across devices

**Today:** progress lives in each browser's localStorage. Saving and loading a progress file (home page → *Your progress*) moves it between devices by hand, and loading merges rather than overwrites.

- [ ] **Sync link / QR code.** "Send to another device" encodes progress into a URL and shows a QR code. Scanning it on a phone opens the site and merges the progress. One-way and manual, but fast.
- [ ] **Automatic sync through a GitHub Gist.** The user pastes a GitHub token, limited to Gists only, into the site once per device. The site then saves progress to a private Gist and loads it on page open, reusing the existing merge logic in `importProgress()`. It only suits people with GitHub accounts, and the token lives in browser storage.
- [ ] **Real accounts** (Supabase, Firebase or similar). Only if many non-GitHub users need automatic cross-device sync. This adds a backend, sign-in and privacy responsibilities.

## 5. Housekeeping

- [ ] **Remove personal details from git history.** Current files are clean (personal notes now live in the gitignored `CLAUDE.local.md`), but earlier commits still contain them. Fix it by rewriting history (e.g. `git filter-repo`) and force-pushing. This can't be undone, but it's safe while there's only one contributor.
- [ ] **Courtesy email to Auslan Signbank** (webmaster@auslan.org.au) before sharing widely. The site hotlinks their videos under CC BY-NC-ND, and their conditions page doesn't mention video hotlinking.
- [ ] **Test on a real iPhone.** Check camera mirror, recording (MediaRecorder codec) and layout. So far it's only been tested at phone width in desktop Chrome.

---

## Done (for reference)
- Lesson wiki with inline Signbank videos, camera mirror, and record & compare
- The full 30-lesson beginner track (321 signs), with a curriculum and pacing guide
- Glossary and spaced-repetition review
- Fingerspelling game: difficulty levels, a ~3,900-word bank, no recent repeats, score and streak, hotkeys
- Public hosting on GitHub Pages, with per-visitor name, state and progress (browser only)
- Saving and loading a progress file, with merging
- Regional sign variants matched to the visitor's state or dialect
- Review games: multiple choice and 🧩 Match pairs over completed lessons (Match pairs was built from a phone cloud session)
- Cache-busting asset stamps (`tools/stamp.py`)
