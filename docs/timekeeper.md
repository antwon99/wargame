# Timekeeper

The Timekeeper owns the overworld calendar. It converts logical ticks (one tick equals one day) into a Month → Week → Day readout and broadcasts changes for UI overlays.

## Calendar math
- **Day:** `ticks + 1` (so a fresh campaign starts on Day 1).
- **Week:** 7 days per week.
- **Month:** 4 weeks per month.

The helper returns:
- `dayOfWeek` (1–7)
- `weekOfMonth` (1–4)
- `month` (1-indexed)
- `day` (running day counter)

## Events
`Timekeeper.emitChange()` dispatches a `time:changed` `CustomEvent` on `window` with `{ ticks, calendar }` and also notifies in-process listeners registered via `onChange()`.

## HUD integration
`updateHUD` reads `game.timekeeper.formatCalendar()` and writes it into the `#calendar-readout` pill so players can always see the current day/week/month.
