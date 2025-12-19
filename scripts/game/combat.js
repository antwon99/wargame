import { COMBAT_BUILDINGS, UNITS, updateCombat as updateCombatEngine } from '../combatEngine.js';
import { TILE_VISIBILITY } from '../visibilityMask.js';

/**
 * Advance the combat simulation, delegating to the shared combat engine.
 * @param {object} game live Game instance.
 * @param {number} dt frame delta in seconds.
 * @returns {void}
 */
export function updateCombatFrame(game, dt) {
    updateCombatEngine(game, dt, game.Hex);
}

/**
 * Trim combat FX entries whose lifetime has expired so the renderer does not leak DOM nodes.
 * @param {object} game live Game instance.
 * @param {number} dt frame delta in seconds.
 */
export function stepCombatFx(game, dt) {
    const effects = Array.isArray(game.combat?.fx) ? game.combat.fx : [];
    for (let i = effects.length - 1; i >= 0; i -= 1) {
        effects[i].life -= dt;
        if (effects[i].life <= 0) effects.splice(i, 1);
    }
}

/**
 * Remove particle DOM nodes as their lifetime expires to keep the FX layer lightweight.
 * @param {object} game live Game instance.
 * @param {number} dt frame delta in seconds.
 */
export function stepCombatParticles(game, dt) {
    const particles = Array.isArray(game.combat?.particles) ? game.combat.particles : [];
    for (let i = particles.length - 1; i >= 0; i -= 1) {
        const particle = particles[i];
        particle.life -= dt;
        if (particle.life <= 0) {
            particle.el.remove();
            particles.splice(i, 1);
        }
    }
}

/**
 * Render the combat board, honoring fog-of-war and visibility masks.
 * @param {object} game live Game instance.
 * @param {object} layout active hex layout definition.
 */
export function drawCombatScene(game, layout) {
    const ctx = game.ctx;
    for (const [key, tile] of game.combat.territory) {
        const visibility = game.resolveHexVisibility(tile.hex || key);
        const visibleTile = visibility === TILE_VISIBILITY.VISIBLE;
        const seenTile = visibility === TILE_VISIBILITY.SEEN;

        let fill = '#222';
        if (tile.owner === 'player') fill = '#1b4332';
        else if (tile.owner === 'enemy') fill = '#590d22';
        else if (tile.owner === 'scorched') fill = '#111';
        else if (tile.owner === 'neutral' || !tile.owner) fill = '#4a525e';

        if (!visibleTile) fill = seenTile ? 'rgba(28, 32, 38, 0.75)' : '#08090f';
        game.drawHex(layout, tile.hex, fill, '#000');

        const type = game.combat.slots.get(key);
        if (type && game.isFrontier(key, 'player')) {
            const def = COMBAT_BUILDINGS[type.toUpperCase()];
            if (def) {
                ctx.globalAlpha = visibleTile ? 0.5 : 0.3;
                game.drawHex(layout, tile.hex, 'rgba(255,255,255,0.1)', '#fff', def.char, def.cost !== undefined ? `${def.cost}g` : '');
                ctx.globalAlpha = 1.0;
            }
        }
    }

    for (const [key, building] of game.combat.buildings) {
        const def = COMBAT_BUILDINGS[building.type.toUpperCase()];
        if (!def) continue;
        const visibility = game.resolveHexVisibility(key);
        if (visibility === TILE_VISIBILITY.UNSEEN) continue;
        const muted = visibility === TILE_VISIBILITY.SEEN;
        let fill = building.owner === 'player' ? '#2d6a4f' : '#800f2f';
        if (building.type === 'lair') fill = '#4a004a';
        if (muted) fill = 'rgba(74, 82, 94, 0.9)';
        if (building.pulse > 0) { building.pulse -= 0.05; fill = '#fff'; }
        const originalAlpha = ctx.globalAlpha;
        if (muted) ctx.globalAlpha = 0.55;
        game.drawHex(layout, game.parseKey(key), fill, '#fff', def.char);
        ctx.globalAlpha = originalAlpha;
    }

    game.combat.units.forEach(unit => {
        const def = UNITS[unit.type];
        if (!def) return;
        const visibility = game.resolveHexVisibility(unit.pos);
        if (visibility === TILE_VISIBILITY.UNSEEN) return;
        const muted = visibility === TILE_VISIBILITY.SEEN;
        const p = (new game.Hex(unit.pos.q, unit.pos.r, unit.pos.s)).toPixel(layout);
        const size = unit.type === 'dragon' ? 16 * game.cam.zoom : 10 * game.cam.zoom;
        const originalAlpha = ctx.globalAlpha;
        ctx.fillStyle = muted ? '#7a8694' : (unit.owner === 'player' ? '#06d6a0' : '#ef476f');
        if (unit.type === 'dragon') ctx.fillStyle = muted ? '#9273b6' : '#d4f';
        if (muted) ctx.globalAlpha = 0.55;
        ctx.beginPath(); ctx.arc(p.x, p.y, size, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.stroke();
        ctx.font = `${(unit.type === 'dragon' ? 20 : 12) * game.cam.zoom}px sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(def.char, p.x, p.y);
        ctx.globalAlpha = originalAlpha;
    });

    game.combat.fx.forEach(fx => {
        const p1 = fx.startHex.toPixel(layout);
        const p2 = (new game.Hex(fx.endPos.q, fx.endPos.r, fx.endPos.s)).toPixel(layout);

        ctx.strokeStyle = fx.color;
        ctx.lineWidth = 3 * game.cam.zoom;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
    });
}
