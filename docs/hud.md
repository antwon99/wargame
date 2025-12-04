# HUD Elements

The HUD surfaces quick-read campaign data without opening menus. Key elements:

- **Imperial Favor Pill (`#imperial-favor`)**: shows the clamped 1–10 favor score that influences decree tone. Saves persist this value so reloads retain political standing.
- **Calendar Pill (`#calendar-readout`)**: renders `Timekeeper.formatCalendar()` (Month → Week → Day). Persistence stores the Timekeeper ticks/config so the calendar remains accurate after reloads.
- **Resource Counters (`#gold`, `#wood`)**: reflect the overworld economy and refresh when income ticks or mandates alter stockpiles.
- **Notification Stack**: non-blocking decree cards in the HUD corner. Pending cards are serialized and replayed after UI bindings mount, preserving reminders when players reload mid-mandate.

The HUD reads directly from live game state and persistence snapshots to keep favor, calendar position, and reminders aligned with the stored timeline.
