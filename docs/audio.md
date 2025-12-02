# Audio System

The game routes every sound effect through `scripts/audio.js`, which exposes an `AudioManager` instance (`window.GameAudio`) backed by the `/sfx` mp3 library. Assets are grouped by role (`/sfx/ambient`, `/sfx/combat`, `/sfx/ui`, `/sfx/system`) to match the manifest. The manager caches `Audio` elements, enforces per-sound cooldowns, and provides optional overlap playback for rapid-fire cues such as arrows. Variations are weighted so repeated actions sound lively instead of repetitive.

## Event Map
- **wardrum.mp3** — fired immediately by `enterCombat()` as a hard transition stinger and still lives inside the WAR playlist.
- **sword*.mp3** — five weighted sword impacts selected randomly for melee attacks.
- **arrow*.mp3** — four weighted bow shots for archer volleys.
- **tower*.mp3** — three weighted blasts for towers/castles.
- **rare*.mp3** — three weighted cues for legendary (dragon) strikes.
- **defeat.mp3** — used when the player retreats or loses a war.
- **victory.mp3** — used when the player wins a war.
- **city.mp3** — plays when claiming a town hex.
- **choptree.mp3** — plays when claiming a forest hex.
- **ambient.mp3** — birds/wind loop for the overworld.
- **ambiance_upbeat.mp3** and **ambiance_uplifting.mp3** — territory music scheduled with random silences.
- **ambiance_sorrow.mp3** and **ambiance_dark.mp3** — war music scheduled with random silences.

## Ambience and Music
- `AmbientSoundscape` (see `scripts/audio.js`) uses weighted playlists per mode (`TERRITORY` vs `WAR`) to decide which track should play next.
- Music does **not** loop; instead, the conductor schedules the next track after a random silence window and sometimes crossfades by starting the next track before the previous fade-out ends.
- Crossfades are capped to 10 seconds to avoid piling up multiple songs; only the outgoing track and the incoming track can overlap.
- Default timing: territory silences range ~20–42s with gentle 2.2s fades; war silences range ~12–30s with 2.6s fades and slightly more aggressive crossfades.

## Integration Notes
- The `AudioBridge` in `scripts/script.js` safely delegates to `GameAudio` and `AmbientSoundscape`, no-oping when the APIs are unavailable (e.g., tests).
- `armAmbientLoop()` locks the conductor into `TERRITORY` mode and begins scheduling the peaceful playlist.
- `haltAmbientLoop()` clears the conductor so no playlists continue running in the background.
- `enterCombat()` stops any active ambience immediately, plays `wardrum.mp3`, and moves the conductor into `WAR` mode.
- `exitCombat(outcome)` plays the relevant stinger (`victory` or `defeat`) and returns the conductor to `TERRITORY` so the overworld ambience resumes after wins, losses, or retreats.
- Per-sound cooldowns prevent excessive layering while keeping overlap enabled for rapid attacks.
- To add a new effect, extend `SFX_MANIFEST` in `scripts/audio.js` with either a `src` or a `variations` array and trigger it via `AudioBridge.play()`.
