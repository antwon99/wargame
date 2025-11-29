# Hex Kingdom 2.5: Warlord Economy

This repository contains a single-page prototype for the Hex Kingdom 2.5 wargame experience. The project is currently implemented entirely in `Wargame.html`, combining layout, styling, and game logic in one file for easy portability while prototyping.

## Getting Started

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd wargame
   ```
2. Open the game:
   - **Quick view:** Double-click `Wargame.html` to open it in your browser.
   - **Local server (recommended for consistent asset loading):**
     ```bash
     python -m http.server 8000
     # then visit http://localhost:8000/Wargame.html
     ```

## Development Notes

- All gameplay logic, UI, and styling live in `Wargame.html`. Keep related code grouped with clear comments to aid navigation.
- If you split the project into multiple files later, document the new structure here and update the `.gitignore` accordingly.
- Use conventional commits for version history and add tests alongside new features where possible.

## Repository Layout

- `Wargame.html` — single-page prototype containing the full game.
- `AGENTS.md` — contributor guidance for coding standards and documentation expectations.

## Contributing

- Follow the guidance in `AGENTS.md` for code style, documentation, and testing expectations.
- Include descriptive comments for public-facing functions or systems.
- Keep changes scoped and commit messages meaningful.
