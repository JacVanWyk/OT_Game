#!/usr/bin/env node
/* Orchard Toss — tools/sim_players.js
 * Player-archetype simulation over OT.Board (pure logic, no browser). This is the "sensible-player simulation"
 * every tuning value in RELEASE_NOTES.md was measured with (v0.1.0 QA, 2026-09-02; promoted into the repo 2026-09-03
 * for bridge item J-006 so the numbers can be re-measured instead of eyeballed).
 *
 * Clock model ("model B", the real clock): game.js keeps the timer running through the flight, the impact squash,
 * wall bounces, the mismatch return flight + lockout, and the post-match pop/effect/compaction animation, so each
 * launch costs flight + think + animation, and the launch's timeBonus is credited afterwards. The animation
 * durations are READ FROM js/game.js (its TUNE block) at start-up and asserted present, never hand-copied.
 *
 * Archetypes (think = seconds between launches, err = probability of firing into a non-matching lane):
 *   sensible 0.35 s / 0    greedy: of the matching lanes, the one clearing the most tiles (evaluated on a clone)
 *   naive    1.0 s  / 0    any matching lane
 *   casual   1.5 s  / 0.20
 *   sloppy   2.0 s  / 0.35
 *   child    3.0 s  / 0.40
 *
 * Usage: node tools/sim_players.js [--seeds 5] [--time-ramp '{"summer":[36,30]}'] [--bonus-scale '{"winter":0.6}'] [--zones-only] [--json out.json]
 *   --time-ramp   overrides OT.CONFIG.TIME_RAMP entries for a what-if run (the shipped values are untouched on disk)
 *   --bonus-scale overrides OT.Board.TUNING.TIME_ZONE_SCALE entries (per-zone multiplier on the time-back bonus)
 *   --zones-only prints only the per-zone difficulty table (for sweeps)
 *   --json       also writes every per-level row to a file
 * Exit 0 always; this is a measurement, not a gate. Read the distributions, not a pass count.
 */
'use strict';
var path = require('path');
var fs = require('fs');
var PROTO = path.resolve(__dirname, '..');
var Board = require(path.join(PROTO, 'js/board.js'));
var C = global.OT.CONFIG;

// ---- args
var args = process.argv.slice(2), opt = { seeds: 5, timeRamp: null, zonesOnly: false, json: null };
for (var ai = 0; ai < args.length; ai++) {
  if (args[ai] === '--seeds') opt.seeds = parseInt(args[++ai], 10);
  else if (args[ai] === '--time-ramp') opt.timeRamp = JSON.parse(args[++ai]);
  else if (args[ai] === '--bonus-scale') opt.bonusScale = JSON.parse(args[++ai]);
  else if (args[ai] === '--zones-only') opt.zonesOnly = true;
  else if (args[ai] === '--json') opt.json = args[++ai];
  else throw new Error('unknown arg ' + args[ai]);
}
if (opt.bonusScale) {
  Object.keys(opt.bonusScale).forEach(function (z) {
    if (!(z in Board.TUNING.TIME_ZONE_SCALE)) throw new Error('--bonus-scale: unknown zone ' + z);
    Board.TUNING.TIME_ZONE_SCALE[z] = opt.bonusScale[z];
  });
}
if (opt.timeRamp) {
  Object.keys(opt.timeRamp).forEach(function (z) {
    if (!C.TIME_RAMP[z]) throw new Error('--time-ramp: unknown zone ' + z);
    C.TIME_RAMP[z] = opt.timeRamp[z];   // levelDef reads TIME_RAMP by reference at call time
  });
}

// ---- animation durations from game.js (asserted, so a renamed constant fails loudly instead of drifting)
var gameSrc = fs.readFileSync(path.join(PROTO, 'js/game.js'), 'utf8');
function tune(name) {
  var m = new RegExp('\\b' + name + ':\\s*([0-9.]+)').exec(gameSrc);
  if (!m) throw new Error('game.js TUNE.' + name + ' not found; update tools/sim_players.js');
  return parseFloat(m[1]);
}
var T = {
  SQUASH_S: tune('SQUASH_S'), BOUNCE_S: tune('BOUNCE_S'), RETURN_MUL: tune('RETURN_SPEED_MUL'),
  POP_INTERVAL_S: tune('POP_INTERVAL_S'), POP_S: tune('POP_S'), COMPACT_S: tune('COMPACT_S'),
  EFF: { monkey: tune('EFFECT_MONKEY_S'), lemonColumn: tune('EFFECT_LEMON_S'), appleRow: tune('EFFECT_APPLE_S'),
         cross: tune('EFFECT_CROSS_S'), burst: tune('EFFECT_BURST_S'), seeds: tune('EFFECT_SEEDS_S'),
         chain: tune('EFFECT_CHAIN_S'), splash: 0 },
  CHAIN_ROUND_S: tune('EFFECT_CHAIN_ROUND_S')
};
var CELL = C.CELL, FIRST_LEG = C.LAUNCH_Y - (C.BOARD_Y + (C.ROWS - 1) * CELL + CELL / 2);

function flightDist(res) { return FIRST_LEG + CELL * Math.max(0, res.path.length - 1); }
function animTime(res) {
  // game.js: pops run in sequence; effect cues run in parallel with the pops, so the anim lasts max(pops, longest cue)
  var pops = res.cleared.length ? (res.cleared.length - 1) * T.POP_INTERVAL_S + T.POP_S : 0;
  var ef = 0;
  res.effects.forEach(function (e) { ef = Math.max(ef, (T.EFF[e.kind] || 0) + (e.kind === 'chain' ? (e.round || 0) * T.CHAIN_ROUND_S : 0)); });
  return Math.max(pops, ef) + T.COMPACT_S;
}
function costB(res, think) {
  var d = flightDist(res);
  var s = d / C.FLIGHT_SPEED + think + T.SQUASH_S + T.BOUNCE_S * res.deflections.length;
  if (!res.matched) s += C.LOCKOUT_S + d / (C.FLIGHT_SPEED * T.RETURN_MUL);
  else s += animTime(res);
  return s;
}
function cloneBoard(b) {
  return { cols: b.cols, rows: b.rows, seed: b.seed, levelDef: b.levelDef,
    cells: b.cells.map(function (row) { return row.map(function (c) { return c ? Object.assign({}, c) : null; }); }),
    initialFruit: b.initialFruit, remaining: b.remaining, target: b.target, held: b.held, queue: b.queue.slice(),
    moves: b.moves, score: b.score, warnings: [], _rng: Board.rng(b.seed + b.moves) };
}
function lanes(b) {
  var m = [], n = [];
  for (var c = 0; c < b.cols; c++) {
    var t = Board.trace(b, c);
    var cell = t.impact ? b.cells[t.impact.row][t.impact.col] : null;
    if (cell && cell.kind === 'fruit' && cell.type === b.held) m.push(c); else n.push(c);
  }
  return { match: m, non: n };
}
function bestOf(b, cands) {
  var best = cands[0], bestN = -1;
  cands.forEach(function (c) { var r = Board.launch(cloneBoard(b), c); var n = r.matched ? r.cleared.length : 0; if (n > bestN) { bestN = n; best = c; } });
  return best;
}
function play(level, seed, p, acc) {
  var def = C.levelDef(level), b = Board.create(def, seed), rng = Board.rng(seed * 31 + level);
  var t = def.timeLimit, launches = 0, failed = false, gross = 0, bonus = 0;
  while (launches < 200) {
    var l = lanes(b); if (!l.match.length) break;
    var col = (l.non.length && rng() < p.err) ? l.non[Math.floor(rng() * l.non.length)] : (p.greedy ? bestOf(b, l.match) : l.match[Math.floor(rng() * l.match.length)]);
    var res = Board.launch(b, col); launches++;
    if (acc) {
      acc.launches++;
      if (res.launched === 'cherry') { acc.cherryLaunches++; if (res.cherryDouble) acc.cherryDoubles++; }
      if (res.launched === 'banana' && res.matched) { acc.bananaMatches++; acc.bananaBroken += res.broken.length; }
      if (res.matched) { acc.matches++; acc.runTiles += res.run.length; acc.clearedTiles += res.cleared.length; if (res.handRescue) acc.rescues++; if (res.run.length >= 2) acc.runs2++; }
      else acc.misses++;
    }
    var c = costB(res, p.think); gross += c; bonus += res.timeBonus;
    t -= c; if (t <= 0) { failed = true; break; }
    t += res.timeBonus;
    if (res.levelCleared) break;
  }
  return { player: p.name, zone: def.zone, level: level, seed: seed, cleared: b.remaining < b.target && !failed, failed: failed,
    frac: t / def.timeLimit, gross: gross, bonus: bonus, launches: launches, limit: def.timeLimit, initialFruit: b.initialFruit, target: b.target };
}
function median(a) { var s = a.slice().sort(function (x, y) { return x - y; }); var m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : NaN; }
function pct(a, p) { var s = a.slice().sort(function (x, y) { return x - y; }); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; }
function r2(x) { return +Number(x).toFixed(2); }
function failPct(rs) { return r2(100 * rs.filter(function (r) { return r.failed; }).length / rs.length); }
function starsOf(fr) { var d = [0, 0, 0]; fr.forEach(function (f) { d[f >= C.STAR_FRACTIONS[0] ? 2 : f >= C.STAR_FRACTIONS[1] ? 1 : 0]++; }); return d.map(function (n) { return Math.round(100 * n / Math.max(1, fr.length)); }).join('/'); }

var zones = ['spring', 'summer', 'autumn', 'winter'];
var players = [
  { name: 'sensible', think: 0.35, err: 0, greedy: true },
  { name: 'naive', think: 1.0, err: 0, greedy: false },
  { name: 'casual', think: 1.5, err: 0.2, greedy: false },
  { name: 'sloppy', think: 2.0, err: 0.35, greedy: false },
  { name: 'child', think: 3.0, err: 0.4, greedy: false }];
var SEEDS = []; for (var si = 1; si <= opt.seeds; si++) SEEDS.push(si);

console.log('TUNING: TIME_RUN=' + Board.TUNING.TIME_RUN + ' TIME_POWER=' + Board.TUNING.TIME_POWER + ' TIME_CAP=' + Board.TUNING.TIME_CAP +
  ' CLUSTER_BIAS=' + Board.TUNING.CLUSTER_BIAS + ' STAR_FRACTIONS=' + JSON.stringify(C.STAR_FRACTIONS) +
  ' TIME_RAMP=' + JSON.stringify(C.TIME_RAMP) + (opt.timeRamp ? ' (OVERRIDDEN)' : '') +
  ' TIME_ZONE_SCALE=' + JSON.stringify(Board.TUNING.TIME_ZONE_SCALE) + (opt.bonusScale ? ' (OVERRIDDEN)' : '') + ' seeds=' + SEEDS.length);

var rows = [], acc = { launches: 0, matches: 0, misses: 0, runTiles: 0, clearedTiles: 0, rescues: 0, runs2: 0, cherryLaunches: 0, cherryDoubles: 0, bananaMatches: 0, bananaBroken: 0 };
players.forEach(function (p) {
  for (var L = 1; L <= C.TOTAL_LEVELS; L++) SEEDS.forEach(function (s) { rows.push(play(L, s, p, p.name === 'sensible' ? acc : null)); });
});
function sel(pname, z) { return rows.filter(function (r) { return r.player === pname && (!z || r.zone === z); }); }

// ---- D. zone difficulty (the J-006 table): must climb monotonically through the zones
var dz = [];
zones.forEach(function (z) {
  var s = sel('sensible', z), n = sel('naive', z), c = sel('casual', z), sl = sel('sloppy', z);
  var okS = s.filter(function (r) { return r.cleared; }), okC = c.filter(function (r) { return r.cleared; }), okN = n.filter(function (r) { return r.cleared; });
  dz.push({ zone: z, limit: median(s.map(function (r) { return r.limit; })), fruit: median(s.map(function (r) { return r.initialFruit; })),
    sens_launch: median(s.map(function (r) { return r.launches; })), sens_frac: r2(median(okS.map(function (r) { return r.frac; }))),
    sens_stars: starsOf(okS.map(function (r) { return r.frac; })), naive_stars: starsOf(okN.map(function (r) { return r.frac; })),
    casual_fail: failPct(c), casual_frac: r2(median(okC.map(function (r) { return r.frac; }))), casual_gross: r2(median(c.map(function (r) { return r.gross; }))),
    sloppy_fail: failPct(sl), child_fail: failPct(sel('child', z)) });
});
console.log('\nD. ZONE DIFFICULTY (model B real clock, ' + SEEDS.length + ' seeds x 52 levels; fail = % of level attempts that timed out)');
console.table(dz);
// The sensible player's time-left fraction is INSENSITIVE to the limit (it clears in ~10 s, bonus ~7 s, so frac ~ 1 - 3/limit),
// so the climb is judged on the players the timer actually bites: casual and sloppy fail rates must rise zone over zone,
// and the naive player's 3-star share must not rise. See the child_fail note below for why that archetype is excluded.
function naive3(row) { return parseInt(row.naive_stars.split('/')[2], 10); }
var climbs = true, why = [];
for (var zi = 1; zi < dz.length; zi++) {
  var a = dz[zi - 1], b = dz[zi];
  if (!(b.casual_fail > a.casual_fail)) { climbs = false; why.push('casual_fail ' + a.zone + ' ' + a.casual_fail + ' -> ' + b.zone + ' ' + b.casual_fail); }
  if (!(b.sloppy_fail > a.sloppy_fail)) { climbs = false; why.push('sloppy_fail ' + a.zone + ' ' + a.sloppy_fail + ' -> ' + b.zone + ' ' + b.sloppy_fail); }
  if (naive3(b) > naive3(a)) { climbs = false; why.push('naive 3-star ' + a.zone + ' ' + naive3(a) + '% -> ' + b.zone + ' ' + naive3(b) + '%'); }
}
// child_fail is REPORTED but deliberately NOT a criterion. It saturates near 75-80% (a 3 s / 40%-error player barely
// finishes anything), and Winter's obstacle load caps board capacity at ~19-21 fruit against Autumn's 24.4, so a very
// slow player sometimes runs out of BOARD before running out of clock and Winter reads marginally kinder to it than
// Autumn. That is a property of the board sizes, not of the pacing, and tuning it away would over-tighten Winter for
// everyone else. Measured 2026-09-03: spring/summer/autumn/winter mean initial fruit 22.0 / 23.9 / 24.4 / 21.1.
console.log('MONOTONIC CLIMB (casual and sloppy fail rates rise, naive 3-star share never rises, zone over zone): ' + (climbs ? 'YES' : 'NO' + '  [' + why.join('; ') + ']'));
console.log('COMPACT limits=' + dz.map(function (r) { return r.limit; }).join('/') + ' casual_fail=' + dz.map(function (r) { return r.casual_fail; }).join('/') +
  ' sloppy_fail=' + dz.map(function (r) { return r.sloppy_fail; }).join('/') + ' naive3=' + dz.map(naive3).join('/') + ' child_fail=' + dz.map(function (r) { return r.child_fail; }).join('/') + ' climb=' + (climbs ? 'YES' : 'NO'));

if (!opt.zonesOnly) {
  // ---- A. pacing per zone per player, stars overall
  var pacing = [], stars = [];
  players.forEach(function (p) {
    zones.forEach(function (z) {
      var rs = sel(p.name, z), ok = rs.filter(function (r) { return r.cleared; });
      pacing.push({ player: p.name, zone: z, n: rs.length, medLimit: median(rs.map(function (r) { return r.limit; })), fail_pct: failPct(rs),
        medGross_s: r2(median(rs.map(function (r) { return r.gross; }))), medBonus_s: r2(median(rs.map(function (r) { return r.bonus; }))),
        p10Frac: r2(pct(ok.map(function (r) { return r.frac; }), .1)), medFrac: r2(median(ok.map(function (r) { return r.frac; }))), p90Frac: r2(pct(ok.map(function (r) { return r.frac; }), .9)) });
    });
    var all = sel(p.name), ok2 = all.filter(function (r) { return r.cleared; }), fr = ok2.map(function (r) { return r.frac; });
    stars.push({ player: p.name, fail_pct: failPct(all), p10: r2(pct(fr, .1)), p50: r2(median(fr)), p90: r2(pct(fr, .9)), stars_1_2_3_pct: starsOf(fr) });
  });
  console.log('\nA. PACING per zone per player');
  console.table(pacing);
  console.log('A. STARS under STAR_FRACTIONS ' + JSON.stringify(C.STAR_FRACTIONS) + ' (all levels)');
  console.table(stars);
  console.log('\nB. CHERRY (sensible): launches=' + acc.cherryLaunches + ' doubles=' + acc.cherryDoubles + ' doubleRate=' + r2(100 * acc.cherryDoubles / Math.max(1, acc.cherryLaunches)) + '%');
  console.log('B. BANANA (sensible): matches=' + acc.bananaMatches + ' obstaclesBroken=' + acc.bananaBroken + ' perMatch=' + r2(acc.bananaBroken / Math.max(1, acc.bananaMatches)));
  console.log('C. RUNS (sensible): matches=' + acc.matches + ' misses=' + acc.misses + ' meanRunLen=' + r2(acc.runTiles / acc.matches) + ' runs>=2=' + r2(100 * acc.runs2 / acc.matches) + '%' +
    ' meanCleared=' + r2(acc.clearedTiles / acc.matches) + ' handRescueRate=' + r2(100 * acc.rescues / acc.matches) + '% (' + acc.rescues + '/' + acc.matches + ')');
  var unclear = rows.filter(function (r) { return !r.cleared && !r.failed; });
  console.log('SOFTLOCKS (not cleared, not timed out): ' + (unclear.length ? unclear.map(function (r) { return r.player + ' L' + r.level + '/s' + r.seed; }).join(' ') : 'none'));
}
if (opt.json) { fs.writeFileSync(opt.json, JSON.stringify(rows)); console.log('rows written to ' + opt.json); }
