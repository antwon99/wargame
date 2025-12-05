# Timekeeper

The Timekeeper owns the overworld calendar. It converts logical ticks (one tick equals one day) into a Month → Week → Day readout and broadcasts changes for UI overlays.

## Calendar math
- **Day:** `ticks + 1` (so a fresh campaign starts on Day 1).
- **Week:** 7 days per week (aligned to the new 28-day cadence).
- **Month:** 4 weeks per month (28-day months).

The helper returns:
- `dayOfWeek` (1–7)
- `weekOfMonth` (1–4)
- `month` (1-indexed)
- `monthName` (`Jan` → `Dec` cycling every 12 months)
- `year` (advances after every 12 months)
- `day` (running day counter)
- `dayOfMonth` (1–28)
- `daysPerMonth` (28 with the default config)

`Persistence.serializeGameState` captures the tick counter along with `daysPerWeek`/`weeksPerMonth` so reloads restore the same calendar math used during the prior session.

Mandate durations also rely on this cadence: `ImperialMandates.describeDeadlineTick()` converts tick deadlines into month/week/day labels and remaining-day deltas for the Tasks panel so its badges and labels match the HUD calendar.

## Events
`Timekeeper.emitChange()` dispatches a `time:changed` `CustomEvent` on `window` with `{ ticks, calendar }` and also notifies in-process listeners registered via `onChange()`.

## HUD integration
`updateHUD` reads `game.timekeeper.formatCalendar()` and writes it into the `#calendar-readout` pill so players can always see the current day/week/month. The formatted string is compact (`M: Jan Y1 | W: 1/4 | D: 7/28`) while still encoding weeks-per-month and days-per-month, and the HUD adds a tooltip showing `4 weeks/month · 7-day weeks` to reinforce the new cadence.

The overworld tick interval defaults to **3.5 seconds per tick (day)** with 28-day months, keeping each month to just under a hundred real-time seconds while preserving readable pacing.

The same Timekeeper values drive mandate deadlines (stored as ticks) and the HUD favor pill, so keeping the calendar in sync ensures mandate reminders and imperial favor changes align with the original timeline after a reload.
