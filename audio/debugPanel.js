const debugState = {
    el: null,
    timer: 0,
    fogSectionId: 'fog-debug-section',
    resolveFogSnapshot: () => ({
        enabled: true,
        tileFogEnabled: false,
        ambienceLayersEnabled: false,
        ambienceEnabled: true
    }),
    setFogToggle: () => {}
};

function renderToggleRow(id, label, checked = false) {
    const checkedAttr = checked ? 'checked' : '';
    return `<label class="debug-toggle-row"><input type="checkbox" id="${id}" ${checkedAttr}>${label}</label>`;
}

function resolveFogSnapshot() {
    const snapshot = debugState.resolveFogSnapshot?.() || {};
    return {
        enabled: snapshot.enabled !== false,
        tileFogEnabled: snapshot.tileFogEnabled === true,
        ambienceLayersEnabled: snapshot.ambienceLayersEnabled === true,
        ambienceEnabled: snapshot.ambienceEnabled !== false
    };
}

/**
 * Locate the debug panel element and capture callbacks used for snapshotting
 * and toggling fog controls. Supports legacy and current IDs so we do not
 * crash when the markup lags behind script changes.
 * @param {Object} [options] optional resolver/toggle hooks from the Game runtime.
 * @param {Function} [options.resolveFogSnapshot] returns the current fog toggle state.
 * @param {Function} [options.setFogToggle] writes a fog toggle value (key, enabled).
 */
export function init(options = {}) {
    debugState.el = document.getElementById('audio-debug') || document.getElementById('audio-debug-panel');
    debugState.timer = 0;
    debugState.resolveFogSnapshot = typeof options.resolveFogSnapshot === 'function'
        ? options.resolveFogSnapshot
        : debugState.resolveFogSnapshot;
    debugState.setFogToggle = typeof options.setFogToggle === 'function'
        ? options.setFogToggle
        : () => {};
}

/**
 * Wire checkbox change handlers to the injected Game fog toggle adapter so
 * developers can flip fog/backdrop options without touching globals.
 */
export function bindFogControls() {
    if (!debugState.el) return;

    const setToggle = (selector, key) => {
        const input = debugState.el.querySelector(selector);
        if (!input) return;
        input.addEventListener('change', () => {
            debugState.setFogToggle(key, input.checked);
            debugState.timer = 0; // force next update to render the new state quickly
        });
    };

    setToggle('#debug-fog-enabled', 'enabled');
    setToggle('#debug-fog-tile', 'tileFogEnabled');
    setToggle('#debug-fog-ambience', 'ambienceLayersEnabled');
    setToggle('#debug-fog-flourishes', 'ambienceEnabled');
}

/**
 * Refresh the audio diagnostics overlay at a throttled cadence so the UI
 * stays in sync with active playback without wasting cycles.
 * @param {number} dt delta time since last frame in seconds
 * @param {string} gameState current game state code (OVERWORLD|COMBAT)
 */
export function update(dt = 0, gameState = 'OVERWORLD') {
    if (!debugState.el) return;
    debugState.timer += dt;
    if (debugState.timer < 0.5) return;
    debugState.timer = 0;

    const snapshot = (window.AudioDebugBus && window.AudioDebugBus.snapshot)
        ? window.AudioDebugBus.snapshot()
        : { intendedTrack: 'None', masterVolume: 1, activeSources: [] };

    const fogSnapshot = resolveFogSnapshot();

    const activeSources = snapshot.activeSources || [];
    const friendlyState = gameState === 'COMBAT' ? 'War Mode' : 'Territory Mode';
    const playingList = activeSources.length
        ? `<ul>${activeSources.map(src => `<li>${src.label || src.src || src.key || 'unknown'}</li>`).join('')}</ul>`
        : '<div>None</div>';

    debugState.el.innerHTML = `
            <div class="section">
                <div class="label">Current Music Track</div>
                <div>${snapshot.intendedTrack || 'None'}</div>
            </div>
            <div class="section">
                <div class="label">Active Audio Elements (${activeSources.length})</div>
                ${playingList}
            </div>
            <div class="section">
                <div class="label">Master Volume</div>
                <div>${Number(snapshot.masterVolume ?? 1).toFixed(2)}</div>
            </div>
            <div class="section">
                <div class="label">Game State</div>
                <div>${friendlyState}</div>
            </div>
            <div class="section" id="${debugState.fogSectionId}">
                <div class="label">Fog + Effects</div>
                ${renderToggleRow('debug-fog-enabled', 'Backdrop fog enabled', fogSnapshot.enabled)}
                ${renderToggleRow('debug-fog-tile', 'Tile fog overlays', fogSnapshot.tileFogEnabled)}
                ${renderToggleRow('debug-fog-ambience', 'Ambience clouds', fogSnapshot.ambienceLayersEnabled)}
                ${renderToggleRow('debug-fog-flourishes', 'Fog flourishes', fogSnapshot.ambienceEnabled)}
            </div>
        `;

    bindFogControls();
}

export default { init, update, bindFogControls };
