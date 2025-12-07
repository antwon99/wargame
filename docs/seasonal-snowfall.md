# Seasonal snowfall ambience

The fog backdrop now derives its ambience strength from the in-game calendar supplied by `Timekeeper`. Snowfall replaces the
old fog backdrops for atmosphere only; tile visibility rules remain unchanged.

## Intensity curve
- Months map to a normalized [0..1] intensity with anchors: **Jan (1.0)**, **Feb (~0.9)**, **Mar (~0.65)**, **Nov (~0.65)**,
  **Dec (~0.95)**.
- Summer months (Apr–Oct) default to **0 intensity**, yielding the classic black void. An optional noise floor (0–10%) can be
  enabled via debug to keep a faint drift.
- The controller blends month → intensity over time (lerp) to avoid visual pops as the calendar advances, smoothing the jump
  into November snow without modifying the calendar.

## Render modulation
`SeasonalSnowfallController` exposes a profile consumed by `AmbienceRenderer.applyIntensityProfile()`:
- **Opacity floor**: keeps a slight drift when a noise floor is present.
- **Density + scale**: winter raises blot density while shrinking scale for crisper flakes; summer thins the texture.
- **Drift**: speed ramps up with intensity so winter snow visibly moves.
- **Whiteness**: gradients brighten proportionally to the seasonal strength.
- Legacy gradient/ripple/cluster glows default to **off** (see `fogVisualConfig.mjs`), keeping winter visuals minimalist while
  remaining toggleable for debugging.

## Debug hooks
Use `window.SeasonalSnowfallDebug` to override behavior at runtime:
- `forceWinter()` / `forceSummer()` flip the calendar mapping to peak or floor intensity.
- `freeze(value?)` locks the current (or provided) intensity; `unfreeze()` resumes live updates.
- `setNoiseFloor(value)` adjusts the optional summer drift cap (0–0.1).
- `getState()` reports the active mode and intensities.

## Integration points
- `scripts/seasonalSnowfall.js` computes the intensity profile from the `Timekeeper` calendar and smooths transitions.
- `scripts/ambienceRenderer.js` applies the profile to layer opacity, density, scale, drift speed, and whiteness without
  reallocating textures every frame.
- `scripts/script.js` updates the seasonal profile each loop, forwards it to the ambience renderer, and disables legacy fog
  backdrops by default so summer returns to the dark void aesthetic.
