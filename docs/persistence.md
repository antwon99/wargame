# Persistence and Leaderboard Notes

This prototype now ships with a lightweight persistence layer backed by `localStorage` and a personal leaderboard that summarizes your best runs.

## Storage keys
- **`hexWar_slot{n}`**: JSON snapshot of overworld progress (resources, upgrades, claimable hexes, and stats at the time of save). `{n}` is the user-facing slot number (1–3 in the current UI, but the helpers accept any string/number).
- **`hexWar_stats_slot{n}`**: JSON copy of the leaderboard counters tied to the same save slot so total kills and bests survive format tweaks.

## What gets saved
- Resources, difficulty, upgrades, and every discovered overworld hex.
- Hex records now include mines, shrines, ruins, and rebel camps alongside the legacy castle/field/forest/town entries; snapshots preserve their IDs for income and hook processing on load. Legacy rebel-held tiles are normalized into rebel camps when loading.
- **Imperial favor** and the **Timekeeper** state (ticks + calendar config) so the HUD calendar and favor pill resume where the player left off.
- Pending HUD **notifications** and **imperial mandate timers** so deadline banners and decree reminders survive reloads.
- Leaderboard stats: total kills, best kill streak per war, highest level reached, wars fought, the last outcome, and the most recent save timestamp.
- Saves are taken from the overworld-facing snapshot; mid-combat state is intentionally omitted to avoid corrupting ongoing battles.

## Behaviors
- **Save/Load buttons**: write or read from the keys above. Saves stamp an ISO8601 timestamp for the UI, which feeds the sidebar save-slot captions via `Persistence.getSlotMetadata`.
- **Reset**: clears both keys and regenerates a fresh castle + frontier ring.
- **Auto-save hooks**: completing a war (victory/defeat/retreat) refreshes stats and writes a snapshot so leaderboard progress is never lost.

## Leaderboard stats schema
- `bestLevel`: Highest difficulty beaten across all wars (legacy saves may store this as `bestDifficulty`).
- `bestKills`: Most kills recorded in a single war.
- `totalKills`: Aggregate lifetime kill count.
- `warsFought`: Total number of wars played (legacy saves may store this as `warsPlayed`).
- `lastOutcome`: Result of the last completed war (e.g., `VICTORY`, `DEFEAT`, `RETREAT`).
- `lastSaveISO`: ISO8601 timestamp set by the most recent save.

Legacy saves are automatically upgraded on load: `bestDifficulty` maps to `bestLevel`, and `warsPlayed` maps to `warsFought` so older payloads remain compatible with the UI leaderboard.

## Extending the system
- Add new fields to `Persistence.DEFAULT_STATS` if you introduce more metrics—`serializeGameState` will automatically merge them.
- When the overworld schema changes, bump the storage keys to avoid mixing incompatible saves.
- For multiplayer or cloud sync, replace the `localStorage` helpers with API calls but keep the same payload shape for compatibility.
