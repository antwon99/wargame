# Ambient music pacing

The ambient music conductor now mirrors Minecraft-like ambience: tracks start gently, play through without heavy overlaps, and leave randomized pockets of silence. Key tuning constants live near the top of `scripts/audio.js` under `AMBIENT_DEFAULTS`:

- `gentleStartVolume`: starting gain for a new track before the fade-in.
- `fadeInMs`: default fade-in duration when a track begins.
- `fadeOutMs`: default fade-out duration when a track ends naturally.
- `tailFadeMs`: short fade used when interrupting an in-progress track (e.g., mode switch) to avoid long overlaps.
- `minSilenceMs` / `maxSilenceMs`: bounds for the random silence between tracks.
- `initialDelayRangeMs`: randomized delay window before the very first track starts after initialization.

Each ambient state can override these defaults via its `silenceRangeMs`, `fadeMs`, and per-track volume overrides inside `AMBIENT_STATES` in `scripts/audio.js`. Only one ambient audio node is kept active at a time; the conductor stops any previous node before scheduling the next pick and clears related timers.

## Layered ambience beds (wind + war horns)

- The overworld wind bed is currently **disabled** until a distinct loop replaces the shared ambient asset, preventing the same file from playing twice when ambience starts.
- Combat spins up a looping horn/drum bed (`war_bed_horn`) at ~0.42 gain (enters from ~0.16 over ~1.2s) to keep battle maps tense even between stingers.
- Beds are owned by the `AmbientConductor` in `scripts/audio.js` via each state's `beds` array; they fade out whenever the mode changes so only one bed plays at a time.
- A feature flag (`bedsEnabled`, default `true`) is available in the conductor options so tests can disable the extra loops without changing gameplay defaults.

### Performance and safety

- Beds reuse the shared `AudioManager` cache so long droning loops do not allocate new `<audio>` nodes on every state change.
- The conductor caps fade durations to `maxOverlapMs` and uses `stopBeds` to aggressively pause/reset nodes after fades, keeping the active audio node count low.
- `startBedsForMode` only starts beds defined for the current mode and immediately fades out any leftovers, preventing cross-mode layering during rapid combat transitions.
