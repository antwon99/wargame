# Imperial mandate modularity

The imperial mandate system now ships in two layers:

- **`scripts/imperialMandatesCore.js`** wires runtime dependencies together and hands them to the state machine.
- **`scripts/imperialMandates/state.js`** contains the state machine, recurrence logic, and data transforms. It accepts an adapter so tests can instantiate the core without touching DOM or audio globals.
- **`scripts/imperialMandates/registry.js`** resolves the declarative registry and provides blueprint lookup utilities.
- **`scripts/imperialMandates/uiAdapter.js`** exposes the minimal adapter surface (audio guard, banners, notifications) used by the state machine.
- **`scripts/imperialMandatesAdapter.js`** hosts UI/audio helpers (imperial modal rendering, notification enqueue, audio guards, and rebel callouts). `scripts/imperialMandates.js` wires this adapter into the core for the browser build.

Headless tests can import `imperialMandatesCore` directly and pass a lightweight adapter to observe mandate progression while stubbing out UI side effects. The default adapter still exposes the original behaviors for the in-browser experience.
