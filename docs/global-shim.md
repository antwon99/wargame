# Global Shim (Bootstrap Dependency Resolver)

## Purpose
`globalShim` bridges legacy globals and explicit dependency injection so the boot pipeline can resolve runtime helpers without mutating global scope. It centralizes how the bundle entry point and tests map global names to modern dependency keys, ensuring older HTML entry points still work. The implementation lives in `scripts/globalShim.js`.

## Inputs / Outputs
- **Inputs:**
  - `buildBootstrapDependencies(scope, providers)`
    - `scope` (window-like object) to read legacy global handles (e.g., `InputHelpers`, `StorageProbe`).
    - `providers` (optional object) containing explicit dependency overrides by modern or legacy key.
  - `publishBootstrapHandles(bootstrapGame, createGameCore, scope)`
    - `bootstrapGame` and `createGameCore` functions to publish.
    - `scope` (optional window-like object) to receive globals.
- **Outputs:**
  - `buildBootstrapDependencies` returns a dependency map containing `inputHelpers`, `storageProbe`, `debugToggles`, and other runtime systems.
  - `publishBootstrapHandles` mutates `scope` to expose `bootstrapGame` and `createGameCore` for legacy consumers.

## Thresholds / Logic
- **Resolution priority:** provider override ➜ provider legacy key ➜ legacy global on `scope`. This prevents accidental global pollution while still honoring existing script-tag order.
- No gameplay thresholds; the logic only determines which dependencies are wired into the bootstrap step.

## Gameplay Interaction
Indirect. By stabilizing how boot-time dependencies are resolved, the shim ensures gameplay systems (input, persistence, overlays) are available regardless of entry point style, preventing missing systems that would otherwise block or degrade gameplay startup.
