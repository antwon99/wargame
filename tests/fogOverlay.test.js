const assert = require('assert');
const { FogOverlay, setFogVariant } = require('../scripts/fogOverlay.js');

function buildStubDocument() {
    const fogEl = {
        style: {},
        setAttribute: function (key, value) { this[key] = value; }
    };
    return {
        getElementById: id => (id === 'fog-overlay' ? fogEl : null),
        fogEl
    };
}

function resetOverlay() {
    FogOverlay.fogEl = null;
    FogOverlay.activeVariant = 'dark';
}

function testInitAppliesDefaultFog() {
    resetOverlay();
    const doc = buildStubDocument();
    const wired = FogOverlay.init(doc);
    assert.ok(wired, 'init should wire the fog overlay when present');
    assert.strictEqual(doc.fogEl.style.backgroundImage, "url('assets/fog/fogdark.png')");
    assert.strictEqual(FogOverlay.activeVariant, 'dark');
}

function testVariantSwapUsesLightTexture() {
    resetOverlay();
    const doc = buildStubDocument();
    FogOverlay.init(doc);
    const applied = setFogVariant('light');
    assert.strictEqual(applied, 'light');
    assert.strictEqual(doc.fogEl.style.backgroundImage, "url('assets/fog/foglight.png')");
    assert.strictEqual(doc.fogEl['data-fog-variant'], 'light');
}

function testVariantPersistsUntilInit() {
    resetOverlay();
    setFogVariant('light');
    const doc = buildStubDocument();
    FogOverlay.init(doc);
    assert.strictEqual(FogOverlay.activeVariant, 'light');
    assert.strictEqual(doc.fogEl.style.backgroundImage, "url('assets/fog/foglight.png')");
}

function run() {
    testInitAppliesDefaultFog();
    testVariantSwapUsesLightTexture();
    testVariantPersistsUntilInit();
    console.log('All fog overlay tests passed.');
}

run();
