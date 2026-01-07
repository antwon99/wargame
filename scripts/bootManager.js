/**
 * BootManager tracks the boot lifecycle and coordinates UI guards that should
 * react to loading, intro, and ready phases. Consumers call setBootPhase to
 * synchronize overlays, audio guards, and notification blockers.
 */
const BOOT_PHASES = Object.freeze({
    LOADING: 'LOADING',
    INTRO: 'INTRO',
    READY: 'READY'
});

const bootState = {
    phase: BOOT_PHASES.LOADING,
    bootOverlay: null,
    introOverlay: null,
    audioManager: null,
    debugEl: null,
    debugToggles: null,
    awaitingAcknowledgement: false,
    listeners: new Set()
};

/**
 * Register runtime dependencies so boot state transitions can target live
 * overlays and audio systems without relying on globals.
 * @param {object} dependencies boot manager dependencies to cache.
 * @param {object|null} [dependencies.bootOverlay] boot overlay helper instance.
 * @param {object|null} [dependencies.introOverlay] intro overlay helper instance.
 * @param {object|null} [dependencies.audioManager] audio manager with UI guard APIs.
 * @param {HTMLElement|null} [dependencies.debugEl] debug log element reference.
 * @param {object|null} [dependencies.debugToggles] debug toggle flag map.
 */
function registerBootDependencies(dependencies = {}) {
    if (Object.prototype.hasOwnProperty.call(dependencies, 'bootOverlay')) {
        bootState.bootOverlay = dependencies.bootOverlay;
    }
    if (Object.prototype.hasOwnProperty.call(dependencies, 'introOverlay')) {
        bootState.introOverlay = dependencies.introOverlay;
    }
    if (Object.prototype.hasOwnProperty.call(dependencies, 'audioManager')) {
        bootState.audioManager = dependencies.audioManager;
    }
    if (Object.prototype.hasOwnProperty.call(dependencies, 'debugEl')) {
        bootState.debugEl = dependencies.debugEl;
    }
    if (Object.prototype.hasOwnProperty.call(dependencies, 'debugToggles')) {
        bootState.debugToggles = dependencies.debugToggles;
    }

    const bootOverlay = resolveBootOverlay();
    if (bootOverlay?.setOnAcknowledged) {
        bootOverlay.setOnAcknowledged(() => {
            bootState.awaitingAcknowledgement = false;
            const introOverlay = resolveIntroOverlay();
            if (introOverlay?.active) {
                setBootPhase(BOOT_PHASES.INTRO);
                return;
            }
            setBootPhase(BOOT_PHASES.READY);
        });
    }
}

function resolveBootOverlay() {
    return bootState.bootOverlay || (typeof globalThis !== 'undefined' ? globalThis.BootOverlay : null);
}

function resolveIntroOverlay() {
    return bootState.introOverlay || (typeof globalThis !== 'undefined' ? globalThis.IntroOverlay : null);
}

function resolveAudioManager() {
    return bootState.audioManager || (typeof globalThis !== 'undefined' ? globalThis.GameAudio : null);
}

function resolveDebugEl() {
    if (bootState.debugEl) return bootState.debugEl;
    if (typeof document === 'undefined') return null;
    return document.getElementById('debug-log');
}

function resolveDebugToggles() {
    if (bootState.debugToggles) return bootState.debugToggles;
    if (typeof globalThis === 'undefined') return null;
    return globalThis.DebugToggles || null;
}

/**
 * Determine whether debug log content should be visible for the current phase.
 * @param {string} phase target boot phase.
 * @returns {boolean} true when debug log output can be shown.
 */
function shouldShowDebugLog(phase = bootState.phase) {
    const debugToggles = resolveDebugToggles();
    return phase === BOOT_PHASES.READY || debugToggles?.showDebugLog === true;
}

function applyDebugVisibility(phase) {
    const debugEl = resolveDebugEl();
    if (!debugEl) return;
    if (!shouldShowDebugLog(phase)) {
        if (debugEl.classList?.remove) {
            debugEl.classList.remove('visible');
        }
        return;
    }
    if (debugEl.textContent && debugEl.classList?.add) {
        debugEl.classList.add('visible');
    }
}

/**
 * Publish a boot-time error message to the overlay UI so players can see
 * blockers without exposing the debug log.
 * @param {string} message error summary to display.
 * @returns {boolean} true when the overlay accepted the error.
 */
function reportBootIssue(message) {
    const bootOverlay = resolveBootOverlay();
    if (!bootOverlay?.setError) return false;
    bootOverlay.setError(message);
    return true;
}

/**
 * Retrieve the current boot phase for dependent UI guards.
 * @returns {string} active boot phase.
 */
function getBootPhase() {
    return bootState.phase;
}

/**
 * Subscribe to boot phase transitions so UI guards can update when the boot
 * lifecycle changes.
 * @param {Function} handler callback invoked with the new boot phase.
 * @returns {Function} unsubscribe callback to remove the listener.
 */
function onBootPhaseChange(handler) {
    if (typeof handler !== 'function') return () => {};
    bootState.listeners.add(handler);
    return () => bootState.listeners.delete(handler);
}

/**
 * Update the boot phase and synchronize overlay visibility, audio guards, and
 * notification blockers in one call.
 * @param {string} phase target boot phase (LOADING|INTRO|READY).
 * @returns {string} normalized boot phase after the update.
 */
function setBootPhase(phase) {
    const validPhases = Object.values(BOOT_PHASES);
    const nextPhase = validPhases.includes(phase) ? phase : bootState.phase;
    bootState.phase = nextPhase;

    const bootOverlay = resolveBootOverlay();
    if (bootOverlay?.show && bootOverlay?.hide) {
        if (nextPhase === BOOT_PHASES.LOADING) {
            bootOverlay.show();
        } else {
            bootOverlay.hide();
        }
    }
    if (nextPhase === BOOT_PHASES.READY) {
        bootOverlay?.setError?.('');
    }

    const introOverlay = resolveIntroOverlay();
    if (nextPhase === BOOT_PHASES.INTRO) {
        introOverlay?.notifyUIReady?.();
    }

    applyDebugVisibility(nextPhase);

    const audioManager = resolveAudioManager();
    if (audioManager?.setUiOverlayGuard) {
        audioManager.setUiOverlayGuard(nextPhase !== BOOT_PHASES.READY);
    }

    bootState.listeners.forEach((listener) => listener(nextPhase));
    return nextPhase;
}

/**
 * Mark the boot sequence as ready for player acknowledgement. This reveals the
 * ready prompt on the boot overlay and defers intro/ready transitions until
 * the player clicks the ready button.
 */
function markBootReady() {
    const bootOverlay = resolveBootOverlay();
    bootState.awaitingAcknowledgement = Boolean(bootOverlay?.markReady);
    bootOverlay?.markReady?.();

    if (!bootState.awaitingAcknowledgement) {
        const introOverlay = resolveIntroOverlay();
        if (introOverlay?.active) {
            setBootPhase(BOOT_PHASES.INTRO);
        } else {
            setBootPhase(BOOT_PHASES.READY);
        }
    }
}

export {
    BOOT_PHASES,
    getBootPhase,
    markBootReady,
    onBootPhaseChange,
    registerBootDependencies,
    reportBootIssue,
    setBootPhase,
    shouldShowDebugLog
};

export default {
    BOOT_PHASES,
    getBootPhase,
    markBootReady,
    onBootPhaseChange,
    registerBootDependencies,
    reportBootIssue,
    shouldShowDebugLog,
    setBootPhase
};
