# Research / Tech Tree

The research system introduces a late-game tech tree focused on economic scaling and fail-safes.

## Tech Definitions
- **Lives**: Costs 1000 gold and scales by 2.5x per purchase. Each purchase adds a revive charge up to three total. Charges persist in saves but are consumed on defeat.
- **Architecture**: Costs 200 gold. Grants +1 gold income to every town in your territory.
- **Lumberjacks**: Costs 400 gold. Grants +1 wood income to every forest in your territory.
- **Land Reclamation**: Pay 500 gold (cost scales by 35% per purchase) to reclaim a player-owned field into either a forest or a town. After buying, click the specific field you want to upgrade so adjacency bonuses remain deterministic.

## Behavior
- Research items are bought from the new modal in the HUD. Cards turn green when affordable, gold once purchased, and gray otherwise.
- Purchasing instantly deducts resources and applies the effect; lives are immediate while land reclamation waits for you to click the target field. Costs scale each time you buy it.
- Defeat will automatically consume a Life if available, preventing land loss and marking the war outcome as a revive.
- Tech purchases and remaining lives are persisted with save slots so runs keep their investments across sessions.
