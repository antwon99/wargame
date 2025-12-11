# Combat frontier debug helper

The combat engine now exposes a guarded helper, `debugCombatFrontier(game, options)`, for inspecting the generated war board. It reuses the live combat territory map and `isFrontier()` logic to report which tiles are eligible for player purchases.

## Enabling the probe

- Toggle `featureToggles.debug.logCombatFrontier` (e.g., via a console override or feature override in tests) to enable automatic logging.
- Alternatively, flip `window.DebugToggles.logCombatFrontier = true` after the page loads; the flag shares the existing debug toggle object used by the overlay.
- Production and normal play remain silent because the helper exits unless one of the debug flags above (or an explicit `force` call) is set.

## Output

When enabled, the helper runs once per war during `startWar()` and logs a snapshot shaped like:

```
[
  {
    key: '0,0',
    q: 0,
    r: 0,
    owner: 'player',
    canBePurchased: true,
    isFrontier: true
  }
]
```

Each entry mirrors the corresponding `game.combat.territory` tile and records whether the player can purchase a building (`canBePurchased`) and whether the tile qualifies as a frontier position under `isFrontier()`.

## Manual invocation

Developers can call `debugCombatFrontier(game, { force: true })` to gather the snapshot without flipping global flags. Passing `oncePerWar: true` prevents duplicate logs inside the same combat instance, matching the automatic behavior used during `startWar()`.
