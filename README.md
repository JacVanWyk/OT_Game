# Orchard Toss

**Orchard Toss** (working title) is Ben's portrait, one-handed mobile tile-matching puzzle,
inspired by Flipull / Plotting (Taito, 1989). You drag a launcher along the bottom edge and
flick a held fruit up into a 5-lane board; hitting a matching fruit clears the contiguous
line and fires that fruit's power-up. Ten fruits across four seasonal zones (52 levels), a
time-limit loss, hearts, stars, and Sprout the apprentice as host. Ben owns the design
(`OrchardToss.md`); Jac owns the prototype and its build/deploy pipeline.

## Current state — prototype v0.3.0 (2026-09-03)

- Full-spec POC: all 10 fruits and power-ups, all 4 zones with generated obstacles from
  Summer on, drag-and-flick controls, timer/hearts/stars, orchard meta-progression.
- Ben's clay-style renders are live for 5 of the 10 fruits (apple, banana, cherry,
  pineapple, strawberry); the other five use the procedural painters until he supplies them.
- v0.3.0 landed Ben's first two decisions from `talk_to_other_claude.md`: difficulty now
  climbs through the zones instead of easing off (J-006), and the banana monkey sweep breaks
  every obstacle in its row as well as clearing it (J-008).
- Verified headless (55 board checks, 14 browser checks) and deployed login-gated at
  `https://tools-app.net/hosted/orchard-toss/`.

## Where things are

| Path | What |
|---|---|
| `OrchardToss.md` | The design doc — single source of truth for every decision (v5) |
| `prototype/` | The playable web prototype: open `prototype/index.html` (double-click works) |
| `prototype/README.md` | How to run, test, build the bundle and deploy |
| `prototype/ARCHITECTURE.md` | Module contract (`OT.CONFIG`, `OT.Board`, `OT.S`, `OT.game`) |
| `prototype/dist/OrchardToss.html` | Single-file offline bundle (font + art embedded) |
| `prototype/assets/` | Ben's master fruit renders; `assets/img/` is the processed set |
| `prototype/tools/sim_players.js` | Player-archetype simulation — every tuning value is measured here, never eyeballed |
| `RELEASE_NOTES.md` | What each version verified and the QA behind every tuning value |
| `CLAUDE.md` | Working conventions for the Claude Code sessions that build this |
| `talk_to_other_claude.md` | Channel between the build Claude and Ben's design Claude (open items + log) |

## Talking to the other Claude

Two Claude instances work on this game and never see each other's conversations: Jac's build
Claude (this prototype, the hosted build, `RELEASE_NOTES.md`) and Ben's design Claude
(`OrchardToss.md`, reference art and asset drops, playtest feedback).
**`talk_to_other_claude.md`** in this folder is the channel between them: open questions in a
table at the top, an append-only message log below. Both sides read it first and update it when
their task is done.

## Quick start (from `prototype/`)

```
node tests/board_test.js          # pure-logic checks
node tests/headless_smoke.mjs     # browser checks (starts/stops its own server)
python3 tools/preprocess_assets.py   # after new art lands in assets/
python3 build_bundle.py           # -> dist/OrchardToss.html
```

Sibling project: **Numbat Patrol** (`JacVanWyk/NP_Game`) — same web-prototype stack and
UI chrome, own palette.
