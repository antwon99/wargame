# Ambience Renderer

The ambience renderer layers multiple low-opacity, grayscale cloud sheets between the void fill and the tile rendering pass. Each sheet reuses a baked noise texture and applies independent drift to avoid static patterns while keeping GPU overhead low.

## Composition order
- **Void fill** paints the base space colour.
- **Ambience clouds** draw using repeating patterns that drift over time.
- **Readability mask** punches a radial hole centred on the active territory cluster so tiles and UI stay crisp.
- **Fog and tiles** render on top as before.

## Layer defaults
- Three layers with opacities of `0.05`, `0.035`, and `0.028`.
- Drift vectors of `(8, -3)`, `(-5, 6)`, and `(14, 9)` to keep the scene gently dynamic.
- Noise scales of `520`, `640`, and `780` pixels with densities between `0.14` and `0.22` for soft blotches.

## Readability thresholds
- Fade radius factor defaults to `0.55` of the largest viewport dimension.
- The inner fade keeps at least `32px` of clear space with a `0.35` feather to avoid harsh edges.

## Configuration
`featureToggles.ambience` accepts overrides for `enabled`, `fadeRadiusFactor`, `fadeFeather`, and a custom `layers` array with per-layer `opacity`, `drift`, `scale`, and `density` values. Overrides are merged at bootstrap time without mutating the shared defaults.
