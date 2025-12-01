# Audio System Overview

The game routes all sounds through the `scripts/audio.js` stack: a manifest-driven `GameAudio` manager, a randomizing `AmbientSoundscape` scheduler, and a thin `AudioBridge` facade in `scripts/script.js`.

## Manifest (GameAudio)
- `SFX_MANIFEST` in `scripts/audio.js` maps keys to `{ src, loop?, volume?, cooldownMs?, allowOverlap?, isAmbient?, variations? }` entries. Keys are stable handles consumed by gameplay code (`AudioBridge.play('arrow')`). Manifest entries source mp3s from the organized `/sfx/ambient`, `/sfx/combat`, `/sfx/ui`, and `/sfx/system` subfolders.
- **Weighted variants**: Provide `variations: [{ src, weight?, id? }, ...]` to bias selection while keeping attack spam lively. `GameAudio` picks a variation per play call using a cached `WeightedSelector`.
- **Cooldowns**: `cooldownMs` throttles repeat requests per manifest key; overlap is still allowed when `allowOverlap` is true (clones the cached node). Cooldowns can be overridden per call via `AudioBridge.play(key, { cooldownMs })` when needed.
- **Ambient loops**: Mark a manifest entry with `isAmbient: true` to expose it as the default loop for `GameAudio.startAmbientLoop()`. Other ambience/music tracks live in the `AmbientSoundscape` playlists (below).

## AmbientSoundscape Scheduling
- `AmbientSoundscape` orchestrates playlists per mode (`TERRITORY` and `WAR`) with weighted track pools, silence windows, and fades.
- Each mode defines `tracks` (with optional `weight`, `startVolume`, `volume`, `fadeMs`), `silenceRangeMs` ([min, max] gap before the next song), `fadeMs` (soften in/out), `overlapMs` (cap on crossfades), `crossfadeChance`, and `maxTrackMs` (safety stop).
- The conductor schedules the next track after a random silence, sometimes launching early to crossfade. Fades are clamped to 10s so only one outgoing and one incoming song overlap.

## Entry Points
- `AudioBridge.play(key, options?)`: Primary hook for gameplay SFX and ad-hoc music cues. Delegates to `GameAudio.play` when available and safely no-ops in tests.
- `GameAudio.startAmbientLoop()`: Starts the manifest-defined ambient loop (used sparingly now that `AmbientSoundscape` owns playlists).
- `AmbientSoundscape.enterMode(mode)` / `AmbientSoundscape.start()`: Swap and launch the scheduler for `TERRITORY` vs `WAR` playlists.

## Debug Overlay
`updateAudioDebug()` (in `scripts/script.js`) reads from the global `AudioDebugBus.snapshot()` to render:
- Intended track (last scheduled by `AmbientSoundscape`)
- Active audio sources with filenames/keys
- Master volume and current game state

The overlay stays minimal and pinned to the top-left for easy removal once audio QA wraps up.

## Usage Map (who calls what)
- **Overworld idle**: `Game.armAmbientLoop()` → `AmbientSoundscape.enterMode('TERRITORY')` then `AmbientSoundscape.start()` to keep peaceful playlists rolling.
- **Start war**: `Game.startWar()` switches to `AmbientSoundscape.enterMode('WAR')` + `start()` and triggers war VFX; combat SFX then flow through `AudioBridge.play` via `Game.playSound()`.
- **End war**: `Game.endWar()` returns to `armAmbientLoop()` (territory mode) and plays `victory`/`defeat` cues through `AudioBridge.play`.
- **Hex claims**: `Game.claimHexLogic()` plays `city` or `choptree` via `AudioBridge.play` when towns/forests are captured.
- **Unit/building attacks**: Combat loop calls `AudioBridge.play` (through `Game.playSound`) for `tower`, `arrow`, `sword`, and `rare` when attacks fire.
