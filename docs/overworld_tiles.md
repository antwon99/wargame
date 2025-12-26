# Overworld tiles

The overworld map uses a small, icon-driven vocabulary so tiles are immediately readable when zoomed out. Each entry below lists the emoji used on the hex, the passive income (per overworld tick), and any special hooks triggered when the tile is claimed or during income ticks.

| Tile | Icon | Color | Passive income | Favor | Special hooks |
| --- | --- | --- | --- | --- | --- |
| Castle | 🏰 | `#445` | +2 gold, +1 wood | — | Starting tile; anchors initial claim radius. |
| Field | 🌾 | `#90be6d` | — | — | Baseline tile used to fill in most claims. |
| Forest | 🌲 | `#2d6a4f` | +1 wood | — | Triggers lumberjack research bonuses. |
| Town | 🏠 | `#5e548e` | +2 gold | — | Plays the `city` chime when claimed. |
| Scorched | 🔥 | `#3b2a2a` | — | — | No income; used for lost/ash territory. |
| Rebel Camp | 🏴 | `#7f1d1d` | — | — | No income; hostile spawning camp. |
| Mine | ⛏️ | `#7f5539` | +3 gold | — | Grants an immediate +35 gold payout on claim and plays the `gold` cue. |
| Shrine | ⛪ | `#c9ada7` | — | +1 favor | Awards +2 Imperial Favor when claimed and keeps adding +1 favor each income tick. Plays the `holy` cue on claim. |
| Ruin | 🏚️ | `#6c757d` | +1 gold | — | Has a 20% chance each tick to award +10 bonus gold (with a floating text callout). |

The hooks are driven by `OVERWORLD_TILES` in `scripts/overworldConfig.js` and consumed by overworld claim/income logic so persistence and gameplay stay in sync.

## Tile inspector and cluster bonuses
The tile inspector mirrors the HUD’s 28-day pacing by showing per-tick adjacency bonuses for the selected tile and hiding itself whenever the player is in combat. Cluster data comes from `overworldAdjacency.js` and remains cached on `game.overworld.clusterBonuses` so the inspector and mandates panel both read the same numbers even after a pause/resume.

| State | Displayed label | Bonus line | Overlay behavior |
| --- | --- | --- | --- |
| No selection (OVERWORLD) | “Select a tile to inspect” | “Cluster bonuses appear…” or “Paused — cluster bonuses frozen…” depending on the pause toggle | Attack overlay cleared |
| Hostile selection | Uppercased tile type | `+Xg +Yw — N-tile …` plus adjacency/reclamation tooltip | Attack overlay anchored to tile |
| Non-OVERWORLD states (e.g., combat) | Inspector hidden | Bonus/tooltip cleared | Attack overlay cleared |
