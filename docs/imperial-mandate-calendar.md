# Imperial Mandate Calendar Utilities

`scripts/mandates/imperialMandateCalendar.js` isolates the tick-to-calendar math used by the mandate engine and Tasks panel. It exposes cadence helpers so UI layers can format dates and deadline deltas without importing the entire mandate state machine.

## Responsibilities
- Normalize timekeeper cadence (`daysPerWeek`, `weeksPerMonth`) from the current game state.
- Convert days/weeks/months into ticks for mandate durations, earliest issue guards, and spacing between mandates.
- Translate tick counters into calendar metadata and concise labels (month/week/day) for HUD overlays.
- Describe deadlines by combining absolute tick values with the current mandate tick counter so UI elements can show remaining days.

## Integration Notes
- Load `scripts/mandates/imperialMandateCalendar.js` **before** `scripts/mandates/imperialMandates.js` in HTML so the calendar helpers are available to the mandate runtime and Tasks panel.
- Tests in `tests/imperialMandateCalendar.test.js` cover conversion, formatting, and deadline math independently of the main mandate engine.
- Helpers accept the current tick and game state as parameters, making them safe to reuse in Node-based test harnesses and UI-only renderers.
