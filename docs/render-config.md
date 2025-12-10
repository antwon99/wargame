## Render configuration

`scripts/render/config.js` centralizes camera drift and ambience tuning so visual tweaks stay isolated from gameplay code.

- **Exports:** default `RenderConfig` bundle plus named `CAMERA_MOTION_CONFIG`, `AMBIENCE_CONFIG`, and `resolveRenderConfig()`.
- **Camera drift:** `CAMERA_MOTION_CONFIG` toggles the idle camera float with amplitude, parallax strength, and speed controls.
- **Ambience layers:** `AMBIENCE_CONFIG` governs layered haze (enable flag, fade radius/feather, and per-layer opacity, drift, scale, and density values).
- **Window attachment:** when a `window` object exists, the bundle attaches to `window.RenderConfig` for script-tag consumers.
- **Fallback resolution:** `resolveRenderConfig({ renderConfigModule, windowObj })` pulls from an injected module or `window.RenderConfig`, otherwise returns the bundled defaults—useful for tests or headless renders.
