# Auslan Tutor 🤟

A free, non-commercial site for learning **Auslan** (Australian Sign Language), with sign videos from
[Auslan Signbank](https://auslan.org.au).

**Live site:** https://romansedition.github.io/Auslan-Tutor/

- A 30-lesson beginner course, from fingerspelling to telling a short story
- Inline Signbank videos with slow motion, and regional versions matched to your state
- A camera mirror with record & compare, to check your own signing
- Review games: flashcards, multiple choice, match pairs, phrase builder and a fingerspelling game
- Progress stays in your own browser, and you can save or load a progress file

This is a learning aid. It supplements, and doesn't replace, learning from Deaf people. Look for classes taught by
Deaf teachers and get involved in your local Deaf community.

## Running it locally

```sh
./serve.sh          # serves http://localhost:8000 and opens it (the camera needs localhost)
```

Lessons are authored with [Claude Code](https://claude.com/claude-code); see `CLAUDE.md` for the workflow.

## Licences

This project has three parts with different licences:

| Part | Licence |
|---|---|
| **Software**: `assets/`, `tools/`, the page code and structure | [PolyForm Noncommercial 1.0.0](LICENSE) |
| **Lesson content**: lesson text, sign descriptions, phrases, curriculum | [CC BY-NC-SA 4.0](LICENSE-CONTENT.md) |
| **Sign videos, images and dictionary entries** | © [Auslan Signbank](https://auslan.org.au), [CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/), not covered by this project's licences |

In short: you're welcome to use, learn from, share and adapt this project for **non-commercial** purposes
(personal study, teaching, community groups, research), with credit. You may not sell it, put it behind a paywall,
or use it to make money.

Required Notice: Copyright (c) 2026 Lucky Hawton (https://github.com/RomanSedition/Auslan-Tutor)

The fingerspelling word bank (`data/spelling-words.json`) is derived from
[google-10000-english](https://github.com/first20hours/google-10000-english).
