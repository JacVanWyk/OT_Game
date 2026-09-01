/* =========================================================================
   Orchard Toss — sprites.js  (OT.S)
   Procedural canvas-2D painters. Plain script (ES2015 max, var/function),
   no images, no fetch, no DOM access at load time. Runs from file://.

   Contract (prototype/ARCHITECTURE.md, "js/sprites.js — OT.S"):
     OT.S.PALETTE        { spring|summer|autumn|winter : {sky, skyLow, ground,
                           groundDark, accent, banner, button, text} }
     OT.S.FRUIT_COLORS   { cherry|... : {main, dark, shine} }
     OT.S.fruit(ctx, type, x, y, size, t)
     OT.S.coconut(ctx, x, y, size, t)
     OT.S.wall(ctx, x, y, size, lean, season)
     OT.S.trellis(ctx, x, y, size, season)
     OT.S.pipe(ctx, x, y, size, season)
     OT.S.background(ctx, w, h, season, t)          AMBIENT ONLY
     OT.S.landmarks(ctx, W, H, season, progress, t) ONE tree + fence + sun/moon
     OT.S.boardFrame(ctx, x, y, w, h, season)
     OT.S.sprout(ctx, x, y, size, stage, mood, t)
     OT.S.launcher(ctx, x, y, w, heldType, locked, t)
     OT.S.monkey(ctx, x, y, size, t)
     OT.S.splash(ctx, x, y, type, p)
     OT.S.heart(ctx, x, y, size, filled)
     OT.S.star(ctx, x, y, size, filled)
     OT.S.banner(ctx, cx, cy, w, h, color, text, s)
     OT.S.button(ctx, cx, cy, w, h, color, text, s)
     OT.S.panel(ctx, x, y, w, h, color)
     OT.S.text(ctx, txt, x, y, size, color, align, outline)
     OT.S.font(size) -> string

   Notes / documented choices (no signature deviates from the contract):
   - Every painter is centred on (x, y) unless the contract says otherwise
     (`panel` and `boardFrame` take a top-left x,y like the contract's HUD
     usage; `background` paints the rect 0,0,w,h).
   - `t` is seconds; any value (undefined, NaN, negative) is safe.
   - Every painter does ctx.save()/restore() and leaks no state.
   - Apple is painted GREEN (Granny Smith) rather than red: the three Spring
     fruits (cherry, strawberry, apple) all appear together from level 1 and
     three red silhouettes at 62 px were not readable on a phone. The leaf +
     stem + dented top keep it unmistakably an apple.
   - `s` on banner/button: values > 4 are a font size in px; values <= 4 are a
     multiplier of the auto size (h*0.5), matching Numbat's `s` usage.
   - Chrome language ported from Numbat Patrol sprites.js v7 (plaque body:
     drop shadow, colour block, dark bottom edge, gloss strip, outline, bold
     white label). Button is a true pill (radius = h/2) so its end caps are
     always proportional to height, never stretched by width. Label outline
     is Deep Navy #335D7C.
   ========================================================================= */

window.OT = window.OT || {};
OT.S = {};

/* ---------------- season palettes (design doc section 8) ---------------- */
OT.S.PALETTE = {
  spring: { sky: '#8fd4ff', skyLow: '#ffe4f1', ground: '#a3e46f', groundDark: '#5bb44a',
            accent: '#ff9ccd', banner: '#ff7eb6', button: '#63cf5b', text: '#ffffff' },
  summer: { sky: '#2aa7f2', skyLow: '#ffd86b', ground: '#7fd955', groundDark: '#3d9c38',
            accent: '#ffb23f', banner: '#ff7a3d', button: '#ffc233', text: '#ffffff' },
  autumn: { sky: '#e8a052', skyLow: '#ffe1b0', ground: '#dd9540', groundDark: '#8c3a2b',
            accent: '#ffb000', banner: '#a3243b', button: '#ff9b1f', text: '#ffffff' },
  winter: { sky: '#3d6fae', skyLow: '#c5ecea', ground: '#b3dfd9', groundDark: '#4d8f8a',
            accent: '#ffb52e', banner: '#2fa6a0', button: '#ffa41c', text: '#ffffff' }
};

/* ---------------- fruit colours (one entry per fruit) ---------------- */
OT.S.FRUIT_COLORS = {
  cherry:      { main: '#d8163a', dark: '#7d0a22', shine: '#ff8fa3' },
  strawberry:  { main: '#ff4d6d', dark: '#b3163f', shine: '#ffb3c1' },
  apple:       { main: '#8fd83a', dark: '#4a9418', shine: '#dcff9a' },
  watermelon:  { main: '#ff4f5e', dark: '#217f32', shine: '#ffc2c8' },
  grape:       { main: '#8e44d6', dark: '#48177f', shine: '#d6b3ff' },
  banana:      { main: '#ffd53e', dark: '#c98d12', shine: '#fff2b0' },
  pomegranate: { main: '#e0307a', dark: '#87124c', shine: '#ffa6cf' },
  pineapple:   { main: '#f7b733', dark: '#b36d0a', shine: '#ffe89a' },
  orange:      { main: '#ff8f1f', dark: '#c94f00', shine: '#ffd39a' },
  lemon:       { main: '#ffe135', dark: '#c9a000', shine: '#fff8b3' }
};

(function () {
  'use strict';

  var S = OT.S;
  var PAL = S.PALETTE;
  var FC = S.FRUIT_COLORS;
  var TAU = Math.PI * 2;
  var OUTLINE = '#3b2314';           // thick dark outline colour
  var NAVY = '#335D7C';              // Deep Navy label outline (Numbat chrome)
  var WOOD = '#c48a3f', WOOD_HI = '#e8b56a', WOOD_DK = '#7a4a1a';
  var SKIN = '#f8cba3', SKIN_DK = '#d9a072';

  /* ---------------- shared helpers (private) ---------------- */

  function num(v, d) { v = +v; return (v === v) ? v : (d || 0); }   // NaN-safe

  // deterministic pseudo-random in [0,1) from an integer seed
  function rnd(i) {
    var v = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    return v - Math.floor(v);
  }

  function pal(season) { return PAL[season] || PAL.spring; }

  // rounded-rect path (own helper: roundRect() isn't in older WebViews)
  function rrPath(ctx, x, y, w, h, r) {
    r = Math.min(r, w * 0.5, h * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // rounded-rect SUBpath (no beginPath) so several can share one path
  function rrSub(ctx, x, y, w, h, r) {
    r = Math.min(r, w * 0.5, h * 0.5);
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // unit-space entry: after this 1 unit == size px, outline style set.
  function enter(ctx, x, y, size, lw) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size, size);
    ctx.lineWidth = lw || 0.05;
    ctx.strokeStyle = OUTLINE;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
  }

  // radial "ball" gradient: bright top-left -> main -> dark rim
  function ballGrad(ctx, cx, cy, r, c) {
    var g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.08, cx, cy, r * 1.05);
    g.addColorStop(0, c.shine);
    g.addColorStop(0.35, c.main);
    g.addColorStop(1, c.dark);
    return g;
  }

  function ball(ctx, cx, cy, r, c, outline) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.fillStyle = ballGrad(ctx, cx, cy, r, c);
    ctx.fill();
    if (outline !== false) { ctx.stroke(); }
  }

  // top-left specular shine (white ellipse)
  function spec(ctx, cx, cy, rx, ry, rot, a) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, rot || 0, 0, TAU);
    ctx.fillStyle = 'rgba(255,255,255,' + (a === undefined ? 0.55 : a) + ')';
    ctx.fill();
  }

  function dot(ctx, cx, cy, r, color) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.fillStyle = color;
    ctx.fill();
  }

  // soft drop shadow ellipse (unit space)
  function dropShadow(ctx, cx, cy, rx, ry, a) {
    var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
    g.addColorStop(0, 'rgba(30,15,5,' + (a || 0.28) + ')');
    g.addColorStop(1, 'rgba(30,15,5,0)');
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, ry / rx);
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, TAU);
    ctx.fillStyle = g;
    ctx.translate(-cx, -cy);
    ctx.fill();
    ctx.restore();
  }

  function leaf(ctx, cx, cy, rx, ry, rot, hi, lo) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot || 0);
    var g = ctx.createLinearGradient(0, -ry, 0, ry);
    g.addColorStop(0, hi || '#9be25a');
    g.addColorStop(1, lo || '#3f8f22');
    ctx.beginPath();
    ctx.moveTo(-rx, 0);
    ctx.quadraticCurveTo(0, -ry * 1.6, rx, 0);
    ctx.quadraticCurveTo(0, ry * 1.6, -rx, 0);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();                              // midrib
    ctx.moveTo(-rx * 0.7, 0);
    ctx.lineTo(rx * 0.7, 0);
    ctx.lineWidth *= 0.6;
    ctx.strokeStyle = 'rgba(40,80,20,0.6)';
    ctx.stroke();
    ctx.restore();
  }

  function stem(ctx, x0, y0, cx, cy, x1, y1, w) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(cx, cy, x1, y1);
    ctx.lineWidth = w * 2.2;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    ctx.lineWidth = w;
    ctx.strokeStyle = '#8a5a2a';
    ctx.stroke();
  }

  /* =========================================================
     FRUIT — 10 painters, unit space [-0.5, 0.5], size = tile diameter
     ========================================================= */
  var FRUIT_PAINT = {};

  FRUIT_PAINT.cherry = function (ctx, t) {
    var c = FC.cherry;
    var sw = Math.sin(t * 2.2) * 0.03;
    // stems joined at the top
    stem(ctx, -0.19, 0.0, -0.12, -0.32, 0.06 + sw, -0.44, 0.045);
    stem(ctx, 0.21, 0.02, 0.2, -0.3, 0.06 + sw, -0.44, 0.045);
    leaf(ctx, 0.2 + sw, -0.4, 0.14, 0.055, -0.35);
    ctx.lineWidth = 0.05;
    ctx.strokeStyle = OUTLINE;
    ball(ctx, -0.2, 0.2, 0.24, c);
    ball(ctx, 0.21, 0.23, 0.24, c);
    spec(ctx, -0.29, 0.1, 0.07, 0.045, -0.7);
    spec(ctx, 0.12, 0.13, 0.07, 0.045, -0.7);
  };

  FRUIT_PAINT.strawberry = function (ctx, t) {
    var c = FC.strawberry, i, j, sx, sy;
    function body() {
      ctx.beginPath();
      ctx.moveTo(0, 0.46);
      ctx.bezierCurveTo(-0.5, 0.18, -0.44, -0.3, 0, -0.26);
      ctx.bezierCurveTo(0.44, -0.3, 0.5, 0.18, 0, 0.46);
      ctx.closePath();
    }
    body();
    ctx.fillStyle = ballGrad(ctx, 0, 0.05, 0.42, c);
    ctx.fill();
    ctx.stroke();
    // seeds
    ctx.save();
    body();
    ctx.clip();
    for (i = 0; i < 4; i++) {
      for (j = 0; j < 3; j++) {
        sx = -0.24 + j * 0.24 + (i % 2) * 0.12;
        sy = -0.14 + i * 0.14;
        ctx.beginPath();
        ctx.ellipse(sx, sy, 0.032, 0.045, 0, 0, TAU);
        ctx.fillStyle = '#fff1a8';
        ctx.fill();
        ctx.lineWidth = 0.018;
        ctx.strokeStyle = 'rgba(120,20,40,0.7)';
        ctx.stroke();
      }
    }
    ctx.restore();
    ctx.lineWidth = 0.05;
    ctx.strokeStyle = OUTLINE;
    spec(ctx, -0.17, -0.1, 0.08, 0.05, -0.6);
    // calyx: 5 leaves fanning from the top
    var sway = Math.sin(t * 2.5) * 0.04;
    for (i = -2; i <= 2; i++) {
      leaf(ctx, i * 0.11 + sway * 0.3, -0.31 - Math.abs(i) * 0.015, 0.09, 0.05,
           i * 0.55 + sway, '#8fe05a', '#2f8a22');
    }
    stem(ctx, 0, -0.28, 0.02, -0.4, 0.03 + sway, -0.48, 0.04);
  };

  FRUIT_PAINT.apple = function (ctx, t) {
    var c = FC.apple;
    function body() {
      ctx.beginPath();
      ctx.moveTo(0, -0.27);
      ctx.bezierCurveTo(-0.1, -0.44, -0.47, -0.36, -0.44, 0.02);
      ctx.bezierCurveTo(-0.42, 0.3, -0.22, 0.47, 0, 0.42);
      ctx.bezierCurveTo(0.22, 0.47, 0.42, 0.3, 0.44, 0.02);
      ctx.bezierCurveTo(0.47, -0.36, 0.1, -0.44, 0, -0.27);
      ctx.closePath();
    }
    body();
    ctx.fillStyle = ballGrad(ctx, 0, 0.04, 0.44, c);
    ctx.fill();
    // warm blush, clipped
    ctx.save();
    body();
    ctx.clip();
    var g = ctx.createRadialGradient(0.18, 0.12, 0.02, 0.18, 0.12, 0.34);
    g.addColorStop(0, 'rgba(255,220,90,0.55)');
    g.addColorStop(1, 'rgba(255,220,90,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-0.5, -0.5, 1, 1);
    ctx.restore();
    body();
    ctx.stroke();
    spec(ctx, -0.2, -0.12, 0.09, 0.055, -0.6);
    var sway = Math.sin(t * 2) * 0.03;
    stem(ctx, 0, -0.28, 0.02, -0.38, 0.05 + sway, -0.47, 0.045);
    leaf(ctx, 0.17 + sway, -0.4, 0.15, 0.06, -0.55, '#7ecf3f', '#2e7d1a');
  };

  FRUIT_PAINT.watermelon = function (ctx, t) {
    var i;
    ctx.rotate(-0.28 + Math.sin(t * 1.8) * 0.03);
    ctx.translate(0, -0.2);
    // rind (half-disc, flat edge up)
    ctx.beginPath();
    ctx.arc(0, 0, 0.44, 0, Math.PI);
    ctx.closePath();
    var rg = ctx.createLinearGradient(-0.4, 0, 0.4, 0);
    rg.addColorStop(0, '#4ec25a');
    rg.addColorStop(1, '#1d7a2e');
    ctx.fillStyle = rg;
    ctx.fill();
    // rind stripes
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, 0.44, 0, Math.PI);
    ctx.closePath();
    ctx.clip();
    ctx.strokeStyle = 'rgba(20,90,30,0.55)';
    ctx.lineWidth = 0.05;
    for (i = 0; i < 5; i++) {
      var a = Math.PI * (0.12 + i * 0.19);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 0.3, Math.sin(a) * 0.3);
      ctx.lineTo(Math.cos(a) * 0.46, Math.sin(a) * 0.46);
      ctx.stroke();
    }
    ctx.restore();
    // pith
    ctx.beginPath();
    ctx.arc(0, 0, 0.37, 0, Math.PI);
    ctx.closePath();
    ctx.fillStyle = '#eef9c9';
    ctx.fill();
    // flesh
    ctx.beginPath();
    ctx.arc(0, 0, 0.325, 0, Math.PI);
    ctx.closePath();
    var fg = ctx.createRadialGradient(-0.1, 0.02, 0.02, 0, 0.05, 0.36);
    fg.addColorStop(0, '#ff8a92');
    fg.addColorStop(0.5, FC.watermelon.main);
    fg.addColorStop(1, '#d92a3c');
    ctx.fillStyle = fg;
    ctx.fill();
    // seeds
    var seeds = [[-0.17, 0.13, 0.5], [0.0, 0.2, 0], [0.16, 0.12, -0.5], [-0.05, 0.06, 0.2]];
    for (i = 0; i < seeds.length; i++) {
      ctx.beginPath();
      ctx.ellipse(seeds[i][0], seeds[i][1], 0.028, 0.045, seeds[i][2], 0, TAU);
      ctx.fillStyle = '#2b1a10';
      ctx.fill();
    }
    // outline whole slice
    ctx.beginPath();
    ctx.arc(0, 0, 0.44, 0, Math.PI);
    ctx.closePath();
    ctx.lineWidth = 0.05;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    spec(ctx, -0.2, 0.08, 0.06, 0.035, 0.5, 0.45);
  };

  FRUIT_PAINT.grape = function (ctx, t) {
    var c = FC.grape, i;
    var sway = Math.sin(t * 2.4) * 0.03;
    stem(ctx, 0, -0.3, 0.0, -0.4, 0.05 + sway, -0.48, 0.045);
    leaf(ctx, -0.16 + sway, -0.38, 0.15, 0.065, 0.45, '#8fd94f', '#2f7f1f');
    ctx.lineWidth = 0.05;
    ctx.strokeStyle = OUTLINE;
    var rows = [[0.3, [0]], [0.11, [-0.14, 0.14]], [-0.08, [-0.27, 0, 0.27]], [-0.25, [-0.14, 0.14]]];
    for (i = 0; i < rows.length; i++) {
      var y = rows[i][0], xs = rows[i][1], j;
      for (j = 0; j < xs.length; j++) {
        ball(ctx, xs[j], y, 0.15, c);
        spec(ctx, xs[j] - 0.05, y - 0.06, 0.04, 0.025, -0.7, 0.5);
      }
    }
  };

  FRUIT_PAINT.banana = function (ctx, t) {
    var c = FC.banana;
    ctx.rotate(-0.45 + Math.sin(t * 1.7) * 0.03);
    ctx.translate(0, -0.06);
    function body() {
      ctx.beginPath();
      ctx.moveTo(-0.46, -0.1);
      ctx.quadraticCurveTo(0, 0.6, 0.46, -0.1);
      ctx.quadraticCurveTo(0, 0.12, -0.46, -0.1);
      ctx.closePath();
    }
    body();
    var g = ctx.createLinearGradient(0, -0.1, 0, 0.3);
    g.addColorStop(0, c.shine);
    g.addColorStop(0.45, c.main);
    g.addColorStop(1, c.dark);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.stroke();
    // ridge line
    ctx.beginPath();
    ctx.moveTo(-0.36, -0.06);
    ctx.quadraticCurveTo(0, 0.33, 0.36, -0.06);
    ctx.lineWidth = 0.025;
    ctx.strokeStyle = 'rgba(150,100,10,0.55)';
    ctx.stroke();
    // brown tips
    dot(ctx, -0.44, -0.1, 0.045, '#6b4318');
    dot(ctx, 0.44, -0.1, 0.045, '#6b4318');
    spec(ctx, -0.1, 0.1, 0.1, 0.03, 0.25, 0.5);
  };

  FRUIT_PAINT.pomegranate = function (ctx, t) {
    var c = FC.pomegranate, i;
    ball(ctx, 0, 0.07, 0.37, c);
    // seed window (cut-away) bottom right
    ctx.save();
    ctx.beginPath();
    ctx.arc(0.13, 0.16, 0.16, 0, TAU);
    ctx.clip();
    ctx.fillStyle = '#ffd6e2';
    ctx.fillRect(-0.5, -0.5, 1, 1);
    var pts = [[0.06, 0.08], [0.18, 0.06], [0.24, 0.17], [0.13, 0.17], [0.05, 0.22], [0.17, 0.27]];
    for (i = 0; i < pts.length; i++) {
      dot(ctx, pts[i][0], pts[i][1], 0.045, '#c8123f');
      dot(ctx, pts[i][0] - 0.012, pts[i][1] - 0.014, 0.014, 'rgba(255,255,255,0.8)');
    }
    ctx.restore();
    ctx.beginPath();
    ctx.arc(0.13, 0.16, 0.16, 0, TAU);
    ctx.lineWidth = 0.04;
    ctx.stroke();
    ctx.lineWidth = 0.05;
    spec(ctx, -0.16, -0.1, 0.09, 0.055, -0.6);
    // crown (calyx)
    var w = Math.sin(t * 2) * 0.01;
    ctx.beginPath();
    ctx.moveTo(-0.15, -0.26);
    ctx.lineTo(-0.17 + w, -0.44);
    ctx.lineTo(-0.07, -0.36);
    ctx.lineTo(0 + w, -0.49);
    ctx.lineTo(0.07, -0.36);
    ctx.lineTo(0.17 + w, -0.44);
    ctx.lineTo(0.15, -0.26);
    ctx.closePath();
    ctx.fillStyle = c.dark;
    ctx.fill();
    ctx.stroke();
  };

  FRUIT_PAINT.pineapple = function (ctx, t) {
    var c = FC.pineapple, i;
    // crown leaves
    var sway = Math.sin(t * 2.2) * 0.04;
    var angs = [-0.75, -0.4, 0, 0.4, 0.75];
    for (i = 0; i < angs.length; i++) {
      ctx.save();
      ctx.translate(0, -0.18);
      ctx.rotate(angs[i] + sway * (i - 2) * 0.3);
      ctx.beginPath();
      ctx.moveTo(-0.07, 0);
      ctx.quadraticCurveTo(-0.02, -0.2, 0, -0.34 + Math.abs(i - 2) * 0.03);
      ctx.quadraticCurveTo(0.02, -0.2, 0.07, 0);
      ctx.closePath();
      var lg = ctx.createLinearGradient(0, -0.34, 0, 0);
      lg.addColorStop(0, '#8fe05a');
      lg.addColorStop(1, '#2e8a26');
      ctx.fillStyle = lg;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    // body
    ctx.beginPath();
    ctx.ellipse(0, 0.13, 0.31, 0.36, 0, 0, TAU);
    ctx.fillStyle = ballGrad(ctx, 0, 0.13, 0.36, c);
    ctx.fill();
    // cross-hatch
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, 0.13, 0.31, 0.36, 0, 0, TAU);
    ctx.clip();
    ctx.strokeStyle = 'rgba(140,80,10,0.55)';
    ctx.lineWidth = 0.028;
    for (i = -4; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo(-0.5 + i * 0.13, -0.3);
      ctx.lineTo(0.2 + i * 0.13, 0.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0.5 - i * 0.13, -0.3);
      ctx.lineTo(-0.2 - i * 0.13, 0.6);
      ctx.stroke();
    }
    ctx.restore();
    ctx.beginPath();
    ctx.ellipse(0, 0.13, 0.31, 0.36, 0, 0, TAU);
    ctx.stroke();
    spec(ctx, -0.13, -0.08, 0.08, 0.05, -0.6, 0.5);
  };

  FRUIT_PAINT.orange = function (ctx, t) {
    var c = FC.orange, i;
    ball(ctx, 0, 0.06, 0.39, c);
    // dimples
    for (i = 0; i < 9; i++) {
      var a = rnd(i) * TAU, r = 0.1 + rnd(i + 9) * 0.25;
      dot(ctx, Math.cos(a) * r, 0.06 + Math.sin(a) * r, 0.018, 'rgba(160,60,0,0.35)');
    }
    spec(ctx, -0.17, -0.1, 0.09, 0.055, -0.6);
    dot(ctx, 0, -0.32, 0.045, '#b34a00');            // stem nub
    var sway = Math.sin(t * 2.1) * 0.03;
    leaf(ctx, 0.15 + sway, -0.37, 0.15, 0.06, -0.5, '#7fd044', '#2b7d1c');
  };

  FRUIT_PAINT.lemon = function (ctx, t) {
    var c = FC.lemon, i;
    ctx.rotate(-0.4 + Math.sin(t * 1.9) * 0.03);
    ctx.beginPath();
    ctx.ellipse(0, 0.02, 0.4, 0.28, 0, 0, TAU);
    ctx.fillStyle = ballGrad(ctx, 0, 0.02, 0.4, c);
    ctx.fill();
    // end nubs
    dot(ctx, -0.42, 0.02, 0.07, c.main);
    dot(ctx, 0.42, 0.02, 0.07, c.dark);
    // unify outline
    ctx.beginPath();
    ctx.ellipse(0, 0.02, 0.4, 0.28, 0, 0, TAU);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(-0.42, 0.02, 0.07, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(0.42, 0.02, 0.07, 0, TAU); ctx.stroke();
    dot(ctx, -0.42, 0.02, 0.05, c.main);
    dot(ctx, 0.42, 0.02, 0.05, c.dark);
    for (i = 0; i < 7; i++) {
      dot(ctx, -0.25 + rnd(i + 3) * 0.5, -0.15 + rnd(i + 21) * 0.3, 0.016, 'rgba(170,130,0,0.35)');
    }
    spec(ctx, -0.15, -0.1, 0.1, 0.05, -0.15);
    leaf(ctx, 0.3, -0.24, 0.13, 0.055, -0.9, '#7fd044', '#2b7d1c');
  };

  S.fruit = function (ctx, type, x, y, size, t) {
    t = num(t);
    size = num(size, 60);
    enter(ctx, x, y, size, 0.05);
    dropShadow(ctx, 0.03, 0.45, 0.34, 0.1, 0.22);
    ctx.rotate(Math.sin(t * 1.6 + (type ? type.length : 0)) * 0.03);
    var p = FRUIT_PAINT[type];
    if (p) {
      p(ctx, t);
    } else {                                   // unknown type: readable placeholder
      ball(ctx, 0, 0.05, 0.38, { main: '#bbbbbb', dark: '#666666', shine: '#ffffff' });
      ctx.fillStyle = OUTLINE;
      ctx.font = 'bold 0.5px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', 0, 0.07);
    }
    ctx.restore();
  };

  /* =========================================================
     COCONUT — brown hairy ball with three eyes
     ========================================================= */
  S.coconut = function (ctx, x, y, size, t) {
    t = num(t);
    size = num(size, 60);
    enter(ctx, x, y, size, 0.05);
    dropShadow(ctx, 0.03, 0.45, 0.34, 0.1, 0.22);
    ctx.rotate(Math.sin(t * 1.3) * 0.02);
    var i, a, c = { main: '#8b5a2b', dark: '#4a2a10', shine: '#c48a55' };
    // fibre fringe behind
    ctx.lineWidth = 0.035;
    ctx.strokeStyle = '#5a3416';
    for (i = 0; i < 26; i++) {
      a = i / 26 * TAU + rnd(i) * 0.2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 0.34, 0.04 + Math.sin(a) * 0.34);
      ctx.lineTo(Math.cos(a) * (0.42 + rnd(i + 5) * 0.06), 0.04 + Math.sin(a) * (0.42 + rnd(i + 5) * 0.06));
      ctx.stroke();
    }
    ctx.lineWidth = 0.05;
    ctx.strokeStyle = OUTLINE;
    ball(ctx, 0, 0.04, 0.37, c);
    // fibre streaks on the surface
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0.04, 0.37, 0, TAU);
    ctx.clip();
    ctx.lineWidth = 0.02;
    for (i = 0; i < 10; i++) {
      ctx.strokeStyle = (i % 2) ? 'rgba(40,20,5,0.4)' : 'rgba(200,150,100,0.25)';
      ctx.beginPath();
      ctx.moveTo(-0.4 + rnd(i + 40) * 0.8, -0.35 + rnd(i + 50) * 0.2);
      ctx.quadraticCurveTo(-0.1 + rnd(i + 60) * 0.2, 0.05, -0.35 + rnd(i + 70) * 0.7, 0.42);
      ctx.stroke();
    }
    ctx.restore();
    // three eyes
    var eyes = [[-0.11, -0.12], [0.11, -0.12], [0, 0.06]];
    for (i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(eyes[i][0], eyes[i][1], 0.07, 0.085, 0, 0, TAU);
      ctx.fillStyle = '#2a1608';
      ctx.fill();
      dot(ctx, eyes[i][0] - 0.02, eyes[i][1] - 0.03, 0.02, 'rgba(255,255,255,0.35)');
    }
    spec(ctx, -0.17, -0.14, 0.08, 0.045, -0.6, 0.3);
    ctx.restore();
  };

  /* =========================================================
     OBSTACLES — cell-space [-0.5, 0.5], size = CELL
     ========================================================= */
  function woodRect(ctx, x, y, w, h, r, horizontal) {
    var g = horizontal ? ctx.createLinearGradient(0, y, 0, y + h) : ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, WOOD_HI);
    g.addColorStop(0.45, WOOD);
    g.addColorStop(1, WOOD_DK);
    rrPath(ctx, x, y, w, h, r);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.stroke();
  }

  function seasonLeaf(season) {
    if (season === 'spring') { return ['#ffc7e2', '#ff8ac0']; }
    if (season === 'autumn') { return ['#ffc24d', '#d0641a']; }
    if (season === 'winter') { return ['#d8f7f2', '#7fc9c0']; }
    return ['#9be25a', '#3f8f22'];
  }

  S.wall = function (ctx, x, y, size, lean, season) {
    lean = (num(lean) < 0) ? -1 : 1;
    size = num(size, 76);
    enter(ctx, x, y, size, 0.045);
    dropShadow(ctx, 0.02, 0.47, 0.4, 0.08, 0.2);
    // post
    woodRect(ctx, -0.1, -0.44, 0.2, 0.9, 0.05, false);
    // ramp plank: low on the side away from lean, high on the lean side
    ctx.save();
    ctx.rotate(lean * -0.62);
    woodRect(ctx, -0.5, -0.09, 1.0, 0.18, 0.06, true);
    // nails
    dot(ctx, -0.36, 0, 0.025, '#5a3a1a');
    dot(ctx, 0.36, 0, 0.025, '#5a3a1a');
    // deflect arrow on the plank
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.moveTo(lean * 0.08, -0.05);
    ctx.lineTo(lean * 0.2, 0);
    ctx.lineTo(lean * 0.08, 0.05);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // post cap
    woodRect(ctx, -0.14, -0.5, 0.28, 0.1, 0.03, true);
    var lc = seasonLeaf(season);
    leaf(ctx, lean * -0.3, 0.38, 0.1, 0.045, lean * 0.4, lc[0], lc[1]);
    ctx.restore();
  };

  S.trellis = function (ctx, x, y, size, season) {
    size = num(size, 76);
    enter(ctx, x, y, size, 0.045);
    var i, lc = seasonLeaf(season);
    dropShadow(ctx, 0.0, 0.3, 0.45, 0.07, 0.2);
    // lattice diagonals behind the bar
    ctx.save();
    ctx.beginPath();
    ctx.rect(-0.5, -0.36, 1, 0.5);
    ctx.clip();
    ctx.lineWidth = 0.05;
    ctx.strokeStyle = '#8a5a2a';
    for (i = -3; i <= 3; i++) {
      ctx.beginPath(); ctx.moveTo(i * 0.25 - 0.3, -0.4); ctx.lineTo(i * 0.25 + 0.3, 0.2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i * 0.25 + 0.3, -0.4); ctx.lineTo(i * 0.25 - 0.3, 0.2); ctx.stroke();
    }
    ctx.restore();
    // main bars (top and bottom rails)
    woodRect(ctx, -0.52, -0.38, 1.04, 0.14, 0.04, true);
    woodRect(ctx, -0.52, 0.06, 1.04, 0.14, 0.04, true);
    // vine + leaves/blossoms hanging below
    ctx.lineWidth = 0.035;
    ctx.strokeStyle = '#3f8f22';
    ctx.beginPath();
    ctx.moveTo(-0.45, 0.18);
    ctx.quadraticCurveTo(-0.2, 0.42, 0, 0.24);
    ctx.quadraticCurveTo(0.2, 0.08, 0.45, 0.3);
    ctx.stroke();
    ctx.lineWidth = 0.035;
    ctx.strokeStyle = OUTLINE;
    if (season === 'spring') {
      for (i = 0; i < 4; i++) {
        var bx = -0.36 + i * 0.24, by = 0.28 + (i % 2) * 0.1;
        blossom(ctx, bx, by, 0.07, lc[0], lc[1]);
      }
    } else {
      for (i = 0; i < 4; i++) {
        leaf(ctx, -0.36 + i * 0.24, 0.3 + (i % 2) * 0.1, 0.09, 0.045, (i % 2) ? 0.5 : -0.4, lc[0], lc[1]);
      }
    }
    ctx.restore();
  };

  function blossom(ctx, x, y, r, hi, lo) {
    var i;
    for (i = 0; i < 5; i++) {
      var a = i / 5 * TAU - Math.PI / 2;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * r * 0.75, y + Math.sin(a) * r * 0.75, r * 0.55, 0, TAU);
      ctx.fillStyle = hi;
      ctx.fill();
      ctx.lineWidth = r * 0.25;
      ctx.strokeStyle = lo;
      ctx.stroke();
    }
    dot(ctx, x, y, r * 0.35, '#ffe36e');
  }

  S.pipe = function (ctx, x, y, size, season) {
    size = num(size, 76);
    enter(ctx, x, y, size, 0.045);
    var i, winter = (season === 'winter');
    var hi = winter ? '#d4cfc0' : '#c99a5a', mid = winter ? '#9c9482' : '#9a6a32', dk = winter ? '#5b5548' : '#5a3a1a';
    dropShadow(ctx, 0.04, 0.48, 0.34, 0.06, 0.18);
    // hollow log body (full cell height so stacked pipes join)
    var g = ctx.createLinearGradient(-0.32, 0, 0.32, 0);
    g.addColorStop(0, hi);
    g.addColorStop(0.5, mid);
    g.addColorStop(1, dk);
    ctx.beginPath();
    ctx.rect(-0.32, -0.5, 0.64, 1.0);
    ctx.fillStyle = g;
    ctx.fill();
    // bark texture
    ctx.save();
    ctx.beginPath();
    ctx.rect(-0.32, -0.5, 0.64, 1.0);
    ctx.clip();
    ctx.lineWidth = 0.02;
    for (i = 0; i < 7; i++) {
      ctx.strokeStyle = (i % 2) ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.22)';
      ctx.beginPath();
      ctx.moveTo(-0.3 + rnd(i + 80) * 0.6, -0.5);
      ctx.quadraticCurveTo(-0.3 + rnd(i + 90) * 0.6, 0, -0.3 + rnd(i + 100) * 0.6, 0.5);
      ctx.stroke();
    }
    ctx.restore();
    // side outlines only (open top & bottom)
    ctx.beginPath();
    ctx.moveTo(-0.32, -0.5); ctx.lineTo(-0.32, 0.5);
    ctx.moveTo(0.32, -0.5); ctx.lineTo(0.32, 0.5);
    ctx.stroke();
    // open ends: dark hollow ellipses (rim above, hollow below)
    ctx.beginPath();
    ctx.ellipse(0, -0.43, 0.32, 0.09, 0, 0, TAU);
    ctx.fillStyle = mid;
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, -0.43, 0.2, 0.05, 0, 0, TAU);
    ctx.fillStyle = '#1d0f05';
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, 0.43, 0.32, 0.09, 0, 0, Math.PI);
    ctx.fillStyle = '#1d0f05';
    ctx.fill();
    ctx.stroke();
    // specular streak
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(-0.24, -0.34, 0.06, 0.7);
    ctx.restore();
  };

  /* =========================================================
     BACKGROUND (AMBIENT ONLY) — sky, distant hills, ground band.
     No sun, no tree, no one-of-a-kind landmark: safe to spill into bars.
     ========================================================= */
  S.background = function (ctx, w, h, season, t) {
    t = num(t);
    var P = pal(season), i, u;
    ctx.save();
    var groundY = h * 0.86;
    // sky
    var sg = ctx.createLinearGradient(0, 0, 0, groundY);
    sg.addColorStop(0, P.sky);
    sg.addColorStop(0.7, P.skyLow);
    sg.addColorStop(1, '#ffffff');
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, w, groundY + 2);
    // soft clouds (repeatable, drift with t)
    ctx.fillStyle = (season === 'winter') ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.75)';
    for (i = 0; i < 7; i++) {
      var cx = ((rnd(i + 200) * 1.3 + t * 0.006 * (0.5 + rnd(i))) % 1.3 - 0.15) * w;
      var cy = h * (0.06 + rnd(i + 210) * 0.3);
      var cr = w * (0.04 + rnd(i + 220) * 0.04);
      ctx.beginPath();
      ctx.ellipse(cx, cy, cr * 1.6, cr * 0.55, 0, 0, TAU);
      ctx.ellipse(cx - cr * 0.6, cy + cr * 0.1, cr * 0.8, cr * 0.5, 0, 0, TAU);
      ctx.ellipse(cx + cr * 0.6, cy + cr * 0.1, cr * 0.9, cr * 0.55, 0, 0, TAU);
      ctx.fill();
    }
    // ambient particles: blossom petals / fireflies / leaves / snow
    for (i = 0; i < 18; i++) {
      var px = ((rnd(i + 300) + t * 0.01 * (season === 'winter' ? 0.5 : 1)) % 1) * w;
      var py = ((rnd(i + 310) + t * 0.02 * (0.4 + rnd(i + 320))) % 1) * groundY;
      var pr = Math.max(1.5, w * 0.004) * (0.6 + rnd(i + 330));
      var pc = season === 'spring' ? 'rgba(255,170,205,0.8)' : season === 'summer' ? 'rgba(255,240,150,0.7)'
             : season === 'autumn' ? 'rgba(220,110,30,0.8)' : 'rgba(255,255,255,0.9)';
      dot(ctx, px, py, pr, pc);
    }
    // distant hills: far (pale) and near (ground colour)
    var hillC = [mix(P.sky, P.ground, 0.45), P.ground];
    for (var layer = 0; layer < 2; layer++) {
      var base = groundY - h * (layer ? 0.035 : 0.075);
      ctx.fillStyle = hillC[layer];
      ctx.beginPath();
      ctx.moveTo(-w, groundY + 4);
      ctx.lineTo(-w, base);
      for (i = -2; i < 20; i++) {
        var hx = (i + rnd(i + 400 + layer * 50) * 0.5) * w * 0.14;
        var hr = w * (0.09 + rnd(i + 410 + layer * 50) * 0.05);
        var hy = base - h * (0.03 + rnd(i + 420 + layer * 50) * 0.04) * (layer ? 0.7 : 1);
        ctx.quadraticCurveTo(hx - hr * 0.5, hy, hx, hy);
        ctx.quadraticCurveTo(hx + hr * 0.5, hy, hx + hr, base);
      }
      ctx.lineTo(w * 3, groundY + 4);
      ctx.closePath();
      ctx.fill();
    }
    // ground band
    var gg = ctx.createLinearGradient(0, groundY, 0, h);
    gg.addColorStop(0, P.ground);
    gg.addColorStop(0.25, mix(P.ground, P.groundDark, 0.4));
    gg.addColorStop(1, P.groundDark);
    ctx.fillStyle = gg;
    ctx.fillRect(0, groundY, w, h - groundY + 2);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(0, groundY, w, Math.max(2, h * 0.006));
    // grass tufts / ground texture
    ctx.lineWidth = Math.max(1, h * 0.002);
    ctx.lineCap = 'round';
    for (i = 0; i < 40; i++) {
      var gx = rnd(i + 500) * w, gy = groundY + h * 0.02 + rnd(i + 510) * (h - groundY - h * 0.03);
      if (season === 'winter' && i % 2) {
        dot(ctx, gx, gy, Math.max(1.5, w * 0.004), 'rgba(255,255,255,0.6)');
      } else {
        ctx.strokeStyle = 'rgba(0,0,0,0.18)';
        ctx.beginPath();
        ctx.moveTo(gx, gy + h * 0.008);
        ctx.quadraticCurveTo(gx - w * 0.004, gy - h * 0.004, gx - w * 0.007, gy - h * 0.012);
        ctx.moveTo(gx, gy + h * 0.008);
        ctx.quadraticCurveTo(gx + w * 0.004, gy - h * 0.005, gx + w * 0.006, gy - h * 0.013);
        ctx.stroke();
      }
    }
    ctx.restore();
  };

  // hex colour mix (a*(1-k) + b*k)
  function mix(a, b, k) {
    function h(c, i) { return parseInt(c.substr(i, 2), 16); }
    var r = Math.round(h(a, 1) * (1 - k) + h(b, 1) * k);
    var g = Math.round(h(a, 3) * (1 - k) + h(b, 3) * k);
    var bl = Math.round(h(a, 5) * (1 - k) + h(b, 5) * k);
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }

  /* =========================================================
     LANDMARKS — drawn ONCE inside the logical field, behind the board.
     ONE orchard tree (grows with progress), a fence, sun (or winter moon).
     ========================================================= */
  S.landmarks = function (ctx, W, H, season, progress, t) {
    t = num(t);
    var p = Math.max(0, Math.min(1, num(progress)));
    var P = pal(season), i;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    /* sun / moon, top right (once) */
    var sx = W * 0.85, sy = H * 0.075, sr = W * 0.075;
    if (season === 'winter') {
      var mg = ctx.createRadialGradient(sx, sy, sr * 0.2, sx, sy, sr * 3);
      mg.addColorStop(0, 'rgba(230,245,255,0.5)');
      mg.addColorStop(1, 'rgba(230,245,255,0)');
      ctx.fillStyle = mg;
      ctx.fillRect(sx - sr * 3, sy - sr * 3, sr * 6, sr * 6);
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, TAU);
      ctx.fillStyle = '#fff7d6';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(sx + sr * 0.45, sy - sr * 0.2, sr * 0.85, 0, TAU);
      ctx.fillStyle = P.sky;
      ctx.fill();
    } else {
      var glow = ctx.createRadialGradient(sx, sy, sr * 0.3, sx, sy, sr * 3.5);
      glow.addColorStop(0, 'rgba(255,240,150,0.85)');
      glow.addColorStop(0.3, 'rgba(255,230,120,0.3)');
      glow.addColorStop(1, 'rgba(255,230,120,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(sx - sr * 3.5, sy - sr * 3.5, sr * 7, sr * 7);
      ctx.strokeStyle = 'rgba(255,235,120,0.55)';
      ctx.lineWidth = sr * 0.18;
      for (i = 0; i < 8; i++) {
        var a = i / 8 * TAU + t * 0.15;
        ctx.beginPath();
        ctx.moveTo(sx + Math.cos(a) * sr * 1.3, sy + Math.sin(a) * sr * 1.3);
        ctx.lineTo(sx + Math.cos(a) * sr * 1.9, sy + Math.sin(a) * sr * 1.9);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, TAU);
      ctx.fillStyle = (season === 'autumn') ? '#ffd35a' : '#fff3a6';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,190,60,0.8)';
      ctx.lineWidth = sr * 0.12;
      ctx.stroke();
    }

    /* fence along the ground line (behind the launcher zone) */
    var fy = H * 0.862, fh = H * 0.05, post = W * 0.024;
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = Math.max(1.5, W * 0.004);
    var rail = ctx.createLinearGradient(0, fy - fh, 0, fy);
    rail.addColorStop(0, '#f1d39a');
    rail.addColorStop(1, '#b57a36');
    ctx.fillStyle = rail;
    rrPath(ctx, -4, fy - fh * 0.85, W + 8, fh * 0.18, 3); ctx.fill(); ctx.stroke();
    rrPath(ctx, -4, fy - fh * 0.42, W + 8, fh * 0.18, 3); ctx.fill(); ctx.stroke();
    for (i = 0; i < 9; i++) {
      var fx = W * (0.03 + i * 0.118);
      var pg = ctx.createLinearGradient(fx, 0, fx + post, 0);
      pg.addColorStop(0, '#f1d39a');
      pg.addColorStop(1, '#a86b2b');
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx, fy - fh);
      ctx.lineTo(fx + post * 0.5, fy - fh * 1.2);
      ctx.lineTo(fx + post, fy - fh);
      ctx.lineTo(fx + post, fy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    /* THE orchard tree, bottom-left, grows with progress */
    var tx = W * 0.12, ty = H * 0.885;
    var trunkH = H * (0.06 + 0.26 * p);
    var trunkW = W * (0.012 + 0.05 * p);
    var canR = W * (0.03 + 0.2 * p);
    var lc = seasonLeaf(season);
    var sway = Math.sin(t * 0.9) * 0.02 * p;
    ctx.save();
    ctx.translate(tx, ty);
    ctx.rotate(sway);
    // roots / trunk
    var bark = ctx.createLinearGradient(-trunkW, 0, trunkW, 0);
    bark.addColorStop(0, '#c9945a');
    bark.addColorStop(0.5, '#8c5a2b');
    bark.addColorStop(1, '#4e2e12');
    ctx.fillStyle = bark;
    ctx.beginPath();
    ctx.moveTo(-trunkW * 1.6, 0);
    ctx.quadraticCurveTo(-trunkW * 0.8, -trunkH * 0.2, -trunkW * 0.7, -trunkH * 0.6);
    ctx.quadraticCurveTo(-trunkW * 0.6, -trunkH * 0.9, -trunkW * 0.3, -trunkH);
    ctx.lineTo(trunkW * 0.3, -trunkH);
    ctx.quadraticCurveTo(trunkW * 0.6, -trunkH * 0.9, trunkW * 0.7, -trunkH * 0.6);
    ctx.quadraticCurveTo(trunkW * 0.8, -trunkH * 0.2, trunkW * 1.6, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = Math.max(1.5, W * 0.005);
    ctx.stroke();
    if (p >= 0.25) {                     // branches
      ctx.lineWidth = Math.max(2, trunkW * 0.5);
      ctx.strokeStyle = '#6b3f1a';
      ctx.beginPath();
      ctx.moveTo(0, -trunkH * 0.75);
      ctx.quadraticCurveTo(-canR * 0.5, -trunkH * 0.9, -canR * 0.75, -trunkH - canR * 0.2);
      ctx.moveTo(0, -trunkH * 0.65);
      ctx.quadraticCurveTo(canR * 0.5, -trunkH * 0.85, canR * 0.75, -trunkH - canR * 0.1);
      ctx.stroke();
    }
    // canopy: sapling = a few leaves, then a leafy mass
    ctx.lineWidth = Math.max(1.5, W * 0.005);
    ctx.strokeStyle = OUTLINE;
    if (p < 0.25) {
      var ls = W * 0.03 + canR;
      leaf(ctx, -ls * 0.6, -trunkH * 0.75, ls * 0.6, ls * 0.28, 0.6, lc[0], lc[1]);
      leaf(ctx, ls * 0.6, -trunkH * 0.9, ls * 0.6, ls * 0.28, -0.6, lc[0], lc[1]);
      leaf(ctx, 0, -trunkH - ls * 0.3, ls * 0.55, ls * 0.25, -1.4, lc[0], lc[1]);
    } else {
      var blobs = [[0, -1.05, 1.0], [-0.75, -0.7, 0.8], [0.75, -0.65, 0.8], [-0.35, -1.35, 0.7], [0.4, -1.4, 0.7], [0, -0.55, 0.75]];
      var canopyC = (season === 'autumn') ? ['#ffb84d', '#c8531c'] : (season === 'winter') ? ['#bfe9e0', '#4f9a8f'] : ['#9be25a', '#3f8f22'];
      for (i = 0; i < blobs.length; i++) {
        var bx = blobs[i][0] * canR, by = -trunkH + blobs[i][1] * canR * 0.9, br = blobs[i][2] * canR;
        var cg = ctx.createRadialGradient(bx - br * 0.3, by - br * 0.35, br * 0.1, bx, by, br);
        cg.addColorStop(0, canopyC[0]);
        cg.addColorStop(1, canopyC[1]);
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, TAU);
        ctx.fillStyle = cg;
        ctx.fill();
        ctx.stroke();
      }
      // blossom stage (0.5..0.75) and fruiting stage (>= 0.75)
      var deco = (p >= 0.75) ? 'fruit' : (p >= 0.5) ? 'blossom' : null;
      if (deco) {
        var fruitC = (season === 'spring') ? FC.cherry : (season === 'summer') ? FC.orange
                   : (season === 'autumn') ? FC.pomegranate : FC.lemon;
        for (i = 0; i < 11; i++) {
          var a2 = rnd(i + 600) * TAU, rr = rnd(i + 610) * canR * 1.1;
          var dx = Math.cos(a2) * rr, dy = -trunkH - canR * 0.9 + Math.sin(a2) * rr * 0.8;
          if (deco === 'blossom') {
            blossom(ctx, dx, dy, canR * 0.11, (season === 'winter') ? '#ffffff' : '#ffd1e6', '#ff8ac0');
          } else {
            ctx.lineWidth = Math.max(1.2, canR * 0.03);
            ctx.strokeStyle = OUTLINE;
            ball(ctx, dx, dy, canR * 0.1, fruitC);
            spec(ctx, dx - canR * 0.035, dy - canR * 0.04, canR * 0.03, canR * 0.02, -0.6, 0.6);
          }
        }
      }
    }
    ctx.restore();
    ctx.restore();
  };

  /* =========================================================
     BOARD FRAME — wooden trellis frame + leafy canopy strip
     (x, y) = top-left of the play grid, w/h = grid size
     ========================================================= */
  S.boardFrame = function (ctx, x, y, w, h, season) {
    var P = pal(season), i, lc = seasonLeaf(season);
    var b = Math.max(8, w * 0.03);           // border thickness
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    // translucent inner backdrop so fruit read against any sky
    rrPath(ctx, x - 2, y - 2, w + 4, h + 4, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // faint lane separators
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 1.5;
    var cols = Math.max(1, Math.round(w / 76));
    for (i = 1; i < cols; i++) {
      ctx.beginPath();
      ctx.moveTo(x + i * w / cols, y + 4);
      ctx.lineTo(x + i * w / cols, y + h - 4);
      ctx.stroke();
    }
    // wooden frame with lattice
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = Math.max(1.5, b * 0.18);
    ctx.save();
    ctx.beginPath();
    rrSub(ctx, x - b, y - b, w + 2 * b, h + 2 * b, b * 0.9);
    rrSub(ctx, x, y, w, h, 4);
    ctx.clip('evenodd');
    var wg = ctx.createLinearGradient(x - b, y - b, x + w + b, y + h + b);
    wg.addColorStop(0, WOOD_HI);
    wg.addColorStop(0.5, WOOD);
    wg.addColorStop(1, WOOD_DK);
    ctx.fillStyle = wg;
    ctx.fillRect(x - b - 2, y - b - 2, w + 2 * b + 4, h + 2 * b + 4);
    ctx.strokeStyle = 'rgba(70,35,10,0.45)';
    ctx.lineWidth = Math.max(1, b * 0.12);
    var step = b * 1.4;
    for (i = -Math.ceil(h / step) - 2; i < Math.ceil((w + 2 * b) / step) + 2; i++) {
      ctx.beginPath();
      ctx.moveTo(x - b + i * step, y - b);
      ctx.lineTo(x - b + i * step + h + 2 * b, y + h + b);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - b + i * step, y + h + b);
      ctx.lineTo(x - b + i * step + h + 2 * b, y - b);
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = Math.max(1.5, b * 0.18);
    rrPath(ctx, x - b, y - b, w + 2 * b, h + 2 * b, b * 0.9);
    ctx.stroke();
    rrPath(ctx, x, y, w, h, 4);
    ctx.stroke();
    // corner blocks
    var cs = b * 1.6;
    var corners = [[x - b, y - b], [x + w + b - cs, y - b], [x - b, y + h + b - cs], [x + w + b - cs, y + h + b - cs]];
    for (i = 0; i < 4; i++) {
      rrPath(ctx, corners[i][0], corners[i][1], cs, cs, cs * 0.25);
      ctx.fillStyle = WOOD_DK;
      ctx.fill();
      ctx.stroke();
      dot(ctx, corners[i][0] + cs / 2, corners[i][1] + cs / 2, cs * 0.16, WOOD_HI);
    }
    // canopy strip across the top: leafy scallops with season deco.
    // CLIPPED to the band [y - 0.7b, y + 4] so it never reaches the HUD band
    // above (the HUD ends at y - 8 for the 76 px grid: 118) and never spills
    // onto the row-0 tiles below (tile tops start at y + 7).
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - b - 2, y - b * 0.7, w + 2 * b + 4, b * 0.7 + 4);
    ctx.clip();
    var cy = y - b * 0.15, n = Math.max(4, Math.round(w / 34));
    for (i = 0; i <= n; i++) {
      var lx = x - b + (w + 2 * b) * i / n;
      var lr = b * (0.95 + 0.4 * rnd(i + 700));
      var cg = ctx.createRadialGradient(lx - lr * 0.3, cy - lr * 0.4, lr * 0.1, lx, cy, lr);
      cg.addColorStop(0, (season === 'autumn') ? '#ffc24d' : (season === 'winter') ? '#d8f7f2' : '#9be25a');
      cg.addColorStop(1, (season === 'autumn') ? '#c8531c' : (season === 'winter') ? '#4f9a8f' : '#2f8a22');
      ctx.beginPath();
      ctx.arc(lx, cy, lr, 0, TAU);
      ctx.fillStyle = cg;
      ctx.fill();
      ctx.lineWidth = Math.max(1.2, b * 0.14);
      ctx.stroke();
    }
    for (i = 0; i < n; i += 2) {
      var dx = x - b + (w + 2 * b) * (i + 0.5) / n, dy = cy - b * 0.1;
      if (season === 'spring') { blossom(ctx, dx, dy, b * 0.38, lc[0], lc[1]); }
      else if (season === 'winter') { dot(ctx, dx, dy, b * 0.25, '#ffffff'); }
      else { ctx.lineWidth = Math.max(1, b * 0.1); ball(ctx, dx, dy, b * 0.28, (season === 'summer') ? FC.orange : FC.pomegranate); }
    }
    ctx.restore();   // canopy clip
    ctx.restore();
  };

  /* =========================================================
     SPROUT — the apprentice. size = character height.
     stage 0..3 (bigger, more confident), mood idle|aim|cheer|sad
     ========================================================= */
  S.sprout = function (ctx, x, y, size, stage, mood, t) {
    t = num(t);
    size = num(size, 120);
    stage = Math.max(0, Math.min(3, Math.round(num(stage))));
    mood = mood || 'idle';
    var sc = 0.86 + stage * 0.06;
    var bob = 0, lean = 0, armL, armR, headTilt = 0, i;
    if (mood === 'cheer') { bob = -Math.abs(Math.sin(t * 9)) * 0.06; armL = -2.6; armR = 2.6; }
    else if (mood === 'aim') { bob = Math.sin(t * 3) * 0.008; lean = -0.12; armL = -0.4; armR = 2.2; }
    else if (mood === 'sad') { bob = Math.sin(t * 1.5) * 0.006 + 0.02; lean = 0.08; armL = -0.15; armR = 0.15; headTilt = 0.18; }
    else { bob = Math.sin(t * 2.5) * 0.012; armL = -0.35 + Math.sin(t * 2.5) * 0.05; armR = 0.35 - Math.sin(t * 2.5) * 0.05; }
    var confidence = stage * 0.08;       // wider stance, chest out with stage
    enter(ctx, x, y, size, 0.035);
    dropShadow(ctx, 0, 0.5, 0.3 * sc, 0.06, 0.28);
    ctx.translate(0, 0.5);                // pivot at the feet
    ctx.scale(sc, sc);
    ctx.rotate(lean);
    ctx.translate(0, bob - 0.5);
    ctx.lineWidth = 0.035;
    ctx.strokeStyle = OUTLINE;

    // legs + boots
    var stance = 0.07 + confidence * 0.3;
    for (i = -1; i <= 1; i += 2) {
      rrPath(ctx, i * stance - 0.06, 0.28, 0.12, 0.16, 0.03);
      ctx.fillStyle = '#4a6fbf';
      ctx.fill(); ctx.stroke();
      rrPath(ctx, i * stance - 0.085, 0.4, 0.17, 0.09, 0.04);
      ctx.fillStyle = '#6b4a2a';
      ctx.fill(); ctx.stroke();
    }
    // basket at the left hip (signature prop)
    basket(ctx, -0.27, 0.27, 0.16, t);
    // arms (behind body when down)
    function arm(ax, ang) {
      ctx.save();
      ctx.translate(ax, 0.06);
      ctx.rotate(ang);
      rrPath(ctx, -0.04, 0, 0.08, 0.2, 0.04);
      ctx.fillStyle = '#4a7bd0';
      ctx.fill(); ctx.stroke();
      dot(ctx, 0, 0.21, 0.05, SKIN);
      ctx.beginPath(); ctx.arc(0, 0.21, 0.05, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    var armsFront = (mood === 'aim' || mood === 'cheer');
    if (!armsFront) { arm(-0.16, armL); arm(0.16, armR); }
    // body: overalls
    rrPath(ctx, -0.19 - confidence * 0.1, -0.06, 0.38 + confidence * 0.2, 0.38, 0.08);
    var og = ctx.createLinearGradient(-0.2, 0, 0.2, 0);
    og.addColorStop(0, '#6a9de8');
    og.addColorStop(1, '#2f5fb4');
    ctx.fillStyle = og;
    ctx.fill(); ctx.stroke();
    // apron with pockets
    rrPath(ctx, -0.15, 0.04, 0.3, 0.26, 0.05);
    ctx.fillStyle = '#efd9a6';
    ctx.fill(); ctx.stroke();
    rrPath(ctx, -0.12, 0.14, 0.1, 0.09, 0.02); ctx.fillStyle = '#d9bd86'; ctx.fill(); ctx.stroke();
    rrPath(ctx, 0.02, 0.14, 0.1, 0.09, 0.02); ctx.fillStyle = '#d9bd86'; ctx.fill(); ctx.stroke();
    // bib + straps
    rrPath(ctx, -0.1, -0.12, 0.2, 0.14, 0.03);
    ctx.fillStyle = '#4a7bd0';
    ctx.fill(); ctx.stroke();
    ctx.lineWidth = 0.05; ctx.strokeStyle = OUTLINE;
    ctx.beginPath(); ctx.moveTo(-0.08, -0.1); ctx.lineTo(-0.12, -0.2); ctx.moveTo(0.08, -0.1); ctx.lineTo(0.12, -0.2); ctx.stroke();
    ctx.lineWidth = 0.025; ctx.strokeStyle = '#6a9de8';
    ctx.beginPath(); ctx.moveTo(-0.08, -0.1); ctx.lineTo(-0.12, -0.2); ctx.moveTo(0.08, -0.1); ctx.lineTo(0.12, -0.2); ctx.stroke();
    ctx.lineWidth = 0.035; ctx.strokeStyle = OUTLINE;
    // stage badges: one gold button per stage on the bib
    for (i = 0; i < stage; i++) {
      dot(ctx, -0.06 + i * 0.04, -0.05, 0.02, '#ffd23f');
      ctx.beginPath(); ctx.arc(-0.06 + i * 0.04, -0.05, 0.02, 0, TAU); ctx.lineWidth = 0.012; ctx.stroke();
    }
    ctx.lineWidth = 0.035;
    if (armsFront) { arm(-0.16, armL); arm(0.16, armR); }
    // head
    ctx.save();
    ctx.translate(0, -0.26);
    ctx.rotate(headTilt);
    // hair bob under the hat
    rrPath(ctx, -0.2, -0.12, 0.4, 0.26, 0.12);
    ctx.fillStyle = '#7a4a1a';
    ctx.fill(); ctx.stroke();
    // face
    ctx.beginPath();
    ctx.ellipse(0, 0.0, 0.17, 0.16, 0, 0, TAU);
    var fg = ctx.createRadialGradient(-0.05, -0.05, 0.02, 0, 0, 0.18);
    fg.addColorStop(0, '#ffe0c2');
    fg.addColorStop(1, SKIN_DK);
    ctx.fillStyle = fg;
    ctx.fill(); ctx.stroke();
    // cheeks
    dot(ctx, -0.1, 0.05, 0.035, 'rgba(255,120,140,0.5)');
    dot(ctx, 0.1, 0.05, 0.035, 'rgba(255,120,140,0.5)');
    // eyes
    if (mood === 'cheer') {
      ctx.lineWidth = 0.03;
      ctx.beginPath(); ctx.arc(-0.065, 0.0, 0.035, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
      ctx.beginPath(); ctx.arc(0.065, 0.0, 0.035, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    } else {
      var blink = (Math.sin(t * 1.3) > 0.97) ? 0.3 : 1;
      for (i = -1; i <= 1; i += 2) {
        ctx.beginPath();
        ctx.ellipse(i * 0.065, -0.005, 0.03, 0.04 * blink, 0, 0, TAU);
        ctx.fillStyle = '#2a1608';
        ctx.fill();
        if (blink === 1) { dot(ctx, i * 0.065 - 0.01, -0.02, 0.012, '#ffffff'); }
      }
      if (mood === 'sad') {
        ctx.lineWidth = 0.025;
        ctx.beginPath(); ctx.moveTo(-0.1, -0.06); ctx.lineTo(-0.035, -0.04); ctx.moveTo(0.1, -0.06); ctx.lineTo(0.035, -0.04); ctx.stroke();
        dot(ctx, 0.1, 0.06 + (t % 1) * 0.06, 0.018, '#7ad0ff');
      } else if (mood === 'aim') {
        ctx.lineWidth = 0.025;
        ctx.beginPath(); ctx.moveTo(-0.1, -0.05); ctx.lineTo(-0.035, -0.055); ctx.moveTo(0.1, -0.05); ctx.lineTo(0.035, -0.055); ctx.stroke();
      }
    }
    // mouth
    ctx.lineWidth = 0.025;
    ctx.beginPath();
    if (mood === 'cheer') {
      ctx.arc(0, 0.05, 0.055, 0.1, Math.PI - 0.1);
      ctx.fillStyle = '#c0392b'; ctx.fill();
    } else if (mood === 'sad') {
      ctx.arc(0, 0.11, 0.04, Math.PI + 0.3, TAU - 0.3);
    } else if (mood === 'aim') {
      ctx.moveTo(-0.03, 0.07); ctx.lineTo(0.04, 0.065);
    } else {
      ctx.arc(0, 0.04, 0.045, 0.3, Math.PI - 0.3);
    }
    ctx.stroke();
    // sun hat: brim + dome + season-free band
    ctx.lineWidth = 0.035;
    ctx.beginPath();
    ctx.ellipse(0, -0.12, 0.3, 0.075, 0, 0, TAU);
    var hg = ctx.createLinearGradient(-0.3, 0, 0.3, 0);
    hg.addColorStop(0, '#ffe08a');
    hg.addColorStop(1, '#d9a63c');
    ctx.fillStyle = hg;
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-0.17, -0.13);
    ctx.bezierCurveTo(-0.17, -0.34, 0.17, -0.34, 0.17, -0.13);
    ctx.closePath();
    ctx.fillStyle = '#f3cf6b';
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-0.165, -0.16);
    ctx.quadraticCurveTo(0, -0.21, 0.165, -0.16);
    ctx.lineWidth = 0.04;
    ctx.strokeStyle = '#e0563f';
    ctx.stroke();
    // a little sprout leaf poking from the hat band (name motif)
    ctx.lineWidth = 0.025; ctx.strokeStyle = OUTLINE;
    leaf(ctx, 0.14, -0.22, 0.05, 0.025, -0.9, '#9be25a', '#3f8f22');
    ctx.restore();
    ctx.restore();
  };

  // small wicker seed basket (unit-ish): r = half width
  function basket(ctx, x, y, r, t) {
    ctx.save();
    ctx.translate(x, y);
    ctx.lineWidth = 0.03;
    ctx.strokeStyle = OUTLINE;
    ctx.beginPath();
    ctx.moveTo(-r, -r * 0.5);
    ctx.lineTo(r, -r * 0.5);
    ctx.lineTo(r * 0.75, r * 0.6);
    ctx.lineTo(-r * 0.75, r * 0.6);
    ctx.closePath();
    var g = ctx.createLinearGradient(-r, 0, r, 0);
    g.addColorStop(0, '#e2b06a');
    g.addColorStop(1, '#8f5a26');
    ctx.fillStyle = g;
    ctx.fill(); ctx.stroke();
    ctx.lineWidth = 0.012;
    ctx.strokeStyle = 'rgba(60,30,5,0.5)';
    ctx.beginPath();
    ctx.moveTo(-r * 0.9, -r * 0.1); ctx.lineTo(r * 0.9, -r * 0.1);
    ctx.moveTo(-r * 0.82, r * 0.25); ctx.lineTo(r * 0.82, r * 0.25);
    ctx.stroke();
    // handle
    ctx.lineWidth = 0.03; ctx.strokeStyle = OUTLINE;
    ctx.beginPath(); ctx.arc(0, -r * 0.5, r * 0.75, Math.PI, TAU); ctx.stroke();
    ctx.lineWidth = 0.014; ctx.strokeStyle = '#e2b06a';
    ctx.beginPath(); ctx.arc(0, -r * 0.5, r * 0.75, Math.PI, TAU); ctx.stroke();
    // seeds / fruit peeking
    ctx.lineWidth = 0.02; ctx.strokeStyle = OUTLINE;
    ball(ctx, -r * 0.4, -r * 0.55, r * 0.22, FC.cherry);
    ball(ctx, r * 0.25, -r * 0.6, r * 0.22, FC.lemon);
    ball(ctx, -r * 0.05, -r * 0.45, r * 0.2, FC.grape);
    ctx.restore();
  }

  /* =========================================================
     LAUNCHER — basket cradle on a slingshot fork. (x, y) = centre,
     w = width. heldType drawn in the cradle; locked = greyed + wobble.
     ========================================================= */
  S.launcher = function (ctx, x, y, w, heldType, locked, t) {
    t = num(t);
    w = num(w, 120);
    ctx.save();
    ctx.translate(x + (locked ? Math.sin(t * 28) * w * 0.02 : 0), y);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = Math.max(1.5, w * 0.03);
    var u = w / 100, i;                    // 1u = 1% of width
    dropShadow(ctx, 0, 30 * u, 48 * u, 8 * u, 0.28);
    // fork posts + elastic band (behind)
    for (i = -1; i <= 1; i += 2) {
      var pg = ctx.createLinearGradient(i * 40 * u, 0, i * 48 * u, 0);
      pg.addColorStop(0, WOOD_HI);
      pg.addColorStop(1, WOOD_DK);
      ctx.fillStyle = pg;
      rrPath(ctx, i * 46 * u - 5 * u, -22 * u, 10 * u, 50 * u, 4 * u);
      ctx.fill(); ctx.stroke();
      dot(ctx, i * 46 * u, -20 * u, 4 * u, '#e0563f');
    }
    ctx.strokeStyle = '#c0392b';
    ctx.lineWidth = Math.max(2, w * 0.045);
    ctx.beginPath();
    ctx.moveTo(-46 * u, -20 * u);
    ctx.quadraticCurveTo(-30 * u, 2 * u, -22 * u, 4 * u);
    ctx.moveTo(46 * u, -20 * u);
    ctx.quadraticCurveTo(30 * u, 2 * u, 22 * u, 4 * u);
    ctx.stroke();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = Math.max(1.5, w * 0.03);
    // basket back
    var bg = ctx.createLinearGradient(-30 * u, 0, 30 * u, 0);
    bg.addColorStop(0, '#e2b06a');
    bg.addColorStop(1, '#8f5a26');
    ctx.beginPath();
    ctx.ellipse(0, -6 * u, 30 * u, 9 * u, 0, 0, TAU);
    ctx.fillStyle = '#5a3416';
    ctx.fill(); ctx.stroke();
    // held fruit
    if (heldType) {
      S.fruit(ctx, heldType, 0, -18 * u, 46 * u, t);
    }
    // basket front (over the fruit)
    ctx.beginPath();
    ctx.moveTo(-30 * u, -6 * u);
    ctx.bezierCurveTo(-30 * u, 24 * u, 30 * u, 24 * u, 30 * u, -6 * u);
    ctx.bezierCurveTo(30 * u, 6 * u, -30 * u, 6 * u, -30 * u, -6 * u);
    ctx.closePath();
    ctx.fillStyle = bg;
    ctx.fill(); ctx.stroke();
    ctx.save();
    ctx.clip();
    ctx.lineWidth = Math.max(1, w * 0.012);
    ctx.strokeStyle = 'rgba(60,30,5,0.45)';
    for (i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(-32 * u, 0 + i * 5 * u);
      ctx.quadraticCurveTo(0, 8 * u + i * 5 * u, 32 * u, 0 + i * 5 * u);
      ctx.stroke();
    }
    for (i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 11 * u, -2 * u);
      ctx.lineTo(i * 9 * u, 24 * u);
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.ellipse(-14 * u, 2 * u, 9 * u, 2.5 * u, 0.15, 0, TAU);
    ctx.fill();
    if (locked) {
      // grey veil over the whole cradle + a small "wait" clock badge
      ctx.fillStyle = 'rgba(110,110,125,0.55)';
      rrPath(ctx, -52 * u, -48 * u, 104 * u, 76 * u, 12 * u);
      ctx.fill();
      dot(ctx, 34 * u, -34 * u, 9 * u, '#f4f4f4');
      ctx.beginPath(); ctx.arc(34 * u, -34 * u, 9 * u, 0, TAU); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(34 * u, -34 * u); ctx.lineTo(34 * u, -40 * u);
      ctx.moveTo(34 * u, -34 * u); ctx.lineTo(38 * u, -32 * u);
      ctx.stroke();
    }
    ctx.restore();
  };

  /* =========================================================
     MONKEY — banana power-up sweeper. size = height. Faces RIGHT.
     ========================================================= */
  S.monkey = function (ctx, x, y, size, t) {
    t = num(t);
    size = num(size, 70);
    enter(ctx, x, y, size, 0.04);
    var run = Math.sin(t * 14), i;
    var fur = { main: '#a0632b', dark: '#5c3311', shine: '#d99a5a' };
    dropShadow(ctx, 0, 0.48, 0.3, 0.06, 0.25);
    // tail
    ctx.lineWidth = 0.09; ctx.strokeStyle = OUTLINE;
    ctx.beginPath();
    ctx.moveTo(-0.2, 0.15);
    ctx.quadraticCurveTo(-0.5, 0.05 + run * 0.05, -0.42, -0.3 + run * 0.05);
    ctx.stroke();
    ctx.lineWidth = 0.05; ctx.strokeStyle = fur.main;
    ctx.stroke();
    ctx.lineWidth = 0.04; ctx.strokeStyle = OUTLINE;
    // legs
    for (i = -1; i <= 1; i += 2) {
      ctx.save();
      ctx.translate(i * 0.1, 0.25);
      ctx.rotate(i * run * 0.5);
      rrPath(ctx, -0.06, 0, 0.12, 0.22, 0.06);
      ctx.fillStyle = fur.main; ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    // body
    ball(ctx, 0, 0.12, 0.27, fur);
    ctx.beginPath(); ctx.ellipse(0, 0.16, 0.15, 0.18, 0, 0, TAU);
    ctx.fillStyle = '#f2c99a'; ctx.fill();
    // arms: one holds a banana forward
    ctx.save();
    ctx.translate(0.18, 0.05);
    ctx.rotate(-0.9 + run * 0.25);
    rrPath(ctx, -0.05, 0, 0.1, 0.26, 0.05);
    ctx.fillStyle = fur.main; ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.translate(-0.17, 0.06);
    ctx.rotate(0.6 - run * 0.25);
    rrPath(ctx, -0.05, 0, 0.1, 0.24, 0.05);
    ctx.fillStyle = fur.main; ctx.fill(); ctx.stroke();
    ctx.restore();
    // head
    ctx.save();
    ctx.translate(0.05, -0.22);
    ctx.rotate(run * 0.05);
    for (i = -1; i <= 1; i += 2) {
      ball(ctx, i * 0.25, 0.0, 0.09, fur);
      dot(ctx, i * 0.25, 0.0, 0.045, '#f2c99a');
    }
    ball(ctx, 0, 0, 0.24, fur);
    // heart-shaped tan face
    ctx.beginPath();
    ctx.moveTo(0, 0.16);
    ctx.bezierCurveTo(-0.22, 0.08, -0.2, -0.16, -0.08, -0.08);
    ctx.bezierCurveTo(-0.02, -0.14, 0.02, -0.14, 0.08, -0.08);
    ctx.bezierCurveTo(0.2, -0.16, 0.22, 0.08, 0, 0.16);
    ctx.closePath();
    ctx.fillStyle = '#f2c99a'; ctx.fill();
    for (i = -1; i <= 1; i += 2) {
      dot(ctx, i * 0.07, -0.03, 0.035, '#2a1608');
      dot(ctx, i * 0.07 - 0.012, -0.045, 0.012, '#ffffff');
    }
    dot(ctx, -0.02, 0.04, 0.012, '#5c3311');
    dot(ctx, 0.02, 0.04, 0.012, '#5c3311');
    ctx.lineWidth = 0.025;
    ctx.beginPath(); ctx.arc(0, 0.06, 0.06, 0.2, Math.PI - 0.2); ctx.stroke();
    ctx.restore();
    // banana in the forward hand
    ctx.restore();
    S.fruit(ctx, 'banana', x + size * 0.36, y - size * 0.12, size * 0.34, t);
  };

  /* =========================================================
     SPLASH — juice burst, p = 0..1 progress (not time)
     ========================================================= */
  S.splash = function (ctx, x, y, type, p) {
    p = Math.max(0, Math.min(1, num(p)));
    var c = FC[type] || { main: '#ffffff', dark: '#999999', shine: '#ffffff' };
    var R = 42, i;
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = 1 - p * p;
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = OUTLINE;
    ctx.lineJoin = 'round';
    // expanding ring
    ctx.beginPath();
    ctx.arc(0, 0, R * (0.25 + 0.9 * p), 0, TAU);
    ctx.strokeStyle = c.main;
    ctx.lineWidth = Math.max(1, 6 * (1 - p));
    ctx.stroke();
    // droplets: radial, decelerating, shrinking; teardrop shape
    var ease = 1 - (1 - p) * (1 - p);
    for (i = 0; i < 10; i++) {
      var a = i / 10 * TAU + rnd(i + 800) * 0.4;
      var dist = R * (0.2 + ease * (0.8 + rnd(i + 810) * 0.5));
      var dr = (5 + rnd(i + 820) * 4) * (1 - p * 0.7);
      var dx = Math.cos(a) * dist, dy = Math.sin(a) * dist + ease * ease * 14;
      ctx.save();
      ctx.translate(dx, dy);
      ctx.rotate(a + Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(0, -dr * 1.6);
      ctx.quadraticCurveTo(dr, 0, 0, dr);
      ctx.quadraticCurveTo(-dr, 0, 0, -dr * 1.6);
      ctx.closePath();
      ctx.fillStyle = (i % 3 === 0) ? c.dark : c.main;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
      dot(ctx, -dr * 0.3, -dr * 0.3, dr * 0.25, 'rgba(255,255,255,0.8)');
      ctx.restore();
    }
    // centre burst
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.35 * (1 - p), 0, TAU);
    ctx.fillStyle = c.shine;
    ctx.fill();
    ctx.restore();
  };

  /* =========================================================
     HEART / STAR — HUD icons, size = width
     ========================================================= */
  S.heart = function (ctx, x, y, size, filled) {
    size = num(size, 28);
    enter(ctx, x, y, size, 0.07);
    var r = 0.42;
    function path() {
      ctx.beginPath();
      ctx.moveTo(0, r * 1.05);
      ctx.bezierCurveTo(-r * 1.35, r * 0.15, -r * 0.85, -r * 1.0, 0, -r * 0.4);
      ctx.bezierCurveTo(r * 0.85, -r * 1.0, r * 1.35, r * 0.15, 0, r * 1.05);
      ctx.closePath();
    }
    path();
    if (filled) {
      var g = ctx.createRadialGradient(-0.15, -0.2, 0.05, 0, 0.05, 0.6);
      g.addColorStop(0, '#ff8fa3');
      g.addColorStop(0.5, '#ff3b5c');
      g.addColorStop(1, '#a30f2e');
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = 'rgba(60,40,50,0.45)';
    }
    ctx.fill();
    ctx.stroke();
    if (filled) { spec(ctx, -0.18, -0.2, 0.1, 0.06, -0.7, 0.6); }
    ctx.restore();
  };

  S.star = function (ctx, x, y, size, filled) {
    size = num(size, 28);
    enter(ctx, x, y, size, 0.06);
    var i, R = 0.48, r = 0.21;
    ctx.beginPath();
    for (i = 0; i < 10; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 5;
      var rr = (i % 2) ? r : R;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    if (filled) {
      var g = ctx.createRadialGradient(-0.12, -0.15, 0.03, 0, 0.05, 0.55);
      g.addColorStop(0, '#fff3a6');
      g.addColorStop(0.5, '#ffd23f');
      g.addColorStop(1, '#d98b12');
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = 'rgba(60,50,40,0.45)';
    }
    ctx.fill();
    ctx.stroke();
    if (filled) { spec(ctx, -0.12, -0.14, 0.09, 0.05, -0.6, 0.6); }
    ctx.restore();
  };

  /* =========================================================
     UI CHROME — ported from Numbat Patrol v7 (plaque body) with the
     v12 Fredoka label + Deep Navy outline. Button = true pill: r = h/2,
     so end caps are always proportional to height, never stretched.
     ========================================================= */
  S.font = function (size) {
    return 'bold ' + Math.round(num(size, 20)) + 'px Fredoka, "Trebuchet MS", "Segoe UI", Arial, sans-serif';
  };

  // Fredoka text helper. align default 'left' (Numbat drawText convention).
  // outline: falsy = none; true = default dark; string = that colour.
  S.text = function (ctx, txt, x, y, size, color, align, outline) {
    ctx.save();
    ctx.font = S.font(size);
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    if (outline) {
      ctx.lineWidth = Math.max(2, num(size, 20) / 7);
      ctx.strokeStyle = (typeof outline === 'string') ? outline : 'rgba(43,28,15,0.85)';
      ctx.strokeText(String(txt), x, y);
    }
    ctx.fillStyle = color || '#ffffff';
    ctx.fillText(String(txt), x, y);
    ctx.restore();
  };

  function chromeText(ctx, cx, cy, text, fontPx) {
    ctx.save();
    ctx.font = '900 ' + Math.round(fontPx) + 'px Fredoka, "Trebuchet MS", "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = NAVY;
    ctx.lineWidth = Math.max(2, fontPx * 0.16);
    ctx.strokeText(text, cx, cy);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, cx, cy);
    ctx.restore();
  }

  function labelPx(h, s) {
    s = num(s, 1);
    if (s > 4) { return s; }               // absolute px
    return Math.max(8, Math.round(h * 0.5 * (s || 1)));
  }

  // shared plaque body: drop shadow, colour block, dark bottom edge,
  // gloss strip across the top third, outline, bold white label.
  function plaque(ctx, cx, cy, w, h, color, text, fontPx, r, shOff, shBlur) {
    ctx.save();
    ctx.translate(cx, cy);
    var x = -w / 2, y = -h / 2;
    ctx.save();
    ctx.shadowColor = 'rgba(43,33,24,0.4)';
    ctx.shadowBlur = shBlur;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = shOff;
    rrPath(ctx, x, y, w, h, r);
    ctx.fillStyle = color || '#ff7a3d';
    ctx.fill();
    ctx.restore();
    ctx.save();
    rrPath(ctx, x, y, w, h, r);
    ctx.clip();
    ctx.fillStyle = 'rgba(43,33,24,0.24)';         // dimensional bottom edge
    ctx.fillRect(x, y + h * 0.76, w, h * 0.24);
    ctx.fillStyle = 'rgba(255,255,255,0.34)';      // gloss across top third
    rrPath(ctx, x + h * 0.12, y + h * 0.08, w - h * 0.24, h * 0.3, Math.min(r * 0.65, h * 0.15));
    ctx.fill();
    ctx.restore();
    rrPath(ctx, x, y, w, h, r);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = Math.max(1.5, h * 0.05);
    ctx.lineJoin = 'round';
    ctx.stroke();
    if (text) { chromeText(ctx, 0, h * 0.03, String(text), fontPx); }
    ctx.restore();
  }

  // colour-blocked ribbon for callouts (zone banners, "LEVEL CLEAR", ...)
  // with folded ribbon tails behind each end.
  S.banner = function (ctx, cx, cy, w, h, color, text, s) {
    w = num(w, 200); h = num(h, 48);
    color = color || '#ff7a3d';
    ctx.save();
    var tail = h * 0.55;
    ctx.fillStyle = mix(hexOf(color), '#000000', 0.25);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = Math.max(1.5, h * 0.05);
    ctx.lineJoin = 'round';
    var i;
    for (i = -1; i <= 1; i += 2) {
      ctx.beginPath();
      ctx.moveTo(cx + i * (w / 2 - h * 0.2), cy - h * 0.32);
      ctx.lineTo(cx + i * (w / 2 + tail), cy - h * 0.32);
      ctx.lineTo(cx + i * (w / 2 + tail * 0.6), cy + h * 0.08);
      ctx.lineTo(cx + i * (w / 2 + tail), cy + h * 0.48);
      ctx.lineTo(cx + i * (w / 2 - h * 0.2), cy + h * 0.48);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
    plaque(ctx, cx, cy, w, h, color, text, labelPx(h, s), h * 0.22, h * 0.1, h * 0.16);
  };

  // chunky pill button; caps are half-circles of radius h/2 (proportional)
  S.button = function (ctx, cx, cy, w, h, color, text, s) {
    w = num(w, 200); h = num(h, 56);
    plaque(ctx, cx, cy, w, h, color || '#63cf5b', text, labelPx(h, s), h * 0.5, h * 0.18, h * 0.26);
  };

  // rounded glossy HUD panel, (x, y) = top-left
  S.panel = function (ctx, x, y, w, h, color) {
    w = num(w, 120); h = num(h, 40);
    ctx.save();
    var r = Math.min(h * 0.35, 16);
    ctx.save();
    ctx.shadowColor = 'rgba(43,33,24,0.35)';
    ctx.shadowBlur = h * 0.2;
    ctx.shadowOffsetY = h * 0.08;
    rrPath(ctx, x, y, w, h, r);
    ctx.fillStyle = color || 'rgba(51,93,124,0.85)';
    ctx.fill();
    ctx.restore();
    ctx.save();
    rrPath(ctx, x, y, w, h, r);
    ctx.clip();
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(x, y + h * 0.7, w, h * 0.3);
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    rrPath(ctx, x + r * 0.5, y + h * 0.08, w - r, h * 0.32, r * 0.6);
    ctx.fill();
    ctx.restore();
    rrPath(ctx, x, y, w, h, r);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = Math.max(1.5, h * 0.06);
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();
  };

  // best-effort '#rrggbb' from any css colour we are likely to be handed
  function hexOf(c) {
    if (typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c)) { return c; }
    if (typeof c === 'string' && /^#[0-9a-fA-F]{3}$/.test(c)) {
      return '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
    }
    return '#ff7a3d';
  }

})();
