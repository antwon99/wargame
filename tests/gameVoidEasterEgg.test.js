const assert = require('assert');
const VoidEasterEgg = require('../voidEasterEgg.js');
const Persistence = require('../persistence.js');

// Set up a barebones DOM + window environment so script.js can register the Game singleton.
const capturedTexts = [];
const canvasStub = { width: 0, height: 0, getContext: () => ({}), addEventListener: () => {} };
const genericElement = { style: {}, addEventListener: () => {}, onclick: null, dataset: {} };

const windowProxy = new Proxy({}, {
    set(target, prop, value) {
        if (prop === 'Game') {
            // Intercept the Game singleton so we can narrow init to the void-click binding.
            value.spawnTxt = (hex, msg, color) => capturedTexts.push({ hex, msg, color });
            value.isPointerOnDrawnHex = () => ({ hit: false, hex: { q: 0, r: 0, s: 0 } });
            value.cam = { x: 0, y: 0, zoom: 1 };
            value.init = function () { this.bindVoidClickEasterEgg(); };
        }
        target[prop] = value;
        return true;
    }
});

global.window = windowProxy;
global.document = {
    addEventListener(event, cb) { if (event === 'DOMContentLoaded') cb(); },
    getElementById(id) {
        if (id === 'canvas') return canvasStub;
        if (id === 'fx-layer') return { innerHTML: '' };
        return genericElement;
    },
    querySelectorAll() { return []; }
};
global.performance = { now: () => 0 };
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {}, key: () => null, length: 0 };
global.Persistence = Persistence;
global.VoidEasterEgg = VoidEasterEgg;
global.InputHelpers = { SQRT3: Math.sqrt(3), Layout: {} };

afterEnvironment(() => { require('../script.js'); });

function afterEnvironment(cb) {
    cb();
}

function runVoidClickScenario() {
    const Game = window.Game;
    assert.ok(Game && typeof Game.handleVoidClick === 'function', 'Game.handleVoidClick should be defined');

    for (let i = 0; i < 5; i++) {
        Game.handleVoidClick(0, 0);
    }
    Game.handleVoidClick(0, 0);

    const firstFive = capturedTexts.slice(0, 5);
    const sixth = capturedTexts[5];

    firstFive.forEach(({ msg, color }) => {
        assert.strictEqual(msg, 'Out of Bounds');
        assert.strictEqual(color, '#aaa');
    });

    assert.ok(VoidEasterEgg.SASSY_MESSAGES.includes(sixth.msg), '6th click should pick a sassy quip');
    assert.strictEqual(sixth.color, '#ef476f');
}

function run() {
    runVoidClickScenario();
    console.log('Void click Game integration test passed.');
}

run();
