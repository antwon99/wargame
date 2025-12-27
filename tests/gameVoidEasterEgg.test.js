const assert = require('assert');
const VoidEasterEgg = require('../scripts/voidEasterEgg.js');
VoidEasterEgg.initVoidEasterEgg?.(globalThis);
const Persistence = require('../scripts/persistence.js');
Persistence.initPersistence?.(globalThis);

// Set up a barebones DOM + window environment so script.js can register the Game singleton.
const capturedTexts = [];
const canvasStub = { width: 0, height: 0, getContext: () => ({}), addEventListener: () => {} };
const genericElement = {
    style: { setProperty: () => {} },
    addEventListener: () => {},
    onclick: null,
    dataset: {},
    appendChild: () => {},
    setAttribute: () => {},
    className: '',
    classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} }
};

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

windowProxy.addEventListener = () => {};
windowProxy.removeEventListener = () => {};

global.window = windowProxy;
global.document = {
    addEventListener(event, cb) { if (event === 'DOMContentLoaded') cb(); },
    getElementById(id) {
        if (id === 'canvas') return canvasStub;
        if (id === 'fx-layer') return { innerHTML: '' };
        if (id === 'game-container') return genericElement;
        return genericElement;
    },
    querySelectorAll() { return []; },
    createElement: () => ({ ...genericElement }),
    body: genericElement
};
global.performance = { now: () => 0 };
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {}, key: () => null, length: 0 };
global.Persistence = Persistence;
global.VoidEasterEgg = VoidEasterEgg;
global.InputHelpers = { SQRT3: Math.sqrt(3), Layout: {} };

const { bootstrapGame } = require('../scripts/script.js');
bootstrapGame({
    inputHelpers: global.InputHelpers,
    persistence: Persistence
});

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
