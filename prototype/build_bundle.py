#!/usr/bin/env python3
"""Pack the Orchard Toss prototype into a single self-contained HTML file.

The prototype/ folder is the authoring format; dist/OrchardToss.html is the
build output (inline scripts, embedded font, no external references) for
distribution via download links / double-click file:// use.
Re-run after any change to index.html, js/*.js, or assets/fonts/*.

Port of Numbat Patrol's build_bundle.py (ben_game_1) for FIVE scripts, in
the load order fixed by ARCHITECTURE.md:

    js/config.js -> js/board.js -> js/sprites.js -> js/assets.js -> js/game.js

The only binary asset is Fredoka Bold (assets/fonts/Fredoka-Bold.woff2). It
is embedded as a base64 data URI in

    OT.AM_DATA = {'Fredoka-Bold': 'data:font/woff2;base64,...'}

injected in its own <script> BEFORE config.js, so assets.js resolves the data
URI instead of the relative woff2 path (file:// forbids fetch; data URIs
sidestep it — the FontFace API accepts a url(data:...) source).

FAILS LOUDLY (exit 1, message naming the problem on stderr) when:
  - index.html or any of the five script files is missing
  - any <script src="js/..."> anchor is missing, duplicated, or out of order
  - index.html carries a <script src> the builder does not know about
  - the font is missing, empty, or not a WOFF2 file
  - any inlined script contains a literal </script> or module/fetch syntax
  - any src= / href= to an external file survives in the output

Usage:
    python3 build_bundle.py                 # writes dist/OrchardToss.html
    python3 build_bundle.py --zip 0.1.0     # ...and dist/OrchardToss_prototype_v0.1.0.zip
                                            # (authoring folder: index.html, js/, assets/fonts/, README.md)
"""
from pathlib import Path
import argparse
import base64
import json
import re
import sys
import zipfile

ROOT = Path(__file__).resolve().parent
DIST = ROOT / "dist"
OUT_NAME = "OrchardToss.html"
ZIP_PREFIX = "OrchardToss_prototype"

SCRIPTS = ["js/config.js", "js/board.js", "js/sprites.js", "js/assets.js", "js/game.js"]
FONT_REL = "assets/fonts/Fredoka-Bold.woff2"
FONT_KEY = "Fredoka-Bold"

# The font is ~16 KB; a bundle past this means something unexpected got embedded.
WARN_BYTES = 2 * 1024 * 1024


def die(msg):
    print(f"BUILD FAILED: {msg}", file=sys.stderr)
    sys.exit(1)


def build(zip_version=None):
    # ---- read sources (fail loudly, by name, if any is missing) ------------
    missing_src = [rel for rel in ["index.html"] + SCRIPTS if not (ROOT / rel).exists()]
    if missing_src:
        die("missing source file(s): " + ", ".join(missing_src))

    html = (ROOT / "index.html").read_text(encoding="utf-8")
    sources = {rel: (ROOT / rel).read_text(encoding="utf-8") for rel in SCRIPTS}

    # ---- font -> OT.AM_DATA data-URI map -------------------------------------
    font_path = ROOT / FONT_REL
    if not font_path.exists():
        die(f"font missing from disk: {font_path}")
    font_bytes = font_path.read_bytes()
    if len(font_bytes) == 0:
        die(f"font file is empty: {font_path}")
    if font_bytes[:4] != b"wOF2":
        die(f"font is not a WOFF2 file (bad magic {font_bytes[:4]!r}): {font_path}")
    am_data = {
        FONT_KEY: "data:font/woff2;base64," + base64.b64encode(font_bytes).decode("ascii")
    }
    am_data_payload = json.dumps(am_data, separators=(",", ":"))
    am_data_script = ("<script>window.OT=window.OT||{};OT.AM_DATA="
                      + am_data_payload + ";</script>")

    # ---- anchor-asserted substitutions, in load order ------------------------
    anchors = [f'<script src="{rel}"></script>' for rel in SCRIPTS]
    last_pos = -1
    for rel, anchor in zip(SCRIPTS, anchors):
        n = html.count(anchor)
        if n == 0:
            die(f"substitution anchor missing from index.html: {anchor!r}")
        if n > 1:
            die(f"anchor not unique in index.html ({n} copies): {anchor!r}")
        pos = html.index(anchor)
        if pos <= last_pos:
            die(f"script tags out of order in index.html at {anchor!r} "
                f"(required order: {' -> '.join(SCRIPTS)})")
        last_pos = pos

    # Any OTHER <script src> in index.html would survive as an external ref.
    all_srcs = re.findall(r'<script\b[^>]*\bsrc\s*=\s*["\']([^"\']+)["\']', html)
    unknown = [s for s in all_srcs if s not in SCRIPTS]
    if unknown:
        die("index.html references script(s) the builder does not inline: "
            + ", ".join(unknown))
    if len(all_srcs) != len(SCRIPTS):
        die(f"index.html has {len(all_srcs)} <script src> tags, expected exactly {len(SCRIPTS)}")

    # ---- inlined scripts must be file://-safe and must not close the tag ----
    for rel, src in sources.items():
        if "</script" in src.lower():
            die(f"{rel} contains a literal </script> — it would end the inlined block early")
        if re.search(r"^\s*(import|export)\s", src, re.MULTILINE):
            die(f"{rel} uses ES-module syntax (import/export) — the game must be plain scripts")
        if re.search(r"\bfetch\s*\(", src):
            die(f"{rel} calls fetch( — forbidden (file:// blocks it)")
    if "</script" in am_data_payload.lower():
        die("AM_DATA payload would close its script tag")

    for rel, anchor in zip(SCRIPTS, anchors):
        inline = "<script>\n" + sources[rel] + "\n</script>"
        if rel == SCRIPTS[0]:
            # AM_DATA must be defined BEFORE config.js (and therefore before assets.js).
            inline = am_data_script + "\n" + inline
        html = html.replace(anchor, inline)

    # ---- no external reference may survive ---------------------------------
    # Scoped to HTML attributes inside a tag so JS like `var src = '...'` or
    # `img.src = '...'` in the inlined scripts is not mistaken for markup.
    survivors = []
    for m in re.finditer(r'<[a-zA-Z][^>]*?\s(src|href)\s*=\s*["\']([^"\']*)["\']', html):
        val = m.group(2).strip()
        if val.startswith("data:") or val.startswith("#") or val.startswith("javascript:"):
            continue
        survivors.append(f"{m.group(1)}={val!r}")
    if survivors:
        die("external reference(s) survived packing: " + ", ".join(survivors[:10]))
    if 'src="js/' in html:
        die("external script reference survived packing")

    n_font = html.count("data:font/woff2;base64,")
    if n_font != 1:
        die(f"bundle has {n_font} embedded font URIs, expected exactly 1")
    if f"OT.AM_DATA=" not in html:
        die("OT.AM_DATA injection missing from output")
    if html.index("OT.AM_DATA=") > html.index(sources[SCRIPTS[0]]):
        die("OT.AM_DATA is not injected before config.js")

    # ---- write ---------------------------------------------------------------
    DIST.mkdir(exist_ok=True)
    out = DIST / OUT_NAME
    out.write_text(html, encoding="utf-8")
    size = out.stat().st_size
    print(f"wrote {out} ({size} bytes, {size / 1e6:.2f} MB, "
          f"{len(SCRIPTS)} inlined scripts, 1 embedded font: {FONT_KEY} {len(font_bytes)} bytes)")
    if size > WARN_BYTES:
        print(f"WARNING: bundle exceeds {WARN_BYTES // (1024 * 1024)} MB "
              f"({size / 1e6:.2f} MB) — something unexpected was embedded", file=sys.stderr)

    # ---- optional versioned zip of the authoring folder ----------------------
    if zip_version:
        if not re.fullmatch(r"[0-9A-Za-z][0-9A-Za-z._-]*", zip_version):
            die(f"bad --zip version {zip_version!r}")
        zpath = DIST / f"{ZIP_PREFIX}_v{zip_version}.zip"
        members = ["index.html"] + SCRIPTS + [FONT_REL]
        if (ROOT / "README.md").exists():
            members.append("README.md")
        with zipfile.ZipFile(zpath, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            for rel in members:
                p = ROOT / rel
                if not p.exists():
                    die(f"zip member missing: {rel}")
                zf.write(p, f"{ZIP_PREFIX}/{rel}")
        # Verify the archive lists exactly what we meant to ship.
        with zipfile.ZipFile(zpath) as zf:
            names = sorted(zf.namelist())
            bad = zf.testzip()
            if bad is not None:
                die(f"zip integrity check failed on {bad}")
        expected = sorted(f"{ZIP_PREFIX}/{rel}" for rel in members)
        if names != expected:
            die(f"zip contents mismatch: {names} != {expected}")
        zsize = zpath.stat().st_size
        print(f"wrote {zpath} ({zsize} bytes, {len(names)} entries)")
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--zip", metavar="VERSION", default=None,
                    help="also write dist/OrchardToss_prototype_v<VERSION>.zip of the authoring folder")
    args = ap.parse_args(argv)
    return build(zip_version=args.zip)


if __name__ == "__main__":
    sys.exit(main())
