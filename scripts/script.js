import { bootstrapGame } from './game/bootstrap.js';
export { createGameCore } from './game/core.js';
export { bootstrapGame };

document.addEventListener('DOMContentLoaded', () => {
    bootstrapGame();
});
