import assert from 'assert';
import { BootOverlay } from '../scripts/bootOverlay.js';

function createStubElement() {
    const listeners = {};
    const classSet = new Set();
    const element = {
        style: {},
        disabled: false,
        textContent: '',
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
    const statusEl = createStubElement();
    const readyTextEl = createStubElement();
    const readyButtonEl = createStubElement();
    return {
        getElementById: id => {
            if (id === 'boot-overlay') return overlayEl;
            if (id === 'boot-overlay-error') return errorEl;
            if (id === 'boot-overlay-status') return statusEl;
            if (id === 'boot-overlay-ready-text') return readyTextEl;
            if (id === 'boot-overlay-ready') return readyButtonEl;
            return null;
        },
        overlayEl,
        statusEl,
        readyTextEl,
        readyButtonEl
    };
}

function resetBootOverlayState() {
    BootOverlay.overlayEl = null;
    BootOverlay.errorEl = null;
    BootOverlay.statusEl = null;
    BootOverlay.readyTextEl = null;
    BootOverlay.readyButtonEl = null;
    BootOverlay.initialized = false;
    BootOverlay.hidden = false;
    BootOverlay.requiresAcknowledgement = false;
    BootOverlay.readyAcknowledged = false;
    BootOverlay.onAcknowledged = null;
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
    assert.ok(doc.readyButtonEl.disabled, 'init should keep the ready button disabled');
    assert.ok(!doc.readyButtonEl.classList.contains('is-visible'), 'init should keep the ready button hidden');
    assert.ok(!doc.readyTextEl.classList.contains('is-visible'), 'init should keep the ready text hidden');
    assert.ok(!doc.statusEl.classList.contains('is-hidden'), 'init should keep the loading status visible');
}

function testHideRequiresAcknowledgement() {
    const doc = buildStubDocument();
    resetBootOverlayState();
    BootOverlay.initBootOverlay
        ? BootOverlay.initBootOverlay(globalThis, { document: doc, defer: false })
        : BootOverlay.init(doc);

    BootOverlay.hide();
    assert.ok(!doc.overlayEl.classList.contains('boot-hidden'), 'hide should wait until the ready button is acknowledged');

    BootOverlay.markReady();
    assert.ok(!doc.readyButtonEl.disabled, 'markReady should enable the ready button');
    assert.ok(doc.readyButtonEl.classList.contains('is-visible'), 'markReady should show the ready button');
    assert.ok(doc.readyTextEl.classList.contains('is-visible'), 'markReady should show the ready text');
    assert.ok(doc.statusEl.classList.contains('is-hidden'), 'markReady should hide the loading status');

    doc.readyButtonEl.trigger('click');
    assert.ok(doc.overlayEl.classList.contains('is-fading'), 'clicking the ready button should start fading the overlay');
    assert.ok(!doc.overlayEl.classList.contains('boot-hidden'), 'overlay should not be fully hidden until the fade completes');

    doc.overlayEl.trigger('transitionend');
    assert.ok(doc.overlayEl.classList.contains('boot-hidden'), 'transition end should finalize the hidden state');
    assert.strictEqual(doc.overlayEl.style.display, 'none', 'transition end should remove overlay from layout');
}

function testShowRestoresOverlay() {
    const doc = buildStubDocument();
    resetBootOverlayState();
    BootOverlay.initBootOverlay
        ? BootOverlay.initBootOverlay(globalThis, { document: doc, defer: false })
        : BootOverlay.init(doc);

    BootOverlay.markReady();
    doc.readyButtonEl.trigger('click');
    BootOverlay.show();

    assert.ok(!doc.overlayEl.classList.contains('boot-hidden'), 'show should clear the hidden class');
    assert.strictEqual(doc.overlayEl.style.display, 'flex', 'show should restore flex display');
    assert.ok(doc.readyButtonEl.disabled, 'show should reset the ready button to disabled');
    assert.ok(!doc.readyButtonEl.classList.contains('is-visible'), 'show should hide the ready button until marked ready');
    assert.ok(!doc.readyTextEl.classList.contains('is-visible'), 'show should reset the ready text visibility');
    assert.ok(!doc.statusEl.classList.contains('is-hidden'), 'show should restore the loading status');
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
    testHideRequiresAcknowledgement();
    testShowRestoresOverlay();
    testSetErrorDisplaysMessage();
    console.log('All boot overlay tests passed.');
}

run();
