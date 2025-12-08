# HUD Drawer

The HUD drawer replaces the previous full-screen upgrade/research modals with a bottom-anchored surface that keeps the overworld visible. It reuses the existing command-card visuals while constraining the footprint to ~40vh and adding an internal scroll area for longer content.

## Layout and triggers
- Anchored bottom-center with a card-style background, rounded corners, and shadow. Pointer events are limited to the panel so the map stays interactive.
- Upgrades (`#btn-upg`) and Research (`#btn-research`) share the same drawer. Switching buttons swaps content instead of stacking panels, and aria-expanded/hidden states mirror the active view.
- The drawer closes via its close button, outside clicks, or the Escape key. Narrow screens retain responsiveness with taller max-heights and full-width action rows.

## Header and content
- Header text updates per view: **Imperial Engineering** for upgrades and **Arcane Bureau** for research. The research view shows the lives badge in the header for context.
- Upgrade purchase buttons are rebound whenever the upgrades template is injected; research cards are rebuilt when the research view is active.

## Land reclamation prompts
- Land reclamation research now queues conversions without taking gold until a valid player-owned FIELD is selected. The drawer closes when targeting begins and a HUD hint below the upgrade/research buttons reads: “Select an owned FIELD tile to convert (cost Xg)”.
- Invalid targets leave the queue and resources unchanged; gold is only deducted when `applyQueuedReclamationToTile` succeeds and registers the purchase.
