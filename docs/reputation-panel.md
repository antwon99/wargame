# Reputation Panel

## Overview

The Reputation Panel adds a read-only HUD surface for faction sentiment in Phase 1. It mirrors the existing Tasks/Mandates flyout and provides a quick glance at faction standings along with tooltip context that explains which forces are shaping each faction’s attitude.

## UI layout

- **Entry point:** the "Factions / Standing" button in the top-right HUD next to the Tasks/Mandates toggle.
- **Panel header:** "Standing" eyebrow and "Faction Reputation" title.
- **Faction rows:** five horizontal bar rows in the following order:
  1. Royalists / Crown
  2. Reformers / Council
  3. Business / Guilds
  4. The Masses / Settlers
  5. Unaligned / Frontier

Each row contains the faction label, a horizontal bar that scales to the 0–100 standing value, and a numeric value readout.

## Tooltip content

Hovering a row shows a tooltip containing:

- The current standing label (Hostile → Loyal) and numeric value.
- Recent contributors describing:
  - Mandate compliance
  - Tax pressure
  - War outcomes
  - Rebel suppression
- When available, a **Recent brief** line sourced from the NarrativeSystem (e.g., `game.narrative.getRecentBeats('faction')`).

If narrative output is unavailable, the tooltip uses deterministic placeholders seeded by game state (`timekeeper.ticks`, `imperialFavor`, war stats) so the tooltip remains stable across re-renders.

## Data schema

The panel reads from `game.factionState`:

```json
{
  "standings": {
    "crown": 50,
    "reformers": 50,
    "guilds": 50,
    "masses": 50,
    "frontier": 50
  },
  "recentContributors": {
    "crown": [],
    "reformers": [],
    "guilds": [],
    "masses": [],
    "frontier": []
  }
}
```

- **Standings** are 0–100 with a neutral default at 50.
- **Recent contributors** are reserved for Phase 2+; they are currently populated only by defaults.

## Save payload note

The persistence payload now includes a `factionState` block so save files capture the standings snapshot alongside other HUD-driven state. Existing saves will automatically hydrate defaults when this field is missing.
