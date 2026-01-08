# Build and CI notes

This project now ships a Rollup bundle to reduce the 15+ blocking `<script>` tags down to a single deferred asset.

## Bundling
- Entry point: `scripts/bundle-entry.js`
- Command: `npm run build`
- Output: `dist/assets/game-[hash].js` and `dist/Wargame.html` with the hashed bundle injected via `build/inject-bundle.js`.
- The bundle entry publishes `bootstrapGame`/`createGameCore` via `publishBootstrapHandles` so HTML entry points can still call the bootstrap without relying on implicit globals.

### Legacy cutover notes
- The `ensureGlobalShims` fallback was removed during the legacy shim audit; bundled builds no longer auto-populate globals like `Persistence` or `ImperialMandates`.
- Any remaining global lookups must be provided by the bundle entry or explicit dependency injection, and tests now assert that no shim layer is required.

## Testing
- Runner: `npm test`
- Harness: `tests/run-all.js` stubs the DOM APIs and transpiles both `.js` and `.mjs` suites through Babel for Node compatibility.
- Smoke coverage: `tests/globalShimSmoke.test.js` validates bootstrap dependency resolution and handle publishing, and `tests/bootstrapStorage.test.js` enforces the guarded localStorage probe.

## CI
- Workflow: `.github/workflows/ci.yml`
- Triggers: push/PR
- Steps: `npm ci` → `npm run build` → `npm test` (with Node.js 18 and npm caching)
