/**
 * Combat engine module encapsulating battle setup, simulation, and resolution.
 * Functions accept the live game object so they can operate without owning
 * global state directly.
 */
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

/** Definitions for buildable structures in combat mode. */
export const COMBAT_BUILDINGS = {
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

/** Base unit stats before upgrades are applied. */
export const UNITS = {
    soldier: { hp: 150, dmg: 12, speed: 2.0, range: 1, char: '⚔️' },
    archer:  { hp: 70,  dmg: 18, speed: 1.8, range: 3, char: '🏹' },
    dragon:  { hp: 1200, dmg: 80, speed: 1.5, range: 2, char: '🐲' }
};

/**
 * Compute the entry fee for launching a war. Wars are currently free to start.
 * Previous behavior: fee = (game.difficulty + 1) * 25;
 * @param {object} game current game object (difficulty may influence future fees).
 * @returns {number} gold required to initiate battle (zero by default).
 */
export function computeWarEntryFee(game) { // eslint-disable-line no-unused-vars
    return 0;
}

/**
 * Compute a player's unit statistics with upgrade multipliers applied.
 * @param {object} game current game object containing upgrade levels.
 * @param {string} type unit id.
 * @returns {object} derived stat block.
 */
export function getUnitStats(game, type) {
    const base = UNITS[type];
    if(!base) return { hp: 100, dmg: 10, speed: 1, range: 1 };
    if (type === 'soldier' || type === 'archer') {
        const level = Number(game.upgrades?.[type] ?? 1);
        const multi = 1 + ((level - 1) * 0.2);
        return { ...base, hp: base.hp * multi, dmg: base.dmg * multi };
    }
    return base;
}

/**
 * Resolve structure statistics for the specified owner, applying defense upgrades when appropriate.
 * @param {object} game current game object containing upgrade levels.
 * @param {string} type building id.
 * @param {string} owner owner key (player|enemy).
 * @returns {object} structure definition merged with modifiers.
 */
export function getBuildingStats(game, type, owner) {
    const def = COMBAT_BUILDINGS[type.toUpperCase()];
    if(owner !== 'player') return def;
    if(type === 'tower' || type === 'castle') {
        const level = Number(game.upgrades?.defense ?? 1);
        const multi = 1 + ((level - 1) * 0.25);
        return { ...def, hp: def.hp * multi, dmg: def.dmg * multi };
    }
    return def;
}

/**
 * Apply the player's production upgrades to a baseline spawn rate.
 * @param {object} game current game object containing production upgrades.
 * @param {number} baseRate base spawn time in seconds.
 * @returns {number} adjusted spawn rate.
 */
export function getSpawnRate(game, baseRate) {
    const level = Number(game.upgrades?.production ?? 1);
    const multi = Math.pow(0.9, level - 1);
    return baseRate * multi;
}

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
    game.stats.bestDifficulty = Math.max(game.stats.bestDifficulty, game.difficulty);
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
            if (!isConnected) {
                scorchEarth(game, key);
                game.spawnTxt(hex, "SCORCHED!", '#000');
            } else {
                if(b.owner === 'enemy' && attackerOwner === 'player') {
                    game.wood += 5;
                    game.spawnTxt(hex, "+5w", '#a67c52');
                }
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
    game.stats.warsPlayed++;
    game.updateLeaderboardUI();
    game.state = 'COMBAT';

    game.combat.territory.clear();
    game.combat.buildings.clear();
    game.combat.slots.clear();
    game.combat.units = [];
    game.combat.fx = [];
    game.combat.ai.timer = 0;
    game.combat.ai.gold = 300 + (game.difficulty * 100);

    const W = 4; const H = 9;
    for(let r = -H; r <= H; r++) {
        const centerQ = -Math.floor(r/2);
        for(let q = centerQ - W; q <= centerQ + W; q++) {
            const hex = new Hex(q, r);
            const key = hex.toString();
            const owner = r > 0 ? 'player' : (r < 0 ? 'enemy' : 'neutral');
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

    const convertTileToPenalty = (key) => {
        const tile = game.overworld.hexes.get(key) || { hex: parseKey(key) };
        const fate = Math.random() < 0.5 ? 'scorched' : 'rebel';
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

        const keyToRemove = pool
            .map((k) => ({ key: k, hex: parseKey(k) }))
            .sort((a, b) => {
                const distDelta = hexDistance(b.hex) - hexDistance(a.hex);
                if (distDelta !== 0) return distDelta;
                return a.key.localeCompare(b.key);
            })[0].key;

        conversions.push(convertTileToPenalty(keyToRemove));
        removableKeys.delete(keyToRemove);
        currentKeys.delete(keyToRemove);
        lost++;
    }

    game.calcOverworldGhosts();

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
 * Summarize overworld losses for a given war outcome so UI overlays can surface
 * a player-facing recap without duplicating string logic across branches.
 * @param {string} outcomeLabel canonical outcome label (e.g., "Defeat").
 * @param {{counts:{scorched:number, rebel:number}}} lossReport aggregated loss data.
 * @returns {string} formatted summary sentence.
 */
export function formatLossSummary(outcomeLabel, lossReport = { counts: {} }) {
    const counts = lossReport.counts || {};
    const segments = [];
    if (counts.scorched) segments.push(`${counts.scorched} tile${counts.scorched === 1 ? '' : 's'} scorched`);
    if (counts.rebel) segments.push(`${counts.rebel} seized by rebels`);
    const baseLabel = outcomeLabel || 'Outcome';
    const prefix = `${baseLabel[0].toUpperCase()}${baseLabel.slice(1).toLowerCase()}`;
    return segments.length > 0 ? `${prefix}: ${segments.join(', ')}` : `${prefix}: No land lost`;
}

/**
 * Emit brief visual indicators at each converted overworld hex so players can
 * locate the fallout of a defeat/retreat without opening new UI chrome.
 * @param {object} game live game object containing FX helpers.
 * @param {{conversions:Array<{hex:object, fate:string}>}} lossReport description of converted tiles.
 */
function flashOverworldLosses(game, lossReport = { conversions: [] }) {
    const { conversions = [] } = lossReport;
    if (!Array.isArray(conversions) || conversions.length === 0) return;

    conversions.forEach(({ hex, fate }) => {
        if (!hex || typeof game.projectHexToScreen !== 'function') return;
        const pos = game.projectHexToScreen(hex);
        if (!pos) return;

        const colors = fate === 'rebel' ? ['#ef476f', '#ffd166'] : ['#9ca3af', '#6b7280'];
        game.spawnParticleBurst?.(pos.x, pos.y, 6, colors);
        const label = fate === 'rebel' ? 'Seized' : 'Scorched';
        game.showFloatingText?.(pos.x, pos.y, label, 'alert-text');
    });
}

/**
 * Resolve war termination, distributing rewards and penalties before returning to overworld state.
 * @param {object} game current game object.
 * @param {string} outcome VICTORY|DEFEAT|RETREAT label.
 * @param {Event} clickEvt initiating click (optional).
 * @param {object} [hexImpl] optional Hex implementation for summary text anchors.
 */
export function endWar(game, outcome, clickEvt, hexImpl) {
    const Hex = resolveHex(game, hexImpl);
    game.state = 'OVERWORLD';
    const anchorX = clickEvt ? clickEvt.clientX : window.innerWidth * 0.5;
    const anchorY = clickEvt ? clickEvt.clientY : window.innerHeight * 0.18;
    const normalizedOutcome = (outcome || '').toLowerCase();
    let result = outcome;
    const targetTile = game.pendingClearTile;
    const targetKey = targetTile?.hex?.toString?.() || targetTile?.toString?.();
    const protectedTargets = targetKey ? new Set([targetKey]) : new Set();
    const mandateProtected = ImperialMandates?.getProtectedOverworldKeys?.() || new Set();
    mandateProtected.forEach((k) => protectedTargets.add(k));

    window.exitCombat?.(normalizedOutcome);

    if(outcome === 'DEFEAT' && game.research.lives > 0) {
        game.research.lives -= 1;
        result = 'REVIVE';
    }

    if (ImperialMandates?.handleBattleOutcome) {
        ImperialMandates.handleBattleOutcome(result, targetTile, game);
    }

    if(result === 'VICTORY') {
        game.wood += 60;
        game.difficulty++;
        game.spawnTxt(new Hex(0,0), "VICTORY!", '#fff');
        game.showFloatingText(anchorX, anchorY, 'Victory!', 'gold-text');
    }
    else if(result === 'DEFEAT') {
        const losses = loseOverworldHexes(game, Math.floor(Math.random()*6)+5, protectedTargets); // 5-10
        // TODO: In future, apply a gold loss penalty on defeat (lose battle = lose gold).
        game.spawnTxt(new Hex(0,0), "CRUSHED...", '#f55');
        setTimeout(() => game.spawnTxt(new Hex(0,0), `-${losses.lost} LAND LOST`, '#f55'), 1500);
        flashOverworldLosses(game, losses);
        game.showFloatingText(anchorX, anchorY, formatLossSummary('Defeat', losses), 'alert-text');
    }
    else if(result === 'RETREAT') {
        const losses = loseOverworldHexes(game, Math.floor(Math.random()*5)+1, protectedTargets); // 1-5
        game.spawnTxt(new Hex(0,0), "FLED...", '#aaa');
        setTimeout(() => game.spawnTxt(new Hex(0,0), `-${losses.lost} LAND LOST`, '#f55'), 1500);
        flashOverworldLosses(game, losses);
        game.showFloatingText(anchorX, anchorY, formatLossSummary('Retreat', losses), 'alert-text');
    }

    recordWarEnd(game, result);

    document.getElementById('ui-overworld').classList.add('visible');
    document.getElementById('ui-combat').classList.remove('visible');
    document.getElementById('state-txt').innerText = "KINGDOM";
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
