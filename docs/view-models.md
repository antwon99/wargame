# UI view-model helpers

The **view-model** helpers in `scripts/models/` centralize game-state calculations so UI code renders pre-formatted data instead of recomputing costs or adjacency effects in the DOM layer. These modules are DOM-free and safe to import from both the browser and Node-based tests.

## Modules

- `upgradeViewModel.js` – builds purchase labels, affordability flags, and copy for each upgrade card. UI components simply read the returned payload and dispatch `buyUpgrade` events.
- `researchViewModel.js` – mirrors the research drawer needs by precalculating costs, option states, and revive cap metadata for the HUD header.
- `tileInspectorModel.js` – normalizes cluster bonus summaries (income, adjacency rates, and tooltips) so the tile inspector can render a single payload without poking at overworld state directly.

## Notes

- All helpers prefer existing game accessors (e.g., `getTechCost`, `formatCost`) and fall back gracefully when they are missing to keep tests lightweight.
- Because the helpers do not touch the DOM, they can be exercised in isolation via Node tests to validate pricing and adjacency logic without spinning up the entire renderer.
