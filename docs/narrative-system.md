# Narrative System

The narrative system converts gameplay events into short, voiced dispatches that surface via the HUD notification stack. It focuses on pacing and clarity by enforcing per-voice cooldowns and deterministic template selection.

## Core Behaviors

- **Event templates:** Templates are keyed by `{eventType, severity}` in `scripts/narrative/narrativeTemplates.js`. Each template line can include token placeholders (ex: `{month}`, `{week}`, `{favor}`, `{goldDelta}`, `{woodDelta}`, `{count}`).
- **Voices:** Three voices are available by default (Imperial Clerk, Frontier Elder, Rebel Herald), each with a notification title and tone.
- **Deterministic selection:** The system uses a seeded LCG PRNG when `payload.seed` is provided; otherwise it seeds on `{timekeeper.ticks, eventType, severity}`. Injected RNGs can be supplied for external seeding.
- **Cooldown gating:** Each `voice + category` pair is limited to a weekly cap. Defaults are 1 beat per week for `low`/`medium` severity and 2 for `high`/`critical`. The week index comes from `timekeeper.getCalendar()` and is serialized for persistence.

## Template Tokens

Template replacement is non-fatal: any failures return `null` instead of throwing. The default token map includes:

- `{month}` / `{week}` / `{day}` / `{dayOfWeek}` / `{dayOfMonth}` / `{year}`
- `{favor}`
- `{goldDelta}` / `{woodDelta}`
- `{count}`

## Persistence

`serializeState()` exports weekly counts and last-beat ticks so cooldowns survive saves. `hydrateState()` restores the snapshot.

## Integration Notes

`createNarrativeSystem({ rng, timekeeper, notificationManager, taskPanel })` expects a `notificationManager.enqueue()` function (the HUD notification stack). `taskPanel` is optional; when provided it may expose `enqueueNarrative()` for logging to the mandates/tasks flyout without new UI.
