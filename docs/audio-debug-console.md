# Audio Debug Console

This diagnostic overlay surfaces live information about music playback so we can track down the runaway "ghost" track that keeps playing over SFX.

## What it shows
- Current music track the conductor intends to play.
- Active audio elements currently playing in the browser (by filename/key).
- Master volume value exposed by the audio manager.
- Current game mode (Territory vs. War).

## How it works
- `scripts/audio.js` now exposes a lightweight `AudioDebugBus` that registers every audio node when playback starts and removes it once it ends or is paused.
- The ambient conductor reports its intended track whenever a new song is launched, enabling comparison against the active node list.
- `scripts/script.js` renders the `#audio-debug-panel` overlay roughly twice per second using the `updateAudioDebug` helper.

## Removal
This console is isolated to `scripts/audio.js`, `Wargame.html`, `style.css`, and `scripts/script.js`. Delete the `AudioDebugBus`, the overlay `<div>`, related styles, and the `AudioDebugConsole` block to disable it after debugging the music system.
