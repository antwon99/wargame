/**
 * Resolve the shared tutorial callout helper regardless of module system.
 */
function getCalloutHelper() {
    if (typeof TutorialCallouts !== 'undefined') return TutorialCallouts;
    if (typeof window !== 'undefined' && window.TutorialCallouts) return window.TutorialCallouts;
    return null;
}

/**
 * Display a tile-anchored callout using the shared tutorial helper so game logic stays DOM-agnostic.
 * @param {object} game live game singleton.
 * @param {object} tile tile to anchor against.
 * @param {object} options passthrough options for TutorialCallouts.showTileCallout.
 */
export function showTileCallout(game, tile, options) {
    const helper = getCalloutHelper();
    if (!helper || typeof helper.showTileCallout !== 'function') return null;
    return helper.showTileCallout(game, tile, options);
}

/** Hide the active tile-anchored callout when the player acknowledges the prompt. */
export function hideTileCallout() {
    const helper = getCalloutHelper();
    if (!helper || typeof helper.hideTileCallout !== 'function') return;
    helper.hideTileCallout();
}

/**
 * Surface a rotating war tip in the overlay without blocking interactions.
 * @param {object} deps ambient dependencies such as the TIPS array used for random selection.
 */
export function showWarTip(deps) {
    const tips = deps.TIPS || [];
    const el = document.getElementById('tip-overlay');
    if (!el) return;
    const tip = tips.length > 0 ? tips[Math.floor(Math.random() * tips.length)] : '';
    el.innerText = tip;
    el.classList.add('tip-visible');
    setTimeout(() => el.classList.remove('tip-visible'), 4000);
}

/** Hide the war tip overlay immediately. */
export function hideWarTip() {
    const el = document.getElementById('tip-overlay');
    if (!el) return;
    el.classList.remove('tip-visible');
}

/**
 * Bind callout helpers directly to the game object so systems can stay DOM-agnostic.
 * @param {object} game live game singleton.
 * @param {object} deps shared dependencies like TIPS or helper classes.
 */
export function bindCalloutHelpers(game, deps = {}) {
    game.showTileCallout = (tile, opts) => showTileCallout(game, tile, opts);
    game.hideTileCallout = () => hideTileCallout();
    game.showWarTip = () => showWarTip(deps);
    game.hideWarTip = () => hideWarTip();
}
