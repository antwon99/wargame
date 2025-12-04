# Imperial Mandate Manager

The Imperial Mandate manager keeps narrative objectives in a single registry so UI hooks, combat hooks, and economy ticks can react consistently. Each mandate shares a lifecycle with `PENDING → ACTIVE → (SUCCEEDED|FAILED)`, a deadline expressed in **Timekeeper** units (days/weeks/months) that the manager converts into ticks, trigger predicates for issuance, and callbacks for on-issue, success, and failure messaging.

## Runtime Flow
- **Triggering:** Pending mandates are evaluated whenever `issuePendingMandates` is called (explicitly during onboarding and implicitly when events are recorded). When a trigger predicate returns true and at least one **week** has elapsed since the last issue, the manager stamps `deadlineTick`, stores any metadata, and fires the issue callback for UI.
- **Events:** `recordEvent(eventType, payload)` advances the internal tick counter on `tick` events, replays success/failure predicates for active mandates, and re-checks pending triggers. This keeps the system deterministic for tests and simulations.
- **Deadlines:** Each mandate stores `deadlineTick` derived from the configured duration units; when the current tick meets or exceeds that value, the mandate fails and surfaces its penalty messaging.

## Mandates and Thresholds
- **destroy_first_rebel_camp**
  - **Trigger:** Any fresh campaign with existing overworld tiles (issues immediately) and establishes a two-week, one-day deadline.
  - **Goal:** Destroy the first rebel camp spawned near the frontier. Defeats trigger a one-time reprimand; victory removes the rebel flag and grants a calm-frontier decree.
- **levy_tithed_gold**
  - **Trigger:** At least 120 gold on hand after the first in-game week.
  - **Deadline:** 1 week + 1 day from issue.
  - **Goal:** Hold enough gold to remit the required tithe (60% of current gold, minimum 150). Success pays the tithe but returns 40% in supplies; failure seizes 35% of the required amount.
- **push_the_frontier**
  - **Trigger:** At least four owned tiles after the second in-game week (ensuring one-week spacing from prior mandates).
  - **Deadline:** 1 week + 5 days from issue.
  - **Goal:** Add three new holdings before the timer expires. Success grants +75 gold and +40 wood; failure warns of heightened rebel pressure.

## UI Hooks
All mandate messaging routes through optional UI bindings passed to `issuePendingMandates` or `recordEvent`. When bindings are absent, the manager falls back to DOM-based modals so tests and headless runs still progress.
