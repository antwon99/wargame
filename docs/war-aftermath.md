# War Aftermath States

Documenting how overworld tiles react to failed wars and retreats, the visuals applied to damaged land, and how these states persist across saves and future reclamation.

## Defeat and Retreat Outcomes
- **Full defeat:** The attacked frontier tile becomes **scorched**. Any connected tiles behind it that were previously claimed remain owned but do not expand visibility.
- **Retreat:** The attacked frontier tile becomes **rebel-held**. The tile stays visible on the map, but control reverts to neutral rebels until reclaimed.
- **Adjacency:** Neither outcome spreads to neighboring tiles automatically; only the contested hex changes state.

## Visual Treatments
- **Scorched tiles:**
  - Darkened ground palette with burnt decals to distinguish from conquered land.
  - Smoke embers or subtle animated haze to imply lingering destruction.
  - Overlays stack on top of existing biome art; unit sprites and UI markers remain readable.
- **Rebel-held tiles:**
  - Flag/banner swap to a rebel icon.
  - Slightly desaturated tint compared to player-owned tiles, but brighter than scorched land to signal recoverable status.
  - HUD labels explicitly read "Rebel" when hovered/selected.

## Income and Resource Rules
- **Owned, intact tiles:** Provide their normal income and bonuses.
- **Scorched tiles:**
  - Produce **no income** until reclaimed and rebuilt.
  - Upgrades tied to the tile (e.g., outposts, income multipliers) are disabled while scorched.
- **Rebel-held tiles:**
  - Suspend player income and buffs until reconquered.
  - On reclamation, income resumes immediately with previous upgrades intact unless explicitly destroyed by the scenario.

## Persistence and Reclamation
- **Saving/Loading:** Tile states (scorched or rebel-held) are serialized with the overworld snapshot, so save/load cycles preserve damage and ownership loss.
- **Auto-save hooks:** Defeat or retreat triggers the same snapshot routine used for victories to avoid losing aftermath state.
- **Reclaiming tiles:** Winning a subsequent battle on the affected tile restores ownership. The tile reverts to the normal visual set, income resumes per its upgrades, and the scorched/rebel flags are cleared in the next save snapshot.
