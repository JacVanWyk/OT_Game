#!/usr/bin/env python3
"""Audit a staged Orchard Toss web payload before it is packed into an APK.

Usage: python3 audit_stage.py <source prototype dir> <staged dir>
Exit 0 = the stage is exactly the runtime payload; exit 1 = it is not, with the
reasons listed. Called by stage.sh, and directly runnable so its checks can be
tested against a deliberately broken stage (see the negative controls in
RELEASE_NOTES).

The checks are SET EQUALITIES, never counts of one extension: a count catches a
missing file but not an extra one, and a count of '*.png' silently ignores a
'.jpg' that the manifest lists. Everything here exists because the equivalent
mistake has actually shipped on the sibling project.
"""
import hashlib
import os
import re
import sys


def names(d):
    return sorted(os.listdir(d)) if os.path.isdir(d) else []


def sha(p):
    with open(p, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


def audit(src, dest):
    fail = []

    # 1. the staged scripts are exactly the source's scripts
    if names(os.path.join(src, 'js')) != names(os.path.join(dest, 'js')):
        fail.append('js/ set mismatch: src=%s staged=%s'
                    % (names(os.path.join(src, 'js')), names(os.path.join(dest, 'js'))))

    # 2. ...and exactly what index.html loads. Catches a script on disk that is
    #    never referenced, and a reference to a script that was not staged.
    index = os.path.join(dest, 'index.html')
    if not os.path.exists(index):
        fail.append('index.html not staged')
    else:
        html = open(index, encoding='utf-8').read()
        referenced = sorted(re.findall(r'<script src="js/([^"]+)"', html))
        if referenced != names(os.path.join(dest, 'js')):
            fail.append('index.html <script> tags %s != staged js %s'
                        % (referenced, names(os.path.join(dest, 'js'))))

    # 3. images: staged == source == what the generated manifest actually names.
    #    The manifest equality is what keeps Coconut.png (deliberately not a
    #    fruit, bridge MSG-05) out of the APK if it is ever copied by mistake.
    if names(os.path.join(src, 'assets/img')) != names(os.path.join(dest, 'assets/img')):
        fail.append('assets/img set mismatch: src=%s staged=%s'
                    % (names(os.path.join(src, 'assets/img')), names(os.path.join(dest, 'assets/img'))))
    manifest = os.path.join(dest, 'js/assets_manifest.js')
    if os.path.exists(manifest):
        man = open(manifest, encoding='utf-8').read()
        man_files = sorted(os.path.basename(p) for p in re.findall(r'"src":\s*"assets/img/([^"]+)"', man))
        if man_files != names(os.path.join(dest, 'assets/img')):
            fail.append('manifest images %s != staged images %s'
                        % (man_files, names(os.path.join(dest, 'assets/img'))))

    # 4. the font the FontFace loader needs
    if not names(os.path.join(dest, 'assets/fonts')):
        fail.append('no font staged (canvas fillText will silently fall back)')

    # 5. every staged byte came from the source unaltered
    for root, _, files in os.walk(dest):
        for f in files:
            d = os.path.join(root, f)
            rel = os.path.relpath(d, dest)
            s = os.path.join(src, rel)
            if not os.path.exists(s):
                fail.append('staged file not in source: ' + rel)
            elif sha(s) != sha(d):
                fail.append('byte mismatch vs source: ' + rel)

    # 6. authoring-only trees that must never reach a user's phone
    for bad in ('dist', 'tools', 'tests', 'assets/screens'):
        if os.path.exists(os.path.join(dest, bad)):
            fail.append('must not be staged: ' + bad)

    return fail


def main():
    if len(sys.argv) != 3:
        print(__doc__.strip().split('\n')[2], file=sys.stderr)
        return 2
    src, dest = sys.argv[1], sys.argv[2]
    fail = audit(src, dest)
    if fail:
        print('STAGE AUDIT FAILED:', file=sys.stderr)
        for f in fail:
            print('  - ' + f, file=sys.stderr)
        return 1
    print('stage audit OK: js=%d img=%d fonts=%d, all byte-identical to source'
          % (len(names(os.path.join(dest, 'js'))),
             len(names(os.path.join(dest, 'assets/img'))),
             len(names(os.path.join(dest, 'assets/fonts')))))
    return 0


if __name__ == '__main__':
    sys.exit(main())
