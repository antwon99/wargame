# Boot Overlay

## Purpose
The boot overlay is a lightweight, fully opaque loading mask that appears on page
load and blocks the player from seeing the empty map, UI wiring, or debug flashes.
 It stays visible until the game finishes state hydration, then waits for the
 player to confirm readiness.

## Behavior
- **Visible by default:** The overlay is rendered in `Wargame.html` and styled in
  `style.css` with an opaque background so it shows immediately.
- **Loading/ready copy:** A loading line ("Preparing the frontier ...") is
  visible during bootstrap. Once the game core finishes initialization, the
  overlay reveals a ready prompt and button while keeping the UI masked.
- **Failure feedback:** When bootstrap dependencies are missing, the overlay
  reveals a small "Loading failed" block so players know what stalled the boot
  flow before the main UI is ready.
- **Dismissal timing:** `Game.init()` signals readiness through `BootManager`,
  which keeps the overlay visible until the player clicks the ready button and
  then allows the intro overlay to appear (if still active).
- **Animation:** The hide operation adds a `boot-hidden` class that fades opacity
  before removing the overlay from layout once the transition ends.

## Integration Points
- **HTML:** `Wargame.html` defines the overlay DOM.
- **CSS:** `style.css` provides the `boot-overlay` and `boot-hidden` styles.
- **Runtime:** `scripts/bootOverlay.js`, `scripts/bootManager.js`, and
  `scripts/game/core.js` manage the lifecycle and timing.
