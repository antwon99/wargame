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
import { armAmbientLoop as armAmbientLoopHelper, haltAmbientLoop as haltAmbientLoopHelper } from './gameAudioHooks.js';
import { applyUIBindings, setupUIBindings } from './uiBindings.js';
const RebelSystem = (typeof window !== 'undefined' && window.RebelSystem) ? window.RebelSystem : null;
const ImperialMandates = (typeof window !== 'undefined' && window.ImperialMandates) ? window.ImperialMandates : null;

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

/** CONFIG */
const OVERWORLD_TILES = {
    CASTLE: { id: 'castle', color: '#445', char: '🏰', income: {gold:2, wood:1} },
    FIELD:  { id: 'field',  color: '#90be6d', char: '🌾', income: {} },
    FOREST: { id: 'forest', color: '#2d6a4f', char: '🌲', income: {wood:1} },
    TOWN:   { id: 'town',   color: '#5e548e', char: '🏠', income: {gold:2} },
    REBELCAMP: { id: 'rebelcamp', color: '#7f1d1d', char: '🏴', income: {} }
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
            : { intendedTrack: 'None', masterVolume: 1, activeSources: [] };

        const activeSources = snapshot.activeSources || [];
        const friendlyState = gameState === 'COMBAT' ? 'War Mode' : 'Territory Mode';
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
        `;
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
    gold: 300, wood: 40,
    difficulty: 0,
    upgrades: { soldier: 1, archer: 1, production: 1, mines: 1, defense: 1 },
    research: { technologies: [], bonuses: { townGoldBonus: 0, forestWoodBonus: 0 }, lives: 0 },
    stats: { ...Persistence.DEFAULT_STATS },
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
    selectedOverworldTile: null,
    shouldRunImperialIntro: false, // Flagged when a fresh campaign needs to play the decree after BEGIN
    
    overworld: { hexes: new Map(), claimable: new Map(), timer: 0, tickRate: 3.0 },
    fog: { time: 0 },
    combat: {
        territory: new Map(), slots: new Map(), buildings: new Map(), units: [], particles: [], fx: [],
        ai: { timer: 0, nextMove: 3.0, gold: 300 },
        castles: { player: null, enemy: null }
    },

    init() {
        this.resize();
        AudioDebugConsole.init();
        this.bindVoidClickEasterEgg();
        window.addEventListener('resize', () => this.resize());
        this.setupInput();
        this.resetSession();

        window.addEventListener('intro:begin', () => {
            if (this.shouldRunImperialIntro && ImperialMandates?.initializeImperialIntro) {
                ImperialMandates.initializeImperialIntro(this, { showTileCallout: this.showTileCallout, hideTileCallout: this.hideTileCallout });
                this.shouldRunImperialIntro = false;
            }
        });

        const loaded = Persistence.loadSnapshot(this.activeSaveSlot, { hexFactory: (q, r, s) => new Hex(q, r, s) });
        if (loaded.state) {
            this.applySnapshot(loaded.state);
            this.stats = loaded.stats;
            this.activeSaveSlot = loaded.slot || '1';
        } else {
            this.bootstrapNewWorld();
        }

        this.updateHUD();
        this.updateUpgradeMenu();
        this.updateResearchUI();
        this.updateLeaderboardUI();
        this.updateSaveSlotsUI();
        if (this.updateTileInspector) this.updateTileInspector(null);

        setupUIBindings(this);

        this.armAmbientLoop();

        this.lastTime = performance.now();
        requestAnimationFrame(t => this.loop(t));
    },

    resize() {
        const previousProfile = this.deviceProfile;
        this.deviceProfile = Platform.detectPlatformProfile();
        this.viewport = {
            width: this.deviceProfile.viewportWidth,
            height: this.deviceProfile.viewportHeight
        };

        Platform.sizeCanvasForDisplay(this.canvas, this.ctx, this.deviceProfile);

        this.cam.x = this.viewport.width / 2;
        this.cam.y = this.viewport.height / 2;

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
        this.gold = 300; this.wood = 40; this.difficulty = 0;
        this.upgrades = { soldier: 1, archer: 1, production: 1, mines: 1, defense: 1 };
        this.overworld.hexes = new Map();
        this.overworld.claimable = new Map();
        this.addOverworldHex(new Hex(0,0), 'castle');
        for(let i=0; i<6; i++) this.claimHexLogic(Hex.neighbor(new Hex(0,0),i), true);
        this.calcOverworldGhosts();
        this.research = this.buildResearchState();
        this.updateResearchBonuses();
        this.resetSession();
        this.updateSaveStatus('Fresh campaign');
        this.showOverworldUI();
        if (ImperialMandates?.resetMandateState) ImperialMandates.resetMandateState();
        this.shouldRunImperialIntro = typeof document !== 'undefined';
        if (!this.shouldRunImperialIntro && ImperialMandates?.initializeImperialIntro) {
            ImperialMandates.initializeImperialIntro(this, { showTileCallout: this.showTileCallout, hideTileCallout: this.hideTileCallout });
        }
    },

    /** Apply a hydrated snapshot to the live game state (overworld only). */
    applySnapshot(snapshot) {
        this.state = 'OVERWORLD';
        this.gold = snapshot.gold;
        this.wood = snapshot.wood;
        this.difficulty = snapshot.difficulty;
        this.upgrades = { ...this.upgrades, ...snapshot.upgrades };
        this.research = this.buildResearchState(snapshot.research);
        this.updateResearchBonuses();
        this.overworld.hexes = snapshot.overworld.hexes;
        this.overworld.claimable = new Map();
        this.calcOverworldGhosts();
        this.resetSession();
        this.updateSaveStatus(snapshot.stats?.lastSaveISO ? `Loaded ${snapshot.stats.lastSaveISO}` : 'Loaded save file');
        this.showOverworldUI();
        this.shouldRunImperialIntro = false;
    },

    /** Persist the overworld snapshot and leaderboard stats to a chosen slot. */
    saveGame(slot = this.activeSaveSlot) {
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
        this.toggleSidebar(false);
        this.spawnTxt(new Hex(0,0), `Loaded Slot ${this.activeSaveSlot}`, '#9be3b4');
    },

    /** Wipe stored data and rebuild the starting overworld for a new run. */
    resetProgress() {
        Persistence.clearSnapshot();
        this.stats = { ...Persistence.DEFAULT_STATS };
        this.activeSaveSlot = '1';
        this.bootstrapNewWorld();
        this.updateLeaderboardUI();
        this.updateHUD();
        this.updateUpgradeMenu();
        this.updateSaveSlotsUI();
        this.toggleSidebar(false);
        this.spawnTxt(new Hex(0,0), 'Progress Reset', '#ffd166');
        if (ImperialMandates?.resetMandateState) ImperialMandates.resetMandateState();
        if (window.IntroOverlay?.reset) window.IntroOverlay.reset();
    },

    loop(now) {
        const dt = (now - this.lastTime)/1000;
        this.lastTime = now;
        try {
            this.ctx.globalAlpha = 1.0;
            this.fog.time += dt;
            if(this.state === 'OVERWORLD') this.updateOverworld(dt);
            else if(this.state === 'COMBAT') this.updateCombat(dt);
            
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
            console.error(e);
            document.getElementById('debug-log').style.display = 'block';
            document.getElementById('debug-log').innerText = "CRASH RECOVERED: " + e.message;
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
        const technologies = ResearchSystem.instantiateTechnologies(saved.technologies || []);
        const livesTech = technologies.find(t => t.id === 'lives');
        const purchasedLives = Math.min(livesTech?.timesPurchased || 0, livesTech?.maxPurchases || 0);
        const remainingLives = Math.min(saved.lives ?? purchasedLives, purchasedLives);
        return {
            technologies,
            bonuses: { townGoldBonus: 0, forestWoodBonus: 0 },
            lives: remainingLives
        };
    },

    /**
     * Recalculate passive bonuses derived from purchased tech so loading and
     * respecs remain deterministic.
     */
    updateResearchBonuses() {
        this.research.bonuses = { townGoldBonus: 0, forestWoodBonus: 0 };
        const livesTech = this.research.technologies.find(t => t.id === 'lives');
        const purchasedLives = Math.min(livesTech?.timesPurchased || 0, livesTech?.maxPurchases || 0);
        this.research.lives = Math.min(this.research.lives || 0, purchasedLives);

        this.research.technologies.forEach(tech => {
            if (!tech.timesPurchased) return;
            if (tech.id === 'architecture') this.research.bonuses.townGoldBonus += tech.timesPurchased;
            if (tech.id === 'lumberjacks') this.research.bonuses.forestWoodBonus += tech.timesPurchased;
        });
    },

    /**
     * Convert a cost object into a human-readable string.
     * @param {object} cost resource object keyed by gold/wood.
     * @returns {string}
     */
    formatCost(cost) {
        const parts = [];
        if (cost.gold) parts.push(`${cost.gold}g`);
        if (cost.wood) parts.push(`${cost.wood}w`);
        return parts.join(' + ');
    },

    /** Locate a technology by id. */
    getTech(id) { return this.research.technologies.find(t => t.id === id); },

    /**
     * Determine the scaled price for a tech, optionally scoped to an option.
     * @param {object} tech technology entry.
     * @param {string} [optionId] optional cost option id.
     * @returns {object} resource cost.
     */
    getTechCost(tech, optionId) {
        return ResearchSystem.getCostForTech(tech, optionId);
    },

    /** Check if the player can pay a specific cost. */
    canPayCost(cost) { return ResearchSystem.isAffordable({ gold: this.gold, wood: this.wood }, cost); },

    /**
     * Attempt to purchase a technology and immediately apply its effect.
     * @param {string} techId identifier of the tech to buy.
     * @param {string} [optionId] optional option key (land reclamation).
     */
    buyTechnology(techId, optionId) {
        const tech = this.getTech(techId);
        if (!tech || !ResearchSystem.hasRemainingPurchases(tech)) return;

        const cost = this.getTechCost(tech, optionId);
        const hasFields = tech.id === 'land-reclamation' ? this.hasFieldToConvert() : true;
        if (!hasFields) return;
        if (!this.canPayCost(cost)) return;

        this.gold -= cost.gold || 0;
        this.wood -= cost.wood || 0;
        this.applyTechEffect(tech, optionId);
        ResearchSystem.recordPurchase(tech);
        this.updateResearchBonuses();
        this.updateHUD();
        this.updateResearchUI();
    },

    /**
     * Apply immediate bonuses from a purchased tech.
     * @param {object} tech technology definition.
     * @param {string} [optionId] cost option chosen by the player.
     */
    applyTechEffect(tech, optionId) {
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
            const success = this.convertRandomField(targetType);
            if (!success) {
                this.spawnTxt(new Hex(0,0), 'NO FIELDS LEFT', '#ef476f');
            }
        }
    },

    /**
     * Transform a random field into a more lucrative tile.
     * @param {string} newType either 'forest' or 'town'.
     * @returns {boolean} true when a field was converted.
     */
    convertRandomField(newType) {
        const fields = Array.from(this.overworld.hexes.values()).filter(h => h.type === 'field');
        if (fields.length === 0) return false;
        const choice = fields[Math.floor(Math.random() * fields.length)];
        choice.type = newType;
        this.calcOverworldGhosts();
        this.spawnTxt(choice.hex, `${newType.toUpperCase()} BUILT`, newType === 'town' ? '#ffd166' : '#8ae7a8');
        return true;
    },

    /** True when at least one field can be reclaimed. */
    hasFieldToConvert() {
        return Array.from(this.overworld.hexes.values()).some(h => h.type === 'field');
    },

    getUnitStats(type) { return getUnitStats(this, type); },

    getBuildingStats(type, owner) { return getBuildingStats(this, type, owner); },

    getSpawnRate(baseRate) { return getSpawnRate(this, baseRate); },

    getIncomeMulti() {
        return 1 + ((this.upgrades.mines - 1) * 0.2); 
    },

    updateOverworld(dt) {
        this.overworld.timer += dt;
        if(this.overworld.timer >= this.overworld.tickRate) {
            this.overworld.timer = 0;
            let goldInc = 0;
            let woodInc = 0;
            for(let [k, d] of this.overworld.hexes) {
                const def = OVERWORLD_TILES[d.type.toUpperCase()];
                if(def.income.gold) goldInc += def.income.gold + (d.type === 'town' ? this.research.bonuses.townGoldBonus : 0);
                if(def.income.wood) woodInc += def.income.wood + (d.type === 'forest' ? this.research.bonuses.forestWoodBonus : 0);
            }
            
            const multi = this.getIncomeMulti();
            goldInc = Math.floor(goldInc * multi);
            woodInc = Math.floor(woodInc * multi);

            this.gold += goldInc;
            this.wood += woodInc;
            if(goldInc > 0 || woodInc > 0) this.spawnTxt(new Hex(0,0), `+${goldInc}g  +${woodInc}w`, '#fff');
            this.updateHUD();
            this.updateUpgradeMenu();
        }
    },

    updateCombat(dt) { return updateCombat(this, dt, this.Hex); },

    /** Track leaderboard totals when the player lands a final blow. */
    registerKill(owner) { return registerKill(this, owner); },

    /** Persist leaderboard milestones and autosave at the end of any war outcome. */
    recordWarEnd(outcome) { return recordWarEnd(this, outcome); },

    damageUnit(u, dmg, attackerOwner) { return damageUnit(this, u, dmg, attackerOwner); },

    runAI() { return runAI(this); },

    damageBuilding(key, amt) { return damageBuilding(this, key, amt); },

    checkConnection(startHex, owner) { return checkConnection(this, startHex, owner, this.Hex); },

    scorchEarth(key) { return scorchEarth(this, key); },

    /**
     * Track the currently highlighted overworld tile and refresh the contextual inspector UI.
     * Hostile tiles surface an Attack action while neutral/friendly tiles simply show details.
     * @param {object|null} tile tile payload selected by the player.
     */
    setSelectedOverworldTile(tile) {
        this.selectedOverworldTile = tile || null;
        if (this.updateTileInspector) this.updateTileInspector(tile || null);
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
            if(this.overworld.claimable.has(key)) {
                const cost = this.overworld.claimable.get(key);
                if(this.wood >= cost) {
                    this.wood -= cost;
                    this.claimHexLogic(hex, false);
                    this.calcOverworldGhosts();
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
        const r = Math.random();
        let type = 'field'; if(r > 0.75) type = 'town'; else if(r > 0.5) type = 'forest';
        this.addOverworldHex(hex, type);
        if(!free) {
            this.spawnTxt(hex, `${type.toUpperCase()}!`, '#fff');
            if (type === 'town') this.playSound('city');
            if (type === 'forest') this.playSound('choptree');
        }
    },
    addOverworldHex(hex, type) { this.overworld.hexes.set(hex.toString(), {hex, type}); },
    calcOverworldGhosts() {
        this.overworld.claimable.clear();
        for(let [k, d] of this.overworld.hexes) {
            for(let i=0; i<6; i++) {
                const n = Hex.neighbor(d.hex, i);
                if(!this.overworld.hexes.has(n.toString())) {
                    const dist = Hex.distance(new Hex(0,0), n);
                    this.overworld.claimable.set(n.toString(), Math.floor(10 + dist*5));
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
            let fill = '#222';
            if(t.owner === 'player') fill = '#1b4332';
            else if(t.owner === 'enemy') fill = '#590d22';
            else if(t.owner === 'scorched') fill = '#111'; // Scorched Color
            
            this.drawHex(layout, t.hex, fill, '#000');
            if(this.isFrontier(k, 'player')) {
                const type = this.combat.slots.get(k);
                if(type) {
                    const def = COMBAT_BUILDINGS[type.toUpperCase()];
                    if(def) {
                        this.ctx.globalAlpha = 0.5;
                        this.drawHex(layout, t.hex, 'rgba(255,255,255,0.1)', '#fff', def.char, def.cost !== undefined ? `${def.cost}g` : '');
                        this.ctx.globalAlpha = 1.0;
                    }
                }
            }
        }
        for(let [k, b] of this.combat.buildings) {
            const def = COMBAT_BUILDINGS[b.type.toUpperCase()];
            if(!def) continue;
            let fill = b.owner === 'player' ? '#2d6a4f' : '#800f2f';
            if (b.type === 'lair') fill = '#4a004a';
            if(b.pulse > 0) { b.pulse -= 0.05; fill = '#fff'; }
            this.drawHex(layout, this.parseKey(k), fill, '#fff', def.char);
        }
        this.combat.units.forEach(u => {
            const def = UNITS[u.type];
            if(!def) return;
            const p = (new Hex(u.pos.q, u.pos.r, u.pos.s)).toPixel(layout);
            const size = u.type === 'dragon' ? 16 * this.cam.zoom : 10 * this.cam.zoom;
            this.ctx.fillStyle = u.owner === 'player' ? '#06d6a0' : '#ef476f';
            if (u.type === 'dragon') this.ctx.fillStyle = '#d4f';
            this.ctx.beginPath(); this.ctx.arc(p.x, p.y, size, 0, Math.PI*2); this.ctx.fill();
            this.ctx.strokeStyle = '#fff'; this.ctx.stroke();
            this.ctx.font = `${(u.type==='dragon'?20:12)*this.cam.zoom}px sans-serif`;
            this.ctx.textAlign='center'; this.ctx.textBaseline='middle';
            this.ctx.fillText(def.char, p.x, p.y);
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

    drawOverworld(layout) {
        for(let [k, d] of this.overworld.hexes) {
            const def = OVERWORLD_TILES[d.type.toUpperCase()];
            if(def) this.drawHex(layout, d.hex, def.color, '#264653', def.char);
        }
        for(let [k, cost] of this.overworld.claimable) {
            this.drawHex(layout, this.parseKey(k), 'rgba(255,255,255,0.05)', '#333', '', `${cost}w`);
        }
    },

    /**
     * Paint a soft radial fog backdrop that darkens unexplored space while keeping
     * explored tiles readable. The gradient subtly drifts to keep the scene from
     * feeling static without impacting gameplay logic.
     * @param {Object} layout active hex layout (origin + size)
     */
    renderFogBackdrop(layout) {
        const ctx = this.ctx;
        const baseColor = '#0b0b11';
        ctx.fillStyle = baseColor;
        ctx.fillRect(0, 0, this.viewport.width, this.viewport.height);

        const center = this.getTerritoryScreenCenter(layout);
        const drift = Math.sin(this.fog.time * 0.35) * 28;
        const radius = Math.max(this.viewport.width, this.viewport.height) * 0.8;
        const innerRadius = Math.max(layout.size * 3, radius * 0.25);

        const fogGradient = ctx.createRadialGradient(
            center.x + drift,
            center.y - drift,
            innerRadius,
            center.x,
            center.y,
            radius
        );
        fogGradient.addColorStop(0, 'rgba(38, 40, 50, 0.75)');
        fogGradient.addColorStop(0.5, 'rgba(18, 20, 28, 0.82)');
        fogGradient.addColorStop(1, 'rgba(4, 4, 8, 0.98)');
        ctx.fillStyle = fogGradient;
        ctx.fillRect(0, 0, this.viewport.width, this.viewport.height);

        const rippleGradient = ctx.createRadialGradient(
            center.x - drift * 0.4,
            center.y + drift * 0.6,
            0,
            center.x - drift * 0.4,
            center.y + drift * 0.6,
            radius
        );
        rippleGradient.addColorStop(0, 'rgba(255,255,255,0.03)');
        rippleGradient.addColorStop(0.25, 'rgba(120,120,140,0.02)');
        rippleGradient.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = rippleGradient;
        ctx.fillRect(0, 0, this.viewport.width, this.viewport.height);
        ctx.globalAlpha = 1.0;
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
