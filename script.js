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
    TOWN:   { id: 'town',   color: '#5e548e', char: '🏠', income: {gold:2} }
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

const SAVE_SLOTS = ['1', '2', '3'];

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
    deviceProfile: Platform.detectPlatformProfile(),
    viewport: { width: window.innerWidth, height: window.innerHeight },
    shakeTimer: null,
    
    overworld: { hexes: new Map(), claimable: new Map(), timer: 0, tickRate: 3.0 },
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

        document.getElementById('btn-war').onclick = (e) => this.startWar(e);
        document.getElementById('btn-retreat').onclick = (e) => this.endWar('RETREAT', e);
        document.getElementById('btn-upg').onclick = () => { document.getElementById('upgrade-menu').style.display='flex'; };
        document.getElementById('btn-close-upg').onclick = () => { document.getElementById('upgrade-menu').style.display='none'; };
        document.getElementById('btn-research').onclick = () => this.toggleResearch(true);
        document.getElementById('btn-close-research').onclick = () => this.toggleResearch(false);

        document.getElementById('btn-sidebar-toggle').onclick = () => this.toggleSidebar();
        document.getElementById('btn-sidebar-close').onclick = () => this.toggleSidebar(false);
        document.getElementById('btn-reset').onclick = () => { this.resetProgress(); this.updateSaveSlotsUI(); };
        document.querySelectorAll('.slot-save').forEach(btn => btn.onclick = () => this.saveGame(btn.dataset.slot));
        document.querySelectorAll('.slot-load').forEach(btn => btn.onclick = () => this.loadGame(btn.dataset.slot));

        document.getElementById('buy-soldier').onclick = () => this.buyUpgrade('soldier');
        document.getElementById('buy-archer').onclick = () => this.buyUpgrade('archer');
        document.getElementById('buy-prod').onclick = () => this.buyUpgrade('production');
        document.getElementById('buy-mines').onclick = () => this.buyUpgrade('mines');
        document.getElementById('buy-defense').onclick = () => this.buyUpgrade('defense');

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

    /**
     * Initialize the void click easter egg handler, incrementing counters and
     * emitting thematic text when the player clicks on background space.
     */
    bindVoidClickEasterEgg() {
        this.voidClicks = 0;
        this.handleVoidClick = (x, y) => {
            const hit = this.isPointerOnDrawnHex(x, y);
            if (hit && hit.hit) return;

            this.voidClicks += 1;
            const outcome = typeof VoidEasterEgg !== 'undefined'
                ? VoidEasterEgg.computeMessage(this.voidClicks)
                : { message: 'Out of Bounds', isSassy: false };

            const layout = { origin: this.cam, size: 30 * this.cam.zoom, ...Layout };
            const targetHex = hit && hit.hex ? new Hex(hit.hex.q, hit.hex.r, hit.hex.s) : Hex.fromPixel(layout, { x, y });
            const color = outcome.isSassy ? '#ef476f' : '#aaa';
            this.spawnTxt(targetHex, outcome.message, color);
        };
    },

    setupInput() {
        let isDrag = false, start = {x:0, y:0}, camStart = {x:0, y:0};
        const onDown = (x, y) => { isDrag = true; start = {x, y}; camStart = {x:this.cam.x, y:this.cam.y}; };
        const onMove = (x, y) => { if(isDrag) { this.cam.x = camStart.x + (x - start.x); this.cam.y = camStart.y + (y - start.y); }};
        const onUp = (x, y) => {
            if(isDrag) {
                isDrag = false;
                if(Math.hypot(x-start.x, y-start.y) < 10) {
                    const hit = this.isPointerOnDrawnHex(x, y);
                    if(hit && hit.hit) this.onClick(x, y);
                    else if(this.handleVoidClick) this.handleVoidClick(x, y);
                }
            }
        };
        this.canvas.addEventListener('pointerdown', e => onDown(e.clientX, e.clientY));
        this.canvas.addEventListener('pointermove', e => onMove(e.clientX, e.clientY));
        this.canvas.addEventListener('pointerup', e => onUp(e.clientX, e.clientY));
        this.canvas.addEventListener('wheel', e => { e.preventDefault(); this.cam.zoom = Math.max(0.4, Math.min(2.5, this.cam.zoom - e.deltaY*0.001)); }, {passive: false});
    },

    /** Start or swap the peaceful ambiance conductor playlist. */
    armAmbientLoop() {
        if (typeof window === 'undefined') return;
        window.AmbientSoundscape?.enterMode?.('TERRITORY');
        window.AmbientSoundscape?.start?.();
    },

    /** Stop ambiance when entering combat. */
    haltAmbientLoop() {
        if (typeof window === 'undefined') return;
        window.AmbientSoundscape?.stopAll?.();
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

    /** Toggle the collapsible sidebar that houses meta controls. */
    toggleSidebar(forceState) {
        const sidebar = document.getElementById('sidebar');
        if (!sidebar) return;
        const shouldOpen = typeof forceState === 'boolean' ? forceState : !sidebar.classList.contains('open');
        sidebar.classList.toggle('open', shouldOpen);
    },

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
        document.getElementById('ui-overworld').classList.add('visible');
        document.getElementById('ui-combat').classList.remove('visible');
        document.getElementById('state-txt').innerText = "KINGDOM";
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
        document.getElementById('ui-overworld').classList.add('visible');
        document.getElementById('ui-combat').classList.remove('visible');
        document.getElementById('state-txt').innerText = "KINGDOM";
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
    },

    updateSaveStatus(msg) {
        const el = document.getElementById('save-status');
        if (el) el.innerText = msg;
    },

    /** Refresh the sidebar cards to reflect slot metadata and active slot. */
    updateSaveSlotsUI() {
        const label = document.getElementById('active-slot-label');
        if (label) label.innerText = `Slot ${this.activeSaveSlot} Active`;

        SAVE_SLOTS.forEach(slot => {
            const meta = Persistence.getSlotMetadata(slot);
            const caption = document.querySelector(`[data-slot-caption="${slot}"]`);
            const loadBtn = document.querySelector(`.slot-load[data-slot="${slot}"]`);
            if (caption) {
                if (meta.hasSave) {
                    const when = meta.lastSaveISO ? new Date(meta.lastSaveISO).toLocaleString() : 'Unknown Time';
                    const level = meta.level !== null ? meta.level : '?';
                    caption.innerText = `Level ${level} - Saved: ${when}`;
                } else {
                    caption.innerText = 'Empty Slot';
                }
            }
            if (loadBtn) loadBtn.disabled = !meta.hasSave;
        });
    },

    loop(now) {
        const dt = (now - this.lastTime)/1000;
        this.lastTime = now;
        try {
            this.ctx.globalAlpha = 1.0; 
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

    updateUpgradeMenu() {
        document.getElementById('lbl-soldier').innerText = `Lv. ${this.upgrades.soldier}`;
        document.getElementById('buy-soldier').innerText = `${this.getUpgradeCost('soldier')}g`;
        document.getElementById('lbl-archer').innerText = `Lv. ${this.upgrades.archer}`;
        document.getElementById('buy-archer').innerText = `${this.getUpgradeCost('archer')}g`;
        document.getElementById('lbl-prod').innerText = `Lv. ${this.upgrades.production}`;
        document.getElementById('buy-prod').innerText = `${this.getUpgradeCost('production')}g`;
        document.getElementById('lbl-mines').innerText = `Lv. ${this.upgrades.mines}`;
        document.getElementById('buy-mines').innerText = `${this.getUpgradeCost('mines')}g`;
        document.getElementById('lbl-defense').innerText = `Lv. ${this.upgrades.defense}`;
        document.getElementById('buy-defense').innerText = `${this.getUpgradeCost('defense')}g`;
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

    /** Toggle the research modal visibility. */
    toggleResearch(forceOpen) {
        const modal = document.getElementById('research-modal');
        if (!modal) return;
        modal.style.display = forceOpen === false ? 'none' : 'flex';
        if (forceOpen !== false) this.updateResearchUI();
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

    /**
     * Render the research tech grid and reflect affordability / purchase state.
     */
    updateResearchUI() {
        const grid = document.getElementById('tech-grid');
        if (!grid) return;
        grid.innerHTML = '';

        const livesTech = this.getTech('lives');
        const livesCap = livesTech?.maxPurchases || 3;
        const livesLabel = document.getElementById('research-lives');
        if (livesLabel) livesLabel.innerText = `❤️ ${this.research.lives}/${livesCap}`;
        const headerLives = document.getElementById('lives-count');
        if (headerLives) headerLives.innerText = this.research.lives;

        this.research.technologies.forEach(tech => {
            const card = document.createElement('div');
            card.className = 'tech-card';

            const title = document.createElement('h3');
            title.className = 'tech-title';
            const counter = tech.maxPurchases && tech.maxPurchases > 1 ? ` (${tech.timesPurchased}/${tech.maxPurchases})` : '';
            title.innerText = `${tech.name}${counter}`;

            const desc = document.createElement('p');
            desc.className = 'tech-desc';
            desc.innerText = tech.description;

            const costLine = document.createElement('p');
            costLine.className = 'tech-cost';

            const actions = document.createElement('div');
            actions.className = 'tech-actions';

            const canBuyMore = ResearchSystem.hasRemainingPurchases(tech);
            let affordable = false;

            if (tech.costOptions && tech.costOptions.length > 0) {
                costLine.innerText = tech.costOptions.map(opt => `${opt.label} (${this.formatCost(this.getTechCost(tech, opt.id))})`).join(' | ');
                tech.costOptions.forEach(opt => {
                    const optCost = this.getTechCost(tech, opt.id);
                    const btn = document.createElement('button');
                    btn.innerText = opt.label;
                    const canAfford = this.canPayCost(optCost) && canBuyMore && this.hasFieldToConvert();
                    affordable = affordable || canAfford;
                    btn.disabled = !canAfford;
                    btn.classList.add('primary-btn');
                    btn.onclick = () => this.buyTechnology(tech.id, opt.id);
                    actions.appendChild(btn);
                });
            } else {
                const cost = this.getTechCost(tech);
                costLine.innerText = `Cost: ${this.formatCost(cost)}`;
                affordable = this.canPayCost(cost) && canBuyMore;
                const btn = document.createElement('button');
                btn.innerText = tech.purchased ? 'Repurchase' : 'Purchase';
                btn.disabled = !affordable;
                btn.classList.add('primary-btn');
                btn.onclick = () => this.buyTechnology(tech.id);
                actions.appendChild(btn);
            }

            if (!canBuyMore) {
                card.classList.add('purchased');
                actions.querySelectorAll('button').forEach(btn => {
                    btn.disabled = true;
                    btn.classList.add('purchased-btn');
                    btn.innerText = 'Purchased';
                });
            } else if (affordable) {
                card.classList.add('affordable');
            } else {
                card.classList.add('unaffordable');
            }

            card.appendChild(title);
            card.appendChild(desc);
            card.appendChild(costLine);
            card.appendChild(actions);
            grid.appendChild(card);
        });
    },

    updateLeaderboardUI() {
        const setTxt = (id, val) => { const el = document.getElementById(id); if(el) el.innerText = val; };
        setTxt('stat-best-lvl', this.stats.bestDifficulty || 0);
        setTxt('stat-best-kills', this.stats.bestKills || 0);
        setTxt('stat-total-kills', this.stats.totalKills || 0);
        setTxt('stat-wars', this.stats.warsPlayed || 0);
        if (this.stats.lastSaveISO) this.updateSaveStatus(`Last saved ${this.stats.lastSaveISO}`);
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

    updateCombat(dt) { return updateCombat(this, dt); },

    /** Track leaderboard totals when the player lands a final blow. */
    registerKill(owner) { return registerKill(this, owner); },

    /** Persist leaderboard milestones and autosave at the end of any war outcome. */
    recordWarEnd(outcome) { return recordWarEnd(this, outcome); },

    damageUnit(u, dmg, attackerOwner) { return damageUnit(this, u, dmg, attackerOwner); },

    runAI() { return runAI(this); },

    damageBuilding(key, amt) { return damageBuilding(this, key, amt); },

    checkConnection(startHex, owner) { return checkConnection(this, startHex, owner); },

    scorchEarth(key) { return scorchEarth(this, key); },

    onClick(x, y) {
        const layout = {origin:this.cam, size:30*this.cam.zoom, ...Layout};
        const hex = Hex.fromPixel(layout, {x, y});
        const key = hex.toString();

        if(this.state === 'OVERWORLD') {
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

    isFrontier(key, who) { return isFrontier(this, key, who); },

    buyBuilding(hex, type) { return buyBuilding(this, hex, type); },

    addBuilding(hex, type, owner) { return addBuilding(this, hex, type, owner); },

    spawnUnit(type, owner, hex) { return spawnUnit(this, type, owner, hex); },

    startWar(clickEvt) { return startWar(this, clickEvt); },

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

    loseOverworldHexes(count) { return loseOverworldHexes(this, count); },

    endWar(outcome, clickEvt) { return endWar(this, outcome, clickEvt); },

    showWarTip() {
        const el = document.getElementById('tip-overlay');
        const tip = TIPS[Math.floor(Math.random()*TIPS.length)];
        el.innerText = tip;
        el.classList.add('tip-visible');
        setTimeout(() => el.classList.remove('tip-visible'), 4000);
    },
    
    hideWarTip() {
        document.getElementById('tip-overlay').classList.remove('tip-visible');
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
    /** Screen-space floating text for button feedback and battle summaries. */
    showFloatingText(x, y, txt, cssClass) {
        const layer = this.fxLayer || document.getElementById('fx-layer');
        if (!layer) return;
        const el = document.createElement('div');
        el.className = 'floating-text';
        if (cssClass) el.classList.add(cssClass);
        el.innerText = txt;
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        layer.appendChild(el);
        setTimeout(() => el.remove(), 820);
    },
    /** Brief camera shake anchored to the main container. */
    triggerCameraShake() {
        const target = document.getElementById('game-container');
        if (!target) return;
        target.classList.add('shake');
        clearTimeout(this.shakeTimer);
        this.shakeTimer = setTimeout(() => target.classList.remove('shake'), Juice.clampShakeDuration(300));
    },
    /** Emit outward-fading particle squares at a given screen coordinate. */
    spawnParticleBurst(x, y, count = 6, colors = ['#ffd166', '#06d6a0', '#ef476f']) {
        const layer = this.fxLayer || document.getElementById('fx-layer');
        if (!layer || typeof Juice === 'undefined') return;
        const burst = Juice.createBurstVectors(count, 18, 46);
        burst.forEach((vec, idx) => {
            const node = document.createElement('div');
            node.className = 'particle';
            node.style.left = `${x}px`;
            node.style.top = `${y}px`;
            node.style.setProperty('--dx', vec.dx.toFixed(2));
            node.style.setProperty('--dy', vec.dy.toFixed(2));
            node.style.background = colors[idx % colors.length];
            layer.appendChild(node);
            setTimeout(() => node.remove(), vec.duration);
        });
    },
    /** Convenience wrapper to project hex positions into a burst origin. */
    spawnBurstAtHex(pos, count) {
        const p = this.projectHexToScreen(pos);
        this.spawnParticleBurst(p.x, p.y, count);
    },
    spawnTxt(pos, txt, col) {
        const layout = {origin:this.cam, size:30*this.cam.zoom, ...Layout};
        const p = (pos.toPixel ? pos : new Hex(pos.q, pos.r)).toPixel(layout);
        const el = document.createElement('div');
        el.className = 'floater'; el.innerText = txt;
        el.style.left = p.x + 'px'; el.style.top = p.y + 'px'; el.style.color = col;
        document.body.appendChild(el);
        this.combat.particles.push({el, life:2.5});
    },
    updateHUD() {
        document.getElementById('gold').innerText = Math.floor(this.gold);
        document.getElementById('wood').innerText = Math.floor(this.wood);
        const lives = document.getElementById('lives-count');
        if (lives) lives.innerText = this.research.lives;
        document.getElementById('lvl-txt').innerText = `Enemy Lv.${this.difficulty}`;
        
        const cost = (this.difficulty + 1) * 25;
        document.getElementById('btn-war').innerText = `⚔️ WAR (${cost}g)`;
    },

    draw() {
        const ctx = this.ctx;
        ctx.fillStyle = '#121218'; ctx.fillRect(0, 0, this.viewport.width, this.viewport.height);
        const layout = {origin:this.cam, size:30*this.cam.zoom, ...Layout};
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

window.Hex = Hex;
window.Game = Game;

Game.init();
});
