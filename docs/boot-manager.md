# Boot Manager

## Purpose
BootManager centralizes the game's boot lifecycle so loading, intro, and ready
states can consistently toggle overlays, notification guards, audio guards, and
debug visibility. It replaces ad-hoc DOM checks with a single phase machine.

## Phases
- **LOADING:** Show the boot overlay and block UI audio/notifications while the
  game hydrates saves.
- **INTRO:** Hide the boot overlay and allow the intro overlay to reveal once the
  UI bindings are ready.
- **READY:** Release UI guards so notifications and combat stingers can fire.

## Behavior
- `setBootPhase(phase)` updates the phase and synchronizes:
  - Boot overlay visibility (shown during LOADING, hidden otherwise).
  - Intro overlay readiness via `notifyUIReady()` when entering INTRO.
  - Debug log visibility (hidden during LOADING/INTRO).
  - Audio UI guard via `GameAudio.setUiOverlayGuard`.
  - Notification stack blockers through BootManager listeners.

## Integration Points
- **Core boot flow:** `scripts/game/core.js` calls `setBootPhase` before snapshot
  loads, after UI bindings, and when the intro is dismissed.
- **Notifications:** `scripts/notificationStack.js` subscribes to boot phase
  updates to block pointer events until READY.
- **Audio guard:** `scripts/bootManager.js` toggles the audio overlay guard to
  prevent combat stingers during boot overlays.
