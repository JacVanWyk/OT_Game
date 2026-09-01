# Orchard Toss

Tentative name: Orchard Toss. Apprentice character name: Sprout.

This document is spun out from the master "Game Concepts.md" brainstorm to focus solely on this concept (formerly "Concept 2"). Game Concepts.md remains the master document for the first concept (numbat/Pooyan, now developed further in NumbatPatrol.md) and the full brainstorm history for this concept prior to the pivot decisions below. From this point, updates to this concept are made in this file only.

## Document Control

| Version | Date | Change | Author |
|---|---|---|---|
| v1 | 2026-09-01 | Extracted from Game Concepts.md following the decision to focus on this concept; resolved all open questions from Game Concepts.md section 4.9 plus the differentiation risk from 4.7, via interview with Ben; added Fruit & Power-Up Roster, Zones, Obstacles, Character, and Name Candidates sections | Claude (Cowork) |
| v2 | 2026-09-01 | Second interview pass to get the spec to prototype-ready: added Board, Screen & UI Layout (13), Win/Loss, Lives, and Scoring (14), and Prototype Build Scope (15) sections; named the Apprentice "Sprout"; confirmed Spring has 10 levels and stays obstacle-free; renumbered sections 13-17 to 16-20 and fixed a stale cross-reference in section 4 | Claude (Cowork) |
| v3 | 2026-09-01 | Third interview pass to close every remaining open question: confirmed Summer/Autumn/Winter level counts, Sprout's full look (child/pre-teen, gender-neutral, classic gardener outfit, seed pouch/basket prop), star-rating basis (time remaining), UI chrome unified with Numbat Patrol now, and a light-touch monetisation stance (interstitial ads between zones). Open Questions section removed — none remain | Claude (Cowork) |

---

## 1. Concept Summary

| Name | Inspiration | Theme | Genre | Core Mechanic | Status |
|---|---|---|---|---|---|
| Orchard Toss (tentative) | Flipull / Plotting (1989, arcade, Taito) | Orchard restoration | Tile-matching puzzle | Drag to aim, flick to launch a held fruit, matching same-fruit tiles in a line to clear them | Drafted |

---

## 2. Inspiration and Source Material

| Attribute | Detail |
|---|---|
| Original game | Flipull, released in Japan as Flipull (known in the West as Plotting) |
| Original release | 1989, arcade (Taito); Japan June 1989, North America August 1989 |
| Famicom port | December 15, 1989, published by Taito |
| NES (Western) release | Titled "Flipull: An Exciting Cube Game," released circa 1990 |
| Genre | Tile-matching puzzle |
| Note | The original brief referenced "1982 NES" — Flipull originated in arcades in 1989, seven years after Pooyan, with console ports following in 1989-1990 |

## 3. Original Gameplay Mechanics (Flipull / Plotting)

| Original element | Description |
|---|---|
| Controls | Joystick (up/down only) selects launch position; one button fires |
| Launch | The held tile fires horizontally and travels until it hits an obstacle, then falls |
| Matching | If the fired tile hits a tile of the same type, all contiguous same-type tiles in that line disappear at once |
| Mismatch | A tile hitting a different type simply returns to the player's hand |
| Field features | Walls, ceilings, and pipes affect trajectories; pipes only allow vertical passage |
| Clear condition | A stage clears when remaining tiles drop below a target count, within a move or time limit |
| Scale | 60 stages in the original, with bonus scoring increasing as fewer tiles remain |

---

## 4. Originality and Differentiation (resolved 2026-09-01)

A close relative of this exact mechanic already exists as a purchasable commercial asset: "Fruit Tile Match - Unity Puzzle Game (Puzznic-style)," a Unity source-code template sold on itch.io and CodeCanyon for roughly US$19, explicitly described and sold as "ready to reskin and release." Standard fruit match-3 apps on the app stores are a different mechanic (adjacent-swap, not projectile launch-and-match) and not a direct clash — see Game Concepts.md section 4.7 for the full originality table.

Decision: differentiation is core, not optional. Every item below is a required feature of the base design, not a stretch goal:

- Physics-driven presentation — fruit rolls, bounces, and splashes juice on a match, rather than the original's rigid block movement (see section 8, Art Direction);
- A wide, real-fruit-trait-tied power-up roster — most fruit types carry a distinct special effect rather than being plain match targets (see section 5);
- A meta-progression layer — the orchard visibly grows across four seasonal zones as levels are cleared (see section 6);
- A distinct one-handed drag-and-flick control scheme, rather than a straight ported joystick feel (see section 12); and
- A named host character with a personality hook, mirroring Concept 1's approach with Nummy (see section 9).

---

## 5. Fruit & Power-Up Roster (confirmed 2026-09-01)

Roster size: 10 fruit types, unlocked progressively as the orchard's seasonal zones open (see section 6) rather than all available from level 1. Power-up logic is tied to each fruit's real-world trait rather than an abstract/arcade effect, so every match has a reason behind its behaviour.

| Fruit | Real-world trait used | Power-up effect | Zone (unlock order) |
|---|---|---|---|
| Cherry | Grows in paired clusters on the stem | Cherries always launch in pairs; matching both at once doubles the combo score | Spring (1st) |
| Strawberry | Seeds studded across the surface | Clears a small cross-shaped radius around the match point | Spring (1st) |
| Apple | Crisp, whole fruit | Clears the full row the match occurred in | Spring (1st) |
| Watermelon | Bursts messily when it splits | Splash effect clears adjacent tiles regardless of fruit type | Summer (2nd) |
| Grape | Grows in a bunch | Clears the entire connected cluster it is part of, not just a single line | Summer (2nd) |
| Banana | Slippery peel, monkeys' favourite food | Summons a monkey that sweeps and clears a full row | Summer (2nd) |
| Pomegranate | Bursts into scattered seeds | Clears several random tiles across the board | Autumn (3rd) |
| Pineapple | Tough, spiky exterior | Breaks one adjacent obstacle tile (branch/fence — see section 7) | Autumn (3rd) |
| Orange | Segmented, zesty | Triggers a chain reaction into adjacent same-type clusters beyond the immediate line | Winter (4th) |
| Lemon | Sharp, sour | Clears a full column | Winter (4th) |

Note: Orange and Lemon are grouped into the Winter zone deliberately — citrus is genuinely a winter-harvest fruit, and a "greenhouse" framing justifies fruit that would not otherwise grow outdoors in that season, tying the difficulty ramp to something biologically real (matching the same design principle used for the numbat theme in Concept 1).

---

## 6. Zones and Level Structure (confirmed 2026-09-01, level counts confirmed 2026-09-01)

- Structure: levels are grouped into four seasonal zones — Spring, Summer, Autumn, Winter — rather than one large flat stage list;
- Order: fixed (Spring → Summer → Autumn → Winter), each zone unlocking the next on completion, giving a straightforward growing-orchard story rather than a level-select hub;
- Fruit unlocks: each zone introduces its own 2-3 fruit types (see section 5), so the roster and difficulty grow together zone by zone, rather than presenting the full 10-fruit roster from level 1;
- Obstacle unlocks: obstacle density and variety also increase zone by zone (see section 7), layering onto the fruit-roster ramp; and
- Scale (confirmed 2026-09-01): Spring 10 levels, Summer 12, Autumn 14, Winter 16 — 52 levels total. Counts increase zone by zone rather than staying flat, giving more room to explore each new layer (obstacles from Summer, tougher coconut-tier tiles from Autumn, the citrus/greenhouse twist in Winter) as it's introduced.

---

## 7. Obstacles (confirmed 2026-09-01, generation method and Spring exemption confirmed 2026-09-01)

Flipull's original field features (walls, ceilings, pipes) are translated into the orchard setting rather than dropped, preserving the trajectory-puzzle depth of the original:

| Original feature | Orchard equivalent | Behaviour |
|---|---|---|
| Wall | Fence post / tree branch | Blocks and redirects a launched fruit's path, same as the original wall |
| Ceiling | Overhead trellis / vine canopy | Caps vertical travel, same as the original ceiling |
| Pipe (vertical passage only) | Irrigation pipe / hollow log | Allows only vertical passage through, same as the original pipe |

- Spring: obstacle-free by design, keeping it a pure core-loop tutorial zone;
- Summer onward: obstacles are randomly generated within zone-appropriate density/type rules, rather than hand-designed level by level — faster to produce the full level set, at the cost of Jac tuning the generation rules rather than placing each level by hand; and
- Obstacle density increases zone by zone, and Pineapple's power-up (section 5) gives the player a direct tool for clearing an obstacle tile once unlocked in Autumn.

---

## 8. Art Direction (confirmed 2026-09-01)

- Style: colourful, glossy, physics-driven mobile-casual illustration — matches the direction chosen for Concept 1 (referencing Cook & Merge and Match Factory!), applied here specifically to give this concept visual and tactile distance from the flat, rigid block movement of the existing commercial template flagged in section 4;
- Physics behaviour: fruit rolls and bounces naturally when it lands or is deflected by an obstacle, and splashes juice/pulp on a successful match — this is a required behaviour, not a polish pass, per section 4;
- Palette: bright, saturated, season-appropriate — soft pastels/blossom tones for Spring, vivid warm tones for Summer, deep amber/burgundy for Autumn, cool blue-green with citrus brights for Winter;
- Reference art: none supplied yet (unlike Concept 1's numbat reference photos); this section stands as a written brief for Jac to work from until reference material is available; and
- UI treatment: to be aligned with Concept 1's chunky glossy button/banner language once both concepts are further along, for visual consistency across the two games if both proceed.

---

## 9. Character: Sprout the Apprentice (confirmed 2026-09-01, named 2026-09-01, look confirmed 2026-09-01)

Host character direction: a young, enthusiastic orchardist's apprentice who grows and learns alongside the orchard itself — as the player clears zones and the orchard flourishes, the character's confidence/skill visibly develops in step, giving the meta-progression layer (section 6) a face rather than being a purely visual orchard-growth mechanic.

- Name: **Sprout** (confirmed 2026-09-01), chosen from a shortlist (Sprout, Pip, Fig) that named the apprentice's growth arc directly;
- Rationale: mirrors Concept 1's Nummy in giving the game a personality hook and marketing face, while tying the character's own arc directly to the player's progress rather than being a static bystander;
- Age: child/pre-teen — a young apprentice look, leaning cute and matching common casual-mobile mascot conventions;
- Gender presentation: gender-neutral/ambiguous — the design does not read clearly as either, for the broadest appeal;
- Outfit: classic gardener — overalls, a sun hat, and an apron with pockets, reading immediately as "tends an orchard"; and
- Signature prop: a seed pouch/basket, tying Sprout to the fruit being launched rather than to the launch motion itself (the launcher UI element carries that visual job instead). This is still a written brief only — no reference art yet, per section 8.

---

## 10. Core Gameplay Loop (Mobile)

1. Drag to aim the launcher at the target lane;
2. Flick to launch the held fruit;
3. Match same-fruit lines (and trigger power-up effects per section 5) to clear tiles;
4. Clear the level's target count before the timer runs out (section 11); and
5. Advance to the next level, and eventually the next season/zone (section 6), with new obstacles and fruit types introduced gradually.

## 11. Session and Pacing Design (confirmed 2026-09-01, timer behaviour confirmed 2026-09-01)

- Target session length: very short, 30-60 seconds per level — matching the pacing target chosen for Concept 1 and the original Flipull's fast round structure;
- Loss condition: time limit per level (not move-count), rewarding fast decisions in the spirit of the arcade original;
- Timer behaviour: clearing fruit (especially via power-up effects) adds a small amount of time back to the countdown, rewarding good play with more room to finish the level, rather than running on a fully fixed timer;
- Mismatch penalty: a fired fruit that does not match returns to the player's hand as in the original, plus a brief lockout before the next fruit can be launched — this raises the tempo stakes of each throw without directly punishing the clock; and
- Implication: obstacle density, power-up frequency, and the zone/level structure (sections 6-7) all need to resolve within this short per-level window.

## 12. Mobile Touch Control Translation (confirmed 2026-09-01)

| Original input | Touch equivalent | Notes |
|---|---|---|
| Joystick up/down (lane select) | Drag the launcher into position | Continuous drag, closer to deliberate positioning than a direct tap |
| Fire button | Flick toward the target lane, in the same motion as the drag | Single continuous gesture rather than two separate taps |

Control scheme decided: drag-and-flick (previously "Scheme B" in Game Concepts.md section 4.5), chosen specifically to give this concept a distinct one-handed UX from the ported-joystick feel of the existing commercial template (section 4). The alternative tap-to-select/tap-to-fire scheme ("Scheme A") is not proceeding for this concept.

---

## 13. Board, Screen & UI Layout (confirmed 2026-09-01, UI chrome unification confirmed 2026-09-01)

- Orientation: portrait, matching the one-handed intent of the drag-and-flick control scheme (section 12);
- Board width: 5 horizontal lanes — fewer than the original Flipull's density, favouring larger, more readable fruit sprites on a phone screen for the prototype;
- Launcher position: fixed at the bottom edge of the screen, firing upward into the board (closer to a "shoot upward" puzzle feel, e.g. Puzzle Bobble, than the original's horizontal side-launch);
- Fruit queue: the player sees a "next fruit" preview alongside the currently held fruit, similar to a Tetris next-piece display, adding a light planning layer beyond the original's no-lookahead design; and
- HUD needs (minimum for prototype): countdown timer, remaining-fruit count vs. target, current score, hearts remaining (section 14), and the next-fruit preview above; and
- UI chrome: unified with Numbat Patrol's visual language now — reuse its chunky glossy button/banner style guide (NumbatPatrol.md section 6/21) rather than developing Orchard Toss's UI independently, for a consistent look across both games and faster work for Jac.

---

## 14. Win/Loss, Lives, and Scoring (confirmed 2026-09-01, star-rating basis confirmed 2026-09-01)

- Clear condition: matches the original Flipull — a level clears once the remaining fruit count drops below a target, not full board clearance;
- Board fill: each level starts roughly 70% full of fruit, with a target of roughly 10% remaining to clear the level — more breathing room at the start than the original, with a tight finish;
- Lives: a shared hearts pool of 5, losing one heart per failed level attempt (timer runs out before reaching the target), refilling at a rate of 1 heart per 30 minutes — a standard mobile-puzzle pattern (comparable to Candy Crush-style systems);
- Scoring and stars: levels award a 1-3 star rating on completion, based on time remaining when the level is cleared — faster clears earn more stars, directly rewarding efficient play against the time-pressure loss condition. Exact time thresholds per star still to be tuned during prototyping; and
- These numbers (fill %, target %, heart count, refill rate, star thresholds) are prototype starting points, expected to be tuned once the core loop is playable.

---

## 15. Prototype Build Scope (confirmed 2026-09-01, monetisation stub confirmed 2026-09-01)

- Scope: build the full spec at once — all 10 fruit types, all 4 seasonal zones, rather than a smaller vertical slice — so no rework is needed later;
- Tech approach: same hosted web-prototype approach used for Numbat Patrol, keeping tooling consistent across both concepts for Jac; and
- Monetisation stub (light-touch, confirmed 2026-09-01): interstitial ads shown at zone transitions (e.g. Spring to Summer), not between every level — a deliberate departure from the original cross-concept plan to defer monetisation entirely (Game Concepts.md section 5.3), scoped narrowly so Jac has something concrete to stub in without over-building it; and
- Everything in sections 5-14 above, plus the monetisation stub, is in scope for this first prototype build. No open questions remain — see section 16 for the (now empty) history of what was resolved.

---

## 16. Open Questions (all resolved 2026-09-01)

None remain. All five items previously logged here were resolved via interview with Ben on 2026-09-01: Summer/Autumn/Winter level counts (section 6), Sprout's visual design (section 9), star-rating basis (section 14), UI chrome unification (section 13), and monetisation stance (section 15). Remaining fine-tuning (exact star-rating time thresholds, final concept art) is noted inline in those sections rather than tracked here.

---

## 17. Name Candidates (confirmed 2026-09-01)

A spot check across app stores and general web search was run against the strongest candidates below (light spot check, not a full trademark or app-store clearance search — confirm before committing).

| Name | Category | Spot-check result | Rationale |
|---|---|---|---|
| **Orchard Toss** (selected) | Direct/mechanic-tied | Clear — nearest neighbours found were "Orchard Toys" (children's brand) and "Office Paper Toss" (unrelated app); no exact-name clash | Names both the setting and the launch mechanic plainly |
| Ripe Toss | Direct/playful | Clear — no matching results found | Playful, ties to fruit ripeness without over-explaining |
| Zest Toss | Wordplay | Clear — no matching results found | Citrus-flavoured wordplay, distinctive |
| Bloom & Bounty | Wordplay | Clear — nearest neighbour was a generic "Bounty Game" rewards app, unrelated | Pairs blossom (Spring) and harvest (Autumn) imagery |
| Harvest Toss | Mechanic-tied | Mostly clear, but "Harvest" alone is a heavily used generic word across many unrelated apps/games | Names the mechanic and the harvest theme together |
| Season's Bounty | Setting-tied | Clear of games/apps, but clashes with an existing real-world CSA farm brand of the same name | Names the seasons/zones structure directly |
| Grove Guardian | Setting-tied | **Avoid** — already in use by multiple itch.io indie games and a Warhammer miniatures line/product | — |
| The Orchardist | Setting-tied | **Avoid** — clashes with an existing novel (Amanda Coplin) and an existing board game of the same name | — |
| Fruit Flick | Mechanic-tied | **Avoid** — no exact clash, but sits thematically too close to Fruit Ninja's fruit-plus-flick/slice space, risking player confusion despite the different name | — |

Working title going forward: **Orchard Toss**.

---

## 18. Cross-Reference: Game Concepts.md

Game Concepts.md retains the original brainstorm, the full brief-to-decision history for this concept (theme reskin options, control scheme options, and the original differentiation risk write-up), and the master document status for Concept 1's pre-numbat history. See Game Concepts.md sections 4 and 4.7-4.9 for that history.

---

## 19. References

| # | Source | Type | Used for | Link |
|---|---|---|---|---|
| 1 | Concept originator | Internal | Original concept brief, theme direction (fruit), original game selection | Ben, prior session |
| 2 | Game Concepts.md | Internal | Master brainstorm document; full pre-pivot history for this concept | Games/Game Concepts.md |
| 3 | Wikipedia — Plotting (video game) | External | Original Flipull/Plotting release history | https://en.wikipedia.org/wiki/Plotting_(video_game) |
| 4 | StrategyWiki — Flipull | External | Detailed Flipull mechanics (launch, matching, field features) | https://strategywiki.org/wiki/Flipull |
| 5 | GameFAQs — Flipull: An Exciting Cube Game (NES) release data | External | Famicom Flipull release date and publisher | https://gamefaqs.gamespot.com/nes/579524-flipull-an-exciting-cube-game/data |
| 6 | Fruit Tile Match - Unity Puzzle Game (Puzznic-style) — itch.io | External | Originality/differentiation basis, section 4 | https://neonspacefighter.itch.io/fruit-tile-match-unity-puzzle-game |
| 7 | Orchard Toys — App Store | External | Name-clash check, "Orchard Toss" | https://apps.apple.com/gb/app/orchard-toys/id1450094322 |
| 8 | Grove Guardian (itch.io, Crazy Cousins' Games) | External | Name-clash check, "Grove Guardian" | https://crazycousins.itch.io/grove-guardian |
| 9 | The Orchardist — Wikipedia (novel) | External | Name-clash check, "The Orchardist" | https://en.wikipedia.org/wiki/The_Orchardist |
| 10 | The Orchardist — BoardGameGeek | External | Name-clash check, "The Orchardist" | https://boardgamegeek.com/boardgame/259113/the-orchardist |
| 11 | Fruit Ninja — App Store | External | Thematic-overlap check, "Fruit Flick" | https://apps.apple.com/us/app/fruit-ninja/id403858572 |
| 12 | Season's Bounty Farm & CSA | External | Name-clash check, "Season's Bounty" | https://www.seasonsbountyfarm.com/ |

---

## 20. Changelog

| Date | Version | Summary |
|---|---|---|
| 2026-09-01 | v1 | Document created, extracted from Game Concepts.md; resolved the differentiation risk (made core, not optional) and every open question from section 4.9 via interview with Ben; confirmed fruit/power-up roster, seasonal zone structure, obstacles, art direction, host character direction, control scheme, pacing, and working title with name-clash spot check |
| 2026-09-01 | v2 | Second interview pass to reach prototype-ready detail: added Board, Screen & UI Layout, Win/Loss/Lives/Scoring, and Prototype Build Scope sections (13-15); confirmed portrait orientation, 5-lane board, bottom launcher firing upward, next-fruit preview, bonus-time-on-clear, remaining-count clear condition, ~70%-fill/~10%-target board fill, 5-heart life system (30-minute refill), 1-3 star rating, randomly-generated obstacles (Spring exempt, 10 levels), full-scope prototype build on the same hosted web tooling as Numbat Patrol, and named the Apprentice "Sprout" |
