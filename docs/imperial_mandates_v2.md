# Imperial Mandates v2

## Data schema
- **Mandate definition**: `{ id, title, description, durationTicks, triggerPredicate(ctx), successPredicate(eventType, payload, ctx), failurePredicate(eventType, payload, ctx), onIssue(ctx), onEvent(eventType, payload, ctx), onSuccess(ctx), onFailure(ctx), createInitialState() }`.
- **Runtime state** (per mandate): `{ status: PENDING|ACTIVE|SUCCEEDED|FAILED|EXPIRED, issuedTick, deadlineTick, completedTick, reprimandShown, metadata }` where `metadata` is derived from `createInitialState()` and stores targeting or progress data such as `targetTileKey`, `requiredGold`, or `targetTerritory`.
- **Global state**: `{ mandates: Map<id, { definition, runtime }>, currentTick, events: [{ eventType, payload, tick }], lastGameState, lastUIBindings }`.

## Tick-based timing
- **Ticks** are enqueued through `ImperialMandateManager.advanceTick(gameState, uiBindings)` to avoid blocking the UI thread. A queued tick flushes into `ImperialMandates.recordEvent('tick', { ticks })`, which increments `currentTick` and reevaluates all mandates.
- **Deadlines** are set during `issueMandate` as `deadlineTick = currentTick + durationTicks`. Deadline warnings fire when two ticks remain, and failure handlers execute once `currentTick >= deadlineTick`.
- **Issuance checks** run on every event (including ticks) through `issuePendingMandates`, so newly satisfied triggers activate immediately after the governing event resolves.

## Sample mandates
- **Destroy First Rebel Camp**: issues as soon as any overworld hex exists, spawns a rebel camp near the frontier, and succeeds on a victory/tile clear against the tracked camp. Failure after 15 ticks.
- **Imperial Tax Levy**: begins after tick 2 when the treasury holds at least 120 gold, requires a tithe (60% of current gold, minimum 150) by tick `issuedTick + 8`, and on success refunds 40% of the tithe while on failure seizes 35%.
- **Push the Frontier**: available after tick 4 when at least four territories are owned, sets a target of three additional holdings, rewards +75 gold/+40 wood on success, and fails if the expansion goal is missed after 12 ticks.

## API entry points for future events
- `ImperialMandates.recordEvent(eventType, payload, gameState?, uiBindings?)`: primary dispatcher for tick, combat, economy, and map events that drive success/failure checks and issuance.
- `ImperialMandateManager.advanceTick(gameState, uiBindings)`: schedules non-blocking ticks that feed into `recordEvent('tick')`.
- `ImperialMandates.handleBattleOutcome(result, targetTile, gameState, uiBindings)`: convenience wrapper for combat results.
- `ImperialMandates.handleTileCleared(tile, gameState, uiBindings)`: forwards map clear events.
- `ImperialMandates.issuePendingMandates(gameState, uiBindings)`: forces immediate trigger evaluation, useful after large state migrations.
- `ImperialMandates.getKingState()`: exposes mandate snapshots (`currentTick`, `mandates[id]`) for UI overlays and diagnostics.
