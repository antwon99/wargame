# Tutorial Handler

The tutorial handler isolates onboarding-only mechanics so core systems (rebel spread, mandates)
can stay focused on reusable gameplay rules. It is the single source of truth for Frontier Sweep
state and any future tutorial gates.

## Frontier Sweep tracking

Frontier Sweep seeds the first rebel camp and tracks it as a protected tutorial target. The
handler stores:

- `targetTileKey`: the overworld key of the tutorial rebel camp.
- `spreadImmune`: whether the camp is allowed to roll daily spread checks (defaults to **true**).
- `enemyLevel`: enemy level preset captured at spawn time (defaults to `null`, currently set to **1**).
- `issuedTick`/`completionTick`: tick markers for when the tutorial camp was created/cleared.
- `source`: diagnostic label for the system that seeded the tutorial camp.

These fields live under `game.tutorial.frontierSweep` so they persist alongside the rest of the
snapshot data.

## Spread immunity

Rebel spread checks now consult the tutorial handler for protected rebel camp keys. When a key is
marked and `spreadImmune` is enabled, that camp is skipped during spread rolls. This prevents the
Frontier Sweep camp from spreading before the player clears it.

## Key functions

- `spawnFrontierSweepCamp(gameState, options)`: spawns or resolves the tutorial rebel camp,
  captures presets, and records the `targetTileKey`.
- `getProtectedRebelSpreadKeys(gameState)`: returns the set of rebel camp keys that should be
  ignored during spread checks.
- `clearFrontierSweepCamp(gameState, tileOrKey)`: clears the tracked tutorial camp once reclaimed.

## Integrations

- **Mandates:** `scripts/mandates/imperialMandatesCore.js` uses the handler to spawn and track the
  Frontier Sweep camp.
- **Rebel spread:** `scripts/overworldTicks.js` passes protected keys to `RebelSystem.spreadRebelCamps`.
- **Persistence:** `scripts/persistence.js` serializes `game.tutorial` so tutorial state survives
  save/load cycles.
