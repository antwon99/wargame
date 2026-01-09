# Real-World Overworld (Moonshot)

## Why this exists
This module is the experimental bridge between the overworld hex grid and real-world coordinates. It lets the game translate GPS coordinates into a deterministic hex key and request a terrain classification from a provider that represents satellite data. The initial implementation is synthetic (it uses deterministic signals), but the pipeline is designed to swap in real satellite tiles or a backend service later without changing how the game claims land.

## Core ideas
- **Hex projection:** Latitude/longitude is projected into local meters using a lightweight equirectangular projection anchored at a configurable origin.
- **Hex sizing:** The grid uses a configurable hex size in meters (default: ~250m) to keep an MMO-scale pace. A smaller face length (10m) is kept as metadata so future tuning can compress or expand travel requirements without breaking saves.
- **Provider-driven terrain:** The provider receives `{lat, lon, axialKey}` and returns a terrain type plus metadata. The default provider synthesizes terrain from deterministic signals so the map stays consistent across sessions.

## Key hooks in code
- `scripts/realWorldOverworld.js` defines `RealWorldOverworldIndex`, projection helpers, and the default provider.
- `scripts/game/state.js` adds a `realWorld` bucket to the overworld state so the projection has a home.
- `scripts/game/core.js` adds `configureRealWorldOverworld()` and `claimRealWorldLocation()` for runtime usage.

## Provider expectations
A provider should return:
- `type`: one of the existing overworld tiles (field, forest, town, mine, shrine, ruin, water).
- `tags`: array of descriptive tags for UI overlays or analytics.
- `source`: a string identifier (for example `sentinel-2` or `synthetic-satellite`).
- `signal`: arbitrary diagnostic data for debugging terrain decisions.

## Gameplay flow (current)
1. Configure the real-world grid with `configureRealWorldOverworld()` to set origin, hex size, and provider.
2. Call `claimRealWorldLocation({ lat, lon })` to resolve a hex, classify the terrain, and claim it.
3. The claim is stored in `overworld.hexes` just like a regular overworld tile, so all existing rendering and income systems work.

## Next steps for true satellite integration
- Replace the synthetic provider with a server-backed pipeline that queries real imagery.
- Add a moderation layer so claims are validated server-side before being accepted.
- Stream terrain overlays and borders into the client for large-scale map browsing.
