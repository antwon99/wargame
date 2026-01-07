# Bootstrap initialization order

The bundled entry point (`scripts/bundle-entry.js`) now calls explicit init functions
instead of relying on side-effect imports. This guarantees predictable boot order and
keeps the browser globals consistent with the runtime dependency graph.

## Current order

1. `initInputHelpers` (`scripts/inputHelpers.js`)
2. `initIntroOverlay` (`scripts/introOverlay.js`)
3. `initAudio` (`scripts/audio.js`)
4. `initJuice` (`scripts/juice.js`)
5. `initPersistence` (`scripts/persistence.js`)
6. `initResearchSystem` (`scripts/researchSystem.js`)
7. `initVoidEasterEgg` (`scripts/voidEasterEgg.js`)
8. `initPlatformAdapter` (`scripts/platform.js`)
9. `initDebugToggle` (`scripts/debugToggle.js`)
10. `initRebelSystem` (`scripts/rebelSystem.js`)
11. `initTutorialHandler` (`scripts/tutorialHandler.js`)
12. `initTutorialCallouts` (`scripts/tutorialCallouts.js`)
13. `initImperialMandateCalendar` (`scripts/mandates/imperialMandateCalendar.js`)
14. `initImperialMandatesCore` (`scripts/mandates/imperialMandatesCore.js`)
15. `initImperialMandatesAdapter` (`scripts/mandates/imperialMandatesAdapter.js`)
16. `initImperialMandateManager` (`scripts/mandates/imperialMandateManager.js`)
17. `initImperialMandates` (`scripts/mandates/imperialMandates.js`)
18. `initStorageProbe` (`scripts/storageProbe.js`)

## Why this order

- Core data helpers and configuration (input helpers, intro overlay, audio, persistence, research, platform, debug toggles) are registered first so the game bootstrap has the expected globals.
- Rebel + tutorial helpers (including the tutorial handler) must exist before mandate systems that reference them.
- The imperial mandate stack is initialized from lowest-level helpers (calendar/core) up through the UI adapter and manager, then the bundle initializer (`initImperialMandates`) wires them together.
- Storage probing runs last so it can observe any configured storage overrides.
