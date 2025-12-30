# War Reward Decay

Combat rewards now decay as wars drag on to discourage stalling and to keep
late-stage fights from flooding the economy.

## How it works
- Rewards linearly decay from **1.0 at war start** to **0.0 at 240 seconds**.
- The decay multiplier is applied to:
  - Per-kill bounty payouts.
  - Per-tick building income generated during combat.
  - Victory rewards (gold and wood).

## Thresholds
- **0s elapsed:** 100% rewards.
- **120s elapsed:** 50% rewards.
- **240s elapsed:** 0% rewards.

These thresholds are implemented in `scripts/combatEngine.js` under
`computeWarRewardMultiplier`, and the live elapsed time is tracked via
`game.combat.warElapsedMs`.
