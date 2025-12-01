# Audio Randomizer and Soundscape

This feature revamps the combat/ambience sound design by introducing weighted variants and a music conductor inspired by Minecraft's staggered soundtrack pacing.

## Weighted Variations
- `AudioManager` now accepts `variations` arrays inside `SFX_MANIFEST` entries (see `scripts/audio.js`). Each variation can declare `weight`, `volume`, and `src`.
- The `WeightedSelector` class normalizes the list and picks an entry using cumulative weights so you can bias toward specific takes without losing randomness.
- Cooldowns continue to apply to the logical effect key (e.g., `sword`), even when different variants play back-to-back.

## Ambient Conductor
- `AmbientConductor` manages long-form tracks with:
  - **Mode-specific playlists:** `TERRITORY` (upbeat/uplifting) and `WAR` (sorrow/dark).
  - **Silence windows:** random gaps between songs to avoid constant playback.
  - **Crossfades:** optional overlap that fades out the current track while fading in the next, capped to 10 seconds so songs ne
ver stack indefinitely.
  - **Fallback timers:** ensure scheduling continues even if an `ended` event never fires (e.g., in tests).
- The default configuration (`AMBIENT_STATES` in `scripts/audio.js`):
  - Territory: 20–42s silence windows, 2.2s fades, ~38% chance to overlap by ~1.4s.
  - War: 12–30s silence windows, 2.6s fades, ~50% chance to overlap by ~1.8s.

## Integration Hooks
- `AudioBridge.startAmbient()` arms the territory playlist and restarts the overworld ambient loop once the browser allows playback.
- `AudioBridge.enterWarAmbience()` pauses the overworld loop and pivots the conductor into the war playlist.
- `AmbientSoundscape` is exported via `window`/`module.exports` so other systems (or future UI controls) can inspect or tune the scheduler. Tracks pull from the organized `/sfx/ambient`, `/sfx/combat`, `/sfx/ui`, and `/sfx/system` folders.

## Extending
- To add more variations, append to a `variations` array with `weight` tuned to your desired frequency.
- To tweak ambience pacing, adjust `AMBIENT_STATES` durations/fade values or add new modes (e.g., `BOSS`, `SIEGE`).
- Keep tests in `tests/audio.test.js` updated when adding new tracks to ensure manifest coverage and conductor behavior remain predictable.
