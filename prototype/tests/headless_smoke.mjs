#!/usr/bin/env node
// Orchard Toss — headless smoke test (Node ESM; the GAME itself stays plain scripts).
//
// Drives ~/.claude/tools/browser-harness/run.mjs (real headless Chromium,
// swiftshader WebGL) against
//   1. a local `python3 -m http.server` serving prototype/ (the harness needs an
//      HTTP origin), and
//   2. dist/OrchardToss.html over file:// if the bundle exists (boot check only).
//
// Every check uses a SYNCHRONOUS --wait predicate (window.__ready) and an --eval
// IIFE that returns JSON. Engine time is advanced ONLY via OT.debug.step(); no
// wall-clock sleeps time anything the engine owns.
//
// Exit codes: 0 all checks passed · 1 any FAIL or thrown error · 2 harness
// missing · 3 SKIP (prototype/index.html not built yet — never a silent 0).
//
// Run from anywhere:   node prototype/tests/headless_smoke.mjs
// Screenshots land in  prototype/assets/screens/

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:net';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROTO = path.resolve(HERE, '..');
const INDEX = path.join(PROTO, 'index.html');
const BUNDLE = path.join(PROTO, 'dist', 'OrchardToss.html');
const SCREENS = path.join(PROTO, 'assets', 'screens');
const RUN = path.join(homedir(), '.claude', 'tools', 'browser-harness', 'run.mjs');
const SCRIPTS = ['js/assets_manifest.js', 'js/config.js', 'js/board.js', 'js/sprites.js', 'js/assets.js', 'js/game.js'];
const HARNESS_TIMEOUT_MS = 90000;

// ─────────────────────────────────────────────────────────────── preflight
if (!existsSync(INDEX)) {
  console.log('==================================================================');
  console.log(`SKIP: ${INDEX} does not exist — the game is not built yet.`);
  console.log('      No checks were run. This is NOT a pass (exit 3).');
  console.log('==================================================================');
  process.exit(3);
}
if (!existsSync(RUN)) {
  console.error(`ERROR: browser harness not found at ${RUN} (exit 2)`);
  process.exit(2);
}
const missingJs = SCRIPTS.filter(s => !existsSync(path.join(PROTO, s)));
if (missingJs.length) {
  console.log('==================================================================');
  console.log(`SKIP: index.html exists but script file(s) are missing: ${missingJs.join(', ')}`);
  console.log('      The game is not fully built yet. No checks were run. NOT a pass (exit 3).');
  console.log('==================================================================');
  process.exit(3);
}

// ─────────────────────────────────────────────────────────────── helpers
const results = [];
let errors = 0;
function record(name, pass, evidence) {
  results.push({ name, pass, evidence });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${JSON.stringify(evidence)}`);
}

function harness(url, { wait = 'window.__ready===true', evalExpr = null, viewport = '390x844', screenshot = null } = {}) {
  const args = [RUN, url, '--wait', wait, '--viewport', viewport, '--timeout', String(HARNESS_TIMEOUT_MS), '--console'];
  if (evalExpr) args.push('--eval', evalExpr);
  if (screenshot) args.push('--screenshot', screenshot);
  const r = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: HARNESS_TIMEOUT_MS + 30000 });
  let json;
  try { json = r.stdout.trim() ? JSON.parse(r.stdout) : undefined; } catch { json = undefined; }
  const pageErrors = (r.stderr || '').split('\n').filter(l => l.startsWith('[pageerror]'));
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, json, pageErrors };
}

// Runs one named check; a throw or a harness failure counts as FAIL and an error.
function check(name, fn) {
  try {
    const { pass, evidence } = fn();
    record(name, !!pass, evidence);
  } catch (e) {
    errors++;
    record(name, false, { thrown: String(e && e.stack || e).split('\n').slice(0, 3).join(' | ') });
  }
}

function pngSize(file) {
  const b = readFileSync(file);
  if (b.length < 24 || b.toString('ascii', 1, 4) !== 'PNG') return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), bytes: b.length };
}

function freePort() {
  return new Promise((res, rej) => {
    const s = createServer();
    s.once('error', rej);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  });
}

function portListening(port) {
  const r = spawnSync('ss', ['-ltn'], { encoding: 'utf8' });
  return (r.stdout || '').split('\n').some(l => l.includes(`:${port} `));
}

async function waitForServer(url, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(url); if (r.ok) return true; } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 150));
  }
  return false;
}

// ─────────────────────────────────────────────────────────────── eval expressions
// Each is an IIFE returning a JSON-serialisable object. They use ONLY the
// OT.game / OT.debug surface from ARCHITECTURE.md; if the integrator changes
// that surface, adjust these strings.

// Common prelude: step the splash away and land on the title screen.
const PRELUDE = `
  const G = OT.game, D = OT.debug;
  const states = [];
  const stepUntil = (want, max) => { let t = 0; while (G.state !== want && t < max) { D.step(0.25); t += 0.25; if (states[states.length-1] !== G.state) states.push(G.state); } return G.state === want; };
`;

const EVAL_BOOT = `(() => {
  const G = OT.game;
  return { ready: window.__ready === true, assetsReady: window.__assetsReady === true,
           state: G && G.state, fontReady: OT.A && OT.A.fontReady, fontError: OT.A && OT.A.fontError,
           imgStatus: OT.A && OT.A.status, imgLoaded: OT.A && OT.A.loaded, imgTotal: OT.A && OT.A.total, imgFailed: OT.A && OT.A.failed,
           // expected image count derived from the manifests themselves, so this stays
           // correct as art lands instead of being a number to remember to bump
           imgExpected: Object.keys(OT.AM || {}).length
             + Object.keys(OT.AM_SPROUT || {}).reduce(function (n, st) { return n + Object.keys(OT.AM_SPROUT[st]).length; }, 0),
           fruitCount: Object.keys(OT.AM || {}).length,
           fruitOverride: !!(OT.S && OT.S._proc && OT.S.fruit !== OT.S._proc.fruit),
           hasDebug: !!(OT.debug && OT.debug.step && OT.debug.launch && OT.debug.resolve && OT.debug.skipTo),
           hasBoard: !!(OT.Board && OT.Board.create && OT.Board.launch), level: G && G.level, hearts: G && G.hearts };
})()`;

// title -> playing via OT.game.start(). If start() lands on 'zoneIntro' the
// overlay carries a 0.8 s WALL-CLOCK skip grace (contract), so after the game
// clock has run for 3 s we wait 0.9 s of wall time and dispatch one real tap.
const EVAL_START = `(async () => {
  ${PRELUDE}
  states.push(G.state);
  stepUntil('title', 6);
  const atTitle = G.state;
  const r = G.start();
  D.step(0.05); states.push(G.state);
  let reached = stepUntil('playing', 3);
  if (!reached && G.state === 'zoneIntro') {
    await new Promise(res => setTimeout(res, 900));
    const c = document.querySelector('canvas');
    for (const type of ['pointerdown', 'pointerup']) c.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: 'touch', clientX: 200, clientY: 400, isPrimary: true, pointerId: 1 }));
    reached = stepUntil('playing', 6);
  }
  return { atTitle, startReturned: r, statesSeen: states, state: G.state, reached, level: G.level, zone: G.zone, remaining: G.remaining, target: G.target, timeLeft: G.timeLeft };
})()`;

// launch + resolve must change `remaining`. Prefer a lane whose lowest tile
// matches the held fruit (a guaranteed match); otherwise try each lane.
const EVAL_LAUNCH = `(() => {
  ${PRELUDE}
  D.seed(12345); D.skipTo(1); D.step(0.1);
  const before = G.remaining, held = G.held, snapBefore = OT.Board.snapshot(G.board);
  const cols = [];
  for (let c = 0; c < OT.CONFIG.COLS; c++) { const lt = OT.Board.lowestTile(G.board, c); const cell = lt && G.board.cells[lt.row][lt.col]; if (cell && cell.kind === 'fruit' && cell.type === held) cols.push(c); }
  for (let c = 0; c < OT.CONFIG.COLS; c++) if (!cols.includes(c)) cols.push(c);
  const tries = [];
  let after = before;
  for (const c of cols) {
    const ok = D.launch(c); D.resolve(); D.step(OT.CONFIG.LOCKOUT_S + 0.1);
    tries.push({ col: c, launchReturned: ok, remaining: G.remaining, moves: G.board.moves });
    after = G.remaining; if (after < before) break;
  }
  return { state: G.state, held, before, after, changed: after < before, tries, snapBefore, snapAfter: OT.Board.snapshot(G.board), score: G.score };
})()`;

const EVAL_TIMER = `(() => {
  ${PRELUDE}
  D.skipTo(2); D.step(0.05);
  const t0 = G.timeLeft, c0 = G.clock;
  D.step(2.0);
  const t1 = G.timeLeft, c1 = G.clock;
  return { state: G.state, t0, t1, dt: +(t0 - t1).toFixed(3), clockAdvanced: +(c1 - c0).toFixed(3), timeLimit: G.timeLimit };
})()`;

const EVAL_SKIP52 = `(() => {
  ${PRELUDE}
  D.skipTo(52); D.step(0.05);
  const b = G.board;
  return { state: G.state, level: G.level, zone: G.zone, zoneIndex: G.zoneIndex, hasBoard: !!b, remaining: G.remaining, target: G.target,
           timeLimit: G.timeLimit, fruits: b && b.levelDef && b.levelDef.fruits, winnable: b && OT.Board.isWinnable(b), snapshot: b && OT.Board.snapshot(b) };
})()`;

const EVAL_FAIL = `(() => {
  ${PRELUDE}
  D.skipTo(3); D.step(0.05);
  if (G.hearts <= 0) D.addHearts(1);
  const h0 = G.hearts;
  D.failLevel(); D.step(0.05);
  return { h0, h1: G.hearts, dropped: G.hearts === h0 - 1, state: G.state };
})()`;

const EVAL_PAUSE = `(() => {
  ${PRELUDE}
  D.skipTo(4); D.step(0.05);
  const c0 = G.clock, t0 = G.timeLeft;
  G.pause(); D.step(1.0);
  const cPaused = G.clock, tPaused = G.timeLeft, paused = G.paused, st = G.state;
  G.resume(); D.step(0.5);
  return { c0, cPaused, frozen: cPaused === c0 && tPaused === t0, pausedFlag: paused, stateWhilePaused: st, clockAfterResume: G.clock, resumedState: G.state };
})()`;

// Enter playing on level 5, settle 0.5 s of game time, report the view — used
// before each screenshot and before the pixel probes.
const EVAL_PLAYING_VIEW = `(() => {
  ${PRELUDE}
  D.skipTo(5); D.step(0.5);
  return { state: G.state, level: G.level, view: D.view(), canvas: (c => ({ w: c.width, h: c.height }))(document.querySelector('canvas')) };
})()`;

// Rendered-pixel probe. probe(rect) samples an N×N grid of device pixels and
// compares each to the ambient sample at device (1,1) — the top-left corner of
// the canvas, which the ambient background pass always paints (the field is
// letterboxed on both test viewports, so that corner is a bar = sky).
// A rendered board (fruit tiles, frame) yields many distinct colours and most
// samples far from the ambient colour; a sky region yields few and near.
const PROBE_FN = `
  const canvas = document.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const q = 24;
  const px = (x, y) => { const d = ctx.getImageData(Math.max(0, Math.min(canvas.width - 1, x|0)), Math.max(0, Math.min(canvas.height - 1, y|0)), 1, 1).data; return [d[0], d[1], d[2]]; };
  const ambient = px(1, 1);
  const probe = (r) => {
    const N = 12, seen = new Set(); let far = 0, n = 0, sumDiff = 0;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const p = px(r.x + (i + 0.5) * r.w / N, r.y + (j + 0.5) * r.h / N);
      seen.add(p.map(v => Math.round(v / q)).join(','));
      const diff = Math.abs(p[0] - ambient[0]) + Math.abs(p[1] - ambient[1]) + Math.abs(p[2] - ambient[2]);
      sumDiff += diff; if (diff > 60) far++; n++;
    }
    // farFraction is the discriminator (a sky gradient never moves 60 RGB units
    // inside one probe rect); distinct is a sanity floor that flat art still clears.
    return { rect: r, samples: n, distinct: seen.size, farFraction: +(far / n).toFixed(3), meanDiff: +(sumDiff / n).toFixed(1), ambient,
             looksRendered: far / n > 0.5 && seen.size >= 3 };
  };
`;

const EVAL_PIXELS = `(() => {
  ${PRELUDE}
  D.skipTo(5); D.step(0.5);
  ${PROBE_FN}
  const v = D.view(), C = OT.CONFIG;
  // logical -> device. Headless dpr is 1, so this holds whether view.scale is
  // css-scale or device-scale (Numbat convention: scale already includes dpr).
  const L = (x, y) => ({ x: v.ox + x * v.scale, y: v.oy + y * v.scale });
  const a = L(C.BOARD_X, C.BOARD_Y), b = L(C.BOARD_X + C.COLS * C.CELL, C.BOARD_Y + C.ROWS * C.CELL);
  const board = probe({ x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y });
  // NEGATIVE CONTROL: a 40×40 block at the canvas corner is ambient sky by construction.
  const sky = probe({ x: 0, y: 0, w: 40, h: 40 });
  return { state: G.state, view: v, board, sky, canvas: { w: canvas.width, h: canvas.height } };
})()`;

// Real fruit art (v0.2.0): render each fruit through OT.S.fruit (possibly the
// image override) and through the procedural snapshot OT.S._proc.fruit into two
// offscreen canvases and count differing pixels. Imaged fruits MUST differ;
// A type with NO image in OT.AM must render pixel-identical through the override
// (it delegates to the procedural painter), which also proves the differ can report
// zero. Until 2026-09-03 the control used grape/orange/watermelon, which had no art;
// Ben has now supplied all 10 fruits, so the control uses 'coconut' and a bogus id
// instead. 'coconut' is not an accident: assets/Coconut.png EXISTS in the repo but is
// deliberately excluded from FRUITS (Ben's decision, MSG-05) because the coconut is a
// tougher-tile mechanic, not an 11th matchable fruit. Asserting it still renders
// procedurally is therefore also the regression guard on that decision.
// Also measures the opaque bbox of both renders so the image FIT can be judged
// against the procedural size.
const EVAL_ART = `(() => {
  const S = OT.S, A = OT.A;
  const N = 96, SZ = 64;
  const render = (fn, type) => { const c = document.createElement('canvas'); c.width = N; c.height = N; const x = c.getContext('2d'); fn(x, type, N/2, N/2, SZ, 0); return x.getImageData(0, 0, N, N).data; };
  const diff = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4) { if (Math.abs(a[i]-b[i]) + Math.abs(a[i+1]-b[i+1]) + Math.abs(a[i+2]-b[i+2]) + Math.abs(a[i+3]-b[i+3]) > 40) n++; } return n; };
  const bbox = (a) => { let x0 = N, y0 = N, x1 = -1, y1 = -1, n = 0; for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { if (a[(y*N+x)*4+3] > 128) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } } return n ? { w: x1-x0+1, h: y1-y0+1, n } : { w: 0, h: 0, n: 0 }; };
  const out = { status: A.status, loaded: A.loaded, total: A.total, failed: A.failed, override: !!(S._proc && S.fruit !== S._proc.fruit), imaged: {}, control: {} };
  if (!S._proc || !S._proc.fruit) return out;
  for (const t of Object.keys(OT.AM || {})) { const a = render(S.fruit, t), b = render(S._proc.fruit, t); out.imaged[t] = { diff: diff(a, b), img: bbox(a), proc: bbox(b) }; }
  out.manifestKeys = Object.keys(OT.AM || {}).sort();
  // ---- Sprout (bridge MSG-09): stage 3 has real art, stages 0-2 must NOT.
  // Ben asked explicitly that the unfinished stages stay visibly unfinished rather
  // than silently reuse stage 3's render, so this measures every stage x mood.
  const MOODS = ['idle', 'aim', 'cheer', 'sad'];
  out.sproutStages = Object.keys(OT.AM_SPROUT || {}).sort();
  out.sproutOverride = !!(S._proc && S._proc.sprout && S.sprout !== S._proc.sprout);
  out.sprout = {};
  for (const st of [0, 1, 2, 3]) {
    out.sprout[st] = {};
    for (const md of MOODS) {
      const a = (() => { const c = document.createElement('canvas'); c.width = N; c.height = N;
        const x = c.getContext('2d'); S.sprout(x, N/2, N*0.75, SZ, st, md, 0); return x.getImageData(0,0,N,N).data; })();
      const b = (() => { const c = document.createElement('canvas'); c.width = N; c.height = N;
        const x = c.getContext('2d'); S._proc.sprout(x, N/2, N*0.75, SZ, st, md, 0); return x.getImageData(0,0,N,N).data; })();
      out.sprout[st][md] = { diff: diff(a, b), img: bbox(a) };
    }
  }
  out.coconutInManifest = !!(OT.AM && OT.AM.coconut);
  for (const t of ['coconut', '__nosuchfruit__']) { const a = render(S.fruit, t), b = render(S._proc.fruit, t); out.control[t] = { diff: diff(a, b), img: bbox(a) }; }
  return out;
})()`;

// ─────────────────────────────────────────────────────────────── main
let server = null;
let port = null;
try {
  port = await freePort();
  server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: PROTO, stdio: ['ignore', 'ignore', 'pipe'] });
  const serverPid = server.pid;
  const base = `http://127.0.0.1:${port}/`;
  console.log(`server: python3 -m http.server ${port} (pid ${serverPid}) cwd=${PROTO}`);
  if (!(await waitForServer(base + 'index.html', 8000))) throw new Error(`http.server on port ${port} did not come up`);
  mkdirSync(SCREENS, { recursive: true });

  const READY_BOTH = 'window.__ready===true && window.__assetsReady===true';

  check('boot (http): __ready + __assetsReady, OT.debug/OT.Board surface present', () => {
    const r = harness(base + 'index.html', { wait: READY_BOTH, evalExpr: EVAL_BOOT });
    const j = r.json || {};
    const pass = r.status === 0 && j.ready && j.assetsReady && j.hasDebug && j.hasBoard && r.pageErrors.length === 0
      && j.imgStatus === 'ready' && j.imgLoaded === j.imgTotal && j.imgTotal === j.imgExpected && j.imgExpected > 0 && j.fruitCount === 10 && j.fruitOverride === true;
    return { pass, evidence: { harnessExit: r.status, ...j, pageErrors: r.pageErrors.slice(0, 3) } };
  });

  const art = harness(base + 'index.html', { wait: READY_BOTH, evalExpr: EVAL_ART });
  const aj = art.json || {};
  const ROSTER = ['cherry', 'strawberry', 'apple', 'watermelon', 'grape', 'banana', 'pomegranate', 'pineapple', 'orange', 'lemon'].sort();
  check('real fruit art: all 10 roster fruits imaged and loaded, OT.S.fruit overridden, each renders differently from its procedural painter', () => {
    const keys = Object.keys(aj.imaged || {});
    const rosterComplete = JSON.stringify((aj.manifestKeys || []).slice()) === JSON.stringify(ROSTER);
    const allDiffer = keys.length === 10 && rosterComplete && keys.every(k => aj.imaged[k].diff > 400 && aj.imaged[k].img.n > 400);
    const pass = art.status === 0 && aj.status === 'ready' && aj.loaded === aj.total && aj.override === true && allDiffer && art.pageErrors.length === 0;
    return { pass, evidence: { harnessExit: art.status, status: aj.status, loaded: aj.loaded, total: aj.total, failed: aj.failed, override: aj.override, manifestKeys: aj.manifestKeys, imaged: aj.imaged, pageErrors: art.pageErrors.slice(0, 3) } };
  });

  check('NEGATIVE CONTROL: a type with no manifest image (coconut, bogus id) renders pixel-identical through the override — diff must be 0, and not because nothing was drawn', () => {
    const keys = Object.keys(aj.control || {});
    const pass = art.status === 0 && keys.length === 2 && keys.every(k => aj.control[k].diff === 0 && aj.control[k].img.n > 400);
    return { pass, evidence: { harnessExit: art.status, control: aj.control } };
  });

  check('Sprout stage 3 (MSG-09): all four moods render from Ben\'s art, visibly different from the procedural Sprout', () => {
    const s3 = (aj.sprout || {})['3'] || {};
    const moods = Object.keys(s3);
    const pass = art.status === 0 && aj.sproutOverride === true
      && JSON.stringify((aj.sproutStages || [])) === JSON.stringify(['3'])
      && moods.length === 4
      && moods.every(m => s3[m].diff > 400 && s3[m].img.n > 400);
    return { pass, evidence: { harnessExit: art.status, sproutOverride: aj.sproutOverride, sproutStages: aj.sproutStages, stage3: s3 } };
  });

  check("Sprout stages 0-2 (MSG-09): NO art supplied, so each must render pixel-identical to the procedural painter - not silently reuse stage 3", () => {
    const rows = {};
    let ok = true;
    for (const st of ['0', '1', '2']) {
      const g = (aj.sprout || {})[st] || {};
      rows[st] = g;
      for (const m of Object.keys(g)) { if (g[m].diff !== 0 || g[m].img.n <= 400) ok = false; }
      if (Object.keys(g).length !== 4) ok = false;
    }
    return { pass: art.status === 0 && ok, evidence: { harnessExit: art.status, stages012: rows } };
  });

  check("Ben's decision (MSG-05): assets/Coconut.png is NOT wired in — 'coconut' has no manifest entry, so coconuts never render as a matchable fruit", () => {
    const pass = art.status === 0 && aj.coconutInManifest === false && (aj.manifestKeys || []).indexOf('coconut') === -1;
    return { pass, evidence: { harnessExit: art.status, coconutInManifest: aj.coconutInManifest, manifestKeys: aj.manifestKeys } };
  });

  check('title -> playing via OT.game.start()', () => {
    const r = harness(base + 'index.html', { wait: READY_BOTH, evalExpr: EVAL_START });
    const j = r.json || {};
    return { pass: r.status === 0 && j.reached === true && j.state === 'playing', evidence: { harnessExit: r.status, ...j, pageErrors: r.pageErrors.slice(0, 3) } };
  });

  check('OT.debug.launch + resolve changes remaining', () => {
    const r = harness(base + 'index.html', { wait: READY_BOTH, evalExpr: EVAL_LAUNCH });
    const j = r.json || {};
    const ev = { harnessExit: r.status, ...j, pageErrors: r.pageErrors.slice(0, 3) };
    delete ev.snapBefore; delete ev.snapAfter;
    if (!j.changed) { ev.snapBefore = j.snapBefore; ev.snapAfter = j.snapAfter; }
    return { pass: r.status === 0 && j.changed === true, evidence: ev };
  });

  check('timer decreases with OT.debug.step (2 s of game time)', () => {
    const r = harness(base + 'index.html', { wait: READY_BOTH, evalExpr: EVAL_TIMER });
    const j = r.json || {};
    const pass = r.status === 0 && j.state === 'playing' && j.t1 < j.t0 && Math.abs(j.dt - 2.0) < 0.1;
    return { pass, evidence: { harnessExit: r.status, ...j, pageErrors: r.pageErrors.slice(0, 3) } };
  });

  check('skipTo(52) boots the last level (winter, playing, board present)', () => {
    const r = harness(base + 'index.html', { wait: READY_BOTH, evalExpr: EVAL_SKIP52 });
    const j = r.json || {};
    const pass = r.status === 0 && j.state === 'playing' && j.level === 52 && j.zone === 'winter' && j.hasBoard && j.remaining > 0 && j.target >= 2;
    const ev = { harnessExit: r.status, ...j, pageErrors: r.pageErrors.slice(0, 3) };
    if (pass) delete ev.snapshot;
    return { pass, evidence: ev };
  });

  check('failLevel() drops exactly one heart', () => {
    const r = harness(base + 'index.html', { wait: READY_BOTH, evalExpr: EVAL_FAIL });
    const j = r.json || {};
    return { pass: r.status === 0 && j.dropped === true, evidence: { harnessExit: r.status, ...j, pageErrors: r.pageErrors.slice(0, 3) } };
  });

  check('pause proof: step() advances nothing while paused', () => {
    const r = harness(base + 'index.html', { wait: READY_BOTH, evalExpr: EVAL_PAUSE });
    const j = r.json || {};
    return { pass: r.status === 0 && j.frozen === true && j.clockAfterResume > j.c0, evidence: { harnessExit: r.status, ...j, pageErrors: r.pageErrors.slice(0, 3) } };
  });

  for (const vp of ['390x844', '844x390']) {
    check(`screenshot of playing at ${vp}`, () => {
      const file = path.join(SCREENS, `playing_${vp}.png`);
      const r = harness(base + 'index.html', { wait: READY_BOTH, evalExpr: EVAL_PLAYING_VIEW, viewport: vp, screenshot: file });
      const j = r.json || {};
      const [w, h] = vp.split('x').map(Number);
      const png = existsSync(file) ? pngSize(file) : null;
      const pass = r.status === 0 && j.state === 'playing' && png && png.w === w && png.h === h && png.bytes > 1000;
      return { pass, evidence: { harnessExit: r.status, state: j.state, level: j.level, view: j.view, canvas: j.canvas, file, png, pageErrors: r.pageErrors.slice(0, 3) } };
    });
  }

  // One browser run feeds both pixel checks (same frame, same ambient sample).
  const pix = harness(base + 'index.html', { wait: READY_BOTH, evalExpr: EVAL_PIXELS });
  const pj = pix.json || {};

  check('rendered-pixel probe: board region is not the ambient sky colour', () => {
    const b = pj.board || {};
    return { pass: pix.status === 0 && pj.state === 'playing' && b.looksRendered === true, evidence: { harnessExit: pix.status, state: pj.state, view: pj.view, canvas: pj.canvas, board: b, pageErrors: pix.pageErrors.slice(0, 3) } };
  });

  check('NEGATIVE CONTROL: the same probe on a known-sky corner reports NOT rendered', () => {
    const s = pj.sky || {};
    // The probe must be able to fail: on ambient sky it must report looksRendered === false.
    return { pass: pix.status === 0 && s.looksRendered === false, evidence: { harnessExit: pix.status, sky: s } };
  });

  if (existsSync(BUNDLE)) {
    const fileUrl = 'file://' + BUNDLE;
    check('boot (file:// bundle dist/OrchardToss.html): __ready + __assetsReady + font + all fruit images from data URIs', () => {
      const r = harness(fileUrl, { wait: READY_BOTH, evalExpr: EVAL_BOOT });
      const j = r.json || {};
      const pass = r.status === 0 && j.ready && j.assetsReady && j.hasDebug && j.hasBoard && r.pageErrors.length === 0
        && j.imgStatus === 'ready' && j.imgLoaded === j.imgTotal && j.imgTotal === j.imgExpected && j.imgExpected > 0 && j.fruitCount === 10 && j.fruitOverride === true;
      return { pass, evidence: { harnessExit: r.status, bundleBytes: statSync(BUNDLE).size, ...j, pageErrors: r.pageErrors.slice(0, 3) } };
    });
  } else {
    console.log(`NOTE  dist/OrchardToss.html not present — file:// bundle boot check skipped (run python3 build_bundle.py first)`);
  }
} catch (e) {
  errors++;
  console.error('ERROR:', e && e.stack || e);
} finally {
  if (server && server.pid) {
    server.kill('SIGTERM');
    await new Promise(r => setTimeout(r, 400));
    if (portListening(port)) { server.kill('SIGKILL'); await new Promise(r => setTimeout(r, 400)); }
    const still = portListening(port);
    console.log(`server: killed pid ${server.pid}; port ${port} ${still ? 'STILL LISTENING (!)' : 'free (ss -ltn)'}`);
    if (still) errors++;
  }
}

const failed = results.filter(r => !r.pass).length;
console.log('------------------------------------------------------------------');
console.log(`${results.length - failed} passed, ${failed} failed, ${errors} error(s)`);
process.exit(failed === 0 && errors === 0 && results.length > 0 ? 0 : 1);
