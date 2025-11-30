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
- `AudioSystem.playSFX(path)`: Fire-and-forget sound effects; overlap is permitted.
- `AudioSystem.stopAll()`: Pauses music, ambiance, and any tracked sources.

## Debug Overlay
`updateAudioDebug()` (defined in `script.js`) reads directly from `AudioSystem` to show:
- Current music and ambiance assignments
- Active audio node count and filenames
- Master volume and current game state

The overlay is intentionally minimal and fixed in the top-left corner for easy removal once issues are resolved.
