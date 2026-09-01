# Orchard Toss prototype — architecture and module contract

Design source of truth: `../OrchardToss.md` (v3). Sibling pattern to copy: `/mnt/c/DEV_TEAM/CLAUDE/ben_game_1/prototype/` (Numbat Patrol). This file is the CONTRACT every module is built against. Builders work in parallel; if you need to deviate from a signature here, do it in your own module, document it at the top of your file, and keep the names below working.

## Non-negotiables (from Numbat Patrol, verified there)

- Plain `<script>` tags, one canvas, global namespace `window.OT`. **No ES modules, no `fetch`, no CDN** — must run by double-clicking `index.html` from `file://`.
- Load order in `index.html`: `js/config.js` → `js/board.js` → `js/sprites.js` → `js/assets.js` → `js/game.js`.
- All engine time advances in `update(dt)` on the game's own clock. Tests never use wall-clock sleeps; they call `OT.debug.step(seconds)`.
- `window.__ready = true` is set synchronously once `game.js` has initialised (canvas sized, state = 'splash'). `window.__assetsReady = true` when the font resolved (either outcome).
- Font: Fredoka Bold, self-hosted `assets/fonts/Fredoka-Bold.woff2`, loaded via the FontFace API (canvas `fillText` never triggers lazy `@font-face`; `document.fonts.check()` is a false green for unknown families). Stack: `Fredoka, "Trebuchet MS", "Segoe UI", Arial, sans-serif`.
- Background painting is split into an **ambient** pass (sky/ground/tilable, safe to spill into letterbox bars) and a **landmark** pass (the one-of-a-kind orchard tree, Sprout) that is drawn exactly once inside the logical field.
- Any full-screen overlay that appears at a state boundary gets a **0.8 s skip-grace** on the wall clock so residual flick input cannot dismiss it.
- Mobile-first: portrait, one hand, big touch targets (≥ 60 logical px).

## Logical field

Portrait logical field **W = 480, H = 854** (9:16). `game.js` scales it uniformly to fit the viewport (`visualViewport`), centres it, and paints the ambient pass over the whole canvas (bars included). All game coordinates are logical.

| Region | y range | Notes |
|---|---|---|
| HUD band | 0 – 118 | timer, score, remaining/target, hearts, held + next fruit preview |
| Board | 126 – 734 | 5 columns × 8 rows, cell = 76 px, board x from 50 to 430 (`BOARD_X = 50`, `BOARD_Y = 126`, `CELL = 76`) |
| Launcher zone | 734 – 854 | Sprout + basket launcher, drag/flick surface. Launcher centre y = 800 |

Cell (col, row) centre: `x = BOARD_X + col*CELL + CELL/2`, `y = BOARD_Y + row*CELL + CELL/2`. Row 0 is the TOP (the canopy/ceiling). The fired fruit travels UP from row 7 toward row 0.

## Gameplay model (the rules `board.js` implements)

Fruit tiles hang from the canopy: every column is compacted toward the TOP (row 0), so the launched fruit always hits the LOWEST tile in its lane. After any clear, tiles slide UP to close gaps ("the bunch tightens"). Obstacles are fixed cells that tiles cannot enter:

| Cell kind | Launched fruit travelling up | Tiles during compaction |
|---|---|---|
| `fruit` / `coconut` | impact | are tiles |
| `wall` (lean −1 or +1) | deflects sideways into `col+lean` at the same row (if that cell is a tile → impact there; if empty → continue up from there; if wall/trellis/pipe/off-board → try `col−lean`; both blocked → fruit returns) | blocks; a tile below a wall rests under it |
| `trellis` | stops the fruit → returns (mismatch, no impact) | blocks (acts as a floor for tiles below it, and as a ceiling for the segment above) |
| `pipe` | passes straight through vertically; a sideways deflection may NEVER enter a pipe cell | blocks — tiles never rest in a pipe |
| empty above row 0 (canopy) | fruit returns (mismatch) | — |

Match: impact tile type === launched type → clear the contiguous run of that type going UP from the impact cell, then apply the launched fruit's power-up, then chain effects, then compaction. Mismatch (different type, coconut, or no impact) → `matched:false`; the fruit returns to hand, `game.js` applies a launch lockout.

Coconut (`{kind:'coconut'}`, Autumn+; the doc's "tougher coconut-tier tiles", section 6): a hard tile that never matches; cleared only by type-agnostic power-up effects (strawberry cross, apple/banana row, watermelon splash, pomegranate random, lemon column, pineapple). It counts toward `remaining`. Generators cap coconuts so a level stays winnable.

Power-ups (section 5), applied when the LAUNCHED fruit matches:

| Fruit | Effect on top of the line clear |
|---|---|
| cherry | launches as a PAIR (redefined 2026-09-02 — the original "next tile up the column" reading was unreachable, 0 doubles in 381 launches, because compaction never leaves a gap): when the primary cherry matches, a TWIN cherry fires into the ADJACENT lane (the side whose impact is a cherry; else `TUNING.CHERRY_TWIN_SIDE`, left at the right edge) under the same wall/pipe/trellis rules. `result.twin = {col, path, deflections, impact, matched}` or null. If the twin also hits a cherry run, that run clears too (cells in `powerup.cells`, `burst` at the twin impact) and the launch scores ×2 (`result.cherryDouble = true`); a twin mismatch just returns, no penalty. Measured 22% of cherry launches double. |
| strawberry | clears the plus-shaped cross (impact ± 1 row/col), any tile kind, obstacles untouched |
| apple | clears the impact row (all tile kinds) |
| watermelon | clears the 8 neighbours of the impact (all tile kinds) |
| grape | clears the whole 4-connected same-type cluster containing the impact, instead of just the vertical run |
| banana | monkey sweeps the impact row (mechanically = apple; distinct `effects` entry `{kind:'monkey', row}` for presentation) |
| pomegranate | clears 5 random tiles elsewhere on the board (seeded RNG) |
| pineapple | breaks ONE obstacle (wall/trellis/pipe/coconut) 4-adjacent to the impact; if none adjacent, none |
| orange | chain reaction: every 4-connected same-type cluster of size ≥ 2 that touches any cleared cell also clears, repeated up to 4 rounds; `result.chain` = clusters cleared |
| lemon | clears the impact column (all tile kinds, both sides of obstacles) |

Level clear when `remaining < target` (section 14). `target = max(2, round(initialFruit * 0.10))`. Score: 10/tile in the run, 15/tile from power-ups, ×2 cherry double, ×(1 + 0.5·chain) orange. Time bonus (section 11): +0.25 s per run tile, +0.5 s per power-up tile, capped at +3 s per launch → `result.timeBonus` (`OT.Board.TUNING.TIME_RUN/TIME_POWER/TIME_CAP`; halved from 0.5/1.0/5 on 2026-09-02 because the original values refunded the whole level). Generation tunables added the same day: `CLUSTER_BIAS` 0.55 (a new tile copies the type above it with that probability → mean matched run 1.12 → 1.67) and `DRAW_LOOKAHEAD` 3 (queue entries are drawn against a greedy-played copy of the board → hand-rescue rate 55% → 21.5%).

## `js/config.js` — `OT.CONFIG` (owned by the board builder)

```js
OT.CONFIG = {
  W: 480, H: 854, COLS: 5, ROWS: 8, CELL: 76, BOARD_X: 50, BOARD_Y: 126, LAUNCH_Y: 800,
  FRUITS: ['cherry','strawberry','apple','watermelon','grape','banana','pomegranate','pineapple','orange','lemon'],
  ZONES: [ {id:'spring', name:'Spring', levels:10, fruits:['cherry','strawberry','apple']},
           {id:'summer', name:'Summer', levels:12, fruits:['watermelon','grape','banana']},
           {id:'autumn', name:'Autumn', levels:14, fruits:['pomegranate','pineapple']},
           {id:'winter', name:'Winter', levels:16, fruits:['orange','lemon']} ],
  HEARTS_MAX: 5, HEART_REFILL_MS: 30*60*1000,
  LOCKOUT_S: 0.6, FLIGHT_SPEED: 1100 /* px/s */, STAR_FRACTIONS: [0.8, 0.5] /* ≥80% time left = 3★, ≥50% = 2★, else 1★ (was [0.5, 0.25]: gave 3★ to everyone) */,
  levelDef(n) -> LevelDef   // n = 1..52
}
```

`LevelDef = { n, zone:'spring'|…, zoneIndex:0..3, indexInZone, rows:8, cols:5, fill:0.5..0.75, timeLimit:45..60, fruits:[types unlocked so far, cumulative across zones — a NEW zone's fruits are introduced one at a time over its first levels], obstacles:{walls, trellis, pipes, coconuts} }`. Spring: no obstacles, no coconuts (section 7). Summer: walls 1→2. Autumn: walls 2, trellis 1, coconuts 1→2. Winter: walls 2→3, trellis 1→2, pipes 1→2, coconuts 2. Times (`TIME_RAMP`, retuned 2026-09-02): Spring 45 s tapering to 38, later zones 40→32 (the original 60→50 / 55→45 never bit: every player archetype cleared with 90–100% time left). These are tunables — keep them in this one place.

## `js/board.js` — `OT.Board` (pure logic, no DOM, no canvas)

Must also work in Node: end the file with `if (typeof module !== 'undefined') module.exports = OT.Board;` and guard `window` access. Deterministic: every random draw goes through the board's seeded RNG (mulberry32 or similar) so a `(levelDef, seed)` pair always yields the same board and the same power-up rolls.

```js
OT.Board.create(levelDef, seed) -> board
board = {
  cols, rows, seed, levelDef,
  cells: Array(rows) of Array(cols) — null | {kind:'fruit', type} | {kind:'coconut'} | {kind:'wall', lean:-1|1} | {kind:'trellis'} | {kind:'pipe'},
  initialFruit, remaining, target,          // remaining counts fruit + coconut tiles
  held: type, queue: [type, type, type],    // queue is drawn from types PRESENT on the board (weighted by count of tiles that are currently the lowest in their column), so the held fruit almost always has a target
  moves: 0, score: 0
}
OT.Board.launch(board, col) -> result      // MUTATES board (cells, remaining, held, queue, score, moves)
result = {
  col, launched: type,
  path: [{col,row}, …],            // cells traversed, from row 7 upward, including sideways deflection steps; last entry = the cell where the fruit stopped/impacted
  deflections: [{col,row,lean}],   // walls hit, for bounce presentation
  impact: {col,row} | null,        // tile hit (fruit or coconut), null if it reached the canopy/trellis
  matched: bool,
  run: [{col,row,type}],           // the contiguous line cleared by the match itself
  powerup: null | {type, cells:[{col,row,kind,type?}]},   // cells cleared by the power-up (beyond the run)
  chain: 0..n, cherryDouble: bool,
  cleared: [{col,row,kind,type?}], // union of run + powerup + chain, in clearing order (for pop animation)
  broken: [{col,row,kind}],        // obstacles broken by pineapple
  effects: [ {kind:'splash', col,row,type} | {kind:'monkey', row} | {kind:'lemonColumn', col} | {kind:'appleRow', row} | {kind:'cross', col,row} | {kind:'burst', col,row} | {kind:'seeds', cells:[…]} | {kind:'chain', round, cells:[…]} ],
  compaction: [{from:{col,row}, to:{col,row}}], // every tile that slid up, for easing
  scoreDelta, timeBonus,
  remaining, target, levelCleared: bool,
  held, queue                       // the new hand after this launch (unchanged on mismatch)
}
OT.Board.lowestTile(board, col) -> {col,row} | null   // helper used by game.js for aiming hints
OT.Board.snapshot(board) -> string   // compact text render of the grid for tests/logs, e.g. rows of "C S A . ." with 'w<' 'w>' 'T' 'P' 'K'(coconut)
OT.Board.isWinnable(board) -> bool   // static check: fruit not sealed behind trellises/coconuts ≤ target-1
OT.Board.rng(seed) -> () => float    // exposed so game.js can share the seeded RNG for presentation
```

Generation rules (`create`): place obstacles first — walls in rows 2..6, never in row 7, never two obstacles vertically adjacent in the same column, never in a column where it would seal more than 2 tiles; trellis only in rows 1..2; pipes in rows 3..6; coconuts placed like fruit tiles (compacted). Then fill: `tileCount = round(fill * freeCells)`, each column gets at most `freeCellsInColumn - 1` tiles so row 7 stays empty in every column (launch travel room); tiles compact toward the top within their segment. Types drawn uniformly from `levelDef.fruits` with a guarantee that every present type appears at least twice. Reject and regenerate (new derived seed) until `isWinnable` and every column has at least one reachable tile or the board has ≥ 3 reachable tiles. Cap regeneration at 50 tries and then return the last board (log a warning via `board.warnings`).

## `js/sprites.js` — `OT.S` (procedural canvas painters, no game logic)

All painters take `ctx` first and draw centred on `(x, y)` unless stated. `t` = seconds for idle wobble/shine animation. Seasons: `'spring'|'summer'|'autumn'|'winter'`. Style: bright, saturated, glossy mobile-casual (Cook & Merge / Match Factory), thick dark outlines, top-left specular shine, drop shadows. Reuse the chrome language of Numbat Patrol: port `S.banner` / `S.button` from `ben_game_1/prototype/js/sprites.js` (colour-blocked banner with bold white headline, chunky pill button with highlight strip, label outline Deep Navy `#335D7C`). Button end caps must scale proportionally, never stretch.

```js
OT.S.PALETTE = { spring:{sky, skyLow, ground, groundDark, accent, banner, button, text}, summer:{…}, autumn:{…}, winter:{…} }
  // section 8: spring soft pastels/blossom; summer vivid warm; autumn deep amber/burgundy; winter cool blue-green + citrus brights
OT.S.FRUIT_COLORS = { cherry:{main, dark, shine}, … }    // one entry per fruit
OT.S.fruit(ctx, type, x, y, size, t)         // size = diameter of the tile art (use 0.82*CELL in the grid); cherry draws TWO cherries on one stem
OT.S.coconut(ctx, x, y, size, t)
OT.S.wall(ctx, x, y, size, lean, season)     // fence post / branch slanted toward lean
OT.S.trellis(ctx, x, y, size, season)        // overhead trellis / vine canopy bar
OT.S.pipe(ctx, x, y, size, season)           // irrigation pipe / hollow log, open top & bottom
OT.S.background(ctx, w, h, season, t)        // AMBIENT ONLY: sky gradient, distant hills, ground band; tileable, may spill into bars
OT.S.landmarks(ctx, W, H, season, progress, t) // ONE orchard tree (grows with progress 0..1 through the zone: sapling → blossom → fruiting), fence, sun/moon; drawn once inside the field, behind the board
OT.S.boardFrame(ctx, x, y, w, h, season)     // trellis frame around the play grid, canopy strip across the top
OT.S.sprout(ctx, x, y, size, stage, mood, t) // stage 0..3 (grows with zones: bigger, more confident pose), mood 'idle'|'aim'|'cheer'|'sad'; child, gender-neutral, overalls + sun hat + apron, seed basket
OT.S.launcher(ctx, x, y, w, heldType, locked, t) // basket/slingshot cradle at the bottom; heldType drawn in the cradle; locked = greyed + wobble
OT.S.monkey(ctx, x, y, size, t)              // banana power-up sweeper
OT.S.splash(ctx, x, y, type, p)              // juice splash burst, p = 0..1
OT.S.heart(ctx, x, y, size, filled)
OT.S.star(ctx, x, y, size, filled)
OT.S.banner(ctx, cx, cy, w, h, color, text, s)   // s = text size
OT.S.button(ctx, cx, cy, w, h, color, text, s)
OT.S.panel(ctx, x, y, w, h, color)           // rounded glossy HUD panel
OT.S.text(ctx, txt, x, y, size, color, align, outline) // Fredoka stack helper with optional outline
OT.S.font(size) -> string                    // "bold 24px Fredoka, …"
```

`tools/spritesheet.html` renders every painter (all 10 fruits at 3 sizes, coconut, 3 obstacles × 4 seasons, Sprout 4 stages × 4 moods, launcher, monkey, splash frames, hearts/stars, banner/button/panel, 4 backgrounds + landmarks at progress 0/0.5/1) into one labelled canvas so the whole art set can be screenshot-reviewed in one image.

## `js/assets.js` — font loader (port from Numbat Patrol `assets.js`)

Only job: load Fredoka via `FontFace` from `(OT.AM_DATA && OT.AM_DATA['Fredoka-Bold']) || 'assets/fonts/Fredoka-Bold.woff2'`, add to `document.fonts`, then set `window.__assetsReady = true` on success OR failure. Expose `OT.A = { fontReady: bool, fontError: string|null }`.

## `js/game.js` — `OT.game` / `OT.debug`

State machine: `'splash'` (logo + pulsing dots until `__assetsReady`, then ≥ 2.5 s) → `'title'` (TAP TO START; shows hearts and continue-level) → `'zoneIntro'` (season banner + Sprout, first level of a zone only) → `'playing'` → `'levelClear'` (stars, score, NEXT button) | `'levelFail'` (Sprout sad, heart lost, RETRY/QUIT) → `'zoneAd'` (monetisation stub: full-screen "AD BREAK" placeholder card with a countdown and a SKIP after 3 s — shown ONLY on zone transitions, section 15) → back to `'zoneIntro'`. `'noHearts'` when hearts are 0 (shows time to next heart). `'paused'` overlay via a paw-style pause button (reuse the Numbat pattern: game clock frozen, dimmed scene, RESUME).

Playing loop (sections 10–14):
- Timer counts down on the game clock; `result.timeBonus` is added on a match with a floating "+2.0 s" popup.
- Input = drag-and-flick, ONE gesture (section 12): pointerdown anywhere in the launcher zone (y > 700) or on the launcher starts a drag; launcher x follows the pointer, snapping to the nearest lane centre on release. A flick is a release whose upward velocity over the last 100 ms exceeds 500 logical px/s OR whose upward displacement exceeds 40 px; it launches into the lane the launcher is over. Release without a flick just repositions. Desktop: ←/→ move lanes, Space/↑ launch (build-plan convenience, not in the doc).
- Launch: `OT.Board.launch(board, lane)`; animate the fruit along `result.path` at `FLIGHT_SPEED`, bouncing at each deflection; at the end apply presentation: matched → pop every `cleared` cell in order (juice `splash`, score popup, spawn 2–3 physics "juice drops"/fruit-chunks that fall with gravity, bounce once on the launcher-zone floor and fade), run the effect cues (`monkey` sprints along the row, `lemonColumn` zip, `appleRow` swipe, `cross`, `burst`, `seeds`, `chain` rounds), then ease `compaction` moves over 0.18 s. Mismatch → the fruit bounces back down to the launcher with a wobble; lockout `LOCKOUT_S` (launcher greyed, shake, "MISS" popup). The board's `held`/`queue` swap is applied when the flight resolves.
- Physics presentation (section 8, required): the launched fruit rolls (rotates with travel), squashes on impact, bounces at walls; cleared fruit chunks and juice drops use simple gravity + one floor bounce. Keep it all in `update(dt)`.
- HUD: timer panel (turns red < 10 s), score, `remaining / target` as "FRUIT LEFT 14 → 3", hearts row, HELD + NEXT preview. Zone/level label banner e.g. "SUMMER 3".
- Level clear: stars from `STAR_FRACTIONS` on `timeLeft / timeLimit`; persist. Level fail: hearts −1, persist; if 0 → `'noHearts'`.
- Persistence: `localStorage['ot.save']` = `{ v:1, nextLevel, stars:{[n]:1..3}, hearts, heartsAt (ms timestamp of last decrement), best }`. Hearts refill 1 per `HEART_REFILL_MS` computed from `heartsAt` on load and on each title/fail screen; never above `HEARTS_MAX`. Wrap every storage access in try/catch.
- Meta-progression (section 6/9): `landmarks(progress)` where progress = levels cleared in the current zone / zone length; Sprout `stage` = zoneIndex.
- Ambient bars: paint `OT.S.background` over the full canvas first, then translate/scale into the field and draw landmarks + board + HUD.

Debug/test surface (all synchronous):
```js
window.__ready = true                  // after init
OT.game = { state, clock, level (1..52), zone, zoneIndex, score, timeLeft, timeLimit, hearts, remaining, target, held, queue, lockout, board, stars, flight (null|{...}), start(), pause(), resume(), paused }
OT.debug = {
  step(seconds),          // advances the game clock in ≤ 1/60 s ticks through update(); the ONLY way tests move time
  launch(col),            // as if the player flicked into lane col (respects lockout/flight; returns false if refused)
  resolve(),              // steps until the current flight and all pops/compaction finish (bounded, ≤ 10 s of game time)
  skipTo(n),              // jump to level n (1..52) in 'playing' with a fresh board
  setTimeLeft(s), clearLevel(), failLevel(), addHearts(k),
  seed(n),                // set the seed used for the NEXT board
  view()                  // { dpr, scale, ox, oy, cssW, cssH }
}
```
`step` while paused advances nothing (the pause proof). `launch` MUST drive exactly the same code path as a real flick.

## `build_bundle.py`

Port of Numbat Patrol's: inline the five scripts in order, embed `Fredoka-Bold.woff2` as `OT.AM_DATA['Fredoka-Bold']` (base64 data URI) injected before `config.js`, write `dist/OrchardToss.html`. Fail loudly if any script anchor is missing/duplicated/out of order, if the font is missing, or if any external `src=`/`href=` survives. Print the size.

## Tests

- `tests/board_test.js` — Node, zero deps: `node tests/board_test.js` exits 0 only if every assertion passes AND zero errors were thrown (count both). Covers: deterministic create by seed; compaction invariant (no gaps below the top of any segment) after every launch; each of the 10 power-ups on a hand-built fixture board (set `board.cells` directly, then `launch`); wall deflection both leans, pipe blocks sideways entry, trellis returns the fruit, coconut mismatch; cherry double; orange chain rounds; `remaining` bookkeeping equals a recount of the grid after every launch; level clear at `remaining < target`; all 52 `levelDef`s generate winnable boards for 5 seeds each (260 boards); a fuzz of 2 000 random launches never throws and never violates the compaction/recount invariants. Include NEGATIVE CONTROLS: deliberately corrupt a cell and prove the recount assertion fails.
- `tests/headless_smoke.mjs` — drives `~/.claude/tools/browser-harness/run.mjs` against a local `http.server` (ES-module harness needs an HTTP origin; the game itself is file-safe) and against `dist/OrchardToss.html` on `file://`: boots to `__ready`, `__assetsReady`, title → playing via `OT.game.start()`, `OT.debug.launch()` + `resolve()` changes `remaining`, timer decreases with `step`, `skipTo(52)` boots the last level, `failLevel()` drops a heart, a screenshot of playing at 390×844 and 844×390, and a rendered-pixel probe that the board region is not the background colour. Prints PASS/FAIL per check and exits non-zero on any failure.
