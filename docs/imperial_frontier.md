# Imperial Frontier Intro

This document summarizes the introductory rebel flow and its two supporting systems.

## Rebel System (`scripts/rebelSystem.js`)

- Provides utilities to mark and locate rebel camps on the overworld map.
- `spawnRebelCampNearFrontier(gameState)` selects a frontier tile (an owned tile with at least one unrevealed neighbor) and converts it into a rebel camp by flagging `isRebelCamp = true`, switching its type to `rebelcamp`, and storing the previous type for restoration.
- `isRebelCampTile(tile)` returns whether a tile is a rebel camp.
- `getAllRebelCamps(gameState)` gathers the current rebel camp tiles across the overworld.

The helper reuses the existing overworld tile map and Hex helpers; if no safe frontier tile is available it returns `null` without crashing the caller.

## Imperial Mandates (`scripts/imperialMandates.js`)

- Acts as the **King controller** that owns mandate lifecycles.
- Uses a lightweight `MandateStatus` enum and a `kingState` object to track the first order: `destroy_first_rebel_camp`.
- Exposes `issueInitialMandate`, `handleBattleOutcome`, `resetForNewCampaign`, and `getKingState` as the external API for the opening order.
- Shields the tracked rebel camp from defeat penalties by exporting `getProtectedOverworldKeys()` for the combat engine.

### First Mandate Flow

1. **Issue:** `issueInitialMandate` spawns a rebel camp via `spawnRebelCampNearFrontier`, marks the camp as the target, and shows an anchored decree: “Patrol the frontier. Rebels have been sighted nearby. Expand the Empire’s reach — and survive the rebels beyond the fog.”
2. **Reprimand:** Losing against that tile triggers a one-time reprimand decree (“Imperial Reprimand: The frontier has been pushed back. Regroup and destroy the encampment.”) while keeping the mandate ACTIVE and the rebel tile protected from overworld loss.
3. **Completion:** Victory against the tracked tile promotes the status to COMPLETED, clears the rebel flags on that tile, and announces “The Emperor is pleased. Expand the territory while the frontier is quiet.”

### Notes

- There is **no failure state or meta-Favor meter** tied to mandates yet; this is a linear introduction to the Emperor’s authority and the rebel threat.
- Mandate state is internal to `imperialMandates`; it can be inspected through `getKingState()` for debugging or tests.
