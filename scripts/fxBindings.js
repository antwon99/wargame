/**
 * FX bindings manage on-screen feedback like floating text, particles, and war tips.
 * Extracting them keeps applyUIBindings lean while enabling focused tests for visual effects.
 */

/**
 * Render a transient floating text element within the FX layer.
 * @param {object} game live game singleton containing FX host references.
 * @param {number} x x-position for the text.
 * @param {number} y y-position for the text.
 * @param {string} txt copy to display.
 * @param {string} [cssClass] optional modifier class for color/size.
 */
function showFloatingText(game, x, y, txt, cssClass) {
    const layer = game.fxLayer || document.getElementById('fx-layer');
    if (!layer) return;
    const el = document.createElement('div');
    el.className = 'floating-text';
    if (cssClass) el.classList.add(cssClass);
    el.innerText = txt;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    layer.appendChild(el);
    setTimeout(() => el.remove(), 820);
}

/**
 * Apply a brief shake animation to the main game container to emphasize impactful events.
 * @param {object} game live game singleton containing shake timer references.
 */
function triggerCameraShake(game) {
    const target = document.getElementById('game-container');
    if (!target) return;
    target.classList.add('shake');
    clearTimeout(game.shakeTimer);
    game.shakeTimer = setTimeout(() => target.classList.remove('shake'), Juice.clampShakeDuration(300));
}

/**
 * Spawn a burst of animated particle divs from the provided screen coordinate.
 * @param {object} game live game singleton containing FX host references.
 * @param {number} x burst x-position.
 * @param {number} y burst y-position.
 * @param {number} [count=6] how many particles to spawn.
 * @param {Array<string>} [colors] palette applied across particles.
 */
function spawnParticleBurst(game, x, y, count = 6, colors = ['#ffd166', '#06d6a0', '#ef476f']) {
    const layer = game.fxLayer || document.getElementById('fx-layer');
    if (!layer || typeof Juice === 'undefined') return;
    const burst = Juice.createBurstVectors(count, 18, 46);
    burst.forEach((vec, idx) => {
        const node = document.createElement('div');
        node.className = 'particle';
        node.style.left = `${x}px`;
        node.style.top = `${y}px`;
        node.style.setProperty('--dx', vec.dx.toFixed(2));
        node.style.setProperty('--dy', vec.dy.toFixed(2));
        node.style.background = colors[idx % colors.length];
        layer.appendChild(node);
        setTimeout(() => node.remove(), vec.duration);
    });
}

/**
 * Convenience wrapper to trigger a particle burst at a hex coordinate.
 * @param {object} game live game singleton with projection helpers.
 * @param {object} deps shared dependencies containing Hex implementations.
 * @param {object} pos hex to anchor burst around.
 * @param {number} [count] particle count.
 */
function spawnBurstAtHex(game, deps, pos, count) {
    const point = game.projectHexToScreen(pos);
    spawnParticleBurst(game, point.x, point.y, count);
}

/**
 * Spawn combat text anchored to a hex coordinate using the floater animation system.
 * @param {object} game live game singleton.
 * @param {object} deps shared dependencies containing Hex/Layout classes.
 * @param {object} pos hex position (object or hex instance).
 * @param {string} txt text content.
 * @param {string} col CSS color value.
 */
function spawnTxt(game, deps, pos, txt, col) {
    const HexImpl = deps.Hex || game.Hex || window.Hex;
    const LayoutImpl = deps.Layout || window.Layout || {};
    const layout = { origin: game.cam, size: 30 * game.cam.zoom, ...LayoutImpl };
    const hex = pos.toPixel ? pos : new HexImpl(pos.q, pos.r, pos.s ?? -pos.q - pos.r);
    const p = hex.toPixel(layout);
    const el = document.createElement('div');
    el.className = 'floater'; el.innerText = txt;
    el.style.left = `${p.x}px`; el.style.top = `${p.y}px`; el.style.color = col;
    document.body.appendChild(el);
    game.combat.particles.push({ el, life: 2.5 });
}

/**
 * Show a timed combat tip pulled from the provided tips array.
 * @param {object} deps dependency bag containing a TIPS array.
 */
function showWarTip(deps) {
    const tips = deps.TIPS || [];
    const el = document.getElementById('tip-overlay');
    if (!el) return;
    const tip = tips.length > 0 ? tips[Math.floor(Math.random() * tips.length)] : '';
    el.innerText = tip;
    el.classList.add('tip-visible');
    setTimeout(() => el.classList.remove('tip-visible'), 4000);
}

/** Hide the active war tip overlay if it exists. */
function hideWarTip() {
    const el = document.getElementById('tip-overlay');
    if (!el) return;
    el.classList.remove('tip-visible');
}

/**
 * Attach FX helpers to the game object to keep gameplay logic free of DOM dependencies.
 * @param {object} game live game singleton.
 * @param {object} deps shared helper implementations for positioning text around hexes.
 */
function bindFxHelpers(game, deps) {
    game.showFloatingText = (x, y, txt, cssClass) => showFloatingText(game, x, y, txt, cssClass);
    game.triggerCameraShake = () => triggerCameraShake(game);
    game.spawnParticleBurst = (x, y, count, colors) => spawnParticleBurst(game, x, y, count, colors);
    game.spawnBurstAtHex = (pos, count) => spawnBurstAtHex(game, deps, pos, count);
    game.spawnTxt = (pos, txt, col) => spawnTxt(game, deps, pos, txt, col);
    game.showWarTip = () => showWarTip(deps);
    game.hideWarTip = () => hideWarTip();
}

export {
    bindFxHelpers,
    hideWarTip,
    showFloatingText,
    showWarTip,
    spawnBurstAtHex,
    spawnParticleBurst,
    spawnTxt,
    triggerCameraShake
};
