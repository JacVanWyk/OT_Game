# Orchard Toss

**Orchard Toss** (working title) is Ben's portrait, one-handed mobile tile-matching puzzle,
inspired by Flipull / Plotting (Taito, 1989). You drag a launcher along the bottom edge and
flick a held fruit up into a 5-lane board; hitting a matching fruit clears the contiguous
line and fires that fruit's power-up. Ten fruits across four seasonal zones (52 levels), a
time-limit loss, hearts, stars, and Sprout the apprentice as host. Ben owns the design
(`OrchardToss.md`); Jac owns the prototype and its build/deploy pipeline.

## Current state — prototype v0.2.0 (2026-09-02)

- Full-spec POC: all 10 fruits and power-ups, all 4 zones with generated obstacles from
  Summer on, drag-and-flick controls, timer/hearts/stars, orchard meta-progression.
- Ben's clay-style renders are live for 5 of the 10 fruits (apple, banana, cherry,
  pineapple, strawberry); the other five use the procedural painters until he supplies them.
- Verified headless (52 board checks, 14 browser checks) and deployed login-gated at
  `https://tools-app.net/hosted/orchard-toss/`.

## Where things are

| Path | What |
|---|---|
| `OrchardToss.md` | The design doc — single source of truth for every decision (v3) |
| `prototype/` | The playable web prototype: open `prototype/index.html` (double-click works) |
| `prototype/README.md` | How to run, test, build the bundle and deploy |
| `prototype/ARCHITECTURE.md` | Module contract (`OT.CONFIG`, `OT.Board`, `OT.S`, `OT.game`) |
| `prototype/dist/OrchardToss.html` | Single-file offline bundle (font + art embedded) |
| `prototype/assets/` | Ben's master fruit renders; `assets/img/` is the processed set |
| `RELEASE_NOTES.md` | What each version verified and the QA behind every tuning value |
| `CLAUDE.md` | Working conventions for the Claude Code sessions that build this |

## Quick start (from `prototype/`)

```
node tests/board_test.js          # pure-logic checks
node tests/headless_smoke.mjs     # browser checks (starts/stops its own server)
python3 tools/preprocess_assets.py   # after new art lands in assets/
python3 build_bundle.py           # -> dist/OrchardToss.html
```

Sibling project: **Numbat Patrol** (`JacVanWyk/NP_Game`) — same web-prototype stack and
UI chrome, own palette.
