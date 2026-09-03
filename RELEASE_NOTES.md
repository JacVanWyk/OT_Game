# Orchard Toss — Release Notes

Release notes for the Orchard Toss project (working title). Updated after each
feature that successfully lands, each entry stating what was verified (headless
evidence) and listing the changed files. Design source of truth:
`OrchardToss.md`; module contract: `prototype/ARCHITECTURE.md`. Model:
`../ben_game_1/RELEASE_NOTES.md` (Numbat Patrol).

---

## 2026-09-03 — v0.3.0 — Ben's first two bridge decisions: difficulty climbs through the zones (J-006), banana breaks obstacles (J-008)

**STATUS: VERIFIED + DEPLOYED.** First release driven by `talk_to_other_claude.md`:
Ben's design Claude answered six open items in MSG-02, and the two that were
build work shipped the same day. Live at
**https://tools-app.net/hosted/orchard-toss/** (title screen reads v0.3.0);
offline bundle `prototype/dist/OrchardToss.html` 671 625 B.

**J-008 — banana is no longer apple with a monkey.** The monkey sweep clears
every tile in the impact row as before AND breaks every wall, trellis and pipe
in that row (`result.broken`, one `burst` cue each). Apple is unchanged and
still breaks nothing; coconuts in the row remain tiles, so they clear through
`result.cleared` and count down `remaining` exactly as they did. Pineapple keeps
its single-obstacle break. Measured 0.43 obstacles broken per banana match under
the sensible policy (0 before the change, on the same tool).

**J-006 — difficulty now climbs; the fix needed a second lever.** Removing the
0.9× easing was not sufficient, for two measured reasons: the design doc's §11
floor is 30 s per level and Autumn already needed 30 s at its last level to
out-pressure Summer, and Winter's boards are *smaller* than Autumn's because its
obstacle load caps capacity (mean initial fruit 22.0 / 23.9 / 24.4 / 21.1 across
the four zones; the last seven Winter levels hold 19). So the limits carry what
the floor allows and a new per-zone multiplier on the time-back bonus carries the
rest:

- `OT.CONFIG.TIME_RAMP` — Spring 45→38, Summer 38→32, Autumn 36→30, Winter 34→30
  (was Spring 45→38 with Summer, Autumn and Winter all 40→32).
- `OT.Board.TUNING.TIME_ZONE_SCALE` — new: Spring 1, Summer 1, Autumn 0.85,
  Winter 0.5, multiplying `result.timeBonus`. Later zones give back less for the
  same clear.

Measured with `node tools/sim_players.js --seeds 40` (10 400 simulated level
attempts) against both source trees, Spring → Summer → Autumn → Winter:

| Metric | v0.2.0 | v0.3.0 |
|---|---|---|
| Casual, % of levels failed | 0.25 / 1.04 / 1.61 / 0.16 | 0.25 / 1.46 / 3.57 / 5.78 |
| Sloppy, % of levels failed | 12.0 / 31.3 / 28.9 / 23.0 | 12.0 / 34.0 / 40.5 / 41.7 |
| Naive, % of clears at 3★ | 73 / 37 / 52 / 57 | 73 / 37 / 32 / 16 |
| Sensible, % of clears at 3★ | 100 / 98 / 97 / 99 | 100 / 98 / 89 / 65 |

Every v0.2.0 figure said Winter was easier than Autumn, which is what Ben
rejected. The sensible player still clears every level (intended — the timer
grades good play rather than blocking it), but its Winter 3-star share falls from
99 % to 65 %, so the J-005 star thresholds finally bite in the late game.

**The simulation is now in the repo.** `prototype/tools/sim_players.js` was a
scratch script during the v0.1.0 QA pass and the numbers in this file could not
be reproduced from a clean checkout. It now ships: five player archetypes over
52 levels × N seeds, the real-clock model (flight, squash, bounces, mismatch
return + lockout, pop/effect/compaction animation, then the time bonus), with
`--time-ramp` and `--bonus-scale` for what-if sweeps and `--json` for the raw
rows. It reads the animation durations out of `js/game.js` and **throws** if one
is renamed rather than silently drifting, and it prints whether difficulty climbs
zone over zone.

**Why the climb criterion excludes one archetype (documented in the tool).** The
"child" archetype (3 s think, 40 % error) saturates near 75–80 % failure and
clears Winter marginally more often than Autumn, because Winter's smaller boards
mean fewer launches — it runs out of board before it runs out of clock. That is a
property of board capacity, not pacing, and tuning it away would over-tighten
Winter for everyone else. It is reported but not gated, and raised with Ben as
J-013.

**Verified:**

- `node tests/board_test.js` → `SUMMARY passed=55 failed=0 errors=0` (was 52).
  Three new checks: the banana sweep breaks every obstacle in its row; the
  zone-climb invariant over `TIME_RAMP` + `TIME_ZONE_SCALE`, written strictly so
  the old "never rises" tuning fails it; and a launch-level check that the
  per-zone scale actually reaches `result.timeBonus`.
- **Negative controls, both run.** The banana test includes an apple fired into
  the identical board asserting all three obstacles survive. All three new checks
  were re-run against the pre-change sources (`git show HEAD:` copies) and fail
  there — 53 passed / 2 failed for the tuning pair, 52 / 1 for banana — so none
  of them can pass by accident.
- `node tests/headless_smoke.mjs` → 14 passed, server killed by pid, port free.
- Deploy: 3 changed files written in place with fsync + read-back assertion
  (`js/board.js`, `js/config.js`, `js/game.js`), all 13 payload files sha256-equal
  source vs host both ways, no host-only files, `diff -rq` clean. Anonymous
  requests to the page, `js/game.js` and `assets/img/Apple.png` all 302 to
  `/login?next=…`. Deployed `GAME_VERSION` reads 0.3.0.

**Raised back to the design side (MSG-03):** J-013 (Winter's boards are the
smallest in the game — deliberate dense obstacle course, or should they be as
full as Autumn's?) and J-014 (time pressure was retuned under J-006, so Ben's
J-012 note about it needs a re-play on v0.3.0 before we act). The flick half of
J-012 was deliberately **not** touched — the two readings of "flick feels wrong"
point at opposite fixes, so MSG-03 asks four narrow questions instead of guessing.

**Changed files:** `prototype/js/board.js`, `prototype/js/config.js`,
`prototype/js/game.js` (`GAME_VERSION` 0.3.0), `prototype/tests/board_test.js`,
`prototype/tools/sim_players.js` (new), `prototype/dist/OrchardToss.html`,
`prototype/README.md`, `prototype/ARCHITECTURE.md`, `README.md`, `CLAUDE.md`,
`talk_to_other_claude.md`, this file; deployed copy in
`C:\PROD_DB\infra_router\router-server\hosted_apps\orchard-toss\`.

---

## 2026-09-03 — `talk_to_other_claude.md` — direct channel between the build and design Claudes; v0.2.0 version label fixed

**STATUS: LIVE.** New file at the repo root, requested by Jac ("like you did for Numbat
Patrol"). Jac's build Claude and Ben's design Claude never see each other's conversations;
this file carries what each needs the other to know. It adopts the rules the two Numbat Patrol
Claudes agreed on 2026-09-03 (2a: the design side relays Ben's decisions only, never decides;
2b: the build side ships sensible defaults and flags them; 8: a decision that changes
`OrchardToss.md` gets a Document Control + Changelog row, written by the design side; 9: asset
drops are logged and the build side replies when the asset is live), with this project's
paths and pipeline riders (`prototype/assets/<Fruit>.png` masters, `FRUITS` in
`tools/preprocess_assets.py`, no pipeline entry yet for non-fruit art). An "Open items" table
at the top is the fast scan — 12 rows seeded from the v0.1.0/v0.2.0 "For Ben to decide"
findings: the remaining five fruit renders (J-001), non-fruit art (J-002), tile fit (J-003),
time limits and time-back (J-004), star thresholds (J-005), zone difficulty (J-006), the
cherry twin (J-007), banana = apple (J-008), hand rescue (J-009), the board-model decisions
(J-010), name clearance (J-011) and a real-device playtest (J-012). Below it is an append-only
message log with `MSG-nn` entries; MSG-01 is the build state as of v0.2.0.

**Also fixed:** `GAME_VERSION` in `js/game.js` had been left at `0.1.0` through the v0.2.0 art
drop, so the hosted title screen read `v0.1.0`. Bumped to `0.2.0`, bundle rebuilt
(669 435 bytes, unchanged size), `node tests/board_test.js` 52/52, `node tests/headless_smoke.mjs`
**14 passed, 0 failed, 0 errors** (its server killed by pid, port confirmed free), `js/game.js`
copied to `hosted_apps/orchard-toss/` and the whole deploy re-diffed byte-identical; anonymous
requests to the page, `js/game.js` and `assets/img/Apple.png` all 302 to login.

Also new since v0.2.0: the repo is on GitHub at `JacVanWyk/OT_Game` (branch `main`, public),
with a root `README.md` and `.gitignore`.

Changed files: `talk_to_other_claude.md` (new), `prototype/js/game.js`,
`prototype/dist/OrchardToss.html`, `README.md`, `CLAUDE.md`, `RELEASE_NOTES.md`; deployed copy
`hosted_apps/orchard-toss/js/game.js`.

---

## 2026-09-02 — v0.2.0 — real clay fruit art (5 of 10 fruits)

**STATUS: VERIFIED + DEPLOYED.** Ben supplied clay-style renders for
apple, banana, cherry, pineapple and strawberry (`prototype/assets/<Fruit>.png`,
600–815 px square RGBA with transparent backgrounds; the same five are in
`OT_Assets_Clay.zip`). They now draw in every place a fruit appears: board
tiles, the flying fruit and cherry twin, the launcher cradle, and the HELD /
NEXT HUD slots. Live at **https://tools-app.net/hosted/orchard-toss/** —
13 files byte-identical to source (`index.html`, 6 scripts, the font, 5
images); anonymous requests to the page, `js/assets_manifest.js`,
`assets/img/Apple.png` and `assets/img/Cherry.png` all 302 to login.

**Pipeline (Numbat Patrol pattern).** `tools/preprocess_assets.py`
alpha-crops each master (alpha > 16 threshold so glow halos cannot inflate
the frame) and downsizes to 256 px on the longer side into `assets/img/`
(340 KB for all five), then regenerates `js/assets_manifest.js` as
`OT.AM = { apple: {src, w, h}, … }` keyed by the fruit **type id** so the
painter looks a tile's image up by `cell.type` directly. `js/assets.js`
preloads every manifest image (bundle data URIs first, relative paths
otherwise), snapshots `OT.S._proc.fruit`, and installs an image-drawing
`OT.S.fruit` **all-or-nothing** once every image has loaded; any failure
leaves the procedural painters untouched. The override draws the image with
its longer side at 0.95 × the painter's size (the renders carry stem and
leaf inside the crop, so bodies land at ~0.74 × size, the procedural ball's
0.76 diameter), with the same radial drop shadow and idle wobble, and
**delegates** to the procedural painter for watermelon, grape, pomegranate,
orange and lemon — so Summer+ boards mix real and procedural fruit by design
until Ben supplies the rest. `build_bundle.py` parses `OT.AM` out of the
manifest, embeds each PNG beside the font in `OT.AM_DATA`, and fails on a
missing / empty / non-PNG image or a data-URI count that differs from the
manifest. Bundle: 0.67 MB (was 0.21).

**Verified (headless, swiftshader Chromium).**

- `node tests/headless_smoke.mjs` → **14 passed, 0 failed, 0 errors**
  (was 12). The http boot and the `file://` bundle boot both require
  `OT.A.status === 'ready'`, 5/5 images loaded and `OT.S.fruit !==
  OT.S._proc.fruit`. New differential probe: each imaged fruit rendered
  through `OT.S.fruit` vs the procedural snapshot into 96² offscreen canvases
  at size 64 differs by 2 036–2 772 pixels. **Negative control:** grape,
  orange and watermelon render through the override with exactly **0**
  differing pixels while drawing 1 462–2 284 opaque pixels — proving the
  delegation path and that the differ can report zero.
- Size match measured, not eyeballed: real fruit opaque bbox 60 px tall at
  size 64 vs 62–68 for the procedural painters.
- `node tests/board_test.js` → `SUMMARY passed=52 failed=0 errors=0`
  (logic untouched).
- Screenshots after the change (not before): `assets/screens/playing_390x844.png`
  (Spring 5: all-real board, HUD slots, launcher) and
  `assets/screens/playing_autumn_390x844.png` (Autumn 8)
  with real banana/strawberry/apple beside procedural grape, watermelon,
  pomegranate and a coconut.
- Server hygiene: the smoke suite's `http.server` and the screenshot
  server were both killed by pid and their ports confirmed free with `ss -ltn`.

**For Ben to decide.** The two art styles sit side by side from Summer on
(clay renders vs flat-outlined procedural). The remaining five renders
(watermelon, grape, pomegranate, orange, lemon) drop in with one line each in
`tools/preprocess_assets.py`; coconut, obstacles, Sprout, the monkey and the
chrome are still procedural and have no pipeline entry yet. The board tile
fit (0.95) can be nudged in `js/assets.js` (`FIT`) if the real fruit read
as small on a phone.

**Not verified.** Real-device rendering of the 256 px sprites at DPR 3
(headless runs at DPR 1), and the hosted page past the login wall.

**Changed files.** `prototype/tools/preprocess_assets.py` (new),
`prototype/js/assets_manifest.js` (new, generated), `prototype/assets/img/*.png`
(new, 5), `prototype/assets/{Apple,Banana,Cherry,Pineapple,Strawberry}.png`
(new masters from Ben), `prototype/js/assets.js`, `prototype/index.html`,
`prototype/build_bundle.py`, `prototype/tests/headless_smoke.mjs`,
`prototype/dist/OrchardToss.html`, `prototype/ARCHITECTURE.md`,
`prototype/README.md`, `CLAUDE.md`, `RELEASE_NOTES.md`.

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
