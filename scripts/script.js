import {
    COMBAT_BUILDINGS,
    UNITS,
    addBuilding,
    buyBuilding,
    checkConnection,
    damageBuilding,
    damageUnit,
    endWar,
    getBuildingStats,
    getSpawnRate,
    getUnitStats,
    isFrontier,
    loseOverworldHexes,
    recordWarEnd,
    registerKill,
    runAI,
    scorchEarth,
    spawnUnit,
    startWar,
    updateCombat
} from './combatEngine.js';
import {
    armAmbientLoop as armAmbientLoopHelper,
    haltAmbientLoop as haltAmbientLoopHelper,
    syncAmbientForState as syncAmbientForStateHelper
} from './gameAudioHooks.js';
import { applyUIBindings, setupUIBindings } from './uiBindings.js';
import { START_TICK, Timekeeper } from './timekeeper.js';
import { OVERWORLD_TILES } from './overworldConfig.js';
import { drawOverworldTiles } from './overworldRenderer.js';
import { advanceOverworldTimer } from './overworldTicks.js';
import { buildClusterBonusMap, DEFAULT_CLUSTER_RATE } from './overworldAdjacency.js';
import { buildTileVisibilityMap, resolveFogTileMask, TILE_VISIBILITY } from './fogMask.js';
import { buildResearchStateSafe } from './researchStateBuilder.mjs';
import { FOG_VISUAL_CONFIG, FOG_VISUAL_MODES, resolveFogInnerOpacity, resolveFogParallax, resolveFogVisualConfig } from './fogVisualConfig.mjs';
import AmbienceRenderer from './ambienceRenderer.js';
import './researchSystem.js';
import { validateBootstrapDependencies } from './bootstrapValidator.mjs';
const RebelSystem = (typeof window !== 'undefined' && window.RebelSystem) ? window.RebelSystem : null;
const ImperialMandates = (typeof window !== 'undefined' && window.ImperialMandates) ? window.ImperialMandates : null;
const ImperialMandateManager = (typeof window !== 'undefined' && window.ImperialMandateManager)
    ? window.ImperialMandateManager
    : (typeof require === 'function' ? require('./imperialMandateManager.js') : null);
// Cache the research system once so the Game bootstrap never throws on missing globals.
const ResearchSystem = (typeof window !== 'undefined' && window.ResearchSystem)
    ? window.ResearchSystem
    : (typeof require === 'function' ? require('./researchSystem.js') : null);
// Persistence is optional in headless test environments; load defensively so init can proceed without saves.
const Persistence = (typeof window !== 'undefined' && window.Persistence)
    ? window.Persistence
    : (typeof require === 'function' ? require('./persistence.js') : null);
const AmbienceRendererClass = (typeof AmbienceRenderer !== 'undefined')
    ? AmbienceRenderer
    : (typeof window !== 'undefined' ? window.AmbienceRenderer : null);
const FALLBACK_STATS = Persistence?.DEFAULT_STATS || {
    bestLevel: 0,
    bestKills: 0,
    totalKills: 0,
    warsFought: 0,
    lastOutcome: 'N/A',
    lastSaveISO: null
};

/** Clamp normalized slider values (0–1) while tolerating NaN input. */
function clamp01(value, fallback = 1) {
    const numeric = Number.isFinite(value) ? value : fallback;
    return Math.max(0, Math.min(1, numeric));
}

document.addEventListener('DOMContentLoaded', () => {
/** ENGINE */
const SQRT3 = (window.InputHelpers && window.InputHelpers.SQRT3) || Math.sqrt(3);

class Hex {
    constructor(q, r, s = -q - r) { this.q = q; this.r = r; this.s = s; }
    add(b) { return new Hex(this.q + b.q, this.r + b.r, this.s + b.s); }
    toPixel(layout) {
        const x = (layout.f0 * this.q + layout.f1 * this.r) * layout.size;
        const y = (layout.f2 * this.q + layout.f3 * this.r) * layout.size;
        return { x: x + layout.origin.x, y: y + layout.origin.y };
    }
    static fromPixel(layout, p) {
        const pt = { x: (p.x - layout.origin.x) / layout.size, y: (p.y - layout.origin.y) / layout.size };
        const q = layout.b0 * pt.x + layout.b1 * pt.y;
        const r = layout.b2 * pt.x + layout.b3 * pt.y;
        return Hex.round({ q, r, s: -q - r });
    }
    static round(h) {
        let qi = Math.round(h.q), ri = Math.round(h.r), si = Math.round(h.s);
        const q_diff = Math.abs(qi - h.q), r_diff = Math.abs(ri - h.r), s_diff = Math.abs(si - h.s);
        if (q_diff > r_diff && q_diff > s_diff) qi = -ri - si;
        else if (r_diff > s_diff) ri = -qi - si;
        else si = -qi - ri;
        return new Hex(qi, ri, si);
    }
    static distance(a, b) { return (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.s - b.s)) / 2; }
    static neighbor(hex, dir) {
        const dirs = [new Hex(1,0,-1), new Hex(1,-1,0), new Hex(0,-1,1), new Hex(-1,0,1), new Hex(-1,1,0), new Hex(0,1,-1)];
        return hex.add(dirs[dir]);
    }
    equals(b) { return this.q === b.q && this.r === b.r; }
    toString() { return `${this.q},${this.r}`; }
}

const Layout = (window.InputHelpers && window.InputHelpers.Layout) || {
    f0: SQRT3, f1: SQRT3 / 2.0, f2: 0.0, f3: 3.0 / 2.0,
    b0: SQRT3 / 3.0, b1: -1.0 / 3.0, b2: 0.0, b3: 2.0 / 3.0
};

    const DEFAULT_IMPERIAL_FAVOR = 5;

const CAMERA_MOTION_CONFIG = {
    enabled: true,
    amplitude: 9,
    parallax: 0.65,
    speed: 0.18
};

const AMBIENCE_CONFIG = {
    enabled: false,
    fadeRadiusFactor: 0.55,
    fadeFeather: 0.35,
    layers: [
        { opacity: 0.05, drift: { x: 8, y: -3 }, scale: 520, density: 0.18 },
        { opacity: 0.035, drift: { x: -5, y: 6 }, scale: 640, density: 0.22 },
        { opacity: 0.028, drift: { x: 14, y: 9 }, scale: 780, density: 0.14 }
    ]
};

/**
 * Keep imperial favor bounded to the 1–10 HUD scale so saves and UI stay consistent.
 * @param {number} value arbitrary favor value from gameplay systems or persistence.
 * @returns {number} sanitized favor value within 1–10 (defaults to midpoint when invalid).
 */
function clampImperialFavor(value) {
    const numeric = Number.isFinite(value) ? Math.round(value) : DEFAULT_IMPERIAL_FAVOR;
    return Math.min(10, Math.max(1, numeric));
}

const Platform = (window.PlatformAdapter && window.PlatformAdapter.detectPlatformProfile)
    ? window.PlatformAdapter
    : {
        detectPlatformProfile: () => ({
            isMobile: false,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            deviceScale: window.devicePixelRatio || 1,
            baseZoom: 1
        }),
        sizeCanvasForDisplay: (canvas, ctx, profile) => {
            if (!canvas || !ctx || !profile) return;
            canvas.width = profile.viewportWidth;
            canvas.height = profile.viewportHeight;
        }
    };

const TIPS = [
    "SIEGE RULE: Build near Enemy structures (3-tile range) to attack.",
    "WAR ECONOMY: Killing units gives gold. Use war to fund war!",
    "SCORCHED EARTH: Cut off enclaves become permanently useless ash.",
    "ECONOMY: Invest in Mine Upgrades to fund late-game wars.",
    "DEFENSE: Upgrading Defense buffs both Towers AND your Castle.",
    "LEGENDARY: The Dragon is rare, but turns the tide instantly.",
    "RISK: Mystery Hexes are 90% Rocks, 10% Jackpot."
];


/**
 * Thin facade over the global GameAudio so gameplay code can request
 * manifest keys without worrying about availability in tests/browsers.
 */
const AudioBridge = {
    /** Request playback for a manifest entry (sfx or music). */
    play(key, options = {}) {
        if (typeof window === 'undefined') return false;
        const audio = window.GameAudio;
        if (audio && typeof audio.play === 'function') {
            return audio.play(key, options);
        }
        return false;
    },

    /** Convenience helper for looping tracks (ambience/music). */
    playLoop(key, options = {}) {
        return this.play(key, { ...options, loop: options.loop !== false, reset: options.reset !== false });
    },

    /** Begin the shared ambient loop defined by the audio manifest. */
    startAmbient() {
        window.GameAudio?.startAmbientLoop?.();
    },

    /** Stop the current ambient loop (no-op if unavailable). */
    stopAmbient() {
        window.GameAudio?.stop?.();
    },

    /** Halt all cached audio nodes (useful during state transitions). */
    stopAll() {
        window.GameAudio?.stopAll?.();
    }
};
if (typeof window !== 'undefined') window.AudioBridge = AudioBridge;

// === AUDIO DEBUG CONSOLE (diagnostic-only; remove after triage) ===
const AudioDebugConsole = {
    el: null,
    timer: 0,
    fogSectionId: 'fog-debug-section',
    /**
     * Compose a labeled checkbox row for debug toggles to keep the markup simple.
     * @param {string} id unique input ID for the checkbox
     * @param {string} label human-readable label for the toggle
     * @param {boolean} checked whether the checkbox should start checked
     * @returns {string} HTML string for the toggle row
     */
    renderToggleRow(id, label, checked = false) {
        const checkedAttr = checked ? 'checked' : '';
        return `<label class="debug-toggle-row"><input type="checkbox" id="${id}" ${checkedAttr}>${label}</label>`;
    },
    /**
     * Locate the debug panel element. Supports legacy and current IDs so we do not
     * crash when the markup lags behind script changes.
     */
    init() {
        this.el = document.getElementById('audio-debug') || document.getElementById('audio-debug-panel');
        this.timer = 0;
    },
    /**
     * Refresh the audio diagnostics overlay at a throttled cadence so the UI
     * stays in sync with active playback without wasting cycles.
     * @param {number} dt delta time since last frame in seconds
     * @param {string} gameState current game state code (OVERWORLD|COMBAT)
     */
    update(dt = 0, gameState = 'OVERWORLD') {
        if (!this.el) return;
        this.timer += dt;
        if (this.timer < 0.5) return;
        this.timer = 0;

        const snapshot = (window.AudioDebugBus && window.AudioDebugBus.snapshot)
            ? window.AudioDebugBus.snapshot()
            : { intendedTrack: 'None', masterVolume: 1, ambientState: 'IDLE', activeSources: [] };

        const fogSnapshot = this.resolveFogSnapshot();

        const activeSources = snapshot.activeSources || [];
        const friendlyState = gameState === 'COMBAT' ? 'War Mode' : 'Territory Mode';
        const ambientState = snapshot.ambientState || 'IDLE';
        const loopArmed = window.Game?.ambientLoopStarted ? 'yes' : 'no';
        const playingList = activeSources.length
            ? `<ul>${activeSources.map(src => `<li>${src.label || src.src || src.key || 'unknown'}</li>`).join('')}</ul>`
            : '<div>None</div>';

        this.el.innerHTML = `
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
            <div class="section">
                <div class="label">Ambient Sync</div>
                <div>${ambientState} (loop armed: ${loopArmed})</div>
            </div>
            <div class="section" id="${this.fogSectionId}">
                <div class="label">Fog + Effects</div>
                ${this.renderToggleRow('debug-fog-enabled', 'Backdrop fog enabled', fogSnapshot.enabled)}
                ${this.renderToggleRow('debug-fog-tile', 'Tile fog overlays', fogSnapshot.tileFogEnabled)}
                ${this.renderToggleRow('debug-fog-ambience', 'Ambience clouds', fogSnapshot.ambienceLayersEnabled)}
                ${this.renderToggleRow('debug-fog-flourishes', 'Fog flourishes', fogSnapshot.ambienceEnabled)}
            </div>
        `;

        this.bindFogControls();
    },

    /**
     * Gather the live fog toggle values from the Game singleton so the debug
     * UI mirrors the current runtime configuration.
     * @returns {Object} snapshot of boolean fog toggles
     */
    resolveFogSnapshot() {
        const fogToggles = window.Game?.featureToggles?.fog || {};
        return {
            enabled: fogToggles.enabled !== false,
            tileFogEnabled: fogToggles.tileFogEnabled === true,
            ambienceLayersEnabled: fogToggles.ambienceLayersEnabled === true,
            ambienceEnabled: fogToggles.ambienceEnabled !== false
        };
    },

    /**
     * Wire checkbox change handlers to the shared Game feature toggles so
     * developers can flip fog/backdrop options without touching globals.
     */
    bindFogControls() {
        const game = window.Game;
        if (!game || typeof game.setFogToggle !== 'function') return;
        if (!this.el) return;

        const setToggle = (selector, key) => {
            const input = this.el.querySelector(selector);
            if (!input) return;
            input.addEventListener('change', () => {
                game.setFogToggle(key, input.checked);
                this.timer = 0; // force next update to render the new state quickly
            });
        };

        setToggle('#debug-fog-enabled', 'enabled');
        setToggle('#debug-fog-tile', 'tileFogEnabled');
        setToggle('#debug-fog-ambience', 'ambienceLayersEnabled');
        setToggle('#debug-fog-flourishes', 'ambienceEnabled');
    }
};

/**
 * Refresh the floating audio debug overlay with the latest playback info.
 * @param {number} dt delta time since last frame in seconds
 * @param {string} gameState current game state code (OVERWORLD|COMBAT)
 */
function updateAudioDebug(dt, gameState) {
    AudioDebugConsole.update(dt, gameState);
}

/** ENGINE */
const Game = {
    canvas: document.getElementById('canvas'),
    ctx: document.getElementById('canvas').getContext('2d'),
    fxLayer: document.getElementById('fx-layer'),

    state: 'OVERWORLD',
    paused: false,
    gold: 300, wood: 40,
    imperialFavor: DEFAULT_IMPERIAL_FAVOR,
    difficulty: 0,
    upgrades: { soldier: 1, archer: 1, production: 1, mines: 1, defense: 1 },
    research: { technologies: [], bonuses: { townGoldBonus: 0, forestWoodBonus: 0, clusterBaseRate: DEFAULT_CLUSTER_RATE, landReclamationClusterBonus: 0 }, lives: 0 },
    stats: { ...FALLBACK_STATS },
    session: { warKills: 0 },
    activeSaveSlot: '1',
    voidClicks: 0,
    cam: { x: 0, y: 0, zoom: 1 },
    Hex,
    deviceProfile: Platform.detectPlatformProfile(),
    viewport: { width: window.innerWidth, height: window.innerHeight },
    shakeTimer: null,
    ambientLoopStarted: false,
    ambientState: 'OVERWORLD',
    pendingClearTile: null,
    hoveredClaimableKey: null,
    selectedOverworldTile: null,
    pendingReclamations: [],
    awaitingReclamationTarget: false,
    shouldRunImperialIntro: false, // Flagged when a fresh campaign needs to play the decree after BEGIN

    imperialMandates: ImperialMandates,
    timekeeper: new Timekeeper({ startTick: START_TICK }),

    overworld: { hexes: new Map(), claimable: new Map(), timer: 0, tickRate: 3.5, clusterBonuses: new Map() },
    fog: { time: 0 },
    featureToggles: {
        fog: { ...FOG_VISUAL_CONFIG },
        camera: { ...CAMERA_MOTION_CONFIG },
        ambience: { ...AMBIENCE_CONFIG },
        overworld: { showClaimCosts: false }
    },
    settingsStorageKey: 'wargame:player-settings',
    playerSettings: null,
    ambienceRenderer: null,
    camBase: { x: 0, y: 0 },
    camDrift: { time: 0 },
    persistenceAvailable: true,
    combat: {
        territory: new Map(), slots: new Map(), buildings: new Map(), units: [], particles: [], fx: [],
        ai: { timer: 0, nextMove: 3.0, gold: 300 },
        castles: { player: null, enemy: null }
    },

    init() {
        try {
            if (typeof window !== 'undefined' && window.IntroOverlay) {
                window.IntroOverlay.init(document);
            }
            this.dependencyHealth = validateBootstrapDependencies({
                researchSystem: ResearchSystem,
                persistence: Persistence,
                inputHelpers: typeof window !== 'undefined' ? window.InputHelpers : null,
                canvas: this.canvas,
                ctx: this.ctx,
                debugEl: typeof document !== 'undefined' ? document.getElementById('debug-log') : null
            });
            this.persistenceAvailable = this.dependencyHealth.persistenceAvailable;
            this.applyFeatureOverrides();
            this.applyPlayerSettings(this.loadPlayerSettings());
            this.timekeeper.onChange(() => this.updateHUD());
            this.resize();
            this.ensureAmbienceRendererReady();
            AudioDebugConsole.init();
            this.bindVoidClickEasterEgg();
            window.addEventListener('resize', () => this.resize());
            this.setupInput();
            this.resetSession();

            window.addEventListener('intro:begin', () => {
                if (!this.shouldRunImperialIntro) return;
                this.issueImperialIntroMandate();
                this.shouldRunImperialIntro = false;
            });

            if (!this.dependencyHealth.persistenceAvailable) {
                this.logBootstrapWarning('Persistence unavailable; skipping save hydration and disabling save slots.');
            }

            const loaded = this.dependencyHealth.persistenceAvailable
                ? Persistence.loadSnapshot(this.activeSaveSlot, { hexFactory: (q, r, s) => new Hex(q, r, s) })
                : { state: null, stats: { ...this.stats }, slot: this.activeSaveSlot };
            if (loaded.state) {
                try {
                    this.applySnapshot(loaded.state);
                    this.stats = loaded.stats;
                    this.activeSaveSlot = loaded.slot || '1';
                } catch (error) {
                    this.logBootstrapWarning('Snapshot bootstrap failed; starting fresh campaign.', error);
                    this.bootstrapNewWorld();
                }
            } else {
                this.bootstrapNewWorld();
            }

            this.updateHUD();
            this.updateUpgradeMenu();
            this.updateResearchUI();
            this.updateLeaderboardUI();
            if (this.dependencyHealth.persistenceAvailable) {
                this.updateSaveSlotsUI();
            }
            if (this.updateTileInspector) this.updateTileInspector(null);

            setupUIBindings(this);

            this.flushPendingNotifications();

            this.armAmbientLoop();
        } catch (error) {
            this.reportRecoverableError('game bootstrap', error);
            this.logBootstrapWarning('Bootstrap encountered recoverable issues; continuing render loop.');
        } finally {
            this.armRenderLoop();
        }
    },

    /** Issue the opening imperial mandate sequence if the manager is available. */
    issueImperialIntroMandate() {
        if (ImperialMandates?.issuePendingMandates) {
            ImperialMandates.issuePendingMandates(this, {
                showTileCallout: this.showTileCallout,
                hideTileCallout: this.hideTileCallout
            });
        }
    },

    /**
     * Kick off the animation frame loop so rendering and fog layers stay alive
     * even if initialization encounters recoverable errors.
     */
    armRenderLoop() {
        this.lastTime = performance.now();
        requestAnimationFrame(t => this.loop(t));
    },

    /**
     * Toggle or force the paused state so overworld ticks can be frozen without blocking UI.
     * @param {boolean} [forceState] optional desired pause value; defaults to inverse of current state.
     * @returns {boolean} resulting paused value.
     */
    setPaused(forceState) {
        const next = typeof forceState === 'boolean' ? forceState : !this.paused;
        if (next === this.paused) return this.paused;
        this.paused = next;
        this.updateHUD();
        return this.paused;
    },

    /** Toggle pause/play without needing an explicit state. */
    togglePause() { return this.setPaused(!this.paused); },

    /**
     * Build the default player-facing settings bundle for audio and visuals.
     * Defaults mirror the fog/audio baselines so sliders start aligned with
     * the current build's expected presentation.
     * @returns {Object} default settings snapshot
     */
    defaultPlayerSettings() {
        return {
            audio: { master: 1, music: 1, sfx: 1 },
            visuals: {
                enabled: true,
                tileFogEnabled: FOG_VISUAL_CONFIG.tileFogEnabled === true,
                ambienceLayersEnabled: FOG_VISUAL_CONFIG.ambienceLayersEnabled === true,
                ambienceEnabled: FOG_VISUAL_CONFIG.ambienceEnabled !== false
            }
        };
    },

    /**
     * Load persisted slider/toggle preferences from localStorage while
     * tolerating environments without storage (tests/headless sessions).
     * @returns {Object} merged player settings
     */
    loadPlayerSettings() {
        const defaults = this.defaultPlayerSettings();
        if (typeof window === 'undefined' || !window.localStorage) return defaults;
        const raw = window.localStorage.getItem(this.settingsStorageKey);
        if (!raw) return defaults;
        try {
            const parsed = JSON.parse(raw);
            return {
                audio: { ...defaults.audio, ...(parsed.audio || {}) },
                visuals: { ...defaults.visuals, ...(parsed.visuals || {}) }
            };
        } catch (error) {
            this.reportRecoverableError?.('player settings parse', error);
            return defaults;
        }
    },

    /** Persist the current settings bundle to localStorage when available. */
    persistPlayerSettings(settings = this.playerSettings) {
        if (typeof window === 'undefined' || !window.localStorage || !settings) return;
        try {
            window.localStorage.setItem(this.settingsStorageKey, JSON.stringify(settings));
        } catch (error) {
            this.reportRecoverableError?.('player settings persist', error);
        }
    },

    /**
     * Apply player-facing audio + visual settings, propagate them to the
     * runtime systems, and refresh the sidebar UI for the new values.
     * @param {Object} settings partial settings payload
     * @returns {Object} normalized settings that were applied
     */
    applyPlayerSettings(settings = {}) {
        const defaults = this.defaultPlayerSettings();
        const merged = {
            audio: { ...defaults.audio, ...(settings.audio || {}) },
            visuals: { ...defaults.visuals, ...(settings.visuals || {}) }
        };
        this.playerSettings = merged;
        this.applyAudioSettings(merged.audio);
        this.applyVisualSettings(merged.visuals);
        this.persistPlayerSettings(merged);
        this.updateSettingsUI?.();
        return merged;
    },

    /**
     * Push the audio mixer settings into the shared GameAudio manager so
     * sliders immediately affect live music and effects.
     * @param {Object} audioSettings desired audio settings
     * @returns {Object} normalized audio settings
     */
    applyAudioSettings(audioSettings = this.defaultPlayerSettings().audio) {
        const defaults = this.defaultPlayerSettings().audio;
        const safe = { ...defaults, ...(audioSettings || {}) };
        const manager = window.GameAudio;
        manager?.setMasterVolume?.(clamp01(safe.master, defaults.master));
        manager?.setMusicVolume?.(clamp01(safe.music, defaults.music));
        manager?.setSfxVolume?.(clamp01(safe.sfx, defaults.sfx));
        this.playerSettings = { ...this.playerSettings, audio: { ...safe, master: clamp01(safe.master), music: clamp01(safe.music), sfx: clamp01(safe.sfx) } };
        return this.playerSettings.audio;
    },

    /** Return the currently active audio settings (merged with defaults). */
    getAudioSettings() {
        const defaults = this.defaultPlayerSettings().audio;
        return { ...defaults, ...(this.playerSettings?.audio || {}) };
    },

    /** Normalize visual toggle preferences against the live fog feature toggles. */
    getVisualSettings() {
        const fog = this.featureToggles?.fog || {};
        return {
            enabled: fog.enabled !== false,
            tileFogEnabled: fog.tileFogEnabled === true,
            ambienceLayersEnabled: fog.ambienceLayersEnabled === true,
            ambienceEnabled: fog.ambienceEnabled !== false
        };
    },

    /**
     * Push visual toggle preferences into the fog feature toggles and cache
     * them for persistence.
     * @param {Object} visualSettings fog/ambience preferences
     * @returns {Object} resulting fog toggle collection
     */
    applyVisualSettings(visualSettings = this.defaultPlayerSettings().visuals) {
        const defaults = this.defaultPlayerSettings().visuals;
        const safe = { ...defaults, ...(visualSettings || {}) };
        const fogToggles = this.featureToggles?.fog || { ...FOG_VISUAL_CONFIG };
        const nextFog = {
            ...fogToggles,
            enabled: safe.enabled !== false,
            tileFogEnabled: safe.tileFogEnabled === true,
            ambienceLayersEnabled: safe.ambienceLayersEnabled === true,
            ambienceEnabled: safe.ambienceEnabled !== false
        };
        this.featureToggles = { ...this.featureToggles, fog: nextFog };
        this.playerSettings = { ...this.playerSettings, visuals: safe };
        this.updateSettingsUI?.();
        return nextFog;
    },

    /** Update an individual mixer channel from the settings sidebar. */
    setAudioVolume(channel, value) {
        const current = this.getAudioSettings();
        if (!(channel in current)) return current;
        const next = { ...current, [channel]: clamp01(value, current[channel]) };
        this.applyAudioSettings(next);
        this.persistPlayerSettings({ ...this.playerSettings, audio: next, visuals: this.playerSettings?.visuals });
        this.updateSettingsUI?.();
        return next;
    },

    /**
     * Allow tests to override ambient visuals (fog + camera drift) without mutating
     * the core constants. Overrides must be supplied explicitly so runtime defaults
     * stay aligned with the shared configs instead of transient diagnostics.
     */
    applyFeatureOverrides(overrides = {}) {
        const fogOverrides = overrides.fog || {};
        const cameraOverrides = overrides.camera || {};
        const ambienceOverrides = overrides.ambience || {};
        const overworldOverrides = overrides.overworld || {};
        const resolvedFog = resolveFogVisualConfig({ ...FOG_VISUAL_CONFIG, ...fogOverrides });
        const fogDisabled = resolvedFog.enabled === false;
        const ambienceEnabledOverride =
            typeof fogOverrides.ambienceLayersEnabled === 'boolean'
                ? fogOverrides.ambienceLayersEnabled
                : undefined;
        const ambienceConfig = {
            ...AMBIENCE_CONFIG,
            ...ambienceOverrides,
            ...(typeof ambienceEnabledOverride === 'boolean' ? { enabled: ambienceEnabledOverride } : {}),
            ...(fogDisabled || resolvedFog.visualMode === FOG_VISUAL_MODES.VOID ? { enabled: false } : {})
        };
        this.featureToggles = {
            fog: resolvedFog,
            camera: { ...CAMERA_MOTION_CONFIG, ...cameraOverrides },
            ambience: ambienceConfig,
            overworld: { showClaimCosts: false, ...overworldOverrides }
        };
        // Recreate ambience renderer lazily so mode/flag changes cannot resurrect clouds in void-only mode.
        this.ambienceRenderer = null;
    },

    /**
     * Flip debug-only fog feature toggles without exposing globals. Only known
     * boolean toggles are honored so drift parameters remain protected.
     * @param {string} key fog toggle key to update (enabled | tileFogEnabled | ambienceLayersEnabled | ambienceEnabled)
     * @param {boolean} isEnabled desired state for the toggle
     * @returns {Object} resulting fog toggle collection
     */
    setFogToggle(key, isEnabled) {
        const supportedFogToggles = new Set(['enabled', 'tileFogEnabled', 'ambienceLayersEnabled', 'ambienceEnabled']);
        if (!supportedFogToggles.has(key)) return this.featureToggles?.fog || { ...FOG_VISUAL_CONFIG };

        const fogToggles = this.featureToggles?.fog || { ...FOG_VISUAL_CONFIG };
        const nextFog = { ...fogToggles, [key]: Boolean(isEnabled) };
        this.featureToggles = { ...this.featureToggles, fog: nextFog };
        const visuals = { ...this.playerSettings?.visuals, [key]: Boolean(isEnabled) };
        this.playerSettings = { ...this.playerSettings, visuals };
        this.persistPlayerSettings();
        this.updateSettingsUI?.();
        return nextFog;
    },

    /**
     * Determine whether the current fog visuals should remain a pure void clear.
     * The check uses the resolved configuration so transient debug toggles cannot
     * accidentally resurrect ambience layers without opting into a non-default
     * visual mode.
     * @param {Object} [fogConfig] optional pre-resolved fog configuration.
     * @returns {boolean} true when the visuals should remain void-only.
     */
    isVoidVisualMode(fogConfig) {
        const config = fogConfig || this.fog?.visualConfig || resolveFogVisualConfig(this.featureToggles?.fog);
        return (config?.visualMode || FOG_VISUAL_MODES.VOID) === FOG_VISUAL_MODES.VOID;
    },

    /**
     * Decide whether ambience clouds should render this frame based on the visual
     * mode and the combined fog/ambience feature flags.
     * @param {Object} [fogConfig] optional pre-resolved fog configuration.
     * @returns {boolean} true when ambience clouds are allowed to render.
     */
    shouldRenderAmbience(fogConfig) {
        const config = fogConfig || this.fog?.visualConfig || resolveFogVisualConfig(this.featureToggles?.fog);
        if (this.isVoidVisualMode(config)) return false;
        return config.enabled !== false
            && config.ambienceEnabled !== false
            && config.ambienceLayersEnabled === true
            && this.featureToggles?.ambience?.enabled !== false;
    },

    /**
     * Lazily construct (or tear down) the ambience renderer based on the active
     * visual mode and feature flags. The renderer is never instantiated while
     * the void baseline is active, ensuring no ambience bands appear by default.
     * @param {Object} [fogConfig] optional pre-resolved fog configuration.
     */
    ensureAmbienceRendererReady(fogConfig) {
        const config = fogConfig || this.fog?.visualConfig || this.resolveFogConfig();
        if (!this.shouldRenderAmbience(config)) {
            this.ambienceRenderer = null;
            return;
        }

        if (!this.ambienceRenderer && AmbienceRendererClass) {
            this.ambienceRenderer = new AmbienceRendererClass({
                ctx: this.ctx,
                config: this.featureToggles.ambience
            });
        }

        if (this.ambienceRenderer) {
            this.ambienceRenderer.resize(this.viewport);
        }
    },

    resize() {
        const previousProfile = this.deviceProfile;
        this.deviceProfile = Platform.detectPlatformProfile();
        this.viewport = {
            width: this.deviceProfile.viewportWidth,
            height: this.deviceProfile.viewportHeight
        };

        Platform.sizeCanvasForDisplay(this.canvas, this.ctx, this.deviceProfile);

        this.camBase = { x: this.viewport.width / 2, y: this.viewport.height / 2 };
        this.cam.x = this.camBase.x;
        this.cam.y = this.camBase.y;
        this.camDrift.time = 0;

        if (!previousProfile || previousProfile.isMobile !== this.deviceProfile.isMobile) {
            this.cam.zoom = this.deviceProfile.baseZoom;
        } else if (this.deviceProfile.isMobile && this.cam.zoom > this.deviceProfile.baseZoom) {
            this.cam.zoom = this.deviceProfile.baseZoom;
        }

        if (this.ambienceRenderer) this.ambienceRenderer.resize(this.viewport);
    },

    /** Start or swap the peaceful ambiance conductor playlist. */
    armAmbientLoop() {
        if (this.ambientLoopStarted) return;
        this.ambientLoopStarted = true;
        this.ambientState = 'OVERWORLD';
        armAmbientLoopHelper();
    },

    /** Stop ambiance when entering combat. */
    haltAmbientLoop() {
        this.ambientLoopStarted = false;
        this.ambientState = 'HALTED';
        haltAmbientLoopHelper();
    },

    /**
     * Synchronize ambient playback with the latest game state to avoid duplicate
     * loops when bouncing between overworld exploration and combat.
     * @param {string} state target state code (OVERWORLD|COMBAT)
     * @param {Object} [options] optional overrides (e.g., combat outcome)
     */
    syncAmbientForState(state = this.state, options = {}) {
        const normalized = (state || '').toUpperCase();
        if (normalized === this.ambientState && !options.force) return;
        syncAmbientForStateHelper(normalized, options);
        this.ambientState = normalized;
    },

    /** Route game SFX to the manifest-driven audio manager. */
    playSound(key, options = {}) {
        AudioBridge.play(key, options);
    },

    /**
     * Determine whether a pointer event landed on a visible hex tile for the active state.
     * Falls back to a permissive hit when the helper utilities are unavailable so clicks
     * remain functional in constrained environments.
     */
    isPointerOnDrawnHex(x, y) {
        if (typeof InputHelpers === 'undefined' || typeof InputHelpers.isPointerOnDrawnHex !== 'function') {
            const layout = { origin: this.cam, size: 30 * this.cam.zoom, ...Layout };
            return { hit: true, hex: Hex.fromPixel(layout, { x, y }) };
        }

        const result = InputHelpers.isPointerOnDrawnHex({
            x,
            y,
            cam: this.cam,
            zoom: this.cam.zoom,
            LayoutImpl: Layout,
            state: this.state,
            overworldMaps: { hexes: this.overworld.hexes, claimable: this.overworld.claimable },
            combatMaps: { territory: this.combat.territory }
        });

        if (result.hex && !(result.hex instanceof Hex)) result.hex = new Hex(result.hex.q, result.hex.r, result.hex.s);
        return result;
    },

    // --- Persistence + Leaderboard Helpers ---
    /** Reset per-war counters so leaderboard streaks remain scoped to current conflict. */
    resetSession() { this.session = { warKills: 0 }; },

    /** Build the starting overworld state and clear any lingering combat/claimable data. */
    bootstrapNewWorld() {
        this.state = 'OVERWORLD';
        this.paused = false;
        this.gold = 300; this.wood = 40; this.difficulty = 0;
        this.upgrades = { soldier: 1, archer: 1, production: 1, mines: 1, defense: 1 };
        this.overworld.hexes = new Map();
        this.overworld.claimable = new Map();
        this.addOverworldHex(new Hex(0,0), 'castle');
        for(let i=0; i<6; i++) this.claimHexLogic(Hex.neighbor(new Hex(0,0),i), true);
        this.calcOverworldGhosts();
        this.finalizeStarterTerritory();
        this.syncReclamationAwaitState();
        this.research = this.buildResearchState();
        this.updateResearchBonuses();
        this.resetSession();
        this.imperialFavor = DEFAULT_IMPERIAL_FAVOR;
        this.timekeeper.reset(START_TICK);
        this.pendingNotifications = [];
        this.updateSaveStatus('Fresh campaign');
        this.showOverworldUI();
        if (ImperialMandates?.resetForNewCampaign) ImperialMandates.resetForNewCampaign();
        if (typeof window !== 'undefined' && window.IntroOverlay) {
            window.IntroOverlay.clearIntroSeenFlag?.();
            window.IntroOverlay.reset();
        }
        this.shouldRunImperialIntro = typeof document !== 'undefined';
        if (!this.shouldRunImperialIntro || (typeof window !== 'undefined' && window.IntroOverlay && window.IntroOverlay.active === false)) {
            this.issueImperialIntroMandate();
            this.shouldRunImperialIntro = false;
        }
    },

    /** Apply a hydrated snapshot to the live game state (overworld only). */
    applySnapshot(snapshot) {
        this.state = 'OVERWORLD';
        this.paused = false;
        this.gold = snapshot.gold;
        this.wood = snapshot.wood;
        this.difficulty = snapshot.difficulty;
        this.upgrades = { ...this.upgrades, ...snapshot.upgrades };
        this.research = this.buildResearchState(snapshot.research);
        this.updateResearchBonuses();
        this.pendingReclamations = [];
        this.overworld.hexes = snapshot.overworld.hexes;
        this.overworld.claimable = new Map();
        this.calcOverworldGhosts();
        this.refreshClusterBonuses();
        this.resetSession();
        this.imperialFavor = clampImperialFavor(snapshot.imperialFavor ?? DEFAULT_IMPERIAL_FAVOR);
        this.timekeeper.daysPerWeek = snapshot.timekeeper?.daysPerWeek || this.timekeeper.daysPerWeek;
        this.timekeeper.weeksPerMonth = snapshot.timekeeper?.weeksPerMonth || this.timekeeper.weeksPerMonth;
        this.timekeeper.reset(snapshot.timekeeper?.ticks || 0);
        if (ImperialMandates?.hydrateState) {
            ImperialMandates.hydrateState(snapshot.mandates, this);
        }
        this.pendingNotifications = Array.isArray(snapshot.notifications) ? snapshot.notifications : [];
        this.syncReclamationAwaitState();
        this.updateSaveStatus(snapshot.stats?.lastSaveISO ? `Loaded ${snapshot.stats.lastSaveISO}` : 'Loaded save file');
        this.showOverworldUI();
        this.shouldRunImperialIntro = false;
    },

    /** Persist the overworld snapshot and leaderboard stats to a chosen slot. */
    saveGame(slot = this.activeSaveSlot) {
        if (!this.persistenceAvailable || !Persistence) {
            this.logBootstrapWarning('Save skipped: persistence helper unavailable in this environment.');
            return;
        }
        const targetSlot = String(slot || this.activeSaveSlot);
        const result = Persistence.saveSnapshot(this, targetSlot);
        this.activeSaveSlot = result.slot;
        const formattedTime = new Date(result.savedAt).toLocaleString();
        this.updateSaveStatus(`Saved Slot ${this.activeSaveSlot} @ ${formattedTime}`);
        this.updateSaveSlotsUI();
        this.spawnTxt(new Hex(0,0), 'Progress Saved', '#9be3b4');
    },

    /** Load a stored snapshot and refresh UI with the saved overworld. */
    loadGame(slot = this.activeSaveSlot) {
        if (!this.persistenceAvailable || !Persistence) {
            this.logBootstrapWarning('Load skipped: persistence helper unavailable in this environment.');
            return;
        }
        const targetSlot = String(slot || this.activeSaveSlot);
        const loaded = Persistence.loadSnapshot(targetSlot, { hexFactory: (q, r, s) => new Hex(q, r, s) });
        if (!loaded.state) {
            this.spawnTxt(new Hex(0,0), `No Save In Slot ${targetSlot}`, '#ef476f');
            this.updateSaveStatus('No save stored yet.');
            this.updateSaveSlotsUI();
            return;
        }
        this.activeSaveSlot = loaded.slot || targetSlot;
        this.applySnapshot(loaded.state);
        this.stats = loaded.stats;
        this.updateHUD();
        this.updateUpgradeMenu();
        this.updateResearchUI();
        this.updateLeaderboardUI();
        this.updateSaveSlotsUI();
        this.flushPendingNotifications();
        this.toggleSidebar(false);
        this.spawnTxt(new Hex(0,0), `Loaded Slot ${this.activeSaveSlot}`, '#9be3b4');
    },

    /** Wipe stored data and rebuild the starting overworld for a new run. */
    resetProgress() {
        if (!this.persistenceAvailable || !Persistence) {
            this.logBootstrapWarning('Reset skipped: persistence helper unavailable in this environment.');
            return;
        }
        Persistence.clearSnapshot();
        this.stats = { ...Persistence.DEFAULT_STATS };
        this.activeSaveSlot = '1';
        if (ImperialMandates?.resetForNewCampaign) ImperialMandates.resetForNewCampaign();
        this.bootstrapNewWorld();
        this.updateLeaderboardUI();
        this.updateHUD();
        this.updateUpgradeMenu();
        this.updateSaveSlotsUI();
        this.toggleSidebar(false);
        this.spawnTxt(new Hex(0,0), 'Progress Reset', '#ffd166');
        if (window.IntroOverlay?.reset) window.IntroOverlay.reset();
    },

    /**
     * Replay persisted notifications after UI bindings exist.
     * Safe to invoke multiple times; the backlog drains once per call when handlers exist.
     */
    flushPendingNotifications() {
        if (!Array.isArray(this.pendingNotifications) || !this.pendingNotifications.length) return;
        if (typeof this.enqueueNotification !== 'function') return;
        this.pendingNotifications.forEach((note) => this.enqueueNotification(note));
        this.pendingNotifications = [];
    },

    /**
     * Route recoverable runtime errors to the console and debug overlay while
     * allowing the render loop to continue running.
     * @param {string} context friendly identifier for the failing subsystem
     * @param {Error} error thrown error instance or message
     */
    reportRecoverableError(context, error) {
        const debugEl = document.getElementById('debug-log');
        const header = '⚠️ Recoverable error';
        const contextLabel = context ? `Context: ${context}` : 'Context: (unspecified)';
        const errorMessage = error?.message || String(error || 'Unknown error');
        const stack = (error && typeof error.stack === 'string') ? error.stack : 'No stack trace available.';

        console.error(`${contextLabel}: ${errorMessage}`, error);
        if (!debugEl) return;

        debugEl.classList.add('visible');
        debugEl.textContent = [
            header,
            contextLabel,
            `Message: ${errorMessage}`,
            'Stack trace:',
            stack
        ].join('\n');
    },

    /**
     * Execute a callback with defensive error handling so non-fatal runtime
     * errors do not interrupt rendering or input processing.
     * @param {Function} fn callback to execute safely
     * @param {string} label human readable label describing the callback
     */
    runSafely(fn, label) {
        try {
            fn();
        } catch (error) {
            this.reportRecoverableError(label, error);
        }
    },

    /**
     * Emit a debug-friendly bootstrap warning without interrupting execution.
     * @param {string} message human readable description of the fallback being used.
     * @param {Error} [error] optional error context to surface in the debug overlay.
     */
    logBootstrapWarning(message, error) {
        console.debug(message, error || '');
        if (error) {
            this.reportRecoverableError(message, error);
            return;
        }

        const debugEl = typeof document !== 'undefined' ? document.getElementById('debug-log') : null;
        if (!debugEl) return;
        debugEl.classList.add('visible');
        debugEl.textContent = `⚠️ ${message}`;
    },

    loop(now) {
        const dt = (now - this.lastTime)/1000;
        this.lastTime = now;
        try {
            const fogConfig = this.resolveFogConfig();
            this.ctx.globalAlpha = 1.0;
            this.fog.time += dt;
            const ambienceLayersEnabled = this.shouldRenderAmbience(fogConfig);
            if (ambienceLayersEnabled) {
                this.ensureAmbienceRendererReady(fogConfig);
                if (this.ambienceRenderer) this.ambienceRenderer.update(dt);
            } else {
                this.ambienceRenderer = null;
            }
            this.runSafely(() => this.updateCameraDrift(dt), 'camera drift update');
            if(this.state === 'OVERWORLD') this.runSafely(() => this.updateOverworld(dt), 'overworld update');
            else if(this.state === 'COMBAT') this.runSafely(() => this.updateCombat(dt), 'combat update');

            for(let i=this.combat.fx.length-1; i>=0; i--) {
                this.combat.fx[i].life -= dt;
                if(this.combat.fx[i].life <= 0) this.combat.fx.splice(i,1);
            }
            for(let i=this.combat.particles.length-1; i>=0; i--) {
                let p = this.combat.particles[i];
                p.life -= dt;
                if(p.life <= 0) { p.el.remove(); this.combat.particles.splice(i,1); }
            }
            this.draw();
            updateAudioDebug(dt, this.state);
        } catch (e) {
            this.reportRecoverableError('game loop', e);
            this.endWar(false);
        }
        requestAnimationFrame(t => this.loop(t));
    },

    // --- UPGRADES ---
    getUpgradeCost(type) {
        const level = this.upgrades[type];
        if (type === 'production') return Math.floor(150 * Math.pow(1.5, level - 1));
        if (type === 'mines') return Math.floor(200 * Math.pow(1.5, level - 1));
        if (type === 'defense') return Math.floor(125 * Math.pow(1.4, level - 1));
        return Math.floor(100 * Math.pow(1.3, level - 1));
    },

    buyUpgrade(type) {
        const cost = this.getUpgradeCost(type);
        if(this.gold >= cost) {
            this.gold -= cost;
            this.upgrades[type]++;
            this.updateHUD();
            this.updateUpgradeMenu();
            this.spawnTxt(new Hex(0,0), `${type.toUpperCase()} UPGRADED!`, '#d4f');
        }
    },

    /**
     * Build a fresh research state or hydrate from a saved payload.
     * Keeps the data in sync with the ResearchSystem definition file so tests
     * and gameplay share cost math.
     * @param {object} [saved] optional save payload with technologies + lives.
     * @returns {{technologies: Array, bonuses: object, lives: number}}
     */
    buildResearchState(saved = {}) {
        return buildResearchStateSafe({
            researchSystem: ResearchSystem,
            saved,
            defaultClusterRate: DEFAULT_CLUSTER_RATE,
            logDebug: (message, error) => this.logBootstrapWarning(message, error)
        });
    },

    /**
     * Recalculate passive bonuses derived from purchased tech so loading and
     * respecs remain deterministic.
     */
    updateResearchBonuses() {
        this.research.bonuses = {
            townGoldBonus: 0,
            forestWoodBonus: 0,
            clusterBaseRate: DEFAULT_CLUSTER_RATE,
            landReclamationClusterBonus: 0
        };
        const livesTech = this.research.technologies.find(t => t.id === 'lives');
        const purchasedLives = Math.min(livesTech?.timesPurchased || 0, livesTech?.maxPurchases || 0);
        this.research.lives = Math.min(this.research.lives || 0, purchasedLives);

        this.research.technologies.forEach(tech => {
            if (!tech.timesPurchased) return;
            if (tech.id === 'architecture') this.research.bonuses.townGoldBonus += tech.timesPurchased;
            if (tech.id === 'lumberjacks') this.research.bonuses.forestWoodBonus += tech.timesPurchased;
            if (tech.id === 'land-reclamation') this.research.bonuses.landReclamationClusterBonus += tech.timesPurchased * 0.05;
        });
    },

    /**
     * Convert a cost object into a human-readable string.
     * @param {object} cost resource object keyed by gold/wood.
     * @returns {string}
     */
    formatCost(cost) {
        const parts = [];
        if (cost?.gold) parts.push(`${cost.gold}g`);
        if (cost?.wood) parts.push(`${cost.wood}w`);
        return parts.join(' + ');
    },

    /** Locate a technology by id. */
    getTech(id) { return this.research.technologies.find(t => t.id === id); },

    /**
     * Determine the scaled price for a tech, optionally scoped to an option.
     * Accounts for pending land-reclamation placements so queued conversions
     * continue to scale follow-up purchases.
     * @param {object} tech technology entry.
     * @param {string} [optionId] optional cost option id.
     * @returns {object|null} resource cost, or null when invalid.
     */
    getTechCost(tech, optionId) {
        try {
            const pending = tech?.id === 'land-reclamation'
                ? Math.max(tech.pendingPlacements || 0, 0)
                : 0;
            const normalized = pending
                ? { ...tech, timesPurchased: (tech.timesPurchased || 0) + pending }
                : tech;
            return ResearchSystem.getCostForTech(normalized, optionId);
        } catch (error) {
            this.logBootstrapWarning?.('Failed to resolve tech cost', error);
            return null;
        }
    },

    /** Check if the player can pay a specific cost. */
    canPayCost(cost) {
        if (!cost) return false;
        return ResearchSystem.isAffordable({ gold: this.gold, wood: this.wood }, cost);
    },

    /**
     * Attempt to purchase a technology and immediately apply its effect.
     * @param {string} techId identifier of the tech to buy.
     * @param {string} [optionId] optional option key (land reclamation).
     */
    buyTechnology(techId, optionId) {
        const tech = this.getTech(techId);
        if (!tech || !ResearchSystem.hasRemainingPurchases(tech)) return;

        const cost = this.getTechCost(tech, optionId);
        if (!cost) return;
        const hasFields = tech.id === 'land-reclamation' ? this.hasFieldToConvert() : true;
        if (!hasFields) return;
        const payment = tech.id === 'land-reclamation' ? { gold: cost.gold || 0 } : cost;
        if (!this.canPayCost(payment)) return;

        if (tech.id === 'land-reclamation') {
            this.applyTechEffect(tech, optionId, payment);
            this.updateResearchUI();
            return;
        }

        this.gold -= payment.gold || 0;
        this.wood -= payment.wood || 0;
        this.applyTechEffect(tech, optionId, payment);
        ResearchSystem.recordPurchase(tech);
        this.updateResearchBonuses();
        this.refreshClusterBonuses();
        this.updateHUD();
        this.updateResearchUI();
    },

    /**
     * Apply immediate bonuses from a purchased tech.
     * @param {object} tech technology definition.
     * @param {string} [optionId] cost option chosen by the player.
     * @param {object} [cost] optional precomputed payment for queued tech.
     */
    applyTechEffect(tech, optionId, cost) {
        if (tech.id === 'lives') {
            const cap = tech.maxPurchases || 3;
            this.research.lives = Math.min(this.research.lives + 1, cap);
            this.spawnTxt(new Hex(0,0), `+1 LIFE (${this.research.lives}/${cap})`, '#9be3b4');
            return;
        }

        if (tech.id === 'architecture') {
            this.research.bonuses.townGoldBonus += 1;
            this.spawnTxt(new Hex(0,0), 'TOWNS RICHER', '#ffd166');
            return;
        }

        if (tech.id === 'lumberjacks') {
            this.research.bonuses.forestWoodBonus += 1;
            this.spawnTxt(new Hex(0,0), 'WOOD FLOW +', '#8ae7a8');
            return;
        }

        if (tech.id === 'land-reclamation') {
            const targetType = optionId === 'town' ? 'town' : 'forest';
            this.queueLandReclamation(targetType, cost || {});
            this.enterReclamationTargetingState();
            return;
        }
    },

    /**
     * Queue a land reclamation placement so the player can pick which field to upgrade.
     * Charges are consumed when a player-owned field is clicked in the overworld.
     * @param {string} targetType desired conversion target (forest|town).
     * @param {object} cost payment to reserve for when a valid tile is selected.
     */
    queueLandReclamation(targetType, cost = {}) {
        const normalized = targetType === 'town' ? 'town' : 'forest';
        if (!Array.isArray(this.pendingReclamations)) this.pendingReclamations = [];
        const tech = this.getTech('land-reclamation');
        if (tech) tech.pendingPlacements = Math.max(0, tech.pendingPlacements || 0) + 1;
        this.pendingReclamations.push({ targetType: normalized, cost, techId: 'land-reclamation' });
        if (typeof this.updateTileInspector === 'function') this.updateTileInspector(this.selectedOverworldTile);
        this.syncReclamationAwaitState();
        this.updateReclamationPromptFromQueue();
        return this.pendingReclamations.length;
    },

    /**
     * Peek at the next queued reclamation request to help the HUD surface guidance.
     * @returns {string|null} queued target type or null when none pending.
     */
    nextQueuedReclamationType() {
        const pending = Array.isArray(this.pendingReclamations) && this.pendingReclamations[0];
        return pending?.targetType || null;
    },

    /**
     * Peek at the pending reclamation cost so HUD hints can reflect the owed gold.
     * @returns {object|null} queued cost reference.
     */
    nextQueuedReclamationCost() {
        const pending = Array.isArray(this.pendingReclamations) && this.pendingReclamations[0];
        return pending?.cost || null;
    },

    /**
     * Convert a player-controlled field into the requested tile type, consuming the
     * oldest queued reclamation charge. Invalid or hostile targets surface HUD feedback
     * and leave the queue intact, while a fully exhausted map clears any pending state.
     * @param {object} tile overworld tile payload selected by the player.
     * @param {Hex} [fallbackHex] optional hex for error messaging when tile is missing.
     * @returns {boolean} true when a conversion occurred.
     */
    applyQueuedReclamationToTile(tile, fallbackHex) {
        const pending = Array.isArray(this.pendingReclamations) && this.pendingReclamations[0];
        const HexImpl = this.Hex || Hex;
        const anchorHex = (tile && tile.hex) || fallbackHex || this.selectedOverworldTile?.hex || new HexImpl(0, 0, 0);
        const notify = (msg, col = '#ef476f') => {
            if (typeof this.spawnTxt === 'function') this.spawnTxt(anchorHex, msg, col);
        };

        if (!pending) {
            notify('No reclamation charges available');
            this.syncReclamationAwaitState();
            return false;
        }

        const hasEligibleField = typeof this.hasFieldToConvert === 'function' ? this.hasFieldToConvert() : true;
        if (!hasEligibleField) {
            this.pendingReclamations.length = 0;
            const techRef = this.getTech('land-reclamation');
            if (techRef) techRef.pendingPlacements = 0;
            notify('No player fields remain to reclaim');
            this.syncReclamationAwaitState();
            this.updateReclamationPromptFromQueue();
            if (typeof this.updateTileInspector === 'function') this.updateTileInspector(tile || this.selectedOverworldTile);
            return false;
        }

        if (!tile || tile.type !== 'field') {
            notify('Select an owned FIELD to convert');
            this.syncReclamationAwaitState();
            this.updateReclamationPromptFromQueue();
            if (typeof this.updateTileInspector === 'function') this.updateTileInspector(tile || this.selectedOverworldTile);
            return false;
        }
        if (tile.owner && tile.owner !== 'player') {
            notify('Enemy territory cannot be reclaimed');
            this.syncReclamationAwaitState();
            this.updateReclamationPromptFromQueue();
            if (typeof this.updateTileInspector === 'function') this.updateTileInspector(tile);
            return false;
        }

        const targetType = pending.targetType === 'town' ? 'town' : 'forest';
        const cost = pending.cost || { gold: 0 };
        if (!this.canPayCost({ gold: cost.gold || 0 })) {
            notify('Need more gold to reclaim');
            this.syncReclamationAwaitState();
            this.updateReclamationPromptFromQueue();
            if (typeof this.updateTileInspector === 'function') this.updateTileInspector(tile || this.selectedOverworldTile);
            return false;
        }

        tile.type = targetType;
        tile.owner = tile.owner || 'player';
        tile.wasReclaimed = true;
        this.calcOverworldGhosts();

        this.pendingReclamations.shift();
        const tech = this.getTech('land-reclamation');
        if (tech && tech.pendingPlacements) tech.pendingPlacements = Math.max(0, tech.pendingPlacements - 1);

        // Payment is finalized only after a valid placement lands.
        this.gold -= cost.gold || 0;
        if (tech) ResearchSystem.recordPurchase(tech);
        this.updateResearchBonuses();
        this.refreshClusterBonuses();
        this.spawnTxt(tile.hex, `${targetType.toUpperCase()} RECLAIMED`, targetType === 'town' ? '#ffd166' : '#8ae7a8');
        if (typeof this.updateTileInspector === 'function') this.updateTileInspector(tile);
        this.updateHUD();
        this.updateResearchUI?.();
        this.updateReclamationPromptFromQueue();
        this.syncReclamationAwaitState();
        return true;
    },

    /** True when at least one field can be reclaimed. */
    hasFieldToConvert() {
        return Array.from(this.overworld.hexes.values())
            .some(h => h.type === 'field' && (!h.owner || h.owner === 'player'));
    },

    /**
     * Set and broadcast the reclamation targeting state so the UI and click
     * handlers know a player decision is required for placement.
     * @returns {boolean} true when at least one reclamation charge remains.
     */
    syncReclamationAwaitState() {
        const hasPending = Array.isArray(this.pendingReclamations) && this.pendingReclamations.length > 0;
        this.awaitingReclamationTarget = hasPending;
        if (hasPending) this.updateReclamationPromptFromQueue();
        else if (typeof this.updateTileInspector === 'function') this.updateTileInspector(this.selectedOverworldTile);
        if (!hasPending) {
            const techRef = this.getTech('land-reclamation');
            if (techRef) techRef.pendingPlacements = 0;
            this.setReclamationPrompt('');
        }
        return hasPending;
    },

    /**
     * Surface a HUD-level hint while queued reclamations await tile targeting.
     * @param {string} message user-facing guidance text; empty to hide.
     */
    setReclamationPrompt(message) {
        const hint = typeof document !== 'undefined' ? document.getElementById('reclamation-hint') : null;
        if (!hint) return false;
        const hasMessage = Boolean(message);
        hint.innerText = message || '';
        hint.setAttribute('aria-hidden', hasMessage ? 'false' : 'true');
        return hasMessage;
    },

    /**
     * Refresh the reclamation prompt text using the next queued cost/target for clarity.
     */
    updateReclamationPromptFromQueue() {
        const pendingType = this.nextQueuedReclamationType();
        const pendingCost = this.nextQueuedReclamationCost();
        if (!pendingType || !pendingCost) return this.setReclamationPrompt('');
        const costLabel = this.formatCost(pendingCost) || '0g';
        return this.setReclamationPrompt(`Select an owned FIELD tile to convert (pay ${costLabel} on placement)`);
    },

    /**
     * Collapse the research drawer, flag the awaiting state, and float a prompt
     * so the player knows to pick a target field immediately after purchase.
     */
    enterReclamationTargetingState() {
        this.syncReclamationAwaitState();
        if (typeof this.toggleResearch === 'function') this.toggleResearch(false);
        this.updateReclamationPromptFromQueue();
        const x = this.viewport?.width ? this.viewport.width / 2 : 0;
        const y = Math.max(48, (this.viewport?.height || 0) * 0.18);
        const costLabel = this.formatCost(this.nextQueuedReclamationCost() || { gold: 0 }) || '0g';
        const message = `Select a field to convert (${costLabel} due on placement).`;
        if (typeof this.showFloatingText === 'function') {
            this.showFloatingText(x, y, message, 'alert-text');
        } else {
            this.spawnTxt(new Hex(0,0), message, '#9be3b4');
        }
        if (typeof this.spawnTxt === 'function') {
            this.spawnTxt(new Hex(0,0), 'Click a player field to reclaim.', '#9be3b4');
        }
    },

    /**
     * Rebuild the adjacency bonus cache for overworld income and UI consumers.
     * @returns {Map<string, object>} latest cluster bonus map keyed by hex key.
     */
    refreshClusterBonuses() {
        const baseRate = this.research?.bonuses?.clusterBaseRate ?? DEFAULT_CLUSTER_RATE;
        const reclamationRate = this.research?.bonuses?.landReclamationClusterBonus ?? 0;
        const bonuses = buildClusterBonusMap(this.overworld?.hexes, { baseRate, reclamationRate });
        this.overworld.clusterBonuses = bonuses;
        return bonuses;
    },

    /**
     * Normalize starter tile ownership and rebuild the adjacency cache so the inspector
     * can reference fresh cluster data as soon as the campaign boots.
     * @returns {Map<string, object>} updated cluster bonus map keyed by hex key.
     */
    finalizeStarterTerritory() {
        if (this.overworld?.hexes instanceof Map) {
            this.overworld.hexes.forEach((tile) => {
                if (tile && !tile.owner) tile.owner = 'player';
            });
        }
        return this.refreshClusterBonuses();
    },

    getUnitStats(type) { return getUnitStats(this, type); },

    getBuildingStats(type, owner) { return getBuildingStats(this, type, owner); },

    getSpawnRate(baseRate) { return getSpawnRate(this, baseRate); },

    getIncomeMulti() {
        return 1 + ((this.upgrades.mines - 1) * 0.2);
    },

    updateOverworld(dt) {
        advanceOverworldTimer(this, dt, {
            mandateManager: ImperialMandateManager,
            imperialMandates: ImperialMandates,
            uiBindings: {
                showTileCallout: this.showTileCallout,
                hideTileCallout: this.hideTileCallout,
                enqueueNotification: this.enqueueNotification
            }
        });
    },

    /**
     * Keep the camera gently drifting around the viewport center so the overworld
     * feels alive even when idle. The motion is bounded by configurable amplitude
     * and speed and can be disabled for deterministic tests.
     */
    updateCameraDrift(dt) {
        const config = this.featureToggles?.camera || CAMERA_MOTION_CONFIG;
        if (!config?.enabled) {
            this.cam.x = this.camBase.x;
            this.cam.y = this.camBase.y;
            return;
        }

        this.camDrift.time += dt;
        const offsetX = Math.sin(this.camDrift.time * config.speed) * config.amplitude;
        const offsetY = Math.cos(this.camDrift.time * config.speed * 0.75)
            * config.amplitude * (config.parallax ?? 1);

        this.cam.x = this.camBase.x + offsetX;
        this.cam.y = this.camBase.y + offsetY;
    },

    updateCombat(dt) { return updateCombat(this, dt, this.Hex); },

    /** Track leaderboard totals when the player lands a final blow. */
    registerKill(owner) { return registerKill(this, owner); },

    /** Persist leaderboard milestones and autosave at the end of any war outcome. */
    recordWarEnd(outcome) { return recordWarEnd(this, outcome); },

    damageUnit(u, dmg, attackerOwner) { return damageUnit(this, u, dmg, attackerOwner); },

    runAI() { return runAI(this); },

    damageBuilding(key, amt, attackerOwner) { return damageBuilding(this, key, amt, attackerOwner); },

    checkConnection(startHex, owner) { return checkConnection(this, startHex, owner, this.Hex); },

    scorchEarth(key) { return scorchEarth(this, key); },

    /**
     * Track the currently highlighted overworld tile and refresh the contextual inspector UI.
     * Hostile tiles surface an Attack action while neutral/friendly tiles simply show details.
     * @param {object|null} tile tile payload selected by the player.
     */
    setSelectedOverworldTile(tile) {
        const selection = tile || null;
        if (selection && this.overworld) {
            const clusterBonuses = (this.overworld.clusterBonuses && this.overworld.clusterBonuses.size > 0)
                ? this.overworld.clusterBonuses
                : this.refreshClusterBonuses();
            const key = selection.hex?.toString?.() || `${selection.hex?.q ?? 0},${selection.hex?.r ?? 0}`;
            if (key && clusterBonuses?.has(key)) selection.clusterBonus = clusterBonuses.get(key);
        }
        this.selectedOverworldTile = selection;
        if (this.updateTileInspector) this.updateTileInspector(selection);
    },

    /**
     * Surface a contextual HUD preview for claimable frontier tiles without
     * stamping text on the overworld map. The inspector communicates cost and
     * affordability while keeping the board clean.
     * @param {Hex|object} hex tile coordinate under the cursor.
     * @param {number} cost wood required to claim the tile.
     */
    updateClaimPreview(hex, cost) {
        if (typeof this.updateTileInspector !== 'function' || typeof cost !== 'number') return;
        const normalized = hex instanceof Hex ? hex : new Hex(hex.q, hex.r, hex.s ?? -hex.q - hex.r);
        this.updateTileInspector({ hex: normalized, type: 'Frontier', owner: 'neutral', claimCost: cost });
    },

    /** Restore the inspector to the actively selected tile or default placeholder text. */
    clearClaimPreview() {
        if (typeof this.updateTileInspector !== 'function') return;
        this.updateTileInspector(this.selectedOverworldTile);
    },

    /**
     * Tile-driven battle entry point that funnels hostile selections into the core war pipeline.
     * Ensures the target tile is marked for clearing before deferring to startWar so hooks fire.
     * @param {object} targetTile overworld tile being attacked.
     * @param {Event} [clickEvt] originating click event for FX anchoring.
     */
    beginBattleFromTile(targetTile, clickEvt) {
        if (targetTile) this.pendingClearTile = targetTile;
        this.startWar(clickEvt);
    },

    onClick(x, y) {
        const layout = {origin:this.cam, size:30*this.cam.zoom, ...Layout};
        const hex = Hex.fromPixel(layout, {x, y});
        const key = hex.toString();

        if(this.state === 'OVERWORLD') {
            this.setSelectedOverworldTile(null);
            if (this.awaitingReclamationTarget) {
                const tile = this.overworld.hexes.get(key);
                const converted = this.applyQueuedReclamationToTile(tile, hex);
                this.updateHUD();
                if (converted) return;
                return;
            }
            if(this.overworld.claimable.has(key)) {
                const cost = this.overworld.claimable.get(key);
                this.hoveredClaimableKey = key;
                this.updateClaimPreview(hex, cost);
                if(this.wood >= cost) {
                    this.wood -= cost;
                    this.claimHexLogic(hex, false);
                    this.calcOverworldGhosts();
                    this.hoveredClaimableKey = null;
                    this.clearClaimPreview();
                    this.updateHUD();
                } else {
                    this.spawnTxt(hex, "Need Wood", '#f55');
                }
            } else if (this.overworld.hexes.has(key)) {
                const tile = this.overworld.hexes.get(key);
                this.setSelectedOverworldTile(tile);
            }
        }
        else if (this.state === 'COMBAT') {
            const tile = this.combat.territory.get(key);
            if(!this.isFrontier(key, 'player')) {
                if(tile && tile.owner === 'player') this.spawnTxt(hex, "Too Far!", '#f55');
                else if(tile && tile.owner === 'scorched') this.spawnTxt(hex, "Dead Land", '#333');
                else this.spawnTxt(hex, "Capture First!", '#f55');
                return;
            }
            let type = this.combat.slots.get(key);
            if(type) this.buyBuilding(hex, type);
        }
        this.updateHUD();
    },

    /**
     * Live hover handler for claimable frontier tiles. Keeps the HUD inspector
     * aligned with the tile under the cursor without altering selection state.
     * @param {number} x pointer x coordinate.
     * @param {number} y pointer y coordinate.
     */
    onHover(x, y) {
        if (this.state !== 'OVERWORLD') return;
        const hit = this.isPointerOnDrawnHex(x, y);
        const hitHex = hit?.hex;
        const key = hitHex?.toString?.() || (hitHex && `${hitHex.q ?? 0},${hitHex.r ?? 0}`);
        if (key && this.overworld.claimable.has(key)) {
            const cost = this.overworld.claimable.get(key);
            if (this.hoveredClaimableKey !== key) {
                this.hoveredClaimableKey = key;
                this.updateClaimPreview(hitHex, cost);
            }
            return;
        }

        if (this.hoveredClaimableKey) {
            this.hoveredClaimableKey = null;
            this.clearClaimPreview();
        }
    },

    isFrontier(key, who) { return isFrontier(this, key, who, this.Hex); },

    buyBuilding(hex, type) { return buyBuilding(this, hex, type); },

    addBuilding(hex, type, owner) { return addBuilding(this, hex, type, owner); },

    spawnUnit(type, owner, hex) { return spawnUnit(this, type, owner, hex); },

    startWar(clickEvt) {
        const previousState = this.state;
        startWar(this, clickEvt, this.Hex);
        if (previousState === 'OVERWORLD' && this.state !== 'COMBAT') {
            this.pendingClearTile = null;
        }
        if (this.state === 'COMBAT' && this.updateTileInspector) this.updateTileInspector(null);
    },

    /**
     * Trigger the non-blocking visual/audio feedback for war startup.
     * Wrapped in a safe guard so a failing FX call cannot stop battle setup.
     */
    playWarStartFX(x, y) {
        try {
            this.triggerCameraShake();
            this.showFloatingText(x, y, 'TO WAR!', 'gold-text');
            this.spawnParticleBurst(x, y, 8);
        } catch (err) {
            console.warn('War FX failed; continuing combat init', err);
        }
    },

    loseOverworldHexes(count, protectedKeys) { return loseOverworldHexes(this, count, protectedKeys); },

    endWar(outcome, clickEvt) {
        endWar(this, outcome, clickEvt, this.Hex);
        this.pendingClearTile = null;
        this.setSelectedOverworldTile(null);
        return undefined;
    },

    claimHexLogic(hex, free) {
        const weighted = [
            { type: 'field', weight: 45 },
            { type: 'forest', weight: 30 },
            { type: 'town', weight: 18 },
            { type: 'mine', weight: 5 },
            { type: 'shrine', weight: 2 },
            { type: 'ruin', weight: 1 }
        ];
        const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0);
        let pick = Math.random() * totalWeight;
        let type = 'field';
        for (const entry of weighted) {
            if (pick < entry.weight) { type = entry.type; break; }
            pick -= entry.weight;
        }

        this.addOverworldHex(hex, type);
        const def = OVERWORLD_TILES[type.toUpperCase()];
        if (!free) {
            const label = def?.char ? `${def.char} ${type.toUpperCase()}!` : `${type.toUpperCase()}!`;
            this.spawnTxt(hex, label, '#fff');
            if (type === 'town') this.playSound('city');
            else if (type === 'forest') this.playSound('choptree');
            else if (type === 'mine') this.playSound('gold');
            else if (type === 'shrine') this.playSound('holy');
        }
        if (def?.onClaim && !free) def.onClaim(this, hex);
        if (!free) this.refreshClusterBonuses();
    },
    addOverworldHex(hex, type) { this.overworld.hexes.set(hex.toString(), {hex, type, owner: 'player'}); },
    calcOverworldGhosts() {
        this.overworld.claimable.clear();
        for(let [k, d] of this.overworld.hexes) {
            for(let i=0; i<6; i++) {
                const n = Hex.neighbor(d.hex, i);
                if(!this.overworld.hexes.has(n.toString())) {
                    const dist = Hex.distance(new Hex(0,0), n);
                    this.overworld.claimable.set(n.toString(), Math.floor(12 + dist * 6));
                }
            }
        }
    },
    parseKey(k) { const p = k.split(','); return new Hex(parseInt(p[0]), parseInt(p[1])); },
    /** Convert a hex coordinate into the current camera projection. */
    projectHexToScreen(pos) {
        const layout = { origin: this.cam, size: 30 * this.cam.zoom, ...Layout };
        const hex = pos.toPixel ? pos : new Hex(pos.q, pos.r, pos.s ?? -pos.q - pos.r);
        return hex.toPixel(layout);
    },
    draw() {
        const ctx = this.ctx;
        const layout = {origin:this.cam, size:30*this.cam.zoom, ...Layout};
        if (this.updateTileAttackOverlay) {
            this.updateTileAttackOverlay(this.state === 'OVERWORLD' ? this.selectedOverworldTile : null);
        }
        this.renderFogBackdrop(layout);
        if(this.state === 'COMBAT') this.drawCombat(layout); else this.drawOverworld(layout);
    },

    drawCombat(layout) {
        for(let [k, t] of this.combat.territory) {
            const visibility = this.resolveHexVisibility(t.hex || k);
            const visibleTile = visibility === TILE_VISIBILITY.VISIBLE;
            const seenTile = visibility === TILE_VISIBILITY.SEEN;

            let fill = '#222';
            if(t.owner === 'player') fill = '#1b4332';
            else if(t.owner === 'enemy') fill = '#590d22';
            else if(t.owner === 'scorched') fill = '#111'; // Scorched Color

            if (!visibleTile) {
                fill = seenTile ? 'rgba(28, 32, 38, 0.75)' : '#08090f';
            }

            this.drawHex(layout, t.hex, fill, '#000');
            const type = this.combat.slots.get(k);
            if(type && this.isFrontier(k, 'player')) {
                const def = COMBAT_BUILDINGS[type.toUpperCase()];
                if(def) {
                    this.ctx.globalAlpha = visibleTile ? 0.5 : 0.3;
                    this.drawHex(layout, t.hex, 'rgba(255,255,255,0.1)', '#fff', def.char, def.cost !== undefined ? `${def.cost}g` : '');
                    this.ctx.globalAlpha = 1.0;
                }
            }
        }
        for(let [k, b] of this.combat.buildings) {
            const def = COMBAT_BUILDINGS[b.type.toUpperCase()];
            if(!def) continue;
            const visibility = this.resolveHexVisibility(k);
            if (visibility === TILE_VISIBILITY.UNSEEN) continue;
            const muted = visibility === TILE_VISIBILITY.SEEN;
            let fill = b.owner === 'player' ? '#2d6a4f' : '#800f2f';
            if (b.type === 'lair') fill = '#4a004a';
            if (muted) fill = 'rgba(74, 82, 94, 0.9)';
            if(b.pulse > 0) { b.pulse -= 0.05; fill = '#fff'; }
            const originalAlpha = this.ctx.globalAlpha;
            if (muted) this.ctx.globalAlpha = 0.55;
            this.drawHex(layout, this.parseKey(k), fill, '#fff', def.char);
            this.ctx.globalAlpha = originalAlpha;
        }
        this.combat.units.forEach(u => {
            const def = UNITS[u.type];
            if(!def) return;
            const visibility = this.resolveHexVisibility(u.pos);
            if (visibility === TILE_VISIBILITY.UNSEEN) return;
            const muted = visibility === TILE_VISIBILITY.SEEN;
            const p = (new Hex(u.pos.q, u.pos.r, u.pos.s)).toPixel(layout);
            const size = u.type === 'dragon' ? 16 * this.cam.zoom : 10 * this.cam.zoom;
            const originalAlpha = this.ctx.globalAlpha;
            this.ctx.fillStyle = muted ? '#7a8694' : (u.owner === 'player' ? '#06d6a0' : '#ef476f');
            if (u.type === 'dragon') this.ctx.fillStyle = muted ? '#9273b6' : '#d4f';
            if (muted) this.ctx.globalAlpha = 0.55;
            this.ctx.beginPath(); this.ctx.arc(p.x, p.y, size, 0, Math.PI*2); this.ctx.fill();
            this.ctx.strokeStyle = '#fff'; this.ctx.stroke();
            this.ctx.font = `${(u.type==='dragon'?20:12)*this.cam.zoom}px sans-serif`;
            this.ctx.textAlign='center'; this.ctx.textBaseline='middle';
            this.ctx.fillText(def.char, p.x, p.y);
            this.ctx.globalAlpha = originalAlpha;
        });

        // DRAW FX
        this.combat.fx.forEach(fx => {
            const p1 = fx.startHex.toPixel(layout);
            const p2 = (new Hex(fx.endPos.q, fx.endPos.r, fx.endPos.s)).toPixel(layout);
            
            this.ctx.strokeStyle = fx.color;
            this.ctx.lineWidth = 3 * this.cam.zoom;
            this.ctx.beginPath();
            this.ctx.moveTo(p1.x, p1.y);
            this.ctx.lineTo(p2.x, p2.y);
            this.ctx.stroke();
        });
    },

    /**
     * Determine whether debug overlays should stamp claim costs onto frontier tiles.
     * Defaults to off for normal play, but can be enabled via feature toggles or
     * the global DebugToggles hook for development sessions.
     * @returns {boolean} true when claim cost labels should render.
     */
    shouldShowClaimCostLabels() {
        const toggle = this.featureToggles?.overworld?.showClaimCosts;
        const debugToggle = (typeof window !== 'undefined' && window.DebugToggles)
            ? window.DebugToggles.showClaimCosts
            : false;
        return Boolean(toggle || debugToggle);
    },

    /**
     * Decide whether combat tiles should inherit fog/snow visibility masks.
     * The legacy fog-of-war visuals stay disabled during war, while seasonal
     * snow overlays may apply when enabled and the calendar falls in winter.
     *
     * @param {Date} [currentDate=new Date()] optional date override for tests.
     * @returns {boolean} true when combat rendering should apply fog/snow masks.
     */
    shouldApplyCombatFog(currentDate = new Date()) {
        if (this.state !== 'COMBAT') return false;
        const fogConfig = this.fog?.visualConfig || this.resolveFogConfig();
        if (!fogConfig || fogConfig.enabled === false) return false;
        if (fogConfig.visualMode !== 'seasonalSnow') return false;

        const winterMonths = new Set([11, 0, 1]);
        return winterMonths.has(currentDate.getMonth());
    },

    /**
     * Build a normalized visibility map spanning overworld/frontier and combat
     * territories. Stored on the fog namespace so tile overlays and fog masks can
     * share the same resolution each frame.
     * @returns {Map<string, string>} keyed visibility states (unseen|seen|visible).
     */
    getTileVisibilityMap() {
        const visibility = buildTileVisibilityMap({
            state: this.state,
            overworld: this.overworld?.hexes,
            claimable: this.overworld?.claimable,
            combat: this.shouldApplyCombatFog() ? this.combat?.territory : null
        });
        this.fog.visibility = visibility;
        return visibility;
    },

    /**
     * Resolve and cache the active fog visual configuration for the current frame.
     * Consumers can read from `this.fog.visualConfig` without re-normalizing.
     *
     * @returns {Object} normalized fog configuration derived from feature toggles.
     */
    resolveFogConfig() {
        const config = resolveFogVisualConfig(this.featureToggles?.fog);
        this.fog.visualConfig = config;
        return config;
    },

    drawOverworld(layout) {
        const tileVisibility = this.fog?.visibility instanceof Map
            ? this.fog.visibility
            : this.getTileVisibilityMap();
        this.fog.hexLayout = layout;
        drawOverworldTiles(this.overworld, {
            layout,
            drawHex: (...args) => this.drawHex(...args),
            parseKey: (key) => this.parseKey(key),
            drawTileFog: (hex, tile, visibility) => this.drawTileFog(hex, tile, visibility),
            showClaimCosts: this.shouldShowClaimCostLabels(),
            tileVisibility
        });
    },

    /**
     * Shade a single hex according to its visibility state. Unseen tiles receive
     * an opaque mask, discovered-but-not-visible tiles get a desaturated dimmer,
     * and visible tiles bypass the mask entirely so the base art shows through.
     *
     * @param {Hex} hex tile coordinate being rendered.
     * @param {Object} tile raw tile payload from map iteration.
     * @param {string} visibility normalized tile visibility label.
     */
    drawTileFog(hex, tile, visibility) {
        const layout = this.fog?.hexLayout;
        if (!layout || !hex || typeof hex.toPixel !== 'function') return;
        const fogConfig = this.fog?.visualConfig || this.resolveFogConfig();
        if (fogConfig.enabled === false || fogConfig.tileFogEnabled !== true) return;

        const state = visibility || this.resolveHexVisibility(hex);
        if (state === TILE_VISIBILITY.VISIBLE) return;

        const ctx = this.ctx;
        const center = hex.toPixel(layout);
        const maskSize = Math.max(4 * this.cam.zoom, layout.size - Math.max(2.5 * this.cam.zoom, layout.size * 0.08));

        ctx.save();
        ctx.beginPath();
        for (let i = 0; i < 6; i += 1) {
            const angle = 2 * Math.PI / 6 * (i + 0.5);
            const x = center.x + maskSize * Math.cos(angle);
            const y = center.y + maskSize * Math.sin(angle);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();

        if (state === TILE_VISIBILITY.UNSEEN) {
            ctx.fillStyle = 'rgba(5, 6, 12, 0.9)';
            ctx.fill();
            ctx.restore();
            return;
        }

        const gradient = ctx.createRadialGradient(center.x, center.y, maskSize * 0.1, center.x, center.y, maskSize);
        gradient.addColorStop(0, 'rgba(32, 38, 46, 0.38)');
        gradient.addColorStop(1, 'rgba(12, 14, 18, 0.6)');

        const originalComposite = ctx.globalCompositeOperation;
        const originalAlpha = ctx.globalAlpha;
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = gradient;
        ctx.fill();
        ctx.globalCompositeOperation = 'saturation';
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = 'rgba(132, 138, 148, 1)';
        ctx.fill();
        ctx.globalAlpha = originalAlpha;
        ctx.globalCompositeOperation = originalComposite;
        ctx.restore();
    },

    /**
     * Resolve the fog visibility state for a given hex or tile key. Defaults to
     * visible when no map entry exists to keep rendering predictable.
     *
     * @param {Hex|string} hex hex coordinate or string key.
     * @returns {string} visibility label (unseen|seen|visible).
     */
    resolveHexVisibility(hex) {
        const key = typeof hex === 'string' ? hex : hex?.toString?.();
        if (!key || !(this.fog?.visibility instanceof Map)) return TILE_VISIBILITY.VISIBLE;
        return this.fog.visibility.get(key) || TILE_VISIBILITY.VISIBLE;
    },

    /**
     * Paint the fog backdrop. In the default void mode the function clears to the
     * void color and returns immediately so ambience/gradients never render. When
     * a non-default visual mode is explicitly selected, the legacy gradient stack
     * remains available for experimentation.
     *
     * @param {Object} layout active hex layout (origin + size)
     * @param {Object} [fogMaskOptions] optional mask hooks for unexplored/frontier tiles
     * @param {Set<string>|Array<string>|Map<string, *>} [fogMaskOptions.tileMask] precomputed tile mask keys
     * @param {Function} [fogMaskOptions.tileMaskProvider] callback returning a mask when invoked with context
     * @param {boolean} [fogMaskOptions.frontierOnly=false] whether the mask represents frontier tiles only
     * @param {Function} [fogMaskOptions.onMaskResolved] callback fired with mask metadata once resolved
     */
    renderFogBackdrop(layout, fogMaskOptions = {}) {
        const ctx = this.ctx;
        const fogConfig = this.fog?.visualConfig || this.resolveFogConfig();
        const isVoidBaseline = this.isVoidVisualMode(fogConfig);
        const fogGradientStops = fogConfig.fogGradientStops || {};
        const rippleGradientStops = fogConfig.rippleGradientStops || {};
        const spotlightColors = fogConfig.spotlightColors || {};
        const voidFill = fogConfig.voidFill ?? fogConfig.baseFillColor ?? '#0b0b11';

        const tileVisibility = this.getTileVisibilityMap();
        const tileMask = resolveFogTileMask(fogMaskOptions, {
            layout,
            state: this.state,
            overworld: this.overworld.hexes,
            combat: this.combat?.territory,
            visibility: tileVisibility
        });
        this.fog.tileMask = tileMask;
        this.fog.visibility = tileVisibility;

        ctx.fillStyle = voidFill;
        ctx.fillRect(0, 0, this.viewport.width, this.viewport.height);
        if (isVoidBaseline) return;

        const ambienceCloudsEnabled = this.shouldRenderAmbience(fogConfig);
        const legacyBackdropEnabled = fogConfig.legacyBackdropEnabled === true;
        // When ambience visuals are disabled, fall back to a simple void fill while keeping per-tile masks intact.
        const baseFillOnly = (!ambienceCloudsEnabled && fogConfig.baseFillOnlyWhenAmbienceDisabled !== false)
            || !legacyBackdropEnabled;

        const ambienceCenter = this.getTerritoryScreenCenter(layout);
        if (ambienceCloudsEnabled) {
            this.ensureAmbienceRendererReady(fogConfig);
            if (this.ambienceRenderer) {
                this.ambienceRenderer.render({ center: ambienceCenter });
            }
        }
        if (fogConfig.enabled === false || baseFillOnly || legacyBackdropEnabled === false) return;

        const center = ambienceCenter;
        const { parallaxSpeed, parallaxAmplitude } = resolveFogParallax(fogConfig);
        const drift = Math.sin(this.fog.time * parallaxSpeed) * parallaxAmplitude;
        const radius = Math.max(this.viewport.width, this.viewport.height) * 0.8;
        const innerRadius = Math.max(layout.size * 3, radius * 0.25);

        if (fogConfig.gradientEnabled !== false) {
            const fogGradient = ctx.createRadialGradient(
                center.x + drift,
                center.y - drift,
                innerRadius,
                center.x,
                center.y,
                radius
            );
            const innerOpacity = resolveFogInnerOpacity(fogConfig);
            const softenedCenterOpacity = tileMask ? Math.max(innerOpacity * 0.82, innerOpacity - 0.12) : innerOpacity;
            fogGradient.addColorStop(0, `rgba(${fogGradientStops.innerBase || '38, 40, 50'}, ${softenedCenterOpacity})`);
            fogGradient.addColorStop(0.48, fogGradientStops.mid || 'rgba(18, 20, 28, 0.82)');
            fogGradient.addColorStop(1, fogGradientStops.outer || 'rgba(4, 4, 8, 0.98)');
            ctx.fillStyle = fogGradient;
            ctx.fillRect(0, 0, this.viewport.width, this.viewport.height);
        }

        if (fogConfig.rippleEnabled !== false) {
            const rippleGradient = ctx.createRadialGradient(
                center.x - drift * 0.4,
                center.y + drift * 0.6,
                0,
                center.x - drift * 0.4,
                center.y + drift * 0.6,
                radius
            );
            rippleGradient.addColorStop(0, rippleGradientStops.inner || 'rgba(255,255,255,0.03)');
            rippleGradient.addColorStop(0.25, rippleGradientStops.mid || 'rgba(120,120,140,0.02)');
            rippleGradient.addColorStop(1, rippleGradientStops.outer || 'rgba(0,0,0,0)');
            const rippleOpacity = fogConfig.rippleOpacity;
            ctx.globalAlpha = rippleOpacity;
            ctx.fillStyle = rippleGradient;
            ctx.fillRect(0, 0, this.viewport.width, this.viewport.height);
            ctx.globalAlpha = 1.0;
        }

        if (fogConfig.clusterGlowEnabled !== false) {
            const clusters = this.collectExploredClusters(layout);
            clusters.forEach((cluster) => {
                const clusterRadius = Math.max(
                    layout.size * 3,
                    cluster.size * layout.size * (fogConfig.clusterRadiusMultiplier ?? 5)
                );
                const intensity = Math.min(0.78, (fogConfig.clusterIntensity ?? 0.32) * Math.log2(cluster.size + 1));
                const coreBrightness = Math.min(1, intensity + (fogConfig.clusterCoreBoost ?? 0.18));
                const spotlight = ctx.createRadialGradient(
                    cluster.center.x,
                    cluster.center.y,
                    0,
                    cluster.center.x,
                    cluster.center.y,
                    clusterRadius
                );
                spotlight.addColorStop(0, `rgba(${spotlightColors.innerBase || '180, 200, 230'}, ${coreBrightness})`);
                spotlight.addColorStop(0.6, spotlightColors.mid || 'rgba(80, 90, 120, 0.18)');
                spotlight.addColorStop(1, spotlightColors.outer || 'rgba(0, 0, 0, 0)');
                ctx.fillStyle = spotlight;
                ctx.fillRect(0, 0, this.viewport.width, this.viewport.height);
            });
        }

        if (tileMask?.mask) {
            const maskedOpacity = fogConfig.maskedFogOpacity ?? 0.82;
            const overlayAlpha = Math.min(1, maskedOpacity + (tileMask.frontierOnly ? 0.05 : 0));
            const maskKeys = Array.isArray(tileMask.mask)
                ? tileMask.mask
                : tileMask.mask instanceof Set
                    ? Array.from(tileMask.mask)
                    : tileMask.mask instanceof Map
                        ? Array.from(tileMask.mask.keys())
                        : [];

            ctx.save();
            ctx.globalAlpha = overlayAlpha;
            maskKeys.forEach((key) => {
                const hex = this.parseKey(key);
                const position = hex.toPixel(layout);
                const maskGradient = ctx.createRadialGradient(
                    position.x,
                    position.y,
                    layout.size * 0.35,
                    position.x,
                    position.y,
                    layout.size * 2.4
                );
                maskGradient.addColorStop(0, fogGradientStops.mid || 'rgba(18, 20, 28, 0.82)');
                maskGradient.addColorStop(1, fogGradientStops.outer || 'rgba(4, 4, 8, 0.98)');

                ctx.beginPath();
                for (let i = 0; i < 6; i += 1) {
                    const angle = (2 * Math.PI / 6) * (i + 0.5);
                    const x = position.x + layout.size * Math.cos(angle);
                    const y = position.y + layout.size * Math.sin(angle);
                    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
                ctx.closePath();
                ctx.fillStyle = maskGradient;
                ctx.fill();
            });
            ctx.restore();
        }
    },

    /**
     * Derive the average screen position for explored territory so the fog can
     * fade out from the current kingdom instead of the viewport center.
     * @param {Object} layout active hex layout
     * @returns {{x:number, y:number}} screen-space center of explored space
     */
    getTerritoryScreenCenter(layout) {
        const points = [];
        const maps = this.state === 'COMBAT' ? this.combat.territory : this.overworld.hexes;
        maps.forEach(data => {
            const hex = data.hex || data;
            points.push(hex.toPixel(layout));
        });
        if (!points.length) return { x: this.viewport.width / 2, y: this.viewport.height / 2 };

        const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
        return { x: sum.x / points.length, y: sum.y / points.length };
    },

    /**
     * Identify contiguous explored clusters so the fog can glow around player-owned
     * territory. Only player/neutral tiles are considered to avoid spotlighting hostile land.
     * @param {Object} layout active hex layout
     * @returns {Array<{center:{x:number,y:number}, size:number}>}
     */
    collectExploredClusters(layout) {
        const maps = this.state === 'COMBAT' ? this.combat.territory : this.overworld.hexes;
        const visited = new Set();
        const clusters = [];
        const eligible = (tile) => {
            if (!tile) return false;
            const owner = (tile.owner || 'player').toLowerCase();
            return owner !== 'enemy' && owner !== 'scorched';
        };

        maps.forEach((tile, key) => {
            if (visited.has(key) || !eligible(tile)) return;
            const queue = [key];
            const members = [];

            while (queue.length) {
                const currentKey = queue.shift();
                if (visited.has(currentKey)) continue;
                visited.add(currentKey);
                const current = maps.get(currentKey);
                if (!eligible(current)) continue;

                const currentHex = current.hex || current;
                members.push(currentHex);

                for (let i = 0; i < 6; i += 1) {
                    const neighbor = Hex.neighbor(currentHex, i);
                    const neighborKey = neighbor.toString();
                    if (!visited.has(neighborKey) && maps.has(neighborKey)) queue.push(neighborKey);
                }
            }

            if (members.length) {
                const sum = members.reduce((acc, hex) => {
                    const p = hex.toPixel(layout);
                    return { x: acc.x + p.x, y: acc.y + p.y };
                }, { x: 0, y: 0 });
                clusters.push({
                    center: { x: sum.x / members.length, y: sum.y / members.length },
                    size: members.length
                });
            }
        });

        return clusters;
    },
    
    drawHex(layout, hex, fill, stroke, label, sub) {
        const ctx = this.ctx;
        const p = hex.toPixel(layout);
        if(p.x<-50 || p.x>this.viewport.width+50 || p.y<-50 || p.y>this.viewport.height+50) return;
        const size = layout.size;
        ctx.beginPath();
        for(let i=0; i<6; i++) {
            const angle = 2*Math.PI/6*(i+0.5);
            const x = p.x + size * Math.cos(angle);
            const y = p.y + size * Math.sin(angle);
            if(i===0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = fill; ctx.fill();
        if(stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2*this.cam.zoom; ctx.stroke(); }
        if(label) {
            ctx.fillStyle = '#fff'; ctx.font = `${16*this.cam.zoom}px sans-serif`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(label, p.x, p.y);
        }
        if(sub) {
            ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = `${10*this.cam.zoom}px monospace`;
            ctx.fillText(sub, p.x, p.y + 14*this.cam.zoom);
        }
    }
};

applyUIBindings(Game, { Hex, Layout, TIPS });

window.Hex = Hex;
window.Game = Game;

Game.init();
});
