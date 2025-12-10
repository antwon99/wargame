## Hex grid helpers

`scripts/grid/hexGrid.js` exposes the axial `Hex` helper alongside the shared `Layout` coefficients and `SQRT3` constant used by renderers and hit-tests.

- **Exports:** default `HexGrid` bundle plus named `Hex`, `Layout`, `SQRT3`, and `resolveHexGrid()`.
- **Window attachment:** when a `window` object exists, `HexGrid` is placed on `window.HexGrid` for non-module scripts.
- **Coordinate math:** `Hex.distance(a, b)` returns axial distance, `Hex.neighbor(hex, dir)` steps in one of six directions, and `Hex.fromPixel(layout, point)` / `hex.toPixel(layout)` convert between screen and grid space using the provided layout (size + origin merged with `Layout` coefficients).
- **Rounding:** `Hex.round()` snaps fractional cube coordinates to the nearest valid hex.
- **Fallback resolution:** `resolveHexGrid({ hexGridModule, windowObj })` chooses from an injected module, a `window.HexGrid` bag, or the bundled defaults, making tests and headless harnesses deterministic.
