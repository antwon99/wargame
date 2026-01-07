# Progression + Leaderboard Semantics

This document explains how progression and leaderboard stats are computed in Wargame, and how save payloads reconcile legacy fields.

## Source of truth: Level

**Enemy level** is derived strictly from war outcomes. The canonical level is:

```
level = max(1, stats.warsWon + 1)
```

`state.difficulty` continues to mirror raw wars-won progress for legacy payloads, while combat scaling and UI labels derive from the enemy-level helper so the baseline always starts at 1.

## Metric definitions + update moments

- **`stats.warsFought`**
  - *Meaning:* Total wars started this campaign.
  - *Updates:* Incremented when a war is initiated (`startWar` in `scripts/combatEngine.js`).

- **`stats.warsWon`**
  - *Meaning:* Total wars won against rebel camps (victory outcomes that clear a rebel camp).
  - *Updates:* Incremented at the end of a war when the outcome is `VICTORY` against a rebel camp (`endWar` in `scripts/combatEngine.js`).
  - *Derived fields:* `state.difficulty` is synchronized to the same value.

- **`state.difficulty` (Wars won mirror)**
  - *Meaning:* Raw wars-won counter mirrored into state for legacy payloads.
  - *Updates:* Synchronized after war outcomes and during persistence normalization.

- **Enemy level (Level)**
  - *Meaning:* Current enemy level derived from `stats.warsWon + 1` with a minimum of 1.
  - *Updates:* Derived on demand for UI labels and combat scaling.

- **`stats.bestLevel`**
  - *Meaning:* Highest level achieved this campaign.
  - *Updates:* Recomputed at the end of each war (`recordWarEnd` in `scripts/combatEngine.js`) using the resolved level.

- **Legacy fields**
  - *`bestDifficulty` ➜ `bestLevel`*
  - *`warsPlayed` ➜ `warsFought`*
  - These are translated during stats normalization in `scripts/persistence.js`.

## Persistence + legacy payload reconciliation

When loading snapshots, persistence normalization aligns `stats.warsWon` and `state.difficulty` so they cannot diverge. If both values exist and differ, the higher value is preserved to avoid losing progress from older saves. After reconciliation, **difficulty always mirrors wars won**, while enemy level is derived from that value using the +1 baseline helper.

If your save payloads previously stored `bestDifficulty` or `warsPlayed`, those values are mapped into the current `bestLevel` and `warsFought` fields on load.
