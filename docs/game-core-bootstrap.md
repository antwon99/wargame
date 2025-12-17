# Game Core + Bootstrap Architecture

The game loop is now split between a reusable core module and a thin bootstrap so UI layers can compose the state machine without entangling rendering or persistence defaults.

## Modules
- `scripts/game/core.js`: Owns the Game state machine, timekeeper wiring, and render loop entry points (`init`, `armRenderLoop`, `loop`). It exposes `createGameCore()` which returns `{ Game, Hex, Layout, TIPS }` without binding DOM/UI concerns.
- `scripts/game/bootstrap.js`: Composes the core with HUD bindings, persistence hydration, and optional intro overlay activation. The bootstrap passes callbacks into `Game.init` to refresh HUD/save-slot UI and wire user input.
- `scripts/script.js`: Legacy entry point that simply waits for `DOMContentLoaded` and runs the bootstrap for backward compatibility.

## Usage
1. Import `bootstrapGame` from `scripts/game/bootstrap.js` to start the game with UI and persistence wiring.
2. Import `createGameCore` when tests or tooling need access to the Game instance without the browser bootstrap.
