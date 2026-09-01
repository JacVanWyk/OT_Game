# Orchard Toss — Release Notes

Release notes for the Orchard Toss project (working title). Updated after each
feature that successfully lands, each entry stating what was verified (headless
evidence) and listing the changed files. Design source of truth:
`OrchardToss.md`; module contract: `prototype/ARCHITECTURE.md`. Model:
`../ben_game_1/RELEASE_NOTES.md` (Numbat Patrol).

---

## 2026-09-02 — v0.1.0 — first playable POC

**STATUS: BUILD IN PROGRESS (unverified).** Nothing in this entry has been
confirmed against a running build; the integrator flips the status and fills
the evidence once `tests/board_test.js` and `tests/headless_smoke.mjs` are
green.

**Planned scope** (design doc v3 sections 5–15, built as the full spec, not a
vertical slice):

1. **Stack:** `index.html` + five plain scripts (`config` → `board` →
   `sprites` → `assets` → `game`) on one canvas under `window.OT`; no
   modules, no fetch; runs from `file://`. Portrait logical field 480×854,
   ambient/landmark background split, Fredoka Bold via FontFace.
2. **Board logic (`js/board.js`):** 5×8 grid, tiles compacted toward the
   canopy, launch-up-and-match with the contiguous-run clear, seeded RNG,
   all 10 power-ups (cherry pair, strawberry cross, apple row, watermelon
   splash, grape cluster, banana monkey row, pomegranate random 5, pineapple
   obstacle break, orange chain, lemon column), walls (deflect), trellis
   (return), pipes (vertical-only), coconuts (Autumn+), winnability check,
   level generation for all 52 `levelDef`s.
3. **Zones:** Spring 10 / Summer 12 / Autumn 14 / Winter 16 levels; fruit
   and obstacle ramps per zone; Spring obstacle-free.
4. **Game loop (`js/game.js`):** splash → title → zoneIntro → playing →
   levelClear / levelFail → zoneAd (interstitial stub at zone transitions
   only) …; countdown timer with time-back on clears; drag-and-flick input
   with launch lockout on a mismatch; rolling/squashing fruit, wall bounces,
   juice splash and falling chunks; HUD (timer, score, remaining/target,
   hearts, held + next); 5-heart pool with 30-min refill in `localStorage`;
   1–3 stars from time remaining; pause overlay; Sprout and the orchard tree
   growing with progress.
5. **Art (`js/sprites.js`):** procedural glossy mobile-casual painters for
   all fruit, coconut, three obstacles × four seasons, Sprout (4 stages × 4
   moods), launcher, monkey, splash, hearts/stars, Numbat-style banner /
   button / panel chrome; `tools/spritesheet.html` review sheet.
6. **Tooling:** `build_bundle.py` (single-file `dist/OrchardToss.html`
   with the font embedded; `--zip <version>` for a versioned authoring-folder
   archive), `tests/board_test.js` (Node, zero deps, with negative
   controls), `tests/headless_smoke.mjs` (browser-harness suite with its own
   http.server, file:// bundle boot, 390×844 / 844×390 screenshots,
   rendered-pixel probe with a negative control).

**Tooling self-verification (2026-09-02, tooling builder — scratch copies,
not the game):** `build_bundle.py` produced a bundle from five dummy scripts
with all markers in order and `OT.AM_DATA` before `config.js`, and exited 1
with a named cause on each negative control (deleted script, swapped script
tags, duplicated tag, missing font, empty font, extra external `<script src>`,
external `href`, `fetch(` in a script). `tests/headless_smoke.mjs` passed
12/12 against a contract-shaped stub game, failed the expected checks (exit 1)
when the stub was broken (no board drawn, `failLevel` no-op, `launch` no-op),
and exits 3 with a SKIP message when the game is absent, leaving no server
listening. **This says nothing about the real game.**

**Verified:** _pending integration._

**Changed files** (to be completed by the integrator):

- `prototype/index.html` — _(pending)_
- `prototype/js/config.js` — _(pending)_
- `prototype/js/board.js` — _(pending)_
- `prototype/js/sprites.js` — _(pending)_
- `prototype/js/assets.js` — _(pending)_
- `prototype/js/game.js` — _(pending)_
- `prototype/tools/spritesheet.html` — _(pending)_
- `prototype/tests/board_test.js` — _(pending)_
- `prototype/build_bundle.py` — new (tooling builder)
- `prototype/tests/headless_smoke.mjs` — new (tooling builder)
- `prototype/README.md` — new (tooling builder)
- `prototype/ARCHITECTURE.md` — module contract
- `RELEASE_NOTES.md` — this file
