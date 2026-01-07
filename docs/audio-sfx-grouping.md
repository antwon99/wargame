# SFX Grouping for Combat Bursts

Large battles can request many SFX in a single frame, especially during mass
death events. To keep audio responsive on lower-end hardware, the `AudioManager`
supports a **grouped playback window** that collapses bursts into a single
playback per time slice.

## How it works
- Each manifest entry can define a `groupKey`, `groupWindowMs`, and
  `maxGroupPlays`.
- When multiple `AudioBridge.play()` calls share the same `groupKey`, only the
  first `maxGroupPlays` requests inside `groupWindowMs` will fire.
- The window resets once `groupWindowMs` has elapsed, allowing the next burst to
  play.

## Current thresholds
- **Combat deaths:** `groupKey: "combat-death"`, `groupWindowMs: 140`,
  `maxGroupPlays: 1`.
  - Applies to both `death` and `raredeath` so a large volley of deaths resolves
    into a single audio cue.

## Where to update
- `scripts/audioConfig.js` — tweak the grouping values on the SFX manifest
  entries.
- `scripts/audio/sfxRouting.js` — grouping logic lives inside
  `AudioManager.shouldBlockGroupedPlayback()`.
