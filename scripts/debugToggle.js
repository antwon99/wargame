/**
 * Debug overlay visibility controller.
 * Keeps the audio debug panel hidden by default and exposes a toggle via
 * keyboard (F3 or `) or the Debug button tucked in the bottom-left corner.
 */
import { BOOT_PHASES, getBootPhase } from './bootManager.js';
import { hydrateDebugBus } from './audio/debugBus.js';

let debugPanel = null;
let toggleButton = null;
let debugToggles = null;

/**
 * Establish a shared DebugToggles object for ad-hoc developer flags.
 * Defaults keep gameplay visuals clean unless explicitly flipped on.
 * @param {Window|Object} [target] scope that owns the DebugToggles object.
 * @returns {Object} resolved debug toggle flags.
 */
function resolveDebugToggles(target = typeof window !== 'undefined' ? window : undefined) {
    if (debugToggles) return debugToggles;
    if (!target) return {};
    const existing = target.DebugToggles || {};
    debugToggles = { showClaimCosts: false, showDebugLog: false, audioDebugBus: false, ...existing };
    target.DebugToggles = debugToggles;
    return debugToggles;
}

/**
 * Ensure the debug panel element exists and update cached references.
 * @param {Document|Object|null} doc document-like API with getElementById.
 */
function resolvePanel(doc) {
    if (!doc) return;
    debugPanel = debugPanel || doc.getElementById('audio-debug') || doc.getElementById('audio-debug-panel');
    toggleButton = toggleButton || doc.getElementById('debug-toggle');
}

/**
 * Show or hide the overlay while keeping its content intact.
 * @param {boolean} isVisible true to show the panel.
 * @param {Document|Object|null} doc document-like API for lookups.
 */
function setDebugVisibility(isVisible, doc = typeof document !== 'undefined' ? document : null) {
    resolvePanel(doc);
    if (!debugPanel) return;
    debugPanel.classList.toggle('visible', isVisible);
    debugPanel.setAttribute('aria-hidden', (!isVisible).toString());
    if (toggleButton) {
        toggleButton.setAttribute('aria-pressed', isVisible.toString());
    }
    if (debugToggles) {
        debugToggles.showDebugLog = isVisible;
        if (isVisible) {
            debugToggles.audioDebugBus = true;
            hydrateDebugBus();
        }
    }
    const debugLogEl = doc?.getElementById?.('debug-log');
    if (!debugLogEl?.classList) return;
    if (isVisible && debugLogEl.textContent) {
        debugLogEl.classList.add('visible');
        return;
    }
    if (getBootPhase() !== BOOT_PHASES.READY) {
        debugLogEl.classList.remove('visible');
    }
}

/**
 * Flip the current visibility state of the overlay.
 * @param {Document|Object|null} doc document-like API for lookups.
 */
function toggleDebug(doc = typeof document !== 'undefined' ? document : null) {
    resolvePanel(doc);
    const shouldShow = !debugPanel?.classList.contains('visible');
    setDebugVisibility(shouldShow, doc);
}

/**
 * Flip overworld claim cost stamps for debug sessions without affecting defaults.
 * @param {Window|Object} [target] scope that owns the DebugToggles object.
 */
function toggleClaimCostLabels(target = typeof window !== 'undefined' ? window : undefined) {
    const toggles = resolveDebugToggles(target);
    toggles.showClaimCosts = !toggles.showClaimCosts;
    const state = toggles.showClaimCosts ? 'enabled' : 'disabled';
    console.info(`[DebugToggle] Claim cost overlays ${state}.`);
}

/**
 * Wire up debug toggle interactions for DOM-enabled environments.
 * @param {Window|Object} [target] global object that owns DebugToggles.
 * @param {Object} [options] optional init overrides for tests.
 * @param {Document|Object|null} [options.document] document-like scope to query.
 * @returns {{ toggleDebug: Function, setDebugVisibility: Function, toggleClaimCostLabels: Function, keyHandler: Function|null }}
 */
function initDebugToggle(target = typeof window !== 'undefined' ? window : undefined, options = {}) {
    const doc = options.document || target?.document || (typeof document !== 'undefined' ? document : null);
    if (!doc || typeof doc.addEventListener !== 'function') {
        resolveDebugToggles(target);
        return {
            toggleDebug,
            setDebugVisibility,
            toggleClaimCostLabels,
            keyHandler: null
        };
    }

    resolvePanel(doc);
    resolveDebugToggles(target);
    setDebugVisibility(false, doc);

    if (toggleButton) {
        toggleButton.addEventListener('click', () => toggleDebug(doc));
    }

    const keyHandler = (event) => {
        if (event.key === 'F3' || event.key === '`' || event.key === '~') {
            toggleDebug(doc);
        }
        if (event.key === 'F8') {
            toggleClaimCostLabels(target);
        }
    };

    doc.addEventListener('keydown', keyHandler);

    return {
        toggleDebug,
        setDebugVisibility,
        toggleClaimCostLabels,
        keyHandler
    };
}

const DebugToggle = {
    initDebugToggle,
    toggleDebug,
    setDebugVisibility,
    toggleClaimCostLabels
};

export { DebugToggle, initDebugToggle, toggleDebug, setDebugVisibility, toggleClaimCostLabels };
