# Paint Claim Mode

## Purpose
Paint Claim Mode lets players drag across frontier tiles to spend wood and claim them without repeatedly clicking. It is designed to avoid camera-drag conflicts by requiring an explicit HUD toggle.

## How it Works
- **Activation:** Toggle the **🖌️ Paint Claim** button in the overworld HUD. The button stays pressed while the mode is active.
- **Input routing:** When the mode is enabled and the pointer is down, drag events call `Game.onPaint(x, y)` instead of panning the camera.
- **Tile detection:** `onPaint` calls `isPointerOnDrawnHex` to resolve the current hex.
- **Cost + claim:** If the hex is claimable and wood is available, `claimHexLogic` is invoked and wood is deducted.
- **Double-spend guard:** The last painted tile key is stored; a matching key is ignored until the pointer is released (`resetPaintClaimDrag`).

## Messaging and Feedback
- HUD status text shows whether paint mode is on and reports wood spend or shortages.
- Successful claims report the wood spent and the remaining wood count.
- Shortages report the missing wood amount needed to claim the tile.

## Logic Notes
- Paint claims only run in the overworld state.
- Reclamation targeting blocks paint mode and surfaces a warning until it completes.
- The status tone uses `success`, `warning`, `info`, or `muted` to color the HUD text.
