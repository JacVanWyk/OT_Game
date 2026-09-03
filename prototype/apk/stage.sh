#!/usr/bin/env bash
# Stage ONLY the shipping web files for the Orchard Toss APK.
#
# prototype/ is an authoring directory: it also holds dist/OrchardToss.html (a
# 1.18 MB single-file bundle that duplicates everything below), tools/, tests/,
# assets/screens/ and the master fruit renders in assets/ (~4 MB of 600-820 px
# PNGs that the preprocessor has already downsized into assets/img/). None of
# that belongs in the APK; shipping prototype/ verbatim would roughly triple it.
#
# EVERY list here is a glob, never an explicit filename list. A hand-written list
# silently ships a build without any file added later (that bug cost Numbat Patrol
# a release: stage.sh and build_bundle.py both had a list, both missed two new
# scripts, and the audit of "what was listed" stayed green). The audit below
# checks SET EQUALITY against the source tree and against index.html's own
# <script> tags, so a new file cannot be missed in either direction.
set -euo pipefail

SRC="/mnt/c/DEV_TEAM/CLAUDE/ben_game2/prototype"
DEST="/mnt/c/DEV_TEAM/CLAUDE/apk_engine/apps/orchard-toss/www-stage"

rm -rf "$DEST"
mkdir -p "$DEST/js" "$DEST/assets/img" "$DEST/assets/fonts"

cp "$SRC/index.html"            "$DEST/"
cp "$SRC"/js/*.js               "$DEST/js/"
cp "$SRC"/assets/img/*          "$DEST/assets/img/"
cp "$SRC"/assets/fonts/*.woff2  "$DEST/assets/fonts/"

# ---- audit: fail the build rather than ship a wrong payload -----------------
# The checks live in audit_stage.py so they can be run against a deliberately
# broken stage dir to prove they fail; see RELEASE_NOTES for those controls.
python3 "$(dirname "$0")/audit_stage.py" "$SRC" "$DEST"

echo "staged: $(find "$DEST" -type f | wc -l) files, $(du -sh "$DEST" | cut -f1)"
