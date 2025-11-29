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

/** CONFIG */
const OVERWORLD_TILES = {
    CASTLE: { id: 'castle', color: '#445', char: '🏰', income: {gold:2, wood:1} },
    FIELD:  { id: 'field',  color: '#90be6d', char: '🌾', income: {} },
    FOREST: { id: 'forest', color: '#2d6a4f', char: '🌲', income: {wood:1} },
    TOWN:   { id: 'town',   color: '#5e548e', char: '🏠', income: {gold:2} }
};

const COMBAT_BUILDINGS = {
    // Castle now has income:5 and prodRate:4.0
    CASTLE: { id: 'castle', char: '🏰', hp: 3000, dmg: 50, range: 4, rate: 1.0, income: 5, prodRate: 4.0 }, 
    MINE:   { id: 'mine',   char: '🟡', cost: 40, hp: 300, income: 8, rate: 3.0 },
    BARRACKS:{ id: 'barracks', char: '⚔️', cost: 75, hp: 500, spawn: 'soldier', rate: 5.0 },
    RANGE:  { id: 'range',  char: '🏹', cost: 100, hp: 250, spawn: 'archer', rate: 4.5 },
    TOWER:  { id: 'tower',  char: '🛡️', cost: 120, hp: 1000, dmg: 40, range: 4, rate: 0.8 }, 
    LAIR:   { id: 'lair',   char: '🌋', cost: 0, hp: 1500, spawn: 'dragon', rate: 12.0 },
    MYSTERY:{ id: 'mystery', char: '❓', cost: 25 },
    ROCKS:  { id: 'rocks', char: '🪨', hp: 150 }
};

const UNITS = {
    soldier: { hp: 150, dmg: 12, speed: 2.0, range: 1, char: '⚔️' },
    archer:  { hp: 70,  dmg: 18, speed: 1.8, range: 3, char: '🏹' },
    dragon:  { hp: 1200, dmg: 80, speed: 1.5, range: 2, char: '🐲' }
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

/** Minimal Web Audio synth for UI feedback. */
const AudioFX = {
    ctx: null,
    ensureCtx() {
        if (this.ctx) return true;
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return false;
        this.ctx = new AudioContext();
        return true;
    },
    play(type) {
        if (!this.ensureCtx()) return;
        const envelope = this.library[type];
        if (!envelope) return;
        const now = this.ctx.currentTime;
        envelope.forEach(part => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = part.wave;
            osc.frequency.setValueAtTime(part.freq, now);
            gain.gain.setValueAtTime(part.volume, now);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + part.duration);
            osc.connect(gain).connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + part.duration);
        });
    },
    library: {
        slice: [
            { wave: 'triangle', freq: 240, duration: 0.18, volume: 0.22 },
            { wave: 'sawtooth', freq: 420, duration: 0.12, volume: 0.18 }
        ],
        thud: [
            { wave: 'sine', freq: 110, duration: 0.35, volume: 0.3 },
            { wave: 'square', freq: 70, duration: 0.2, volume: 0.25 }
        ]
    }
};

const SAVE_SLOTS = ['1', '2', '3'];

/** ENGINE */
const Game = {
    canvas: document.getElementById('canvas'),
    ctx: document.getElementById('canvas').getContext('2d'),
    fxLayer: document.getElementById('fx-layer'),

    state: 'OVERWORLD',
    gold: 300, wood: 40,
    difficulty: 0,
    upgrades: { soldier: 1, archer: 1, production: 1, mines: 1, defense: 1 },
    stats: { ...Persistence.DEFAULT_STATS },
    session: { warKills: 0 },
    activeSaveSlot: '1',
    voidClicks: 0,
    cam: { x: 0, y: 0, zoom: 1 },
    shakeTimer: null,
    
    overworld: { hexes: new Map(), claimable: new Map(), timer: 0, tickRate: 3.0 },
    combat: { 
        territory: new Map(), slots: new Map(), buildings: new Map(), units: [], particles: [], fx: [],
        ai: { timer: 0, nextMove: 3.0, gold: 300 },
        castles: { player: null, enemy: null }
    },

    init() {
        this.resize();
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
        this.updateLeaderboardUI();
        this.updateSaveSlotsUI();

        document.getElementById('btn-war').onclick = (e) => this.startWar(e);
        document.getElementById('btn-retreat').onclick = (e) => this.endWar('RETREAT', e);
        document.getElementById('btn-upg').onclick = () => { document.getElementById('upgrade-menu').style.display='flex'; };
        document.getElementById('btn-close-upg').onclick = () => { document.getElementById('upgrade-menu').style.display='none'; };

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
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.cam.x = this.canvas.width/2;
        this.cam.y = this.canvas.height/2;
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

    updateLeaderboardUI() {
        const setTxt = (id, val) => { const el = document.getElementById(id); if(el) el.innerText = val; };
        setTxt('stat-best-lvl', this.stats.bestDifficulty || 0);
        setTxt('stat-best-kills', this.stats.bestKills || 0);
        setTxt('stat-total-kills', this.stats.totalKills || 0);
        setTxt('stat-wars', this.stats.warsPlayed || 0);
        if (this.stats.lastSaveISO) this.updateSaveStatus(`Last saved ${this.stats.lastSaveISO}`);
    },

    getUnitStats(type) {
        const base = UNITS[type];
        if(!base) return { hp: 100, dmg: 10, speed: 1, range: 1 };
        if (type === 'soldier' || type === 'archer') {
            const multi = 1 + ((this.upgrades[type] - 1) * 0.2);
            return { ...base, hp: base.hp * multi, dmg: base.dmg * multi };
        }
        return base;
    },

    getBuildingStats(type, owner) {
        const def = COMBAT_BUILDINGS[type.toUpperCase()];
        if(owner !== 'player') return def;
        if(type === 'tower' || type === 'castle') {
            const multi = 1 + ((this.upgrades.defense - 1) * 0.25); 
            return { ...def, hp: def.hp * multi, dmg: def.dmg * multi };
        }
        return def;
    },

    getSpawnRate(baseRate) {
        const multi = Math.pow(0.9, this.upgrades.production - 1);
        return baseRate * multi;
    },

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
                if(def.income.gold) goldInc += def.income.gold;
                if(def.income.wood) woodInc += def.income.wood;
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

    updateCombat(dt) {
        for(let [k, b] of this.combat.buildings) {
            if(b.type === 'rocks') continue;
            
            // PRODUCTION
            b.prodTimer += dt;
            const def = COMBAT_BUILDINGS[b.type.toUpperCase()];
            if(!def) continue;

            // Determine correct rate: specific prodRate > upgrades > default rate
            let rate = def.prodRate || def.rate;
            if (b.owner === 'player' && def.spawn) rate = this.getSpawnRate(rate);

            if((def.spawn || def.income) && b.prodTimer >= rate) {
                b.prodTimer = 0;
                const hex = this.parseKey(k);
                
                // Income Logic (Mine OR Castle)
                if(def.income) {
                    if(b.owner === 'player') { 
                        this.gold += def.income; 
                        this.spawnTxt(hex, `+${def.income}g`, '#ffd166'); 
                    } else { 
                        this.combat.ai.gold += def.income; 
                        // Visual cue for AI mining
                        if(b.type === 'mine' && Math.random() > 0.8) this.spawnTxt(hex, `+${def.income}g`, '#ef476f'); 
                    }
                }
                
                // Spawn Logic
                if (def.spawn) {
                    this.spawnUnit(def.spawn, b.owner, hex);
                    b.pulse = 0.5;
                }
            }

            // ATTACK
            const stats = this.getBuildingStats(b.type, b.owner);
            if(stats.dmg) {
                b.attackTimer += dt;
                if(b.attackTimer >= (stats.rate || 1.0)) {
                    const hex = this.parseKey(k);
                    let target = null;
                    let minDist = stats.range;
                    
                    for(let u of this.combat.units) {
                        if(u.owner !== b.owner) {
                            const d = Hex.distance(hex, Hex.round(u.pos));
                            if(d <= minDist) { minDist = d; target = u; }
                        }
                    }

                    if(target) {
                        b.attackTimer = 0;
                        this.damageUnit(target, stats.dmg, b.owner); // New Function
                        // Visuals
                        const pStart = hex.toPixel({origin:this.cam, size:30*this.cam.zoom, ...Layout});
                        const pEnd = (new Hex(target.pos.q, target.pos.r, target.pos.s)).toPixel({origin:this.cam, size:30*this.cam.zoom, ...Layout});
                        this.combat.fx.push({ startHex: hex, endPos: target.pos, life: 0.15, color: b.owner === 'player' ? '#0ff' : '#f00' });
                    }
                }
            }
        }

        for(let i=this.combat.units.length-1; i>=0; i--) {
            let u = this.combat.units[i];
            const currentHex = Hex.round(u.pos);
            const key = currentHex.toString();
            if(this.combat.territory.has(key)) {
                const tile = this.combat.territory.get(key);
                if(tile.owner !== u.owner && tile.owner !== 'scorched') tile.owner = u.owner; 
            }
            let target = null;
            let minDist = Infinity;
            this.combat.units.forEach(other => {
                if(u.owner !== other.owner) {
                    const d = Hex.distance(currentHex, Hex.round(other.pos));
                    if(d < minDist) { minDist = d; target = other; }
                }
            });
            if(!target || minDist > 2) {
                for(let [k, b] of this.combat.buildings) {
                    if(b.owner !== u.owner) {
                        const bHex = this.parseKey(k);
                        const d = Hex.distance(currentHex, bHex);
                        if(d < minDist) { minDist = d; target = { ...b, hex: bHex, isBuilding: true, key: k }; }
                    }
                }
            }
            u.cooldown -= dt;
            if(target && minDist <= u.range) {
                if(u.cooldown <= 0) {
                    u.cooldown = 1.0;
                    if(target.isBuilding) {
                        this.damageBuilding(target.key, u.dmg);
                    } else {
                        this.damageUnit(target, u.dmg, u.owner);
                    }
                }
            } else {
                const defaultTarget = u.owner === 'player' ? {q:0, r:-8} : {q:0, r:8};
                const dest = target ? (target.pos || target.hex) : defaultTarget;
                const dq = dest.q - u.pos.q;
                const dr = dest.r - u.pos.r;
                const dist = Math.hypot(dq, dr);
                if(dist > 0.1) {
                    const speed = u.speed * dt * 0.5;
                    u.pos.q += (dq / dist) * speed;
                    u.pos.r += (dr / dist) * speed;
                    u.pos.s = -u.pos.q - u.pos.r; 
                }
            }
        }
        this.combat.units = this.combat.units.filter(u => u.hp > 0);
        this.updateHUD();

        this.combat.ai.timer += dt;
        if(this.combat.ai.timer > this.combat.ai.nextMove) {
            this.combat.ai.timer = 0;
            this.combat.ai.nextMove = 2.0 + Math.random();
            this.runAI();
        }
    },

    /** Track leaderboard totals when the player lands a final blow. */
    registerKill(owner) {
        if(owner !== 'player') return;
        this.stats.totalKills++;
        this.session.warKills++;
        this.stats.bestKills = Math.max(this.stats.bestKills, this.session.warKills);
        this.updateLeaderboardUI();
    },

    /** Persist leaderboard milestones and autosave at the end of any war outcome. */
    recordWarEnd(outcome) {
        const normalized = outcome || 'RETREAT';
        this.stats.bestDifficulty = Math.max(this.stats.bestDifficulty, this.difficulty);
        this.stats.bestKills = Math.max(this.stats.bestKills, this.session.warKills);
        this.stats.lastOutcome = normalized;
        this.updateLeaderboardUI();
        this.saveGame();
    },

    damageUnit(u, dmg, attackerOwner) {
        u.hp -= dmg;
        this.spawnTxt(u.pos, `-${Math.floor(dmg)}`, '#ff5555');

        // BOUNTY LOGIC
        if (u.hp <= 0) {
            this.spawnBurstAtHex(u.pos, 7);
            this.registerKill(attackerOwner);
            if (Math.random() > 0.5) { // 50% Chance
                const bounty = Math.floor(Math.random() * 2) + 1; // 1-2g
                if (attackerOwner === 'player') {
                    this.gold += bounty;
                    this.spawnTxt(u.pos, `+${bounty}g`, '#00ff00'); // Green text
                } else {
                    this.combat.ai.gold += bounty;
                }
            }
        }
    },

    runAI() {
        const candidates = [];
        for(let [k, t] of this.combat.territory) {
            if(t.owner === 'enemy' && !this.combat.buildings.has(k)) {
                if (this.isFrontier(k, 'enemy')) {
                    const type = this.combat.slots.get(k);
                    if(type) candidates.push({ key: k, type: type });
                }
            }
        }

        if(candidates.length > 0) {
            const choice = candidates[Math.floor(Math.random() * candidates.length)];
            const hex = this.parseKey(choice.key);
            let typeToBuy = choice.type;
            
            if(typeToBuy === 'mystery') {
                const r = Math.random();
                if(r < 0.9) typeToBuy = 'rocks';
                else {
                    const r2 = Math.random();
                    if(r2 < 0.5) typeToBuy = 'barracks'; else typeToBuy = 'lair';
                }
            }

            const def = COMBAT_BUILDINGS[typeToBuy.toUpperCase()];
            if(def && this.combat.ai.gold >= def.cost) {
                this.combat.ai.gold -= def.cost;
                this.addBuilding(hex, typeToBuy, 'enemy');
                if(typeToBuy === 'rocks') this.spawnTxt(hex, "AI: ROCKS...", '#ef476f');
                if(typeToBuy === 'lair') this.spawnTxt(hex, "AI: LEGENDARY!", '#ef476f');
            }
        }
    },

    damageBuilding(key, amt) {
        const b = this.combat.buildings.get(key);
        if(!b) return;
        b.hp -= amt;
        b.pulse = 1.0;
        if(b.hp <= 0) {
            if(b.type === 'castle') {
                this.endWar(b.owner === 'enemy' ? 'VICTORY' : 'DEFEAT');
            } else {
                const hex = this.parseKey(key);
                const isConnected = this.checkConnection(hex, b.owner);
                this.combat.buildings.delete(key);
                if (!isConnected) {
                    this.scorchEarth(key);
                    this.spawnTxt(hex, "SCORCHED!", '#000');
                } else {
                    if(b.owner === 'enemy') { this.wood += 5; this.spawnTxt(hex, "+5w", '#a67c52'); }
                }
            }
        }
    },

    checkConnection(startHex, owner) {
        const castleHex = owner === 'player' ? this.combat.castles.player : this.combat.castles.enemy;
        if(!castleHex) return true; 
        const queue = [startHex];
        const visited = new Set();
        visited.add(startHex.toString());
        while(queue.length > 0) {
            const curr = queue.shift();
            if(curr.equals(castleHex)) return true; 
            for(let i=0; i<6; i++) {
                const n = Hex.neighbor(curr, i);
                const nk = n.toString();
                if(visited.has(nk)) continue;
                const tile = this.combat.territory.get(nk);
                if(tile && tile.owner === owner && tile.owner !== 'scorched') {
                    visited.add(nk); queue.push(n);
                }
            }
        }
        return false;
    },

    scorchEarth(key) {
        const tile = this.combat.territory.get(key);
        if(tile) tile.owner = 'scorched';
    },

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

    isFrontier(key, who) {
        const tile = this.combat.territory.get(key);
        if(!tile || tile.owner !== who) return false;
        if(this.combat.buildings.has(key)) return false;

        const hex = this.parseKey(key);
        
        for(let i=0; i<6; i++) {
            const n = Hex.neighbor(hex, i);
            const b = this.combat.buildings.get(n.toString());
            if(b && b.owner === who) return true;
        }

        const opponent = who === 'player' ? 'enemy' : 'player';
        for(let q = -3; q <= 3; q++) {
            for(let r = -3; r <= 3; r++) {
                if (Math.abs(q + r) > 3) continue; 
                if (q===0 && r===0) continue;
                
                const neighbor = hex.add(new Hex(q, r, -q-r));
                const b = this.combat.buildings.get(neighbor.toString());
                if(b && b.owner === opponent) return true;
            }
        }
        return false;
    },

    buyBuilding(hex, type) {
        const def = COMBAT_BUILDINGS[type.toUpperCase()];
        if(this.gold >= def.cost) {
            this.gold -= def.cost;
            let finalType = type;
            if(type === 'mystery') {
                const roll = Math.random();
                if(roll < 0.9) { 
                    finalType = 'rocks'; 
                    this.spawnTxt(hex, "ROCKS...", '#888'); 
                } else {
                    const r2 = Math.random();
                    if(r2 < 0.5) finalType = 'barracks';
                    else {
                        finalType = 'lair'; 
                        this.spawnTxt(hex, "LEGENDARY!", '#d4f');
                    }
                }
            }
            if(finalType !== 'rocks' && finalType !== 'lair') this.spawnTxt(hex, finalType.toUpperCase(), '#fff');
            this.addBuilding(hex, finalType, 'player');
        } else {
            this.spawnTxt(hex, `Need ${def.cost}g`, '#ffd166');
        }
    },

    addBuilding(hex, type, owner) {
        let stats = this.getBuildingStats(type, owner);
        this.combat.buildings.set(hex.toString(), {
            type, owner, hp: stats.hp, maxHp: stats.hp,
            prodTimer: 0, attackTimer: Math.random(),
            pulse: 0
        });
        if (owner === 'player') this.spawnBurstAtHex(hex, 6);
    },

    spawnUnit(type, owner, hex) {
        let stats = UNITS[type];
        if (owner === 'player') stats = this.getUnitStats(type); 
        this.combat.units.push({
            type, owner, 
            pos: {q:hex.q, r:hex.r, s:hex.s},
            hp: stats.hp, maxHp: stats.hp, dmg: stats.dmg, range: stats.range, speed: stats.speed,
            cooldown: 0
        });
    },

    startWar(clickEvt) {
        const cost = (this.difficulty + 1) * 25;
        const anchorX = clickEvt ? clickEvt.clientX : window.innerWidth * 0.1;
        const anchorY = clickEvt ? clickEvt.clientY : window.innerHeight * 0.1;
        if(this.gold < cost) {
            this.spawnTxt(new Hex(0,0), `Need ${cost}g`, '#f55');
            this.showFloatingText(anchorX, anchorY, `Need ${cost}g`, 'alert-text');
            AudioFX.play('thud');
            return;
        }
        this.gold -= cost;
        this.triggerCameraShake();
        this.showFloatingText(anchorX, anchorY, 'TO WAR!', 'gold-text');
        this.spawnParticleBurst(anchorX, anchorY, 8);
        AudioFX.play('slice');
        this.resetSession();
        this.stats.warsPlayed++;
        this.updateLeaderboardUI();
        this.state = 'COMBAT';

        this.combat.territory.clear();
        this.combat.buildings.clear();
        this.combat.slots.clear();
        this.combat.units = [];
        this.combat.fx = [];
        this.combat.ai.timer = 0;
        this.combat.ai.gold = 300 + (this.difficulty * 100);

        const W = 4; const H = 9; 
        for(let r = -H; r <= H; r++) {
            const centerQ = -Math.floor(r/2); 
            for(let q = centerQ - W; q <= centerQ + W; q++) {
                const hex = new Hex(q, r);
                const key = hex.toString();
                const owner = r > 0 ? 'player' : (r < 0 ? 'enemy' : 'neutral');
                this.combat.territory.set(key, { owner, hex });
                
                const rand = Math.random();
                let type = 'mystery'; 
                if(rand > 0.8) type = 'mystery';
                else if(rand > 0.5) type = 'barracks'; 
                else if(rand > 0.25) type = 'mine'; 
                else if(rand > 0.15) type = 'range'; 
                else type = 'tower'; 
                this.combat.slots.set(key, type);
            }
        }
        
        const pHex = new Hex(-Math.floor(8/2), 8);
        const eHex = new Hex(-Math.floor(-8/2), -8);
        this.combat.castles.player = pHex;
        this.combat.castles.enemy = eHex;
        this.addBuilding(pHex, 'castle', 'player');
        this.addBuilding(eHex, 'castle', 'enemy');

        this.cam.x = this.canvas.width/2; this.cam.y = this.canvas.height/2; this.cam.zoom = 0.8;
        document.getElementById('ui-overworld').classList.remove('visible');
        document.getElementById('ui-combat').classList.add('visible');
        document.getElementById('state-txt').innerText = "WARZONE";
        this.updateHUD();
        this.showWarTip();
        this.playWarStartFX(anchorX, anchorY);
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
            AudioFX.play('slice');
        } catch (err) {
            console.warn('War FX failed; continuing combat init', err);
        }
    },

    loseOverworldHexes(count) {
        const keys = Array.from(this.overworld.hexes.keys());
        const candidates = keys.filter(k => this.overworld.hexes.get(k).type !== 'castle');
        
        let lost = 0;
        while(lost < count && candidates.length > 0) {
            const index = Math.floor(Math.random() * candidates.length);
            const keyToRemove = candidates[index];
            this.overworld.hexes.delete(keyToRemove);
            candidates.splice(index, 1); 
            lost++;
        }
        this.calcOverworldGhosts();
        return lost;
    },

    endWar(outcome, clickEvt) {
        this.state = 'OVERWORLD';
        const anchorX = clickEvt ? clickEvt.clientX : window.innerWidth * 0.5;
        const anchorY = clickEvt ? clickEvt.clientY : window.innerHeight * 0.18;

        if(outcome === 'VICTORY') {
            this.wood += 60;
            this.difficulty++;
            this.spawnTxt(new Hex(0,0), "VICTORY!", '#fff');
            this.showFloatingText(anchorX, anchorY, 'Victory!', 'gold-text');
        }
        else if(outcome === 'DEFEAT') {
            const lost = this.loseOverworldHexes(Math.floor(Math.random()*6)+5); // 5-10
            this.spawnTxt(new Hex(0,0), "CRUSHED...", '#f55');
            setTimeout(() => this.spawnTxt(new Hex(0,0), `-${lost} LAND LOST`, '#f55'), 1500);
            this.showFloatingText(anchorX, anchorY, 'Defeat...', 'alert-text');
            AudioFX.play('thud');
        }
        else if(outcome === 'RETREAT') {
            const lost = this.loseOverworldHexes(Math.floor(Math.random()*5)+1); // 1-5
            this.spawnTxt(new Hex(0,0), "FLED...", '#aaa');
            setTimeout(() => this.spawnTxt(new Hex(0,0), `-${lost} LAND LOST`, '#f55'), 1500);
            this.showFloatingText(anchorX, anchorY, 'Retreat!', 'alert-text');
            AudioFX.play('thud');
        }

        this.recordWarEnd(outcome);

        document.getElementById('ui-overworld').classList.add('visible');
        document.getElementById('ui-combat').classList.remove('visible');
        document.getElementById('state-txt').innerText = "KINGDOM";
        this.hideWarTip();
        this.updateHUD();
    },

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
        if(!free) this.spawnTxt(hex, `${type.toUpperCase()}!`, '#fff');
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
        document.getElementById('lvl-txt').innerText = `Enemy Lv.${this.difficulty}`;
        
        const cost = (this.difficulty + 1) * 25;
        document.getElementById('btn-war').innerText = `⚔️ WAR (${cost}g)`;
    },

    draw() {
        const ctx = this.ctx;
        ctx.fillStyle = '#121218'; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
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
        if(p.x<-50 || p.x>this.canvas.width+50 || p.y<-50 || p.y>this.canvas.height+50) return;
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
