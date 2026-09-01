/* =========================================================================
   Orchard Toss - assets.js  (port of Numbat Patrol assets.js, font-only)

   Only job: load Fredoka Bold through the FontFace API. Canvas fillText
   never triggers a lazy @font-face load and document.fonts.check() is a
   false green for unknown families, so the font MUST be loaded explicitly
   and added to document.fonts before the title screen paints.

   Source: (OT.AM_DATA && OT.AM_DATA['Fredoka-Bold']) - a base64 data URI
   injected by build_bundle.py - or the self-hosted file
   assets/fonts/Fredoka-Bold.woff2 when running from the folder.

   Exposes:
     OT.A = { fontReady: bool, fontError: string|null }
     window.__assetsReady = true   when the font RESOLVED (either outcome)

   Script order: config.js -> board.js -> sprites.js -> assets.js -> game.js
   file://-safe: classic script, ES5, no fetch / modules / CDN.
   ========================================================================= */
(function () {
  'use strict';

  window.OT = window.OT || {};
  var OT = window.OT;

  var A = OT.A = { fontReady: false, fontError: null };

  function finish(err) {
    A.fontReady = !err;
    A.fontError = err ? String(err) : null;
    window.__assetsReady = true;
  }

  (function loadFont() {
    var src = (OT.AM_DATA && OT.AM_DATA['Fredoka-Bold']) ||
              'assets/fonts/Fredoka-Bold.woff2';
    try {
      if (window.FontFace && document.fonts) {
        var ff = new FontFace('Fredoka', "url('" + src + "') format('woff2')",
                              { weight: '700' });
        ff.load().then(function (loaded) {
          try { document.fonts.add(loaded); } catch (e) { /* already added */ }
          finish(null);
        }).catch(function (e) { finish(e || 'FontFace load failed'); });
      } else {
        finish('FontFace API unavailable');
      }
    } catch (e) { finish(e); }
  })();

})();
