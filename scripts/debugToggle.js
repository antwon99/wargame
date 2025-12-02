/**
 * Debug overlay visibility controller.
 * Keeps the audio debug panel hidden by default and exposes a toggle via
 * keyboard (F3 or `) or the Debug button tucked in the bottom-left corner.
 */
(function() {
    let debugPanel = null;
    let toggleButton = null;

    /**
     * Ensure the debug panel element exists and update cached references.
     */
    function resolvePanel() {
        debugPanel = debugPanel || document.getElementById('audio-debug') || document.getElementById('audio-debug-panel');
        toggleButton = toggleButton || document.getElementById('debug-toggle');
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

    document.addEventListener('DOMContentLoaded', () => {
        resolvePanel();
        setDebugVisibility(false);

        if (toggleButton) {
            toggleButton.addEventListener('click', () => toggleDebug());
        }
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'F3' || event.key === '`' || event.key === '~') {
            toggleDebug();
        }
    });
})();
