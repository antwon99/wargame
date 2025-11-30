# Audio System Overview

This document summarizes the lightweight audio singleton embedded in `script.js`.

## Responsibilities
- Prevent music stacking by pausing existing music before starting a new track.
- Keep ambiance separate from music so territory loops can resume after combat.
- Allow overlapping SFX playback without touching the active music loop.
- Provide a simple snapshot (via `describeActiveSources`) for the on-screen debug overlay.

## Key API
- `AudioSystem.playMusic(path)`: Pauses the previous music element and starts a new looping track.
- `AudioSystem.setAmbiance(path)`: Starts or swaps the looping ambiance track.
- `AudioSystem.playSFX(path)`: Fire-and-forget sound effects; overlap is permitted and pooled nodes reset `currentTime` to cut latency.
- `AudioSystem.stopAll()`: Pauses music, ambiance, and any tracked sources.

## Startup Initialization
- `initAudio()` (in `script.js`) now seeds the peaceful ambiance loop and randomly picks between `ambiance_upbeat.mp3` and `ambiance_uplifting.mp3` for the opening BGM.
- The `AudioSystem` keeps a preload cache (starting with `sfx/tower.mp3`) so high-frequency effects are buffered before first use.

## Debug Overlay
`updateAudioDebug()` (defined in `script.js`) reads directly from `AudioSystem` to show:
- Current music and ambiance assignments
- Active audio node count and filenames
- Master volume and current game state

The overlay is intentionally minimal and fixed in the top-left corner for easy removal once issues are resolved.
