/**
 * AmbienceRenderer paints drifting grayscale cloud layers above the void fill so
 * the board feels alive without competing with gameplay UI. Layers repeat a
 * pre-baked noise texture and drift independently to avoid visible seams. The
 * renderer can be safely constructed while disabled so feature toggles or
 * alternative atmospheric effects can enable it later without side effects.
 */
export default class AmbienceRenderer {
    /**
     * Create a renderer with optional layer + fade overrides.
     *
     * @param {object} options optional initialization config.
     * @param {CanvasRenderingContext2D} options.ctx target canvas context.
     * @param {object} [options.config] optional configuration overrides.
     * @param {Function} [options.canvasFactory] factory for temporary canvases (useful for tests/headless).
     */
    constructor({ ctx, config = {}, canvasFactory } = {}) {
        this.ctx = ctx;
        this.time = 0;
        this.viewport = { width: 0, height: 0 };
        this.config = this.resolveConfig(config);
        this.canvasFactory = canvasFactory || (() => {
            if (typeof document === 'undefined') return null;
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 512;
            return canvas;
        });
        this.layers = this.config.layers.map((layerConfig, index) => ({
            config: layerConfig,
            pattern: null,
            seed: index * 97 + 11
        }));
        this.rebuildTextures();
    }

    /**
     * Merge user overrides with defaults so tests and feature toggles can safely
     * tweak drift speeds and opacity without mutating shared constants.
     *
     * @param {object} overrides optional overrides for ambience visuals.
     * @returns {object} sanitized configuration.
     */
    resolveConfig(overrides = {}) {
        const defaultConfig = {
            enabled: false,
            fadeRadiusFactor: 0.55,
            fadeFeather: 0.35,
            layers: [
                { opacity: 0.05, drift: { x: 8, y: -3 }, scale: 520, density: 0.18 },
                { opacity: 0.035, drift: { x: -5, y: 6 }, scale: 640, density: 0.22 },
                { opacity: 0.028, drift: { x: 14, y: 9 }, scale: 780, density: 0.14 }
            ]
        };
        const merged = {
            ...defaultConfig,
            ...overrides,
            layers: Array.isArray(overrides.layers) ? overrides.layers : defaultConfig.layers
        };
        merged.fadeRadiusFactor = Number.isFinite(merged.fadeRadiusFactor) ? merged.fadeRadiusFactor : defaultConfig.fadeRadiusFactor;
        merged.fadeFeather = Number.isFinite(merged.fadeFeather) ? merged.fadeFeather : defaultConfig.fadeFeather;
        merged.layers = merged.layers.map(layer => ({
            opacity: Math.max(0, Math.min(1, layer.opacity ?? 0.04)),
            drift: {
                x: Number.isFinite(layer.drift?.x) ? layer.drift.x : 8,
                y: Number.isFinite(layer.drift?.y) ? layer.drift.y : -3
            },
            scale: Math.max(120, layer.scale || 512),
            density: Math.max(0.05, Math.min(0.5, layer.density ?? 0.2))
        }));
        return merged;
    }

    /**
     * Allocate/rebuild repeating textures so drifting layers stay seamless.
     * Invoked at construction and whenever density/scale inputs change.
     */
    rebuildTextures() {
        this.layers.forEach(layer => {
            const canvas = this.canvasFactory?.();
            if (!canvas || typeof canvas.getContext !== 'function') {
                layer.pattern = null;
                return;
            }
            const size = layer.config.scale;
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, size, size);
            this.seededNoise(ctx, size, layer.config.density, layer.seed);
            layer.pattern = this.ctx?.createPattern ? this.ctx.createPattern(canvas, 'repeat') : null;
        });
    }

    /**
     * Generate soft blot noise using radial gradients instead of image assets.
     *
     * @param {CanvasRenderingContext2D} ctx noise context.
     * @param {number} size canvas dimension.
     * @param {number} density blot density from 0..1.
     * @param {number} seed deterministic seed to offset randomness per layer.
     */
    seededNoise(ctx, size, density, seed = 1) {
        const blotCount = Math.max(8, Math.floor(size * density));
        for (let i = 0; i < blotCount; i += 1) {
            const localSeed = (seed + i * 37) % 7919;
            const rng = this.seededRandom(localSeed);
            const radius = (size * 0.2 + rng() * size * 0.25);
            const x = rng() * size;
            const y = rng() * size;
            const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
            gradient.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
            gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = gradient;
            ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
        }
    }

    /**
     * Build a deterministic RNG so each layer drifts predictably across reloads.
     *
     * @param {number} seed numeric seed.
     * @returns {Function} seeded pseudo-random generator.
     */
    seededRandom(seed) {
        let value = seed % 2147483647;
        return () => {
            value = (value * 48271) % 2147483647;
            return (value - 1) / 2147483646;
        };
    }

    /**
     * Update the viewport so fade masks and pattern tiling cover the full canvas.
     *
     * @param {{width:number,height:number}} viewport new viewport dimensions.
     */
    resize(viewport = { width: 0, height: 0 }) {
        this.viewport = { ...viewport };
    }

    /**
     * Advance drift time without touching fog-of-war state.
     *
     * @param {number} dt delta time in seconds.
     */
    update(dt = 0) {
        if (!this.config.enabled) return;
        this.time += dt;
    }

    /**
     * Draw drifting cloud layers and apply a radial readability fade that keeps
     * the immediate territory clear.
     *
     * @param {object} options render options.
     * @param {{x:number,y:number}} options.center radial fade anchor.
     */
    render({ center } = {}) {
        if (!this.config.enabled || !this.ctx || !this.viewport?.width || !this.viewport?.height) return;
        const anchor = center || { x: this.viewport.width / 2, y: this.viewport.height / 2 };
        this.layers.forEach(layer => this.renderLayer(layer, anchor));
        this.applyReadabilityMask(anchor);
    }

    /**
     * Render an individual cloud layer using a repeating pattern and drift offset.
     *
     * @param {object} layer layer metadata including config + pattern.
     * @param {{x:number,y:number}} anchor center for the fade mask (used for translation parity).
     */
    renderLayer(layer, anchor) {
        if (!layer.pattern) return;
        const { opacity, drift, scale } = layer.config;
        const offsetX = (this.time * drift.x + anchor.x * 0.02 + layer.seed) % scale;
        const offsetY = (this.time * drift.y + anchor.y * 0.02 + layer.seed) % scale;
        this.ctx.save();
        this.ctx.globalAlpha = opacity;
        this.ctx.translate(-offsetX, -offsetY);
        this.ctx.fillStyle = layer.pattern;
        this.ctx.fillRect(-scale, -scale, this.viewport.width + scale * 2, this.viewport.height + scale * 2);
        this.ctx.restore();
    }

    /**
     * Carve out a radial hole in the ambience so the board center remains readable.
     *
     * @param {{x:number,y:number}} center anchor point for the gradient fade.
     */
    applyReadabilityMask(center) {
        const radius = Math.max(this.viewport.width, this.viewport.height) * this.config.fadeRadiusFactor;
        const inner = Math.max(32, radius * (1 - this.config.fadeFeather));
        const gradient = this.ctx.createRadialGradient(center.x, center.y, inner, center.x, center.y, radius);
        gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 1)');
        this.ctx.save();
        this.ctx.globalCompositeOperation = 'destination-out';
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(center.x - radius, center.y - radius, radius * 2, radius * 2);
        this.ctx.restore();
    }
}

export { AmbienceRenderer };
