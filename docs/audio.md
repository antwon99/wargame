# Audio System

The game routes every sound effect through `audio.js`, which exposes an `AudioManager` instance (`window.GameAudio`) backed by the `sfx/` mp3 library. The manager caches `Audio` elements, enforces per-sound cooldowns, and provides optional overlap playback for rapid-fire cues such as arrows.

## Event Map
- **wardrum.mp3** — triggered when the player starts a war.
- **sword.mp3** — played when swordsmen land an attack.
- **arrow.mp3** — fired for archer volleys.
- **tower.mp3** — fired for tower and castle volleys so they sound distinct from bowmen.
- **rare.mp3** — legendary unit (dragon) attack cue.
- **defeat.mp3** — used when the player retreats or loses a war.
- **victory.mp3** — used when the player wins a war.
- **city.mp3** — plays when claiming a town hex.
- **choptree.mp3** — plays when claiming a forest hex.
- **ambient.mp3** — territorial ambience that loops while in the overworld; paused during combat.

## Integration Notes
- The `AudioBridge` in `script.js` safely delegates to `GameAudio` and no-ops when the API is unavailable (e.g., tests).
- `armAmbientLoop()` starts the ambient track once the player interacts with the canvas, retrying until the browser allows playback.
- Per-sound cooldowns prevent excessive layering while keeping overlap enabled for rapid attacks.
- To add a new effect, extend `SFX_MANIFEST` in `audio.js` and trigger it via `AudioBridge.play()`.
