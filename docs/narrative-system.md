# Narrative System

The narrative system converts gameplay events into short, voiced dispatches that surface via the HUD notification stack. It focuses on pacing and clarity by enforcing per-voice cooldowns, deterministic template selection, and fail-silent behavior so gameplay never stalls on narrative output.

## Data-Driven Template Registry

- **Registry location:** `scripts/narrative/narrativeTemplates.js` exports `NARRATIVE_TEMPLATES` (event type → severity → template list).
- **Template shape:** Each template defines a `voice`, optional `title`/`tone`, and an array of `lines` containing tokens such as `{month}`, `{week}`, `{favor}`, `{goldDelta}`, `{woodDelta}`, `{count}`.
- **Token fill:** `buildTokenContext()` combines calendar data with payload values. Missing tokens are replaced with empty strings instead of throwing.

## Voice Selection

- **Voice catalog:** `NARRATIVE_VOICES` defines the available voices, each with a display name, default title, and tone.
- **Selection rules:**
  - If `payload.voice` maps to a known voice, it is honored.
  - Otherwise the system selects a voice from the templates registered for the event.
  - If no voice can be resolved, the emission returns `null` without side effects.

## Cooldown Rules

- **Weekly caps:** Each `voice + category` pair is limited per in-game week (`MAX_BEATS_PER_WEEK` in `scripts/narrative/narrativeSystem.js`). Defaults are:
  - `low`/`medium`: 1 beat per week
  - `high`/`critical`: 2 beats per week
- **Category fallback:** If no `payload.category` is provided, the event type is used.
- **Same-tick guard:** When the weekly cap is `1`, a second emission in the same tick is rejected to prevent accidental double fire.
- **Persistence:** `serializeState()` stores weekly counts and last beat ticks so cooldowns survive saves; `hydrateState()` restores them.

## Determinism Strategy

- **Seeded selection:** A linear congruential generator (LCG) powers deterministic template selection.
- **Seed sources:**
  - `payload.seed` → always creates a fresh seeded RNG for the emission.
  - `rngSeed` passed to `createNarrativeSystem()` → seeds the base RNG for deterministic selection across events.
  - Fallback seed → `${timekeeper.ticks}|${eventType}|${severity}` ensures repeatable selection per tick when no RNG is injected.
- **Injected RNG:** If an RNG with `next()` or `random()` is provided, it becomes the base source for selection.

## Fail-Silent Behavior

- **Template fill safety:** `fillTemplate()` catches errors and returns `null`; the emitter aborts without throwing.
- **No hard dependencies:** If `notificationManager.enqueue()` or `taskPanel.enqueueNarrative()` are missing, the narrative system still returns the notification payload and skips dispatch.
- **Gameplay insulation:** Call sites wrap narrative emission (e.g., combat resolution, mandates) so narrative failures never block gameplay flow.

## Phase Coverage

### Phase 1 (current)

- **Mandate lifecycle:** `mandate_issued`, `mandate_reprimand`, `mandate_completed`.
- **Calendar audit:** `month_audit` on month rollover.
- **War outcomes:** `war_outcome` with victory/defeat/retreat details and `war_tax_applied` when the levy hits.
- **Rebel activity:** `rebel_camp_spawned` and `rebel_camp_cleared`.

### Phase 2 (planned)

- Expand template coverage for **tech unlocks**, **tile claims**, and **economy/favor deltas** so more HUD feedback is narrated.
- Add **contextual narrative categories** (e.g., economy, frontier, court) to refine cooldown buckets without muting critical alerts.
- Introduce **regional voice variants** to tie dispatch tone to biome/region data.

### Phase 3 (planned)

- **Adaptive narration:** tune severity, cadence, and voice based on player performance and campaign difficulty.
- **Narrative chains:** allow multi-beat sequences that reference previous beats while respecting weekly caps.
- **Debug tooling:** expose narrative history and cooldown state in diagnostics so tuning is transparent.

## Integration Notes

`createNarrativeSystem({ rng, rngSeed, timekeeper, notificationManager, taskPanel })` expects a `notificationManager.enqueue()` function (the HUD notification stack). `taskPanel` is optional; when provided it may expose `enqueueNarrative()` for logging to the mandates/tasks flyout without new UI.
