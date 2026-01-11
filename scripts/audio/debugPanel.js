const debugState = {
    el: null,
    timer: 0,
    snowSectionId: 'snow-debug-section',
    resolveSnowSnapshot: () => ({
        snowEnabled: true,
        snowfallEnabled: true
    }),
    setSnowToggle: () => {}
};

function renderToggleRow(id, label, checked = false) {
    const checkedAttr = checked ? 'checked' : '';
    return `<label class="debug-toggle-row"><input type="checkbox" id="${id}" ${checkedAttr}>${label}</label>`;
}

function resolveSnowSnapshot() {
    const snapshot = debugState.resolveSnowSnapshot?.() || {};
    return {
        snowEnabled: snapshot.snowEnabled !== false,
        snowfallEnabled: snapshot.snowfallEnabled !== false
    };
}

/**
 * Locate the debug panel element and capture callbacks used for snapshotting
 * and toggling snow controls. Supports legacy and current IDs so we do not
 * crash when the markup lags behind script changes.
 * @param {Object} [options] optional resolver/toggle hooks from the Game runtime.
 * @param {Function} [options.resolveSnowSnapshot] returns the current snow toggle state.
 * @param {Function} [options.setSnowToggle] writes a snow toggle value (key, enabled).
 */
export function init(options = {}) {
    debugState.el = document.getElementById('audio-debug') || document.getElementById('audio-debug-panel');
    debugState.timer = 0;
    debugState.resolveSnowSnapshot = typeof options.resolveSnowSnapshot === 'function'
        ? options.resolveSnowSnapshot
        : debugState.resolveSnowSnapshot;
    debugState.setSnowToggle = typeof options.setSnowToggle === 'function'
        ? options.setSnowToggle
        : () => {};
}

/**
 * Wire checkbox change handlers to the injected Game snow toggle adapter so
 * developers can flip overlays without touching globals.
 */
export function bindSnowControls() {
    if (!debugState.el) return;

    const setToggle = (selector, key) => {
        const input = debugState.el.querySelector(selector);
        if (!input) return;
        input.addEventListener('change', () => {
            debugState.setSnowToggle(key, input.checked);
            debugState.timer = 0; // force next update to render the new state quickly
        });
    };

    setToggle('#debug-snow-enabled', 'snowEnabled');
    setToggle('#debug-snowfall-enabled', 'snowfallEnabled');
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

    const busActive = Boolean(window.AudioDebugBus && window.AudioDebugBus.enabled);
    const snapshot = (window.AudioDebugBus && window.AudioDebugBus.snapshot)
        ? window.AudioDebugBus.snapshot()
        : { intendedTrack: 'None', masterVolume: 1, activeSources: [], groupedClusters: [] };

    const snowSnapshot = resolveSnowSnapshot();

    const activeSources = snapshot.activeSources || [];
    const blockedPlays = snapshot.blockedPlays || [];
    const groupedClusters = snapshot.groupedClusters || [];
    const friendlyState = gameState === 'COMBAT' ? 'War Mode' : 'Territory Mode';
    const playingList = activeSources.length
        ? `<ul>${activeSources.map(src => `<li>${src.label || src.src || src.key || 'unknown'}</li>`).join('')}</ul>`
        : '<div>None</div>';
    const blockedList = blockedPlays.length
        ? `<ul>${blockedPlays.map(entry => {
            const label = entry.key || entry.src || entry.variantKey || 'unknown';
            const reason = entry.message || entry.reason;
            return `<li>${label}${reason ? ` — ${reason}` : ''}</li>`;
        }).join('')}</ul>`
        : '<div>None</div>';
    const clusterList = groupedClusters.length
        ? `<ul>${groupedClusters.map((cluster) => {
            const groupLabel = cluster.groupKey || 'unknown';
            const windowLabel = cluster.windowMs ? ` / ${cluster.windowMs}ms` : '';
            const maxLabel = cluster.maxPlays ? ` (max ${cluster.maxPlays})` : '';
            return `<li>${groupLabel} — blocked ${cluster.blockedCount || 0}${windowLabel}${maxLabel}</li>`;
        }).join('')}</ul>`
        : '<div>None</div>';
    const clusterSection = gameState === 'COMBAT'
        ? `
            <div class="section">
                <div class="label">Combat Audio Clusters (${groupedClusters.length})</div>
                ${clusterList}
            </div>
        `
        : '';

    debugState.el.innerHTML = `
            <div class="section">
                <div class="label">Audio debug bus</div>
                <div>${busActive ? 'ON' : 'OFF'}</div>
            </div>
            <div class="section">
                <div class="label">Current Music Track</div>
                <div>${snapshot.intendedTrack || 'None'}</div>
            </div>
            <div class="section">
                <div class="label">Active Audio Elements (${activeSources.length})</div>
                ${playingList}
            </div>
            <div class="section">
                <div class="label">Blocked Audio Plays (${blockedPlays.length})</div>
                ${blockedList}
            </div>
            ${clusterSection}
            <div class="section">
                <div class="label">Master Volume</div>
                <div>${Number(snapshot.masterVolume ?? 1).toFixed(2)}</div>
            </div>
            <div class="section">
                <div class="label">Game State</div>
                <div>${friendlyState}</div>
            </div>
            <div class="section" id="${debugState.snowSectionId}">
                <div class="label">Snow + Effects</div>
                ${renderToggleRow('debug-snow-enabled', 'Snow overlay enabled', snowSnapshot.snowEnabled)}
                ${renderToggleRow('debug-snowfall-enabled', 'Seasonal snowfall', snowSnapshot.snowfallEnabled)}
            </div>
        `;

    bindSnowControls();
}

export default { init, update, bindSnowControls };
