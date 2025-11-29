# Hex Kingdom

This repository contains a single-page prototype for the Hex Kingdom wargame experience. The project is currently implemented entirely in `Wargame.html`, combining layout, styling, and game logic in one file for easy portability while prototyping.

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


## Development Notes

- All gameplay logic, UI, and styling live in `Wargame.html`. Keep related code grouped with clear comments to aid navigation.
- If you split the project into multiple files later, document the new structure here and update the `.gitignore` accordingly.
- Use conventional commits for version history and add tests alongside new features where possible.


### Testing

- Run the persistence tests with:
  ```bash
  node tests/persistence.test.js
  ```


## Repository Layout

- `Wargame.html` — single-page prototype containing the full game.
- `AGENTS.md` — contributor guidance for coding standards and documentation expectations.

## Contributing

- Follow the guidance in `AGENTS.md` for code style, documentation, and testing expectations.
- Include descriptive comments for public-facing functions or systems.
- Keep changes scoped and commit messages meaningful.
