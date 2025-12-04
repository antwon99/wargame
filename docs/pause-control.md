# Pause and Resume Behavior

`setPaused(forceState)` flips the global pause flag without blocking HUD interactivity. HUD badges refresh immediately on state changes so players see whether the overworld timer is frozen.

## Overworld ticks
- `advanceOverworldTimer(game, dt, options)` exits early when `game.paused` is true, preserving the partially filled `overworld.timer` so progress toward the next income tick resumes exactly where it left off.
- When unpaused and the accumulated `timer` meets or exceeds `tickRate`, the function applies economy income, advances the `Timekeeper` by one tick, and forwards mandate ticks to `ImperialMandateManager.advanceTick`.

## Audio and ambiance
The pause flag only controls overworld tick advancement; ambient audio loops continue running so players keep hearing the backdrop while the map is frozen.

## Tips for new integrations
- Avoid mutating `overworld.timer` when paused so fractional progress toward the next tick is not lost.
- Keep `updateHUD` lightweight; `setPaused` calls it immediately to reflect the new state before the next tick arrives.
