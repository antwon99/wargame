# Combat module boundaries

This project now splits combat logic into focused helpers so deterministic math can be exercised without the DOM while still keeping UI hooks organized.

## `scripts/combat/math.js`
- Owns immutable unit and building definitions used throughout combat.
- Provides upgrade-aware stat helpers, war entry cost calculations, and economy math.
- Exposes reward/penalty calculations (victory payouts, defeat levy and penalties) as pure functions that return structured deltas.
- Formats overworld loss summaries without triggering side effects so tests and HUDs can share the same messaging.

## `scripts/combat/ui.js`
- Wraps DOM toggles, floating text, and particle effects behind an injectable interface.
- Supplies anchor resolution, loss highlighting, and timer helpers that default to browser globals but can be stubbed in tests.
- Keeps `endWar` orchestration free of direct `window`/`document` dependencies while preserving the existing UI experience.
