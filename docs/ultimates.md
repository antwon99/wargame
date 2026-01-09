# Combat Ultimates

Combat ultimates are single-use battle abilities that charge once per war. Each ultimate has a
charge delay that scales by upgrade level (15–30 seconds), then grants a short-lived effect or a
one-time payout. The combat engine tracks per-ultimate state in `game.combat.ultimates` so UI and
gameplay systems can display readiness, consume the effect, and clear the state on war exit.
Persistent ultimate upgrade levels live on `game.ultimates` and are upgraded between wars using
gold from the overworld economy.

## Ultimate Behavior

### Rush
- **Charge delay:** 15–30 seconds (by level).
- **Duration:** 6–10 seconds.
- **Effect:** Applies a temporary speed multiplier to player unit movement only.

### Manpower
- **Charge delay:** 18–30 seconds (by level).
- **Duration:** 8–12 seconds.
- **Effect:** Reduces player spawn timers and gives a 50% chance to spawn a second unit when a
  production building triggers.

### Gold
- **Charge delay:** 15–25 seconds (by level).
- **Effect:** Converts a percentage of current player units into immediate gold once per battle.
  The effect does not repeat if the ultimate has already been consumed in that war.

## Consumption Rules
- Each ultimate can only be consumed **once per battle**.
- Returning to the overworld resets all ultimate charge timers and active effects.
- Only one ultimate can be selected for combat at a time; the Ultimates drawer
  selection dictates which ability is available during the next battle.

## Ultimate Upgrades
- **Max level:** 3 for every ultimate (matching the tuning tables in
  `scripts/game/ultimatesConfig.js`).
- **Base costs:** Rush 220g, Manpower 240g, Gold 260g.
- **Scaling:** Each additional level scales the base cost by ×1.6.
- **UI copy:** The Ultimates drawer shows current level, max level, and a summary of the
  active effect (e.g., “Rush: +25% speed for 6s”).
