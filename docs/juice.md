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
- Minimal Web Audio synth with slice (attack) and thud (loss/retreat) envelopes.
- Triggered on War clicks and non-victory outcomes; guarded when AudioContext is unavailable.

## Particle Bursts
- `spawnParticleBurst(x, y, count)` emits 5-8 square particles that move outward and fade.
- Used for quick cues on unit death or construction events.

## Helper Utilities
- `juice.js` exports `createBurstVectors` and `clampShakeDuration` for deterministic tests and UI bounds.
