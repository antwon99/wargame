import { TILE_VISIBILITY, buildTileVisibilityMap, resolveFogTileMask } from './fogMask.js';
import { resolveFogInnerOpacity, resolveFogParallax, resolveFogVisualConfig } from './fogVisualConfig.mjs';

/**
 * Resolve whether combat rendering should apply fog overlays. Seasonal snow is the
 * only combat-safe visual mode; all other modes return false to keep war scenes clear.
 *
 * @param {object} game live game object providing state and fog toggles.
 * @param {Date} [currentDate=new Date()] optional date override for tests.
 * @returns {boolean} true when combat fog should render.
 */
export function shouldApplyCombatFog(game, currentDate = new Date()) {
    if (!game || game.state !== 'COMBAT') return false;
    const fogConfig = game.fog?.visualConfig || resolveFogVisualConfig(game.featureToggles?.fog);
    if (!fogConfig || fogConfig.enabled === false) return false;
    if (fogConfig.visualMode !== 'seasonalSnow') return false;

    const winterMonths = new Set([11, 0, 1]);
    return winterMonths.has(currentDate.getMonth());
}

/**
 * Build and cache a normalized visibility map using overworld/frontier data and
 * optional combat territory when seasonal fog is enabled.
 *
 * @param {object} game live game object exposing overworld/claimable/combat maps.
 * @returns {Map<string, string>} resolved visibility states keyed by hex string.
 */
export function getTileVisibilityMap(game) {
    const visibility = buildTileVisibilityMap({
        state: game?.state,
        overworld: game?.overworld?.hexes,
        claimable: game?.overworld?.claimable,
        combat: shouldApplyCombatFog(game) ? game?.combat?.territory : null
    });
    if (game?.fog) game.fog.visibility = visibility;
    return visibility;
}

/**
 * Resolve the fog visibility state for a given hex or tile key. Defaults to
 * visible when no map entry exists to keep rendering predictable.
 *
 * @param {object} game live game object with a fog.visibility map.
 * @param {Hex|string} hex hex coordinate or string key.
 * @returns {string} visibility label (unseen|seen|visible).
 */
export function resolveHexVisibility(game, hex) {
    const key = typeof hex === 'string' ? hex : hex?.toString?.();
    if (!key || !(game?.fog?.visibility instanceof Map)) return TILE_VISIBILITY.VISIBLE;
    return game.fog.visibility.get(key) || TILE_VISIBILITY.VISIBLE;
}

/**
 * Derive the average screen position for explored territory so the fog can
 * fade out from the current kingdom instead of the viewport center.
 *
 * @param {object} game live game object exposing overworld/combat maps.
 * @param {Object} layout active hex layout
 * @returns {{x:number, y:number}} screen-space center of explored space
 */
export function getTerritoryScreenCenter(game, layout) {
    const points = [];
    const maps = game?.state === 'COMBAT' ? game?.combat?.territory : game?.overworld?.hexes;
    if (maps?.forEach) {
        maps.forEach((data) => {
            const hex = data?.hex || data;
            if (hex?.toPixel) points.push(hex.toPixel(layout));
        });
    }
    if (!points.length) return { x: game?.viewport?.width / 2 || 0, y: game?.viewport?.height / 2 || 0 };

    const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    return { x: sum.x / points.length, y: sum.y / points.length };
}

/**
 * Identify contiguous explored clusters so the fog can glow around player-owned
 * territory. Only player/neutral tiles are considered to avoid spotlighting hostile land.
 *
 * @param {object} game live game object exposing overworld/combat maps.
 * @param {Object} layout active hex layout
 * @returns {Array<{center:{x:number,y:number}, size:number}>}
 */
export function collectExploredClusters(game, layout) {
    const maps = game?.state === 'COMBAT' ? game?.combat?.territory : game?.overworld?.hexes;
    const visited = new Set();
    const clusters = [];
    const eligible = (tile) => {
        if (!tile) return false;
        const owner = (tile.owner || 'player').toLowerCase();
        return owner !== 'enemy' && owner !== 'scorched';
    };

    if (!maps?.forEach) return clusters;

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
                const neighbor = game.Hex.neighbor(currentHex, i);
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
}

/**
 * Paint the fog backdrop for the current frame. When combat fog is disabled,
 * the function emits only the void fill to prevent stray masks bleeding into war mode.
 *
 * @param {object} game live game object with rendering context and fog state.
 * @param {Object} layout active hex layout (origin + size)
 * @param {Object} [fogMaskOptions] optional mask hooks for unexplored/frontier tiles
 */
export function renderFogBackdrop(game, layout, fogMaskOptions = {}) {
    const ctx = game?.ctx;
    const fogConfig = game?.fog?.visualConfig || resolveFogVisualConfig(game?.featureToggles?.fog);
    const isVoidBaseline = game?.isVoidVisualMode ? game.isVoidVisualMode(fogConfig) : fogConfig.visualMode === 'void';
    const fogGradientStops = fogConfig.fogGradientStops || {};
    const rippleGradientStops = fogConfig.rippleGradientStops || {};
    const spotlightColors = fogConfig.spotlightColors || {};
    const voidFill = fogConfig.voidFill ?? fogConfig.baseFillColor ?? '#0b0b11';

    const tileVisibility = getTileVisibilityMap(game);
    const useCombatFog = shouldApplyCombatFog(game);
    const tileMask = useCombatFog
        ? resolveFogTileMask(fogMaskOptions, {
            layout,
            state: game?.state,
            overworld: game?.overworld?.hexes,
            combat: game?.combat?.territory,
            visibility: tileVisibility
        })
        : null;
    if (game?.fog) {
        game.fog.tileMask = tileMask;
        game.fog.visibility = tileVisibility;
        game.fog.visualConfig = fogConfig;
    }

    ctx.fillStyle = voidFill;
    ctx.fillRect(0, 0, game?.viewport?.width || 0, game?.viewport?.height || 0);

    if (game?.state === 'COMBAT' && !useCombatFog) return;
    if (isVoidBaseline) return;

    const ambienceCloudsEnabled = typeof game?.shouldRenderAmbience === 'function'
        ? game.shouldRenderAmbience(fogConfig)
        : false;
    const legacyBackdropEnabled = fogConfig.legacyBackdropEnabled === true;
    const baseFillOnly = (!ambienceCloudsEnabled && fogConfig.baseFillOnlyWhenAmbienceDisabled !== false)
        || !legacyBackdropEnabled;

    const ambienceCenter = getTerritoryScreenCenter(game, layout);
    if (ambienceCloudsEnabled && typeof game?.ensureAmbienceRendererReady === 'function') {
        game.ensureAmbienceRendererReady(fogConfig);
        game.ambienceRenderer?.render?.({ center: ambienceCenter });
    }
    if (fogConfig.enabled === false || baseFillOnly || legacyBackdropEnabled === false) return;

    const center = ambienceCenter;
    const { parallaxSpeed, parallaxAmplitude } = resolveFogParallax(fogConfig);
    const drift = Math.sin(game?.fog?.time * parallaxSpeed) * parallaxAmplitude;
    const radius = Math.max(game?.viewport?.width || 0, game?.viewport?.height || 0) * 0.8;
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
        ctx.fillRect(0, 0, game?.viewport?.width || 0, game?.viewport?.height || 0);
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
        ctx.fillRect(0, 0, game?.viewport?.width || 0, game?.viewport?.height || 0);
        ctx.globalAlpha = 1.0;
    }

    if (fogConfig.clusterGlowEnabled !== false && typeof game?.Hex?.neighbor === 'function') {
        const clusters = collectExploredClusters(game, layout);
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
            ctx.fillRect(0, 0, game?.viewport?.width || 0, game?.viewport?.height || 0);
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
            const hex = game.parseKey(key);
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
}

/**
 * Shade a single hex according to its visibility state. Unseen tiles receive
 * an opaque mask, discovered-but-not-visible tiles get a desaturated dimmer,
 * and visible tiles bypass the mask entirely so the base art shows through.
 *
 * @param {object} game live game object with a drawing context.
 * @param {Hex} hex tile coordinate being rendered.
 * @param {Object} tile raw tile payload from map iteration.
 * @param {string} visibility normalized tile visibility label.
 */
export function drawTileFog(game, hex, tile, visibility) {
    const layout = game?.fog?.hexLayout;
    if (game?.state === 'COMBAT' && !shouldApplyCombatFog(game)) return;
    if (!layout || !hex || typeof hex.toPixel !== 'function') return;
    const fogConfig = game?.fog?.visualConfig || resolveFogVisualConfig(game?.featureToggles?.fog);
    if (fogConfig.enabled === false || fogConfig.tileFogEnabled !== true) return;

    const state = visibility || resolveHexVisibility(game, hex);
    if (state === TILE_VISIBILITY.VISIBLE) return;

    const ctx = game.ctx;
    const center = hex.toPixel(layout);
    const maskSize = Math.max(4 * game.cam.zoom, layout.size - Math.max(2.5 * game.cam.zoom, layout.size * 0.08));

    ctx.save();
    ctx.beginPath();
    for (let i = 0; i < 6; i += 1) {
        const angle = 2 * Math.PI / 6 * (i + 0.5);
        const x = center.x + maskSize * Math.cos(angle);
        const y = center.y + maskSize * Math.sin(angle);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();

    ctx.fillStyle = state === TILE_VISIBILITY.SEEN ? '#111827' : '#05060c';
    ctx.globalAlpha = state === TILE_VISIBILITY.SEEN ? 0.72 : 0.96;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fill();
    ctx.restore();
}

export default {
    shouldApplyCombatFog,
    getTileVisibilityMap,
    resolveHexVisibility,
    getTerritoryScreenCenter,
    collectExploredClusters,
    renderFogBackdrop,
    drawTileFog
};

if (typeof module !== 'undefined') {
    module.exports = {
        shouldApplyCombatFog,
        getTileVisibilityMap,
        resolveHexVisibility,
        getTerritoryScreenCenter,
        collectExploredClusters,
        renderFogBackdrop,
        drawTileFog
    };
}
