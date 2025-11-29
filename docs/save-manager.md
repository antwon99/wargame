# Save Manager

The Command Sidebar now exposes a three-slot save system to support multiple campaigns.

- **Storage keys:** Slots are saved under `hexWar_slot1`, `hexWar_slot2`, and `hexWar_slot3`, with matching stat keys prefixed by `hexWar_stats_slot`.
- **Metadata:** Each payload stores leaderboard stats and the ISO timestamp of the most recent save so the sidebar can surface "Level X - Saved: <timestamp>" copy.
- **Defaults:** Slot 1 is the active slot on first load or after a reset. Saving or loading a slot updates the active slot indicator and refreshes the sidebar cards.
- **Resets:** The reset action clears all slot data and rebuilds a fresh overworld.
