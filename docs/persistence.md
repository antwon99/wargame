# Persistence and Leaderboard Notes

This prototype now ships with a lightweight persistence layer backed by `localStorage` and a personal leaderboard that summarizes your best runs.

## Storage keys
- **`wargame-save-v1`**: JSON snapshot of overworld progress (resources, upgrades, claimable hexes, and stats at the time of save).
- **`wargame-stats-v1`**: JSON copy of the leaderboard counters so total kills and bests survive format tweaks.

## What gets saved
- Resources, difficulty, upgrades, and every discovered overworld hex.
- Leaderboard stats: total kills, best kill streak per war, highest difficulty reached, wars played, and the last outcome.
- Saves are taken from the overworld-facing snapshot; mid-combat state is intentionally omitted to avoid corrupting ongoing battles.

## Behaviors
- **Save/Load buttons**: write or read from the keys above. Saves stamp an ISO8601 timestamp for the UI.
- **Reset**: clears both keys and regenerates a fresh castle + frontier ring.
- **Auto-save hooks**: completing a war (victory/defeat/retreat) refreshes stats and writes a snapshot so leaderboard progress is never lost.

## Extending the system
- Add new fields to `Persistence.DEFAULT_STATS` if you introduce more metrics—`serializeGameState` will automatically merge them.
- When the overworld schema changes, bump the storage keys to avoid mixing incompatible saves.
- For multiplayer or cloud sync, replace the `localStorage` helpers with API calls but keep the same payload shape for compatibility.
