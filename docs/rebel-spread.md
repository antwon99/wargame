# Rebel Camp Spread

Rebel camps now attempt to spread each in-game day, chewing into nearby player-held tiles.
Every active camp rolls a spread check when the overworld income tick advances the day.

## Scaling spread chance

Spread chance scales with total campaign days (timekeeper ticks):

- **Base chance:** 2% per camp per day.
- **Daily growth:** +0.2% per day elapsed.
- **Cap:** 25% per camp per day.

The chance is calculated as `base + (daysElapsed * dailyGrowth)`, then clamped to the cap.
This keeps rebel pressure low early on, while making long-running campaigns progressively
more hazardous if camps are ignored.

## Valid spread targets

When a camp succeeds its roll, it converts a single adjacent **player-owned** land tile
into a rebel camp. The system ignores castles, water tiles, and existing rebel camps.

## Key implementation notes

- Logic lives in `scripts/rebelSystem.js` (`getRebelSpreadChance` and `spreadRebelCamps`).
- Daily calls happen in `scripts/overworldTicks.js` after income is applied.
