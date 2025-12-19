# Game Persistence Service

The `scripts/game/persistence.js` module wraps the global `Persistence` adapter behind a storage-agnostic service boundary. The Game core calls the service for all snapshot saves, loads, and resets so overworld/combat logic does not need to know about `localStorage` or other backends.

## Responsibilities
- Provide safe defaults for leaderboard stats when a persistence adapter is missing or a slot is empty.
- Delegate snapshot save/load/reset operations to the active persistence adapter while hiding storage details from the Game core.
- Rehydrate notifications after UI bindings are ready so queued alerts survive bootstrap.

## API highlights
- `isAvailable()` reports whether a backing adapter exists.
- `loadSnapshot(slot)` returns `{ state, stats, slot }` with Hex hydration handled via the provided factory.
- `saveSnapshot(game, slot)` persists the live Game state when an adapter is available.
- `resetSnapshots()` clears stored data and returns fresh stats for a new campaign.
- `replayNotifications(game)` flushes any saved notification backlog once enqueue helpers are available.

Use the service in tests to swap persistence behaviors without touching overworld or combat logic. The factory accepts a custom `hexFactory` so hydration works in headless environments.
