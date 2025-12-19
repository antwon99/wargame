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
} from '../combatEngine.js';
import { armAmbientLoop as armAmbientLoopHelper, haltAmbientLoop as haltAmbientLoopHelper } from '../gameAudioHooks.js';
import { START_TICK, Timekeeper } from '../timekeeper.js';
import { OVERWORLD_TILES } from '../overworldConfig.js';
import { drawOverworldTiles } from '../overworldRenderer.js';
import { advanceOverworldTimer } from '../overworldTicks.js';
import { buildClusterBonusMap, DEFAULT_CLUSTER_RATE } from '../overworldAdjacency.js';
import { buildWaterBody, stampWaterBody } from '../waterGenerator.js';
import { buildTileVisibilityMap, TILE_VISIBILITY } from '../visibilityMask.js';
import { buildResearchStateSafe } from '../researchStateBuilder.mjs';
import { SNOW_VISUAL_CONFIG, resolveSnowVisualConfig } from '../snowVisualConfig.mjs';
import { buildDefaultSettings, createSettingsService } from '../settings.js';
import '../researchSystem.js';
import { validateBootstrapDependencies } from '../bootstrapValidator.mjs';
import AudioBridge from '../../audio/bridge.js';
import { init as initAudioDebugPanel, update as updateAudioDebugPanel } from '../../audio/debugPanel.js';
import { DEFAULT_IMPERIAL_FAVOR, clampImperialFavor } from '../imperialFavor.js';
const RebelSystem = (typeof window !== 'undefined' && window.RebelSystem) ? window.RebelSystem : null;
const ImperialMandates = (typeof window !== 'undefined' && window.ImperialMandates) ? window.ImperialMandates : null;
const ImperialMandateManager = (typeof window !== 'undefined' && window.ImperialMandateManager)
    ? window.ImperialMandateManager
    : (typeof require === 'function' ? require('../imperialMandateManager.js') : null);
// Cache the research system once so the Game bootstrap never throws on missing globals.
const ResearchSystem = (typeof window !== 'undefined' && window.ResearchSystem)
    ? window.ResearchSystem
    : (typeof require === 'function' ? require('../researchSystem.js') : null);
// Persistence is optional in headless test environments; load defensively so init can proceed without saves.
const Persistence = (typeof window !== 'undefined' && window.Persistence)
    ? window.Persistence
    : (typeof require === 'function' ? require('../persistence.js') : null);
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

/**
 * Build a fresh Game core instance without binding UI or persistence wiring.
 * @returns {{Game: Object, Hex: typeof Hex, Layout: Object, TIPS: string[]}}
 */
export function createGameCore(overrides = {}) {
    const clusterBuilder = overrides.buildClusterBonusMap || buildClusterBonusMap;
    const visibilityBuilder = overrides.buildTileVisibilityMap || buildTileVisibilityMap;
    const snowDefaults = overrides.SNOW_VISUAL_CONFIG || SNOW_VISUAL_CONFIG;
    const snowConfigResolver = overrides.resolveSnowVisualConfig || resolveSnowVisualConfig;
    const bootstrapValidator = overrides.validateBootstrapDependencies || validateBootstrapDependencies;
    const researchStateBuilder = overrides.buildResearchStateSafe || buildResearchStateSafe;
    const persistenceModule = Object.prototype.hasOwnProperty.call(overrides, 'persistence')
        ? overrides.persistence
        : Persistence;

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

const CAMERA_MOTION_CONFIG = {
    enabled: true,
    amplitude: 9,
    parallax: 0.65,
    speed: 0.18
};

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
    pendingClearTile: null,
    hoveredClaimableKey: null,
    selectedOverworldTile: null,
    pendingReclamations: [],
    awaitingReclamationTarget: false,
    shouldRunImperialIntro: false, // Flagged when a fresh campaign needs to play the decree after BEGIN

    imperialMandates: ImperialMandates,
    timekeeper: new Timekeeper({ startTick: START_TICK }),

    overworld: { hexes: new Map(), claimable: new Map(), timer: 0, tickRate: 3.5, clusterBonuses: new Map() },
    snow: { time: 0 },
    featureToggles: {
        snow: { ...snowDefaults },
        camera: { ...CAMERA_MOTION_CONFIG },
        overworld: { showClaimCosts: false }
    },
    settingsStorageKey: 'wargame:player-settings',
    settingsService: null,
    playerSettings: null,
    camBase: { x: 0, y: 0 },
    camDrift: { time: 0 },
    persistenceAvailable: true,
    combat: {
        territory: new Map(), slots: new Map(), buildings: new Map(), units: [], particles: [], fx: [],
        ai: { timer: 0, nextMove: 3.0, gold: 300 },
        castles: { player: null, enemy: null }
    },

    init({ introOverlay = (typeof window !== 'undefined' ? window.IntroOverlay : null), loadSnapshot, onHUDUpdate, onSaveSlotsUpdate, onPostInit } = {}) {
        try {
            if (introOverlay?.init) introOverlay.init(document);
            this.dependencyHealth = bootstrapValidator({
                researchSystem: ResearchSystem,
                persistence: persistenceModule,
                inputHelpers: typeof window !== 'undefined' ? window.InputHelpers : null,
                canvas: this.canvas,
                ctx: this.ctx,
                debugEl: typeof document !== 'undefined' ? document.getElementById('debug-log') : null
            });
            this.persistenceAvailable = this.dependencyHealth.persistenceAvailable;
            this.applyFeatureOverrides();
            const settingsStorage = this.persistenceAvailable && typeof window !== 'undefined' ? window.localStorage : null;
            this.settingsService = createSettingsService({
                storageKey: this.settingsStorageKey,
                storage: settingsStorage,
                defaults: this.defaultPlayerSettings(),
                audioAdapter: (audio) => {
                    const normalized = this.applyAudioSettings(audio);
                    this.playerSettings = { ...(this.playerSettings || {}), audio: normalized };
                },
                visualAdapter: (visuals) => {
                    this.applyVisualSettings(visuals);
                    this.playerSettings = { ...(this.playerSettings || {}), visuals };
                },
                onError: (context, error) => this.reportRecoverableError?.(context, error)
            });
            this.settingsService.on('change', (settings) => {
                this.playerSettings = settings;
                this.updateSettingsUI?.();
            });
            const resolvedSettings = this.settingsService.load();
            this.settingsService.applyAudio(resolvedSettings.audio);
            this.settingsService.applyVisual(resolvedSettings.visuals);
            const refreshHUD = typeof onHUDUpdate === 'function'
                ? () => onHUDUpdate(this)
                : () => this.updateHUD();
            this.timekeeper.onChange(refreshHUD);
            this.resize();
            initAudioDebugPanel({
                resolveSnowSnapshot: () => this.resolveSnowDebugSnapshot(),
                setSnowToggle: (key, isEnabled) => this.setSnowToggle(key, isEnabled)
            });
            this.bindVoidClickEasterEgg();
            window.addEventListener('resize', () => this.resize());
            if (typeof this.setupInput === 'function') this.setupInput();
            this.resetSession();

            window.addEventListener('intro:begin', () => {
                if (!this.shouldRunImperialIntro) return;
                this.issueImperialIntroMandate();
                this.shouldRunImperialIntro = false;
            });

            if (!this.dependencyHealth.persistenceAvailable) {
                this.logBootstrapWarning('Persistence unavailable; skipping save hydration and disabling save slots.');
            }

            const resolveSnapshot = typeof loadSnapshot === 'function'
                ? loadSnapshot
                : () => (this.dependencyHealth.persistenceAvailable && persistenceModule
                    ? persistenceModule.loadSnapshot(
                        this.activeSaveSlot,
                        { hexFactory: (q, r, s) => new Hex(q, r, s) }
                    )
                    : { state: null, stats: { ...this.stats }, slot: this.activeSaveSlot });
            const loaded = resolveSnapshot({ activeSaveSlot: this.activeSaveSlot, Hex });
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

            refreshHUD();
            this.updateUpgradeMenu();
            this.updateResearchUI();
            this.updateLeaderboardUI();
            if (this.dependencyHealth.persistenceAvailable) {
                const refreshSaveSlots = typeof onSaveSlotsUpdate === 'function'
                    ? () => onSaveSlotsUpdate(this)
                    : () => this.updateSaveSlotsUI();
                refreshSaveSlots();
            }
            if (this.updateTileInspector) this.updateTileInspector(null);
            if (typeof onPostInit === 'function') onPostInit(this);

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
     * Kick off the animation frame loop so rendering and snow overlays stay alive
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
     * Defaults mirror the snow/audio baselines so sliders start aligned with
     * the current build's expected presentation.
     * @returns {Object} default settings snapshot
     */
    defaultPlayerSettings() {
        return buildDefaultSettings();
    },

    /**
     * Load persisted slider/toggle preferences from localStorage while
     * tolerating environments without storage (tests/headless sessions).
     * @returns {Object} merged player settings
     */
    loadPlayerSettings() {
        if (!this.settingsService) return this.defaultPlayerSettings();
        return this.settingsService.load();
    },

    /** Persist the current settings bundle to localStorage when available. */
    persistPlayerSettings(settings = this.playerSettings) {
        if (!this.settingsService) return settings || this.defaultPlayerSettings();
        return this.settingsService.save(settings);
    },

    /**
     * Apply player-facing audio + visual settings, propagate them to the
     * runtime systems, and refresh the sidebar UI for the new values.
     * @param {Object} settings partial settings payload
     * @returns {Object} normalized settings that were applied
     */
    applyPlayerSettings(settings = {}) {
        const defaults = this.settingsService?.defaults || this.defaultPlayerSettings();
        const merged = {
            audio: { ...defaults.audio, ...(settings.audio || {}) },
            visuals: { ...defaults.visuals, ...(settings.visuals || {}) }
        };
        if (!this.settingsService) {
            this.playerSettings = merged;
            this.applyAudioSettings(merged.audio);
            this.applyVisualSettings(merged.visuals);
            return merged;
        }
        this.settingsService.applyAudio(merged.audio);
        this.settingsService.applyVisual(merged.visuals);
        return this.settingsService.getSnapshot();
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
        return { ...safe, master: clamp01(safe.master), music: clamp01(safe.music), sfx: clamp01(safe.sfx) };
    },

    /** Return the currently active audio settings (merged with defaults). */
    getAudioSettings() {
        if (this.settingsService?.getSnapshot) return this.settingsService.getSnapshot().audio;
        const defaults = this.defaultPlayerSettings().audio;
        return { ...defaults, ...(this.playerSettings?.audio || {}) };
    },

    /** Normalize visual toggle preferences against the live snow feature toggles. */
    getVisualSettings() {
        if (this.settingsService?.getSnapshot) return this.settingsService.getSnapshot().visuals;
        const snow = this.featureToggles?.snow || {};
        return {
            snowEnabled: snow.enabled !== false,
            snowfallEnabled: snow.snowfallEnabled !== false
        };
    },

    /**
     * Push visual toggle preferences into the snow feature toggles and cache
     * them for persistence.
     * @param {Object} visualSettings snow preferences
     * @returns {Object} resulting snow toggle collection
     */
    applyVisualSettings(visualSettings = this.defaultPlayerSettings().visuals) {
        const defaults = this.defaultPlayerSettings().visuals;
        const safe = { ...defaults, ...(visualSettings || {}) };
        const snowToggles = this.featureToggles?.snow || { ...snowDefaults };
        const nextSnow = {
            ...snowToggles,
            enabled: safe.snowEnabled !== false,
            snowfallEnabled: safe.snowfallEnabled !== false
        };
        this.featureToggles = { ...this.featureToggles, snow: nextSnow };
        return nextSnow;
    },

    /** Update an individual mixer channel from the settings sidebar. */
    setAudioVolume(channel, value) {
        if (this.settingsService) {
            return this.settingsService.applyAudio({ [channel]: clamp01(value, this.defaultPlayerSettings().audio[channel]) });
        }
        const current = this.getAudioSettings();
        if (!(channel in current)) return current;
        const next = { ...current, [channel]: clamp01(value, current[channel]) };
        this.applyAudioSettings(next);
        return next;
    },

    /**
     * Allow tests to override visual + camera defaults without mutating the
     * core constants. Overrides must be supplied explicitly so runtime defaults
     * stay aligned with the shared configs instead of transient diagnostics.
     */
    applyFeatureOverrides(overrides = {}) {
        const snowOverrides = overrides.snow || {};
        const cameraOverrides = overrides.camera || {};
        const overworldOverrides = overrides.overworld || {};
        const resolvedSnow = snowConfigResolver({ ...snowDefaults, ...snowOverrides });
        this.featureToggles = {
            snow: resolvedSnow,
            camera: { ...CAMERA_MOTION_CONFIG, ...cameraOverrides },
            overworld: { showClaimCosts: false, ...overworldOverrides }
        };
    },

    /**
     * Flip debug-only snow feature toggles without exposing globals.
     * @param {string} key snow toggle key to update (snowEnabled|snowfallEnabled)
     * @param {boolean} isEnabled desired state for the toggle
     * @returns {Object} resulting snow toggle collection
     */
    setSnowToggle(key, isEnabled) {
        const supportedSnowToggles = new Set(['snowEnabled', 'snowfallEnabled']);
        if (!supportedSnowToggles.has(key)) return this.featureToggles?.snow || { ...snowDefaults };

        const snowToggles = this.featureToggles?.snow || { ...snowDefaults };
        const nextSnow = { ...snowToggles, [key]: Boolean(isEnabled) };
        this.featureToggles = { ...this.featureToggles, snow: nextSnow };
        if (this.settingsService) {
            this.settingsService.applyVisual({ [key]: Boolean(isEnabled) });
            return this.featureToggles?.snow || nextSnow;
        }
        return nextSnow;
    },

    /**
     * Gather the live snow toggle values so the audio debug overlay mirrors the
     * current runtime configuration without reaching into Game internals.
     * @returns {Object} snapshot of boolean snow toggles
     */
    resolveSnowDebugSnapshot() {
        const snowToggles = this.featureToggles?.snow || {};
        return {
            snowEnabled: snowToggles.enabled !== false,
            snowfallEnabled: snowToggles.snowfallEnabled !== false
        };
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

    },

    /** Start or swap the peaceful ambiance conductor playlist. */
    armAmbientLoop() {
        if (this.ambientLoopStarted) return;
        this.ambientLoopStarted = true;
        armAmbientLoopHelper();
    },

    /** Stop ambiance when entering combat. */
    haltAmbientLoop() {
        haltAmbientLoopHelper();
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
        if (!this.persistenceAvailable || !persistenceModule) {
            this.logBootstrapWarning('Save skipped: persistence helper unavailable in this environment.');
            return;
        }
        const targetSlot = String(slot || this.activeSaveSlot);
        const result = persistenceModule.saveSnapshot(this, targetSlot);
        this.activeSaveSlot = result.slot;
        const formattedTime = new Date(result.savedAt).toLocaleString();
        this.updateSaveStatus(`Saved Slot ${this.activeSaveSlot} @ ${formattedTime}`);
        this.updateSaveSlotsUI();
        this.spawnTxt(new Hex(0,0), 'Progress Saved', '#9be3b4');
    },

    /** Load a stored snapshot and refresh UI with the saved overworld. */
    loadGame(slot = this.activeSaveSlot) {
        if (!this.persistenceAvailable || !persistenceModule) {
            this.logBootstrapWarning('Load skipped: persistence helper unavailable in this environment.');
            return;
        }
        const targetSlot = String(slot || this.activeSaveSlot);
        const loaded = persistenceModule.loadSnapshot(targetSlot, { hexFactory: (q, r, s) => new Hex(q, r, s) });
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
        if (!this.persistenceAvailable || !persistenceModule) {
            this.logBootstrapWarning('Reset skipped: persistence helper unavailable in this environment.');
            return;
        }
        persistenceModule.clearSnapshot();
        this.stats = { ...(persistenceModule.DEFAULT_STATS || FALLBACK_STATS) };
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
            this.ctx.globalAlpha = 1.0;
            this.snow.time = (this.snow.time || 0) + dt;
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
            updateAudioDebugPanel(dt, this.state);
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
        return researchStateBuilder({
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
        const bonuses = clusterBuilder(this.overworld?.hexes, { baseRate, reclamationRate });
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
        // Keep rebel discoveries rarer than towns (~18%) but slightly above mines/shrines/ruins.
        const rebelSpawnChance = free ? 0 : 0.10 + (Math.random() * 0.05);
        const shouldSpawnRebels = !free && Math.random() < rebelSpawnChance;

        if (shouldSpawnRebels) {
            const rebelTile = this.addOverworldHex(hex, 'rebelcamp', 'rebel', { prevType: 'field', isRebelCamp: true });
            this.spawnTxt(hex, '🏴 REBEL CAMP!', '#f55');
            if (typeof this.playSound === 'function') this.playSound('alert');
            this.refreshClusterBonuses();
            return rebelTile;
        }

        const weighted = [
            { type: 'field', weight: 40 },
            { type: 'forest', weight: 28 },
            { type: 'town', weight: 16 },
            { type: 'mine', weight: 5 },
            { type: 'shrine', weight: 2 },
            { type: 'ruin', weight: 1 },
            { type: 'water', weight: 8 }
        ];
        const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0);
        let pick = Math.random() * totalWeight;
        let type = 'field';
        for (const entry of weighted) {
            if (pick < entry.weight) { type = entry.type; break; }
            pick -= entry.weight;
        }

        const def = OVERWORLD_TILES[type.toUpperCase()];
        const extras = type === 'water' ? { isWater: true } : {};
        this.addOverworldHex(hex, type, 'player', extras);

        if (type === 'water') {
            const body = buildWaterBody(hex, { rng: Math.random });
            const stamped = stampWaterBody(this, hex, body, { owner: 'player' });
            const totalWater = (stamped?.length || 0) + 1;
            if (!free) {
                const headline = def?.char ? `${def.char} WATER!` : 'WATER!';
                this.spawnTxt(hex, headline, '#74c0fc');
                if (totalWater > 1) this.spawnTxt(hex, `+${totalWater - 1} hex water body`, '#74c0fc');
            }
        } else if (!free) {
            const label = def?.char ? `${def.char} ${type.toUpperCase()}!` : `${type.toUpperCase()}!`;
            this.spawnTxt(hex, label, '#fff');
            if (type === 'town') this.playSound('city');
            else if (type === 'forest') this.playSound('choptree');
            else if (type === 'mine') this.playSound('gold');
            else if (type === 'shrine') this.playSound('holy');
        }

        if (def?.onClaim && !free) def.onClaim(this, hex);
        if (!free) this.refreshClusterBonuses();
        return def;
    },
    /**
     * Track a claimed overworld hex with configurable ownership and metadata for hostile discoveries.
     * @param {object} hex axial coordinate of the tile.
     * @param {string} type tile terrain identifier.
     * @param {string} [owner='player'] controlling faction key.
     * @param {object} [extras={}] optional additional properties to merge onto the tile payload.
     * @returns {object} the stored tile record.
     */
    addOverworldHex(hex, type, owner = 'player', extras = {}) {
        const record = { hex, type, owner, ...extras };
        this.overworld.hexes.set(hex.toString(), record);
        return record;
    },
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
        this.renderSnowOverlay(layout);
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
            else if(t.owner === 'neutral' || !t.owner) fill = '#4a525e';

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
     * Decide whether combat tiles should inherit visibility masks. Snow overlays
     * apply in winter months (October–March) when snow visuals are enabled.
     *
     * @param {Date} [currentDate=new Date()] optional date override for tests.
     * @returns {boolean} true when combat rendering should apply seasonal masks.
     */
    shouldApplyCombatSnow(currentDate = new Date()) {
        if (this.state !== 'COMBAT') return false;
        const snowConfig = this.snow?.visualConfig || this.resolveSnowConfig(currentDate);
        return snowConfig.enabled !== false;
    },

    /**
     * Build a normalized visibility map spanning overworld/frontier and combat
     * territories. Stored on the snow namespace so tile overlays and masks can
     * share the same resolution each frame.
     * @returns {Map<string, string>} keyed visibility states (unseen|seen|visible).
     */
    getTileVisibilityMap() {
        const isCombat = this.state === 'COMBAT';
        const combatTerritory = this.shouldApplyCombatSnow() ? this.combat?.territory : null;
        const visibility = visibilityBuilder({
            state: this.state,
            overworld: isCombat ? null : this.overworld?.hexes,
            claimable: isCombat ? null : this.overworld?.claimable,
            combat: isCombat ? combatTerritory : null
        });
        this.snow.visibility = visibility;
        return visibility;
    },

    /**
     * Translate the in-game calendar into a Date so snow season resolution
     * respects the campaign start month (April) instead of the player's real
     * world clock.
     *
     * @param {object} [calendarOverride] optional calendar snapshot.
     * @returns {Date} synthetic date aligned to the current in-game month/day.
     */
    resolveSnowDate(calendarOverride) {
        const calendar = calendarOverride || this.timekeeper?.getCalendar?.();
        if (!calendar) return new Date();

        const monthIndex = Math.max(0, (calendar.month || 1) - 1) % 12;
        const day = Math.max(1, Math.min(calendar.dayOfMonth || 1, calendar.daysPerMonth || 28));
        const year = Math.max(1, calendar.year || 1);
        return new Date(Date.UTC(2000 + year - 1, monthIndex, day));
    },

    /**
     * Resolve and cache the active snow visual configuration for the current frame.
     * Consumers can read from `this.snow.visualConfig` without re-normalizing.
     *
     * @param {Date} [currentDate=this.resolveSnowDate()] optional date override for tests.
     * @returns {Object} normalized snow configuration derived from feature toggles.
     */
    resolveSnowConfig(currentDate = this.resolveSnowDate()) {
        const config = snowConfigResolver({ ...this.featureToggles?.snow, currentDate });
        this.snow.visualConfig = config;
        return config;
    },

    drawOverworld(layout) {
        const tileVisibility = this.snow?.visibility instanceof Map
            ? this.snow.visibility
            : this.getTileVisibilityMap();
        this.snow.hexLayout = layout;
        drawOverworldTiles(this.overworld, {
            layout,
            drawHex: (...args) => this.drawHex(...args),
            parseKey: (key) => this.parseKey(key),
            drawTileOverlay: (hex, tile, visibility) => this.drawTileVisibilityMask(hex, tile, visibility),
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
    drawTileVisibilityMask(hex, tile, visibility) {
        const layout = this.snow?.hexLayout;
        if (!layout || !hex || typeof hex.toPixel !== 'function') return;

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
     * Resolve the visibility state for a given hex or tile key. Defaults to
     * visible when no map entry exists to keep rendering predictable.
     *
     * @param {Hex|string} hex hex coordinate or string key.
     * @returns {string} visibility label (unseen|seen|visible).
     */
    resolveHexVisibility(hex) {
        const key = typeof hex === 'string' ? hex : hex?.toString?.();
        if (!key || !(this.snow?.visibility instanceof Map)) return TILE_VISIBILITY.VISIBLE;
        return this.snow.visibility.get(key) || TILE_VISIBILITY.VISIBLE;
    },

    /**
     * Paint the snow backdrop and seasonal wash. The canvas is always cleared
     * before drawing tiles so the overlay sits beneath gameplay visuals.
     *
     * @param {Object} layout active hex layout (origin + size)
     * @param {Object} [options] optional overlay hooks
     * @param {Date} [options.currentDate] optional date override for testing.
     */
    renderSnowOverlay(layout, options = {}) {
        const ctx = this.ctx;
        const snowConfig = this.resolveSnowConfig(options.currentDate || this.resolveSnowDate());
        const tileVisibility = this.getTileVisibilityMap();
        this.snow.visibility = tileVisibility;
        this.snow.hexLayout = layout;

        ctx.fillStyle = '#0b0b11';
        ctx.fillRect(0, 0, this.viewport.width, this.viewport.height);
        const intensity = Math.min(1, Math.max(0, snowConfig.coverage));
        if (!snowConfig.enabled || intensity <= 0) return;

        const opacity = Math.max(0, Math.min(1, intensity * snowConfig.maxOpacity));
        if (opacity <= 0) return;

        ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
        ctx.fillRect(0, 0, this.viewport.width, this.viewport.height);
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

    return { Game, Hex, Layout, TIPS };
}
