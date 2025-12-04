# Tasks Panel (Imperial Mandates Flyout)

The Tasks button opens the mandates flyout without blocking the overworld. The panel mirrors `ImperialMandates.getActiveMandates()` so the list stays in sync with the authoritative timeline while the player keeps interacting with the map.

## Presentation rules
- **Non-blocking overlay**: the flyout uses pointer-events passthrough so camera panning and hex clicks still work while reading tasks.
- **Statuses**: cards display badge tones for `active`, `warning` (≤2 days remaining), `completed`, and `failed/expired` mandates.
- **Deadlines**: deadline text is produced by `ImperialMandates.describeDeadlineTick`, which formats the month/week/day cadence and reports remaining days against the shared mandate tick counter.
- **Empty state**: when no mandates are active, the body renders "No active mandates yet." to make it clear the queue is waiting on future triggers.

## Accessibility hooks
- **Toggle controls**: `#btn-mandates` toggles the panel and updates `aria-expanded`; `#mandates-panel` tracks `aria-hidden` so screen readers know when the flyout is visible.
- **Live updates**: `renderMandatesPanel()` clears and re-renders the list on each toggle, ensuring badge tones and deadline labels reflect the most recent tick math without requiring a page reload.
