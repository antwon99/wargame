# Starter Rebel Camp Spawn

## Overview
The starter rebel camp is seeded during fresh campaign bootstrapping so the Frontier Sweep mandate has a guaranteed target at the very first render. The spawn logic is implemented in `scripts/rebelSystem.js` via `spawnStarterRebelCampNearCastle(gameState)` and is invoked from `bootstrapNewWorld({ preserveIntro: false })` before `finalizeStarterTerritory()` builds the first cluster bonuses.

## Placement Logic
1. **Prefer empty neighbors around the castle.** The helper scans the six axial neighbors of the castle and picks an unoccupied slot if one exists. This creates a brand-new hex without replacing starter terrain such as forests or towns.
2. **Fallback to the closest unrevealed frontier slot.** If all castle-adjacent slots are already filled, the helper gathers frontier positions around the starter territory and selects the closest one to the castle (ties are randomized). This still preserves existing tiles while keeping the camp near the opening settlement.

## Tutorial Tracking
When the starter camp is created, `TutorialHandler.markFrontierSweepCamp` records the camp key with the `starter_spawn` source label so the Frontier Sweep mandate can reuse the same encampment without re-seeding or converting tiles.
