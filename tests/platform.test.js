import assert from 'assert';
import { PlatformAdapter } from '../scripts/platform.js';

PlatformAdapter.initPlatformAdapter?.(globalThis);
const { applyPlatformProfileClasses, detectPlatformProfile, sizeCanvasForDisplay } = PlatformAdapter;

function testDetectsMobileProfile() {
    const profile = detectPlatformProfile({
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit',
        viewportWidth: 430,
        viewportHeight: 932,
        devicePixelRatio: 3
    });

    assert.strictEqual(profile.isMobile, true, 'iPhone UA + narrow viewport should be flagged as mobile');
    assert.strictEqual(profile.deviceScale, 3, 'device scale preserves provided DPR up to the cap');
    assert.strictEqual(profile.baseZoom, 0.82, 'mobile baseline zoom should ease the view out slightly');
}

function testDesktopProfileKeepsNormalZoom() {
    const profile = detectPlatformProfile({
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
        viewportWidth: 1440,
        viewportHeight: 900,
        devicePixelRatio: 1
    });

    assert.strictEqual(profile.isMobile, false, 'desktop UA with ample viewport should not be mobile');
    assert.strictEqual(profile.baseZoom, 1, 'desktop baseline zoom should remain at default scale');
}

function testCanvasSizingAppliesDeviceScale() {
    const canvas = { width: 0, height: 0, style: {} };
    const calls = [];
    const ctx = {
        setTransform: (...args) => calls.push(args)
    };

    sizeCanvasForDisplay(canvas, ctx, { viewportWidth: 320, viewportHeight: 640, deviceScale: 2 });

    assert.strictEqual(canvas.width, 640, 'canvas backing store should scale with DPR');
    assert.strictEqual(canvas.height, 1280, 'canvas backing store should scale with DPR');
    assert.strictEqual(canvas.style.width, '320px', 'canvas CSS width should match logical viewport');
    assert.strictEqual(canvas.style.height, '640px', 'canvas CSS height should match logical viewport');
    assert.deepStrictEqual(calls[0], [2, 0, 0, 2, 0, 0], 'context transform should respect device scale');
}

function createMockDocument() {
    const classes = new Set();
    const classList = {
        add: (value) => classes.add(value),
        remove: (value) => classes.delete(value),
        contains: (value) => classes.has(value),
        toggle: (value, force) => {
            if (force === undefined) {
                if (classes.has(value)) {
                    classes.delete(value);
                    return false;
                }
                classes.add(value);
                return true;
            }
            if (force) {
                classes.add(value);
                return true;
            }
            classes.delete(value);
            return false;
        }
    };
    const style = {
        values: {},
        setProperty: (key, value) => {
            style.values[key] = value;
        }
    };
    return { body: { classList, style } };
}

function testApplyPlatformProfileClassesSetsMobileClass() {
    const doc = createMockDocument();
    const profile = detectPlatformProfile({
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
        viewportWidth: 430,
        viewportHeight: 932,
        devicePixelRatio: 2
    });

    applyPlatformProfileClasses(profile, { document: doc });

    assert.strictEqual(doc.body.classList.contains('mobile'), true, 'mobile profile should set mobile class');
    assert.strictEqual(doc.body.classList.contains('desktop'), false, 'mobile profile should remove desktop class');
}

function testApplyPlatformProfileClassesSetsDesktopClass() {
    const doc = createMockDocument();
    const profile = detectPlatformProfile({
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
        viewportWidth: 1440,
        viewportHeight: 900,
        devicePixelRatio: 1
    });

    applyPlatformProfileClasses(profile, { document: doc });

    assert.strictEqual(doc.body.classList.contains('desktop'), true, 'desktop profile should set desktop class');
    assert.strictEqual(doc.body.classList.contains('mobile'), false, 'desktop profile should remove mobile class');
}

function run() {
    testDetectsMobileProfile();
    testDesktopProfileKeepsNormalZoom();
    testCanvasSizingAppliesDeviceScale();
    testApplyPlatformProfileClassesSetsMobileClass();
    testApplyPlatformProfileClassesSetsDesktopClass();
    console.log('All platform tests passed.');
}

run();
