# Orchard Toss — Browser Prototype

A browser prototype of **Orchard Toss** (working title), built to the design doc
`../OrchardToss.md` (v3, 2026-09-01) and the module contract in
`ARCHITECTURE.md`. It is a Flipull / Plotting-inspired (Taito, 1989) portrait
tile-matching puzzle: **Sprout**, a young orchardist's apprentice, drags a
launcher along the bottom edge and flicks a held fruit UP into a 5-lane board;
a fruit that hits a matching fruit clears the contiguous same-type line and
fires that fruit's power-up. Sibling project: **Numbat Patrol** in
`../../ben_game_1/prototype/` — same stack, same UI chrome, its own palette.

This prototype exists to test the drag-and-flick control scheme, the
power-up roster, and the per-level pacing; it is not the shipping game.

## How to run

- **Simplest:** double-click `index.html`. The prototype is deliberately
  `file://`-safe — no server, no build step, no network access needed.
- **On a phone/tablet (LAN):** from this `prototype/` directory run
  `python3 -m http.server`, then open `http://<your-machine-ip>:8000/` on the
  device. Stop the server when done (Ctrl-C; confirm with `ss -ltn`).
- **Single file:** `python3 build_bundle.py` writes `dist/OrchardToss.html`
  (scripts inlined, font embedded) — send that one file anywhere and
  double-click it.

## Controls

Drag-and-flick, one continuous gesture (design doc section 12):

| Input | Action |
|---|---|
| Touch down in the launcher zone (bottom band) and drag sideways | Launcher follows the finger; snaps to the nearest lane centre on release |
| Flick upward in the same motion (upward velocity > 500 px/s over the last 100 ms, or > 40 px upward travel) | Launches the held fruit into the lane the launcher is over |
| Release without a flick | Just repositions the launcher |
| Pause button (HUD) | Freezes the game clock, dims the scene, RESUME to continue |

Desktop convenience (build-plan intent, not in the design doc): **←/→** move
lanes, **Space** or **↑** launch.

## Gameplay rules (as designed — see `ARCHITECTURE.md` for the exact model)

- **Board:** 5 columns × 8 rows. Fruit tiles hang from the canopy (every
  column is packed toward the TOP), so the fruit you fire always hits the
  LOWEST tile in its lane. After a clear the column slides up to close the gap.
- **Match:** hit a tile of the same type → the contiguous run of that type
  going UP clears, then the launched fruit's power-up fires, then chains, then
  the columns tighten. **Mismatch** (different type, coconut, or no tile) →
  the fruit returns to hand and the launcher locks for 0.6 s.
- **Level clear:** when `remaining < target`, where
  `target = max(2, round(initialFruit × 0.10))`. Levels start about 50–75 %
  full.
- **Timer:** 45–60 s per level counting down on the game clock; each clear
  adds time back (+0.5 s per run tile, +1.0 s per power-up tile, capped at
  +5 s per launch). Time out = level failed.
- **Hearts:** shared pool of 5; −1 per failed attempt; refill 1 per 30 min
  (from the timestamp of the last loss, persisted in `localStorage`). At 0
  hearts the game shows the time to the next heart.
- **Stars:** 1–3 on level clear from time remaining: ≥ 50 % of the limit
  left = 3★, ≥ 25 % = 2★, else 1★ (tunable, `STAR_FRACTIONS`).
- **Score:** 10 per run tile, 15 per power-up tile, ×2 on a cherry double,
  ×(1 + 0.5 × chain) for orange chains.

### Zones (fixed order, 52 levels)

| Zone | Levels | New fruit | Obstacles / coconuts |
|---|---|---|---|
| Spring | 1–10 | cherry, strawberry, apple | none (tutorial zone) |
| Summer | 11–22 | watermelon, grape, banana | walls 1→2 |
| Autumn | 23–36 | pomegranate, pineapple | walls 2, trellis 1, coconuts 1→2 |
| Winter | 37–52 | orange, lemon (greenhouse citrus) | walls 2→3, trellis 1→2, pipes 1→2, coconuts 2 |

Fruit unlocked in earlier zones stays in play; a new zone's fruit is
introduced one type at a time over its first levels. The orchard tree in the
background grows with progress through each zone and Sprout grows a stage
per zone.

### Fruit and power-ups (fire when the LAUNCHED fruit matches)

| Fruit | Real trait | Power-up |
|---|---|---|
| Cherry | grows in pairs | launches as a pair — if the next tile up is also a cherry that run clears too and the launch scores ×2 |
| Strawberry | seeds across the surface | clears a plus-shaped cross around the impact (any tile kind) |
| Apple | crisp, whole | clears the impact row |
| Watermelon | bursts messily | clears the 8 neighbours of the impact (any type) |
| Grape | grows in a bunch | clears the whole connected same-type cluster, not just the line |
| Banana | monkeys' favourite | a monkey sweeps the impact row |
| Pomegranate | scatters seeds | clears 5 random tiles elsewhere |
| Pineapple | tough, spiky | breaks ONE obstacle adjacent to the impact |
| Orange | segmented | chain reaction into touching same-type clusters (up to 4 rounds) |
| Lemon | sharp, sour | clears the impact column |

### Obstacles (Summer onward, randomly generated per zone rules)

| Cell | Launched fruit travelling up | Tiles |
|---|---|---|
| Wall (fence post / branch, leans left or right) | deflects sideways into the leaned-to lane and continues | blocks |
| Trellis (overhead canopy bar) | stops the fruit — it returns as a mismatch | acts as a floor/ceiling |
| Pipe (irrigation pipe / hollow log) | passes straight through; a sideways deflection may never enter one | tiles never rest in it |
| Coconut (Autumn+) | never matches; cleared only by type-agnostic power-ups; counts toward `remaining` | is a tile |

### Monetisation stub

A full-screen "AD BREAK" placeholder with a countdown and a SKIP after 3 s,
shown ONLY at zone transitions (Spring → Summer etc.), never between levels
(design doc section 15).

## Tech notes

- Single page: `index.html` + five plain `<script>` tags, in this order and
  no other: `js/config.js` → `js/board.js` → `js/sprites.js` →
  `js/assets.js` → `js/game.js`. Global namespace `window.OT`. **No ES
  modules, no `fetch`, no CDN** — browsers block both on `file://`.
- Logical field 480 × 854 (9:16 portrait), scaled uniformly to the viewport
  and centred; the ambient background (sky / hills / ground) is painted over
  the whole canvas including letterbox bars, while one-of-a-kind landmarks
  (the orchard tree, Sprout) are drawn exactly once inside the field.
- All engine time advances in `update(dt)` on the game's own clock. Any
  full-screen overlay at a state boundary carries a 0.8 s wall-clock
  skip-grace so a residual flick cannot dismiss it.
- `js/board.js` is pure logic (no DOM) and also runs under Node
  (`module.exports` guarded), which is what `tests/board_test.js` exercises.
- **Font:** Fredoka Bold, self-hosted at `assets/fonts/Fredoka-Bold.woff2`
  (latin subset, OFL), loaded via the FontFace API in `js/assets.js`. Canvas
  `fillText` never triggers lazy `@font-face` loads and
  `document.fonts.check()` is a false green for unknown families, so
  readiness is the load promise (`window.__assetsReady`), not a check. The
  bundle embeds it as `OT.AM_DATA['Fredoka-Bold']`.
- Mobile-first, touch-first; designed for later Android packaging with the
  `apk_engine` Capacitor/WebView toolchain (not done yet — browser-only).
- `tools/spritesheet.html` renders every procedural painter into one
  labelled canvas for art review (dev-only, not deployed).

## Headless test hooks

Surface defined by `ARCHITECTURE.md` (all synchronous):

- `window.__ready` — `true` once `game.js` has initialised (canvas sized,
  state `'splash'`). Poll it; never use an async wait predicate.
- `window.__assetsReady` — `true` once the font resolved, either outcome.
  `OT.A = { fontReady, fontError }` says which.
- `OT.game` — `{ state, clock, level (1..52), zone, zoneIndex, score,
  timeLeft, timeLimit, hearts, remaining, target, held, queue, lockout,
  board, stars, flight, paused, start(), pause(), resume() }`.
  States: `splash → title → zoneIntro → playing → levelClear | levelFail →
  zoneAd → zoneIntro …`, plus `noHearts` and `paused`.
- `OT.debug` —
  - `step(seconds)` — advances the game clock in ≤ 1/60 s ticks through
    `update()`; the ONLY way tests move time (advances nothing while paused).
  - `launch(col)` — as if the player flicked into lane `col`; same code path
    as a real flick; returns `false` if refused (lockout / flight in progress).
  - `resolve()` — steps until the flight, pops and compaction finish
    (bounded, ≤ 10 s of game time).
  - `skipTo(n)` — jump to level `n` in `'playing'` with a fresh board.
  - `setTimeLeft(s)`, `clearLevel()`, `failLevel()`, `addHearts(k)`.
  - `seed(n)` — seed for the NEXT board.
  - `view()` — `{ dpr, scale, ox, oy, cssW, cssH }`.
- `OT.Board` — the pure board API (`create`, `launch`, `lowestTile`,
  `snapshot`, `isWinnable`, `rng`); `OT.CONFIG` — all tunables.

Example, using the global harness:

```bash
node ~/.claude/tools/browser-harness/run.mjs http://localhost:8000/ \
  --wait "window.__ready===true && window.__assetsReady===true" \
  --eval "(()=>{OT.debug.skipTo(3); OT.debug.launch(2); OT.debug.resolve(); return {remaining: OT.game.remaining, state: OT.game.state}})()"
```

## Build and test

```bash
# from prototype/
node tests/board_test.js            # pure-logic suite (Node, zero deps); exit 0 only if every assertion passes and nothing threw
python3 build_bundle.py             # -> dist/OrchardToss.html; fails loudly on a missing script/font, a missing/duplicated/out-of-order <script> anchor, or a surviving external src=/href=
python3 build_bundle.py --zip 0.1.0 # ...plus dist/OrchardToss_prototype_v0.1.0.zip of the authoring folder (index.html, js/, assets/fonts/, README.md)
node tests/headless_smoke.mjs       # headless browser suite: starts its own http.server on a scratch port, runs each check through the browser harness, boots the file:// bundle if built, screenshots to assets/screens/, kills the server and confirms the port is free
```

`headless_smoke.mjs` exit codes: `0` every check passed · `1` any FAIL or
thrown error · `2` browser harness missing · `3` SKIP because the game is
not built yet (index.html or a script file absent) — never a silent 0.

## Verified

_Nothing yet._ Integration verification is pending: no claim in this README
has been confirmed against a running build. The integrator fills this section
from headless evidence (`tests/headless_smoke.mjs` output, screenshots in
`assets/screens/`, `tests/board_test.js` counts) once the five modules land.
