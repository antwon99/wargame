# Combat Ultimates Reference

This document summarizes the combat ultimate system, focusing on default tuning,
per-upgrade scaling, charge behavior, and the state keys/modules that implement
those behaviors.

## Ultimate Types, Defaults, and Scaling

Default ultimate levels are initialized to level 1 for every ultimate in the
persistent `game.ultimates` store (see `DEFAULT_ULTIMATE_LEVELS`). The tables
below describe the tuned values by upgrade level.

### Rush (⚡)
- **Default level:** 1
- **Charge delay:** 15s → 22s → 30s
- **Duration:** 6s → 8s → 10s
- **Speed multiplier:** 1.25× → 1.4× → 1.6×

### Manpower (🪖)
- **Default level:** 1
- **Charge delay:** 18s → 24s → 30s
- **Duration:** 8s → 10s → 12s
- **Spawn rate multiplier:** 0.8× → 0.7× → 0.6× (lower is faster)
- **Double-spawn chance:** 50% at all levels

### Gold (💰)
- **Default level:** 1
- **Charge delay:** 15s → 20s → 25s
- **Unit cull percent:** 25% → 35% → 45%
- **Gold per culled unit:** 6g → 8g → 12g

## Charge Behavior and Battle Regeneration

- **Charge delay window:** All ultimates charge once per battle using a 15–30s
  delay scaled by level. The timer begins when combat starts.
- **Single use:** Each ultimate can be consumed **once per battle**. After use,
  the ultimate is flagged as consumed and no longer charges during that battle.
- **Regen between battles:** Charge progress, consumed flags, and active effects
  are rebuilt whenever a war starts or ends. This effectively resets ultimates
  between battles and allows them to charge again on the next combat run.

## Combat-Only Visibility and Reset Rules

- **HUD visibility:** The combat ultimate HUD is only visible when
  `game.state === 'COMBAT'`. Outside combat, the HUD hides entirely.
- **Reset rules:** Entering or exiting combat re-seeds `game.combat.ultimates`
  from persistent upgrade levels. This clears charge progress, active effects,
  and consumed flags so each new battle starts with fresh timers.

## Balance Notes and Tradeoffs

- **Gold ultimate tradeoff:** Gold is the only ultimate that permanently removes
  player units during a battle in exchange for immediate gold. The conversion is
  intentionally front-loaded: it spikes the war treasury but reduces frontline
  strength for the remainder of the battle. This makes it strongest when you can
  convert excess units or when gold income is more valuable than sustained DPS.
- **Rush vs. Manpower pacing:** Rush spikes movement speed for short windows,
  while Manpower compresses spawn cycles over longer durations. Rush can help
  secure early map control; Manpower favors sustained reinforcement density.

## Maintenance Links (Modules + State Keys)

- **Config + defaults:**
  - `scripts/game/ultimatesConfig.js`
  - Keys: `ULTIMATE_CONFIG`, `ULTIMATE_UPGRADE_CONFIG`, `DEFAULT_ULTIMATE_LEVELS`
- **Combat state container:**
  - `scripts/game/state.js`
  - Keys: `game.combat.ultimates.chargeMs`, `readyAtMs`, `consumed`,
    `activeEffects`, `levels`, `metadata`
- **Combat charge/effect logic:**
  - `scripts/combatEngine.js`
  - Functions: `updateUltimateChargeState`, `applyGoldUltimateEffect`
- **Battle lifecycle resets:**
  - `scripts/game/core.js`
  - Functions: `startWar`, `endWar` (both re-seed `game.combat.ultimates`)
- **Combat-only HUD visibility:**
  - `scripts/uiBindings.js`
  - Function: `updateCombatUltimateHud` (checks `game.state === 'COMBAT'`)
- **Persistent upgrades:**
  - `scripts/game/core.js`
  - Key: `game.ultimates` (used between wars to store upgrade levels)
