# Ambient music pacing

The ambient music conductor now mirrors Minecraft-like ambience: tracks start gently, play through without heavy overlaps, and leave randomized pockets of silence. Key tuning constants live near the top of `scripts/audio.js` under `AMBIENT_DEFAULTS`:

- `gentleStartVolume`: starting gain for a new track before the fade-in.
- `fadeInMs`: default fade-in duration when a track begins.
- `fadeOutMs`: default fade-out duration when a track ends naturally.
- `tailFadeMs`: short fade used when interrupting an in-progress track (e.g., mode switch) to avoid long overlaps.
- `minSilenceMs` / `maxSilenceMs`: bounds for the random silence between tracks.
- `initialDelayRangeMs`: randomized delay window before the very first track starts after initialization.

Each ambient state can override these defaults via its `silenceRangeMs`, `fadeMs`, and per-track volume overrides inside `AMBIENT_STATES` in `scripts/audio.js`. Only one ambient audio node is kept active at a time; the conductor stops any previous node before scheduling the next pick and clears related timers.
