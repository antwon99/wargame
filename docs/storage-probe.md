# Storage Probe (localStorage Capability Check)

## Purpose
`storageProbe` detects whether `localStorage` is both available and writable so persistence can safely fall back when storage is blocked (privacy modes, security exceptions). Implementation is in `scripts/storageProbe.js`.

## Inputs / Outputs
- **Inputs:**
  - `canUseLocalStorage(scope, options)`
    - `scope` (window-like object) that exposes `localStorage`.
    - `options` with optional `logger` and `silent` fields for warning routing.
  - `initStorageProbe(target)`
    - `target` global scope that receives `StorageProbe`.
- **Outputs:**
  - `canUseLocalStorage` returns `true` when a probe `setItem/removeItem` succeeds; otherwise `false`.
  - `initStorageProbe` returns the probe API and (when `target` is defined) attaches it to `target.StorageProbe`.

## Thresholds / Logic
- **Probe key:** attempts to write and remove `__hex-war-storage-probe__` to validate write permissions.
- **Failure handling:** returns `false` on missing APIs or security errors, optionally logging a warning unless `silent` is true.

## Gameplay Interaction
Directly affects save/load behavior. When the probe fails, the bootstrap path can avoid persistence writes to prevent crashes, resulting in sessions that may not save progress but otherwise keep gameplay running.
