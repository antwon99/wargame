const assert = require('assert');

function createClassList() {
    const classes = new Set();
    return {
        add: (...names) => names.forEach(name => classes.add(name)),
        remove: (...names) => names.forEach(name => classes.delete(name)),
        toggle: (name, force) => {
            if (typeof force === 'boolean') {
                force ? classes.add(name) : classes.delete(name);
                return force;
            }
            if (classes.has(name)) {
                classes.delete(name);
                return false;
            }
            classes.add(name);
            return true;
        },
        contains: name => classes.has(name)
    };
}

function createElement(id) {
    const listeners = {};
    const attributes = {};
    const element = {
        id,
        classList: createClassList(),
        style: {},
        dataset: {},
        addEventListener: (event, cb) => {
            listeners[event] = listeners[event] || [];
            listeners[event].push(cb);
        },
        trigger: (event, payload = {}) => {
            (listeners[event] || []).forEach(cb => cb(payload));
        },
        setAttribute: (name, value) => {
            attributes[name] = value;
        },
        getAttribute: name => attributes[name]
    };
    return element;
}

function createDocumentStub() {
    const listeners = {};
    const elements = new Map([
        ['audio-debug', createElement('audio-debug')],
        ['audio-debug-toggle', createElement('audio-debug-toggle')],
        ['debug-log', createElement('debug-log')],
        ['debug-toggle', createElement('debug-toggle')]
    ]);

    return {
        addEventListener: (event, cb) => {
            listeners[event] = listeners[event] || [];
            listeners[event].push(cb);
        },
        dispatch: (event, payload = {}) => {
            (listeners[event] || []).forEach(cb => cb(payload));
        },
        getElementById: id => elements.get(id) || null,
        elements
    };
}

function run() {
    const documentStub = createDocumentStub();
    global.document = documentStub;
    global.window = { DebugToggles: {}, addEventListener: () => {}, removeEventListener: () => {} };

    delete require.cache[require.resolve('../scripts/debugToggle.js')];
    require('../scripts/debugToggle.js');

    documentStub.dispatch('DOMContentLoaded');

    const audioPanel = documentStub.getElementById('audio-debug');
    const audioToggle = documentStub.getElementById('audio-debug-toggle');
    const logOverlay = documentStub.getElementById('debug-log');
    const debugToggle = documentStub.getElementById('debug-toggle');

    assert.strictEqual(audioPanel.classList.contains('visible'), false, 'audio debug should start hidden');
    assert.strictEqual(audioPanel.getAttribute('aria-hidden'), 'true', 'audio panel should be aria-hidden initially');
    assert.strictEqual(debugToggle.getAttribute('aria-pressed'), undefined, 'stack log toggle should be untouched by audio setup');

    audioToggle.trigger('click');

    assert.ok(audioPanel.classList.contains('visible'), 'audio debug click should reveal audio overlay');
    assert.strictEqual(audioToggle.getAttribute('aria-pressed'), 'true', 'audio toggle should reflect active aria state');
    assert.strictEqual(logOverlay.classList.contains('visible'), false, 'stack trace overlay should remain hidden');

    documentStub.dispatch('keydown', { key: 'F4' });

    assert.strictEqual(audioPanel.classList.contains('visible'), false, 'F4 should close the audio overlay');
    assert.strictEqual(audioToggle.getAttribute('aria-pressed'), 'false', 'closing audio overlay should reset aria state');
    assert.strictEqual(logOverlay.classList.contains('visible'), false, 'stack trace overlay should never be toggled by audio controls');

    console.log('All debug overlay toggle tests passed.');
}

run();
