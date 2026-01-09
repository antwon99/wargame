# Debug Toggle (Overlay + Flag Controller)

## Purpose
`debugToggle` coordinates the audio debug overlay visibility and maintains a shared `DebugToggles` flag object for developer-only UI hints. It supports keyboard shortcuts and a UI button while keeping defaults hidden for normal play. Implementation is in `scripts/debugToggle.js`.

## Inputs / Outputs
- **Inputs:**
  - `initDebugToggle(target, options)`
    - `target` (window-like object) that owns `DebugToggles`.
    - `options.document` (optional) document-like object for tests.
  - `toggleDebug(doc)` and `setDebugVisibility(isVisible, doc)`
    - toggles or sets the overlay visibility.
  - `toggleClaimCostLabels(target)`
    - flips the `showClaimCosts` flag.
- **Outputs:**
  - Returns an API object containing `toggleDebug`, `setDebugVisibility`, `toggleClaimCostLabels`, and the key handler (or `null` when no DOM is available).
  - Updates DOM classes/attributes (`visible`, `aria-hidden`, `aria-pressed`) and syncs `DebugToggles.showDebugLog`.

## Thresholds / Logic
- **Keyboard bindings:** `F3`, `` ` ``, or `~` toggles the debug panel; `F8` toggles claim-cost overlays.
- **Boot phase gating:** hides the log panel if the game is not yet in `BOOT_PHASES.READY` and the panel is hidden.
- **Default flags:** `showClaimCosts` and `showDebugLog` default to `false` unless pre-seeded by global overrides.

## Gameplay Interaction
Primarily developer-facing. The overlay displays audio diagnostics and the claim-cost toggle enables visual helpers for balancing and tuning. These do not change gameplay rules, but they alter what information is visible during playtests.
