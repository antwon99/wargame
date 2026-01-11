import assert from 'assert';
import { applyUIBindings, setupUIBindings } from '../scripts/uiBindings.js';

function createButtonStub() {
    return { onclick: null };
}

function createCanvasStub() {
    const listeners = {};
    return {
        listeners,
        addEventListener(event, handler) {
            listeners[event] = handler;
        }
    };
}

function testZoomButtonsClampAndStep() {
    const zoomInBtn = createButtonStub();
    const zoomOutBtn = createButtonStub();

    global.document.getElementById = (id) => {
        if (id === 'zoom-in') return zoomInBtn;
        if (id === 'zoom-out') return zoomOutBtn;
        return null;
    };
    global.document.querySelectorAll = () => [];
    global.document.querySelector = () => null;

    const game = {
        cam: { x: 0, y: 0, zoom: 1 },
        settingsService: null,
        toggleSidebar: () => {}
    };

    setupUIBindings(game);

    assert.ok(typeof zoomInBtn.onclick === 'function', 'zoom in button should have a click handler');
    assert.ok(typeof zoomOutBtn.onclick === 'function', 'zoom out button should have a click handler');

    zoomInBtn.onclick();
    assert.strictEqual(game.cam.zoom, 1.1, 'zoom in should step the camera zoom upward');

    game.cam.zoom = 1.95;
    zoomInBtn.onclick();
    assert.strictEqual(game.cam.zoom, 2.0, 'zoom in should clamp at the max value');

    game.cam.zoom = 0.55;
    zoomOutBtn.onclick();
    assert.strictEqual(game.cam.zoom, 0.5, 'zoom out should clamp at the min value');
}

function testWheelZoomClampsToSameRange() {
    const canvas = createCanvasStub();
    const game = {
        cam: { x: 0, y: 0, zoom: 2.0 },
        canvas
    };

    applyUIBindings(game);
    game.setupInput();

    canvas.listeners.wheel({ preventDefault() {}, deltaY: -1000 });
    assert.strictEqual(game.cam.zoom, 2.0, 'wheel zoom should clamp at the max value');

    game.cam.zoom = 0.5;
    canvas.listeners.wheel({ preventDefault() {}, deltaY: 1000 });
    assert.strictEqual(game.cam.zoom, 0.5, 'wheel zoom should clamp at the min value');
}

function run() {
    testZoomButtonsClampAndStep();
    testWheelZoomClampsToSameRange();
    console.log('Zoom controls tests passed.');
}

run();
