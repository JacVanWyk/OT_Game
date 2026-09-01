/* Orchard Toss — js/board.js
 * OT.Board: pure game logic (no DOM, no canvas), deterministic via a seeded RNG (mulberry32).
 * Plain script, ES2015 max. Works in the browser (window.OT) and in Node (module.exports).
 * Contract: ARCHITECTURE.md, "Gameplay model" and "js/board.js".
 *
 * Grid: cells[row][col], row 0 = TOP (canopy). Launched fruit enters at row rows-1 and travels UP.
 * Cell values: null | {kind:'fruit', type} | {kind:'coconut'} | {kind:'wall', lean:-1|1} | {kind:'trellis'} | {kind:'pipe'}
 *
 * ADDITIONS beyond the contract (no contract signature changed):
 *   OT.Board.trace(board, col)      -> {path, deflections, impact}  non-mutating launch path (aiming hints)
 *   OT.Board.parse(text, opts)      -> board   inverse of snapshot(): builds a fixture board from grid text
 *   OT.Board.recount(board)         -> board   recompute initialFruit/remaining/target from cells (after editing cells)
 *   OT.Board.reachableTypes(board)  -> {type: count}  the weights used for the queue draw
 *   OT.Board.TUNING                 -> scores / time bonus / generator caps (tunable without touching logic)
 *   board.warnings                  -> [] of strings (generator gave up after TUNING.GEN_TRIES)
 *
 * INTERPRETATIONS (documented decisions):
 *   - isWinnable: launch reachability is computed as a fixed point over column segments (a segment is a
 *     maximal run of non-obstacle cells in a column). Plain launches (any type, power-ups ignored) clear every
 *     fruit they can reach; coconuts are never cleared and keep blocking their lane. "Sealed" = every tile the
 *     simulation cannot clear (unreachable fruit + all coconuts). Winnable <=> sealed <= target-1 AND at least
 *     one fruit is directly reachable. The generator caps coconuts + wall-sealed tiles at target-1 accordingly.
 *   - Cherry pair (redefined 2026-09-02; the old "next cherry run up the same column" was unreachable: 0 doubles in 381
 *     launches because compaction never leaves a second run above a gap): the launched cherry fires into its lane AND
 *     its twin fires into the ADJACENT lane - the side whose trace impact is a cherry, else right (left at the right
 *     edge; TUNING.CHERRY_TWIN_SIDE). The twin follows the same wall/pipe/trellis rules. It resolves only when the
 *     primary matched (a primary mismatch returns the pair together: result.twin = null, board untouched). If the twin
 *     also hits a cherry, that run clears too (result.powerup.cells, effect {kind:'burst'}) and the whole launch scores
 *     x2 (result.cherryDouble); if it mismatches it simply returns, no penalty. result.twin = {col, path, deflections,
 *     impact, matched} so game.js can animate it; result.path stays the primary's path.
 *   - CLUSTER_BIAS (generator): when a column is filled top-down, each new tile copies the type of the tile directly
 *     above it with probability TUNING.CLUSTER_BIAS (else a uniform draw). Measured at 0 (uniform): matched runs averaged
 *     1.1 tiles and 55% of matches needed the hand rescue. The RNG is only consumed when the bias is > 0, so bias 0
 *     reproduces the pre-2026-09-02 boards exactly. The ">= 2 of every present type" pass and winnability are unchanged.
 *   - Pineapple breaks the first 4-adjacent obstacle in the order up, left, right, down. A broken coconut
 *     is a tile: it appears in BOTH result.broken and result.cleared (and decrements remaining).
 *   - Grape: result.run stays the vertical line; the rest of the 4-connected cluster is result.powerup.cells.
 *   - HAND RESCUE (TUNING.HAND_RESCUE, default on): a mismatch never changes the hand, so a held type with no lane
 *     target is a soft-lock. Measured without it: 23% of fresh hands were dead and 96% of boards locked within ~4
 *     hands (queue entries are drawn 3 launches ahead and power-ups reshuffle every lane). After a match, if the new
 *     held type is not the impact tile of any lane, it is swapped with the first queue entry that is (or redrawn if
 *     none is); reported as result.handRescue = null | {kind:'swap', queueIndex} | {kind:'redraw'}. Queue entries
 *     whose type has no tiles left on the board are redrawn too (result.queueRedrawn = [indices]).
 *   - LOOKAHEAD DRAW (TUNING.DRAW_LOOKAHEAD, 2026-09-02): a queue entry is used k hands from now, but was drawn from the
 *     lanes of the CURRENT board - the very tiles the intervening hands clear - so 48% of matches still needed the rescue
 *     (insensitive to draw weights and CLUSTER_BIAS). Each queue entry is now drawn from the lanes of a private copy on
 *     which the preceding hand has been played greedily (simCopy/predictBoard; the copy's draws never recurse). The held
 *     fruit is still drawn lane-only from the real board. The real board's RNG stream is untouched by the prediction.
 */
(function () {
  var root = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : this);
  root.OT = root.OT || {};
  var OT = root.OT;
  if (typeof require !== 'undefined' && !OT.CONFIG) {
    var cfg = require('./config.js');
    if (!OT.CONFIG) OT.CONFIG = cfg;
  }

  var TUNING = {
    SCORE_RUN: 10,            // per tile in the matched run
    SCORE_POWER: 15,          // per tile cleared by a power-up or chain
    CHERRY_MULT: 2,           // whole launch x2 on a cherry double
    ORANGE_CHAIN_MULT: 0.5,   // score x (1 + 0.5 * chain)
    ORANGE_ROUNDS: 4,         // max chain rounds
    POMEGRANATE_COUNT: 5,     // random tiles cleared elsewhere
    TIME_RUN: 0.25,           // seconds back per run tile (was 0.5: the bonus refunded the whole level, QA 2026-09-02)
    TIME_POWER: 0.5,          // seconds back per power-up/chain tile (was 1.0)
    TIME_CAP: 3,              // max seconds back per launch (was 5)
    CLUSTER_BIAS: 0.55,       // generator: a new tile copies the type of the tile directly above it with this probability (0 = uniform draw)
    CHERRY_TWIN_SIDE: 1,      // cherry twin lane when neither neighbour lane shows a cherry: +1 = right (left at the right edge)
    TARGET_FRACTION: 0.10,    // target = max(TARGET_MIN, round(initialFruit * fraction))
    TARGET_MIN: 2,
    GEN_TRIES: 50,            // regeneration cap
    UPPER_SEGMENT_CAP: 2,     // max tiles in a column segment sealed above a wall
    MIN_TYPE_COUNT: 2,        // every present type appears at least this often
    OPEN_SEGMENT_WEIGHT: 3,   // fill weighting of launch-open segments vs upper segments
    WALL_HIGH_BIAS: 4,        // wall spot weight multiplies by this per row nearer the top (a wall seals the cells above it)
    DRAW_LOWEST_WEIGHT: 3,    // queue draw: weight per lane whose impact tile is this type
    DRAW_NEXT_WEIGHT: 1,      // queue draw: weight per lane where this type is the NEXT tile up (one clear away)
    DRAW_LOOKAHEAD: 3,        // queue draw: a queue entry used k hands from now is drawn from the lanes of a COPY on which the
                              // preceding hand (held, then the queue) has been played greedily, up to this many steps; 0 = current board
    HAND_RESCUE: true         // after a match, if the new held type has no lane target, swap it with a queue entry that has one
  };

  // ---------------------------------------------------------------- RNG
  function mulberry32(seed) {
    var a = (seed >>> 0) || 0x9E3779B9;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function rint(rng, n) { return Math.floor(rng() * n); } // 0..n-1
  function shuffle(rng, arr) {
    for (var i = arr.length - 1; i > 0; i--) { var j = rint(rng, i + 1); var t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
    return arr;
  }

  // ---------------------------------------------------------------- cell helpers
  function isTile(c) { return !!c && (c.kind === 'fruit' || c.kind === 'coconut'); }
  function isObstacle(c) { return !!c && (c.kind === 'wall' || c.kind === 'trellis' || c.kind === 'pipe'); }
  function inb(board, col, row) { return col >= 0 && col < board.cols && row >= 0 && row < board.rows; }
  function cellAt(board, col, row) { return inb(board, col, row) ? board.cells[row][col] : undefined; }
  function emptyGrid(rows, cols) {
    var g = [];
    for (var r = 0; r < rows; r++) { var line = []; for (var c = 0; c < cols; c++) line.push(null); g.push(line); }
    return g;
  }
  function key(col, row) { return col + ',' + row; }

  // Column segments: maximal runs of non-obstacle cells. {col, top, bottom, open, below}
  function segments(board, col) {
    var segs = [], r = 0;
    while (r < board.rows) {
      if (isObstacle(board.cells[r][col])) { r++; continue; }
      var top = r;
      while (r < board.rows && !isObstacle(board.cells[r][col])) r++;
      var bottom = r - 1;
      segs.push({ col: col, top: top, bottom: bottom, open: bottom === board.rows - 1,
                  below: (r < board.rows) ? board.cells[r][col].kind : null });
    }
    return segs;
  }
  function segmentOf(board, col, row) {
    var segs = segments(board, col);
    for (var i = 0; i < segs.length; i++) if (row >= segs[i].top && row <= segs[i].bottom) return segs[i];
    return null;
  }

  // ---------------------------------------------------------------- launch path
  function trace(board, col) {
    var path = [], deflections = [], impact = null;
    var c = col, r = board.rows - 1, guard = 0;
    while (r >= 0 && guard++ < 64) {
      var cell = board.cells[r][c];
      path.push({ col: c, row: r });
      if (!cell || cell.kind === 'pipe') { r--; continue; }
      if (isTile(cell)) { impact = { col: c, row: r }; break; }
      if (cell.kind === 'trellis') break;
      if (cell.kind === 'wall') {
        deflections.push({ col: c, row: r, lean: cell.lean });
        var moved = false, sides = [cell.lean, -cell.lean];
        for (var s = 0; s < 2 && !moved; s++) {
          var nc = c + sides[s];
          if (nc < 0 || nc >= board.cols) continue;
          var side = board.cells[r][nc];
          if (isObstacle(side)) continue;                // wall / trellis / pipe: never entered sideways
          path.push({ col: nc, row: r });
          moved = true;
          if (isTile(side)) { impact = { col: nc, row: r }; }
          else { c = nc; r--; }
        }
        if (impact || !moved) break;
        continue;
      }
      break; // unknown kind: stop
    }
    return { path: path, deflections: deflections, impact: impact };
  }

  function lowestTile(board, col) {
    for (var r = board.rows - 1; r >= 0; r--) if (isTile(board.cells[r][col])) return { col: col, row: r };
    return null;
  }

  // ---------------------------------------------------------------- bookkeeping
  function countTiles(board) {
    var n = 0;
    for (var r = 0; r < board.rows; r++) for (var c = 0; c < board.cols; c++) if (isTile(board.cells[r][c])) n++;
    return n;
  }
  function targetFor(initialFruit) {
    return Math.max(TUNING.TARGET_MIN, Math.round(initialFruit * TUNING.TARGET_FRACTION));
  }
  function recount(board) {
    board.initialFruit = countTiles(board);
    board.remaining = board.initialFruit;
    board.target = targetFor(board.initialFruit);
    return board;
  }

  // Weights for the queue draw: types that are currently the impact target of some lane.
  function reachableTypes(board) {
    var w = {}, any = false;
    for (var c = 0; c < board.cols; c++) {
      var t = trace(board, c);
      if (t.impact) {
        var cell = board.cells[t.impact.row][t.impact.col];
        if (cell.kind === 'fruit') { w[cell.type] = (w[cell.type] || 0) + 1; any = true; }
      }
    }
    return any ? w : null;
  }
  function presentTypes(board) {
    var w = {}, any = false;
    for (var r = 0; r < board.rows; r++) for (var c = 0; c < board.cols; c++) {
      var cell = board.cells[r][c];
      if (cell && cell.kind === 'fruit') { w[cell.type] = (w[cell.type] || 0) + 1; any = true; }
    }
    return any ? w : null;
  }
  // Draw weights: lane impact tile type x DRAW_LOWEST_WEIGHT, plus the next different fruit up the segment x DRAW_NEXT_WEIGHT.
  function laneWeights(board) {
    var w = {}, any = false;
    for (var c = 0; c < board.cols; c++) {
      var t = trace(board, c);
      if (!t.impact) continue;
      var cell = board.cells[t.impact.row][t.impact.col];
      if (cell.kind !== 'fruit') continue;
      w[cell.type] = (w[cell.type] || 0) + TUNING.DRAW_LOWEST_WEIGHT; any = true;
      for (var r = t.impact.row - 1; r >= 0; r--) {
        var up = board.cells[r][t.impact.col];
        if (!up || up.kind !== 'fruit') break;
        if (up.type !== cell.type) { w[up.type] = (w[up.type] || 0) + TUNING.DRAW_NEXT_WEIGHT; break; }
      }
    }
    return any ? w : null;
  }
  // Prediction copy for the queue draw: same grid/hand, its own RNG (never touches the real board's stream), flagged so
  // its own draws never recurse into another prediction.
  function simCopy(board) {
    var cells = [];
    for (var r = 0; r < board.rows; r++) cells.push(board.cells[r].slice());
    return { cols: board.cols, rows: board.rows, seed: board.seed, levelDef: board.levelDef, cells: cells,
             initialFruit: board.initialFruit, remaining: board.remaining, target: board.target,
             held: board.held, queue: (board.queue || []).slice(), moves: board.moves, score: board.score, warnings: [],
             _rng: mulberry32((board.genSeed || board.seed || 1) ^ Math.imul(board.moves + 1, 0x9E3779B9)), _sim: true };
  }
  // Play the next `steps` hands greedily (most tiles cleared among the lanes matching the held type) on a copy.
  function predictBoard(board, steps) {
    var sim = simCopy(board);
    for (var step = 0; step < steps; step++) {
      var best = -1, bestN = -1;
      for (var c = 0; c < sim.cols; c++) {
        var t = trace(sim, c);
        if (!t.impact) continue;
        var cell = sim.cells[t.impact.row][t.impact.col];
        if (cell.kind !== 'fruit' || cell.type !== sim.held) continue;
        var n = launch(simCopy(sim), c).cleared.length;
        if (n > bestN) { bestN = n; best = c; }
      }
      if (best < 0) break;
      launch(sim, best);
      if (sim.remaining < sim.target) break;
    }
    return sim;
  }
  // laneOnly: the HELD fruit must be the impact tile of some lane on the CURRENT board.
  // depth: how many hands are played before this entry is held (1 = next); with DRAW_LOOKAHEAD the weights come from the
  // predicted board after those hands, falling back to the current board when the prediction has no lanes.
  function drawType(board, laneOnly, depth) {
    var src = board;
    if (!laneOnly && depth > 0 && TUNING.DRAW_LOOKAHEAD > 0 && !board._sim) src = predictBoard(board, Math.min(depth, TUNING.DRAW_LOOKAHEAD));
    var w = (laneOnly ? reachableTypes(src) : laneWeights(src)) || presentTypes(src) || laneWeights(board) || presentTypes(board);
    if (!w) {
      var fr = board.levelDef.fruits;
      return fr[rint(board._rng, fr.length)];
    }
    var types = Object.keys(w).sort(), total = 0, i;
    for (i = 0; i < types.length; i++) total += w[types[i]];
    var x = board._rng() * total;
    for (i = 0; i < types.length; i++) { x -= w[types[i]]; if (x < 0) return types[i]; }
    return types[types.length - 1];
  }
  function refillHand(board) {
    if (!board.held) board.held = drawType(board, true, 0);
    if (!board.queue) board.queue = [];
    while (board.queue.length < 3) board.queue.push(drawType(board, false, board.queue.length + 1));
  }

  // ---------------------------------------------------------------- compaction
  // Slide every tile to the top of its segment. Returns [{from,to}] for every tile that moved.
  function compact(board) {
    var moves = [];
    for (var c = 0; c < board.cols; c++) {
      var segs = segments(board, c);
      for (var s = 0; s < segs.length; s++) {
        var seg = segs[s], write = seg.top;
        for (var r = seg.top; r <= seg.bottom; r++) {
          var cell = board.cells[r][c];
          if (!isTile(cell)) continue;
          if (write !== r) {
            board.cells[write][c] = cell;
            board.cells[r][c] = null;
            moves.push({ from: { col: c, row: r }, to: { col: c, row: write } });
          }
          write++;
        }
      }
    }
    return moves;
  }

  // ---------------------------------------------------------------- clusters
  function cluster4(board, col, row, type) {
    var out = [], seen = {}, stack = [{ col: col, row: row }];
    seen[key(col, row)] = true;
    while (stack.length) {
      var p = stack.pop();
      var cell = cellAt(board, p.col, p.row);
      if (!cell || cell.kind !== 'fruit' || cell.type !== type) continue;
      out.push({ col: p.col, row: p.row });
      var nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (var i = 0; i < 4; i++) {
        var nc = p.col + nb[i][0], nr = p.row + nb[i][1], k = key(nc, nr);
        if (!inb(board, nc, nr) || seen[k]) continue;
        seen[k] = true;
        stack.push({ col: nc, row: nr });
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- launch
  function describe(board, col, row) {
    var cell = board.cells[row][col];
    var d = { col: col, row: row, kind: cell.kind };
    if (cell.kind === 'fruit') d.type = cell.type;
    if (cell.kind === 'wall') d.lean = cell.lean;
    return d;
  }

  // Cherry twin lane: the neighbour lane whose trace impact is a cherry (not already being cleared), preferring
  // TUNING.CHERRY_TWIN_SIDE; otherwise that side, or the other one at the edge. -1 on a one-column board.
  function twinLane(board, col, excluded) {
    var side = TUNING.CHERRY_TWIN_SIDE >= 0 ? 1 : -1, sides = [], i;
    if (col + side >= 0 && col + side < board.cols) sides.push(col + side);
    if (col - side >= 0 && col - side < board.cols) sides.push(col - side);
    for (i = 0; i < sides.length; i++) {
      var t = trace(board, sides[i]);
      var cell = t.impact ? board.cells[t.impact.row][t.impact.col] : null;
      if (cell && cell.kind === 'fruit' && cell.type === 'cherry' && !(excluded && excluded[key(t.impact.col, t.impact.row)])) return sides[i];
    }
    return sides.length ? sides[0] : -1;
  }

  function launch(board, col) {
    if (!(col >= 0 && col < board.cols)) throw new Error('launch: col out of range: ' + col);
    var launched = board.held;
    var t = trace(board, col);
    board.moves++;
    var result = {
      col: col, launched: launched,
      path: t.path, deflections: t.deflections, impact: t.impact,
      matched: false, run: [], powerup: null, chain: 0, cherryDouble: false, twin: null,
      cleared: [], broken: [], effects: [], compaction: [],
      scoreDelta: 0, timeBonus: 0,
      remaining: board.remaining, target: board.target, levelCleared: board.remaining < board.target,
      held: board.held, queue: board.queue.slice(),
      handRescue: null, queueRedrawn: []
    };
    var hit = t.impact ? board.cells[t.impact.row][t.impact.col] : null;
    if (!hit || hit.kind !== 'fruit' || hit.type !== launched) return result;

    result.matched = true;
    var ic = t.impact.col, ir = t.impact.row, type = launched;
    var clearedSet = {}, cleared = [];
    function mark(c, r) {
      var k = key(c, r);
      if (clearedSet[k]) return null;
      var cell = board.cells[r][c];
      if (!isTile(cell)) return null;
      clearedSet[k] = true;
      var d = describe(board, c, r);
      cleared.push(d);
      return d;
    }

    // 1. the run: contiguous same-type line going UP from the impact
    var r;
    for (r = ir; r >= 0; r--) {
      var cell = board.cells[r][ic];
      if (!cell || cell.kind !== 'fruit' || cell.type !== type) break;
      var d = mark(ic, r);
      result.run.push({ col: ic, row: r, type: type });
    }
    // 2. power-up of the LAUNCHED fruit
    var pcells = [], eff = result.effects;
    function addP(c, r) { if (inb(board, c, r)) { var d = mark(c, r); if (d) pcells.push(d); } }

    switch (type) {
      case 'cherry': {
        // the twin fires into the adjacent lane (see header); it matches only a cherry that the primary is not already clearing
        var tl = twinLane(board, col, clearedSet);
        if (tl >= 0) {
          var tt = trace(board, tl);
          var tcell = tt.impact ? board.cells[tt.impact.row][tt.impact.col] : null;
          var twinMatched = !!(tcell && tcell.kind === 'fruit' && tcell.type === 'cherry' && !clearedSet[key(tt.impact.col, tt.impact.row)]);
          result.twin = { col: tl, path: tt.path, deflections: tt.deflections, impact: tt.impact, matched: twinMatched };
          if (twinMatched) {
            result.cherryDouble = true;
            eff.push({ kind: 'burst', col: tt.impact.col, row: tt.impact.row });
            for (var rr = tt.impact.row; rr >= 0; rr--) {
              var cc = board.cells[rr][tt.impact.col];
              if (!cc || cc.kind !== 'fruit' || cc.type !== 'cherry') break;
              addP(tt.impact.col, rr);
            }
          }
        }
        break;
      }
      case 'strawberry':
        addP(ic, ir - 1); addP(ic - 1, ir); addP(ic + 1, ir); addP(ic, ir + 1);
        eff.push({ kind: 'cross', col: ic, row: ir });
        break;
      case 'apple':
        for (var c1 = 0; c1 < board.cols; c1++) addP(c1, ir);
        eff.push({ kind: 'appleRow', row: ir });
        break;
      case 'banana':
        for (var c2 = 0; c2 < board.cols; c2++) addP(c2, ir);
        eff.push({ kind: 'monkey', row: ir });
        break;
      case 'watermelon':
        for (var dc = -1; dc <= 1; dc++) for (var dr = -1; dr <= 1; dr++) if (dc || dr) addP(ic + dc, ir + dr);
        eff.push({ kind: 'splash', col: ic, row: ir, type: type });
        break;
      case 'grape': {
        var cl = cluster4(board, ic, ir, type);
        for (var g = 0; g < cl.length; g++) addP(cl[g].col, cl[g].row);
        eff.push({ kind: 'burst', col: ic, row: ir });
        break;
      }
      case 'pomegranate': {
        var pool = [];
        for (var pr = 0; pr < board.rows; pr++) for (var pc = 0; pc < board.cols; pc++) {
          if (isTile(board.cells[pr][pc]) && !clearedSet[key(pc, pr)]) pool.push({ col: pc, row: pr });
        }
        shuffle(board._rng, pool);
        var picked = [];
        for (var pi = 0; pi < pool.length && pi < TUNING.POMEGRANATE_COUNT; pi++) {
          addP(pool[pi].col, pool[pi].row); picked.push(pool[pi]);
        }
        eff.push({ kind: 'seeds', cells: picked });
        break;
      }
      case 'pineapple': {
        var order = [[0, -1], [-1, 0], [1, 0], [0, 1]]; // up, left, right, down
        for (var o = 0; o < 4; o++) {
          var oc = ic + order[o][0], orow = ir + order[o][1];
          var ob = cellAt(board, oc, orow);
          if (ob && (isObstacle(ob) || ob.kind === 'coconut')) {
            result.broken.push({ col: oc, row: orow, kind: ob.kind });
            if (ob.kind === 'coconut') addP(oc, orow);
            else board.cells[orow][oc] = null;
            eff.push({ kind: 'burst', col: oc, row: orow });
            break;
          }
        }
        break;
      }
      case 'lemon':
        for (var lr = 0; lr < board.rows; lr++) addP(ic, lr);
        eff.push({ kind: 'lemonColumn', col: ic });
        break;
      case 'orange':
        // chain handled below (needs the run removed first)
        break;
      default:
        break;
    }
    if (pcells.length || type === 'pineapple') result.powerup = { type: type, cells: pcells };

    // remove everything cleared so far from the grid
    var i;
    for (i = 0; i < cleared.length; i++) board.cells[cleared[i].row][cleared[i].col] = null;

    // 3. chain (orange): same-type clusters (size >= 2) touching any cleared cell, up to N rounds
    var chainCells = [];
    if (type === 'orange') {
      var frontier = cleared.slice();
      for (var round = 1; round <= TUNING.ORANGE_ROUNDS && frontier.length; round++) {
        var roundCells = [], seenStart = {};
        for (i = 0; i < frontier.length; i++) {
          var nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
          for (var n = 0; n < 4; n++) {
            var nc = frontier[i].col + nb[n][0], nr = frontier[i].row + nb[n][1];
            var ncell = cellAt(board, nc, nr);
            if (!ncell || ncell.kind !== 'fruit' || seenStart[key(nc, nr)]) continue;
            var cl2 = cluster4(board, nc, nr, ncell.type);
            for (var q = 0; q < cl2.length; q++) seenStart[key(cl2[q].col, cl2[q].row)] = true;
            if (cl2.length < 2) continue;
            result.chain++;
            for (q = 0; q < cl2.length; q++) { var dd = mark(cl2[q].col, cl2[q].row); if (dd) roundCells.push(dd); }
          }
        }
        for (i = 0; i < roundCells.length; i++) board.cells[roundCells[i].row][roundCells[i].col] = null;
        if (roundCells.length) eff.push({ kind: 'chain', round: round, cells: roundCells.slice() });
        chainCells = chainCells.concat(roundCells);
        frontier = roundCells;
      }
    }

    // 4. bookkeeping
    result.cleared = cleared;
    var tilesCleared = cleared.length;
    board.remaining -= tilesCleared;
    var runN = result.run.length, powerN = pcells.length + chainCells.length;
    var score = runN * TUNING.SCORE_RUN + powerN * TUNING.SCORE_POWER;
    if (result.cherryDouble) score *= TUNING.CHERRY_MULT;
    if (type === 'orange') score *= (1 + TUNING.ORANGE_CHAIN_MULT * result.chain);
    score = Math.round(score);
    board.score += score;
    result.scoreDelta = score;
    result.timeBonus = Math.min(TUNING.TIME_CAP, runN * TUNING.TIME_RUN + powerN * TUNING.TIME_POWER);

    // 5. compaction, then the new hand
    result.compaction = compact(board);
    board.held = board.queue.shift();
    board.queue.push(drawType(board, false, board.queue.length + 1));
    refillHand(board);
    // queue entries whose type has no tiles left can never match again: redraw them
    var present = presentTypes(board) || {}, qi;
    for (qi = 0; qi < board.queue.length; qi++) if (!present[board.queue[qi]]) { board.queue[qi] = drawType(board, false, qi + 1); result.queueRedrawn.push(qi); }
    // hand rescue: the held type must have a lane target (see header)
    if (TUNING.HAND_RESCUE) {
      var reach = reachableTypes(board);
      if (reach && !reach[board.held]) {
        var swapAt = -1;
        for (qi = 0; qi < board.queue.length; qi++) if (reach[board.queue[qi]]) { swapAt = qi; break; }
        if (swapAt >= 0) { var tmp = board.held; board.held = board.queue[swapAt]; board.queue[swapAt] = tmp; result.handRescue = { kind: 'swap', queueIndex: swapAt }; }
        else { board.held = drawType(board, true, 0); result.handRescue = { kind: 'redraw' }; }
      }
    }

    result.remaining = board.remaining;
    result.target = board.target;
    result.levelCleared = board.remaining < board.target;
    result.held = board.held;
    result.queue = board.queue.slice();
    return result;
  }

  // ---------------------------------------------------------------- winnability
  // Conservative fixed-point simulation: launches clear the fruit they can reach (any type, power-ups ignored),
  // coconuts are never cleared and keep blocking their lane. Everything the simulation cannot clear is "sealed".
  function analyse(board) {
    var work = { rows: board.rows, cols: board.cols, cells: [] };
    var r, c, direct = [];
    for (r = 0; r < board.rows; r++) work.cells.push(board.cells[r].slice());
    var changed = true, guard = 0;
    while (changed && guard++ < 128) {
      changed = false;
      for (c = 0; c < board.cols; c++) {
        var t = trace(work, c);
        if (!t.impact) continue;
        var ic = t.impact.col;
        for (r = t.impact.row; r >= 0; r--) {
          var cell = work.cells[r][ic];
          if (!cell || cell.kind !== 'fruit') break;
          work.cells[r][ic] = null;
          direct.push({ col: ic, row: r });
          changed = true;
        }
      }
    }
    var sealed = 0, coconuts = 0, unreachable = 0;
    for (r = 0; r < board.rows; r++) for (c = 0; c < board.cols; c++) {
      var left = work.cells[r][c];
      if (!isTile(left)) continue;
      sealed++;
      if (left.kind === 'coconut') coconuts++; else unreachable++;
    }
    return { sealed: sealed, unreachable: unreachable, coconuts: coconuts, direct: direct };
  }
  function isWinnable(board) {
    var a = analyse(board);
    return a.direct.length > 0 && a.sealed <= board.target - 1;
  }

  // ---------------------------------------------------------------- generation
  function placeObstacles(board, rng, def) {
    var ob = def.obstacles || {}, cols = board.cols, rows = board.rows;
    var perCol = []; for (var c = 0; c < cols; c++) perCol.push(0);
    function canPlace(c, r) {
      if (r < 1 || r > rows - 2) return false;
      if (board.cells[r][c]) return false;
      if (perCol[c] >= 2) return false;
      if (r > 0 && isObstacle(board.cells[r - 1][c])) return false;
      if (r < rows - 1 && isObstacle(board.cells[r + 1][c])) return false;
      return true;
    }
    function place(kind, count, rowMin, rowMax) {
      for (var n = 0; n < count; n++) {
        var spots = [];
        for (var c = 0; c < cols; c++) for (var r = rowMin; r <= rowMax; r++) if (canPlace(c, r)) spots.push({ c: c, r: r });
        if (!spots.length) { board.warnings.push('could not place ' + kind + ' #' + (n + 1)); return; }
        var p, cell = { kind: kind };
        if (kind === 'wall') {
          // a wall seals the column above it: weight spots toward high rows; the lean side must be enterable
          var wspots = [], wtotal = 0;
          for (var si = 0; si < spots.length; si++) {
            var sp = spots[si], leans = [];
            if (sp.c > 0 && !isObstacle(board.cells[sp.r][sp.c - 1])) leans.push(-1);
            if (sp.c < cols - 1 && !isObstacle(board.cells[sp.r][sp.c + 1])) leans.push(1);
            if (!leans.length) continue;
            var wt = Math.pow(TUNING.WALL_HIGH_BIAS, (rows - 2) - sp.r);
            wspots.push({ c: sp.c, r: sp.r, leans: leans, w: wt }); wtotal += wt;
          }
          if (!wspots.length) { board.warnings.push('could not place wall #' + (n + 1)); return; }
          var x = rng() * wtotal; p = wspots[wspots.length - 1];
          for (si = 0; si < wspots.length; si++) { x -= wspots[si].w; if (x < 0) { p = wspots[si]; break; } }
          cell.lean = p.leans[rint(rng, p.leans.length)];
        } else {
          p = spots[rint(rng, spots.length)];
        }
        board.cells[p.r][p.c] = cell;
        perCol[p.c]++;
      }
    }
    place('trellis', ob.trellis || 0, 1, 2);
    place('pipe', ob.pipes || 0, 3, rows - 2);
    place('wall', ob.walls || 0, 2, rows - 2);
  }

  function fillTiles(board, rng, def) {
    var cols = board.cols, rows = board.rows, c, s, i;
    var freeCells = rows * cols;
    for (var r = 0; r < rows; r++) for (c = 0; c < cols; c++) if (isObstacle(board.cells[r][c])) freeCells--;
    var tileCount = Math.round(def.fill * freeCells);

    // segment capacities
    var segs = [];
    for (c = 0; c < cols; c++) {
      var cs = segments(board, c);
      for (s = 0; s < cs.length; s++) {
        var sg = cs[s], len = sg.bottom - sg.top + 1, cap;
        if (sg.open) cap = len - 1;                                   // row rows-1 stays empty
        else if (sg.below === 'pipe') cap = len;                      // reachable through the pipe
        else if (sg.below === 'trellis') cap = 0;                     // ceiling: nothing above it
        else cap = Math.min(len, TUNING.UPPER_SEGMENT_CAP);           // sealed above a wall
        segs.push({ col: c, top: sg.top, bottom: sg.bottom, open: sg.open, cap: cap, n: 0, coconut: false,
                    sealed: !sg.open && sg.below === 'wall' });
      }
    }
    var totalCap = 0; for (i = 0; i < segs.length; i++) totalCap += segs[i].cap;
    if (tileCount > totalCap) tileCount = totalCap;
    // coconuts and tiles sealed above walls share ONE budget of target-1: the level must be clearable
    // down to target-1 by plain launches alone (isWinnable ignores power-ups)
    var sealedBudget = targetFor(tileCount) - 1;

    // coconuts: top of an open segment, distinct columns, at least one fruit under each, capped by the budget;
    // a coconut column gets no upper-segment tiles (they would sit sealed behind the coconut)
    var coconuts = Math.min(def.obstacles && def.obstacles.coconuts ? def.obstacles.coconuts : 0, sealedBudget);
    var openSegs = shuffle(rng, segs.filter(function (g) { return g.open && g.cap >= 2; }));
    var placedCoco = 0;
    for (i = 0; i < openSegs.length && placedCoco < coconuts && placedCoco < tileCount; i++) {
      openSegs[i].coconut = true; openSegs[i].n++; placedCoco++; sealedBudget--;
      for (var u = 0; u < segs.length; u++) if (segs[u].col === openSegs[i].col && !segs[u].open && !segs[u].sealed) segs[u].cap = 0;
    }
    // one fruit in every open segment first
    var placed = placedCoco;
    for (i = 0; i < segs.length && placed < tileCount; i++) {
      if (segs[i].open && segs[i].n < segs[i].cap) { segs[i].n++; placed++; }
    }
    // then weighted random over remaining capacity
    while (placed < tileCount) {
      var total = 0, w = [];
      for (i = 0; i < segs.length; i++) {
        var free = segs[i].cap - segs[i].n;
        if (segs[i].sealed && sealedBudget <= 0) free = 0;
        var wt = free > 0 ? free * (segs[i].open ? TUNING.OPEN_SEGMENT_WEIGHT : 1) : 0;
        w.push(wt); total += wt;
      }
      if (total <= 0) break;
      var x = rng() * total, pick = -1;
      for (i = 0; i < segs.length; i++) { x -= w[i]; if (x < 0 && w[i] > 0) { pick = i; break; } }
      if (pick < 0) break;
      segs[pick].n++; placed++;
      if (segs[pick].sealed) sealedBudget--;
    }

    // write tiles compacted to the segment top; coconut at the very top
    var fruits = def.fruits, fruitCells = [];
    for (i = 0; i < segs.length; i++) {
      var g = segs[i], row = g.top;
      if (g.coconut) { board.cells[row][g.col] = { kind: 'coconut' }; row++; }
      for (var k = (g.coconut ? 1 : 0); k < g.n; k++, row++) {
        // CLUSTER_BIAS: copy the fruit directly above with probability bias (rng consumed only when the bias is > 0)
        var above = row > 0 ? board.cells[row - 1][g.col] : null, ty = null;
        if (above && above.kind === 'fruit' && TUNING.CLUSTER_BIAS > 0 && rng() < TUNING.CLUSTER_BIAS) ty = above.type;
        board.cells[row][g.col] = { kind: 'fruit', type: ty || fruits[rint(rng, fruits.length)] };
        fruitCells.push({ col: g.col, row: row });
      }
    }

    // every present type appears at least MIN_TYPE_COUNT times
    for (var pass = 0; pass < 20; pass++) {
      var counts = {}, j;
      for (j = 0; j < fruitCells.length; j++) { var ty = board.cells[fruitCells[j].row][fruitCells[j].col].type; counts[ty] = (counts[ty] || 0) + 1; }
      var types = Object.keys(counts).sort(), rare = null, rich = null;
      for (j = 0; j < types.length; j++) {
        if (counts[types[j]] < TUNING.MIN_TYPE_COUNT && !rare) rare = types[j];
        if (counts[types[j]] > TUNING.MIN_TYPE_COUNT && (!rich || counts[types[j]] > counts[rich])) rich = types[j];
      }
      if (!rare) break;
      if (rich && fruitCells.length >= 2 * types.length) {
        // convert one tile of the richest type into the rare type
        var cand = shuffle(rng, fruitCells.filter(function (p) { return board.cells[p.row][p.col].type === rich; }));
        board.cells[cand[0].row][cand[0].col].type = rare;
      } else {
        // not enough tiles to support this many types: fold the rare type into another present type
        var other = null;
        for (j = 0; j < types.length; j++) if (types[j] !== rare) { other = types[j]; break; }
        if (!other) break;
        for (j = 0; j < fruitCells.length; j++) if (board.cells[fruitCells[j].row][fruitCells[j].col].type === rare) board.cells[fruitCells[j].row][fruitCells[j].col].type = other;
      }
    }
  }

  function generateOnce(def, seed, tryIndex) {
    var genSeed = (seed + Math.imul(tryIndex, 0x9E3779B9)) >>> 0;
    var rng = mulberry32(genSeed);
    var board = {
      cols: def.cols || 5, rows: def.rows || 8, seed: seed, genSeed: genSeed, tries: tryIndex + 1,
      levelDef: def, cells: null, initialFruit: 0, remaining: 0, target: 0,
      held: null, queue: [], moves: 0, score: 0, warnings: [], _rng: rng
    };
    board.cells = emptyGrid(board.rows, board.cols);
    placeObstacles(board, rng, def);
    fillTiles(board, rng, def);
    recount(board);
    return board;
  }

  function acceptable(board) {
    if (!isWinnable(board)) return false;
    var reachableCols = 0;
    for (var c = 0; c < board.cols; c++) {
      var t = trace(board, c);
      if (t.impact && board.cells[t.impact.row][t.impact.col].kind === 'fruit') reachableCols++;
    }
    return reachableCols === board.cols || reachableCols >= 3;
  }

  function create(levelDef, seed) {
    if (typeof levelDef === 'number') levelDef = OT.CONFIG.levelDef(levelDef);
    seed = (seed === undefined || seed === null) ? 1 : (seed >>> 0);
    var board = null;
    for (var i = 0; i < TUNING.GEN_TRIES; i++) {
      board = generateOnce(levelDef, seed, i);
      if (acceptable(board)) { refillHand(board); return board; }
    }
    board.warnings.push('generator gave up after ' + TUNING.GEN_TRIES + ' tries (level ' + levelDef.n + ', seed ' + seed + '); board may not be winnable');
    refillHand(board);
    return board;
  }

  // ---------------------------------------------------------------- text render / parse
  var TOKEN = { cherry: 'C', strawberry: 'S', apple: 'A', watermelon: 'W', grape: 'G', banana: 'B',
                pomegranate: 'M', pineapple: 'N', orange: 'O', lemon: 'L' };
  var UNTOKEN = {}; Object.keys(TOKEN).forEach(function (k) { UNTOKEN[TOKEN[k]] = k; });

  function tokenOf(cell) {
    if (!cell) return '.';
    if (cell.kind === 'fruit') return TOKEN[cell.type] || '?';
    if (cell.kind === 'coconut') return 'K';
    if (cell.kind === 'wall') return cell.lean < 0 ? 'w<' : 'w>';
    if (cell.kind === 'trellis') return 'T';
    if (cell.kind === 'pipe') return 'P';
    return '?';
  }
  function snapshot(board) {
    var lines = [];
    var def = board.levelDef || {};
    lines.push('L' + (def.n || '?') + ' ' + (def.zone || '') + ' seed=' + board.seed + ' tries=' + (board.tries || 1) +
               ' tiles=' + board.remaining + '/' + board.initialFruit + ' target=' + board.target +
               ' held=' + board.held + ' queue=' + (board.queue || []).join(',') +
               (board.warnings && board.warnings.length ? ' WARN=' + board.warnings.length : ''));
    for (var r = 0; r < board.rows; r++) {
      var toks = [];
      for (var c = 0; c < board.cols; c++) { var t = tokenOf(board.cells[r][c]); toks.push(t.length === 1 ? t + ' ' : t); }
      lines.push(toks.join(' '));
    }
    return lines.join('\n');
  }
  // parse(text|[lines], {held, seed, levelDef}) -> board. Lines of tokens as printed by snapshot (header optional).
  function parse(text, opts) {
    opts = opts || {};
    var lines = Array.isArray(text) ? text.slice() : String(text).split('\n');
    lines = lines.map(function (l) { return l.trim(); }).filter(function (l) { return l.length && !/^L\d/.test(l) && l[0] !== '#'; });
    var rows = lines.length, cols = lines[0].split(/\s+/).length;
    var def = opts.levelDef || OT.CONFIG.levelDef(opts.level || 1);
    var board = {
      cols: cols, rows: rows, seed: opts.seed || 1, genSeed: opts.seed || 1, tries: 1,
      levelDef: def, cells: emptyGrid(rows, cols), initialFruit: 0, remaining: 0, target: 0,
      held: opts.held || null, queue: opts.queue ? opts.queue.slice() : [], moves: 0, score: 0, warnings: [],
      _rng: mulberry32(opts.seed || 1)
    };
    for (var r = 0; r < rows; r++) {
      var toks = lines[r].split(/\s+/);
      if (toks.length !== cols) throw new Error('parse: row ' + r + ' has ' + toks.length + ' tokens, expected ' + cols);
      for (var c = 0; c < cols; c++) {
        var t = toks[c], cell = null;
        if (t === '.') cell = null;
        else if (t === 'K') cell = { kind: 'coconut' };
        else if (t === 'T') cell = { kind: 'trellis' };
        else if (t === 'P') cell = { kind: 'pipe' };
        else if (t === 'w<') cell = { kind: 'wall', lean: -1 };
        else if (t === 'w>') cell = { kind: 'wall', lean: 1 };
        else if (UNTOKEN[t]) cell = { kind: 'fruit', type: UNTOKEN[t] };
        else throw new Error('parse: unknown token "' + t + '" at row ' + r + ' col ' + c);
        board.cells[r][c] = cell;
      }
    }
    recount(board);
    if (opts.target !== undefined) board.target = opts.target;
    refillHand(board);
    return board;
  }

  OT.Board = {
    TUNING: TUNING,
    TOKENS: TOKEN,
    create: create,
    launch: launch,
    trace: trace,
    lowestTile: lowestTile,
    snapshot: snapshot,
    parse: parse,
    recount: recount,
    isWinnable: isWinnable,
    analyse: analyse,
    reachableTypes: reachableTypes,
    laneWeights: laneWeights,
    segments: segments,
    compact: compact,
    rng: mulberry32
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = OT.Board;
})();
