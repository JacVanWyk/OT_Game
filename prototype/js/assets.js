/* =========================================================================
   Orchard Toss - assets.js  (port of Numbat Patrol assets.js)

   Two jobs, both resolved before window.__assetsReady flips to true:

   1. FONT. Load Fredoka Bold through the FontFace API. Canvas fillText never
      triggers a lazy @font-face load and document.fonts.check() is a false
      green for unknown families, so the font MUST be loaded explicitly and
      added to document.fonts before the title screen paints.

   2. REAL FRUIT ART (v0.2.0). Preload every image listed in
      js/assets_manifest.js (OT.AM, keyed by fruit TYPE ID) and, once EVERY
      image has loaded, swap OT.S.fruit for an image-drawing painter in one
      atomic install. If ANY image fails, the procedural painters are left
      completely untouched (never a half-real board). The override draws the
      image for a type that has one and DELEGATES to the procedural painter
      for the five fruits Ben has not supplied yet, so a Summer+ board mixes
      real and procedural fruit by design until the roster is complete.

   Sources: (OT.AM_DATA && OT.AM_DATA[key]) - base64 data URIs injected by
   build_bundle.py (file://-safe) - else the relative paths in OT.AM /
   assets/fonts/Fredoka-Bold.woff2 when running from the folder.

   Exposes:
     OT.A = { fontReady, fontError,
              status:'loading'|'ready'|'failed', total, loaded, failed:[],
              get(typeId) -> HTMLImageElement|null }
     OT.S._proc = { fruit: <original procedural painter> }   (snapshot taken
              BEFORE any override, so both terminal states are inspectable:
              'ready'  => OT.S.fruit !== OT.S._proc.fruit
              'failed' => OT.S.fruit === OT.S._proc.fruit)
     OT.S.fruitImages = [typeId, ...]   only when status === 'ready'
     window.__assetsReady = true        when font AND images RESOLVED
                                        (either outcome each)

   Script order: assets_manifest.js -> config.js -> board.js -> sprites.js
                 -> assets.js -> game.js
   file://-safe: classic script, ES5, no fetch / modules / CDN (Image()
   with a relative src is fine on file://).
   ========================================================================= */
(function () {
  'use strict';

  window.OT = window.OT || {};
  var OT = window.OT;
  var S = OT.S;
  var AM = OT.AM || {};
  var DATA = OT.AM_DATA || null;

  var names = [];
  for (var k in AM) { if (AM.hasOwnProperty(k) && AM[k] && AM[k].src) { names.push(k); } }

  var IMG = {};   // typeId -> HTMLImageElement (successfully loaded only)

  var A = OT.A = {
    fontReady: false, fontError: null,
    status: 'loading', total: names.length, loaded: 0, failed: [],
    get: function (name) { return IMG[name] || null; }
  };

  /* Snapshot the procedural painter BEFORE any override. */
  if (S && typeof S.fruit === 'function') {
    S._proc = S._proc || {};
    S._proc.fruit = S.fruit;
  }

  var fontSettled = false, imagesSettled = false;
  function maybeFinish() {
    if (fontSettled && imagesSettled) { window.__assetsReady = true; }
  }

  /* ---------------------------------------------------------------- font */
  function finishFont(err) {
    A.fontReady = !err;
    A.fontError = err ? String(err) : null;
    fontSettled = true;
    maybeFinish();
  }

  (function loadFont() {
    var src = (DATA && DATA['Fredoka-Bold']) || 'assets/fonts/Fredoka-Bold.woff2';
    try {
      if (window.FontFace && document.fonts) {
        var ff = new FontFace('Fredoka', "url('" + src + "') format('woff2')",
                              { weight: '700' });
        ff.load().then(function (loaded) {
          try { document.fonts.add(loaded); } catch (e) { /* already added */ }
          finishFont(null);
        }).catch(function (e) { finishFont(e || 'FontFace load failed'); });
      } else {
        finishFont('FontFace API unavailable');
      }
    } catch (e) { finishFont(e); }
  })();

  /* -------------------------------------------------------------- images */
  // Fraction of the painter's `size` that the image's LONGER side occupies.
  // Measured against the procedural painters (body diameter ~0.76*size plus
  // stem/leaf to ~0.85): the clay renders carry their stem/leaf inside the
  // crop, so 0.95 puts their bodies at ~0.74*size - same visual weight.
  var FIT = 0.95;

  function installOverrides() {
    var proc = S._proc.fruit;
    S.fruit = function (ctx, type, x, y, size, t) {
      var img = IMG[type];
      if (!img) { proc(ctx, type, x, y, size, t); return; }
      t = (typeof t === 'number' && isFinite(t)) ? t : 0;
      size = (typeof size === 'number' && isFinite(size) && size > 0) ? size : 60;
      var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
      var sc = FIT * size / Math.max(iw, ih);
      var dw = iw * sc, dh = ih * sc;
      ctx.save();
      ctx.translate(x, y);
      // same drop shadow as the procedural fruit (sprites.js dropShadow in
      // unit space: cx 0.03, cy 0.45, rx 0.34, ry 0.10, alpha 0.22)
      var rx = 0.34 * size, ry = 0.10 * size;
      var g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
      g.addColorStop(0, 'rgba(30,15,5,0.22)');
      g.addColorStop(1, 'rgba(30,15,5,0)');
      ctx.save();
      ctx.translate(0.03 * size, 0.45 * size);
      ctx.scale(1, ry / rx);
      ctx.beginPath();
      ctx.arc(0, 0, rx, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.restore();
      // same idle wobble as the procedural painter
      ctx.rotate(Math.sin(t * 1.6 + type.length) * 0.03);
      ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
    };
    S.fruit.isImage = true;
    S.fruitImages = names.slice();
  }

  var settled = 0, anyFailed = false;
  function onSettled() {
    settled++;
    if (settled < names.length) { return; }
    if (anyFailed || !S || !S._proc || typeof S._proc.fruit !== 'function') {
      A.status = 'failed';
    } else {
      installOverrides();
      A.status = 'ready';
    }
    imagesSettled = true;
    maybeFinish();
  }

  if (names.length === 0) {
    A.status = 'failed';
    imagesSettled = true;
    maybeFinish();
  } else {
    for (var i = 0; i < names.length; i++) {
      (function (name) {
        var img = new Image();
        img.onload = function () {
          if (!(img.naturalWidth > 0 && img.naturalHeight > 0)) {
            anyFailed = true; A.failed.push(name); onSettled(); return;
          }
          IMG[name] = img;
          A.loaded++;
          onSettled();
        };
        img.onerror = function () { anyFailed = true; A.failed.push(name); onSettled(); };
        try {
          img.src = (DATA && DATA[name]) || AM[name].src;
        } catch (e) { anyFailed = true; A.failed.push(name); onSettled(); }
      })(names[i]);
    }
  }

})();
