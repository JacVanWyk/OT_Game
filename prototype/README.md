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
- **Timer:** Spring 45→38 s, later zones 40→32 s per level, counting down on
  the game clock; each clear adds time back (+0.25 s per run tile, +0.5 s per
  power-up tile, capped at +3 s per launch — `OT.Board.TUNING.TIME_*`). Time
  out = level failed. (Retuned 2026-09-02: the first values, 60→45 s with a
  0.5/1.0/5 bonus, refunded the whole level for every player archetype.)
- **Hearts:** shared pool of 5; −1 per failed attempt; refill 1 per 30 min
  (from the timestamp of the last loss, persisted in `localStorage`). At 0
  hearts the game shows the time to the next heart.
- **Stars:** 1–3 on level clear from time remaining: ≥ 80 % of the limit
  left = 3★, ≥ 50 % = 2★, else 1★ (tunable, `STAR_FRACTIONS`; was 50/25 %,
  which gave 3★ to everyone).
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
| Cherry | grows in pairs | launches as a pair — a twin cherry fires into the adjacent lane (the side showing a cherry, else right); if the twin also hits a cherry run it clears too and the launch scores ×2, a twin miss just returns with no penalty |
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

- Single page: `index.html` + six plain `<script>` tags, in this order and
  no other: `js/assets_manifest.js` → `js/config.js` → `js/board.js` →
  `js/sprites.js` → `js/assets.js` → `js/game.js`. Global namespace `window.OT`. **No ES
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
- **Real fruit art (v0.2.0):** Ben's clay-style renders live as masters in
  `assets/<Fruit>.png`; `python3 tools/preprocess_assets.py` alpha-crops and
  downsizes them to 256 px into `assets/img/` and regenerates
  `js/assets_manifest.js` (`OT.AM`, keyed by fruit type id). `js/assets.js`
  preloads them and swaps `OT.S.fruit` for an image painter all-or-nothing;
  fruits without a render yet (watermelon, grape, pomegranate, orange, lemon)
  keep their procedural painter through the same call, so Summer+ boards mix
  the two styles until the roster is complete. The bundle embeds the images
  as `OT.AM_DATA[typeId]` data URIs.
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
python3 tools/preprocess_assets.py  # masters assets/<Fruit>.png -> assets/img/ (256 px, alpha-cropped) + js/assets_manifest.js; fails loudly on a missing/non-RGBA master
node tests/board_test.js            # pure-logic suite (Node, zero deps); exit 0 only if every assertion passes and nothing threw
python3 build_bundle.py             # -> dist/OrchardToss.html (font + fruit images embedded); fails loudly on a missing script/font/image, a missing/duplicated/out-of-order <script> anchor, or a surviving external src=/href=
python3 build_bundle.py --zip 0.2.0 # ...plus dist/OrchardToss_prototype_v0.2.0.zip of the authoring folder (index.html, js/, assets/fonts/, assets/img/, README.md)
node tests/headless_smoke.mjs       # headless browser suite: starts its own http.server on a scratch port, runs each check through the browser harness, boots the file:// bundle if built, screenshots to assets/screens/, kills the server and confirms the port is free
```

`headless_smoke.mjs` exit codes: `0` every check passed · `1` any FAIL or
thrown error · `2` browser harness missing · `3` SKIP because the game is
not built yet (index.html or a script file absent) — never a silent 0.

## Verified (v0.2.0, 2026-09-02 — real fruit art)

- `node tests/headless_smoke.mjs` → 14 passed. New: the http boot and the
  `file://` bundle boot both reach `OT.A.status === 'ready'` with 5/5 images
  and `OT.S.fruit` overridden; a differential probe renders each imaged
  fruit through `OT.S.fruit` and `OT.S._proc.fruit` into offscreen canvases
  (2 036–2 772 differing pixels of a 96² canvas at size 64) and its negative
  control shows grape, orange and watermelon render with **0** differing
  pixels through the override while drawing 1 400+ opaque pixels.
- Image fit measured against the procedural painters at the same size:
  opaque bbox 60 px tall for every real fruit vs 62–68 for the procedural
  ones at size 64 (bodies ~0.74 × size both ways).
- Screenshots after the change: Spring 5 (all real) and Autumn 8 (real
  banana/strawberry/apple beside procedural grape/watermelon/pomegranate and
  a coconut) — see `RELEASE_NOTES.md`.
- `node tests/board_test.js` unchanged at 52/52; bundle 0.67 MB boots from
  `file://` with every image from data URIs.

## Verified (v0.1.0, 2026-09-02 — headless, swiftshader Chromium)

- `node tests/board_test.js` → `SUMMARY passed=52 failed=0 errors=0`: 260-board
  winnability sweep (52 levels × 5 seeds, 0 warnings), 2 000-launch fuzz,
  recount + compaction invariants after every launch, all 10 power-ups on
  fixtures, both wall leans, pipe/trellis/coconut rules, cherry twin (match,
  miss, edge, pipe, trellis, deflection), orange chain rounds, and three
  negative controls that prove the invariants can fail.
- `node tests/headless_smoke.mjs` → 12 passed: http boot, title → playing,
  launch + resolve changes `remaining`, timer follows `step`, `skipTo(52)`
  boots Winter, `failLevel` drops one heart, pause proof, 390×844 and
  844×390 screenshots, rendered-pixel probe with its sky negative control,
  and the `file://` bundle boot with Fredoka resolved.
- Every one of the 10 power-ups launched once in the real game with its
  effect cue rendered and `remaining`/score/time-bonus matching the board's
  result; wall deflection, trellis return (+ lockout, re-launch refused
  during lockout), and pipe pass-through exercised on Winter boards.
- Cherry twin: 4 791-launch fuzz over 800 boards (746 twin flights, 351
  doubles) with 0 state failures; a double scores (10 + 2×15) × 2 = 80.
- HUD text contrast measured ≥ 5.2:1 on every value; the canopy strip
  changes 0 pixels in the HUD band (negative control: 3 294 with the old
  geometry); no HUD box overlaps at 390×844 or 360×640.
- Render-loop guard: a throwing painter no longer stops the loop (clock
  advanced 0.70 s over 700 ms wall with the error logged once).
- Persistence: level advance, heart loss, and heart refill (2 → 4 after
  61 min, timestamp advanced by exactly 60 min) survive a fresh boot.
- Screenshots of every state are in `assets/screens/`.

Not verified: real finger flicks on a phone (headless cannot gesture; the
debug launch drives the same `doLaunch` path), and the human feel of the
retuned time limits — the numbers came from a sensible-player simulation.
