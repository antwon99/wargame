# Audio Debug Console

This diagnostic overlay surfaces live information about music playback so we can track down the runaway "ghost" track that keeps playing over SFX.

## What it shows
- Current music track the conductor intends to play.
- Active audio elements currently playing in the browser (by filename/key).
- Master volume value exposed by the audio manager.
- Current game mode (Territory vs. War).
- Snow toggles for the seasonal overlay (snow enabled vs. snowfall coverage).

## How it works
- `scripts/audio.js` now exposes a lightweight `AudioDebugBus` behind a `AUDIO_DEBUG_BUS=true`/`DebugToggles.audioDebugBus=true` feature flag so production loads skip the diagnostics entirely by default. When enabled, the bus registers every audio node when playback starts and removes it once playback ends or is paused.
- The ambient conductor reports its intended track whenever a new song is launched, enabling comparison against the active node list.
- `audio/debugPanel.js` renders the `#audio-debug-panel` overlay roughly twice per second using its exported `update()` helper and wires snow checkboxes back to `Game.setSnowToggle` through a small adapter so temporary visual switches stay contained in the debug menu.

## Removal
This console is isolated to `scripts/audio.js`, `Wargame.html`, `style.css`, and `audio/debugPanel.js`. Delete the `AudioDebugBus`, the overlay `<div>`, related styles, and the debug panel module to disable it after debugging the music system. You can also leave the code in place but simply avoid setting the feature flag to keep the console dormant in production builds.
