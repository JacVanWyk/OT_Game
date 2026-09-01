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
const SCRIPTS = ['js/config.js', 'js/board.js', 'js/sprites.js', 'js/assets.js', 'js/game.js'];
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
    const pass = r.status === 0 && j.ready && j.assetsReady && j.hasDebug && j.hasBoard && r.pageErrors.length === 0;
    return { pass, evidence: { harnessExit: r.status, ...j, pageErrors: r.pageErrors.slice(0, 3) } };
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
    check('boot (file:// bundle dist/OrchardToss.html): __ready + __assetsReady + font', () => {
      const r = harness(fileUrl, { wait: READY_BOTH, evalExpr: EVAL_BOOT });
      const j = r.json || {};
      const pass = r.status === 0 && j.ready && j.assetsReady && j.hasDebug && j.hasBoard && r.pageErrors.length === 0;
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
