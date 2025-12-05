# Imperial Mandate Manager

The Imperial Mandate Manager coordinates tick-based mandate progression without interrupting player input. Each overworld tick enqueues a mandate tick, and the queue flushes on the next macrotask so UI overlays or decree popups never run inside the active input frame.

## Flow
- `advanceTick(gameState, uiBindings)` caches the most recent bindings, increments the queued tick counter, and schedules a flush.
- `flushTicks` applies the queued ticks through `ImperialMandates.recordEvent`, ensuring deadlines and trigger predicates use the authoritative mandate tick counter.
- `reset` clears queued ticks and cached bindings so tests and new campaigns start from a clean slate.

```
[Overworld income tick] -> advanceTick() -> queuedTicks += 1
                               | (setTimeout 0)
                               v
                        flushTicks() -> ImperialMandates.recordEvent('tick', { ticks, gameState }, gameState, uiBindings)
```

## Notes
- Queueing allows mandate success/failure effects (resource adjustments, decrees) to render asynchronously, keeping clicks and camera movement responsive.
- The manager gracefully skips work if the underlying `ImperialMandates` API is unavailable (e.g., during tests or stripped builds).
- Tick spacing is additive: three overworld ticks in a single frame produce one `recordEvent` call with `ticks: 3`, keeping mandate deadlines aligned with the 28-day calendar documented in `docs/timekeeper.md` instead of firing duplicate UI updates.
- UI bindings are merged across calls (e.g., notification enqueue + mandate renderer), so scheduled flushes always have the latest HUD hooks when they fire.
