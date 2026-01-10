# Rebel Camp Spread

Rebel camps now attempt to spread each in-game day, chewing into nearby player-held tiles.
Every active camp rolls a spread check when the overworld income tick advances the day.

## Scaling spread chance

Spread chance scales with each camp's consecutive failed spread rolls, not raw campaign age:

- **Base chance:** 1.5% per camp per day.
- **Growth per miss:** enough to reach 100% after one in-game month without a spread.
- **Guarantee:** by the end of a month (default 28 ticks), every camp will spread if it
  keeps failing its roll.

The chance is calculated as `base + (misses * growth)` and clamped to 100%. Each time a
camp fails to spread, its miss counter increases; a successful spread resets the counter.

## Valid spread targets

When a camp succeeds its roll, it converts a single adjacent **player-owned** land tile
into a rebel camp. The system ignores castles, water tiles, and existing rebel camps.
Frontier Sweep's tutorial rebel camp is exempt from spreading while it is marked as
spread-immune by the tutorial handler. All rebel spreading (and rebel camp discoveries)
is paused entirely until the Frontier Sweep camp is cleared, giving players a brief grace
period to focus on that first encounter.

## Key implementation notes

- Logic lives in `scripts/rebelSystem.js` (`getRebelSpreadChance` and `spreadRebelCamps`).
- Daily calls happen in `scripts/overworldTicks.js` after income is applied.
