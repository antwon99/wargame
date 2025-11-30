# Research / Tech Tree

The research system introduces a late-game tech tree focused on economic scaling and fail-safes.

## Tech Definitions
- **Lives**: Costs 1000 gold and scales by 2.5x per purchase. Each purchase adds a revive charge up to three total. Charges persist in saves but are consumed on defeat.
- **Architecture**: Costs 200 wood. Grants +1 gold income to every town in your territory.
- **Lumberjacks**: Costs 400 gold. Grants +1 wood income to every forest in your territory.
- **Land Reclamation**: One-time upgrade. Pay 500 wood to turn a random field into a forest or 500 gold to raise a town on a field.

## Behavior
- Research items are bought from the new modal in the HUD. Cards turn green when affordable, gold once purchased, and gray otherwise.
- Purchasing instantly deducts resources and applies the effect; lives and territory conversions are immediate.
- Defeat will automatically consume a Life if available, preventing land loss and marking the war outcome as a revive.
- Tech purchases and remaining lives are persisted with save slots so runs keep their investments across sessions.
