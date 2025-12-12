# Platform scaling

The platform adapter derives a simple rendering profile for the current browser and feeds it into the canvas resizer. The goals are:

- Identify mobile or narrow screens even when user agents are misleading.
- Match the canvas backing store to the device pixel ratio (capped at 3x) for crisp text and hex outlines.
- Expose a baseline zoom value so the camera starts slightly zoomed out on small screens.

## Detection rules

- **Mobile detection:** A device is treated as mobile if the user agent matches `Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile` **or** if the shortest viewport dimension is `< 900px`.
- **Device scale:** The reported `devicePixelRatio` is clamped between `1` and `3` to avoid over-allocation on high-DPI hardware.
- **Base zoom:** Mobile profiles default to `0.82` to show more of the map, while desktop remains at `1.0`.

## Application

`PlatformAdapter.sizeCanvasForDisplay` sets the canvas backing store to `viewport * deviceScale`, applies the same CSS width/height for layout, and resets the rendering transform using `setTransform(scale, 0, 0, scale, 0, 0)` so draw calls use logical CSS pixels.

`scripts/script.js` also tags the document with `is-mobile` / `is-desktop` classes after applying the detected profile so HUD elements can opt into touch-friendly spacing and stacking without affecting the desktop layout. The same hook sets `--ui-scale` and `--ui-font-scale` CSS custom properties on the `<body>` (mobile defaults to `0.9` for both) so the HUD can shrink button padding and typography without changing desktop sizing.
