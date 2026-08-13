import { DEFAULT_IMPERIAL_FAVOR } from '../imperialFavor.js';
import { DEFAULT_CLUSTER_RATE } from '../overworldAdjacency.js';
import { START_TICK } from '../timekeeper.js';
import { SNOW_VISUAL_CONFIG } from '../snowVisualConfig.js';
import {
    DEFAULT_ULTIMATE_LEVELS,
    DEFAULT_ULTIMATE_SELECTION,
    getUltimateChargeDelayMs,
    resolveUltimateSelection,
    ULTIMATE_CONFIG
} from './ultimatesConfig.js';

export const CAMERA_MOTION_CONFIG = {
    enabled: true,
    amplitude: 9,
    parallax: 0.65,
    speed: 0.18
};

/**
 * Build a lightweight axial Hex class that mirrors the browser runtime API
 * without touching DOM globals. The math matches the InputHelpers helpers
 * so tests can reason about grid coordinates without loading the UI layer.
 *
 * @param {number} [sqrt3=Math.sqrt(3)] constant used for coordinate transforms.
 * @returns {typeof Hex} constructor with the expected hex helpers attached.
 */
export function createHexFactory(_sqrt3 = Math.sqrt(3)) {
    return class Hex {
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
            const dirs = [
                new Hex(1, 0, -1), new Hex(1, -1, 0), new Hex(0, -1, 1),
                new Hex(-1, 0, 1), new Hex(-1, 1, 0), new Hex(0, 1, -1)
            ];
            return hex.add(dirs[dir]);
        }
        equals(b) { return this.q === b.q && this.r === b.r; }
        toString() { return `${this.q},${this.r}`; }
    };
}

/**
 * Create the default layout coefficients for axial hex conversions.
 * Mirrors InputHelpers.Layout but avoids reading globals so tests can
 * run in isolation.
 *
 * @param {number} [sqrt3=Math.sqrt(3)] value used for the projection matrix.
 * @returns {object} layout coefficients for hex math.
 */
export function createHexLayout(sqrt3 = Math.sqrt(3)) {
    const SQRT3 = Number.isFinite(sqrt3) ? sqrt3 : Math.sqrt(3);
    return {
        f0: SQRT3,
        f1: SQRT3 / 2.0,
        f2: 0.0,
        f3: 3.0 / 2.0,
        b0: SQRT3 / 3.0,
        b1: -1.0 / 3.0,
        b2: 0.0,
        b3: 2.0 / 3.0
    };
}

/**
 * Produce the baseline economic + research state for a new campaign.
 * Separate helper lets tests clone clean resources without triggering
 * UI, audio, or persistence wiring.
 *
 * @param {object} [options]
 * @param {number} [options.imperialFavor] starting favor buffer.
 * @param {number} [options.clusterBaseRate] base adjacency rate for reclaimed tiles.
 * @param {object} [options.fallbackStats] stats template to clone.
 * @param {string} [options.activeSaveSlot='1'] identifier to seed on load.
 * @returns {object} shallow resource state snapshot.
 */
export function buildCoreResourceState({
    imperialFavor = DEFAULT_IMPERIAL_FAVOR,
    clusterBaseRate = DEFAULT_CLUSTER_RATE,
    fallbackStats = null,
    activeSaveSlot = '1'
} = {}) {
    const statsTemplate = fallbackStats || {
        bestLevel: 0,
        bestKills: 0,
        totalKills: 0,
        warsWon: 0,
        warsFought: 0,
        lastOutcome: 'N/A',
        lastSaveISO: null
    };
    return {
        gold: 300,
        wood: 40,
        imperialFavor,
        difficulty: 0,
        upgrades: { soldier: 1, archer: 1, production: 1, mines: 1, defense: 1 },
        ultimates: { ...DEFAULT_ULTIMATE_LEVELS },
        selectedUltimate: DEFAULT_ULTIMATE_SELECTION,
        factionState: buildFactionState(),
        research: {
            technologies: [],
            bonuses: { townGoldBonus: 0, forestWoodBonus: 0, clusterBaseRate, landReclamationClusterBonus: 0 },
            lives: 0
        },
        stats: { ...statsTemplate },
        session: { warKills: 0 },
        activeSaveSlot,
        voidClicks: 0
    };
}

/**
 * Build the blank overworld container used by bootstrap and tests.
 * @returns {{hexes: Map, claimable: Map, timer: number, tickRate: number, clusterBonuses: Map}}
 */
export function buildOverworldState() {
    return { hexes: new Map(), claimable: new Map(), timer: 0, tickRate: 3.5, clusterBonuses: new Map() };
}

/**
 * Build the combat staging area with empty maps and queues.
 * @returns {object} combat state container.
 */
export function buildCombatState() {
    return {
        territory: new Map(),
        slots: new Map(),
        buildings: new Map(),
        units: [],
        particles: [],
        fx: [],
        ai: { timer: 0, nextMove: 3.0, gold: 300 },
        castles: { player: null, enemy: null },
        ultimates: buildUltimatesState()
    };
}

/**
 * Build the combat ultimate state container for a single battle.
 * Each ultimate has one charge window per battle (15–30 seconds by level)
 * and can be consumed only once; metadata tracks when effects trigger.
 * @param {object} [levelOverrides] optional per-ultimate level overrides.
 * @param {string} [selectedUltimateId] ultimate identifier selected for battle use.
 * @returns {{chargeMs: object, readyAtMs: object, consumed: object, activeEffects: object, levels: object, metadata: object, selectedId: string}}
 */
export function buildUltimatesState(levelOverrides = {}, selectedUltimateId = DEFAULT_ULTIMATE_SELECTION) {
    const safeOverrides = levelOverrides && typeof levelOverrides === 'object' ? levelOverrides : {};
    const levels = { ...DEFAULT_ULTIMATE_LEVELS, ...safeOverrides };
    const resolvedSelection = resolveUltimateSelection(selectedUltimateId);
    const chargeMs = {};
    const readyAtMs = {};
    const consumed = {};
    const activeEffects = {};
    const metadata = {};

    Object.keys(ULTIMATE_CONFIG).forEach((ultimateId) => {
        const level = Number(levels[ultimateId] ?? 1);
        const isSelected = ultimateId === resolvedSelection;
        chargeMs[ultimateId] = 0;
        readyAtMs[ultimateId] = getUltimateChargeDelayMs(ultimateId, level);
        consumed[ultimateId] = !isSelected;
        activeEffects[ultimateId] = null;
        metadata[ultimateId] = { activatedAtMs: null, lastAppliedAtMs: null };
    });

    return {
        chargeMs,
        readyAtMs,
        consumed,
        activeEffects,
        levels,
        metadata,
        selectedId: resolvedSelection
    };
}

/**
 * Provide a pure camera container so drift and zoom start predictable in tests.
 * @returns {{cam: {x: number, y: number, zoom: number}, camBase: {x: number, y: number}, camDrift: {time: number}}}
 */
export function buildCameraState() {
    return { cam: { x: 0, y: 0, zoom: 1 }, camBase: { x: 0, y: 0 }, camDrift: { time: 0 } };
}

/**
 * Supply the default snow timer bucket separate from feature toggles so
 * headless tests can control seasonal state deterministically.
 * @returns {{time: number}}
 */
export function buildSnowState() {
    return { time: 0 };
}

/**
 * Construct the feature flag tree for rendering + ambience systems.
 * @param {object} [options]
 * @param {object} [options.snowDefaults=SNOW_VISUAL_CONFIG] baseline snow overlay knobs.
 * @param {object} [options.cameraDefaults=CAMERA_MOTION_CONFIG] baseline camera drift config.
 * @returns {object} feature toggle container.
 */
export function buildFeatureToggles({
    snowDefaults = SNOW_VISUAL_CONFIG,
    cameraDefaults = CAMERA_MOTION_CONFIG
} = {}) {
    return {
        snow: { ...snowDefaults },
        camera: { ...cameraDefaults },
        overworld: { showClaimCosts: false }
    };
}

/**
 * Generate the configuration object passed into the Timekeeper constructor.
 * @param {number} [startTick=START_TICK] tick offset used for the calendar.
 * @returns {{startTick: number}} timekeeper options.
 */
export function buildTimekeeperConfig(startTick = START_TICK) {
    const safeStartTick = Number.isFinite(startTick) ? startTick : START_TICK;
    return { startTick: safeStartTick };
}

/**
 * Build the baseline faction standing snapshot for save files and HUD displays.
 * Standings are expressed on a 0-100 scale and start at a neutral midpoint.
 * @returns {{standings: object, recentContributors: object}} faction-state container.
 */
export function buildFactionState() {
    return {
        standings: {
            crown: 50,
            reformers: 50,
            guilds: 50,
            masses: 50,
            frontier: 50
        },
        recentContributors: {
            crown: [],
            reformers: [],
            guilds: [],
            masses: [],
            frontier: []
        }
    };
}
