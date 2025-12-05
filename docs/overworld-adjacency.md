# Overworld Adjacency Bonuses

This system rewards contiguous clusters of the same tile type with extra income and
surfaces the details directly in the tile inspector. The evaluator walks the overworld
hex map, identifies connected components of like-type, like-owner tiles, and caches the
result so income ticks and UI renders stay in sync.

## Cluster Logic
- Only owned, non-scorched, non-rebel tiles participate in clusters. Enemy and rebel
  tiles never contribute to adjacency bonuses.
- Clusters are flood-filled based on axial neighbors. A tile that is isolated (cluster
  size 1) produces no adjacency bonus.
- The base rate is **10% per additional tile** in the cluster. A three-tile town cluster
  therefore receives a 20% rate before other modifiers.

## Land Reclamation Integration
- Tiles converted from fields are marked as `wasReclaimed` and receive an additional
  **5% reclamation rate** (per land-reclamation purchase) on top of the adjacency rate.
- The reclamation component stacks with the adjacency rate and applies even to a
  single reclaimed tile so long as it generates income.

## Income Application
- Each income tick rebuilds the cluster cache and applies bonus gold/wood per tile:
  `bonus = floor(baseIncome * (adjacencyRate + reclamationRate))`.
- Cluster results are stored on `game.overworld.clusterBonuses` and injected into the
  selected tile as `tile.clusterBonus` so UI code can display the breakdown without
  recomputing the map.

## UI Exposure
- The tile inspector renders both the headline tile label and a secondary line showing
  the resource bonus, cluster size, and tooltip with the active rates.
- When the game is paused, the inspector persists but marks the bonus line as paused to
  remind players that income accumulation is frozen.
