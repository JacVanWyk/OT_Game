/* =========================================================================
   Orchard Toss - game.js  (game shell: engine, state machine, input, HUD)

   Classic script (no modules, no fetch, ES5). Expects, in this order:
     js/config.js  -> OT.CONFIG   (tunables + levelDef(n))
     js/board.js   -> OT.Board    (pure rules: create / launch / lowestTile ...)
     js/sprites.js -> OT.S        (procedural painters)
     js/assets.js  -> OT.A        (Fredoka FontFace loader, __assetsReady)

   Everything in this file is built against prototype/ARCHITECTURE.md. All
   game time advances in update(dt) on the game clock; tests move time with
   OT.debug.step(seconds) only. Painters are resolved through sp(name) so a
   missing OT.S painter degrades to a labelled placeholder instead of a
   throw (OT.debug.missingPainters() lists what fell back).

   Contract deviations: none intended. Extras beyond the contract:
     OT.debug.missingPainters()  -> [names]   (integration aid)
     OT.debug.snapshot()         -> OT.Board.snapshot(board) or ''
     OT.debug.pointer(kind,x,y)  -> synthetic logical-space pointer events
   ========================================================================= */
(function () {
  'use strict';

  window.OT = window.OT || {};
  var OT = window.OT;

  var GAME_VERSION = '0.1.0';

  // ---------------------------------------------------------------- tunables
  var TUNE = {
    STEP: 1 / 60,               // fixed timestep (s)
    DT_CLAMP: 0.25,             // tab-switch dt clamp (s)
    SPLASH_MIN_S: 2.5,          // splash stays >= this after __assetsReady
    SKIP_GRACE_MS: 800,         // wall-clock grace before an overlay accepts input
    // flick detection (logical px)
    FLICK_VEL: 500,             // upward px/s over the last FLICK_WINDOW_MS
    FLICK_DISP: 40,             // OR upward displacement since pointerdown
    FLICK_WINDOW_MS: 100,
    LAUNCH_ZONE_Y: 700,         // pointerdown below this starts a drag
    LAUNCHER_W: 84,             // cradle width (>= 60 px touch target)
    LAUNCHER_SNAP: 18,          // easing rate toward the lane centre (1/s)
    // flight / impact
    RETURN_SPEED_MUL: 1.3,      // mismatch return speed vs FLIGHT_SPEED
    BOUNCE_S: 0.10,             // squash at a wall deflection
    SQUASH_S: 0.12,             // squash at impact
    RETURN_WOBBLE: 0.45,        // rad amplitude of the return wobble
    // pops / juice
    POP_INTERVAL_S: 0.045,
    POP_S: 0.26,
    SPLASH_S: 0.38,
    POPUP_S: 0.9, POPUP_RISE: 46,
    CHUNKS_MIN: 2, CHUNKS_MAX: 3,
    CHUNK_GRAVITY: 1700, CHUNK_FLOOR_Y: 846, CHUNK_BOUNCE: 0.42,
    CHUNK_LIFE_S: 1.15,
    COMPACT_S: 0.18,
    // effect cue durations
    EFFECT_MONKEY_S: 0.5, EFFECT_LEMON_S: 0.32, EFFECT_APPLE_S: 0.32,
    EFFECT_CROSS_S: 0.3, EFFECT_BURST_S: 0.36, EFFECT_SEEDS_S: 0.42,
    EFFECT_CHAIN_S: 0.28, EFFECT_CHAIN_ROUND_S: 0.16,
    // hud / flow
    TIMER_RED_S: 10,
    LEVEL_END_DELAY_S: 0.55,    // pause between the last pop and the clear card
    AD_TOTAL_S: 5, AD_SKIP_AFTER_S: 3,
    ZONE_INTRO_AUTO_S: 3.2,
    RESOLVE_MAX_S: 10
  };

  // ---------------------------------------------------------------- modules
  var C = OT.CONFIG;
  if (!C) {
    // config.js missing: keep the shell bootable so the failure is visible on
    // screen and in OT.debug, never a silent white page.
    try { console.error('OT.CONFIG missing - config.js did not load'); } catch (e) {}
    C = {
      W: 480, H: 854, COLS: 5, ROWS: 8, CELL: 76, BOARD_X: 50, BOARD_Y: 126,
      LAUNCH_Y: 800, FRUITS: [], ZONES: [{ id: 'spring', name: 'Spring', levels: 10, fruits: [] }],
      HEARTS_MAX: 5, HEART_REFILL_MS: 30 * 60 * 1000, LOCKOUT_S: 0.6,
      FLIGHT_SPEED: 1100, STAR_FRACTIONS: [0.5, 0.25],
      levelDef: function (n) {
        return { n: n, zone: 'spring', zoneIndex: 0, indexInZone: n - 1, rows: 8,
                 cols: 5, fill: 0.6, timeLimit: 60, fruits: [], obstacles: {} };
      }
    };
  }
  var B = OT.Board || null;
  var S = OT.S || null;

  var W = C.W || 480, H = C.H || 854;
  var COLS = C.COLS || 5, ROWS = C.ROWS || 8, CELL = C.CELL || 76;
  var BOARD_X = C.BOARD_X || 50, BOARD_Y = C.BOARD_Y || 126;
  var LAUNCH_Y = C.LAUNCH_Y || 800;
  var HEARTS_MAX = C.HEARTS_MAX || 5;
  var REFILL_MS = C.HEART_REFILL_MS || 30 * 60 * 1000;
  var LOCKOUT_S = (typeof C.LOCKOUT_S === 'number') ? C.LOCKOUT_S : 0.6;
  var FLIGHT_SPEED = C.FLIGHT_SPEED || 1100;
  var STAR_FRACTIONS = C.STAR_FRACTIONS || [0.5, 0.25];
  var ZONES = C.ZONES || [];
  var TOTAL_LEVELS = 0;
  var ZONE_START = [];        // first level number of each zone
  (function () {
    var i, n = 1;
    for (i = 0; i < ZONES.length; i++) { ZONE_START.push(n); n += ZONES[i].levels || 0; }
    TOTAL_LEVELS = n - 1;
    if (TOTAL_LEVELS < 1) TOTAL_LEVELS = 52;
  })();

  var LANE0_X = BOARD_X + CELL / 2;
  var LANE_MAX_X = BOARD_X + (COLS - 1) * CELL + CELL / 2;
  var BOARD_W = COLS * CELL, BOARD_H = ROWS * CELL;
  var TILE_SIZE = 0.82 * CELL;
  var SAVE_KEY = 'ot.save';

  function cellX(col) { return BOARD_X + col * CELL + CELL / 2; }
  function cellY(row) { return BOARD_Y + row * CELL + CELL / 2; }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeOut(t) { t = clamp(t, 0, 1); return 1 - (1 - t) * (1 - t); }
  function easeIn(t) { t = clamp(t, 0, 1); return t * t; }
  function laneOf(x) { return clamp(Math.round((x - LANE0_X) / CELL), 0, COLS - 1); }
  function fmtTime(s) {
    if (s < 0) s = 0;
    var whole = Math.ceil(s);
    var m = Math.floor(whole / 60), r = whole % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  }
  function seasonOf(zoneIndex) {
    var z = ZONES[zoneIndex];
    return (z && z.id) || 'spring';
  }
  function zoneName(zoneIndex) {
    var z = ZONES[zoneIndex];
    return (z && z.name) || 'Orchard';
  }

  // presentation RNG: seeded through OT.Board.rng when available so chunk
  // scatter is repeatable per board; falls back to Math.random.
  var prng = Math.random;
  function rnd(a, b) { return a + (b - a) * prng(); }

  // ---------------------------------------------------------------- painters
  // sp(name) resolves an OT.S painter at call time; FB holds placeholder
  // fallbacks so a missing painter is a visible box, not a thrown error.
  var missing = {};
  var FB = {};
  FB.font = function (size) {
    return 'bold ' + Math.round(size) + 'px Fredoka, "Trebuchet MS", "Segoe UI", Arial, sans-serif';
  };
  FB.text = function (ctx, txt, x, y, size, color, align, outline) {
    ctx.save();
    ctx.font = FB.font(size);
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'middle';
    if (outline) {
      ctx.lineJoin = 'round';
      ctx.strokeStyle = outline;
      ctx.lineWidth = Math.max(2, size * 0.16);
      ctx.strokeText(txt, x, y);
    }
    ctx.fillStyle = color || '#ffffff';
    ctx.fillText(txt, x, y);
    ctx.restore();
  };
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  FB.panel = function (ctx, x, y, w, h, color) {
    ctx.save();
    roundRect(ctx, x, y, w, h, Math.min(14, h / 2));
    ctx.fillStyle = color || 'rgba(0,0,0,0.35)';
    ctx.fill();
    ctx.restore();
  };
  FB.banner = function (ctx, cx, cy, w, h, color, text, s) {
    FB.panel(ctx, cx - w / 2, cy - h / 2, w, h, color || '#c94f3d');
    FB.text(ctx, text, cx, cy, s || h * 0.5, '#fff', 'center', 'rgba(0,0,0,0.5)');
  };
  FB.button = function (ctx, cx, cy, w, h, color, text, s) {
    FB.panel(ctx, cx - w / 2, cy - h / 2, w, h, color || '#3b9b5a');
    FB.text(ctx, text, cx, cy, s || h * 0.46, '#fff', 'center', '#335D7C');
  };
  var FB_FRUIT = { cherry: '#d62b3c', strawberry: '#e5334f', apple: '#c8262f',
    watermelon: '#3f9d4a', grape: '#7d4bb5', banana: '#f3d13a', pomegranate: '#a5203b',
    pineapple: '#e9b52d', orange: '#f28c1e', lemon: '#f6e13d' };
  FB.fruit = function (ctx, type, x, y, size, t) {
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, size / 2, 0, Math.PI * 2);
    ctx.fillStyle = FB_FRUIT[type] || '#999'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#2b2118'; ctx.stroke();
    FB.text(ctx, (type || '?').charAt(0).toUpperCase(), x, y, size * 0.5, '#fff', 'center', '#2b2118');
    ctx.restore();
  };
  FB.coconut = function (ctx, x, y, size) {
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, size / 2, 0, Math.PI * 2);
    ctx.fillStyle = '#6b4a2b'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#2b2118'; ctx.stroke();
    ctx.restore();
  };
  FB.wall = function (ctx, x, y, size, lean) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate((lean || 1) * 0.35);
    ctx.fillStyle = '#8b5a2b';
    ctx.fillRect(-size * 0.12, -size * 0.42, size * 0.24, size * 0.84);
    ctx.restore();
  };
  FB.trellis = function (ctx, x, y, size) {
    ctx.save();
    ctx.fillStyle = '#4f7d3a';
    ctx.fillRect(x - size * 0.46, y - size * 0.12, size * 0.92, size * 0.24);
    ctx.restore();
  };
  FB.pipe = function (ctx, x, y, size) {
    ctx.save();
    ctx.strokeStyle = '#6f8fa0'; ctx.lineWidth = 6;
    ctx.strokeRect(x - size * 0.3, y - size * 0.5, size * 0.6, size);
    ctx.restore();
  };
  FB.background = function (ctx, w, h, season) {
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#79c3f0'); g.addColorStop(0.72, '#cfeaf8'); g.addColorStop(0.73, '#5aa04a'); g.addColorStop(1, '#3b7d4f');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  };
  FB.landmarks = function () {};
  FB.boardFrame = function (ctx, x, y, w, h) {
    ctx.save();
    ctx.strokeStyle = 'rgba(80,50,20,0.6)'; ctx.lineWidth = 6;
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  };
  FB.sprout = function (ctx, x, y, size, stage, mood) {
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, size * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = '#e8b88a'; ctx.fill();
    FB.text(ctx, mood || 'idle', x, y + size * 0.45, 12, '#333', 'center');
    ctx.restore();
  };
  FB.launcher = function (ctx, x, y, w, heldType, locked, t) {
    ctx.save();
    ctx.globalAlpha = locked ? 0.5 : 1;
    roundRect(ctx, x - w / 2, y - 24, w, 48, 12);
    ctx.fillStyle = locked ? '#888' : '#a86a3a'; ctx.fill();
    if (heldType) FB.fruit(ctx, heldType, x, y - 6, 44, t);
    ctx.restore();
  };
  FB.monkey = function (ctx, x, y, size) {
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, size / 2, 0, Math.PI * 2);
    ctx.fillStyle = '#8a5a3a'; ctx.fill();
    ctx.restore();
  };
  FB.splash = function (ctx, x, y, type, p) {
    ctx.save();
    ctx.globalAlpha = 1 - p;
    ctx.strokeStyle = FB_FRUIT[type] || '#fff'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(x, y, 10 + 40 * p, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  };
  FB.heart = function (ctx, x, y, size, filled) {
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, size / 2, 0, Math.PI * 2);
    ctx.fillStyle = filled ? '#e0384a' : 'rgba(0,0,0,0.25)'; ctx.fill();
    ctx.restore();
  };
  FB.star = function (ctx, x, y, size, filled) {
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, size / 2, 0, Math.PI * 2);
    ctx.fillStyle = filled ? '#f6c945' : 'rgba(0,0,0,0.25)'; ctx.fill();
    ctx.restore();
  };

  function sp(name) {
    if (S && typeof S[name] === 'function') return S[name];
    if (!missing[name]) missing[name] = true;
    return FB[name] || function () {};
  }
  function palette(season) {
    var p = S && S.PALETTE && S.PALETTE[season];
    return p || { sky: '#79c3f0', skyLow: '#cfeaf8', ground: '#5aa04a', groundDark: '#3b7d4f',
                  accent: '#f6c945', banner: '#c94f3d', button: '#3b9b5a', text: '#335D7C' };
  }
  function fruitColor(type, key) {
    var fc = S && S.FRUIT_COLORS && S.FRUIT_COLORS[type];
    if (fc && fc[key]) return fc[key];
    if (fc && fc.main) return fc.main;
    return FB_FRUIT[type] || '#ffffff';
  }
  function text(ctx, txt, x, y, size, color, align, outline) {
    sp('text')(ctx, txt, x, y, size, color, align, outline);
  }

  // ---------------------------------------------------------------- canvas
  var canvas = document.getElementById('ot-canvas');
  var ctx = canvas ? canvas.getContext('2d') : null;
  var dpr = 1, viewScale = 1, viewOX = 0, viewOY = 0, cssW = 0, cssH = 0;

  function resize() {
    if (!canvas) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    // visualViewport tracks the mobile URL-bar collapse; innerHeight can lag it
    var vv = window.visualViewport;
    cssW = (vv && vv.width) || window.innerWidth;
    cssH = (vv && vv.height) || window.innerHeight;
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = Math.max(1, Math.round(cssW * dpr));
    canvas.height = Math.max(1, Math.round(cssH * dpr));
    var s = Math.min(cssW / W, cssH / H);
    viewScale = s * dpr;
    viewOX = (canvas.width - W * viewScale) / 2;
    viewOY = (canvas.height - H * viewScale) / 2;
  }

  function toLogical(clientX, clientY) {
    return {
      x: (clientX * dpr - viewOX) / viewScale,
      y: (clientY * dpr - viewOY) / viewScale
    };
  }

  // ---------------------------------------------------------------- save
  var save = { v: 1, nextLevel: 1, stars: {}, hearts: HEARTS_MAX, heartsAt: 0, best: 0 };

  function loadSave() {
    try {
      var raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      var d = JSON.parse(raw);
      if (!d || d.v !== 1) return;
      save.nextLevel = clamp(Math.round(Number(d.nextLevel) || 1), 1, TOTAL_LEVELS);
      save.stars = (d.stars && typeof d.stars === 'object') ? d.stars : {};
      save.hearts = clamp(Math.round(Number(d.hearts)), 0, HEARTS_MAX);
      if (isNaN(save.hearts)) save.hearts = HEARTS_MAX;
      save.heartsAt = Number(d.heartsAt) || 0;
      save.best = Math.max(0, Number(d.best) || 0);
    } catch (e) { /* storage unavailable or corrupt: keep defaults */ }
  }
  function persist() {
    try {
      save.hearts = game.hearts;
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    } catch (e) { /* private mode / quota: ignore */ }
  }
  function wallNow() { return Date.now(); }
  // Hearts refill 1 per REFILL_MS measured from heartsAt; never above max.
  function refillHearts() {
    var now = wallNow();
    if (game.hearts >= HEARTS_MAX) { save.heartsAt = now; return; }
    if (!save.heartsAt) save.heartsAt = now;
    var elapsed = now - save.heartsAt;
    var gained = Math.floor(elapsed / REFILL_MS);
    if (gained > 0) {
      game.hearts = Math.min(HEARTS_MAX, game.hearts + gained);
      save.heartsAt = (game.hearts >= HEARTS_MAX) ? now : save.heartsAt + gained * REFILL_MS;
      persist();
    }
  }
  function msToNextHeart() {
    if (game.hearts >= HEARTS_MAX) return 0;
    var left = REFILL_MS - (wallNow() - (save.heartsAt || wallNow()));
    return left < 0 ? 0 : left;
  }
  function loseHeart() {
    if (game.hearts >= HEARTS_MAX) save.heartsAt = wallNow();
    game.hearts = Math.max(0, game.hearts - 1);
    persist();
  }

  // ---------------------------------------------------------------- game state
  var game = {
    state: 'splash',
    clock: 0,
    level: 1, zone: 'spring', zoneIndex: 0,
    score: 0, timeLeft: 0, timeLimit: 0,
    hearts: HEARTS_MAX,
    remaining: 0, target: 0,
    held: null, queue: [],
    lockout: 0,
    board: null,
    stars: 0,
    flight: null,
    paused: false,
    version: GAME_VERSION,
    start: function () { startGame(); },
    pause: function () {
      if (game.paused) return;
      if (game.state !== 'playing') return;
      game.paused = true;
    },
    resume: function () {
      if (!game.paused) return;
      game.paused = false;
      acc = 0;             // no dt spike: discard time accumulated across the pause
    }
  };
  OT.game = game;

  var splashStartAt = 0;
  var stateEnteredWall = 0;      // wall clock at the last state change (skip grace)
  var stateT = 0;                // game-clock seconds in the current state
  var pendingLevel = 1;          // level to begin after zoneAd / zoneIntro
  var nextSeed = null;           // OT.debug.seed(n)
  var seedCounter = 0;
  var levelEndTimer = -1;        // countdown to the clear/fail card after the last pop
  var levelEndKind = '';

  // presentation
  var launcherX = cellX(2), launcherTargetX = cellX(2);
  var drag = null;               // {id, startY, samples:[{t,y}], x, y}
  var anim = null;               // post-flight presentation (pops / effects / compaction)
  var dispCells = null;          // pre-launch grid snapshot while a flight/pop is shown
  var popups = [];
  var chunks = [];
  var lockShake = 0;

  function setState(s) {
    game.state = s;
    stateEnteredWall = wallNow();
    stateT = 0;
  }
  function graceOk() { return wallNow() - stateEnteredWall >= TUNE.SKIP_GRACE_MS; }

  function levelDef(n) { return C.levelDef(n); }
  function zoneProgress() {
    var zi = game.zoneIndex;
    var z = ZONES[zi];
    if (!z || !z.levels) return 0;
    var start = ZONE_START[zi] || 1, i, done = 0;
    for (i = start; i < start + z.levels; i++) if (save.stars[i]) done++;
    return clamp(done / z.levels, 0, 1);
  }
  function makeSeed(n) {
    if (nextSeed !== null) { var s = nextSeed; nextSeed = null; return s; }
    seedCounter++;
    return ((n * 7919) + (wallNow() % 100000) * 31 + seedCounter * 104729) >>> 0;
  }

  function beginLevel(n) {
    n = clamp(Math.round(Number(n) || 1), 1, TOTAL_LEVELS);
    var def = levelDef(n);
    game.level = n;
    game.zone = def.zone || seasonOf(def.zoneIndex || 0);
    game.zoneIndex = def.zoneIndex || 0;
    game.timeLimit = def.timeLimit || 60;
    game.timeLeft = game.timeLimit;
    game.score = 0;
    game.stars = 0;
    game.lockout = 0;
    game.flight = null;
    anim = null; dispCells = null; popups = []; chunks = [];
    levelEndTimer = -1; levelEndKind = '';
    drag = null;
    launcherX = launcherTargetX = cellX(Math.floor(COLS / 2));
    var seed = makeSeed(n);
    game.board = null;
    if (B && typeof B.create === 'function') {
      try {
        game.board = B.create(def, seed);
      } catch (e) {
        try { console.error('OT.Board.create failed', e); } catch (e2) {}
        game.board = null;
      }
    }
    if (B && typeof B.rng === 'function') {
      try { prng = B.rng(seed ^ 0x5bd1e995) || Math.random; } catch (e) { prng = Math.random; }
    }
    syncFromBoard();
    setState('playing');
    game.paused = false;
  }
  function syncFromBoard() {
    var b = game.board;
    if (!b) { game.remaining = 0; game.target = 0; game.held = null; game.queue = []; return; }
    game.remaining = b.remaining;
    game.target = b.target;
    game.held = b.held;
    game.queue = (b.queue || []).slice();
    if (typeof b.score === 'number') game.score = b.score;
  }

  function startGame() {
    // API entry: straight into 'playing' on the saved level (tests rely on it).
    refillHearts();
    if (game.hearts <= 0) { setState('noHearts'); return; }
    game.paused = false;
    beginLevel(save.nextLevel);
  }
  function startFromTitle() {
    // Player entry: same as start() but a zone's first level shows the intro.
    refillHearts();
    if (game.hearts <= 0) { setState('noHearts'); return; }
    var n = save.nextLevel;
    var def = levelDef(n);
    if (def.indexInZone === 0) { pendingLevel = n; setState('zoneIntro'); }
    else beginLevel(n);
  }
  function starsFor(timeLeft, timeLimit) {
    var f = timeLimit > 0 ? timeLeft / timeLimit : 0;
    if (f >= (STAR_FRACTIONS[0] !== undefined ? STAR_FRACTIONS[0] : 0.5)) return 3;
    if (f >= (STAR_FRACTIONS[1] !== undefined ? STAR_FRACTIONS[1] : 0.25)) return 2;
    return 1;
  }
  function doClearLevel() {
    var n = game.level;
    game.stars = starsFor(game.timeLeft, game.timeLimit);
    if (!save.stars[n] || save.stars[n] < game.stars) save.stars[n] = game.stars;
    var nn = Math.min(TOTAL_LEVELS, n + 1);
    if (nn > save.nextLevel) save.nextLevel = nn;
    if (game.score > save.best) save.best = game.score;
    persist();
    game.flight = null; anim = null; dispCells = null; drag = null;
    setState('levelClear');
  }
  function doFailLevel() {
    loseHeart();
    game.flight = null; anim = null; dispCells = null; drag = null;
    game.lockout = 0;
    setState('levelFail');
  }
  function advanceAfterClear() {
    var nn = game.level + 1;
    if (nn > TOTAL_LEVELS) { setState('title'); return; }
    var def = levelDef(nn);
    pendingLevel = nn;
    if ((def.zoneIndex || 0) !== game.zoneIndex) setState('zoneAd');   // zone transition only
    else beginLevel(nn);
  }
  function retryAfterFail() {
    refillHearts();
    if (game.hearts <= 0) { setState('noHearts'); return; }
    beginLevel(game.level);
  }

  // ---------------------------------------------------------------- launch
  // THE launch path. Real flicks, keyboard and OT.debug.launch all come here.
  function doLaunch(col) {
    if (game.state !== 'playing' || game.paused) return false;
    if (game.flight || anim) return false;
    if (game.lockout > 0) return false;
    if (!game.board || !B || typeof B.launch !== 'function') return false;
    col = Math.round(Number(col));
    if (!(col >= 0 && col < COLS)) return false;

    var b = game.board;
    dispCells = snapshotCells(b);
    var result;
    try {
      result = B.launch(b, col);
    } catch (e) {
      try { console.error('OT.Board.launch threw', e); } catch (e2) {}
      dispCells = null;
      return false;
    }
    if (!result) { dispCells = null; return false; }

    var pts = [{ x: launcherX, y: LAUNCH_Y }];
    var i, p, path = result.path || [];
    for (i = 0; i < path.length; i++) {
      p = path[i];
      pts.push({ x: cellX(p.col), y: cellY(p.row), col: p.col, row: p.row });
    }
    if (pts.length === 1) pts.push({ x: cellX(col), y: cellY(ROWS - 1), col: col, row: ROWS - 1 });
    var defl = {};
    var dl = result.deflections || [];
    for (i = 0; i < dl.length; i++) defl[dl[i].col + ',' + dl[i].row] = true;

    game.flight = {
      col: col,
      type: result.launched || dispHeld(b, result),
      result: result,
      pts: pts,
      seg: 0, segT: 0,
      x: pts[0].x, y: pts[0].y,
      rot: 0,
      sx: 1, sy: 1,            // squash scale
      phase: 'fly',            // fly | bounce | impact | return | done
      phaseT: 0,
      defl: defl,
      wobble: 0
    };
    launcherTargetX = cellX(col);
    return true;
  }
  function dispHeld(b, result) { return result.launched || game.held; }
  function snapshotCells(b) {
    var rows = [], r, c, cell, row;
    if (!b || !b.cells) return null;
    for (r = 0; r < b.cells.length; r++) {
      row = [];
      for (c = 0; c < b.cells[r].length; c++) {
        cell = b.cells[r][c];
        row.push(cell ? { kind: cell.kind, type: cell.type, lean: cell.lean } : null);
      }
      rows.push(row);
    }
    return rows;
  }

  // ---------------------------------------------------------------- flight
  function updateFlight(dt) {
    var f = game.flight;
    if (!f) return;
    f.phaseT += dt;
    var pts = f.pts;
    if (f.phase === 'fly') {
      var remain = FLIGHT_SPEED * dt;
      while (remain > 0 && f.seg < pts.length - 1) {
        var a = pts[f.seg], b2 = pts[f.seg + 1];
        var segLen = Math.sqrt((b2.x - a.x) * (b2.x - a.x) + (b2.y - a.y) * (b2.y - a.y)) || 1;
        var left = (1 - f.segT) * segLen;
        var step = Math.min(remain, left);
        f.segT += step / segLen;
        remain -= step;
        f.rot += step / (TILE_SIZE * 0.5);
        f.x = lerp(a.x, b2.x, f.segT);
        f.y = lerp(a.y, b2.y, f.segT);
        if (f.segT >= 0.999) {
          f.seg++; f.segT = 0;
          f.x = b2.x; f.y = b2.y;
          if (b2.col !== undefined && f.defl[b2.col + ',' + b2.row]) {
            f.phase = 'bounce'; f.phaseT = 0;
            break;
          }
        }
      }
      if (f.phase === 'fly' && f.seg >= pts.length - 1) {
        f.phase = 'impact'; f.phaseT = 0;
      }
    } else if (f.phase === 'bounce') {
      var pb = f.phaseT / TUNE.BOUNCE_S;
      var kb = Math.sin(Math.PI * clamp(pb, 0, 1));
      f.sx = 1 + 0.25 * kb; f.sy = 1 - 0.3 * kb;
      if (pb >= 1) { f.sx = f.sy = 1; f.phase = 'fly'; f.phaseT = 0; }
    } else if (f.phase === 'impact') {
      var pi = f.phaseT / TUNE.SQUASH_S;
      var ki = Math.sin(Math.PI * clamp(pi, 0, 1));
      f.sx = 1 + 0.35 * ki; f.sy = 1 - 0.4 * ki;
      if (pi >= 1) {
        f.sx = f.sy = 1;
        if (f.result.matched) finishFlight(true);
        else { f.phase = 'return'; f.phaseT = 0; f.seg = pts.length - 1; f.segT = 0; }
      }
    } else if (f.phase === 'return') {
      var remainR = FLIGHT_SPEED * TUNE.RETURN_SPEED_MUL * dt;
      while (remainR > 0 && f.seg > 0) {
        var ra = pts[f.seg], rb = pts[f.seg - 1];
        var rLen = Math.sqrt((rb.x - ra.x) * (rb.x - ra.x) + (rb.y - ra.y) * (rb.y - ra.y)) || 1;
        var rLeft = (1 - f.segT) * rLen;
        var rStep = Math.min(remainR, rLeft);
        f.segT += rStep / rLen;
        remainR -= rStep;
        f.x = lerp(ra.x, rb.x, f.segT);
        f.y = lerp(ra.y, rb.y, f.segT);
        if (f.segT >= 0.999) { f.seg--; f.segT = 0; f.x = rb.x; f.y = rb.y; }
      }
      f.wobble = Math.sin(f.phaseT * 28) * TUNE.RETURN_WOBBLE * (1 - Math.min(1, f.phaseT / 0.6) * 0.5);
      f.rot = f.wobble;
      if (f.seg <= 0) finishFlight(false);
    }
  }

  function finishFlight(matched) {
    var f = game.flight;
    var r = f.result;
    game.flight = null;
    if (!matched) {
      dispCells = null;
      game.lockout = LOCKOUT_S;
      lockShake = LOCKOUT_S;
      addPopup(launcherX, LAUNCH_Y - 70, 'MISS', '#ff6b6b', 30);
      // held/queue unchanged on a mismatch, but resync anyway (contract)
      if (r.held) game.held = r.held;
      if (r.queue) game.queue = r.queue.slice();
      return;
    }
    // matched: hand swap + score/time now, pops + compaction animate next
    if (r.held) game.held = r.held;
    if (r.queue) game.queue = r.queue.slice();
    if (typeof r.timeBonus === 'number' && r.timeBonus > 0) {
      game.timeLeft += r.timeBonus;
      addPopup(70, 70, '+' + r.timeBonus.toFixed(1) + ' s', '#7dff9a', 22);
    }
    var runKey = {}, i, c;
    var run = r.run || [];
    for (i = 0; i < run.length; i++) runKey[run[i].col + ',' + run[i].row] = true;
    var pops = [];
    var cleared = r.cleared || [];
    for (i = 0; i < cleared.length; i++) {
      c = cleared[i];
      pops.push({ col: c.col, row: c.row, kind: c.kind || 'fruit', type: c.type,
                  score: runKey[c.col + ',' + c.row] ? 10 : 15, started: false, t: 0 });
    }
    var broken = r.broken || [];
    for (i = 0; i < broken.length; i++) {
      c = broken[i];
      pops.push({ col: c.col, row: c.row, kind: c.kind || 'wall', type: null,
                  score: 0, started: false, t: 0, obstacle: true });
    }
    var effects = buildEffects(r);
    var popsLen = pops.length ? (pops.length - 1) * TUNE.POP_INTERVAL_S + Math.max(TUNE.POP_S, TUNE.SPLASH_S) : 0;
    var efLen = 0;
    for (i = 0; i < effects.length; i++) efLen = Math.max(efLen, effects[i].dur + (effects[i].delay || 0));
    anim = {
      phase: 'pop', t: 0,
      pops: pops, popIndex: 0, popLen: Math.max(popsLen, efLen),
      hidden: {},
      effects: effects,
      compaction: r.compaction || [],
      result: r,
      scoreTarget: (typeof r.scoreDelta === 'number') ? game.score + r.scoreDelta : game.score,
      remainingTarget: (typeof r.remaining === 'number') ? r.remaining : game.remaining
    };
    if (r.cherryDouble) addPopup(cellX(r.col), BOARD_Y + 40, 'DOUBLE x2!', '#ffd166', 28);
    if (r.chain > 0) addPopup(W / 2, BOARD_Y + 90, 'CHAIN x' + r.chain, '#ffb347', 28);
    if (pops.length === 0 && effects.length === 0) endAnim();
  }

  function buildEffects(r) {
    var out = [], i, e, list = r.effects || [];
    for (i = 0; i < list.length; i++) {
      e = list[i];
      var d = 0.3, delay = 0;
      if (e.kind === 'monkey') d = TUNE.EFFECT_MONKEY_S;
      else if (e.kind === 'lemonColumn') d = TUNE.EFFECT_LEMON_S;
      else if (e.kind === 'appleRow') d = TUNE.EFFECT_APPLE_S;
      else if (e.kind === 'cross') d = TUNE.EFFECT_CROSS_S;
      else if (e.kind === 'burst') d = TUNE.EFFECT_BURST_S;
      else if (e.kind === 'seeds') d = TUNE.EFFECT_SEEDS_S;
      else if (e.kind === 'chain') { d = TUNE.EFFECT_CHAIN_S; delay = (e.round || 0) * TUNE.EFFECT_CHAIN_ROUND_S; }
      else if (e.kind === 'splash') d = TUNE.SPLASH_S;
      out.push({ cue: e, dur: d, delay: delay, t: 0 });
    }
    return out;
  }

  function updateAnim(dt) {
    if (!anim) return;
    anim.t += dt;
    var i, p;
    if (anim.phase === 'pop') {
      // start pops on their schedule
      while (anim.popIndex < anim.pops.length && anim.t >= anim.popIndex * TUNE.POP_INTERVAL_S) {
        p = anim.pops[anim.popIndex];
        startPop(p);
        anim.popIndex++;
      }
      for (i = 0; i < anim.pops.length; i++) {
        p = anim.pops[i];
        if (p.started) p.t += dt;
      }
      for (i = 0; i < anim.effects.length; i++) anim.effects[i].t += dt;
      if (anim.t >= anim.popLen) {
        anim.phase = 'compact'; anim.t = 0;
        dispCells = null;    // post-launch grid from here; moved tiles interpolate
        if (!anim.compaction.length) endAnim();
      }
    } else if (anim.phase === 'compact') {
      if (anim.t >= TUNE.COMPACT_S) endAnim();
    }
  }
  function startPop(p) {
    p.started = true;
    anim.hidden[p.col + ',' + p.row] = true;
    var x = cellX(p.col), y = cellY(p.row);
    if (!p.obstacle) {
      game.remaining = Math.max(anim.remainingTarget, game.remaining - 1);
      if (p.score) {
        game.score = Math.min(anim.scoreTarget, game.score + p.score);
        addPopup(x + rnd(-14, 14), y - 10, '+' + p.score, '#ffffff', 18);
      }
      spawnChunks(x, y, p.type || 'coconut');
    } else {
      addPopup(x, y - 10, 'CRACK', '#ffe08a', 18);
      spawnChunks(x, y, null);
    }
  }
  function endAnim() {
    var a = anim;
    anim = null;
    dispCells = null;
    if (a) {
      game.score = a.scoreTarget;
      game.remaining = a.remainingTarget;
      syncHandFromBoard();
      if (a.result.levelCleared) { levelEndTimer = TUNE.LEVEL_END_DELAY_S; levelEndKind = 'clear'; }
    }
  }
  function syncHandFromBoard() {
    var b = game.board;
    if (!b) return;
    game.remaining = b.remaining;
    game.target = b.target;
    if (typeof b.score === 'number') game.score = b.score;
  }

  // ---------------------------------------------------------------- juice
  function addPopup(x, y, txt, color, size) {
    popups.push({ x: x, y: y, text: txt, color: color || '#fff', size: size || 20, t: 0 });
  }
  function spawnChunks(x, y, type) {
    var n = Math.round(rnd(TUNE.CHUNKS_MIN, TUNE.CHUNKS_MAX)), i;
    for (i = 0; i < n; i++) {
      chunks.push({
        x: x + rnd(-10, 10), y: y + rnd(-8, 8),
        vx: rnd(-170, 170), vy: rnd(-380, -160),
        r: rnd(4, 8),
        color: type ? (i % 2 ? fruitColor(type, 'dark') : fruitColor(type, 'main')) : '#8b5a2b',
        t: 0, bounced: false, alpha: 1
      });
    }
  }
  function updateJuice(dt) {
    var i, p, c;
    for (i = popups.length - 1; i >= 0; i--) {
      p = popups[i];
      p.t += dt;
      if (p.t >= TUNE.POPUP_S) popups.splice(i, 1);
    }
    for (i = chunks.length - 1; i >= 0; i--) {
      c = chunks[i];
      c.t += dt;
      c.vy += TUNE.CHUNK_GRAVITY * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      if (c.y >= TUNE.CHUNK_FLOOR_Y) {
        c.y = TUNE.CHUNK_FLOOR_Y;
        if (!c.bounced) { c.bounced = true; c.vy = -Math.abs(c.vy) * TUNE.CHUNK_BOUNCE; c.vx *= 0.7; }
        else { c.vy = 0; c.vx *= 0.9; }
      }
      c.alpha = 1 - easeIn(c.t / TUNE.CHUNK_LIFE_S);
      if (c.t >= TUNE.CHUNK_LIFE_S) chunks.splice(i, 1);
    }
  }

  // ---------------------------------------------------------------- update
  function update(dt) {
    if (game.paused) return;   // clock frozen while paused
    game.clock += dt;
    stateT += dt;
    var st = game.state;

    if (st === 'splash') {
      if (!window.__assetsReady) splashStartAt = game.clock;
      else if (game.clock - splashStartAt >= TUNE.SPLASH_MIN_S) setState('title');
    } else if (st === 'playing') {
      if (game.lockout > 0) { game.lockout = Math.max(0, game.lockout - dt); }
      if (lockShake > 0) lockShake = Math.max(0, lockShake - dt);
      // launcher eases toward its target lane when not being dragged
      if (!drag) {
        var k = Math.min(1, TUNE.LAUNCHER_SNAP * dt);
        launcherX += (launcherTargetX - launcherX) * k;
        if (Math.abs(launcherTargetX - launcherX) < 0.5) launcherX = launcherTargetX;
      }
      // timer
      if (levelEndTimer < 0) {
        game.timeLeft -= dt;
        if (game.timeLeft <= 0) {
          game.timeLeft = 0;
          if (!game.flight && !anim) { levelEndTimer = TUNE.LEVEL_END_DELAY_S; levelEndKind = 'fail'; }
        }
      }
      updateFlight(dt);
      updateAnim(dt);
      if (levelEndTimer >= 0) {
        levelEndTimer -= dt;
        if (levelEndTimer < 0) {
          levelEndTimer = -1;
          if (levelEndKind === 'clear') doClearLevel();
          else if (levelEndKind === 'fail') doFailLevel();
          levelEndKind = '';
        }
      }
    } else if (st === 'zoneAd') {
      if (stateT >= TUNE.AD_TOTAL_S) setState('zoneIntro');
    } else if (st === 'zoneIntro') {
      if (stateT >= TUNE.ZONE_INTRO_AUTO_S) beginLevel(pendingLevel);
    }
    updateJuice(dt);
  }

  // ---------------------------------------------------------------- input
  var BTN = {
    pause:  { x: 452, y: 30, r: 26 },
    next:   { x: W / 2, y: 598, w: 240, h: 66 },
    retry:  { x: W / 2 - 72, y: 598, w: 132, h: 62 },
    quit:   { x: W / 2 + 72, y: 598, w: 132, h: 62 },
    skip:   { x: W / 2, y: 640, w: 210, h: 62 },
    resume: { x: W / 2, y: H * 0.56, w: 240, h: 66 },
    title:  { x: W / 2, y: 600, w: 280, h: 72 }
  };
  function hitBtn(p, b) {
    if (b.r) { var dx = p.x - b.x, dy = p.y - b.y; return dx * dx + dy * dy <= (b.r + 8) * (b.r + 8); }
    return Math.abs(p.x - b.x) <= b.w / 2 + 8 && Math.abs(p.y - b.y) <= b.h / 2 + 8;
  }
  function nowMs() {
    return (window.performance && performance.now) ? performance.now() : Date.now();
  }

  function pointerDown(id, cx, cy) {
    var p = toLogical(cx, cy);
    var st = game.state;
    if (game.paused) {
      if (hitBtn(p, BTN.pause) || hitBtn(p, BTN.resume)) game.resume();
      return;
    }
    if (st === 'splash') { if (window.__assetsReady) setState('title'); return; }
    if (st === 'title') { if (graceOk()) startFromTitle(); return; }
    if (st === 'zoneIntro') { if (graceOk()) beginLevel(pendingLevel); return; }
    if (st === 'levelClear') { if (graceOk() && hitBtn(p, BTN.next)) advanceAfterClear(); return; }
    if (st === 'levelFail') {
      if (!graceOk()) return;
      if (hitBtn(p, BTN.retry)) retryAfterFail();
      else if (hitBtn(p, BTN.quit)) setState('title');
      return;
    }
    if (st === 'zoneAd') {
      if (graceOk() && stateT >= TUNE.AD_SKIP_AFTER_S && hitBtn(p, BTN.skip)) setState('zoneIntro');
      return;
    }
    if (st === 'noHearts') {
      if (!graceOk()) return;
      refillHearts();
      setState('title');
      return;
    }
    if (st !== 'playing') return;
    if (hitBtn(p, BTN.pause)) { game.pause(); return; }
    if (drag) return;   // one finger owns the launcher
    var onLauncher = Math.abs(p.x - launcherX) <= TUNE.LAUNCHER_W / 2 + 10 && Math.abs(p.y - LAUNCH_Y) <= 60;
    if (p.y > TUNE.LAUNCH_ZONE_Y || onLauncher) {
      drag = { id: id, startY: p.y, x: p.x, y: p.y, samples: [{ t: nowMs(), y: p.y }] };
      launcherX = launcherTargetX = clamp(p.x, LANE0_X, LANE_MAX_X);
    }
  }
  function pointerMove(id, cx, cy) {
    if (!drag || drag.id !== id) return;
    var p = toLogical(cx, cy);
    drag.x = p.x; drag.y = p.y;
    launcherX = launcherTargetX = clamp(p.x, LANE0_X, LANE_MAX_X);
    var t = nowMs();
    drag.samples.push({ t: t, y: p.y });
    // keep a little more than the velocity window
    while (drag.samples.length > 2 && t - drag.samples[0].t > TUNE.FLICK_WINDOW_MS * 2) drag.samples.shift();
  }
  function pointerUp(id) {
    if (!drag || drag.id !== id) return;
    var d = drag;
    drag = null;
    var t = nowMs();
    var lane = laneOf(launcherX);
    launcherTargetX = cellX(lane);
    // upward velocity over the last FLICK_WINDOW_MS (logical px/s, up = +)
    var i, s0 = d.samples[0];
    for (i = 0; i < d.samples.length; i++) {
      if (t - d.samples[i].t <= TUNE.FLICK_WINDOW_MS) { s0 = d.samples[i]; break; }
    }
    var last = d.samples[d.samples.length - 1];
    var dtMs = Math.max(1, last.t - s0.t);
    var vy = (s0.y - last.y) / (dtMs / 1000);
    var disp = d.startY - last.y;
    if (vy > TUNE.FLICK_VEL || disp > TUNE.FLICK_DISP) doLaunch(lane);
    // otherwise: release without a flick only repositions
  }

  function primaryAction() {
    // keyboard Enter/Space acts as the overlay's main button
    var st = game.state;
    if (st === 'splash') { if (window.__assetsReady) setState('title'); }
    else if (st === 'title') { if (graceOk()) startFromTitle(); }
    else if (st === 'zoneIntro') { if (graceOk()) beginLevel(pendingLevel); }
    else if (st === 'levelClear') { if (graceOk()) advanceAfterClear(); }
    else if (st === 'levelFail') { if (graceOk()) retryAfterFail(); }
    else if (st === 'zoneAd') { if (graceOk() && stateT >= TUNE.AD_SKIP_AFTER_S) setState('zoneIntro'); }
    else if (st === 'noHearts') { if (graceOk()) { refillHearts(); setState('title'); } }
  }

  function bindInput() {
    if (!canvas) return;

    canvas.addEventListener('touchstart', function (e) {
      e.preventDefault();
      var i, t;
      for (i = 0; i < e.changedTouches.length; i++) {
        t = e.changedTouches[i];
        pointerDown('t' + t.identifier, t.clientX, t.clientY);
      }
    }, { passive: false });

    canvas.addEventListener('touchmove', function (e) {
      e.preventDefault();
      var i, t;
      for (i = 0; i < e.changedTouches.length; i++) {
        t = e.changedTouches[i];
        pointerMove('t' + t.identifier, t.clientX, t.clientY);
      }
    }, { passive: false });

    function touchEnd(e) {
      e.preventDefault();
      var i;
      for (i = 0; i < e.changedTouches.length; i++) {
        pointerUp('t' + e.changedTouches[i].identifier);
      }
    }
    canvas.addEventListener('touchend', touchEnd, { passive: false });
    canvas.addEventListener('touchcancel', touchEnd, { passive: false });

    canvas.addEventListener('mousedown', function (e) {
      e.preventDefault();
      pointerDown('mouse', e.clientX, e.clientY);
    });
    window.addEventListener('mousemove', function (e) {
      pointerMove('mouse', e.clientX, e.clientY);
    });
    window.addEventListener('mouseup', function () {
      pointerUp('mouse');
    });

    // block context menu / double-tap zoom / selection
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    canvas.addEventListener('dblclick', function (e) { e.preventDefault(); });
    document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
    document.addEventListener('selectstart', function (e) { e.preventDefault(); });

    window.addEventListener('keydown', function (e) {
      var k = e.key;
      if (k === ' ' || k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowRight') e.preventDefault();
      if (game.paused) {
        if (k === 'p' || k === 'P' || k === 'Escape' || k === ' ' || k === 'Enter') game.resume();
        return;
      }
      if (game.state !== 'playing') {
        if (k === ' ' || k === 'Enter') primaryAction();
        return;
      }
      if (k === 'p' || k === 'P' || k === 'Escape') { game.pause(); return; }
      if (drag) return;
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') {
        launcherTargetX = cellX(clamp(laneOf(launcherTargetX) - 1, 0, COLS - 1));
      } else if (k === 'ArrowRight' || k === 'd' || k === 'D') {
        launcherTargetX = cellX(clamp(laneOf(launcherTargetX) + 1, 0, COLS - 1));
      } else if (k === ' ' || k === 'ArrowUp' || k === 'w' || k === 'W') {
        doLaunch(laneOf(launcherTargetX));
      }
    });

    window.addEventListener('resize', resize);
    // some mobile browsers report stale dimensions at the orientationchange
    // event itself - resize now and again once the rotation settles
    window.addEventListener('orientationchange', function () {
      resize();
      setTimeout(resize, 300);
    });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', resize);
    }
    document.addEventListener('fullscreenchange', resize);
    document.addEventListener('webkitfullscreenchange', resize);
  }

  // ---------------------------------------------------------------- render
  function render() {
    if (!ctx) return;
    var t = game.clock;
    var season = seasonOf(game.zoneIndex);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#3b7d4f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // AMBIENT pass over the whole canvas (bars included), in logical units
    ctx.setTransform(viewScale, 0, 0, viewScale, viewOX, viewOY);
    var fullW = canvas.width / viewScale, fullH = canvas.height / viewScale;
    ctx.save();
    ctx.translate(-viewOX / viewScale, -viewOY / viewScale);
    sp('background')(ctx, fullW, fullH, season, t);
    ctx.restore();

    // everything else lives inside the logical field
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();

    var st = game.state;
    if (st === 'splash') renderSplash(t);
    else if (st === 'title') renderTitle(t, season);
    else {
      renderScene(t, season);
      if (st === 'zoneIntro') renderZoneIntro(t);
      else if (st === 'levelClear') renderLevelClear(t, season);
      else if (st === 'levelFail') renderLevelFail(t, season);
      else if (st === 'zoneAd') renderZoneAd(t);
      else if (st === 'noHearts') renderNoHearts(t, season);
      if (game.paused) renderPaused(t, season);
    }
    ctx.restore();
  }

  function renderSplash(t) {
    var pal = palette('spring');
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, 0, W, H);
    text(ctx, 'ORCHARD', W / 2, H * 0.40, 64, '#fff', 'center', pal.text || '#335D7C');
    text(ctx, 'TOSS', W / 2, H * 0.40 + 66, 64, pal.accent || '#f6c945', 'center', pal.text || '#335D7C');
    var i;
    for (i = 0; i < 3; i++) {
      var ph = (Math.sin(t * 4 - i * 0.9) + 1) / 2;
      ctx.beginPath();
      ctx.arc(W / 2 - 30 + i * 30, H * 0.62, 5 + 5 * ph, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,' + (0.4 + 0.6 * ph) + ')';
      ctx.fill();
    }
    text(ctx, window.__assetsReady ? 'ready' : 'loading', W / 2, H * 0.70, 16, 'rgba(255,255,255,0.8)', 'center');
  }

  function renderTitle(t, season) {
    var pal = palette(season);
    sp('landmarks')(ctx, W, H, season, zoneProgress(), t);
    sp('sprout')(ctx, 82, H * 0.585, 130, game.zoneIndex, 'cheer', t);
    sp('banner')(ctx, W / 2, H * 0.24, 400, 96, pal.banner, 'ORCHARD TOSS', 44);
    var n = save.nextLevel, def = levelDef(n);
    text(ctx, zoneName(def.zoneIndex || 0).toUpperCase() + '  LEVEL ' + n, W / 2, H * 0.36, 26, '#fff', 'center', pal.text || '#335D7C');
    if (save.best > 0) text(ctx, 'BEST ' + save.best, W / 2, H * 0.36 + 34, 20, '#fff', 'center', pal.text || '#335D7C');
    var i, hx = W / 2 - (HEARTS_MAX - 1) * 20;
    for (i = 0; i < HEARTS_MAX; i++) sp('heart')(ctx, hx + i * 40, H * 0.48, 30, i < game.hearts);
    var pulse = 1 + 0.03 * Math.sin(t * 5);
    sp('button')(ctx, BTN.title.x, BTN.title.y, BTN.title.w * pulse, BTN.title.h * pulse, pal.button, 'TAP TO START', 30);
    text(ctx, 'v' + GAME_VERSION, W - 10, H - 14, 13, 'rgba(255,255,255,0.75)', 'right');
  }

  function renderScene(t, season) {
    sp('landmarks')(ctx, W, H, season, zoneProgress(), t);
    sp('boardFrame')(ctx, BOARD_X, BOARD_Y, BOARD_W, BOARD_H, season);
    renderTiles(t, season);
    renderEffects(t);
    renderFlight(t);
    renderLauncherZone(t, season);
    renderChunks();
    renderHUD(t, season);
    renderPopups();
  }

  function drawCell(cell, x, y, t, season, scale) {
    if (!cell) return;
    if (scale !== undefined && scale !== 1) {
      ctx.save();
      ctx.translate(x, y); ctx.scale(scale, scale); ctx.translate(-x, -y);
    }
    if (cell.kind === 'fruit') sp('fruit')(ctx, cell.type, x, y, TILE_SIZE, t);
    else if (cell.kind === 'coconut') sp('coconut')(ctx, x, y, TILE_SIZE, t);
    else if (cell.kind === 'wall') sp('wall')(ctx, x, y, CELL, cell.lean || 1, season);
    else if (cell.kind === 'trellis') sp('trellis')(ctx, x, y, CELL, season);
    else if (cell.kind === 'pipe') sp('pipe')(ctx, x, y, CELL, season);
    if (scale !== undefined && scale !== 1) ctx.restore();
  }

  function renderTiles(t, season) {
    var b = game.board;
    var grid = dispCells || (b && b.cells);
    if (!grid) {
      text(ctx, 'NO BOARD', W / 2, BOARD_Y + BOARD_H / 2, 28, '#fff', 'center', '#335D7C');
      return;
    }
    var r, c, cell, key, i;
    var hidden = anim ? anim.hidden : null;
    var moving = {};
    var compP = 0;
    if (anim && anim.phase === 'compact') {
      compP = easeOut(anim.t / TUNE.COMPACT_S);
      for (i = 0; i < anim.compaction.length; i++) {
        var mv = anim.compaction[i];
        if (mv && mv.to) moving[mv.to.col + ',' + mv.to.row] = mv;
      }
    }
    // aim hint: the lowest tile in the launcher's lane
    if (!game.flight && !anim && !dispCells && B && typeof B.lowestTile === 'function' && game.state === 'playing') {
      var lane = laneOf(drag ? launcherX : launcherTargetX);
      var lt = null;
      try { lt = B.lowestTile(b, lane); } catch (e) { lt = null; }
      if (lt) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.45 + 0.25 * Math.sin(t * 6)) + ')';
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(cellX(lt.col), cellY(lt.row), TILE_SIZE / 2 + 5, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
    }
    for (r = 0; r < grid.length; r++) {
      for (c = 0; c < grid[r].length; c++) {
        cell = grid[r][c];
        if (!cell) continue;
        key = c + ',' + r;
        if (hidden && hidden[key] && dispCells) continue;   // popping: drawn by the pop anim
        var x = cellX(c), y = cellY(r);
        if (moving[key]) {
          x = lerp(cellX(moving[key].from.col), x, compP);
          y = lerp(cellY(moving[key].from.row), y, compP);
        }
        drawCell(cell, x, y, t, season);
      }
    }
    // pops: shrinking tile + juice splash
    if (anim && anim.phase === 'pop' && dispCells) {
      for (i = 0; i < anim.pops.length; i++) {
        var p = anim.pops[i];
        if (!p.started) continue;
        var cellP = dispCells[p.row] && dispCells[p.row][p.col];
        var pp = p.t / TUNE.POP_S;
        if (pp < 1 && cellP) {
          var sc = pp < 0.35 ? 1 + 0.35 * (pp / 0.35) : Math.max(0, 1.35 * (1 - (pp - 0.35) / 0.65));
          drawCell(cellP, cellX(p.col), cellY(p.row), t, season, sc);
        }
        var sPk = p.t / TUNE.SPLASH_S;
        if (sPk < 1 && !p.obstacle) sp('splash')(ctx, cellX(p.col), cellY(p.row), p.type || 'cherry', clamp(sPk, 0, 1));
      }
    }
  }

  function renderEffects(t) {
    if (!anim || anim.phase !== 'pop') return;
    var i, e, cue, p, x, y;
    for (i = 0; i < anim.effects.length; i++) {
      e = anim.effects[i]; cue = e.cue;
      var tt = e.t - (e.delay || 0);
      if (tt < 0 || tt > e.dur) continue;
      p = clamp(tt / e.dur, 0, 1);
      ctx.save();
      if (cue.kind === 'monkey') {
        x = lerp(BOARD_X - 50, BOARD_X + BOARD_W + 50, p);
        y = cellY(cue.row) - 6 - Math.abs(Math.sin(p * Math.PI * 6)) * 10;
        sp('monkey')(ctx, x, y, 62, t);
      } else if (cue.kind === 'lemonColumn') {
        ctx.globalAlpha = 0.55 * (1 - p);
        ctx.fillStyle = '#fff36b';
        ctx.fillRect(cellX(cue.col) - CELL * 0.35, BOARD_Y, CELL * 0.7, BOARD_H);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ffffff';
        y = lerp(BOARD_Y + BOARD_H, BOARD_Y, p);
        ctx.fillRect(cellX(cue.col) - CELL * 0.4, y - 4, CELL * 0.8, 8);
      } else if (cue.kind === 'appleRow') {
        ctx.globalAlpha = 0.55 * (1 - p);
        ctx.fillStyle = '#ff5c4d';
        ctx.fillRect(BOARD_X, cellY(cue.row) - CELL * 0.35, BOARD_W * Math.min(1, p * 1.4), CELL * 0.7);
      } else if (cue.kind === 'cross') {
        ctx.globalAlpha = 0.6 * (1 - p);
        ctx.fillStyle = '#ff9fb1';
        var ex = CELL * (0.5 + p);
        ctx.fillRect(cellX(cue.col) - ex - CELL / 2, cellY(cue.row) - CELL * 0.3, 2 * ex + CELL, CELL * 0.6);
        ctx.fillRect(cellX(cue.col) - CELL * 0.3, cellY(cue.row) - ex - CELL / 2, CELL * 0.6, 2 * ex + CELL);
      } else if (cue.kind === 'burst') {
        ctx.globalAlpha = 1 - p;
        ctx.strokeStyle = '#7dff9a'; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(cellX(cue.col), cellY(cue.row), CELL * 0.3 + CELL * 1.3 * p, 0, Math.PI * 2); ctx.stroke();
      } else if (cue.kind === 'seeds') {
        var cells = cue.cells || [], k;
        var ox = cellX(anim.result.col), oy = anim.result.impact ? cellY(anim.result.impact.row) : BOARD_Y + BOARD_H;
        ctx.fillStyle = '#ffd6e0';
        for (k = 0; k < cells.length; k++) {
          var sx = lerp(ox, cellX(cells[k].col), easeOut(p));
          var sy = lerp(oy, cellY(cells[k].row), easeOut(p)) - Math.sin(p * Math.PI) * 60;
          ctx.beginPath(); ctx.arc(sx, sy, 6, 0, Math.PI * 2); ctx.fill();
        }
      } else if (cue.kind === 'chain') {
        var cc = cue.cells || [], j;
        ctx.globalAlpha = 1 - p;
        ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 5;
        for (j = 0; j < cc.length; j++) {
          ctx.beginPath(); ctx.arc(cellX(cc[j].col), cellY(cc[j].row), CELL * 0.2 + CELL * 0.5 * p, 0, Math.PI * 2); ctx.stroke();
        }
      } else if (cue.kind === 'splash') {
        sp('splash')(ctx, cellX(cue.col), cellY(cue.row), cue.type || 'cherry', p);
      }
      ctx.restore();
    }
  }

  function renderFlight(t) {
    var f = game.flight;
    if (!f) return;
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.rot);
    ctx.scale(f.sx, f.sy);
    sp('fruit')(ctx, f.type, 0, 0, TILE_SIZE, t);
    ctx.restore();
  }

  function renderLauncherZone(t, season) {
    var mood = 'idle';
    if (game.state === 'levelFail' || game.state === 'noHearts') mood = 'sad';
    else if (game.state === 'levelClear' || game.state === 'zoneIntro') mood = 'cheer';
    else if (drag || game.flight) mood = 'aim';
    sp('sprout')(ctx, 40, LAUNCH_Y + 4, 100, game.zoneIndex, mood, t);
    var locked = game.lockout > 0;
    var shakeX = lockShake > 0 ? Math.sin(lockShake * 60) * 4 : 0;
    var heldShown = game.flight ? null : game.held;
    sp('launcher')(ctx, launcherX + shakeX, LAUNCH_Y, TUNE.LAUNCHER_W, heldShown, locked, t);
    if (game.state === 'playing' && !drag && !game.flight && !anim && stateT < 4 && game.level <= 2) {
      text(ctx, 'DRAG + FLICK UP', launcherX, LAUNCH_Y + 42, 15, 'rgba(255,255,255,0.9)', 'center', 'rgba(0,0,0,0.5)');
    }
  }

  function renderChunks() {
    var i, c;
    for (i = 0; i < chunks.length; i++) {
      c = chunks[i];
      ctx.save();
      ctx.globalAlpha = clamp(c.alpha, 0, 1);
      ctx.fillStyle = c.color;
      ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  function renderPopups() {
    var i, p, k;
    for (i = 0; i < popups.length; i++) {
      p = popups[i];
      k = p.t / TUNE.POPUP_S;
      ctx.save();
      ctx.globalAlpha = 1 - easeIn(k);
      text(ctx, p.text, p.x, p.y - easeOut(k) * TUNE.POPUP_RISE, p.size, p.color, 'center', 'rgba(0,0,0,0.6)');
      ctx.restore();
    }
  }

  function renderHUD(t, season) {
    var pal = palette(season);
    var dark = 'rgba(30,20,10,0.45)';
    var outline = pal.text || '#335D7C';
    // row 1: timer | zone banner | hearts | pause
    var red = game.timeLeft < TUNE.TIMER_RED_S;
    var timerColor = red ? '#d8323c' : dark;
    var pulse = red ? 1 + 0.06 * Math.sin(t * 10) : 1;
    sp('panel')(ctx, 8, 8, 118, 44, timerColor);
    text(ctx, fmtTime(game.timeLeft), 67, 31, 28 * pulse, '#fff', 'center', outline);
    sp('banner')(ctx, 236, 30, 190, 44, pal.banner, zoneName(game.zoneIndex).toUpperCase() + ' ' + (levelDef(game.level).indexInZone + 1 || game.level), 22);
    var i;
    for (i = 0; i < HEARTS_MAX; i++) sp('heart')(ctx, 346 + i * 16, 30, 15, i < game.hearts);
    // pause button
    ctx.save();
    ctx.beginPath(); ctx.arc(BTN.pause.x, BTN.pause.y, BTN.pause.r, 0, Math.PI * 2);
    ctx.fillStyle = pal.button || '#3b9b5a'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = outline; ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.fillRect(BTN.pause.x - 9, BTN.pause.y - 10, 6, 20);
    ctx.fillRect(BTN.pause.x + 3, BTN.pause.y - 10, 6, 20);
    ctx.restore();
    // row 2: score | fruit left | held + next
    sp('panel')(ctx, 8, 60, 140, 52, dark);
    text(ctx, 'SCORE', 78, 74, 13, 'rgba(255,255,255,0.85)', 'center');
    text(ctx, String(game.score), 78, 96, 22, '#fff', 'center', outline);
    sp('panel')(ctx, 156, 60, 166, 52, dark);
    text(ctx, 'FRUIT LEFT', 239, 74, 13, 'rgba(255,255,255,0.85)', 'center');
    text(ctx, game.remaining + '  →  ' + game.target, 239, 96, 22, '#fff', 'center', outline);
    sp('panel')(ctx, 330, 60, 142, 52, dark);
    text(ctx, 'HELD', 356, 72, 12, 'rgba(255,255,255,0.85)', 'center');
    if (game.held) sp('fruit')(ctx, game.held, 356, 94, 30, t);
    text(ctx, 'NEXT', 428, 72, 12, 'rgba(255,255,255,0.85)', 'center');
    var q = game.queue || [];
    for (i = 0; i < Math.min(3, q.length); i++) {
      if (q[i]) sp('fruit')(ctx, q[i], 402 + i * 26, 94, 20 - i * 2, t);
    }
  }

  function dim(alpha) {
    ctx.fillStyle = 'rgba(20,14,8,' + (alpha || 0.55) + ')';
    ctx.fillRect(0, 0, W, H);
  }

  function renderZoneIntro(t) {
    var season = seasonOf(levelDef(pendingLevel).zoneIndex || 0);
    var pal = palette(season);
    dim(0.45);
    sp('banner')(ctx, W / 2, H * 0.32, 380, 100, pal.banner, zoneName(levelDef(pendingLevel).zoneIndex || 0).toUpperCase(), 46);
    text(ctx, 'LEVEL ' + pendingLevel, W / 2, H * 0.32 + 84, 28, '#fff', 'center', pal.text || '#335D7C');
    sp('sprout')(ctx, W / 2, H * 0.58, 150, levelDef(pendingLevel).zoneIndex || 0, 'cheer', t);
    if (graceOk()) text(ctx, 'TAP TO PLAY', W / 2, H * 0.78, 22, '#fff', 'center', pal.text || '#335D7C');
  }

  function renderLevelClear(t, season) {
    var pal = palette(season);
    dim(0.5);
    sp('banner')(ctx, W / 2, 300, 380, 90, pal.banner, 'LEVEL CLEAR!', 40);
    var i;
    for (i = 0; i < 3; i++) {
      var pop = clamp((stateT - 0.25 - i * 0.2) / 0.3, 0, 1);
      var size = 64 * (0.6 + 0.4 * easeOut(pop));
      sp('star')(ctx, W / 2 - 90 + i * 90, 400, size, i < game.stars && pop > 0);
    }
    text(ctx, 'SCORE ' + game.score, W / 2, 480, 30, '#fff', 'center', pal.text || '#335D7C');
    text(ctx, 'TIME LEFT ' + fmtTime(game.timeLeft), W / 2, 520, 22, '#fff', 'center', pal.text || '#335D7C');
    sp('button')(ctx, BTN.next.x, BTN.next.y, BTN.next.w, BTN.next.h, pal.button, 'NEXT', 30);
  }

  function renderLevelFail(t, season) {
    var pal = palette(season);
    dim(0.55);
    sp('banner')(ctx, W / 2, 300, 380, 90, '#b8323c', "TIME'S UP", 40);
    var i, hx = W / 2 - (HEARTS_MAX - 1) * 20;
    for (i = 0; i < HEARTS_MAX; i++) sp('heart')(ctx, hx + i * 40, 400, 30, i < game.hearts);
    text(ctx, 'HEART LOST', W / 2, 450, 24, '#ffb3b3', 'center', pal.text || '#335D7C');
    text(ctx, 'FRUIT LEFT ' + game.remaining + '  →  ' + game.target, W / 2, 500, 22, '#fff', 'center', pal.text || '#335D7C');
    sp('button')(ctx, BTN.retry.x, BTN.retry.y, BTN.retry.w, BTN.retry.h, pal.button, 'RETRY', 26);
    sp('button')(ctx, BTN.quit.x, BTN.quit.y, BTN.quit.w, BTN.quit.h, '#7a6a5a', 'QUIT', 26);
  }

  function renderZoneAd(t) {
    dim(0.85);
    sp('panel')(ctx, 40, 200, W - 80, 440, '#f3efe6');
    text(ctx, 'AD BREAK', W / 2, 270, 44, '#333', 'center');
    text(ctx, '(monetisation stub)', W / 2, 315, 18, '#666', 'center');
    var left = Math.max(0, Math.ceil(TUNE.AD_TOTAL_S - stateT));
    text(ctx, String(left), W / 2, 420, 96, '#333', 'center');
    text(ctx, 'next: ' + zoneName(levelDef(pendingLevel).zoneIndex || 0).toUpperCase(), W / 2, 520, 22, '#555', 'center');
    if (stateT >= TUNE.AD_SKIP_AFTER_S) {
      sp('button')(ctx, BTN.skip.x, BTN.skip.y, BTN.skip.w, BTN.skip.h, '#3b9b5a', 'SKIP', 28);
    } else {
      text(ctx, 'skip in ' + Math.ceil(TUNE.AD_SKIP_AFTER_S - stateT), W / 2, BTN.skip.y, 18, '#777', 'center');
    }
  }

  function renderNoHearts(t, season) {
    var pal = palette(season);
    dim(0.6);
    sp('banner')(ctx, W / 2, 300, 380, 90, '#b8323c', 'NO HEARTS', 40);
    var i, hx = W / 2 - (HEARTS_MAX - 1) * 20;
    for (i = 0; i < HEARTS_MAX; i++) sp('heart')(ctx, hx + i * 40, 400, 30, i < game.hearts);
    var ms = msToNextHeart();
    text(ctx, 'NEXT HEART IN', W / 2, 460, 22, '#fff', 'center', pal.text || '#335D7C');
    text(ctx, fmtTime(ms / 1000), W / 2, 500, 40, '#fff', 'center', pal.text || '#335D7C');
    text(ctx, 'TAP TO GO BACK', W / 2, 600, 20, 'rgba(255,255,255,0.9)', 'center', pal.text || '#335D7C');
  }

  function renderPaused(t, season) {
    var pal = palette(season);
    dim(0.6);
    sp('banner')(ctx, W / 2, H * 0.40, 300, 84, pal.banner, 'PAUSED', 40);
    sp('button')(ctx, BTN.resume.x, BTN.resume.y, BTN.resume.w, BTN.resume.h, pal.button, 'RESUME', 30);
  }

  // ---------------------------------------------------------------- main loop
  var acc = 0;
  var lastRaf = -1;

  function frame(now) {
    if (lastRaf < 0) lastRaf = now;
    var dt = (now - lastRaf) / 1000;
    lastRaf = now;
    if (dt > TUNE.DT_CLAMP) dt = TUNE.DT_CLAMP;
    if (game.paused) {
      acc = 0;                   // clock stopped: discard wall time, no spike on resume
    } else {
      acc += dt;
      var guard = 0;
      while (acc >= TUNE.STEP && guard < 30) {
        update(TUNE.STEP);
        acc -= TUNE.STEP;
        guard++;
      }
    }
    render();
    window.requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- debug hooks
  function stepSeconds(seconds) {
    if (game.paused) return;   // pause proof: stepping while paused advances nothing
    var n = Math.max(1, Math.round((Number(seconds) || 0) / TUNE.STEP));
    var i;
    for (i = 0; i < n; i++) update(TUNE.STEP);
  }

  OT.debug = {
    TUNE: TUNE,
    step: stepSeconds,
    launch: function (col) { return doLaunch(col); },
    resolve: function () {
      var steps = Math.round(TUNE.RESOLVE_MAX_S / TUNE.STEP), i;
      for (i = 0; i < steps; i++) {
        if (!game.flight && !anim) break;
        if (game.paused) break;
        update(TUNE.STEP);
      }
      return !game.flight && !anim;
    },
    skipTo: function (n) {
      game.paused = false;
      beginLevel(n);
      return game.state === 'playing';
    },
    setTimeLeft: function (s) { game.timeLeft = Math.max(0, Number(s) || 0); return game.timeLeft; },
    clearLevel: function () {
      if (game.state !== 'playing') return false;
      levelEndTimer = -1; levelEndKind = '';
      doClearLevel();
      return true;
    },
    failLevel: function () {
      if (game.state !== 'playing') return false;
      levelEndTimer = -1; levelEndKind = '';
      doFailLevel();
      return true;
    },
    addHearts: function (k) {
      game.hearts = clamp(Math.round(game.hearts + (Number(k) || 0)), 0, HEARTS_MAX);
      if (game.hearts >= HEARTS_MAX) save.heartsAt = wallNow();
      persist();
      return game.hearts;
    },
    seed: function (n) { nextSeed = (n === null || n === undefined) ? null : (Number(n) >>> 0); return nextSeed; },
    view: function () {
      return { dpr: dpr, scale: viewScale, ox: viewOX, oy: viewOY, cssW: cssW, cssH: cssH };
    },
    // extras (integration aids, not in the contract)
    missingPainters: function () { var k, out = []; for (k in missing) if (missing.hasOwnProperty(k)) out.push(k); return out; },
    snapshot: function () {
      if (!game.board || !B || typeof B.snapshot !== 'function') return '';
      try { return B.snapshot(game.board); } catch (e) { return ''; }
    },
    pointer: function (kind, x, y) {
      // synthetic pointer in LOGICAL space (kind: 'down'|'move'|'up')
      var cx = (x * viewScale + viewOX) / dpr, cy = (y * viewScale + viewOY) / dpr;
      if (kind === 'down') pointerDown('dbg', cx, cy);
      else if (kind === 'move') pointerMove('dbg', cx, cy);
      else pointerUp('dbg');
      return { drag: !!drag, launcherX: launcherX };
    },
    save: function () { return save; },
    launcherX: function () { return launcherX; },
    anim: function () { return anim; }
  };

  // ---------------------------------------------------------------- boot
  loadSave();
  game.hearts = save.hearts;
  refillHearts();
  resize();
  bindInput();
  setState('splash');
  splashStartAt = game.clock;
  window.__ready = true;   // canvas sized, state = 'splash', input bound
  window.requestAnimationFrame(frame);
})();
