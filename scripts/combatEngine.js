/**
 * Combat engine module encapsulating battle setup, simulation, and resolution.
 * Functions accept the live game object so they can operate without owning
 * global state directly.
 */
import {
    COMBAT_BUILDINGS,
    UNITS,
    calculateDefeatGoldOutcome,
    calculateVictoryRewards,
    computeWarEntryFee,
    deriveAIPrep,
    formatLossSummary,
    getBuildingStats,
    getSpawnRate,
    getUnitStats
} from './combat/math.js';
import { createCombatUI, flashOverworldLosses } from './combat/ui.js';

const ImperialMandates = (typeof window !== 'undefined' && window.ImperialMandates)
    ? window.ImperialMandates
    : (typeof require === 'function' ? require('./imperialMandates.js') : {});

const GLOBAL_HEX = (typeof window !== 'undefined' && window.Hex)
    || (typeof global !== 'undefined' && global.Hex)
    || null;

/**
 * Resolve the Hex dependency so callers can inject test doubles instead of relying
 * on globals. Falls back to a global when available for backward compatibility.
 * @param {object} game current game object that may expose a Hex constructor.
 * @param {object} [hexImpl] optional override for the Hex implementation.
 * @returns {object} Hex implementation.
 * @throws {Error} when no Hex implementation can be found.
 */
function resolveHex(game, hexImpl) {
    const impl = hexImpl || game?.Hex || GLOBAL_HEX;
    if (!impl) throw new Error('Combat engine requires a Hex implementation');
    return impl;
}

// Stat and economy helpers live in ./combat/math.js to keep this engine focused on orchestration and state.

/**
 * Simulate combat state for one frame: production, targeting, AI purchases, and movement.
 * @param {object} game current game object.
 * @param {number} dt delta time in seconds.
 * @param {object} [hexImpl] optional Hex implementation for spatial math.
 */
export function updateCombat(game, dt, hexImpl) {
    const Hex = resolveHex(game, hexImpl);
    for(let [k, b] of game.combat.buildings) {
        if(b.type === 'rocks') continue;

        // PRODUCTION
        b.prodTimer += dt;
        const def = COMBAT_BUILDINGS[b.type.toUpperCase()];
        if(!def) continue;

        // Determine correct rate: specific prodRate > upgrades > default rate
        let rate = def.prodRate || def.rate;
        if (b.owner === 'player' && def.spawn) rate = getSpawnRate(game, rate);

        if((def.spawn || def.income) && b.prodTimer >= rate) {
            b.prodTimer = 0;
            const hex = game.parseKey(k);

            // Income Logic (Mine OR Castle)
            if(def.income) {
                if(b.owner === 'player') {
                    game.gold += def.income;
                    game.spawnTxt(hex, `+${def.income}g`, '#ffd166');
                } else {
                    game.combat.ai.gold += def.income;
                    // Visual cue for AI mining
                    if(b.type === 'mine' && Math.random() > 0.8) game.spawnTxt(hex, `+${def.income}g`, '#ef476f');
                }
            }

            // Spawn Logic
            if (def.spawn) {
                spawnUnit(game, def.spawn, b.owner, hex);
                b.pulse = 0.5;
            }
        }

        // ATTACK
        const stats = getBuildingStats(game, b.type, b.owner);
        if(stats.dmg) {
            b.attackTimer += dt;
            if(b.attackTimer >= (stats.rate || 1.0)) {
                const hex = game.parseKey(k);
                let target = null;
                let minDist = stats.range;

                for(let u of game.combat.units) {
                    if(u.owner !== b.owner) {
                        const d = Hex.distance(hex, Hex.round(u.pos));
                        if(d <= minDist) { minDist = d; target = u; }
                    }
                }

                if(target) {
                    b.attackTimer = 0;
                    damageUnit(game, target, stats.dmg, b.owner);
                    if (b.type === 'tower' || b.type === 'castle') game.playSound('tower', { allowOverlap: true });
                    game.combat.fx.push({ startHex: hex, endPos: target.pos, life: 0.15, color: b.owner === 'player' ? '#0ff' : '#f00' });
                }
            }
        }
    }

    for(let i=game.combat.units.length-1; i>=0; i--) {
        let u = game.combat.units[i];
        const currentHex = Hex.round(u.pos);
        const key = currentHex.toString();
        if(game.combat.territory.has(key)) {
            const tile = game.combat.territory.get(key);
            if(tile.owner !== u.owner && tile.owner !== 'scorched') tile.owner = u.owner;
        }
        let target = null;
        let minDist = Infinity;
        game.combat.units.forEach(other => {
            if(u.owner !== other.owner) {
                const d = Hex.distance(currentHex, Hex.round(other.pos));
                if(d < minDist) { minDist = d; target = other; }
            }
        });
        if(!target || minDist > u.range) {
            for(let [bk, b] of game.combat.buildings) {
                if(b.owner !== u.owner) {
                    const bHex = game.parseKey(bk);
                    const d = Hex.distance(currentHex, bHex);
                    if(d < minDist) { minDist = d; target = { ...b, hex: bHex, isBuilding: true, key: bk }; }
                }
            }
        }
        u.cooldown -= dt;
        if(target && minDist <= u.range) {
            if(u.cooldown <= 0) {
                u.cooldown = 1.0;
                if (u.type === 'archer') game.playSound('arrow', { allowOverlap: true });
                if (u.type === 'soldier') game.playSound('sword', { allowOverlap: true });
                if (u.type === 'dragon') game.playSound('rare', { allowOverlap: true });
                if(target.isBuilding) {
                    damageBuilding(game, target.key, u.dmg, u.owner);
                } else {
                    damageUnit(game, target, u.dmg, u.owner);
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
    game.combat.units = game.combat.units.filter(u => u.hp > 0);
    game.updateHUD();

    game.combat.ai.timer += dt;
    if(game.combat.ai.timer > game.combat.ai.nextMove) {
        game.combat.ai.timer = 0;
        game.combat.ai.nextMove = 2.0 + Math.random();
        runAI(game);
    }
}

/** Track leaderboard totals when the player lands a final blow. */
export function registerKill(game, owner) {
    if(owner !== 'player') return;
    game.stats.totalKills++;
    game.session.warKills++;
    game.stats.bestKills = Math.max(game.stats.bestKills, game.session.warKills);
    game.updateLeaderboardUI();
}

/**
 * Persist leaderboard milestones and autosave at the end of any war outcome.
 * @param {object} game current game object.
 * @param {string} outcome final result label.
 */
export function recordWarEnd(game, outcome) {
    const normalized = outcome || 'RETREAT';
    game.stats.bestLevel = Math.max(game.stats.bestLevel, game.difficulty);
    game.stats.bestKills = Math.max(game.stats.bestKills, game.session.warKills);
    game.stats.lastOutcome = normalized;
    game.updateLeaderboardUI();
    game.saveGame();
}

/**
 * Apply damage to a unit, award bounty, and trigger kill bookkeeping.
 * @param {object} game current game object.
 * @param {object} u target unit.
 * @param {number} dmg damage amount.
 * @param {string} attackerOwner attacking side.
 */
export function damageUnit(game, u, dmg, attackerOwner) {
    u.hp -= dmg;
    game.spawnTxt(u.pos, `-${Math.floor(dmg)}`, '#ff5555');

    // BOUNTY LOGIC
    if (u.hp <= 0) {
        game.spawnBurstAtHex(u.pos, 7);
        registerKill(game, attackerOwner);
        if (Math.random() > 0.5) { // 50% Chance
            const bounty = Math.floor(Math.random() * 2) + 1; // 1-2g
            if (attackerOwner === 'player') {
                game.gold += bounty;
                game.spawnTxt(u.pos, `+${bounty}g`, '#00ff00'); // Green text
            } else {
                game.combat.ai.gold += bounty;
            }
        }
    }
}

/**
 * Handle AI building purchases at the frontier.
 * @param {object} game current game object.
 */
export function runAI(game) {
    const candidates = [];
    for(let [k, t] of game.combat.territory) {
        if(t.owner === 'enemy' && !game.combat.buildings.has(k)) {
            if (isFrontier(game, k, 'enemy')) {
                const type = game.combat.slots.get(k);
                if(type) candidates.push({ key: k, type: type });
            }
        }
    }

    if(candidates.length > 0) {
        const choice = candidates[Math.floor(Math.random() * candidates.length)];
        const hex = game.parseKey(choice.key);
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
        if(def && game.combat.ai.gold >= def.cost) {
            game.combat.ai.gold -= def.cost;
            addBuilding(game, hex, typeToBuy, 'enemy');
            if(typeToBuy === 'rocks') game.spawnTxt(hex, "AI: ROCKS...", '#ef476f');
            if(typeToBuy === 'lair') game.spawnTxt(hex, "AI: LEGENDARY!", '#ef476f');
        }
    }
}

/**
 * Damage a building and resolve destruction, scorch checks, and victory conditions.
 * @param {object} game current game object.
 * @param {string} key hex key of the building.
 * @param {number} amt incoming damage.
 * @param {string} [attackerOwner] faction id of the attacker (player|enemy).
 */
export function damageBuilding(game, key, amt, attackerOwner) {
    const b = game.combat.buildings.get(key);
    if(!b) return;
    b.hp -= amt;
    b.pulse = 1.0;
    if(b.hp <= 0) {
        if(b.type === 'castle') {
            endWar(game, b.owner === 'enemy' ? 'VICTORY' : 'DEFEAT');
        } else {
            const hex = game.parseKey(key);
            const isConnected = checkConnection(game, hex, b.owner);
            game.combat.buildings.delete(key);
            scorchEarth(game, key);
            if (!isConnected) {
                game.spawnTxt(hex, "SCORCHED!", '#000');
            } else if(b.owner === 'enemy' && attackerOwner === 'player') {
                game.wood += 5;
                game.spawnTxt(hex, "+5w", '#a67c52');
            }
        }
    }
}

/**
 * Determine whether a tile remains connected to its castle.
 * @param {object} game current game object.
 * @param {object} startHex hex to trace from.
 * @param {string} owner controlling side.
 * @param {object} [hexImpl] optional Hex implementation for connectivity checks.
 * @returns {boolean} true if connected.
 */
export function checkConnection(game, startHex, owner, hexImpl) {
    const Hex = resolveHex(game, hexImpl);
    const castleHex = owner === 'player' ? game.combat.castles.player : game.combat.castles.enemy;
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
            const tile = game.combat.territory.get(nk);
            if(tile && tile.owner === owner && tile.owner !== 'scorched') {
                visited.add(nk); queue.push(n);
            }
        }
    }
    return false;
}

/** Mark a tile as permanently scorched. */
export function scorchEarth(game, key) {
    const tile = game.combat.territory.get(key);
    if(tile) tile.owner = 'scorched';
}

/**
 * Evaluate whether a tile is a frontier position for a faction.
 * @param {object} game current game object.
 * @param {string} key hex key.
 * @param {string} who faction id (player|enemy).
 * @param {object} [hexImpl] optional Hex implementation for spatial checks.
 * @returns {boolean} true when buildable.
 */
export function isFrontier(game, key, who, hexImpl) {
    const Hex = resolveHex(game, hexImpl);
    const tile = game.combat.territory.get(key);
    if(!tile || tile.owner !== who) return false;
    if(game.combat.buildings.has(key)) return false;

    const hex = game.parseKey(key);

    // Consider proximity to the owning side's castle as frontier too —
    // this ensures tiles directly next to the castle are buildable at war start
    // even if no other friendly buildings have been placed yet.
    const castleHex = game?.combat?.castles?.[who];
    if (castleHex && Hex.distance(hex, castleHex) === 1) {
        const neighbors = Array.from({ length: 6 }, (_unused, i) => Hex.neighbor(hex, i));
        const matchesCastle = neighbors.some((n) => {
            if (typeof n.equals === 'function') return n.equals(castleHex);
            return n.toString() === castleHex.toString();
        });
        if (matchesCastle) return true;
    }

    for(let i=0; i<6; i++) {
        const n = Hex.neighbor(hex, i);
        const b = game.combat.buildings.get(n.toString());
        if(b && b.owner === who) return true;
    }

    const opponent = who === 'player' ? 'enemy' : 'player';
    for(let q = -3; q <= 3; q++) {
        for(let r = -3; r <= 3; r++) {
            if (Math.abs(q + r) > 3) continue;
            if (q===0 && r===0) continue;

            const neighbor = hex.add(new Hex(q, r, -q-r));
            const b = game.combat.buildings.get(neighbor.toString());
            if(b && b.owner === opponent) return true;
        }
    }
    return false;
}

/**
 * Attempt to purchase a building for the player, handling mystery rolls and feedback.
 * @param {object} game current game object.
 * @param {object} hex hex coordinate object.
 * @param {string} type requested building type.
 */
export function buyBuilding(game, hex, type) {
    const def = COMBAT_BUILDINGS[type.toUpperCase()];
    if(game.gold >= def.cost) {
        game.gold -= def.cost;
        let finalType = type;
        if(type === 'mystery') {
            const roll = Math.random();
            if(roll < 0.9) {
                finalType = 'rocks';
                game.spawnTxt(hex, "ROCKS...", '#888');
            } else {
                const r2 = Math.random();
                if(r2 < 0.5) finalType = 'barracks';
                else {
                    finalType = 'lair';
                    game.spawnTxt(hex, "LEGENDARY!", '#d4f');
                }
            }
        }
        if(finalType !== 'rocks' && finalType !== 'lair') game.spawnTxt(hex, finalType.toUpperCase(), '#fff');
        addBuilding(game, hex, finalType, 'player');
    } else {
        game.spawnTxt(hex, `Need ${def.cost}g`, '#ffd166');
    }
}

/**
 * Register a new combat building in the map state.
 * @param {object} game current game object.
 * @param {object} hex hex coordinate.
 * @param {string} type building type.
 * @param {string} owner side placing the structure.
 */
export function addBuilding(game, hex, type, owner) {
    let stats = getBuildingStats(game, type, owner);
    game.combat.buildings.set(hex.toString(), {
        type, owner, hp: stats.hp, maxHp: stats.hp,
        prodTimer: 0, attackTimer: Math.random(),
        pulse: 0
    });
    if (owner === 'player') game.spawnBurstAtHex(hex, 6);
}

/**
 * Spawn a unit at a specific hex for the given owner.
 * @param {object} game current game object.
 * @param {string} type unit id.
 * @param {string} owner owning side.
 * @param {object} hex spawn position.
 */
export function spawnUnit(game, type, owner, hex) {
    let stats = UNITS[type];
    if (owner === 'player') stats = getUnitStats(game, type);
    game.combat.units.push({
        type, owner,
        pos: {q:hex.q, r:hex.r, s:hex.s},
        hp: stats.hp, maxHp: stats.hp, dmg: stats.dmg, range: stats.range, speed: stats.speed,
        cooldown: 0
    });
}

/**
 * Begin a new war instance if the player can afford it, seeding the map and UI state.
 * @param {object} game current game object.
 * @param {Event} clickEvt initiating click (optional).
 * @param {object} [hexImpl] optional Hex implementation for grid generation.
 */
export function startWar(game, clickEvt, hexImpl) {
    const Hex = resolveHex(game, hexImpl);
    const cost = computeWarEntryFee(game);
    const anchorX = clickEvt ? clickEvt.clientX : window.innerWidth * 0.1;
    const anchorY = clickEvt ? clickEvt.clientY : window.innerHeight * 0.1;
    if(cost > 0 && game.gold < cost) {
        game.spawnTxt(new Hex(0,0), `Need ${cost}g`, '#f55');
        game.showFloatingText(anchorX, anchorY, `Need ${cost}g`, 'alert-text');
        return;
    }
    if (cost > 0) game.gold -= cost;
    window.enterCombat?.();
    game.triggerCameraShake();
    game.showFloatingText(anchorX, anchorY, 'TO WAR!', 'gold-text');
    game.spawnParticleBurst(anchorX, anchorY, 8);
    game.resetSession();
    game.stats.warsFought++;
    game.updateLeaderboardUI();
    game.state = 'COMBAT';

    game.combat.territory.clear();
    game.combat.buildings.clear();
    game.combat.slots.clear();
    game.combat.units = [];
    game.combat.fx = [];
    const aiPrep = deriveAIPrep(game);
    game.combat.ai.timer = 0;
    game.combat.ai.nextMove = aiPrep.nextMove;
    game.combat.ai.gold = aiPrep.gold;

    const W = 4; const H = 9;
    for(let r = -H; r <= H; r++) {
        const centerQ = -Math.floor(r/2);
        for(let q = centerQ - W; q <= centerQ + W; q++) {
            const hex = new Hex(q, r);
            const key = hex.toString();
            // Ownership layout: player controls rows above the equator (r > 0), enemy controls
            // rows below (r < 0), and the equator (r === 0) forms a neutral no-man's-land that
            // must be captured by marching units across it.
            const owner = r === 0
                ? 'neutral'
                : (r > 0
                    ? 'player'
                    : 'enemy');
            game.combat.territory.set(key, { owner, hex });

            const rand = Math.random();
            let type = 'mystery';
            if(rand > 0.8) type = 'mystery';
            else if(rand > 0.5) type = 'barracks';
            else if(rand > 0.25) type = 'mine';
            else if(rand > 0.15) type = 'range';
            else type = 'tower';
            game.combat.slots.set(key, type);
        }
    }

    const pHex = new Hex(-Math.floor(8/2), 8);
    const eHex = new Hex(-Math.floor(-8/2), -8);
    game.combat.castles.player = pHex;
    game.combat.castles.enemy = eHex;
    addBuilding(game, pHex, 'castle', 'player');
    addBuilding(game, eHex, 'castle', 'enemy');

    const warZoom = game.deviceProfile && game.deviceProfile.isMobile
        ? game.deviceProfile.baseZoom
        : 0.8;
    game.cam.x = game.viewport.width / 2; game.cam.y = game.viewport.height / 2; game.cam.zoom = warZoom;
    document.getElementById('ui-overworld').classList.remove('visible');
    document.getElementById('ui-combat').classList.add('visible');
    document.getElementById('state-txt').innerText = "WARZONE";
    game.updateHUD();
    game.showWarTip();
    game.playWarStartFX(anchorX, anchorY);
}

/**
 * Strip overworld control as a defeat/retreat penalty while honoring
 * protected coordinates (e.g., the rebel camp that initiated the war).
 * Frontier tiles are converted into either scorched ruins or rebel-owned
 * territory (50/50 chance) instead of being deleted outright. We maintain the
 * coordinates in the map for UI continuity while treating the converted tiles
 * as "lost" for subsequent frontier calculations.
 * @param {object} game current game object.
 * @param {number} count number of tiles to convert.
 * @param {Set<string>} [protectedKeys] tile keys that cannot be converted.
 * @returns {{lost:number, conversions:Array<{key:string, fate:string, hex:object}>, counts:{scorched:number, rebel:number}, convertedKeys:Set<string>}}
 *          report describing converted tiles.
 */
export function loseOverworldHexes(game, count, protectedKeys = new Set()) {
    const Hex = resolveHex(game);
    const currentKeys = new Set(game.overworld.hexes.keys());
    const removableKeys = new Set(
        [...currentKeys].filter((k) => game.overworld.hexes.get(k).type !== 'castle' && !protectedKeys.has(k))
    );

    const parseKey = (key) => {
        const [q, r] = key.split(',').map(Number);
        return new Hex(q, r, -q - r);
    };

    const hexDistance = (hex) => {
        const s = typeof hex.s === 'number' ? hex.s : -hex.q - hex.r;
        return (Math.abs(hex.q) + Math.abs(hex.r) + Math.abs(s)) / 2;
    };

    const isFrontierKey = (key) => {
        const hex = parseKey(key);
        for (let i = 0; i < 6; i++) {
            const neighborKey = Hex.neighbor(hex, i).toString();
            if (!currentKeys.has(neighborKey)) return true;
        }
        return false;
    };

    const convertTileToPenalty = (key, fateOverride) => {
        const tile = game.overworld.hexes.get(key) || { hex: parseKey(key) };
        const fate = fateOverride || (Math.random() < 0.65 ? 'rebel' : 'scorched');
        tile.type = fate;
        tile.owner = fate;
        tile.hex = tile.hex || parseKey(key);
        if (tile.isRebelCamp && fate !== 'rebelcamp') tile.isRebelCamp = false;
        game.overworld.hexes.set(key, tile);
        return { key, fate, hex: tile.hex };
    };

    const conversions = [];

    let lost = 0;
    while (lost < count && removableKeys.size > 0) {
        const frontier = [...removableKeys].filter((k) => isFrontierKey(k));
        const pool = frontier.length > 0 ? frontier : [...removableKeys];

        const sortedPool = pool
            .map((k) => ({ key: k, hex: parseKey(k) }))
            .sort((a, b) => {
                const distDelta = hexDistance(b.hex) - hexDistance(a.hex);
                if (distDelta !== 0) return distDelta;
                return a.key.localeCompare(b.key);
            });
        const keyToRemove = sortedPool[0].key;

        // Ensure the first (farthest) loss always burns to provide a deterministic anchor.
        const fateOverride = conversions.length === 0 ? 'scorched' : null;

        conversions.push(convertTileToPenalty(keyToRemove, fateOverride));
        removableKeys.delete(keyToRemove);
        currentKeys.delete(keyToRemove);
        lost++;
    }

    game.calcOverworldGhosts();
    if (typeof game.refreshClusterBonuses === 'function') {
        game.refreshClusterBonuses();
    }

    const counts = conversions.reduce(
        (tally, conv) => ({ ...tally, [conv.fate]: (tally[conv.fate] || 0) + 1 }),
        { scorched: 0, rebel: 0 }
    );

    return {
        lost,
        conversions,
        counts,
        convertedKeys: new Set(conversions.map((conv) => conv.key))
    };
}

/**
 * Resolve war termination, distributing rewards and penalties before returning to overworld state.
 * @param {object} game current game object.
 * @param {string} outcome VICTORY|DEFEAT|RETREAT label.
 * @param {Event} clickEvt initiating click (optional).
 * @param {object} [hexImpl] optional Hex implementation for summary text anchors.
 * @param {{ ui?: object, math?: object, uiOptions?: object }} [handlers] injection points for FX and math helpers.
 */
export function endWar(game, outcome, clickEvt, hexImpl, handlers = {}) {
    const Hex = resolveHex(game, hexImpl);
    const ui = handlers.ui || createCombatUI(game, handlers.uiOptions);
    const math = handlers.math || { calculateVictoryRewards, calculateDefeatGoldOutcome, formatLossSummary };
    const anchor = ui?.resolveAnchor?.(clickEvt) || { x: 0, y: 0 };

    game.state = 'OVERWORLD';
    const normalizedOutcome = (outcome || '').toLowerCase();
    let result = outcome;
    const startingDifficulty = Math.max(0, Number.isFinite(game?.difficulty) ? game.difficulty : 0);
    const targetTile = game.pendingClearTile;
    const targetKey = targetTile?.hex?.toString?.() || targetTile?.toString?.();
    const protectedTargets = targetKey ? new Set([targetKey]) : new Set();
    const mandateProtected = ImperialMandates?.getProtectedOverworldKeys?.() || new Set();
    mandateProtected.forEach((k) => protectedTargets.add(k));

    ui?.exitCombat?.(normalizedOutcome);

    if(outcome === 'DEFEAT' && game.research.lives > 0) {
        game.research.lives -= 1;
        result = 'REVIVE';
    }

    if (ImperialMandates?.handleBattleOutcome) {
        ImperialMandates.handleBattleOutcome(result, targetTile, game);
    }

    if(result === 'VICTORY') {
        const { gold = 0, wood = 0, levy = 0 } = math.calculateVictoryRewards?.(game) || {};

        if (levy > 0) {
            game.spawnTxt(new Hex(0,0), `-${levy}g royal levy`, '#fbbf24');
            ui?.showFloatingText?.(anchor, `Royal levy ${levy}g`, 'alert-text');
        }

        game.gold += gold;
        game.wood += wood;
        game.difficulty = startingDifficulty + 1;
        game.spawnTxt(new Hex(0,0), `VICTORY +${gold}g +${wood}w`, '#fff');
        ui?.showFloatingText?.(anchor, 'Victory!', 'gold-text');
    }
    else if(result === 'DEFEAT') {
        const { penalty = 0, levy = 0, remaining = game.gold } = math.calculateDefeatGoldOutcome?.(game) || {};
        if (penalty > 0) {
            game.gold -= penalty;
            game.spawnTxt(new Hex(0,0), `-${penalty}g pillaged`, '#f55');
            ui?.showFloatingText?.(anchor, `Lost ${penalty}g`, 'alert-text');
        }

        if (levy > 0) {
            game.gold = remaining;
            game.spawnTxt(new Hex(0,0), `-${levy}g royal levy`, '#fbbf24');
            ui?.showFloatingText?.(anchor, `Royal levy ${levy}g`, 'alert-text');
        }

        const losses = loseOverworldHexes(game, Math.floor(Math.random()*6)+5, protectedTargets); // 5-10
        game.spawnTxt(new Hex(0,0), "CRUSHED...", '#f55');
        ui?.delay?.(() => game.spawnTxt(new Hex(0,0), `-${losses.lost} LAND LOST`, '#f55'), 1500);
        ui?.flashOverworldLosses?.(losses);
        ui?.showFloatingText?.(anchor, math.formatLossSummary?.('Defeat', losses) || '', 'alert-text');
    }
    else if(result === 'RETREAT') {
        const losses = loseOverworldHexes(game, Math.floor(Math.random()*5)+1, protectedTargets); // 1-5
        game.spawnTxt(new Hex(0,0), "FLED...", '#aaa');
        ui?.delay?.(() => game.spawnTxt(new Hex(0,0), `-${losses.lost} LAND LOST`, '#f55'), 1500);
        ui?.flashOverworldLosses?.(losses);
        ui?.showFloatingText?.(anchor, math.formatLossSummary?.('Retreat', losses) || '', 'alert-text');
    }

    recordWarEnd(game, result);

    ui?.toggleToOverworldUI?.();
    game.hideWarTip();
    game.updateHUD();
    game.armAmbientLoop();
}

// CommonJS compatibility for Node-based tests while preserving ESM exports for bundlers/browsers.
if (typeof module !== 'undefined') {
    module.exports = {
        COMBAT_BUILDINGS,
        UNITS,
        computeWarEntryFee,
        deriveAIPrep,
        getUnitStats,
        getBuildingStats,
        getSpawnRate,
        updateCombat,
        registerKill,
        recordWarEnd,
        damageUnit,
        runAI,
        damageBuilding,
        checkConnection,
        scorchEarth,
        isFrontier,
        buyBuilding,
        addBuilding,
        spawnUnit,
        startWar,
        loseOverworldHexes,
        formatLossSummary,
        endWar
    };
}
