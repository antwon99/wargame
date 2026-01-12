import assert from 'assert';
import fs from 'fs';
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
    const zoomControls = {};
    const originalMatchMedia = global.window.matchMedia;

    global.document.getElementById = (id) => {
        if (id === 'zoom-controls') return zoomControls;
        if (id === 'zoom-in') return zoomInBtn;
        if (id === 'zoom-out') return zoomOutBtn;
        return null;
    };
    global.document.querySelectorAll = () => [];
    global.document.querySelector = () => null;
    global.window.matchMedia = () => ({ matches: true });

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

    global.window.matchMedia = originalMatchMedia;
}

function testZoomButtonsSkipDesktopViewport() {
    const zoomInBtn = createButtonStub();
    const zoomOutBtn = createButtonStub();
    const zoomControls = {};
    const originalMatchMedia = global.window.matchMedia;

    global.document.getElementById = (id) => {
        if (id === 'zoom-controls') return zoomControls;
        if (id === 'zoom-in') return zoomInBtn;
        if (id === 'zoom-out') return zoomOutBtn;
        return null;
    };
    global.document.querySelectorAll = () => [];
    global.document.querySelector = () => null;
    global.window.matchMedia = () => ({ matches: false });

    const game = {
        cam: { x: 0, y: 0, zoom: 1 },
        settingsService: null,
        toggleSidebar: () => {}
    };

    setupUIBindings(game);

    assert.strictEqual(zoomInBtn.onclick, null, 'zoom in button should not bind outside mobile viewport');
    assert.strictEqual(zoomOutBtn.onclick, null, 'zoom out button should not bind outside mobile viewport');

    global.window.matchMedia = originalMatchMedia;
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
    testZoomButtonsSkipDesktopViewport();
    testWheelZoomClampsToSameRange();
    const css = fs.readFileSync('style.css', 'utf8');
    assert.ok(css.includes('.zoom-controls') && css.includes('pointer-events: none'), 'zoom controls container should ignore pointer events');
    assert.ok(css.includes('.zoom-control-button') && css.includes('pointer-events: auto'), 'zoom buttons should accept pointer events');
    assert.ok(
        css.includes('@media (max-width: 768px)') && css.includes('min-width: 44px') && css.includes('min-height: 44px'),
        'mobile zoom buttons should meet minimum touch size'
    );
    console.log('Zoom controls tests passed.');
}

run();
