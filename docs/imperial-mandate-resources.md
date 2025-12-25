# Imperial Mandate Resource Confirmations

Resource-driven mandates now surface explicit stockpile requirements in the Tasks/Mandates panel and require a conscious confirmation before tributes are sent. This keeps the mandate system clear about *what* is being paid and avoids automatic resource drains the moment a threshold is reached.

## How it works
- **Resource progress is tracked per mandate** using the latest game state snapshot. Each resource requirement shows a `current/target` readout (e.g., `80/100 coins`).
- **The "Send" button appears only when all requirements are met.** The UI hides the button until the player has enough of every listed resource.
- **Confirmations are explicit.** Pressing "Send" calls `ImperialMandates.confirmMandateResources(mandateId)` which verifies readiness, marks the mandate as confirmed, and immediately evaluates success.

## Mandate resource expectations
- **Imperial Tax Levy**: coins only (tribute is deducted once confirmed).
- **Infrastructure Quota**: wood + coins (materials are deducted on confirmation, then the stipend is applied).
- **Rotating Imperial Levy**: alternates between wood or coins each cycle.
- **Diplomatic Envoys**: coins are spent on gifts; **favor is a readiness requirement but is *not* deducted.**

## UI behavior
- Resource sections render beneath each mandate description when requirements exist.
- Successful confirmation removes the Send button and updates the mandate state as success.

## API
`confirmMandateResources(mandateId, gameState?, uiBindings?)` returns `{ ok, reason, requirements }`, allowing UI layers to gracefully handle invalid confirmation attempts or missing resources.
