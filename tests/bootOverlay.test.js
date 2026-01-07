import assert from 'assert';
import { BootOverlay } from '../scripts/bootOverlay.js';

function createStubElement() {
    const listeners = {};
    const classSet = new Set();
    const element = {
        style: {},
        addEventListener: (event, cb) => {
            listeners[event] = listeners[event] || [];
            listeners[event].push(cb);
        },
        trigger: event => {
            (listeners[event] || []).forEach(cb => cb());
        },
        classList: {
            add: (...names) => names.forEach(name => classSet.add(name)),
            remove: (...names) => names.forEach(name => classSet.delete(name)),
            contains: name => classSet.has(name)
        }
    };
    return element;
}

function buildStubDocument() {
    const overlayEl = createStubElement();
    const errorEl = createStubElement();
    return {
        getElementById: id => {
            if (id === 'boot-overlay') return overlayEl;
            if (id === 'boot-overlay-error') return errorEl;
            return null;
        },
        overlayEl
    };
}

function resetBootOverlayState() {
    BootOverlay.overlayEl = null;
    BootOverlay.errorEl = null;
    BootOverlay.initialized = false;
    BootOverlay.hidden = false;
}

function testInitBindsOverlay() {
    const doc = buildStubDocument();
    resetBootOverlayState();
    const initialized = BootOverlay.initBootOverlay
        ? BootOverlay.initBootOverlay(globalThis, { document: doc, defer: false }).initialized
        : BootOverlay.init(doc);

    assert.ok(initialized, 'init should bind the boot overlay element');
    assert.strictEqual(doc.overlayEl.style.display, 'flex', 'init should ensure the overlay is displayed');
    assert.ok(!doc.overlayEl.classList.contains('boot-hidden'), 'init should keep the overlay visible');
}

function testHideFadesOverlay() {
    const doc = buildStubDocument();
    resetBootOverlayState();
    BootOverlay.initBootOverlay
        ? BootOverlay.initBootOverlay(globalThis, { document: doc, defer: false })
        : BootOverlay.init(doc);

    BootOverlay.hide();
    assert.ok(doc.overlayEl.classList.contains('boot-hidden'), 'hide should add the hidden class');

    doc.overlayEl.trigger('transitionend');
    assert.strictEqual(doc.overlayEl.style.display, 'none', 'transition end should remove overlay from layout');
}

function testShowRestoresOverlay() {
    const doc = buildStubDocument();
    resetBootOverlayState();
    BootOverlay.initBootOverlay
        ? BootOverlay.initBootOverlay(globalThis, { document: doc, defer: false })
        : BootOverlay.init(doc);

    BootOverlay.hide();
    BootOverlay.show();

    assert.ok(!doc.overlayEl.classList.contains('boot-hidden'), 'show should clear the hidden class');
    assert.strictEqual(doc.overlayEl.style.display, 'flex', 'show should restore flex display');
}

function testSetErrorDisplaysMessage() {
    const doc = buildStubDocument();
    resetBootOverlayState();
    BootOverlay.initBootOverlay
        ? BootOverlay.initBootOverlay(globalThis, { document: doc, defer: false })
        : BootOverlay.init(doc);

    BootOverlay.setError('Loading failed.');
    const errorEl = doc.getElementById('boot-overlay-error');
    assert.ok(errorEl.classList.contains('is-visible'), 'setError should show the error block');
    assert.strictEqual(errorEl.textContent, 'Loading failed.', 'setError should populate the error text');

    BootOverlay.setError('');
    assert.ok(!errorEl.classList.contains('is-visible'), 'setError should hide the error block when cleared');
}

function run() {
    testInitBindsOverlay();
    testHideFadesOverlay();
    testShowRestoresOverlay();
    testSetErrorDisplaysMessage();
    console.log('All boot overlay tests passed.');
}

run();
