# Hex Kingdom

This repository contains a single-page prototype for the Hex Kingdom wargame experience. The project now uses a multi-file layout for maintainability: `Wargame.html` is the primary entry point and pulls in `style.css` for presentation plus `script.js` for gameplay, alongside the supporting `persistence.js` and `juice.js` helpers.

## Getting Started

1. Clone the repository:
   ```bash
   git clone https://github.com/antwon99/wargame
   cd wargame
   ```
2. Open the game:
   - **Quick view:** Double-click `Wargame.html` to open it in your browser (it loads the external CSS/JS automatically).
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


## Development Notes

- The HTML shell lives in `Wargame.html`, while the styling and game logic are separated into `style.css` and `script.js`. Shared systems such as saving and juice remain in `persistence.js` and `juice.js` respectively.
- If you add new assets, keep imports consolidated in `Wargame.html` so the entry point stays easy to open.
- Use conventional commits for version history and add tests alongside new features where possible.


### Testing

- Run the persistence tests with:
  ```bash
  node tests/persistence.test.js
  ```


## Repository Layout

- `Wargame.html` — entry point that loads the compiled HUD/menus and references the shared assets.
- `style.css` — extracted styling for the HUD, sidebar, overlays, and overlays/FX layers.
- `script.js` — extracted gameplay, UI wiring, and combat logic that previously lived inline.
- `persistence.js` / `juice.js` — supporting systems for saves and audiovisual feedback.
- `AGENTS.md` — contributor guidance for coding standards and documentation expectations.

## Contributing

- Follow the guidance in `AGENTS.md` for code style, documentation, and testing expectations.
- Include descriptive comments for public-facing functions or systems.
- Keep changes scoped and commit messages meaningful.
