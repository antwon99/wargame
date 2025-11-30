# Hex Kingdom

This repository originated as a single-page prototype for the Hex Kingdom wargame experience, intended for initial testing and rapid prototyping. However, as development has progressed, it is gradually undergoing de-compartmentalization. The user interface is located in `Wargame.html`, while supporting modules such as `script.js`, `audio.js`, and `persistence.js` provide gameplay logic, data persistence, and audio routing, respectively (with more to come.)


## Getting Started

1. Clone the repository:
   ```bash
   git clone https://github.com/antwon99/wargame
   cd wargame
   ```
2. Open the game:
   - **Quick view:** Double-click `Wargame.html` to open it in your browser.
   - **Local server (recommended for consistent asset loading):**
     ```bash
     python -m http.server 8000
     # then visit http://localhost:8000/Wargame.html
     ```


## Save/Load and Leaderboard

- The overworld view now includes **Save**, **Load**, and **Reset** controls plus a personal leaderboard (best level, best war kills, total kills, wars fought).
- Progress is stored in browser `localStorage` (`wargame-save-v1` and `wargame-stats-v1`). Saves are taken from overworld state; mid-war layouts are not preserved to avoid corrupt campaigns.
- Completing a war automatically records stats and refreshes the stored snapshot so you do not lose leaderboard progress between sessions.
- See `docs/persistence.md` for the payload format and extension tips.

## Research / Tech Tree

- The HUD includes a **Research** button that opens a modal of late-game technologies.
- Tech cards turn green when you can afford them, gold when fully purchased, and gray when out of reach.
- Lives provide up to three revive charges on defeat, Architecture and Lumberjacks boost town/forest income, and Land Reclamation converts fields into new towns or forests.
- See `docs/research.md` for the full rules and costs.


## Development Notes

- All gameplay logic, UI, and styling live in `Wargame.html`. Keep related code grouped with clear comments to aid navigation.
- If you split the project into multiple files later, document the new structure here and update the `.gitignore` accordingly.
- Use conventional commits for version history and add tests alongside new features where possible.


### Testing

- Run the Node-based checks with:
  ```bash
  for f in tests/*.test.js; do node "$f"; done
  ```
  - Key suites: audio routing (`tests/audio.test.js`), juice helpers, persistence, input helpers, and void easter egg behavior.

## Audio

- MP3s in `/sfx` now power all game sounds: war drums, swords, arrows, towers/castles, legendary attacks, victory/defeat, city unlocks, forest claims, and an overworld ambient loop.
- See `docs/audio.md` for the event map and integration notes.


## Repository Layout

- `Wargame.html` — single-page prototype containing the full game.
- `AGENTS.md` — contributor guidance for coding standards and documentation expectations.
- `researchSystem.js` — shared tech tree definitions and affordability helpers used by the UI and tests.

## Contributing

- Follow the guidance in `AGENTS.md` for code style, documentation, and testing expectations.
- Include descriptive comments for public-facing functions or systems.
- Keep changes scoped and commit messages meaningful.
