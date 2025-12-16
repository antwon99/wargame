# Ambient scheduler/rng decoupling

The ambient soundtrack now composes dedicated helpers instead of hard-coding
logic inside `scripts/audio.js`:

- `scripts/audioConfig.js` holds the manifest, track groups, and weights so the
  runtime can swap manifests or generate tooling without touching playback
  logic.
- `scripts/ambientConfig.js` holds the mode playlists (territory/war) used by
  the ambient conductor.
- `AmbientScheduler` wraps timer bookkeeping and fade intervals so schedulers
  can be replaced in tests or future environments (e.g., workers).
- `AmbientRandomizer` owns track selection and cadence timing, making the RNG
  injectable and deterministic for tests or analytics.

The conductor calls into the scheduler to set/clear timeouts and into the
randomizer to choose tracks and gaps, keeping the orchestration layer focused on
state transitions. Default timing values still live in `AMBIENT_DEFAULTS` inside
`scripts/audio.js` and can be overridden per mode via `silenceRangeMs` and
`fadeMs`.
