# Boot Overlay

## Purpose
The boot overlay is a lightweight, fully opaque loading mask that appears on page
load and blocks the player from seeing the empty map, UI wiring, or debug flashes.
It stays visible until the game finishes state hydration and UI binding.

## Behavior
- **Visible by default:** The overlay is rendered in `Wargame.html` and styled in
  `style.css` with an opaque background so it shows immediately.
- **Dismissal timing:** `Game.init()` hides the boot overlay only after UI
  bindings and state hydration are complete, and then it triggers the intro
  overlay reveal (if the intro is still active).
- **Animation:** The hide operation adds a `boot-hidden` class that fades opacity
  before removing the overlay from layout once the transition ends.

## Integration Points
- **HTML:** `Wargame.html` defines the overlay DOM.
- **CSS:** `style.css` provides the `boot-overlay` and `boot-hidden` styles.
- **Runtime:** `scripts/bootOverlay.js` and `scripts/game/core.js` manage the
  lifecycle and timing.
