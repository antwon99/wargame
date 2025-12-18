# Overworld Adjacency + Water Bodies

This note documents the latest overworld systems that change how clusters pay out and how water reveals behave.

## Reverse adjacency efficiency

- Castle-centered falloff now applies to cluster adjacency bonuses. Tiles within **1 ring** of the castle keep full adjacency value.
- Beyond the safe radius, adjacency is multiplied by `1 / (1 + (distanceBeyondSafe * 0.18))` with a **minimum efficiency floor of 35%**.
- The reverse multiplier is stored in the cluster payload (`reverseAdjacencyMultiplier`, `distanceFromCastle`, and `baseAdjacencyRate`) so UI and tests can surface the reduced effectiveness.
- Research and reclamation bonuses continue to stack on top of the distance-scaled adjacency.

## Water body reveals

- `water` is a new overworld tile with no income and a calming visual. Claiming any water hex auto-reveals an attached body of water to create meaningful dead space.
- Generator rules:
  - 50% chance to roll a **river**: winding, 1-hex wide, with a default length between **4–9** tiles (configurable).
  - 50% chance to roll a **lake**: compact blob sized **3–6** tiles by default, expanding organically around the clicked hex.
- Additional water tiles from the same reveal are claimed for free and tagged with `isWater` so downstream systems can identify them without overriding existing terrain.
- Both generator ranges can be overridden for tests or tuning (`riverLengthRange`, `lakeSizeRange`, custom `rng`).
