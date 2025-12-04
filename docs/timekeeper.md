# Timekeeper

The Timekeeper owns the overworld calendar. It converts logical ticks (one tick equals one day) into a Month → Week → Day readout and broadcasts changes for UI overlays.

## Calendar math
- **Day:** `ticks + 1` (so a fresh campaign starts on Day 1).
- **Week:** 8 days per week (revised cadence to slow the overworld economy).
- **Month:** 5 weeks per month (40-day months).

The helper returns:
- `dayOfWeek` (1–8)
- `weekOfMonth` (1–5)
- `month` (1-indexed)
- `day` (running day counter)
- `dayOfMonth` (1–40)
- `daysPerMonth` (40 with the default config)

`Persistence.serializeGameState` captures the tick counter along with `daysPerWeek`/`weeksPerMonth` so reloads restore the same calendar math used during the prior session.

Mandate durations also rely on this cadence: `ImperialMandates.describeDeadlineTick()` converts tick deadlines into month/week/day labels and remaining-day deltas for the Tasks panel so its badges and labels match the HUD calendar.

## Events
`Timekeeper.emitChange()` dispatches a `time:changed` `CustomEvent` on `window` with `{ ticks, calendar }` and also notifies in-process listeners registered via `onChange()`.

## HUD integration
`updateHUD` reads `game.timekeeper.formatCalendar()` and writes it into the `#calendar-readout` pill so players can always see the current day/week/month. The formatted string now includes the total weeks per month and days per week (e.g., `Month 1, Week 1 of 5, Day 7 of 8`), and the HUD adds a tooltip showing `5 weeks/month · 8-day weeks` to reinforce the slower cadence.

The overworld tick interval defaults to **3.5 seconds per tick (day)** to match the elongated 40-day months.

The same Timekeeper values drive mandate deadlines (stored as ticks) and the HUD favor pill, so keeping the calendar in sync ensures mandate reminders and imperial favor changes align with the original timeline after a reload.
