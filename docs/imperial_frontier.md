# Imperial Frontier Intro

This document summarizes the introductory rebel flow and its two supporting systems.

## Rebel System (`scripts/rebelSystem.js`)

- Provides utilities to mark and locate rebel camps on the overworld map.
- `spawnRebelCampNearFrontier(gameState)` selects a frontier tile (an owned tile with at least one unrevealed neighbor) and converts it into a rebel camp by flagging `isRebelCamp = true`, switching its type to `rebelcamp`, and storing the previous type for restoration.
- `isRebelCampTile(tile)` returns whether a tile is a rebel camp.
- `getAllRebelCamps(gameState)` gathers the current rebel camp tiles across the overworld.

The helper reuses the existing overworld tile map and Hex helpers; if no safe frontier tile is available it returns `null` without crashing the caller.

## Imperial Mandates (`scripts/imperialMandates.js`)

- Runs the first imperial tutorial mandate, coordinating messaging and rebel spawning.
- Shows an opening decree, spawns a rebel camp through `rebelSystem`, then instructs the player to clear it.
- Tracks the spawned camp by tile id and listens for that specific tile to be cleared.
- On destruction, the Emperor acknowledges success with a final message and the camp is restored to its previous tile type.

### First Mandate Flow

1. **Decree:** A modal reads “By Imperial Decree: Patrol the frontier. Rebels have been sighted nearby.”
2. **Spawn:** When acknowledged, a rebel camp is spawned on a frontier tile via `spawnRebelCampNearFrontier`.
3. **Orders:** A follow-up message alerts the player: “Scouts report a bandit encampment. Destroy it to secure the border.”
4. **Completion:** When that camp is cleared, a closing message appears: “The Emperor is pleased. Expand the territory while the frontier is quiet.”

### Notes

- There is **no failure state or meta-Favor meter** tied to mandates yet; this is a linear introduction to the Emperor’s authority and the rebel threat.
- Mandate state is internal to `imperialMandates`; it can be inspected through `getMandateState()` for debugging or tests.
