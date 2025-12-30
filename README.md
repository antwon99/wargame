# Hex Kingdom

![CI](https://github.com/antwon99/wargame/actions/workflows/ci.yml/badge.svg)

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

## Documentation

- Start with [`docs/README.md`](docs/README.md) for a guided index of the major gameplay systems and supporting references.

## Development Notes

- Core gameplay logic now lives in the `scripts/` directory, with `scripts/script.js` importing ES modules such as `combatEngine.js`, `uiBindings.js`, `gameAudioHooks.js`, `persistence.js`, and `researchSystem.js`.
- If you split the project into additional files later, document the new structure here and update the `.gitignore` accordingly.
- Use conventional commits for version history and add tests alongside new features where possible.

### Build and bundle

- Use Rollup to bundle the in-page scripts into a single deferred asset for release:
  ```bash
  npm run build
  ```
  - The build step emits a hashed bundle under `dist/assets/` and injects it into `dist/Wargame.html` with `defer`.
  - Legacy globals are preserved via `scripts/globalShim.js` so existing runtime checks continue to work in the bundle.

### Snow visuals

- `scripts/snowVisualConfig.mjs` drives the seasonal snow overlay and coverage. The config determines which months render snow (October–March), the maximum gradient height, and overlay opacity. Temporary snow toggles can be flipped from the in-game debug overlay (F3) alongside the audio diagnostics.
- Per-hex visibility overlays can be supplied via the `drawTileOverlay` extension point passed into `drawOverworldTiles()`; the default implementation shades unseen/seen tiles while keeping snow separate from tile shrouds.


### Testing

- Run the consolidated suite with:
  ```bash
  npm test
  ```
  - The test runner stubs DOM APIs and executes both `.js` and `.mjs` suites.

## Audio

- MP3s in `/sfx` now power all game sounds: war drums, swords, arrows, towers/castles, legendary attacks, victory/defeat, city unlocks, forest claims, and an overworld ambient loop. Effects are grouped into `/sfx/ambient`, `/sfx/combat`, and `/sfx/system` subfolders, with `/sfx/ui` reserved for future interface cues.
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
