#!/usr/bin/env python3
"""Preprocess Ben's fruit renders into game-ready sprites (Orchard Toss).

Port of Numbat Patrol's tools/preprocess_assets.py, reduced to what this
project has: square RGBA clay-style fruit renders dropped into
prototype/assets/<Fruit>.png (600-820 px, transparent background).

- Alpha-crops each render to its visible content (+2 px margin), using a
  thresholded alpha (> 16) so faint glow/shadow halos cannot inflate the frame
- Downscales to MAX_PX on the longer side (tile is 62 logical px; 256 keeps
  DPR-3 phones crisp at ~1/5 the decode cost of the masters)
- Emits prototype/js/assets_manifest.js  (classic script, file://-safe):
      window.OT = window.OT || {};
      OT.AM = { "<fruit type id>": {src, w, h}, ... }
  keyed by the fruit TYPE ID used by OT.Board / OT.S.fruit ('apple', ...),
  so assets.js can look a tile's image up directly by cell.type.

Run:  python3 tools/preprocess_assets.py     (from prototype/)
Idempotent; the master renders in assets/ are never modified.
FAILS LOUDLY (exit 1) on a missing master, a non-RGBA master, a fully
transparent master, or an output that did not shrink to <= MAX_PX.
"""
import json
import os
import re
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.normpath(os.path.join(HERE, '..', 'assets'))
OUT = os.path.join(SRC, 'img')
MANIFEST = os.path.normpath(os.path.join(HERE, '..', 'js', 'assets_manifest.js'))

MAX_PX = 256

# master file stem -> fruit type id (OT.Board / OT.S.fruit / OrchardToss.md s5)
FRUITS = {
    'Apple': 'apple',
    'Banana': 'banana',
    'Cherry': 'cherry',
    'Pineapple': 'pineapple',
    'Strawberry': 'strawberry',
    # completed 2026-09-03 (bridge item J-001, MSG-05): Ben supplied the remaining five renders,
    # so all 10 fruits of the OrchardToss.md s5 roster now have real art and the procedural
    # painters in js/sprites.js become the loading/failure fallback only.
    'Watermelon': 'watermelon',
    'Grape': 'grape',
    'Pomegranate': 'pomegranate',
    'Orange': 'orange',
    'Lemon': 'lemon',
}

# DELIBERATELY NOT IN FRUITS: assets/Coconut.png. Ben's decision, MSG-05 (2026-09-03) - the
# coconut is a tougher-tile mechanic (OT.Board kind 'coconut', never matchable), not an 11th
# fruit in the s5 roster, so it must not get a manifest entry or reach OT.S.fruit. The art is
# kept in assets/ for whenever that mechanic is built. Adding it here would make coconuts
# render as a matchable fruit type; see tests/board_test.js for the rule that they never match.


# Sprout character art (OrchardToss.md s9). Masters are discovered from disk by this
# pattern rather than listed, so a new stage or mood drops in with NO code change:
#     assets/Sprout_Stage<N>_<Mood>.png   ->  OT.AM_SPROUT[<N>][<mood lowercased>]
# Stage is the growth stage 0..3 that game.js passes as `stage` (it passes zoneIndex,
# so 0=Spring .. 3=Winter); mood is one of the four OT.S.sprout draws.
# Ben supplied Stage 3 only on 2026-09-04 (bridge MSG-09); stages 0-2 have no art and
# MUST keep the procedural painter - the design side asked explicitly that they stay
# visibly unfinished rather than silently reuse stage 3's art, so js/assets.js
# delegates per (stage, mood) instead of installing all-or-nothing like the fruit.
SPROUT_RE = re.compile(r'^Sprout_Stage(\d)_([A-Za-z]+)$')
SPROUT_MOODS = ('idle', 'aim', 'cheer', 'sad')   # the moods OT.S.sprout understands
SPROUT_MAX_PX = 512   # drawn at up to ~130 logical px, so 512 covers DPR 3 with headroom


def die(msg):
    print('PREPROCESS FAILED: ' + msg, file=sys.stderr)
    sys.exit(1)


def alpha_crop(im, margin=2):
    bbox = im.getchannel('A').point(lambda a: 255 if a > 16 else 0).getbbox()
    if not bbox:
        return None
    l, t, r, b = bbox
    l = max(0, l - margin); t = max(0, t - margin)
    r = min(im.width, r + margin); b = min(im.height, b + margin)
    return im.crop((l, t, r, b))


def resize_max(im, mx):
    if max(im.size) <= mx:
        return im
    sc = mx / max(im.size)
    return im.resize((max(1, round(im.width * sc)), max(1, round(im.height * sc))),
                     Image.LANCZOS)


def main():
    os.makedirs(OUT, exist_ok=True)
    manifest = {}
    for stem, type_id in sorted(FRUITS.items()):
        src = os.path.join(SRC, stem + '.png')
        if not os.path.exists(src):
            die('master missing: ' + src)
        im = Image.open(src)
        if im.mode != 'RGBA':
            die('%s is %s, expected RGBA with a transparent background' % (src, im.mode))
        cropped = alpha_crop(im)
        if cropped is None:
            die(stem + '.png is fully transparent')
        out = resize_max(cropped, MAX_PX)
        if max(out.size) > MAX_PX:
            die('%s did not shrink to <= %d px (%s)' % (stem, MAX_PX, out.size))
        dst = os.path.join(OUT, stem + '.png')
        out.save(dst, optimize=True)
        manifest[type_id] = {'src': 'assets/img/' + stem + '.png',
                             'w': out.width, 'h': out.height}
        print('%-11s %4dx%-4d -> crop %4dx%-4d -> %3dx%-3d  %6d bytes  %s' % (
            stem, im.width, im.height, cropped.width, cropped.height,
            out.width, out.height, os.path.getsize(dst), os.path.relpath(dst, SRC)))

    # ---- Sprout character art, discovered from disk (see SPROUT_RE above) ----
    sprout = {}
    for fn in sorted(os.listdir(SRC)):
        if not fn.endswith('.png'):
            continue
        m = SPROUT_RE.match(fn[:-4])
        if not m:
            continue
        stage, mood = m.group(1), m.group(2).lower()
        if mood not in SPROUT_MOODS:
            die('%s: mood %r is not one of %s - OT.S.sprout would never ask for it'
                % (fn, mood, list(SPROUT_MOODS)))
        im = Image.open(os.path.join(SRC, fn))
        if im.mode != 'RGBA':
            die('%s is %s, expected RGBA with a transparent background' % (fn, im.mode))
        cropped = alpha_crop(im)
        if cropped is None:
            die(fn + ' is fully transparent')
        out = resize_max(cropped, SPROUT_MAX_PX)
        dst = os.path.join(OUT, fn)
        out.save(dst, optimize=True)
        sprout.setdefault(stage, {})[mood] = {'src': 'assets/img/' + fn,
                                              'w': out.width, 'h': out.height}
        print('%-22s %4dx%-4d -> crop %4dx%-4d -> %3dx%-3d  %6d bytes  %s' % (
            fn[:-4], im.width, im.height, cropped.width, cropped.height,
            out.width, out.height, os.path.getsize(dst), os.path.relpath(dst, SRC)))

    # A partial stage (some moods but not all) would show real art for one mood and the
    # procedural Sprout for another IN THE SAME SCENE, which reads as a rendering bug
    # rather than as unfinished art. Refuse it: ship a stage whole or not at all.
    for stage in sorted(sprout):
        missing = [m for m in SPROUT_MOODS if m not in sprout[stage]]
        if missing:
            die('Sprout stage %s has %s but is missing %s - a stage must supply all four '
                'moods or none, otherwise one scene mixes real and procedural Sprout'
                % (stage, sorted(sprout[stage]), missing))

    with open(MANIFEST, 'w') as f:
        f.write('// GENERATED by tools/preprocess_assets.py - do not edit\n')
        f.write('// OT.AM: real fruit art keyed by fruit type id.\n')
        f.write('// OT.AM_SPROUT: real Sprout art keyed by growth stage then mood.\n')
        f.write('// Anything absent from either map keeps its procedural OT.S painter\n')
        f.write('// (see js/assets.js); Sprout delegates per stage+mood, not all-or-nothing.\n')
        f.write('window.OT = window.OT || {};\n')
        f.write('OT.AM = ' + json.dumps(manifest, indent=1) + ';\n')
        f.write('OT.AM_SPROUT = ' + json.dumps(sprout, indent=1) + ';\n')
    print('manifest: %d fruit entries, sprout stages %s (%d images) -> %s'
          % (len(manifest), sorted(sprout) or 'none',
             sum(len(v) for v in sprout.values()), os.path.relpath(MANIFEST)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
