const assert = require('assert');

async function run() {
    const { AmbienceRenderer } = await import('../scripts/ambienceRenderer.js');
    const ops = [];
    const gradients = [];
    const ctx = {
        fillStyle: null,
        _alpha: 1,
        _gco: 'source-over',
        set globalAlpha(value) { this._alpha = value; ops.push(['globalAlpha', value]); },
        get globalAlpha() { return this._alpha; },
        set globalCompositeOperation(value) { this._gco = value; ops.push(['composite', value]); },
        get globalCompositeOperation() { return this._gco; },
        save: () => ops.push('save'),
        restore: () => ops.push('restore'),
        translate: (...args) => ops.push(['translate', ...args]),
        fillRect: (...args) => ops.push(['fillRect', ...args]),
        createPattern: () => 'pattern',
        createRadialGradient: (...args) => {
            gradients.push(args);
            return { addColorStop: () => {} };
        }
    };

    const renderer = new AmbienceRenderer({
        ctx,
        config: {
            fadeRadiusFactor: 0.5,
            fadeFeather: 0.25,
            layers: [{ opacity: 0.5, drift: { x: 1, y: 0 }, scale: 100, density: 0.1 }]
        },
        canvasFactory: () => ({
            width: 0,
            height: 0,
            getContext: () => ({
                clearRect: () => {},
                createRadialGradient: () => ({ addColorStop: () => {} }),
                fillRect: () => {},
                fillStyle: ''
            })
        })
    });

    renderer.resize({ width: 200, height: 100 });
    renderer.update(1);
    renderer.render({ center: { x: 50, y: 25 } });

    const firstLayerFill = ops.find(op => Array.isArray(op) && op[0] === 'fillRect' && op.length > 2);
    assert.ok(firstLayerFill, 'cloud layer should draw a fillRect using its pattern');

    const appliedAlpha = ops.find(op => Array.isArray(op) && op[0] === 'globalAlpha');
    assert.deepStrictEqual(appliedAlpha, ['globalAlpha', 0.5], 'layer opacity should be applied to the context');

    const fadeArgs = gradients[gradients.length - 1];
    assert.deepStrictEqual(
        fadeArgs,
        [50, 25, 75, 50, 25, 100],
        'readability gradient should center on the provided anchor with expected radii'
    );

    const compositingStep = ops.find(op => Array.isArray(op) && op[0] === 'composite');
    assert.deepStrictEqual(
        compositingStep,
        ['composite', 'destination-out'],
        'ambience mask should use destination-out compositing to punch a hole through the clouds'
    );

    renderer.applyIntensityProfile({ intensity: 0, opacityFloor: 0 });
    assert.strictEqual(renderer.config.enabled, false, 'zero intensity should disable ambience rendering');

    renderer.applyIntensityProfile({ intensity: 1, driftMultiplier: 2, densityMultiplier: 1.5, scaleMultiplier: 0.5, whiteness: 1.1 });
    const modulatedLayer = renderer.layers[0];
    assert.ok(modulatedLayer.config.opacity >= 0.5, 'full intensity should preserve or raise base opacity');
    assert.ok(modulatedLayer.config.drift.x > modulatedLayer.baseConfig.drift.x, 'drift should speed up when driftMultiplier is applied');
    assert.ok(modulatedLayer.config.whiteness >= modulatedLayer.baseConfig.whiteness, 'whiteness should scale up with intensity');

    console.log('Ambience renderer tests passed.');
}

run();
