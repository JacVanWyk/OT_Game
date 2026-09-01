# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

**Orchard Toss** (working title) — a portrait, one-handed mobile tile-matching puzzle inspired by Flipull / Plotting (Taito, 1989). The player drags a launcher along the bottom edge and flicks a held fruit upward into a 5-lane board; a fruit that hits a matching fruit clears the contiguous same-type line and fires that fruit's power-up. Host character: **Sprout**, a young orchardist's apprentice. This is Ben's game (concept and design decisions); Jac (this machine's user) owns the prototype build. It is the second of two sibling game concepts — the first, **Numbat Patrol**, lives in `../ben_game_1/`.

**Current state: design phase, no code yet.** The repository contains one file:

- `OrchardToss.md` — the single source of truth for every design decision (fruit/power-up roster, zones, obstacles, art, character, controls, pacing, board layout, lives/scoring, prototype scope, name check). Currently **v3 (2026-09-01)**, with **no open questions remaining**. Read it before any design or implementation work.

The master brainstorm (`Game Concepts.md`) and any reference art live in Ben's "Side Hustles/Games" folder, not here. There is no reference art for Orchard Toss yet — sections 8 and 9 of the design doc are written briefs to work from.

## Design decisions already locked (do not re-litigate)

- **Differentiation is core, not optional** (section 4): physics-driven fruit (rolls, bounces, juice splash on match), a real-trait-tied power-up roster, orchard meta-progression, drag-and-flick controls, and a named host character are all required base features. They exist specifically to distance the game from a US$19 "Fruit Tile Match" Unity template that ships the bare mechanic.
- **Roster** (section 5): exactly 10 fruits, each power-up justified by a real-world trait. Unlock by zone: Spring = cherry (launches in pairs), strawberry (cross radius), apple (row); Summer = watermelon (adjacent splash, any type), grape (whole connected cluster), banana (monkey sweeps a row); Autumn = pomegranate (random tiles), pineapple (breaks one obstacle); Winter = orange (chain into adjacent same-type clusters), lemon (column). Citrus in Winter is deliberate (greenhouse framing).
- **Zones** (section 6): fixed order Spring → Summer → Autumn → Winter, 10/12/14/16 levels = 52 total. Spring is obstacle-free by design (pure tutorial zone).
- **Obstacles** (section 7): fence post/branch = wall, trellis/canopy = ceiling, irrigation pipe/hollow log = vertical-only pipe. From Summer on they are **randomly generated** within per-zone density/type rules, not hand-placed — Jac tunes the generation rules.
- **Controls** (section 12): drag-and-flick, one continuous gesture. The tap-to-select/tap-to-fire alternative ("Scheme A" in the master brainstorm) is explicitly not proceeding.
- **Board/UI** (section 13): portrait; 5 lanes; launcher fixed at the bottom firing upward (Puzzle Bobble feel, not Flipull's side-launch); a next-fruit preview; HUD = countdown timer, remaining-vs-target count, score, hearts, next-fruit.
- **Pacing** (section 11): 30–60 s per level; loss is a **time limit** (not move count); clears add a little time back; a mismatch returns the fruit to hand **plus a brief launch lockout**.
- **Win/lives/scoring** (section 14): a level clears when remaining fruit drops below a target (not full clear); start ~70% full, target ~10% remaining; shared pool of 5 hearts, −1 per failed attempt, refill 1 per 30 min; 1–3 stars based on **time remaining**. All these numbers are prototype starting points to tune once playable — the star time thresholds are the one value still explicitly "to be tuned".
- **Prototype scope** (section 15): build the **full spec at once** (all 10 fruits, all 4 zones), not a vertical slice. Monetisation stub = interstitial ads at **zone transitions only**, never between levels.
- **Name**: "Orchard Toss" is the working title after a light spot check (section 17). Grove Guardian, The Orchardist, and Fruit Flick are ruled out. A full trademark/app-store clearance has NOT been done — confirm before committing.

## Working conventions for `OrchardToss.md`

- Strict version control, same as Numbat Patrol: every substantive change adds a row to **both** the Document Control table (top) and the Changelog (section 20), with date and a one-line summary. Superseded decisions are kept and marked superseded, never deleted.
- Sections carry "(confirmed YYYY-MM-DD)" markers in their headings; keep that pattern when a decision is confirmed or changed.
- Decisions belong to Ben. Record his calls when relayed; do not make them. Fine-tuning that is explicitly delegated to prototyping (star thresholds, fill/target percentages, generation rules) is Jac's to tune.
- Cross-references to `Game Concepts.md` and `NumbatPatrol.md` use their section numbers; keep them accurate if sections are renumbered.

## Implementation: reuse the Numbat Patrol prototype pattern

The design doc mandates (sections 13 and 15) the **same hosted web-prototype approach and the same UI chrome as Numbat Patrol**. When code starts, mirror `../ben_game_1/prototype/` rather than inventing a new stack. Read `../ben_game_1/CLAUDE.md`, `../ben_game_1/prototype/README.md`, and `../ben_game_1/RELEASE_NOTES.md` first. The established pattern:

- **Stack:** a single `index.html` + plain `<script>`-tag JS files (`js/assets_manifest.js` → `js/sprites.js` → `js/assets.js` → `js/game.js`) on one canvas. **No ES modules, no `fetch`** — it must run from `file://` by double-click. Mobile-first, touch-first, later packaged for Android via the `apk_engine` Capacitor/WebView toolchain (`/mnt/c/DEV_TEAM/CLAUDE/apk_engine`).
- **Run locally:** open `prototype/index.html`, or from `prototype/` run `python3 -m http.server` for LAN phone testing. Stop any server you start.
- **Asset pipeline:** master art (1024² renders) in `assets/`; `python3 tools/preprocess_assets.py` alpha-crops/downsizes into `assets/img/` and regenerates `js/assets_manifest.js`; procedural canvas painters stay as the loading/failure fallback and real images install all-or-nothing.
- **Single-file bundle:** `python3 build_bundle.py` packs everything into `dist/<Name>.html` with images embedded as base64 data URIs. It fails loudly on a missing image, a missing/duplicated/out-of-order script anchor, or a data-URI count that differs from the manifest; it never embeds video.
- **Font:** Fredoka Bold (self-hosted woff2, latin subset) loaded via the FontFace API and gated behind an `__assetsReady` flag. Canvas `fillText` does not trigger lazy `@font-face` loads and `document.fonts.check()` is a false green for unknown families — verify with the load promise plus a `measureText` comparison.
- **UI chrome (reuse, do not redesign):** chunky glossy buttons with a highlight strip and drop shadow; bold colour-blocked banners with bold white headline text; `Button.png` scaled 9-slice/aspect-correct, never stretched; live label outline in Deep Navy `#335D7C`. Full spec: `NumbatPatrol.md` section 6 and the "Font and Button Specification" + "Colour Palette Instructions" in section 21. Orchard Toss's **colour palette is its own** (season-specific per section 8); only the chrome language is shared.
- **Headless test hooks:** expose `window.__ready` (sync flag, poll it — never an async wait predicate), a `window.<NS>.game` state object, and a `<NS>.debug.step(seconds)` that advances the game's own clock. Time engine behaviour with `step()`, never wall-clock sleeps. Test with `node ~/.claude/tools/browser-harness/run.mjs <url> --wait "window.__ready" --eval "<expr>" --screenshot out.png`. Gestures (fullscreen, orientation lock) can never be verified headless — assert only the wiring.
- **Hosting:** the authenticated `hosted_apps/` mechanism of `infra_router` — deploying is one plain file copy of `index.html` + `js/` + `assets/img|fonts` into `router-server/hosted_apps/<app-name>/` (relative paths, no `<base>` tag, no restart). Numbat Patrol is at `https://tools-app.net/hosted/numbat-patrol/`; Orchard Toss would follow the same route.
- **Release notes:** keep a `RELEASE_NOTES.md` here, updated after every feature that lands, each entry stating what was verified (headless evidence) and listing the changed files — the Numbat Patrol one is the model.
