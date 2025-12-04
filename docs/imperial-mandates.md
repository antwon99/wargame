# Imperial Mandate Manager

The Imperial Mandate manager keeps narrative objectives in a single registry so UI hooks, combat hooks, and economy ticks can react consistently. Each mandate shares a lifecycle with `PENDING → ACTIVE → (SUCCEEDED|FAILED)`, a deadline expressed in ticks, trigger predicates for issuance, and callbacks for on-issue, success, and failure messaging.

## Runtime Flow
- **Triggering:** Pending mandates are evaluated whenever `issuePendingMandates` is called (explicitly during onboarding and implicitly when events are recorded). When a trigger predicate returns true, the manager stamps `deadlineTick`, stores any metadata, and fires the issue callback for UI.
- **Events:** `recordEvent(eventType, payload)` advances the internal tick counter on `tick` events, replays success/failure predicates for active mandates, and re-checks pending triggers. This keeps the system deterministic for tests and simulations.
- **Deadlines:** Each mandate stores `deadlineTick`; when the current tick meets or exceeds that value, the mandate fails and surfaces its penalty messaging.

## Mandates and Thresholds
- **destroy_first_rebel_camp**
  - **Trigger:** Any fresh campaign with existing overworld tiles.
  - **Deadline:** 15 ticks from issue.
  - **Goal:** Destroy the first rebel camp spawned near the frontier. Defeats trigger a one-time reprimand; victory removes the rebel flag and grants a calm-frontier decree.
- **levy_tithed_gold**
  - **Trigger:** At least 120 gold on hand and 2+ ticks elapsed.
  - **Deadline:** 8 ticks from issue.
  - **Goal:** Hold enough gold to remit the required tithe (60% of current gold, minimum 150). Success pays the tithe but returns 40% in supplies; failure seizes 35% of the required amount.
- **push_the_frontier**
  - **Trigger:** At least four owned tiles and 4+ ticks elapsed.
  - **Deadline:** 12 ticks from issue.
  - **Goal:** Add three new holdings before the timer expires. Success grants +75 gold and +40 wood; failure warns of heightened rebel pressure.

## UI Hooks
All mandate messaging routes through optional UI bindings passed to `issuePendingMandates` or `recordEvent`. When bindings are absent, the manager falls back to DOM-based modals so tests and headless runs still progress.
