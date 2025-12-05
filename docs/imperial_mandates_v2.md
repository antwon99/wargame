# Imperial Mandates v2

## Data schema
- **Mandate definition**: `{ id, title, description, durationTicks, triggerPredicate(ctx), successPredicate(eventType, payload, ctx), failurePredicate(eventType, payload, ctx), onIssue(ctx), onEvent(eventType, payload, ctx), onSuccess(ctx), onFailure(ctx), createInitialState() }`.
- **Runtime state** (per mandate): `{ status: PENDING|ACTIVE|SUCCEEDED|FAILED|EXPIRED, issuedTick, deadlineTick, completedTick, reprimandShown, metadata }` where `metadata` is derived from `createInitialState()` and stores targeting or progress data such as `targetTileKey`, `requiredGold`, or `targetTerritory`.
- **Global state**: `{ mandates: Map<id, { definition, runtime }>, currentTick, events: [{ eventType, payload, tick }], lastGameState, lastUIBindings }`.

## Tick-based timing
- **Ticks** are enqueued through `ImperialMandateManager.advanceTick(gameState, uiBindings)` to avoid blocking the UI thread. A queued tick flushes into `ImperialMandates.recordEvent('tick', { ticks })`, which increments `currentTick` and reevaluates all mandates.
- **Deadlines** are set during `issueMandate` as `deadlineTick = currentTick + durationTicks`. Deadline warnings fire when two ticks remain, and failure handlers execute once `currentTick >= deadlineTick`.
- **Issuance checks** run on every event (including ticks) through `issuePendingMandates`, so newly satisfied triggers activate immediately after the governing event resolves.

## Mandate timers and triggers
| Mandate | Trigger | Earliest Issue | Deadline/Duration | Success Effects | Failure Effects |
| --- | --- | --- | --- | --- | --- |
| Destroy First Rebel Camp | Any overworld hex exists; spawns a nearby rebel camp | Immediate | 21 days (2w5d) | Clear the tracked camp; favor +1 | Deadline reached; favor -1 |
| Imperial Tax Levy | Treasury at least 120 gold | 10 days (1w2d) | 11 days (1w3d) | Pay required gold, +40% refund; favor +1 | Seize 35% of required gold; favor -1 |
| Push the Frontier | Own 4+ territories | 20 days (2w4d) | 17 days (2w1d) | Add 3 new holdings; +75 gold, +40 wood; favor +1 | Mandate expires; favor -1 |
| Infrastructure Quota | Stockpile at least 70 gold and 80 wood | 19 days (2w3d) | 9 days (1w1d) | Stage target reserves; +50 gold, +30 wood; favor +2 | Lose 35 wood and 25% of target gold; favor -2 |
| Rotating Imperial Levy | Hold 6+ tiles and at least 120 of a resource | 24 days (3w) | 12 days (1w4d) | Pay rotating tribute, receive 35% rebate; favor +1 | Reserve seized (~25%); favor -2 |
| Dispatch Diplomatic Envoys | Imperial favor ≥ 6 and 60+ gold on hand | 18 days (2w2d) | 8 days (1w) | Deliver gifts and reach target favor; gain timber and favor +2 | Treasury pays 30 gold; favor -3 |

## API entry points for future events
- `ImperialMandates.recordEvent(eventType, payload, gameState?, uiBindings?)`: primary dispatcher for tick, combat, economy, and map events that drive success/failure checks and issuance.
- `ImperialMandateManager.advanceTick(gameState, uiBindings)`: schedules non-blocking ticks that feed into `recordEvent('tick')`.
- `ImperialMandates.handleBattleOutcome(result, targetTile, gameState, uiBindings)`: convenience wrapper for combat results.
- `ImperialMandates.handleTileCleared(tile, gameState, uiBindings)`: forwards map clear events.
- `ImperialMandates.issuePendingMandates(gameState, uiBindings)`: forces immediate trigger evaluation, useful after large state migrations.
- `ImperialMandates.getKingState()`: exposes mandate snapshots (`currentTick`, `mandates[id]`) for UI overlays and diagnostics.
