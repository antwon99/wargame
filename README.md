# Hex Kingdom

This repository originated as a single-page prototype for the Hex Kingdom wargame experience, intended for initial testing and rapid prototyping. However, as development has progressed, it is gradually undergoing de-compartmentalization. The user interface is located in `Wargame.html` with the ES module entry point `scripts/script.js`, which stitches together the overworld loop, combat engine, UI bindings, persistence, and audio systems (all housed under `scripts/`).

## Getting Started

1. Clone the repository:
   ```bash
   git clone https://github.com/antwon99/wargame
   cd wargame
   ```
2. Open the game:
   - **Quick view:** Double-click `Wargame.html` to open it in your browser.
   - **Local server (recommended for ES module loading and consistent assets):**
     ```bash
     python -m http.server 8000
     # then visit http://localhost:8000/Wargame.html
     ```

## Save/Load and Leaderboard

- The overworld view now includes **Save**, **Load**, and **Reset** controls plus a personal leaderboard (best level, best war kills, total kills, wars fought).
- Progress is stored in browser `localStorage` (per-slot `hexWar_slot{n}` saves plus matching `hexWar_stats_slot{n}` leaderboard snapshots). Saves are taken from overworld state; mid-war layouts are not preserved to avoid corrupt campaigns.
- Completing a war automatically records stats and refreshes the stored snapshot so you do not lose leaderboard progress between sessions.
- See `docs/persistence.md` for the payload format and extension tips.

## Research / Tech Tree

- The HUD includes a **Research** button that opens a modal of late-game technologies.
- Tech cards turn green when you can afford them, gold when fully purchased, and gray when out of reach.
- Lives provide up to three revive charges on defeat, Architecture and Lumberjacks boost town/forest income, and Land Reclamation converts fields into new towns or forests.
- See `docs/research.md` for the full rules and costs.


## Development Notes

- Core gameplay logic now lives in the `scripts/` directory, with `scripts/script.js` importing ES modules such as `combatEngine.js`, `uiBindings.js`, `gameAudioHooks.js`, `persistence.js`, and `researchSystem.js`.
- If you split the project into additional files later, document the new structure here and update the `.gitignore` accordingly.
- Use conventional commits for version history and add tests alongside new features where possible.

### Script bootstrap order

- `scripts/script.js` relies on globals supplied by non-module scripts (`researchSystem.js`, `persistence.js`, `rebelSystem.js`, `imperialMandates.js`, `inputHelpers.js`, etc.) that are loaded above it in `Wargame.html`. The module checks `window` first, then falls back to `require()` for Node-based tests, so keep those `<script>` tags before the module entry when changing bundlers or build pipelines.

### Fog visuals

- `scripts/fogVisualConfig.mjs` is the single source of truth for fog colors, opacities, ripple tuning, and parallax drift values used by the overworld and combat backdrops. Feature toggles in `scripts/script.js` read from this config (and explicit overrides) to decide whether fog is enabled, whether ripples render, and which gradients to apply. Temporary fog toggles can be flipped from the in-game debug overlay (F3) alongside the audio diagnostics.
- Per-hex fog/shroud overlays can be supplied via the `drawTileFog` extension point passed into `drawOverworldTiles()`; the default implementation is a no-op, so custom tile fog can be layered on without changing the base renderer.


### Testing

- Run the Node-based checks with:
  ```bash
  for f in tests/*.test.js; do node "$f"; done
  ```
  - Key suites: audio routing (`tests/audio.test.js`), juice helpers, persistence, input helpers, and void easter egg behavior.

## Audio

- MP3s in `/sfx` now power all game sounds: war drums, swords, arrows, towers/castles, legendary attacks, victory/defeat, city unlocks, forest claims, and an overworld ambient loop. Effects are grouped into `/sfx/ambient`, `/sfx/combat`, `/sfx/ui`, and `/sfx/system` subfolders.
- Combat transitions now run through `enterCombat()` / `exitCombat()` in `scripts/audio.js` so war drums hit immediately and ambience swaps back to territory after victory/defeat/retreat.
- See `docs/audio.md` for the event map and integration notes.


## Repository Layout

```
.
├─ docs/
├─ scripts/
├─ sfx/
├─ tests/
├─ .gitignore
├─ AGENTS.md
├─ README.md
├─ Wargame.html
├─ index.html
└─ style.css
```

## Contributing

- Follow the guidance in `AGENTS.md` for code style, documentation, and testing expectations.
- Include descriptive comments for public-facing functions or systems.
- Keep changes scoped and commit messages meaningful.
