# Game Juice Effects

This document outlines the lightweight visual and audio feedback hooks that accompany HUD and combat interactions.

## Floating Text
- `showFloatingText(x, y, text, cssClass)` spawns a temporary label at screen coordinates.
- Text drifts upward and fades within ~0.8s before auto-removing.
- Used by War/Retreat triggers and post-battle summaries.

## Camera Shake
- `.shake` class animates the `#game-container` transform for 0.3s.
- Applied when engaging War to emphasize combat transitions.

## Sound Effects
- Backed by the `AudioManager` in `scripts/audio.js`, which loads mp3s from the organized `/sfx/ambient`, `/sfx/combat`, `/sfx/ui`, and `/sfx/system` folders.
- Key cues: wardrum (war start), sword (soldier attacks), arrow (archers/towers), defeat (retreat/loss), city/forest claiming, and an overworld ambient loop.
- All calls route through the `AudioBridge` in `audio/bridge.js` so gameplay can safely proceed if audio is blocked.

## Particle Bursts
- `spawnParticleBurst(x, y, count)` emits 5-8 square particles that move outward and fade.
- Used for quick cues on unit death or construction events.

## Helper Utilities
- `juice.js` exports `createBurstVectors` and `clampShakeDuration` for deterministic tests and UI bounds.
