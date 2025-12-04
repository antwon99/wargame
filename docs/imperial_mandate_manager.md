# Imperial Mandate Manager

The Imperial Mandate Manager coordinates tick-based mandate progression without interrupting player input. Each overworld tick enqueues a mandate tick, and the queue flushes on the next macrotask so UI overlays or decree popups never run inside the active input frame.

## Flow
- `advanceTick(gameState, uiBindings)` caches the most recent bindings, increments the queued tick counter, and schedules a flush.
- `flushTicks` applies the queued ticks through `ImperialMandates.recordEvent`, ensuring deadlines and trigger predicates use the authoritative mandate tick counter.
- `reset` clears queued ticks and cached bindings so tests and new campaigns start from a clean slate.

## Notes
- Queueing allows mandate success/failure effects (resource adjustments, decrees) to render asynchronously, keeping clicks and camera movement responsive.
- The manager gracefully skips work if the underlying `ImperialMandates` API is unavailable (e.g., during tests or stripped builds).
