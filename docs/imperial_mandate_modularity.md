# Imperial mandate modularity

The imperial mandate system now ships in two layers:

- **`scripts/mandates/imperialMandatesCore.js`** contains the state machine, recurrence logic, and data transforms. It accepts an adapter so tests can instantiate the core without touching DOM or audio globals.
- **`scripts/mandates/imperialMandatesAdapter.js`** hosts UI/audio helpers (imperial modal rendering, notification enqueue, audio guards, and rebel callouts). `scripts/mandates/imperialMandates.js` wires this adapter into the core for the browser build.

Headless tests can import `imperialMandatesCore` directly and pass a lightweight adapter to observe mandate progression while stubbing out UI side effects. The default adapter still exposes the original behaviors for the in-browser experience.
