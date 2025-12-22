# Build and CI notes

This project now ships a Rollup bundle to reduce the 15+ blocking `<script>` tags down to a single deferred asset.

## Bundling
- Entry point: `scripts/bundle-entry.js`
- Command: `npm run build`
- Output: `dist/assets/game-[hash].js` and `dist/Wargame.html` with the hashed bundle injected via `build/inject-bundle.js`.
- The shim layer in `scripts/globalShim.js` guarantees that legacy globals (persistence, mandates, tutorial helpers, etc.) remain available after bundling.

## Testing
- Runner: `npm test`
- Harness: `tests/run-all.js` stubs the DOM APIs and transpiles both `.js` and `.mjs` suites through Babel for Node compatibility.
- Smoke coverage: `tests/globalShimSmoke.test.js` fails if required globals are missing after shimming, and `tests/bootstrapStorage.test.js` enforces the guarded localStorage probe.

## CI
- Workflow: `.github/workflows/ci.yml`
- Triggers: push/PR
- Steps: `npm ci` → `npm run build` → `npm test` (with Node.js 18 and npm caching)
