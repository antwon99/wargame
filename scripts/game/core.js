import {
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
    startWar
} from '../combatEngine.js';
import { armAmbientLoop as armAmbientLoopHelper, haltAmbientLoop as haltAmbientLoopHelper } from '../gameAudioHooks.js';
import { START_TICK, Timekeeper } from '../timekeeper.js';
import { buildTileVisibilityMap, TILE_VISIBILITY } from '../visibilityMask.js';
import { buildResearchStateSafe } from '../researchStateBuilder.mjs';
import { SNOW_VISUAL_CONFIG, resolveSnowVisualConfig } from '../snowVisualConfig.mjs';
import { buildDefaultSettings } from '../settings.js';
import '../researchSystem.js';
import { validateBootstrapDependencies } from '../bootstrapValidator.mjs';
import { createPersistenceService } from './persistence.js';
import {
    addOverworldHex as addOverworldHexHelper,
    applyOverworldSnapshot,
    bootstrapNewWorld as bootstrapNewWorldHelper,
    calcOverworldGhosts as calcOverworldGhostsHelper,
    claimHexLogic as claimHexLogicHelper,
    drawOverworld as drawOverworldHelper,
    drawTileVisibilityMask as drawTileVisibilityMaskHelper,
    enterReclamationTargetingState as enterReclamationTargetingStateHelper,
    finalizeStarterTerritory as finalizeStarterTerritoryHelper,
    hasFieldToConvert as hasFieldToConvertHelper,
    nextQueuedReclamationCost as nextQueuedReclamationCostHelper,
    nextQueuedReclamationType as nextQueuedReclamationTypeHelper,
    queueLandReclamation as queueLandReclamationHelper,
    refreshClusterBonuses as refreshClusterBonusesHelper,
    shouldShowClaimCostLabels as shouldShowClaimCostLabelsHelper,
    setReclamationPrompt as setReclamationPromptHelper,
    syncReclamationAwaitState as syncReclamationAwaitStateHelper,
    updateOverworld as updateOverworldHelper,
    updateReclamationPromptFromQueue as updateReclamationPromptFromQueueHelper,
    applyQueuedReclamationToTile as applyQueuedReclamationToTileHelper
} from './overworld.js';
import {
    drawCombatScene,
    stepCombatFx,
    stepCombatParticles,
    updateCombatFrame
} from './combat.js';
import {
    CAMERA_MOTION_CONFIG,
    buildCameraState,
    buildCombatState,
    buildCoreResourceState,
    buildFeatureToggles,
    buildOverworldState,
    buildSnowState,
    buildTimekeeperConfig,
    createHexFactory,
    createHexLayout
} from './state.js';
import { composeGameSettings, resolveSnowDebugSnapshot as resolveSnowSnapshot, setSnowToggle as setSnowToggleHelper } from './settings.js';
import AudioBridge from '../../audio/bridge.js';
import { init as initAudioDebugPanel } from '../../audio/debugPanel.js';
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
    const visibilityBuilder = overrides.buildTileVisibilityMap || buildTileVisibilityMap;
    const snowDefaults = overrides.SNOW_VISUAL_CONFIG || SNOW_VISUAL_CONFIG;
    const snowConfigResolver = overrides.resolveSnowVisualConfig || resolveSnowVisualConfig;
    const bootstrapValidator = overrides.validateBootstrapDependencies || validateBootstrapDependencies;
    const researchStateBuilder = overrides.buildResearchStateSafe || buildResearchStateSafe;
    const persistenceModule = Object.prototype.hasOwnProperty.call(overrides, 'persistence')
        ? overrides.persistence
        : Persistence;

    /** ENGINE */
    const hasWindow = typeof window !== 'undefined';
    const sqrt3 = typeof overrides.sqrt3 === 'number'
        ? overrides.sqrt3
        : (hasWindow && window.InputHelpers && window.InputHelpers.SQRT3) || Math.sqrt(3);

    const resourceBuilder = overrides.buildCoreResourceState || buildCoreResourceState;
    const overworldBuilder = overrides.buildOverworldState || buildOverworldState;
    const combatBuilder = overrides.buildCombatState || buildCombatState;
    const snowBuilder = overrides.buildSnowState || buildSnowState;
    const cameraStateBuilder = overrides.buildCameraState || buildCameraState;
    const featureToggleBuilder = overrides.buildFeatureToggles || buildFeatureToggles;
    const timekeeperConfigBuilder = overrides.buildTimekeeperConfig || buildTimekeeperConfig;

    const Hex = overrides.Hex || createHexFactory(sqrt3);
    const layoutOverride = overrides.Layout || (hasWindow && window.InputHelpers && window.InputHelpers.Layout);
    const Layout = layoutOverride || createHexLayout(sqrt3);
    const featureToggles = featureToggleBuilder({
        snowDefaults: snowDefaults,
        cameraDefaults: CAMERA_MOTION_CONFIG
    });
    const baseResources = resourceBuilder({
        imperialFavor: DEFAULT_IMPERIAL_FAVOR,
        clusterBaseRate: DEFAULT_CLUSTER_RATE,
        fallbackStats: FALLBACK_STATS,
        activeSaveSlot: overrides.activeSaveSlot || '1'
    });
    const overworldState = overworldBuilder();
    const combatState = combatBuilder();
    const snowState = snowBuilder();
    const cameraState = cameraStateBuilder();
    const timekeeperConfig = overrides.timekeeperConfig || timekeeperConfigBuilder();
    const persistenceService = overrides.persistenceService || createPersistenceService({
        persistence: persistenceModule,
        fallbackStats: FALLBACK_STATS,
        hexFactory: (q, r, s) => new Hex(q, r, s)
    });

    const Platform = (hasWindow && window.PlatformAdapter && window.PlatformAdapter.detectPlatformProfile)
        ? window.PlatformAdapter
        : {
            detectPlatformProfile: () => ({
                isMobile: false,
                viewportWidth: hasWindow ? window.innerWidth : 0,
                viewportHeight: hasWindow ? window.innerHeight : 0,
                deviceScale: hasWindow && window.devicePixelRatio ? window.devicePixelRatio : 1,
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
    canvas: null,
    ctx: null,
    fxLayer: null,

    state: 'OVERWORLD',
    paused: false,
    ...baseResources,
    Hex,
    Layout,
    deviceProfile: Platform.detectPlatformProfile(),
    viewport: { width: hasWindow ? window.innerWidth : 0, height: hasWindow ? window.innerHeight : 0 },
    shakeTimer: null,
    ambientLoopStarted: false,
    pendingClearTile: null,
    hoveredClaimableKey: null,
    selectedOverworldTile: null,
    pendingReclamations: [],
    awaitingReclamationTarget: false,
    shouldRunImperialIntro: false, // Flagged when a fresh campaign needs to play the decree after BEGIN

    imperialMandates: ImperialMandates,
    imperialMandateManager: ImperialMandateManager,
    timekeeper: new Timekeeper(timekeeperConfig),
    researchSystemRef: ResearchSystem,

    overworld: overworldState,
    snow: snowState,
    featureToggles,
    settingsStorageKey: 'wargame:player-settings',
    settingsService: null,
    playerSettings: null,
    ...cameraState,
    persistenceService,
    persistenceAvailable: persistenceService.isAvailable(),
    combat: combatState,

    init({ introOverlay = (typeof window !== 'undefined' ? window.IntroOverlay : null), loadSnapshot, onHUDUpdate, onSaveSlotsUpdate, onPostInit } = {}) {
        const docAvailable = typeof document !== 'undefined';
        if (docAvailable) {
            this.canvas = this.canvas || document.getElementById('canvas');
            if (!this.ctx && this.canvas?.getContext) this.ctx = this.canvas.getContext('2d');
            this.fxLayer = this.fxLayer || document.getElementById('fx-layer');
            this.viewport = {
                width: typeof window !== 'undefined' ? window.innerWidth : this.viewport?.width || 0,
                height: typeof window !== 'undefined' ? window.innerHeight : this.viewport?.height || 0
            };
        }
        try {
            if (introOverlay?.init) introOverlay.init(document);
            this.dependencyHealth = bootstrapValidator({
                researchSystem: this.researchSystemRef,
                persistence: persistenceService,
                inputHelpers: typeof window !== 'undefined' ? window.InputHelpers : null,
                canvas: this.canvas,
                ctx: this.ctx,
                debugEl: typeof document !== 'undefined' ? document.getElementById('debug-log') : null
            });
            this.persistenceAvailable = this.dependencyHealth.persistenceAvailable && persistenceService.isAvailable();
            this.applyFeatureOverrides();
            const settingsStorage = this.persistenceAvailable && typeof window !== 'undefined' ? window.localStorage : null;
            if (!this.settingsService) {
                const { settingsService, settingsSnapshot } = composeGameSettings(this, {
                    storageKey: this.settingsStorageKey,
                    storage: settingsStorage
                });
                this.settingsService = settingsService;
                this.playerSettings = settingsSnapshot;
            } else if (this.settingsService?.getSnapshot) {
                this.playerSettings = this.settingsService.getSnapshot();
            } else {
                this.playerSettings = this.playerSettings || this.defaultPlayerSettings();
            }
            if (this.settingsService?.applyAudio && this.playerSettings?.audio) {
                this.settingsService.applyAudio(this.playerSettings.audio);
            }
            if (this.settingsService?.applyVisual && this.playerSettings?.visuals) {
                this.settingsService.applyVisual(this.playerSettings.visuals);
            }
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
                : () => (this.dependencyHealth.persistenceAvailable
                    ? persistenceService.loadSnapshot(this.activeSaveSlot)
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
    armRenderLoop() { this.lastTime = performance.now(); },

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
        return setSnowToggleHelper(this, key, isEnabled);
    },

    /**
     * Gather the live snow toggle values so the audio debug overlay mirrors the
     * current runtime configuration without reaching into Game internals.
     * @returns {Object} snapshot of boolean snow toggles
     */
    resolveSnowDebugSnapshot() {
        return resolveSnowSnapshot(this);
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
    bootstrapNewWorld() { return bootstrapNewWorldHelper(this); },

    /** Apply a hydrated snapshot to the live game state (overworld only). */
    applySnapshot(snapshot) { return applyOverworldSnapshot(this, snapshot); },

    /** Persist the overworld snapshot and leaderboard stats to a chosen slot. */
    saveGame(slot = this.activeSaveSlot) {
        if (!this.persistenceAvailable || !this.persistenceService?.isAvailable?.()) {
            this.logBootstrapWarning('Save skipped: persistence helper unavailable in this environment.');
            return;
        }
        const targetSlot = String(slot || this.activeSaveSlot);
        const result = this.persistenceService.saveSnapshot(this, targetSlot);
        this.activeSaveSlot = result.slot;
        const formattedTime = new Date(result.savedAt).toLocaleString();
        this.updateSaveStatus(`Saved Slot ${this.activeSaveSlot} @ ${formattedTime}`);
        this.updateSaveSlotsUI();
        this.spawnTxt(new Hex(0,0), 'Progress Saved', '#9be3b4');
    },

    /** Load a stored snapshot and refresh UI with the saved overworld. */
    loadGame(slot = this.activeSaveSlot) {
        if (!this.persistenceAvailable || !this.persistenceService?.isAvailable?.()) {
            this.logBootstrapWarning('Load skipped: persistence helper unavailable in this environment.');
            return;
        }
        const targetSlot = String(slot || this.activeSaveSlot);
        const loaded = this.persistenceService.loadSnapshot(targetSlot);
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
        if (!this.persistenceAvailable || !this.persistenceService?.isAvailable?.()) {
            this.logBootstrapWarning('Reset skipped: persistence helper unavailable in this environment.');
            return;
        }
        const resetState = this.persistenceService.resetSnapshots();
        this.stats = { ...(resetState?.stats || FALLBACK_STATS) };
        this.activeSaveSlot = resetState?.slot || '1';
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
        this.persistenceService.replayNotifications(this);
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
        const researchSystem = this.researchSystemRef || ResearchSystem;
        return researchStateBuilder({
            researchSystem,
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
        const researchSystem = this.researchSystemRef || ResearchSystem;
        try {
            const pending = tech?.id === 'land-reclamation'
                ? Math.max(tech.pendingPlacements || 0, 0)
                : 0;
            const normalized = pending
                ? { ...tech, timesPurchased: (tech.timesPurchased || 0) + pending }
                : tech;
            return researchSystem.getCostForTech(normalized, optionId);
        } catch (error) {
            this.logBootstrapWarning?.('Failed to resolve tech cost', error);
            return null;
        }
    },

    /** Check if the player can pay a specific cost. */
    canPayCost(cost) {
        if (!cost) return false;
        const researchSystem = this.researchSystemRef || ResearchSystem;
        return researchSystem.isAffordable({ gold: this.gold, wood: this.wood }, cost);
    },

    /**
     * Attempt to purchase a technology and immediately apply its effect.
     * @param {string} techId identifier of the tech to buy.
     * @param {string} [optionId] optional option key (land reclamation).
     */
    buyTechnology(techId, optionId) {
        const researchSystem = this.researchSystemRef || ResearchSystem;
        const tech = this.getTech(techId);
        if (!tech || !researchSystem.hasRemainingPurchases(tech)) return;

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
        researchSystem.recordPurchase(tech);
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
    queueLandReclamation(targetType, cost = {}) { return queueLandReclamationHelper(this, targetType, cost); },

    /**
     * Peek at the next queued reclamation request to help the HUD surface guidance.
     * @returns {string|null} queued target type or null when none pending.
     */
    nextQueuedReclamationType() { return nextQueuedReclamationTypeHelper(this); },

    /**
     * Peek at the pending reclamation cost so HUD hints can reflect the owed gold.
     * @returns {object|null} queued cost reference.
     */
    nextQueuedReclamationCost() { return nextQueuedReclamationCostHelper(this); },

    /**
     * Convert a player-controlled field into the requested tile type, consuming the
     * oldest queued reclamation charge. Invalid or hostile targets surface HUD feedback
     * and leave the queue intact, while a fully exhausted map clears any pending state.
     * @param {object} tile overworld tile payload selected by the player.
     * @param {Hex} [fallbackHex] optional hex for error messaging when tile is missing.
     * @returns {boolean} true when a conversion occurred.
     */
    applyQueuedReclamationToTile(tile, fallbackHex) { return applyQueuedReclamationToTileHelper(this, tile, fallbackHex); },

    /** True when at least one field can be reclaimed. */
    hasFieldToConvert() { return hasFieldToConvertHelper(this); },

    /**
     * Set and broadcast the reclamation targeting state so the UI and click
     * handlers know a player decision is required for placement.
     * @returns {boolean} true when at least one reclamation charge remains.
     */
    syncReclamationAwaitState() { return syncReclamationAwaitStateHelper(this); },

    /**
     * Surface a HUD-level hint while queued reclamations await tile targeting.
     * @param {string} message user-facing guidance text; empty to hide.
     */
    setReclamationPrompt(message) { return setReclamationPromptHelper(this, message); },

    /**
     * Refresh the reclamation prompt text using the next queued cost/target for clarity.
     */
    updateReclamationPromptFromQueue() { return updateReclamationPromptFromQueueHelper(this); },

    /**
     * Collapse the research drawer, flag the awaiting state, and float a prompt
     * so the player knows to pick a target field immediately after purchase.
     */
    enterReclamationTargetingState() { return enterReclamationTargetingStateHelper(this); },

    /**
     * Rebuild the adjacency bonus cache for overworld income and UI consumers.
     * @returns {Map<string, object>} latest cluster bonus map keyed by hex key.
     */
    refreshClusterBonuses() { return refreshClusterBonusesHelper(this); },

    /**
     * Normalize starter tile ownership and rebuild the adjacency cache so the inspector
     * can reference fresh cluster data as soon as the campaign boots.
     * @returns {Map<string, object>} updated cluster bonus map keyed by hex key.
     */
    finalizeStarterTerritory() {
        return finalizeStarterTerritoryHelper(this);
    },

    getUnitStats(type) { return getUnitStats(this, type); },

    getBuildingStats(type, owner) { return getBuildingStats(this, type, owner); },

    getSpawnRate(baseRate) { return getSpawnRate(this, baseRate); },

    getIncomeMulti() {
        return 1 + ((this.upgrades.mines - 1) * 0.2);
    },

    updateOverworld(dt) { return updateOverworldHelper(this, dt); },

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

    updateCombat(dt) { return updateCombatFrame(this, dt); },
    stepCombatFx(dt) { return stepCombatFx(this, dt); },
    stepCombatParticles(dt) { return stepCombatParticles(this, dt); },

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

    claimHexLogic(hex, free) { return claimHexLogicHelper(this, hex, free); },
    /**
     * Track a claimed overworld hex with configurable ownership and metadata for hostile discoveries.
     * @param {object} hex axial coordinate of the tile.
     * @param {string} type tile terrain identifier.
     * @param {string} [owner='player'] controlling faction key.
     * @param {object} [extras={}] optional additional properties to merge onto the tile payload.
     * @returns {object} the stored tile record.
     */
    addOverworldHex(hex, type, owner = 'player', extras = {}) { return addOverworldHexHelper(this, hex, type, owner, extras); },
    calcOverworldGhosts() { return calcOverworldGhostsHelper(this); },
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

    drawCombat(layout) { return drawCombatScene(this, layout); },

    /**
     * Determine whether debug overlays should stamp claim costs onto frontier tiles.
     * Defaults to off for normal play, but can be enabled via feature toggles or
     * the global DebugToggles hook for development sessions.
     * @returns {boolean} true when claim cost labels should render.
     */
    shouldShowClaimCostLabels() { return shouldShowClaimCostLabelsHelper(this); },

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

    drawOverworld(layout) { return drawOverworldHelper(this, layout); },

    /**
     * Shade a single hex according to its visibility state. Unseen tiles receive
     * an opaque mask, discovered-but-not-visible tiles get a desaturated dimmer,
     * and visible tiles bypass the mask entirely so the base art shows through.
     *
     * @param {Hex} hex tile coordinate being rendered.
     * @param {Object} tile raw tile payload from map iteration.
     * @param {string} visibility normalized tile visibility label.
     */
    drawTileVisibilityMask(hex, tile, visibility) { return drawTileVisibilityMaskHelper(this, hex, tile, visibility); },

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

export {
    CAMERA_MOTION_CONFIG,
    buildCameraState,
    buildCombatState,
    buildCoreResourceState,
    buildFeatureToggles,
    buildOverworldState,
    buildSnowState,
    buildTimekeeperConfig,
    createHexFactory,
    createHexLayout
} from './state.js';
