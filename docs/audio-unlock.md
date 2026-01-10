# Audio Unlock and Retry Flow

## Overview
Modern browsers block `Audio.play()` until a user gesture or a visibility change unlocks the audio
stack. Wargame’s `AudioManager` keeps a queue of blocked playback attempts so UI/combat cues can
resume once the browser allows audio. This flow is intentionally conservative: it only retries the
exact node that was blocked to avoid changing variant selection or spamming new audio instances.

## Runtime Behavior
- When `AudioManager` calls `node.play()` and the promise rejects, the manager records the failure
  as a **pending play**.
- Pending plays store the node, manifest key, variant key, base volume, and whether the original
  request wanted a reset or loop.
- `AudioManager.unlock()` retries every pending entry, reapplying volume/loop settings and
  resetting `currentTime` when requested.
- `lastPlayed` timestamps only update after a successful play so cooldowns reflect real playback.

## Unlock Triggers
The runtime wires an unlock hook in `scripts/bundle-entry.js`:
- **User interactions:** `click`, `keydown`, and `touchstart` call `GameAudio.unlock()`.
- **Visibility changes:** when the document becomes visible again, `GameAudio.unlock()` runs.

## Debug Diagnostics
When audio debugging is enabled, the `AudioDebugBus` stores the most recent blocked playbacks
(max 5) so the overlay can display which sounds were blocked and why.
