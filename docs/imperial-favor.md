# Imperial Favor HUD Meter

Imperial Favor tracks how pleased the capital is with the current stewardship. It is a 1–10 scale (higher is better) that is saved alongside overworld resources and restored on load. The HUD shows the current value inside the resource pill with the tooltip:

> Higher favor reduces taxes; lower favor increases pressure.

## Defaults and Clamping
- New campaigns start at **5** favor, a neutral midpoint.
- Values are clamped between **1** and **10** when written to the HUD or serialized so out-of-band adjustments cannot corrupt saves.

## Persistence Notes
- The snapshot payload includes `imperialFavor` next to gold, wood, upgrades, and research.
- Deserialization falls back to the default when a save is missing the field, keeping legacy files compatible.

## UI Placement
- The pill sits in the resource group beside gold, wood, lives, and the enemy level badge so players can monitor imperial sentiment without hunting through menus.
