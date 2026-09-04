# Orchard Toss — Release Notes

Release notes for the Orchard Toss project (working title). Updated after each
feature that successfully lands, each entry stating what was verified (headless
evidence) and listing the changed files. Design source of truth:
`OrchardToss.md`; module contract: `prototype/ARCHITECTURE.md`. Model:
`../ben_game_1/RELEASE_NOTES.md` (Numbat Patrol).

---

## 2026-09-04 — v0.5.0 — Sprout's first real art (growth stage 3, four moods); stages 0–2 left procedural on purpose and guarded

**STATUS: VERIFIED + DEPLOYED.** Ben's design Claude dropped the first *character*
art (bridge MSG-09): `Sprout_Stage3_Idle/Aim/Cheer/Sad.png`, all at growth stage 3,
alongside `OrchardToss.md` v6. This is the first non-fruit asset, so rule 9's "the
build side adds a pipeline when the first such asset lands" applied for the first
time. Live at **https://tools-app.net/hosted/orchard-toss/** (title screen v0.5.0).

**Live.** `OT.S.sprout` is now image-backed at stage 3, which is the Winter zone
(the game passes the zone index as the stage), so the real Sprout appears from
level 37 on and beside the orchard card on every Winter zone intro and level clear.
All four moods map to states that already existed: idle, aim while a fruit is in
flight, cheer on a clear, sad on a fail.

**Stages 0–2 deliberately keep the procedural painter.** The design side asked
explicitly that the unfinished stages stay visibly unfinished rather than silently
reuse stage 3's render. That is the one instruction worth a guard rather than a
promise, because "point the other stages at the art we already have" is a one-line
change that would look like an improvement:

- The override delegates **per (stage, mood)**, not all-or-nothing like the fruit,
  so real and procedural Sprout can coexist in one session.
- A headless check renders **all 4 stages × 4 moods** and asserts stages 0–2 are
  pixel-identical to the procedural painter while stage 3 differs.
- **Proven able to fail:** pointing stages 0–2 at stage 3's images in a scratch copy
  turned 17 passed into 15 passed / 2 failed, with the injection asserted first.

**Pipeline, designed as the design side invited.** Masters are discovered **by
pattern** — `Sprout_Stage<N>_<Mood>.png` — not from a list, so stages 0–2 will drop
in with **no code change**. Two rules it enforces, both of which exist to stop a
failure that would read as a rendering bug rather than as missing art:

- **All four moods per stage, or none.** A half-supplied stage would show real art
  for idle and procedural for sad *in the same scene*. The preprocessor refuses it
  and names the missing moods.
- **Only moods the game asks for** (idle/aim/cheer/sad). A fifth mood fails loudly
  instead of sitting in the repo doing nothing.

**Design notes.** Images are anchored at the FEET to match the procedural painter's
baseline, so a stage-3 Sprout stands on the same ground line as a stage-0 one; the
per-mood idle motion (bob, cheer bounce) is preserved so the art is not static; and
the contact shadow the procedural painter drew is kept. `SPROUT_FIT` in
`js/assets.js` is the single constant if Ben wants her larger or smaller.

The non-square master (`Sad.png` is 1024×1022, flagged by the design side) needed no
fix: the pipeline alpha-crops to visible content and scales by the longer side, so
canvas size never mattered. The four end up 296–413 × 512.

**Verified:**

- `node tests/headless_smoke.mjs` → **17 passed** (was 15). Two new Sprout checks,
  both proven able to fail.
- **A stale assertion was found and removed while doing this.** The boot check
  asserted `imgTotal === 10`, a hardcoded count that was correct only until the next
  asset landed — it failed the moment Sprout's four images loaded, reporting a
  problem that did not exist. It now derives the expected count from the manifests
  themselves (`OT.AM` + `OT.AM_SPROUT`), so it stays correct as art arrives instead
  of being a number to remember to bump.
- `node tests/board_test.js` → 55/55 unchanged (no logic touched).
- Screenshotted level 52 at 390×844 and ultra-wide to confirm Sprout stands on the
  ground line, is not clipped at the canvas edge, and reads at phone size.
- Bundle 1.18 → **2.02 MB** (14 embedded images); `build_bundle.py` now embeds the
  sprout map too, keyed exactly as `js/assets.js` builds its keys, and its data-URI
  count assertion covers both maps — without that the offline bundle would have
  404'd on the sprout images and dragged *every* image into the all-or-nothing
  failure path.
- Deploy: 7 files written with fsync + read-back, all 22 payload files sha256-equal
  both ways, no host-only files, `diff -rq` clean, anonymous requests 302 to login.

**Not rebuilt:** the Android APK is still the v0.4.0 build. Nothing about Sprout
changes packaging, so it was left alone rather than bumped for its own sake; noted
to Ben in MSG-10 as a two-minute job whenever he wants a refreshed one.

**Changed files:** `prototype/tools/preprocess_assets.py`, `prototype/js/assets.js`,
`prototype/js/assets_manifest.js` (generated), `prototype/js/game.js`
(`GAME_VERSION` 0.5.0), `prototype/build_bundle.py`,
`prototype/tests/headless_smoke.mjs`, `prototype/assets/img/Sprout_Stage3_*.png`
(4 new), `prototype/dist/OrchardToss.html`, `prototype/ARCHITECTURE.md`,
`README.md`, `CLAUDE.md`, `talk_to_other_claude.md`,
`talk_to_other_claude_archive.md`, this file; deployed copy in
`C:\PROD_DB\infra_router\router-server\hosted_apps\orchard-toss\`.

---

## 2026-09-03 — v0.4.0 packaged as an Android APK (first APK for this game)

**STATUS: BUILT + DEPLOYED, NOT YET RUN ON A DEVICE.** Jac: "build an apk for
this using the apk engine". Packaged with the existing `apk_engine` CLI
(Capacitor + Gradle) exactly as Numbat Patrol is. 5.5 MB signed debug APK, live
behind the router login at
**https://tools-app.net/downloads/private/orchard-toss-v0.4.0.apk**.

**The app definition is version-controlled here, not in `apk_engine`.** Numbat
Patrol's lives in `apk_engine/apps/numbat-patrol/`, which is not a git repo, so
its packaging config has no history and Ben cannot see it. Orchard Toss's lives
in `prototype/apk/` (`app.config.json`, `stage.sh`, `audit_stage.py`, `icon.png`)
with `workDir` and the staged payload pointed at `apk_engine/apps/orchard-toss/`,
so the build artefacts stay out of this repo and the config stays reviewable.
A README in that directory points back here.

**Config:** `com.bengame.orchardtoss`, versionName 0.4.0 (kept equal to
`GAME_VERSION`), versionCode 1, **portrait** (the design doc's §13 board is
portrait; Numbat Patrol is landscape), minSdk 22 / target 34, background
`#3b7d4f` to match `index.html` so there is no white flash before first paint.

**Staging is glob-driven and audited.** `stage.sh` copies only the runtime
payload — `index.html`, `js/*.js`, `assets/img/*`, the woff2 — never
`dist/OrchardToss.html` (1.18 MB, a duplicate of everything else), `tools/`,
`tests/`, `assets/screens/` or the 4 MB of master renders. Every list is a glob:
an explicit filename list is exactly what shipped a Numbat Patrol build without
two new scripts while the audit of "what was listed" stayed green.

`audit_stage.py` then fails the build unless the stage is *exactly* the runtime
payload. It is a separate file specifically so it can be run against a broken
stage. **Five negative controls, each asserting its injection actually landed
before trusting the result:**

| Injected defect | Caught by |
|---|---|
| a script silently dropped | js set mismatch + index.html `<script>` tags disagree |
| an unmanifested image staged (Coconut.png) | img set mismatch + manifest disagrees |
| a staged file altered after copy | sha256 mismatch vs source |
| `dist/` staged | must-not-ship list |
| the font missing | no font staged |

All five exited 1. An earlier sixth attempt reported "audit did not catch it",
which was a **broken control, not a passing audit** — the `sed` that was meant to
inject the defect had a delimiter clash and never ran. That is why the injections
are now asserted before the audit's verdict is read.

**APK contents audited by decoding, not by trusting the build.** `assets/public/`
holds exactly 20 files: our 18 (index, 6 scripts, 10 images, 1 font), each
**sha256-identical to the source**, plus Capacitor's own `cordova.js` and
`cordova_plugins.js`. Set equality both ways against the source tree, so a
missing *or* extra file fails. No `dist/`, `tools/`, `tests/` or `screens/`.
`Coconut.png` explicitly absent. `GAME_VERSION` inside the APK reads 0.4.0 and
the embedded manifest has 10 entries. `apksigner verify` passes (v1 + v2).
`aapt dump badging` confirms package, versionCode 1, versionName 0.4.0, label
"Orchard Toss", `android.hardware.screen.portrait`. 26 launcher icon resources,
and the extracted `ic_launcher_round.png` was viewed to confirm it is our icon
rather than the Capacitor default.

**Icon:** Ben has supplied no logo, so it is his apple render on the game's own
sky colour with a grass band and contact shadow. Chosen by measurement, not
taste: the first attempt put the green apple on the game's green ground, which
measured the *worst* contrast of all 11 fruits (72 of a possible 188 by RGB
distance). On the sky it measures 214. The apple is scaled and positioned to sit
inside Android's adaptive-icon safe zone (spans 20.9%–78.9% vertically against a
17%–83% mask), so the stem is not clipped.

**Honest note on permissions.** The config requests none, and the APK still
declares `android.permission.INTERNET`. That comes from **Capacitor's own
template manifest**, and `apkbuild`'s patcher only *adds* requested permissions,
it never removes the template's. The Numbat Patrol APK carries it too, so the
earlier knowledge-base claim that that build ships "zero permissions" was wrong
and has been corrected. It is left in place deliberately: Capacitor serves the
bundled assets over an `https://localhost` scheme handler, so stripping INTERNET
risks a blank screen, and with no Android device attached I cannot verify the
result. Worth revisiting when a device is available. The game itself makes no
network requests — every asset is local and `serverUrl` is empty.

**Device test — CONFIRMED (update, same day).** At build time nothing here proved
the game actually ran on Android, only that the payload was correct and the
package well-formed, and it was raised as **J-015** because no device is attached
to this machine. Jac then installed it on a phone and reported it worked fine, so
the APK boots and plays and the blank-screen risk did not materialise. J-015 is
closed. What was *not* captured is any assessment of how the flick feels under
Android WebView specifically, which handles touch a little differently from mobile
Chrome — still worth a look if anyone installs it again. To install from here when
a device is attached:
`./apkbuild run /mnt/c/DEV_TEAM/CLAUDE/ben_game2/prototype/apk/app.config.json`.

**Rebuilding:** bump `versionName` *and* `versionCode` in `app.config.json`, keep
`versionName` equal to `GAME_VERSION`, then `apkbuild build <config>`. Use
`apkbuild update <config>` for a web-asset-only change (seconds, re-signs with
the same debug key so it installs in place).

**Changed files:** `prototype/apk/app.config.json`, `prototype/apk/stage.sh`,
`prototype/apk/audit_stage.py`, `prototype/apk/icon.png` (all new), `README.md`,
`CLAUDE.md`, `talk_to_other_claude.md`, this file; plus
`apk_engine/apps/orchard-toss/README.md` and the deployed APK at
`C:\PROD_DB\infra_router\downloads\files\private\orchard-toss-v0.4.0.apk`
(neither in this repo).

---

## 2026-09-03 — v0.4.0 — the fruit roster is complete: all 10 fruits in Ben's clay art, coconut deliberately kept out

**STATUS: VERIFIED + DEPLOYED.** Ben supplied the remaining five renders plus a
regenerated pineapple (bridge MSG-05, closing J-001), and closed J-012, J-013 and
J-014 in the same push. Live at **https://tools-app.net/hosted/orchard-toss/**
(title screen v0.4.0).

**All 10 fruits now use real art.** `watermelon`, `grape`, `pomegranate`, `orange`
and `lemon` added to `FRUITS` in `tools/preprocess_assets.py`; the manifest is 10
entries and `OT.S.fruit` is the image painter for every one, so the procedural
painters in `js/sprites.js` are the loading/failure fallback only.

**The pineapple update was real, not a no-op** — the design side flagged it
explicitly and it was worth checking: master 364 472 → 339 502 B with a different
hash, processed output 62 265 → 61 954 B with a different crop.

**Coconut is deliberately NOT wired in.** `assets/Coconut.png` shipped with the
drop, but Ben's decision is that the coconut is the tougher-tile mechanic
(`{kind:'coconut'}`, never matchable), not an 11th fruit in the §5 roster. It has
no `FRUITS` entry, a comment at the dict says why, and a **headless check now
asserts `coconut` is absent from the manifest**, so if that ever changes it fails
loudly instead of drifting in.

**The art negative control had to be rebuilt, and this is the interesting part.**
It previously rendered grape, orange and watermelon — fruits with no art — and
asserted they came out pixel-identical to the procedural painter, which is what
proved the pixel-differ can report zero at all. Ben's drop gave all three of them
art, so that control would have silently become vacuous: still green, no longer
testing anything. It now renders `coconut` and a deliberately bogus type id, which
keeps the "differ can report zero" proof and doubles as the coconut guard.

**Verified:**

- `node tests/headless_smoke.mjs` → **15 passed** (was 14). The art probe covers
  all 10 fruits and asserts the manifest key set equals the roster exactly, so a
  dropped or extra entry fails.
- **Both new checks proven able to fail:** adding `'Coconut': 'coconut'` to
  `FRUITS` in a scratch copy and re-running turned 15 passed into 10 passed /
  4 failed (the roster check, the rebuilt control, the coconut guard, and the boot
  check's image count).
- `node tests/board_test.js` → 55/55 unchanged.
- Render fit: measured through the painter at size 64, all ten land at **59–61 px**
  on the long side, so they carry consistent visual weight. Two silhouettes changed
  from the procedural stand-ins and were flagged to Ben: watermelon was a wedge
  (58 × 39) and is now a whole melon (50 × 60); banana lay flat (57 × 38) and now
  stands upright (59 × 60).
- Bundle 0.67 → **1.18 MB** (10 embedded images, 720 970 B), still boots from
  `file://`.
- Deploy: 8 files written with fsync + read-back, all 18 payload files sha256-equal
  both ways, no host-only files, `diff -rq` clean, anonymous requests to the page,
  the manifest and two new images all 302 to login. Deployed `GAME_VERSION` 0.4.0.

**Bridge:** J-001 confirmed delivered and live per rule 9 in MSG-06; MSG-05
archived under rule 10. Nothing is open on either side.

**Changed files:** `prototype/tools/preprocess_assets.py`,
`prototype/js/assets_manifest.js` (generated), `prototype/js/game.js`
(`GAME_VERSION` 0.4.0), `prototype/tests/headless_smoke.mjs`,
`prototype/assets/img/` (5 new + updated Pineapple),
`prototype/dist/OrchardToss.html`, `prototype/README.md`,
`prototype/ARCHITECTURE.md`, `README.md`, `CLAUDE.md`,
`talk_to_other_claude.md`, `talk_to_other_claude_archive.md`, this file;
deployed copy in `C:\PROD_DB\infra_router\router-server\hosted_apps\orchard-toss\`.

---

## 2026-09-03 — bridge file split: `talk_to_other_claude_archive.md`, and a retention rule so the channel stays readable

**STATUS: LIVE.** Jac's instruction: the bridge file must not be allowed to grow
without bound. After a single round trip it was 288 lines, at which point "read
this file first on every task" stops being a rule anyone can follow.

**Rule 10, added to the file itself**, so both sides follow the same convention
and it happens as part of the task in flight rather than as a tidy-up nobody
schedules. A row moves to the archive once its Status is `Closed` or
`Superseded`; a message moves once a *later message from the other side* exists,
i.e. it has been answered. That second condition is the important one — it
guarantees a message is never archived while the other side still owes it a
reply, so nothing is hidden before it has been read. Anything still needed must
live in a table row, not only in a message body, since the table is the fast
scan. Target: the live file under ~200 lines.

**What moved.** Five closed rows (J-001, J-002, J-006, J-008, J-011), the full
text of the shipped-default rows (J-003, J-005, J-007, J-009, J-010, which are
now one summary line each in the live file), and MSG-01 and MSG-02. All verbatim,
all keeping their original IDs, with one-line stubs left in the log.

**J-004 marked superseded.** It recorded the v0.1.0 time limits and time-back
values, every one of which J-006 replaced in v0.3.0 — so the fast-scan view was
carrying numbers the build no longer uses. Archived, with the live values named
in its place.

**The four flick questions moved from MSG-03 into the J-012 row.** Under the new
rule MSG-03 becomes archivable as soon as the design side replies, and the
questions have to outlive it.

**Verified:** a script checked, across both files, that every one of the 14 row
IDs still resolves to exactly one full row, that the original text of all 11
moved rows and both moved message bodies appears verbatim in the archive, that no
`J-nnn` reference in the live file dangles, and that every markdown table is
column-consistent. Live file 242 lines (MSG-03 is 92 of them and drops out the
moment it is answered), archive 162.

**Changed files:** `talk_to_other_claude.md`, `talk_to_other_claude_archive.md`
(new), `README.md`, `CLAUDE.md`, this file.

---

## 2026-09-03 — v0.3.0 — Ben's first two bridge decisions: difficulty climbs through the zones (J-006), banana breaks obstacles (J-008)

**STATUS: VERIFIED + DEPLOYED.** First release driven by `talk_to_other_claude.md`:
Ben's design Claude answered six open items in MSG-02, and the two that were
build work shipped the same day. Live at
**https://tools-app.net/hosted/orchard-toss/** (title screen reads v0.3.0);
offline bundle `prototype/dist/OrchardToss.html` 671 625 B.

**J-008 — banana is no longer apple with a monkey.** The monkey sweep clears
every tile in the impact row as before AND breaks every wall, trellis and pipe
in that row (`result.broken`, one `burst` cue each). Apple is unchanged and
still breaks nothing; coconuts in the row remain tiles, so they clear through
`result.cleared` and count down `remaining` exactly as they did. Pineapple keeps
its single-obstacle break. Measured 0.43 obstacles broken per banana match under
the sensible policy (0 before the change, on the same tool).

**J-006 — difficulty now climbs; the fix needed a second lever.** Removing the
0.9× easing was not sufficient, for two measured reasons: the design doc's §11
floor is 30 s per level and Autumn already needed 30 s at its last level to
out-pressure Summer, and Winter's boards are *smaller* than Autumn's because its
obstacle load caps capacity (mean initial fruit 22.0 / 23.9 / 24.4 / 21.1 across
the four zones; the last seven Winter levels hold 19). So the limits carry what
the floor allows and a new per-zone multiplier on the time-back bonus carries the
rest:

- `OT.CONFIG.TIME_RAMP` — Spring 45→38, Summer 38→32, Autumn 36→30, Winter 34→30
  (was Spring 45→38 with Summer, Autumn and Winter all 40→32).
- `OT.Board.TUNING.TIME_ZONE_SCALE` — new: Spring 1, Summer 1, Autumn 0.85,
  Winter 0.5, multiplying `result.timeBonus`. Later zones give back less for the
  same clear.

Measured with `node tools/sim_players.js --seeds 40` (10 400 simulated level
attempts) against both source trees, Spring → Summer → Autumn → Winter:

| Metric | v0.2.0 | v0.3.0 |
|---|---|---|
| Casual, % of levels failed | 0.25 / 1.04 / 1.61 / 0.16 | 0.25 / 1.46 / 3.57 / 5.78 |
| Sloppy, % of levels failed | 12.0 / 31.3 / 28.9 / 23.0 | 12.0 / 34.0 / 40.5 / 41.7 |
| Naive, % of clears at 3★ | 73 / 37 / 52 / 57 | 73 / 37 / 32 / 16 |
| Sensible, % of clears at 3★ | 100 / 98 / 97 / 99 | 100 / 98 / 89 / 65 |

Every v0.2.0 figure said Winter was easier than Autumn, which is what Ben
rejected. The sensible player still clears every level (intended — the timer
grades good play rather than blocking it), but its Winter 3-star share falls from
99 % to 65 %, so the J-005 star thresholds finally bite in the late game.

**The simulation is now in the repo.** `prototype/tools/sim_players.js` was a
scratch script during the v0.1.0 QA pass and the numbers in this file could not
be reproduced from a clean checkout. It now ships: five player archetypes over
52 levels × N seeds, the real-clock model (flight, squash, bounces, mismatch
return + lockout, pop/effect/compaction animation, then the time bonus), with
`--time-ramp` and `--bonus-scale` for what-if sweeps and `--json` for the raw
rows. It reads the animation durations out of `js/game.js` and **throws** if one
is renamed rather than silently drifting, and it prints whether difficulty climbs
zone over zone.

**Why the climb criterion excludes one archetype (documented in the tool).** The
"child" archetype (3 s think, 40 % error) saturates near 75–80 % failure and
clears Winter marginally more often than Autumn, because Winter's smaller boards
mean fewer launches — it runs out of board before it runs out of clock. That is a
property of board capacity, not pacing, and tuning it away would over-tighten
Winter for everyone else. It is reported but not gated, and raised with Ben as
J-013.

**Verified:**

- `node tests/board_test.js` → `SUMMARY passed=55 failed=0 errors=0` (was 52).
  Three new checks: the banana sweep breaks every obstacle in its row; the
  zone-climb invariant over `TIME_RAMP` + `TIME_ZONE_SCALE`, written strictly so
  the old "never rises" tuning fails it; and a launch-level check that the
  per-zone scale actually reaches `result.timeBonus`.
- **Negative controls, both run.** The banana test includes an apple fired into
  the identical board asserting all three obstacles survive. All three new checks
  were re-run against the pre-change sources (`git show HEAD:` copies) and fail
  there — 53 passed / 2 failed for the tuning pair, 52 / 1 for banana — so none
  of them can pass by accident.
- `node tests/headless_smoke.mjs` → 14 passed, server killed by pid, port free.
- Deploy: 3 changed files written in place with fsync + read-back assertion
  (`js/board.js`, `js/config.js`, `js/game.js`), all 13 payload files sha256-equal
  source vs host both ways, no host-only files, `diff -rq` clean. Anonymous
  requests to the page, `js/game.js` and `assets/img/Apple.png` all 302 to
  `/login?next=…`. Deployed `GAME_VERSION` reads 0.3.0.

**Raised back to the design side (MSG-03):** J-013 (Winter's boards are the
smallest in the game — deliberate dense obstacle course, or should they be as
full as Autumn's?) and J-014 (time pressure was retuned under J-006, so Ben's
J-012 note about it needs a re-play on v0.3.0 before we act). The flick half of
J-012 was deliberately **not** touched — the two readings of "flick feels wrong"
point at opposite fixes, so MSG-03 asks four narrow questions instead of guessing.

**Changed files:** `prototype/js/board.js`, `prototype/js/config.js`,
`prototype/js/game.js` (`GAME_VERSION` 0.3.0), `prototype/tests/board_test.js`,
`prototype/tools/sim_players.js` (new), `prototype/dist/OrchardToss.html`,
`prototype/README.md`, `prototype/ARCHITECTURE.md`, `README.md`, `CLAUDE.md`,
`talk_to_other_claude.md`, this file; deployed copy in
`C:\PROD_DB\infra_router\router-server\hosted_apps\orchard-toss\`.

---

## 2026-09-03 — `talk_to_other_claude.md` — direct channel between the build and design Claudes; v0.2.0 version label fixed

**STATUS: LIVE.** New file at the repo root, requested by Jac ("like you did for Numbat
Patrol"). Jac's build Claude and Ben's design Claude never see each other's conversations;
this file carries what each needs the other to know. It adopts the rules the two Numbat Patrol
Claudes agreed on 2026-09-03 (2a: the design side relays Ben's decisions only, never decides;
2b: the build side ships sensible defaults and flags them; 8: a decision that changes
`OrchardToss.md` gets a Document Control + Changelog row, written by the design side; 9: asset
drops are logged and the build side replies when the asset is live), with this project's
paths and pipeline riders (`prototype/assets/<Fruit>.png` masters, `FRUITS` in
`tools/preprocess_assets.py`, no pipeline entry yet for non-fruit art). An "Open items" table
at the top is the fast scan — 12 rows seeded from the v0.1.0/v0.2.0 "For Ben to decide"
findings: the remaining five fruit renders (J-001), non-fruit art (J-002), tile fit (J-003),
time limits and time-back (J-004), star thresholds (J-005), zone difficulty (J-006), the
cherry twin (J-007), banana = apple (J-008), hand rescue (J-009), the board-model decisions
(J-010), name clearance (J-011) and a real-device playtest (J-012). Below it is an append-only
message log with `MSG-nn` entries; MSG-01 is the build state as of v0.2.0.

**Also fixed:** `GAME_VERSION` in `js/game.js` had been left at `0.1.0` through the v0.2.0 art
drop, so the hosted title screen read `v0.1.0`. Bumped to `0.2.0`, bundle rebuilt
(669 435 bytes, unchanged size), `node tests/board_test.js` 52/52, `node tests/headless_smoke.mjs`
**14 passed, 0 failed, 0 errors** (its server killed by pid, port confirmed free), `js/game.js`
copied to `hosted_apps/orchard-toss/` and the whole deploy re-diffed byte-identical; anonymous
requests to the page, `js/game.js` and `assets/img/Apple.png` all 302 to login.

Also new since v0.2.0: the repo is on GitHub at `JacVanWyk/OT_Game` (branch `main`, public),
with a root `README.md` and `.gitignore`.

Changed files: `talk_to_other_claude.md` (new), `prototype/js/game.js`,
`prototype/dist/OrchardToss.html`, `README.md`, `CLAUDE.md`, `RELEASE_NOTES.md`; deployed copy
`hosted_apps/orchard-toss/js/game.js`.

---

## 2026-09-02 — v0.2.0 — real clay fruit art (5 of 10 fruits)

**STATUS: VERIFIED + DEPLOYED.** Ben supplied clay-style renders for
apple, banana, cherry, pineapple and strawberry (`prototype/assets/<Fruit>.png`,
600–815 px square RGBA with transparent backgrounds; the same five are in
`OT_Assets_Clay.zip`). They now draw in every place a fruit appears: board
tiles, the flying fruit and cherry twin, the launcher cradle, and the HELD /
NEXT HUD slots. Live at **https://tools-app.net/hosted/orchard-toss/** —
13 files byte-identical to source (`index.html`, 6 scripts, the font, 5
images); anonymous requests to the page, `js/assets_manifest.js`,
`assets/img/Apple.png` and `assets/img/Cherry.png` all 302 to login.

**Pipeline (Numbat Patrol pattern).** `tools/preprocess_assets.py`
alpha-crops each master (alpha > 16 threshold so glow halos cannot inflate
the frame) and downsizes to 256 px on the longer side into `assets/img/`
(340 KB for all five), then regenerates `js/assets_manifest.js` as
`OT.AM = { apple: {src, w, h}, … }` keyed by the fruit **type id** so the
painter looks a tile's image up by `cell.type` directly. `js/assets.js`
preloads every manifest image (bundle data URIs first, relative paths
otherwise), snapshots `OT.S._proc.fruit`, and installs an image-drawing
`OT.S.fruit` **all-or-nothing** once every image has loaded; any failure
leaves the procedural painters untouched. The override draws the image with
its longer side at 0.95 × the painter's size (the renders carry stem and
leaf inside the crop, so bodies land at ~0.74 × size, the procedural ball's
0.76 diameter), with the same radial drop shadow and idle wobble, and
**delegates** to the procedural painter for watermelon, grape, pomegranate,
orange and lemon — so Summer+ boards mix real and procedural fruit by design
until Ben supplies the rest. `build_bundle.py` parses `OT.AM` out of the
manifest, embeds each PNG beside the font in `OT.AM_DATA`, and fails on a
missing / empty / non-PNG image or a data-URI count that differs from the
manifest. Bundle: 0.67 MB (was 0.21).

**Verified (headless, swiftshader Chromium).**

- `node tests/headless_smoke.mjs` → **14 passed, 0 failed, 0 errors**
  (was 12). The http boot and the `file://` bundle boot both require
  `OT.A.status === 'ready'`, 5/5 images loaded and `OT.S.fruit !==
  OT.S._proc.fruit`. New differential probe: each imaged fruit rendered
  through `OT.S.fruit` vs the procedural snapshot into 96² offscreen canvases
  at size 64 differs by 2 036–2 772 pixels. **Negative control:** grape,
  orange and watermelon render through the override with exactly **0**
  differing pixels while drawing 1 462–2 284 opaque pixels — proving the
  delegation path and that the differ can report zero.
- Size match measured, not eyeballed: real fruit opaque bbox 60 px tall at
  size 64 vs 62–68 for the procedural painters.
- `node tests/board_test.js` → `SUMMARY passed=52 failed=0 errors=0`
  (logic untouched).
- Screenshots after the change (not before): `assets/screens/playing_390x844.png`
  (Spring 5: all-real board, HUD slots, launcher) and
  `assets/screens/playing_autumn_390x844.png` (Autumn 8)
  with real banana/strawberry/apple beside procedural grape, watermelon,
  pomegranate and a coconut.
- Server hygiene: the smoke suite's `http.server` and the screenshot
  server were both killed by pid and their ports confirmed free with `ss -ltn`.

**For Ben to decide.** The two art styles sit side by side from Summer on
(clay renders vs flat-outlined procedural). The remaining five renders
(watermelon, grape, pomegranate, orange, lemon) drop in with one line each in
`tools/preprocess_assets.py`; coconut, obstacles, Sprout, the monkey and the
chrome are still procedural and have no pipeline entry yet. The board tile
fit (0.95) can be nudged in `js/assets.js` (`FIT`) if the real fruit read
as small on a phone.

**Not verified.** Real-device rendering of the 256 px sprites at DPR 3
(headless runs at DPR 1), and the hosted page past the login wall.

**Changed files.** `prototype/tools/preprocess_assets.py` (new),
`prototype/js/assets_manifest.js` (new, generated), `prototype/assets/img/*.png`
(new, 5), `prototype/assets/{Apple,Banana,Cherry,Pineapple,Strawberry}.png`
(new masters from Ben), `prototype/js/assets.js`, `prototype/index.html`,
`prototype/build_bundle.py`, `prototype/tests/headless_smoke.mjs`,
`prototype/dist/OrchardToss.html`, `prototype/ARCHITECTURE.md`,
`prototype/README.md`, `CLAUDE.md`, `RELEASE_NOTES.md`.

---

## 2026-09-02 — v0.1.0 — first playable POC

**STATUS: VERIFIED + DEPLOYED.** Full-spec build (all 10 fruits, all 4
zones, 52 levels, obstacles, coconuts, hearts, stars, ad stub) on the Numbat
Patrol web-prototype pattern. Live behind the router login at
**https://tools-app.net/hosted/orchard-toss/** — deployed as a straight
authoring copy (`index.html`, `js/*.js`, `assets/fonts/`) into
`router-server/hosted_apps/orchard-toss/`, all 7 files byte-identical to
source, no `<base>` tag; anonymous requests to the page, a script, the font
and the no-slash path all 302 to login as designed. Single-file bundle
`prototype/dist/OrchardToss.html` (0.21 MB, font embedded) boots from
`file://`. Test commands: `node tests/board_test.js` (52 checks),
`node tests/headless_smoke.mjs` (12 checks, self-serving), `python3
build_bundle.py`.

**How it was built.** Contract-first: `prototype/ARCHITECTURE.md` fixed the
module APIs, then four builders ran in parallel (board logic + Node tests,
procedural art + spritesheet, game shell + input, bundler/docs/smoke test),
followed by an integration pass, a read-only gameplay QA pass, a
board-tuning pass, and a final integration for the cherry twin. Every module
shipped with its own negative controls.

**Gameplay model (decisions beyond the design doc, see ARCHITECTURE.md):**
tiles hang from the canopy and compact upward, so the launched fruit always
hits the lowest tile in its lane; walls deflect sideways, trellis returns the
fruit, pipes pass vertically only; coconuts (Autumn+) never match and count
toward remaining; level clear at `remaining < target`,
`target = max(2, round(initial × 0.10))`.

**Findings fixed during QA (all measured, not guessed):**

1. *Dead hands / soft-lock.* A queue-fed hand plus "mismatch keeps the hand"
   left 23% of hands with no target; only 58 of 1 040 boards were clearable.
   Fixed with hand rescue (swap/redraw reported as `result.handRescue`,
   animated as a SWAP popup) → 1 040/1 040 clearable, then cut further to a
   21.5% rescue rate with `DRAW_LOOKAHEAD` 3.
2. *Timer never bit.* The 0.5/1.0/5 s time bonus refunded every level; every
   archetype cleared with 90–100% time left and everyone got 3★. Retuned:
   bonus 0.25/0.5/cap 3 s, limits Spring 45→38 s and later zones 40→32 s,
   `STAR_FRACTIONS` [0.8, 0.5]. After: sensible player 88% 3★, naive
   23% 3★ / 77% 2★, casual fails 3% of levels (worst zone 5%).
3. *Cherry double unreachable* (0 in 381 launches, compaction never leaves a
   gap). Redefined as a twin cherry into the adjacent lane, animated as a
   second flight; 22% of cherry launches now double.
4. *Single-tile runs.* `CLUSTER_BIAS` 0.55 lifts mean matched run 1.12 → 1.67.
5. *HUD values invisible* (white text stroked with a 4 px white outline,
   1.0:1). Outline is now Deep Navy `#335D7C`; measured ≥ 5.2:1 everywhere.
6. *Canopy strip painted over the HELD/NEXT previews.* Clipped; 0 pixels
   changed in the HUD band (negative control 3 294).
7. *Render throw froze the loop forever* (rAF scheduled after render).
   Guarded; proven with an injected throwing painter.
8. *Meta-progression hidden* behind the board. Orchard showcase with the
   growing tree + Sprout on zoneIntro and levelClear; level 52 ends on an
   "ORCHARD RESTORED!" finale that routes back to the title.

**For Ben to decide (tuning, not bugs):** later zones are now slightly
easier for casual players than Spring (fail 1–5% vs 4%); the measured lever
is `TIME_RAMP` ×0.9 for Summer–Winter. Banana is mechanically identical to
apple (distinct monkey presentation only). Apple is drawn green so it reads
apart from cherry and strawberry at tile size. Star thresholds are set
against a simulated "naive" player (1 s think, no errors), not a real one.

**Not verified:** real finger flicks on a phone (headless cannot gesture;
`OT.debug.launch` drives the same code path as a flick), the hosted page
past the login wall (only the redirects and the byte-identical copy were
checked), and the human feel of the retuned time limits.

**Changed files:** `prototype/index.html`, `prototype/js/config.js`,
`prototype/js/board.js`, `prototype/js/sprites.js`, `prototype/js/assets.js`,
`prototype/js/game.js`, `prototype/build_bundle.py`,
`prototype/tests/board_test.js`, `prototype/tests/headless_smoke.mjs`,
`prototype/tools/spritesheet.html`, `prototype/assets/fonts/Fredoka-Bold.woff2`,
`prototype/assets/spritesheet_v0.1.0.png`, `prototype/assets/screens/*.png`,
`prototype/dist/OrchardToss.html`, `prototype/ARCHITECTURE.md`,
`prototype/README.md`, `CLAUDE.md`, this file; deployed copy in
`C:\PROD_DB\infra_router\router-server\hosted_apps\orchard-toss\`.
