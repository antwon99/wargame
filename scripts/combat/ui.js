/**
 * Combat UI helpers that wrap DOM and FX interactions behind an injectable
 * interface so combat flow can run in tests without browser globals.
 */

/**
 * Emit brief visual indicators at each converted overworld hex so players can
 * locate the fallout of a defeat/retreat without opening new UI chrome.
 * @param {object} game live game object containing FX helpers.
 * @param {{conversions:Array<{hex:object, fate:string}>}} lossReport description of converted tiles.
 */
export function flashOverworldLosses(game, lossReport = { conversions: [] }) {
    const { conversions = [] } = lossReport;
    if (!Array.isArray(conversions) || conversions.length === 0) return;

    conversions.forEach(({ hex, fate }) => {
        if (!hex || typeof game.projectHexToScreen !== 'function') return;
        const pos = game.projectHexToScreen(hex);
        if (!pos) return;

        const colors = fate === 'rebel' ? ['#ef476f', '#ffd166'] : ['#9ca3af', '#6b7280'];
        game.spawnParticleBurst?.(pos.x, pos.y, 6, colors);
        const label = fate === 'rebel' ? 'Seized' : 'Scorched';
        game.showFloatingText?.(pos.x, pos.y, label, 'alert-text');
    });
}

/**
 * Build a UI handler that routes combat resolution feedback through provided
 * DOM and timer primitives. Tests can inject stubs for deterministic assertions.
 * @param {object} game live game object exposing visual helpers.
 * @param {object} [options] overrides for window/document/setTimeout.
 * @returns {{
 *   resolveAnchor: function,
 *   flashOverworldLosses: function,
 *   showFloatingText: function,
 *   queueFloatingText: function,
 *   toggleToOverworldUI: function,
 *   exitCombat: function,
 *   delay: function,
 * }}
 */
export function createCombatUI(game, options = {}) {
    const windowRef = options.windowRef ?? (typeof window !== 'undefined' ? window : { innerWidth: 0, innerHeight: 0 });
    const documentRef = options.documentRef ?? (typeof document !== 'undefined' ? document : null);
    const setTimeoutRef = options.setTimeoutRef ?? ((fn, ms) => setTimeout(fn, ms));

    const resolveAnchor = (clickEvt) => ({
        x: clickEvt?.clientX ?? (windowRef?.innerWidth || 0) * 0.5,
        y: clickEvt?.clientY ?? (windowRef?.innerHeight || 0) * 0.18
    });

    const showFloatingText = (anchor, text, cssClass = 'alert-text') => {
        if (!anchor || typeof game.showFloatingText !== 'function') return;
        game.showFloatingText(anchor.x, anchor.y, text, cssClass);
    };

    const queueFloatingText = (anchor, text, delay, cssClass = 'alert-text') => {
        setTimeoutRef(() => showFloatingText(anchor, text, cssClass), delay);
    };

    const toggleToOverworldUI = () => {
        if (!documentRef?.getElementById) return;
        const overworld = documentRef.getElementById('ui-overworld');
        const combat = documentRef.getElementById('ui-combat');
        const stateTxt = documentRef.getElementById('state-txt');
        overworld?.classList?.add('visible');
        combat?.classList?.remove('visible');
        if (stateTxt) stateTxt.innerText = 'KINGDOM';
    };

    const exitCombat = (outcome) => {
        if (typeof windowRef?.exitCombat === 'function') windowRef.exitCombat(outcome);
    };

    const delay = (fn, ms) => setTimeoutRef(fn, ms);

    return {
        resolveAnchor,
        flashOverworldLosses: (lossReport) => flashOverworldLosses(game, lossReport),
        showFloatingText,
        queueFloatingText,
        toggleToOverworldUI,
        exitCombat,
        delay
    };
}

// CommonJS compatibility for Node-based tests while preserving ESM exports for bundlers/browsers.
if (typeof module !== 'undefined') {
    module.exports = { createCombatUI, flashOverworldLosses };
}
