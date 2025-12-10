/**
 * Debug overlay visibility controller.
 * Keeps the audio debug panel hidden by default and exposes a dedicated toggle via
 * keyboard (F4 or `) or the Audio Debug button tucked in the bottom-left corner.
 */
(function() {
    let debugPanel = null;
    let toggleButton = null;
    let debugToggles = null;

    /**
     * Establish a shared DebugToggles object for ad-hoc developer flags.
     * Defaults keep gameplay visuals clean unless explicitly flipped on.
     */
    function resolveDebugToggles() {
        if (debugToggles) return debugToggles;
        if (typeof window === 'undefined') return {};
        const existing = window.DebugToggles || {};
        debugToggles = { showClaimCosts: false, ...existing };
        window.DebugToggles = debugToggles;
        return debugToggles;
    }

    /**
     * Ensure the debug panel element exists and update cached references.
     */
    function resolvePanel() {
        debugPanel = debugPanel || document.getElementById('audio-debug') || document.getElementById('audio-debug-panel');
        toggleButton = toggleButton || document.getElementById('audio-debug-toggle');
    }

    /**
     * Show or hide the overlay while keeping its content intact.
     * @param {boolean} isVisible true to show the panel
     */
    function setDebugVisibility(isVisible) {
        resolvePanel();
        if (!debugPanel) return;
        debugPanel.classList.toggle('visible', isVisible);
        debugPanel.setAttribute('aria-hidden', (!isVisible).toString());
        if (toggleButton) {
            toggleButton.setAttribute('aria-pressed', isVisible.toString());
        }
    }

    /**
     * Flip the current visibility state of the overlay.
     */
    function toggleDebug() {
        resolvePanel();
        const shouldShow = !debugPanel?.classList.contains('visible');
        setDebugVisibility(shouldShow);
    }

    /** Flip overworld claim cost stamps for debug sessions without affecting defaults. */
    function toggleClaimCostLabels() {
        const toggles = resolveDebugToggles();
        toggles.showClaimCosts = !toggles.showClaimCosts;
        const state = toggles.showClaimCosts ? 'enabled' : 'disabled';
        console.info(`[DebugToggle] Claim cost overlays ${state}.`);
    }

    document.addEventListener('DOMContentLoaded', () => {
        resolvePanel();
        resolveDebugToggles();
        setDebugVisibility(false);

        if (toggleButton) {
            toggleButton.addEventListener('click', () => toggleDebug());
        }
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'F4' || event.key === '`' || event.key === '~') {
            toggleDebug();
        }
        if (event.key === 'F8') {
            toggleClaimCostLabels();
        }
    });
})();
