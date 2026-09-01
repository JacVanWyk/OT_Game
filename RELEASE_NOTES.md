# Orchard Toss — Release Notes

Release notes for the Orchard Toss project (working title). Updated after each
feature that successfully lands, each entry stating what was verified (headless
evidence) and listing the changed files. Design source of truth:
`OrchardToss.md`; module contract: `prototype/ARCHITECTURE.md`. Model:
`../ben_game_1/RELEASE_NOTES.md` (Numbat Patrol).

---

## 2026-09-02 — v0.1.0 — first playable POC

**STATUS: VERIFIED + DEPLOYED.** Full-spec build (all 10 fruits, all 4
zones, 52 levels, obstacles, coconuts, hearts, stars, ad stub) on the Numbat
Patrol web-prototype pattern. Live behind the router login at
**https://tools-app.net/hosted/orchard-toss/** — deployed as a straight
authoring copy (`index.html`, `js/*.js`, `assets/fonts/`) into
`router-server/hosted_apps/orchard-toss/`, all 7 files byte-identical to
source, no `<base>` tag; anonymous requests to the page, a script, the font
and the no-slash path all 302 to login as designed. Single-file bundle
`prototype/dist/OrchardToss.html` (0.21 MB, font embedded) boots from
`file://`. Test commands: `node tests/board_test.js` (52 checks),
`node tests/headless_smoke.mjs` (12 checks, self-serving), `python3
build_bundle.py`.

**How it was built.** Contract-first: `prototype/ARCHITECTURE.md` fixed the
module APIs, then four builders ran in parallel (board logic + Node tests,
procedural art + spritesheet, game shell + input, bundler/docs/smoke test),
followed by an integration pass, a read-only gameplay QA pass, a
board-tuning pass, and a final integration for the cherry twin. Every module
shipped with its own negative controls.

**Gameplay model (decisions beyond the design doc, see ARCHITECTURE.md):**
tiles hang from the canopy and compact upward, so the launched fruit always
hits the lowest tile in its lane; walls deflect sideways, trellis returns the
fruit, pipes pass vertically only; coconuts (Autumn+) never match and count
toward remaining; level clear at `remaining < target`,
`target = max(2, round(initial × 0.10))`.

**Findings fixed during QA (all measured, not guessed):**

1. *Dead hands / soft-lock.* A queue-fed hand plus "mismatch keeps the hand"
   left 23% of hands with no target; only 58 of 1 040 boards were clearable.
   Fixed with hand rescue (swap/redraw reported as `result.handRescue`,
   animated as a SWAP popup) → 1 040/1 040 clearable, then cut further to a
   21.5% rescue rate with `DRAW_LOOKAHEAD` 3.
2. *Timer never bit.* The 0.5/1.0/5 s time bonus refunded every level; every
   archetype cleared with 90–100% time left and everyone got 3★. Retuned:
   bonus 0.25/0.5/cap 3 s, limits Spring 45→38 s and later zones 40→32 s,
   `STAR_FRACTIONS` [0.8, 0.5]. After: sensible player 88% 3★, naive
   23% 3★ / 77% 2★, casual fails 3% of levels (worst zone 5%).
3. *Cherry double unreachable* (0 in 381 launches, compaction never leaves a
   gap). Redefined as a twin cherry into the adjacent lane, animated as a
   second flight; 22% of cherry launches now double.
4. *Single-tile runs.* `CLUSTER_BIAS` 0.55 lifts mean matched run 1.12 → 1.67.
5. *HUD values invisible* (white text stroked with a 4 px white outline,
   1.0:1). Outline is now Deep Navy `#335D7C`; measured ≥ 5.2:1 everywhere.
6. *Canopy strip painted over the HELD/NEXT previews.* Clipped; 0 pixels
   changed in the HUD band (negative control 3 294).
7. *Render throw froze the loop forever* (rAF scheduled after render).
   Guarded; proven with an injected throwing painter.
8. *Meta-progression hidden* behind the board. Orchard showcase with the
   growing tree + Sprout on zoneIntro and levelClear; level 52 ends on an
   "ORCHARD RESTORED!" finale that routes back to the title.

**For Ben to decide (tuning, not bugs):** later zones are now slightly
easier for casual players than Spring (fail 1–5% vs 4%); the measured lever
is `TIME_RAMP` ×0.9 for Summer–Winter. Banana is mechanically identical to
apple (distinct monkey presentation only). Apple is drawn green so it reads
apart from cherry and strawberry at tile size. Star thresholds are set
against a simulated "naive" player (1 s think, no errors), not a real one.

**Not verified:** real finger flicks on a phone (headless cannot gesture;
`OT.debug.launch` drives the same code path as a flick), the hosted page
past the login wall (only the redirects and the byte-identical copy were
checked), and the human feel of the retuned time limits.

**Changed files:** `prototype/index.html`, `prototype/js/config.js`,
`prototype/js/board.js`, `prototype/js/sprites.js`, `prototype/js/assets.js`,
`prototype/js/game.js`, `prototype/build_bundle.py`,
`prototype/tests/board_test.js`, `prototype/tests/headless_smoke.mjs`,
`prototype/tools/spritesheet.html`, `prototype/assets/fonts/Fredoka-Bold.woff2`,
`prototype/assets/spritesheet_v0.1.0.png`, `prototype/assets/screens/*.png`,
`prototype/dist/OrchardToss.html`, `prototype/ARCHITECTURE.md`,
`prototype/README.md`, `CLAUDE.md`, this file; deployed copy in
`C:\PROD_DB\infra_router\router-server\hosted_apps\orchard-toss\`.
