# Campaign Store (Persistence Facade)

## Purpose
`campaignStore` wraps the persistence layer to normalize campaign snapshots and leaderboard stats for UI consumers. It keeps older save formats compatible by hydrating legacy fields into the current schema. Implementation is in `scripts/campaignStore.js`.

## Inputs / Outputs
- **Inputs:**
  - `createCampaignStore({ persistence })`
    - `persistence` optional dependency for tests; defaults to the global `Persistence` service.
- **Outputs:**
  - Returns a facade with `load`, `loadCampaign`, `save`, `clear`, `hasSnapshot`, and `getSlotMetadata`.
  - `load` returns `{ state, stats, slot, pendingNotifications }` with normalized stats and hydrated game state.
  - `loadCampaign` returns the raw snapshot payload (with optional stat reconciliation) for synchronous game boot.

## Thresholds / Logic
- **Stat normalization:** uses `StatHelpers.normalizeStats` to fill missing fields.
- **Legacy reconciliation:** `reconcileDifficultyAndWarsWon` maps `bestDifficulty`/`warsPlayed` into the current `bestLevel`/`warsFought` schema.
- **Hydration check:** if serialized overworld hexes are not yet a `Map`, it uses the snapshot deserializer to hydrate state.

## Gameplay Interaction
Directly influences the campaign experience by ensuring player progress, difficulty history, and war results are correctly restored. Fallback behavior (returning empty state/stats when persistence is unavailable) allows gameplay to continue even when saves cannot be read.
