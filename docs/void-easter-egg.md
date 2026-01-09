# Void Easter Egg (Out-of-Bounds Messaging)

## Purpose
`voidEasterEgg` provides deterministic messaging when players click outside the playable area. It keeps the flavor text consistent across runtime and tests without DOM dependencies. Implementation is in `scripts/voidEasterEgg.js`.

## Inputs / Outputs
- **Inputs:**
  - `VoidEasterEgg.computeMessage(count, rng)`
    - `count` is the 1-indexed number of void clicks.
    - `rng` (optional) injected random function for tests.
  - `initVoidEasterEgg(target)`
    - `target` global scope that receives `VoidEasterEgg`.
- **Outputs:**
  - `computeMessage` returns `{ message, isSassy }` where `message` is either the base prompt or a random quip.
  - `initVoidEasterEgg` returns the helper object and (when `target` is defined) attaches it to `target.VoidEasterEgg`.

## Thresholds / Logic
- **Every 6th click:** a sassy message is selected. All other clicks return the base `"Out of Bounds"` message.
- **Random selection:** sassy messages are chosen by RNG against the configured message list for variety while remaining deterministic in tests.

## Gameplay Interaction
Minor. It adds flavor feedback to clicks in non-playable space, reminding players to return to the battle while keeping the UI responsive.
