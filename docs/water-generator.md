# Water Generator (Overworld Water Bodies)

## Purpose
`waterGenerator` builds rivers and lakes that expand from a newly revealed hex. It ensures water tiles form contiguous shapes and avoid overwriting existing terrain, adding natural-looking "dead space" and variety. Implementation is in `scripts/waterGenerator.js`.

## Inputs / Outputs
- **Inputs:**
  - `buildWaterBody(startHex, options)`
    - `startHex` axial coordinate of the revealed tile.
    - `options.rng` optional RNG for deterministic tests.
    - `options.riverLengthRange` `[min, max]` inclusive bounds for river length.
    - `options.lakeSizeRange` `[min, max]` inclusive bounds for lake size.
  - `stampWaterBody(game, startHex, body, options)`
    - `game` instance with `addOverworldHex` and `overworld.hexes`.
    - `body` array returned by `buildWaterBody`.
    - `options.owner` (optional) for tile ownership metadata.
- **Outputs:**
  - `buildWaterBody` returns an array of axial hex coordinates including the start hex.
  - `stampWaterBody` returns an array of claimed overworld hexes that were stamped as water.

## Thresholds / Logic
- **River vs lake chance:** 50% split based on `rng() < 0.5`.
- **River length bounds:** defaults to `[4, 9]`, clamped to at least length 2.
- **Lake size bounds:** defaults to `[3, 6]`, clamped to at least size 2.
- **Connectivity guard:** stamping runs a breadth-first traversal so only reachable tiles (from the starting hex) are stamped if intervening tiles are blocked.

## Gameplay Interaction
Revealing a water hex can unlock additional water tiles, creating geographic obstacles and flavor during overworld expansion. The contiguity guard prevents water from overwriting previously claimed terrain and keeps the revealed body coherent for navigation and strategic planning.
