/* Orchard Toss — tests/board_test.js
 * Node, zero deps. Run from prototype/:  node tests/board_test.js
 * Exit 0 ONLY if every check passed AND zero unexpected errors were thrown.
 * Each check runs in its own try/catch; an assertion failure counts as FAIL, any other throw as ERROR.
 */
'use strict';
var path = require('path');
var B = require(path.join(__dirname, '..', 'js', 'board.js'));
var C = require(path.join(__dirname, '..', 'js', 'config.js'));

var passed = 0, failed = 0, errors = 0;
function assert(cond, msg) { if (!cond) { var e = new Error('assert: ' + msg); e.isAssertion = true; throw e; } }
function eq(a, b, msg) { assert(a === b, msg + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function check(name, fn) {
  try { fn(); passed++; console.log('PASS ' + name); }
  catch (e) {
    if (e && e.isAssertion) { failed++; console.log('FAIL ' + name + '\n     ' + e.message); }
    else { errors++; console.log('ERROR ' + name + '\n' + (e && e.stack ? e.stack : e)); }
  }
}

// ---------------------------------------------------------------- invariant helpers (used by checks AND negative controls)
function isTile(c) { return !!c && (c.kind === 'fruit' || c.kind === 'coconut'); }
function isObstacle(c) { return !!c && (c.kind === 'wall' || c.kind === 'trellis' || c.kind === 'pipe'); }
function recountOK(board) {
  var n = 0;
  for (var r = 0; r < board.rows; r++) for (var c = 0; c < board.cols; c++) if (isTile(board.cells[r][c])) n++;
  return n === board.remaining;
}
// no gap (null) sits above a tile within the same segment
function compactionOK(board) {
  for (var c = 0; c < board.cols; c++) {
    var seenGap = false;
    for (var r = 0; r < board.rows; r++) {
      var cell = board.cells[r][c];
      if (isObstacle(cell)) { seenGap = false; continue; }
      if (cell === null) seenGap = true;
      else if (seenGap) return false;
    }
  }
  return true;
}
function row7Empty(board) { for (var c = 0; c < board.cols; c++) if (board.cells[board.rows - 1][c]) return false; return true; }
function typeCounts(board) {
  var w = {};
  for (var r = 0; r < board.rows; r++) for (var c = 0; c < board.cols; c++) { var x = board.cells[r][c]; if (x && x.kind === 'fruit') w[x.type] = (w[x.type] || 0) + 1; }
  return w;
}
function fx(lines, held, opts) { opts = opts || {}; opts.held = held; return B.parse(lines, opts); }
function has(list, col, row) { return list.some(function (p) { return p.col === col && p.row === row; }); }
var E = '.  .  .  .  .';

// ================================================================ config
check('config: levelDef 1..52 shape, zone bands, cumulative fruit unlock', function () {
  var prevFruits = 0, timeMin = Infinity, timeMax = -Infinity;
  Object.keys(C.TIME_RAMP).forEach(function (z) { C.TIME_RAMP[z].forEach(function (t) { timeMin = Math.min(timeMin, t); timeMax = Math.max(timeMax, t); }); });
  for (var n = 1; n <= 52; n++) {
    var d = C.levelDef(n);
    eq(d.n, n, 'n');
    eq(d.rows, 8, 'rows'); eq(d.cols, 5, 'cols');
    assert(d.fill >= 0.5 && d.fill <= 0.75, 'fill in range L' + n + ': ' + d.fill);
    assert(d.timeLimit >= timeMin && d.timeLimit <= timeMax, 'time within TIME_RAMP L' + n + ': ' + d.timeLimit);
    assert(d.timeLimit >= 30 && d.timeLimit <= 60, 'time within the doc section 11 window (30-60 s) L' + n + ': ' + d.timeLimit);
    assert(d.fruits.length >= prevFruits, 'fruits cumulative L' + n);
    assert(d.fruits.length >= 2, 'at least two types L' + n);
    prevFruits = d.fruits.length;
    var expectZone = n <= 10 ? 'spring' : n <= 22 ? 'summer' : n <= 36 ? 'autumn' : 'winter';
    eq(d.zone, expectZone, 'zone L' + n);
    eq(d.zoneIndex, ['spring', 'summer', 'autumn', 'winter'].indexOf(expectZone), 'zoneIndex L' + n);
    assert(d.obstacles && typeof d.obstacles.walls === 'number', 'obstacles L' + n);
  }
  eq(C.levelDef(1).indexInZone, 0, 'L1 idx'); eq(C.levelDef(11).indexInZone, 0, 'L11 idx');
  eq(C.levelDef(23).indexInZone, 0, 'L23 idx'); eq(C.levelDef(37).indexInZone, 0, 'L37 idx'); eq(C.levelDef(52).indexInZone, 15, 'L52 idx');
  eq(C.levelDef(52).fruits.length, 10, 'all 10 fruits by L52');
  eq(C.levelDef(10).fruits.join(','), 'cherry,strawberry,apple', 'spring roster complete by L10');
  eq(C.levelDef(11).fruits.indexOf('watermelon') >= 0, true, 'watermelon at L11');
  eq(C.levelDef(11).fruits.indexOf('grape') >= 0, false, 'grape not yet at L11');
  eq(C.levelDef(37).fruits.indexOf('orange') >= 0, true, 'orange at L37');
  eq(C.levelDef(37).fruits.indexOf('lemon') >= 0, false, 'lemon not yet at L37');
});
check('config: obstacle and time ramps per zone', function () {
  for (var n = 1; n <= 10; n++) { var d = C.levelDef(n); eq(d.obstacles.walls + d.obstacles.trellis + d.obstacles.pipes + d.obstacles.coconuts, 0, 'spring obstacle-free L' + n); }
  // time limits follow TIME_RAMP (tunable): first/last level of each zone hit the ramp ends exactly, and the ramp is monotone within a zone
  eq(C.levelDef(1).timeLimit, C.TIME_RAMP.spring[0], 'spring starts at ramp[0]'); eq(C.levelDef(10).timeLimit, C.TIME_RAMP.spring[1], 'spring ends at ramp[1]');
  eq(C.levelDef(11).timeLimit, C.TIME_RAMP.summer[0], 'summer starts at ramp[0]'); eq(C.levelDef(22).timeLimit, C.TIME_RAMP.summer[1], 'summer ends at ramp[1]');
  eq(C.levelDef(23).timeLimit, C.TIME_RAMP.autumn[0], 'autumn starts at ramp[0]'); eq(C.levelDef(36).timeLimit, C.TIME_RAMP.autumn[1], 'autumn ends at ramp[1]');
  eq(C.levelDef(37).timeLimit, C.TIME_RAMP.winter[0], 'winter starts at ramp[0]'); eq(C.levelDef(52).timeLimit, C.TIME_RAMP.winter[1], 'winter ends at ramp[1]');
  for (var m = 2; m <= 52; m++) { var a = C.levelDef(m - 1), bb = C.levelDef(m); if (a.zone === bb.zone) assert(bb.timeLimit <= a.timeLimit, 'time never rises within a zone L' + m); }
  // 2026-09-02 retune: the ramp must sit inside the doc's 30-60 s window and every later zone must start no later than Spring
  assert(C.TIME_RAMP.spring[0] <= 60 && C.TIME_RAMP.winter[1] >= 30, 'ramp inside 30-60 s');
  assert(C.TIME_RAMP.summer[0] <= C.TIME_RAMP.spring[0] && C.TIME_RAMP.autumn[0] <= C.TIME_RAMP.spring[0] && C.TIME_RAMP.winter[0] <= C.TIME_RAMP.spring[0], 'later zones start no later than spring');
  assert(C.STAR_FRACTIONS.length === 2 && C.STAR_FRACTIONS[0] > C.STAR_FRACTIONS[1] && C.STAR_FRACTIONS[1] > 0 && C.STAR_FRACTIONS[0] < 1, 'STAR_FRACTIONS descending in (0,1)');
  assert(B.TUNING.TIME_CAP >= B.TUNING.TIME_POWER && B.TUNING.TIME_POWER >= B.TUNING.TIME_RUN && B.TUNING.TIME_RUN > 0, 'time bonus tunables ordered');
  eq(C.levelDef(11).obstacles.walls, 1, 'summer walls 1'); eq(C.levelDef(22).obstacles.walls, 2, 'summer walls 2');
  eq(C.levelDef(23).obstacles.trellis, 1, 'autumn trellis'); eq(C.levelDef(23).obstacles.coconuts, 1, 'autumn coconuts 1'); eq(C.levelDef(36).obstacles.coconuts, 2, 'autumn coconuts 2');
  eq(C.levelDef(37).obstacles.pipes, 1, 'winter pipes 1'); eq(C.levelDef(52).obstacles.pipes, 2, 'winter pipes 2');
  eq(C.levelDef(52).obstacles.walls, 3, 'winter walls 3'); eq(C.levelDef(52).obstacles.trellis, 2, 'winter trellis 2'); eq(C.levelDef(52).obstacles.coconuts, 2, 'winter coconuts 2');
  var threw = false; try { C.levelDef(53); } catch (e) { threw = true; } assert(threw, 'levelDef(53) throws');
  threw = false; try { C.levelDef(0); } catch (e) { threw = true; } assert(threw, 'levelDef(0) throws');
  eq(C.COLS, 5, 'COLS'); eq(C.ROWS, 8, 'ROWS'); eq(C.CELL, 76, 'CELL'); eq(C.FRUITS.length, 10, '10 fruits'); eq(C.ZONES.length, 4, '4 zones');
});

// ================================================================ rng + determinism
check('config (J-006): difficulty climbs through the zones — time limits never rise zone over zone, the time-back scale never rises, and Winter is strictly tighter than Spring', function () {
  var zones = ['spring', 'summer', 'autumn', 'winter'];
  for (var i = 1; i < zones.length; i++) {
    var a = C.TIME_RAMP[zones[i - 1]], b = C.TIME_RAMP[zones[i]];
    assert(b[0] <= a[0], 'zone-start limit never rises: ' + zones[i - 1] + ' ' + a[0] + ' -> ' + zones[i] + ' ' + b[0]);
    assert(b[1] <= a[1], 'zone-end limit never rises: ' + zones[i - 1] + ' ' + a[1] + ' -> ' + zones[i] + ' ' + b[1]);
    assert(B.TUNING.TIME_ZONE_SCALE[zones[i]] <= B.TUNING.TIME_ZONE_SCALE[zones[i - 1]], 'time-back scale never rises: ' + zones[i]);
  }
  // strict, not merely non-increasing: the old tuning (Summer-Winter all 40->32, scale all 1) satisfied "never rises"
  // while measuring EASIER than Spring, which is exactly what Ben rejected in J-006.
  assert(C.levelDef(52).timeLimit < C.levelDef(10).timeLimit, 'L52 limit ' + C.levelDef(52).timeLimit + ' < L10 limit ' + C.levelDef(10).timeLimit);
  assert(B.TUNING.TIME_ZONE_SCALE.winter < B.TUNING.TIME_ZONE_SCALE.spring, 'winter time-back scale below spring');
  // the effective per-launch budget (limit + a full-cap bonus) must fall zone over zone
  var prev = Infinity;
  for (i = 0; i < zones.length; i++) {
    var last = C.TIME_RAMP[zones[i]][1] + B.TUNING.TIME_CAP * B.TUNING.TIME_ZONE_SCALE[zones[i]];
    assert(last < prev, 'effective end-of-zone budget falls: ' + zones[i] + ' ' + last + ' vs previous ' + prev);
    prev = last;
  }
});
check('board: the per-zone time-back scale actually reaches result.timeBonus (and spring is unscaled)', function () {
  var rows = ['C  .  .  .  .', 'C  .  .  .  .', 'C  .  .  .  .', E, E, E, E, E];
  var spring = B.launch(fx(rows, 'cherry', { levelDef: C.levelDef(1) }), 0);
  var winter = B.launch(fx(rows, 'cherry', { levelDef: C.levelDef(52) }), 0);
  eq(spring.timeBonus, 3 * B.TUNING.TIME_RUN, 'spring bonus unscaled (3 run tiles)');
  eq(winter.timeBonus, Math.round(100 * 3 * B.TUNING.TIME_RUN * B.TUNING.TIME_ZONE_SCALE.winter) / 100, 'winter bonus scaled');
  assert(winter.timeBonus < spring.timeBonus, 'winter gives less time back than spring for the same clear');
});
check('rng: seeded, repeatable, in [0,1)', function () {
  var a = B.rng(42), b = B.rng(42), same = true;
  for (var i = 0; i < 100; i++) { var x = a(), y = b(); if (x !== y) same = false; assert(x >= 0 && x < 1, 'range'); }
  assert(same, 'same seed same stream');
  assert(B.rng(1)() !== B.rng(2)(), 'different seeds differ');
});
check('create: deterministic by (levelDef, seed); different seed differs', function () {
  var s1 = B.snapshot(B.create(C.levelDef(15), 7)), s2 = B.snapshot(B.create(C.levelDef(15), 7));
  eq(s1, s2, 'same seed same board');
  assert(s1 !== B.snapshot(B.create(C.levelDef(15), 8)), 'seed 8 differs from seed 7');
  var b = B.create(C.levelDef(15), 7);
  eq(b.seed, 7, 'seed recorded'); eq(b.moves, 0, 'moves 0'); eq(b.score, 0, 'score 0');
});
check('create: accepts a level number as well as a levelDef', function () {
  eq(B.snapshot(B.create(3, 5)), B.snapshot(B.create(C.levelDef(3), 5)), 'number == def');
});

// ================================================================ generation sweep
check('generation: all 52 levels x 5 seeds (260 boards) winnable, row 7 empty, types >= 2, no warnings, bookkeeping', function () {
  var boards = 0;
  for (var n = 1; n <= 52; n++) for (var s = 1; s <= 5; s++) {
    var d = C.levelDef(n), b = B.create(d, s); boards++;
    var tag = ' L' + n + ' seed ' + s;
    assert(b.warnings.length === 0, 'no warnings' + tag + ': ' + b.warnings.join('; '));
    assert(B.isWinnable(b), 'winnable' + tag + '\n' + B.snapshot(b));
    assert(row7Empty(b), 'row 7 empty' + tag);
    assert(compactionOK(b), 'compacted' + tag);
    assert(recountOK(b), 'recount' + tag);
    eq(b.target, Math.max(2, Math.round(b.initialFruit * 0.10)), 'target formula' + tag);
    eq(b.remaining, b.initialFruit, 'remaining == initial' + tag);
    assert(b.initialFruit >= 10, 'enough tiles' + tag + ' ' + b.initialFruit);
    var tc = typeCounts(b), types = Object.keys(tc);
    for (var i = 0; i < types.length; i++) {
      assert(tc[types[i]] >= 2, 'type ' + types[i] + ' appears >= 2' + tag);
      assert(d.fruits.indexOf(types[i]) >= 0, 'type ' + types[i] + ' unlocked' + tag);
    }
    assert(typeof b.held === 'string' && b.queue.length === 3, 'hand' + tag);
    assert(tc[b.held] > 0, 'held type present on board' + tag);
    // obstacle placement rules
    var cocos = 0;
    for (var r = 0; r < b.rows; r++) for (var c = 0; c < b.cols; c++) {
      var cell = b.cells[r][c];
      if (!cell) continue;
      if (cell.kind === 'coconut') cocos++;
      if (cell.kind === 'wall') assert(r >= 2 && r <= 6, 'wall rows 2..6' + tag);
      if (cell.kind === 'trellis') assert(r >= 1 && r <= 2, 'trellis rows 1..2' + tag);
      if (cell.kind === 'pipe') assert(r >= 3 && r <= 6, 'pipe rows 3..6' + tag);
      if (isObstacle(cell) && r > 0) assert(!isObstacle(b.cells[r - 1][c]), 'no vertically adjacent obstacles' + tag);
    }
    assert(cocos <= d.obstacles.coconuts, 'coconut cap' + tag);
    if (d.zone === 'spring') for (r = 0; r < b.rows; r++) for (c = 0; c < b.cols; c++) assert(!b.cells[r][c] || b.cells[r][c].kind === 'fruit', 'spring has only fruit' + tag);
  }
  eq(boards, 260, '260 boards');
});
check('generation: obstacle counts honoured at L15 / L30 / L52 (seed 1)', function () {
  function count(b, kind) { var n = 0; for (var r = 0; r < b.rows; r++) for (var c = 0; c < b.cols; c++) if (b.cells[r][c] && b.cells[r][c].kind === kind) n++; return n; }
  var b15 = B.create(C.levelDef(15), 1); eq(count(b15, 'wall'), C.levelDef(15).obstacles.walls, 'L15 walls');
  var b30 = B.create(C.levelDef(30), 1); eq(count(b30, 'wall'), 2, 'L30 walls'); eq(count(b30, 'trellis'), 1, 'L30 trellis'); eq(count(b30, 'coconut'), C.levelDef(30).obstacles.coconuts, 'L30 coconuts');
  var b52 = B.create(C.levelDef(52), 1); eq(count(b52, 'wall'), 3, 'L52 walls'); eq(count(b52, 'trellis'), 2, 'L52 trellis'); eq(count(b52, 'pipe'), 2, 'L52 pipes');
  eq(count(b52, 'coconut'), Math.min(2, b52.target - 1), 'L52 coconuts capped by target-1 (generator keeps the level winnable)');
});

check('generation: CLUSTER_BIAS lengthens the lane runs a match would clear (vs bias 0) and keeps the type >= 2 rule; bias 0 is deterministic', function () {
  function laneRunMean(bias) {
    var saved = B.TUNING.CLUSTER_BIAS, tiles = 0, lanes = 0;
    try {
      B.TUNING.CLUSTER_BIAS = bias;
      for (var n = 1; n <= 52; n++) for (var s = 1; s <= 3; s++) {
        var b = B.create(C.levelDef(n), s);
        var tc = typeCounts(b); Object.keys(tc).forEach(function (t) { assert(tc[t] >= 2, 'type ' + t + ' >= 2 at bias ' + bias + ' L' + n + ' s' + s); });
        assert(B.isWinnable(b) && b.warnings.length === 0, 'winnable, no warnings at bias ' + bias + ' L' + n + ' s' + s);
        for (var c = 0; c < b.cols; c++) {
          var t = B.trace(b, c); if (!t.impact) continue;
          var cell = b.cells[t.impact.row][t.impact.col]; if (cell.kind !== 'fruit') continue;
          lanes++;
          for (var r = t.impact.row; r >= 0; r--) { var up = b.cells[r][t.impact.col]; if (!up || up.kind !== 'fruit' || up.type !== cell.type) break; tiles++; }
        }
      }
    } finally { B.TUNING.CLUSTER_BIAS = saved; }
    return tiles / lanes;
  }
  var m0 = laneRunMean(0), m1 = laneRunMean(B.TUNING.CLUSTER_BIAS);
  assert(B.TUNING.CLUSTER_BIAS > 0 && B.TUNING.CLUSTER_BIAS < 1, 'CLUSTER_BIAS in (0,1): ' + B.TUNING.CLUSTER_BIAS);
  assert(m1 >= m0 + 0.3, 'bias ' + B.TUNING.CLUSTER_BIAS + ' lane-run mean ' + m1.toFixed(2) + ' vs uniform ' + m0.toFixed(2));
  assert(m1 >= 1.6, 'lane-run mean at the shipped bias >= 1.6: ' + m1.toFixed(2));
  console.log('     cluster bias: lane-run mean uniform=' + m0.toFixed(2) + ' biased=' + m1.toFixed(2));
  var saved = B.TUNING.CLUSTER_BIAS;
  try { B.TUNING.CLUSTER_BIAS = 0; eq(B.snapshot(B.create(C.levelDef(7), 4)), B.snapshot(B.create(C.levelDef(7), 4)), 'bias 0 deterministic'); }
  finally { B.TUNING.CLUSTER_BIAS = saved; }
});

// ================================================================ helpers
check('lowestTile: bottom-most tile per column, null when empty', function () {
  var b = fx(['C  .  K  .  .', 'C  .  .  .  .', 'S  .  .  w> .', E, E, E, E, E], 'cherry');
  eq(JSON.stringify(B.lowestTile(b, 0)), '{"col":0,"row":2}', 'col 0');
  eq(JSON.stringify(B.lowestTile(b, 2)), '{"col":2,"row":0}', 'coconut counts');
  eq(B.lowestTile(b, 1), null, 'empty col'); eq(B.lowestTile(b, 3), null, 'obstacle only');
});
check('snapshot/parse round trip', function () {
  var b = B.create(C.levelDef(40), 3);
  var s = B.snapshot(b);
  var p = B.parse(s, { levelDef: b.levelDef, seed: 3 });
  eq(B.snapshot(p).split('\n').slice(1).join('\n'), s.split('\n').slice(1).join('\n'), 'grid survives round trip');
  eq(p.remaining, b.remaining, 'remaining recomputed'); eq(p.target, b.target, 'target recomputed');
});
check('queue draw: weighted toward lane-reachable types; queue always length 3', function () {
  var b = fx(['A  A  A  A  A', 'S  C  S  C  S', E, E, E, E, E, E], 'strawberry', { seed: 9 });
  var w = B.reachableTypes(b); eq(w.strawberry, 3, 'S lanes'); eq(w.cherry, 2, 'C lanes'); eq(w.apple, undefined, 'A not a lane target');
  var lw = B.laneWeights(b); eq(lw.strawberry, 9, 'S weight 3 lanes x3'); eq(lw.cherry, 6, 'C weight'); eq(lw.apple, 5, 'A next-up in 5 lanes x1');
  var seen = {};
  for (var i = 0; i < 400; i++) { var t = fx(['A  A  A  A  A', 'S  C  S  C  S', E, E, E, E, E, E], null, { seed: i + 1 }); seen[t.held] = (seen[t.held] || 0) + 1; eq(t.queue.length, 3, 'queue length'); }
  assert(seen.strawberry > 0 && seen.cherry > 0, 'both lane types drawn');
  assert(seen.strawberry > seen.cherry && seen.strawberry > (seen.apple || 0), 'weighted: S (9) beats C (6) and A (5): ' + JSON.stringify(seen));
  assert(!seen.apple || seen.apple < seen.strawberry, 'lookahead type drawn less than lane type');
  var none = fx(['K  K  K  K  K', E, E, E, E, E, E, E], null, { seed: 3 }); assert(C.FRUITS.indexOf(none.held) >= 0, 'no fruit at all: falls back to levelDef.fruits');
});

// ================================================================ path: walls, pipes, trellis, coconut
check('wall lean +1: deflects into col+1; tile there = impact', function () {
  var b = fx([E, E, E, E, '.  w> S  .  .', E, E, E], 'strawberry');
  var t = B.trace(b, 1);
  eq(JSON.stringify(t.impact), '{"col":2,"row":4}', 'impact'); eq(t.deflections.length, 1, 'one deflection'); eq(t.deflections[0].lean, 1, 'lean');
  var r = B.launch(b, 1); eq(r.matched, true, 'matched after deflection'); eq(r.cleared.length, 1, 'cleared 1');
});
check('wall lean +1: deflects into empty col+1 then continues UP from there', function () {
  var b = fx([E, E, '.  .  S  .  .', E, '.  w> .  .  .', E, E, E], 'strawberry');
  var t = B.trace(b, 1);
  eq(JSON.stringify(t.impact), '{"col":2,"row":2}', 'impact up the new column');
  assert(has(t.path, 1, 4) && has(t.path, 2, 4) && has(t.path, 2, 3) && has(t.path, 2, 2), 'path has deflection step then climbs');
  eq(t.path[0].row, 7, 'path starts at row 7'); eq(t.path[0].col, 1, 'path starts in launch col');
  eq(JSON.stringify(t.path[t.path.length - 1]), '{"col":2,"row":2}', 'last path entry = impact');
});
check('wall lean -1: deflects into col-1', function () {
  var b = fx([E, E, E, E, '.  .  S  w< .', E, E, E], 'strawberry');
  var t = B.trace(b, 3); eq(JSON.stringify(t.impact), '{"col":2,"row":4}', 'impact left'); eq(t.deflections[0].lean, -1, 'lean -1');
});
check('wall: lean side blocked (off-board / obstacle) falls back to the other side', function () {
  var b = fx([E, E, E, E, 'w< S  .  .  .', E, E, E], 'strawberry');
  var t = B.trace(b, 0); eq(JSON.stringify(t.impact), '{"col":1,"row":4}', 'off-board lean falls back to +1');
  var b2 = fx([E, E, E, E, '.  S  w> T  .', E, E, E], 'strawberry');
  var t2 = B.trace(b2, 2); eq(JSON.stringify(t2.impact), '{"col":1,"row":4}', 'trellis on lean side falls back to -1');
});
check('wall: both sides blocked -> fruit returns (mismatch, no impact, moves++)', function () {
  var b = fx([E, E, E, E, '.  T  w> P  .', E, E, E], 'strawberry');
  var r = B.launch(b, 2);
  eq(r.impact, null, 'no impact'); eq(r.matched, false, 'mismatch'); eq(b.moves, 1, 'moves incremented'); eq(r.deflections.length, 1, 'wall recorded');
});
check('pipe: vertical pass-through for the fruit', function () {
  var b = fx([E, E, E, 'S  .  .  .  .', E, 'P  .  .  .  .', E, E], 'strawberry');
  var t = B.trace(b, 0); eq(JSON.stringify(t.impact), '{"col":0,"row":3}', 'impact above the pipe'); assert(has(t.path, 0, 5), 'path passes the pipe cell');
  var r = B.launch(b, 0); eq(r.matched, true, 'matched through pipe'); assert(b.cells[5][0] && b.cells[5][0].kind === 'pipe', 'pipe intact');
});
check('pipe: never entered sideways by a deflection', function () {
  var b = fx([E, E, E, E, 'S  w> P  .  .', E, E, E], 'strawberry');
  var t = B.trace(b, 1); eq(JSON.stringify(t.impact), '{"col":0,"row":4}', 'deflection skips the pipe and takes the other side');
  var b2 = fx([E, E, E, E, 'T  w> P  .  .', E, E, E], 'strawberry');
  eq(B.trace(b2, 1).impact, null, 'pipe on one side, trellis on the other: returns');
});
check('trellis: stops the fruit; returns as mismatch with hand unchanged', function () {
  var b = fx(['S  .  .  .  .', 'T  .  .  .  .', E, E, E, E, E, E], 'strawberry');
  var q = b.queue.slice(), held = b.held;
  var r = B.launch(b, 0);
  eq(r.impact, null, 'no impact'); eq(r.matched, false, 'mismatch'); eq(r.cleared.length, 0, 'nothing cleared');
  eq(b.held, held, 'held unchanged'); eq(b.queue.join(), q.join(), 'queue unchanged'); eq(b.remaining, 1, 'remaining unchanged'); eq(b.moves, 1, 'moves++');
  eq(r.held, held, 'result.held = old held'); eq(r.queue.join(), q.join(), 'result.queue = old queue');
});
check('coconut: never matches (any held type), remaining unchanged', function () {
  var types = C.FRUITS;
  for (var i = 0; i < types.length; i++) {
    var b = fx(['S  .  .  .  .', 'K  .  .  .  .', E, E, E, E, E, E], types[i]);
    var r = B.launch(b, 0);
    eq(r.matched, false, 'coconut mismatch with ' + types[i]); eq(JSON.stringify(r.impact), '{"col":0,"row":1}', 'impact reported'); eq(b.remaining, 2, 'remaining');
  }
});
check('type mismatch: matched:false, board untouched, held/queue unchanged, moves++, no power-up', function () {
  var b = fx(['S  .  .  .  .', 'S  .  .  .  .', 'C  .  .  .  .', E, E, E, E, E], 'apple');
  var before = B.snapshot(b).split('\n').slice(1).join('\n'), held = b.held, q = b.queue.join();
  var r = B.launch(b, 0);
  eq(r.matched, false, 'mismatch'); eq(r.launched, 'apple', 'launched type'); eq(r.powerup, null, 'no power-up'); eq(r.cleared.length, 0, 'nothing cleared');
  eq(r.scoreDelta, 0, 'no score'); eq(r.timeBonus, 0, 'no time'); eq(r.compaction.length, 0, 'no compaction'); eq(r.levelCleared, false, 'not cleared');
  eq(B.snapshot(b).split('\n').slice(1).join('\n'), before, 'grid unchanged'); eq(b.held, held, 'held'); eq(b.queue.join(), q, 'queue'); eq(b.moves, 1, 'moves');
});

// ================================================================ match + power-ups (one fixture each)
check('match: run clears the contiguous same-type line going UP; score 10/tile; hand advances', function () {
  var b = fx(['S  .  .  .  .', 'C  .  .  .  .', 'C  .  .  .  .', 'C  .  .  .  .', E, E, E, E], 'cherry', { queue: ['apple', 'strawberry', 'cherry'] });
  var r = B.launch(b, 0);
  eq(r.matched, true, 'matched'); eq(r.run.length, 3, 'run of 3'); eq(r.run[0].row, 3, 'run starts at impact'); eq(r.run[2].row, 1, 'run ends under the S');
  eq(r.cleared.length, 3, 'cleared 3'); eq(r.scoreDelta, 30, 'score'); eq(r.timeBonus, 3 * B.TUNING.TIME_RUN, 'time bonus = 3 x TIME_RUN'); eq(r.cherryDouble, false, 'no double (twin lane 1 is empty)');
  assert(r.twin && r.twin.col === 1 && r.twin.matched === false && r.twin.impact === null, 'twin fired into empty lane 1 and returned');
  eq(b.remaining, 1, 'remaining'); eq(r.remaining, 1, 'result.remaining'); assert(b.cells[0][0].type === 'strawberry', 'S stays at top');
  // queue[0] = apple has no lane target on the remaining board (only an S), so the hand rescue swaps it for strawberry
  eq(b.held, 'strawberry', 'held rescued: apple had no lane'); eq(JSON.stringify(r.handRescue), '{"kind":"swap","queueIndex":0}', 'rescue reported');
  eq(b.queue[0], 'apple', 'apple moved into the queue'); eq(b.queue.length, 3, 'queue refilled to 3'); eq(r.held, 'strawberry', 'result.held'); eq(b.score, 30, 'board.score');
});
check('hand: plain advance from the queue when HAND_RESCUE is off (and when the next type has a lane)', function () {
  var saved = B.TUNING.HAND_RESCUE;
  try {
    B.TUNING.HAND_RESCUE = false;
    var b = fx(['S  .  .  .  .', 'C  .  .  .  .', E, E, E, E, E, E], 'cherry', { queue: ['apple', 'strawberry', 'cherry'] });
    var r = B.launch(b, 0);
    eq(b.held, 'apple', 'held = queue[0] without rescue'); eq(r.handRescue, null, 'no rescue'); eq(b.queue[0], 'strawberry', 'queue shifted');
    eq(r.queueRedrawn.join(), '1', 'the cherry entry was redrawn (no cherry left on the board) - independent of the rescue flag'); eq(b.queue.length, 3, 'queue 3');
  } finally { B.TUNING.HAND_RESCUE = saved; }
  var b2 = fx(['S  .  .  .  .', 'C  .  .  .  .', E, E, E, E, E, E], 'cherry', { queue: ['strawberry', 'apple', 'cherry'] });
  var r2 = B.launch(b2, 0);
  eq(b2.held, 'strawberry', 'next type has a lane: plain advance'); eq(r2.handRescue, null, 'no rescue needed');
});
check('hand: held is always a lane-impact type after create and after every match (rescue redraw when the queue cannot help)', function () {
  // col 4 holds a grape sealed under a trellis: present on the board (so never redrawn) but never a lane target
  var b = fx(['S  .  .  .  G', 'C  .  .  .  T', 'A  .  .  .  .', E, E, E, E, E], 'apple', { queue: ['cherry', 'cherry', 'cherry'] });
  var r = B.launch(b, 0);   // apple row clears only (0,2); lane 0 now hits C: cherry is fine -> plain advance
  eq(b.held, 'cherry', 'cherry has a lane'); eq(r.handRescue, null, 'no rescue');
  // the freshly drawn 3rd queue entry may be a lane type (-> swap) or a lookahead type (-> redraw): seed-search both kinds
  // lane 0 will hit S with an A above it: the fresh 3rd queue draw is S (weight 3, -> swap) or A (weight 1, -> redraw)
  var kinds = {};
  for (var sd = 1; sd <= 60; sd++) {
    var q = fx(['A  .  .  .  G', 'S  .  .  .  T', 'C  .  .  .  .', E, E, E, E, E], 'cherry', { queue: ['grape', 'grape', 'grape'], seed: sd });
    var r2 = B.launch(q, 0);  // C clears; lane 0 hits S; grape is present but never a lane target
    eq(q.held, 'strawberry', 'held is the only lane type (seed ' + sd + ')'); assert(r2.handRescue, 'rescue reported');
    kinds[r2.handRescue.kind] = (kinds[r2.handRescue.kind] || 0) + 1;
    eq(r2.queueRedrawn.length, 0, 'grape is still present: no absent-type redraw');
    if (r2.handRescue.kind === 'swap') eq(q.queue[r2.handRescue.queueIndex], 'grape', 'swapped grape into the queue');
  }
  assert(kinds.swap > 0 && kinds.redraw > 0, 'both rescue kinds exercised: ' + JSON.stringify(kinds));
  for (var n = 1; n <= 52; n += 3) for (var sd = 1; sd <= 3; sd++) { var g = B.create(C.levelDef(n), sd); assert((B.reachableTypes(g) || {})[g.held], 'held has a lane at create L' + n + ' s' + sd); }
});
// ---- cherry pair: the twin fires into the adjacent lane (board.js header, "Cherry pair")
check('cherry twin matches: both runs clear, whole launch x2, twin reported, primary path kept', function () {
  var b = fx(['S  C  .  .  .', 'C  C  .  .  .', 'C  .  .  .  .', E, E, E, E, E], 'cherry');
  var r = B.launch(b, 0);
  eq(r.matched, true, 'matched'); eq(r.run.length, 2, 'primary run (0,2),(0,1)'); eq(r.cherryDouble, true, 'double');
  eq(r.powerup.type, 'cherry', 'powerup type'); eq(r.powerup.cells.length, 2, 'twin run (1,1),(1,0) in powerup'); assert(has(r.powerup.cells, 1, 1) && has(r.powerup.cells, 1, 0), 'twin run cells');
  eq(r.cleared.length, 4, 'cleared 4'); eq(r.scoreDelta, (2 * 10 + 2 * 15) * B.TUNING.CHERRY_MULT, 'score x2');
  eq(r.timeBonus, Math.min(B.TUNING.TIME_CAP, 2 * B.TUNING.TIME_RUN + 2 * B.TUNING.TIME_POWER), 'time bonus counts the twin run as power-up tiles');
  eq(b.remaining, 1, 'only the S remains'); assert(b.cells[0][0] && b.cells[0][0].type === 'strawberry', 'S untouched');
  assert(r.twin && r.twin.col === 1 && r.twin.matched === true, 'twin lane 1 matched'); eq(JSON.stringify(r.twin.impact), '{"col":1,"row":1}', 'twin impact');
  eq(r.twin.path[0].col, 1, 'twin path starts in lane 1'); eq(r.twin.path[0].row, 7, 'twin path starts at row 7'); eq(JSON.stringify(r.twin.path[r.twin.path.length - 1]), '{"col":1,"row":1}', 'twin path ends at its impact');
  eq(JSON.stringify(r.path[r.path.length - 1]), '{"col":0,"row":2}', 'result.path is still the primary'); eq(JSON.stringify(r.impact), '{"col":0,"row":2}', 'result.impact is the primary');
  assert(r.effects.some(function (e) { return e.kind === 'burst' && e.col === 1 && e.row === 1; }), 'burst effect at the twin impact');
});
check('cherry twin mismatches: single run, normal score, no penalty, hand advances, twin reported as returned', function () {
  var b = fx(['C  S  .  .  .', E, E, E, E, E, E, E], 'cherry', { queue: ['strawberry', 'strawberry', 'strawberry'] });
  var r = B.launch(b, 0);
  eq(r.matched, true, 'primary matched'); eq(r.cherryDouble, false, 'no double'); eq(r.powerup, null, 'no powerup cells'); eq(r.cleared.length, 1, 'only the primary');
  eq(r.scoreDelta, 10, 'plain score'); eq(r.timeBonus, B.TUNING.TIME_RUN, 'plain time bonus'); eq(b.remaining, 1, 'S stays');
  assert(r.twin && r.twin.col === 1 && r.twin.matched === false, 'twin returned'); eq(JSON.stringify(r.twin.impact), '{"col":1,"row":0}', 'twin hit the S');
  eq(b.held, 'strawberry', 'hand advanced normally (a twin miss is not a mismatch)'); eq(b.moves, 1, 'one move');
  var b2 = fx(['C  .  .  .  .', E, E, E, E, E, E, E], 'cherry');
  var r2 = B.launch(b2, 0); assert(r2.twin && r2.twin.impact === null && r2.twin.matched === false && r2.twin.path.length === 8, 'twin into an empty lane climbs to the canopy and returns');
  eq(r2.cherryDouble, false, 'no double'); eq(b2.remaining, 0, 'primary cleared');
});
check('cherry twin: primary mismatch returns the pair (twin null, board untouched)', function () {
  var b = fx(['S  C  .  .  .', E, E, E, E, E, E, E], 'cherry');
  var r = B.launch(b, 0); eq(r.matched, false, 'mismatch'); eq(r.twin, null, 'no twin on a primary mismatch'); eq(r.cherryDouble, false, 'no double'); eq(b.remaining, 2, 'untouched');
});
check('cherry twin lane choice: prefers the side whose impact is a cherry; right when both; left at the right edge', function () {
  var left = fx(['C  C  S  .  .', E, E, E, E, E, E, E], 'cherry');
  var r = B.launch(left, 1); eq(r.twin.col, 0, 'right is S -> left chosen'); eq(r.cherryDouble, true, 'double'); eq(left.remaining, 1, 'S stays');
  var both = fx(['C  C  C  .  .', E, E, E, E, E, E, E], 'cherry');
  var r2 = B.launch(both, 1); eq(r2.twin.col, 2, 'both cherries -> right (CHERRY_TWIN_SIDE)'); eq(r2.cherryDouble, true, 'double'); eq(both.remaining, 1, 'left C stays');
  var edge = fx(['.  .  .  C  C', E, E, E, E, E, E, E], 'cherry');
  var r3 = B.launch(edge, 4); eq(r3.twin.col, 3, 'right edge -> twin goes left'); eq(r3.cherryDouble, true, 'double at the edge'); eq(edge.remaining, 0, 'both cleared');
  var edge0 = fx(['C  .  .  .  .', E, E, E, E, E, E, E], 'cherry');
  var r4 = B.launch(edge0, 0); eq(r4.twin.col, 1, 'left edge -> twin goes right');
});
check('cherry twin through a pipe: passes vertically, matches above it, pipe intact', function () {
  var b = fx(['C  C  .  .  .', '.  P  .  .  .', E, E, E, E, E, E], 'cherry');
  var r = B.launch(b, 0);
  eq(r.cherryDouble, true, 'double through the pipe'); assert(has(r.twin.path, 1, 1), 'twin path crosses the pipe cell'); eq(JSON.stringify(r.twin.impact), '{"col":1,"row":0}', 'impact above the pipe');
  assert(b.cells[1][1] && b.cells[1][1].kind === 'pipe', 'pipe intact'); eq(b.remaining, 0, 'both cleared');
});
check('cherry twin blocked by a trellis: twin returns, cherry above the trellis stays, no double', function () {
  var b = fx(['C  C  .  .  .', '.  T  .  .  .', E, E, E, E, E, E], 'cherry');
  var r = B.launch(b, 0);
  eq(r.cherryDouble, false, 'no double'); eq(r.twin.impact, null, 'no impact'); eq(r.twin.matched, false, 'twin returned'); eq(JSON.stringify(r.twin.path[r.twin.path.length - 1]), '{"col":1,"row":1}', 'twin stopped at the trellis');
  assert(b.cells[0][1] && b.cells[0][1].type === 'cherry', 'C above the trellis stays'); eq(b.remaining, 1, 'remaining');
});
check('cherry twin and walls: deflects into the next lane and matches there; deflecting into the primary run never doubles', function () {
  var b = fx(['C  .  C  .  .', E, '.  w> .  .  .', E, E, E, E, E], 'cherry');
  var r = B.launch(b, 0);
  eq(r.twin.col, 1, 'twin lane is still lane 1'); eq(r.twin.deflections.length, 1, 'bounced off the wall'); eq(JSON.stringify(r.twin.impact), '{"col":2,"row":0}', 'impact in lane 2 after the deflection');
  eq(r.cherryDouble, true, 'double via deflection'); eq(b.remaining, 0, 'both cleared'); assert(b.cells[2][1].kind === 'wall', 'wall intact');
  var same = fx(['C  .  .  .  .', 'C  .  .  .  .', '.  w< .  .  .', E, E, E, E, E], 'cherry');
  var r2 = B.launch(same, 0);
  eq(JSON.stringify(r2.twin.impact), '{"col":0,"row":1}', 'twin deflected into the primary impact cell'); eq(r2.twin.matched, false, 'already being cleared -> not a twin match');
  eq(r2.cherryDouble, false, 'no double for hitting the same run twice'); eq(r2.cleared.length, 2, 'primary run only'); eq(r2.scoreDelta, 20, 'no x2');
});
check('strawberry: cross clears up/left/right/down neighbours of the impact (any tile kind), obstacles untouched', function () {
  var b = fx([E, E, E, '.  .  A  .  .', '.  K  S  w> .', E, E, E], 'strawberry');
  var r = B.launch(b, 2);
  eq(r.run.length, 1, 'run'); eq(r.powerup.type, 'strawberry', 'type'); eq(r.powerup.cells.length, 2, 'A above + K left');
  assert(has(r.powerup.cells, 2, 3) && has(r.powerup.cells, 1, 4), 'cross cells');
  assert(b.cells[4][3].kind === 'wall', 'wall untouched'); eq(b.remaining, 0, 'remaining'); eq(r.scoreDelta, 10 + 30, 'score');
  assert(r.effects.some(function (e) { return e.kind === 'cross' && e.col === 2 && e.row === 4; }), 'cross effect');
});
check('apple: clears the impact row, all tile kinds, obstacles untouched', function () {
  var b = fx([E, E, 'S  .  .  .  S', 'K  C  A  w> S', E, E, E, E], 'apple');
  var r = B.launch(b, 2);
  eq(r.powerup.cells.length, 3, 'K, C, S in row'); assert(has(r.powerup.cells, 0, 3) && has(r.powerup.cells, 1, 3) && has(r.powerup.cells, 4, 3), 'row cells');
  assert(b.cells[3][3].kind === 'wall', 'wall untouched'); eq(b.remaining, 2, 'the two S at row 2 remain');
  assert(r.effects.some(function (e) { return e.kind === 'appleRow' && e.row === 3; }), 'appleRow effect');
  eq(r.compaction.length, 2, 'the two S tiles (fixture left rows 0-1 empty) slide to the top'); eq(r.compaction[0].to.row, 0, 'to row 0'); eq(r.compaction[1].to.row, 0, 'to row 0');
});
check('banana: monkey sweeps the impact row (tiles like apple) with a monkey effect; no obstacles -> broken empty', function () {
  var b = fx([E, E, E, 'S  C  B  K  A', E, E, E, E], 'banana');
  var r = B.launch(b, 2);
  eq(r.powerup.cells.length, 4, 'whole row'); eq(b.remaining, 0, 'remaining'); eq(r.broken.length, 0, 'nothing to break');
  assert(r.effects.some(function (e) { return e.kind === 'monkey' && e.row === 3; }), 'monkey effect');
});
check('banana (J-008): the sweep BREAKS every wall/trellis/pipe in its row, clears the coconut as a tile, leaves other rows alone', function () {
  var b = fx([E, E, 'w< S  .  .  T', 'w> B  K  T  P', E, E, E, E], 'banana');
  var r = B.launch(b, 1);
  eq(r.matched, true, 'match'); eq(r.broken.length, 3, 'wall, trellis, pipe in the row');
  var kinds = r.broken.map(function (x) { return x.kind; }).sort().join(','); eq(kinds, 'pipe,trellis,wall', 'kinds');
  assert(r.broken.every(function (x) { return x.row === 3; }), 'all in row 3');
  eq(b.cells[3][0], null, 'wall removed'); eq(b.cells[3][3], null, 'trellis removed'); eq(b.cells[3][4], null, 'pipe removed');
  assert(has(r.cleared, 2, 3), 'coconut cleared as a tile'); assert(!r.broken.some(function (x) { return x.col === 2; }), 'coconut not in broken');
  eq(r.powerup.cells.length, 1, 'power-up cells = the coconut'); eq(b.remaining, 1, 'S at (1,2) remains');
  assert(b.cells[2] && b.cells[2].some(function (c) { return c && c.kind === 'wall'; }), 'row-2 wall untouched');
  assert(b.cells[2].some(function (c) { return c && c.kind === 'trellis'; }), 'row-2 trellis untouched');
  eq(r.effects.filter(function (e) { return e.kind === 'burst'; }).length, 3, 'one burst per broken obstacle');
  assert(r.effects.some(function (e) { return e.kind === 'monkey' && e.row === 3; }), 'monkey effect');
  // NEGATIVE CONTROL: the same board with an APPLE launched leaves all three obstacles standing
  var b2 = fx([E, E, 'w< S  .  .  T', 'w> A  K  T  P', E, E, E, E], 'apple');
  var r2 = B.launch(b2, 1);
  eq(r2.broken.length, 0, 'apple breaks nothing'); assert(b2.cells[3][0] && b2.cells[3][0].kind === 'wall', 'wall stands under apple');
  assert(b2.cells[3][3] && b2.cells[3][3].kind === 'trellis', 'trellis stands'); assert(b2.cells[3][4] && b2.cells[3][4].kind === 'pipe', 'pipe stands');
});
check('watermelon: splash clears the 8 neighbours (any kind), obstacles untouched', function () {
  var b = fx([E, E, 'S  C  A  .  .', 'K  W  T  .  .', 'A  .  S  .  .', E, E, E], 'watermelon');
  var r = B.launch(b, 1);
  eq(r.powerup.cells.length, 6, 'S C A K A S'); assert(!has(r.powerup.cells, 2, 3), 'trellis not cleared'); assert(b.cells[3][2].kind === 'trellis', 'trellis intact');
  assert(r.effects.some(function (e) { return e.kind === 'splash' && e.type === 'watermelon'; }), 'splash effect'); eq(b.remaining, 0, 'remaining');
});
check('grape: clears the whole 4-connected same-type cluster, isolated same-type tile untouched', function () {
  var b = fx(['G  .  .  .  .', 'A  G  .  .  .', 'C  G  G  .  .', '.  G  S  .  .', E, E, E, E], 'grape');
  var r = B.launch(b, 1);
  eq(r.run.length, 3, 'vertical run'); eq(r.powerup.cells.length, 1, 'plus the side grape'); assert(has(r.powerup.cells, 2, 2), 'cluster cell');
  assert(b.cells[0][0] && b.cells[0][0].type === 'grape', 'isolated G (0,0) not connected -> stays'); eq(b.remaining, 4, 'G A C S remain');
});
check('pomegranate: clears 5 random tiles elsewhere, deterministic by seed', function () {
  var rows = ['S  S  S  S  S', 'S  S  S  S  S', 'M  S  S  S  S', E, E, E, E, E];
  var b1 = fx(rows, 'pomegranate', { seed: 11 }), b2 = fx(rows, 'pomegranate', { seed: 11 }), b3 = fx(rows, 'pomegranate', { seed: 12 });
  var r1 = B.launch(b1, 0), r2 = B.launch(b2, 0), r3 = B.launch(b3, 0);
  eq(r1.powerup.cells.length, 5, '5 tiles'); assert(!has(r1.powerup.cells, 0, 2), 'not the run cell');
  eq(JSON.stringify(r1.powerup.cells), JSON.stringify(r2.powerup.cells), 'same seed same seeds');
  assert(JSON.stringify(r1.powerup.cells) !== JSON.stringify(r3.powerup.cells), 'different seed differs');
  eq(b1.remaining, 15 - 1 - 5, 'remaining'); assert(r1.effects.some(function (e) { return e.kind === 'seeds' && e.cells.length === 5; }), 'seeds effect');
});
check('pineapple: breaks ONE 4-adjacent obstacle (wall/trellis/pipe/coconut); none adjacent -> none', function () {
  var b = fx([E, E, 'w< .  .  .  .', 'N  K  .  .  .', E, E, E, E], 'pineapple');
  var r = B.launch(b, 0);
  eq(r.broken.length, 1, 'one broken'); eq(r.broken[0].kind, 'wall', 'wall first (up before right)'); eq(b.cells[2][0], null, 'wall removed');
  var lt = B.lowestTile(b, 1); assert(lt && b.cells[lt.row][1].kind === 'coconut' && lt.row === 0, 'coconut kept (only one break) and compacted to row 0'); eq(b.remaining, 1, 'coconut still counts');
  var b2 = fx([E, E, E, 'N  K  .  .  .', E, E, E, E], 'pineapple');
  var r2 = B.launch(b2, 0);
  eq(r2.broken.length, 1, 'coconut broken'); eq(r2.broken[0].kind, 'coconut', 'kind'); assert(has(r2.cleared, 1, 3), 'coconut in cleared'); eq(b2.remaining, 0, 'remaining decremented');
  var b3 = fx([E, E, E, 'N  .  .  .  .', E, E, E, E], 'pineapple');
  var r3 = B.launch(b3, 0); eq(r3.broken.length, 0, 'nothing adjacent'); eq(r3.matched, true, 'still a match');
  var b4 = fx([E, E, 'P  .  .  .  .', 'N  .  .  .  .', E, E, E, E], 'pineapple');
  var r4 = B.launch(b4, 0); eq(r4.broken[0].kind, 'pipe', 'pipe breakable'); eq(b4.cells[2][0], null, 'pipe removed');
});
check('orange: chain reaction clears touching same-type clusters (size >= 2) round by round, up to 4 rounds', function () {
  var b = fx(['B  .  .  .  .', 'W  A  .  .  .', 'W  A  .  .  .', '.  .  O  .  .', '.  .  O  .  .', E, E, E], 'orange');
  // impact O(2,4), run O(2,3); touching A cluster? A at (1,1),(1,2): (1,3) is empty, so nothing touches -> chain 0
  var r = B.launch(b, 2); eq(r.chain, 0, 'no adjacent cluster -> chain 0'); eq(r.scoreDelta, 20, 'plain score');
  var b2 = fx(['B  .  .  .  .', 'W  .  .  .  .', 'W  A  .  .  .', '.  A  O  .  .', 'C  .  O  .  .', E, E, E], 'orange');
  var r2 = B.launch(b2, 2);
  eq(r2.chain, 2, 'A pair (round 1) then W pair (round 2)'); eq(r2.cleared.length, 6, 'O O A A W W');
  assert(b2.cells[0][0] && b2.cells[0][0].type === 'banana', 'single B not a cluster -> stays');
  assert(b2.cells[1][0] && b2.cells[1][0].type === 'cherry', 'C slid up after compaction (was at row 4, alone in col 0 below the Ws)');
  eq(r2.scoreDelta, Math.round((2 * 10 + 4 * 15) * (1 + 0.5 * 2)), 'score x(1+0.5*chain)');
  var rounds = r2.effects.filter(function (e) { return e.kind === 'chain'; }).map(function (e) { return e.round; });
  eq(rounds.join(), '1,2', 'chain effects per round');
});
check('orange: chain capped at ORANGE_ROUNDS', function () {
  // a staircase of 2-tile clusters, 6 deep, only 4 rounds may fire
  var b = fx(['G  G  .  .  .', 'B  B  .  .  .', 'W  W  .  .  .', 'A  A  .  .  .', 'S  S  .  .  .', 'C  C  .  .  .', 'O  .  .  .  .', E], 'orange');
  var r = B.launch(b, 0);
  eq(r.chain, B.TUNING.ORANGE_ROUNDS, 'chain == rounds cap'); assert(b.cells[0][0].type === 'grape', 'top cluster survived');
});
check('lemon: clears the whole impact column on both sides of an obstacle', function () {
  var b = fx(['.  .  K  .  .', '.  .  A  .  .', '.  .  w< .  .', '.  .  S  .  .', '.  .  L  .  .', E, E, E], 'lemon');
  var r = B.launch(b, 2);
  eq(r.run.length, 1, 'run'); eq(r.powerup.cells.length, 3, 'S, A, K'); assert(has(r.powerup.cells, 2, 0) && has(r.powerup.cells, 2, 1), 'above the wall too');
  assert(b.cells[2][2].kind === 'wall', 'wall untouched'); eq(b.remaining, 0, 'remaining');
  assert(r.effects.some(function (e) { return e.kind === 'lemonColumn' && e.col === 2; }), 'lemonColumn effect');
});
check('power-ups apply ONLY on a match (lemon launched at an apple clears nothing)', function () {
  var b = fx(['.  .  A  .  .', '.  .  A  .  .', E, E, E, E, E, E], 'lemon');
  var r = B.launch(b, 2); eq(r.matched, false, 'mismatch'); eq(r.powerup, null, 'no power-up'); eq(b.remaining, 2, 'remaining');
});

// ================================================================ compaction, scoring, level clear
check('compaction: tiles slide UP within their segment after a clear; moves reported', function () {
  var b = fx(['S  .  .  .  .', 'S  .  .  .  .', 'S  .  A  .  .', 'S  .  .  .  .', 'S  .  .  .  .', E, E, E], 'apple');
  var r = B.launch(b, 2);
  assert(has(r.powerup.cells, 0, 2), 'apple row hit (0,2)');
  eq(r.compaction.length, 2, 'two tiles slid'); eq(JSON.stringify(r.compaction[0]), '{"from":{"col":0,"row":3},"to":{"col":0,"row":2}}', 'first slide');
  eq(JSON.stringify(r.compaction[1]), '{"from":{"col":0,"row":4},"to":{"col":0,"row":3}}', 'second slide');
  assert(b.cells[4][0] === null && b.cells[3][0].type === 'strawberry', 'grid reflects slide'); assert(compactionOK(b), 'invariant');
});
check('compaction: obstacles bound segments (tile below a wall rests under it, never enters a pipe)', function () {
  var b = fx(['A  .  .  .  .', 'A  .  .  .  .', 'w> .  .  .  .', 'A  .  .  .  .', 'S  .  .  .  .', 'P  .  .  .  .', 'A  .  .  .  .', E], 'apple');
  b.cells[3][0] = null; b.cells[6][0] = null; B.recount(b);  // hand-made gaps
  var moves = B.compact(b);
  eq(moves.length, 1, 'only S slides'); eq(JSON.stringify(moves[0]), '{"from":{"col":0,"row":4},"to":{"col":0,"row":3}}', 'S under the wall');
  assert(b.cells[5][0].kind === 'pipe' && b.cells[2][0].kind === 'wall', 'obstacles intact'); assert(compactionOK(b), 'invariant');
});
check('score & time bonus: 10/run, 15/power-up, time TIME_RUN/run + TIME_POWER/power capped at TIME_CAP', function () {
  var T = B.TUNING;
  var b = fx(['.  .  A  .  .', '.  .  A  .  .', '.  .  A  .  .', '.  .  A  .  .', '.  .  A  .  .', '.  .  A  .  .', '.  .  L  .  .', E], 'lemon');
  var r = B.launch(b, 2);
  eq(r.scoreDelta, 10 + 6 * 15, 'score'); var raw = 1 * T.TIME_RUN + 6 * T.TIME_POWER;
  assert(raw > T.TIME_CAP, 'fixture exceeds the cap (raw ' + raw + ' > ' + T.TIME_CAP + ')'); eq(r.timeBonus, T.TIME_CAP, 'capped at TIME_CAP');
  var b2 = fx(['.  .  A  .  .', '.  .  L  .  .', E, E, E, E, E, E], 'lemon');
  var r2 = B.launch(b2, 2); eq(r2.timeBonus, T.TIME_RUN + T.TIME_POWER, 'under the cap: 1 run + 1 power tile');
  eq(T.TIME_RUN, 0.25, 'TIME_RUN 0.25 (2026-09-02 retune)'); eq(T.TIME_POWER, 0.5, 'TIME_POWER 0.5'); eq(T.TIME_CAP, 3, 'TIME_CAP 3');
});
check('level clear when remaining < target; result.levelCleared and result.remaining', function () {
  var b = fx(['S  .  .  .  C', 'C  .  .  .  .', E, E, E, E, E, E], 'cherry', { target: 2 });
  eq(b.remaining, 3, '3 tiles'); eq(b.target, 2, 'target');
  var r = B.launch(b, 0); eq(r.levelCleared, false, '2 left is not < 2'); eq(r.remaining, 2, 'remaining 2');
  b.held = 'cherry';
  var r2 = B.launch(b, 4); eq(r2.levelCleared, true, '1 < 2'); eq(r2.remaining, 1, 'remaining 1');
});
check('isWinnable: sealed fruit above a trellis beyond target-1 is not winnable; a clear column is', function () {
  var good = fx(['S  S  .  .  .', 'S  C  .  .  .', E, E, E, E, E, E], 'cherry');
  assert(B.isWinnable(good), 'plain board winnable');
  var bad = fx(['S  S  S  S  S', 'T  T  T  T  T', 'C  C  .  .  .', E, E, E, E, E], 'cherry');
  assert(!B.isWinnable(bad), '5 sealed above trellises, target 2 -> not winnable');
  var cocoOK = fx(['K  .  .  .  .', 'S  .  .  .  .', 'S  .  .  .  .', E, E, E, E, E], 'strawberry');
  assert(B.isWinnable(cocoOK), 'one coconut is within target-1 (=1): winnable'); eq(B.analyse(cocoOK).sealed, 1, 'coconut counted as sealed');
  var cocoBad = fx(['K  .  .  .  K', 'S  .  .  .  .', 'S  .  .  .  .', E, E, E, E, E], 'strawberry');
  assert(!B.isWinnable(cocoBad), 'two coconuts exceed target-1 -> not winnable (power-ups are never assumed)');
  var shielded = fx(['S  .  .  .  .', 'K  .  .  .  .', 'S  .  .  .  .', E, E, E, E, E], 'strawberry');
  eq(B.analyse(shielded).sealed, 2, 'fruit above a coconut is sealed with it'); assert(!B.isWinnable(shielded), 'sealed 2 > 1');
  var viaWall = fx(['.  S  .  .  .', '.  S  .  .  .', 'w> .  .  .  .', E, E, E, E, E], 'strawberry');
  eq(B.analyse(viaWall).sealed, 0, 'segment entered via a wall deflection is reachable');
});
check('isWinnable: segment above a pipe becomes reachable once the segment below clears (fixed point)', function () {
  var b = fx(['S  .  .  .  .', 'S  .  .  .  .', 'S  .  .  .  .', 'P  .  .  .  .', 'C  .  .  .  .', 'C  .  .  .  .', E, E], 'cherry');
  var a = B.analyse(b); eq(a.sealed, 0, 'nothing sealed'); eq(a.direct.length, 5, 'all 5 directly clearable');
  var blocked = fx(['S  .  .  .  .', 'S  .  .  .  .', 'P  .  .  .  .', 'K  .  .  .  .', 'C  .  .  .  .', E, E, E], 'cherry');
  eq(B.analyse(blocked).sealed, 3, 'coconut under a pipe seals the segment above it');
});

// ================================================================ fuzz
check('fuzz: 2000 random launches never throw; compaction + recount + hand invariants hold after every launch', function () {
  var rng = B.rng(2026), launches = 0, matches = 0, clears = 0;
  while (launches < 2000) {
    var n = 1 + Math.floor(rng() * 52), seed = 1 + Math.floor(rng() * 100000);
    var b = B.create(C.levelDef(n), seed);
    for (var m = 0; m < 40 && launches < 2000; m++) {
      var col = Math.floor(rng() * b.cols), held = b.held, q = b.queue.join(), moves = b.moves, rem = b.remaining;
      var r = B.launch(b, col); launches++;
      var tag = ' (L' + n + ' seed ' + seed + ' launch ' + m + ' col ' + col + ')';
      assert(compactionOK(b), 'compaction' + tag + '\n' + B.snapshot(b));
      assert(recountOK(b), 'recount' + tag);
      eq(b.queue.length, 3, 'queue 3' + tag); eq(b.moves, moves + 1, 'moves' + tag);
      assert(r.path.length >= 1 && r.path[0].row === b.rows - 1 && r.path[0].col === col, 'path starts at row 7' + tag);
      eq(r.remaining, b.remaining, 'result.remaining mirrors board' + tag); eq(r.levelCleared, b.remaining < b.target, 'levelCleared' + tag);
      if (!r.matched) { eq(b.held, held, 'held unchanged on miss' + tag); eq(b.queue.join(), q, 'queue unchanged on miss' + tag); eq(b.remaining, rem, 'remaining unchanged on miss' + tag); }
      else { matches++; assert(r.cleared.length >= 1 && rem - b.remaining === r.cleared.length, 'cleared count matches remaining delta' + tag); assert(r.scoreDelta > 0, 'score' + tag); assert(r.timeBonus > 0 && r.timeBonus <= B.TUNING.TIME_CAP, 'time bonus within cap' + tag); }
      if (r.launched === 'cherry' && r.matched) { assert(r.twin && r.twin.col !== col && Math.abs(r.twin.col - col) === 1 && r.twin.path.length >= 1, 'cherry twin in an adjacent lane' + tag); eq(r.cherryDouble, r.twin.matched, 'double iff twin matched' + tag); }
      else assert(r.twin === null, 'twin only on a matched cherry' + tag);
      if (r.levelCleared) { clears++; break; }
    }
  }
  assert(matches > 200, 'fuzz produced matches: ' + matches); assert(clears > 0, 'fuzz cleared some levels: ' + clears);
  console.log('     fuzz: launches=' + launches + ' matches=' + matches + ' levelsCleared=' + clears);
});

// ================================================================ NEGATIVE CONTROLS (prove the invariant checks can fail)
check('NEGATIVE CONTROL: corrupting a cell without updating remaining is caught by the recount check', function () {
  var b = B.create(C.levelDef(20), 3);
  assert(recountOK(b), 'clean board passes recount');
  var t = B.lowestTile(b, 0); assert(t, 'col 0 has a tile');
  b.cells[t.row][t.col] = null;                       // corrupt: remove a tile, leave remaining stale
  assert(b.cells[t.row][t.col] === null, 'injection landed');
  assert(recountOK(b) === false, 'recount check DETECTS the corrupted cell');
});
check('NEGATIVE CONTROL: corrupting compaction (a gap above a tile) is caught by the compaction invariant', function () {
  var b = B.create(C.levelDef(5), 3);
  assert(compactionOK(b), 'clean board passes');
  var t = B.lowestTile(b, 1); assert(t && t.row < b.rows - 1, 'col 1 has a tile with room below');
  b.cells[t.row + 1][1] = b.cells[t.row][1]; b.cells[t.row][1] = null;   // corrupt: tile moved down, gap left above it
  assert(b.cells[t.row][1] === null && isTile(b.cells[t.row + 1][1]), 'injection landed');
  assert(compactionOK(b) === false, 'compaction invariant DETECTS the gap');
});
check('NEGATIVE CONTROL: a board that is not winnable is rejected by isWinnable (so the 260-board sweep can fail)', function () {
  var bad = fx(['S  S  S  S  S', 'T  T  T  T  T', E, E, E, E, E, E], 'strawberry');
  assert(B.isWinnable(bad) === false, 'all fruit sealed -> false');
});

// ================================================================ summary
console.log('SUMMARY passed=' + passed + ' failed=' + failed + ' errors=' + errors);
process.exit((failed === 0 && errors === 0) ? 0 : 1);
