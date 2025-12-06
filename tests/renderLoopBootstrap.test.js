const assert = require('assert');
const Persistence = require('../scripts/persistence.js');

const rafCalls = [];
const canvasStub = { width: 0, height: 0, getContext: () => ({}) };
const genericElement = {
    style: {},
    textContent: '',
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
            // Force a recoverable bootstrap error while keeping the render loop armed.
            value.setupInput = () => { throw new Error('input init failed'); };
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
        if (id === 'debug-log') return { ...genericElement };
        return genericElement;
    },
    querySelectorAll: () => [],
    createElement: () => ({ ...genericElement }),
    body: genericElement
};

global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {}, key: () => null, length: 0 };
global.InputHelpers = { SQRT3: Math.sqrt(3), Layout: {} };
global.Persistence = Persistence;
global.performance = { now: () => 42 };
global.requestAnimationFrame = (cb) => { rafCalls.push(cb); return 1; };

require('../scripts/script.js');

function run() {
    const Game = window.Game;
    assert.ok(Game, 'Game should register on window after bootstrap');
    assert.strictEqual(Game.lastTime, 42, 'render loop primer should cache performance timestamp');
    assert.ok(rafCalls.length > 0, 'requestAnimationFrame should be armed even when init throws');
    console.log('Render loop bootstrap safety test passed.');
}

run();
