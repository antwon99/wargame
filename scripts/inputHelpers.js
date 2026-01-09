const SQRT3 = Math.sqrt(3);

const Layout = {
    f0: SQRT3,
    f1: SQRT3 / 2.0,
    f2: 0.0,
    f3: 3.0 / 2.0,
    b0: SQRT3 / 3.0,
    b1: -1.0 / 3.0,
    b2: 0.0,
    b3: 2.0 / 3.0
};

/**
 * Convert a pixel coordinate into fractional axial space without rounding.
 * This preserves the raw offset for follow-up hit-testing against polygon bounds.
 */
function pixelToAxial(layout, point) {
    const normalized = {
        x: (point.x - layout.origin.x) / layout.size,
        y: (point.y - layout.origin.y) / layout.size
    };
    const q = layout.b0 * normalized.x + layout.b1 * normalized.y;
    const r = layout.b2 * normalized.x + layout.b3 * normalized.y;
    return { q, r, s: -q - r };
}

function roundCube(hex) {
    let q = Math.round(hex.q);
    let r = Math.round(hex.r);
    let s = Math.round(hex.s);
    const qDiff = Math.abs(q - hex.q);
    const rDiff = Math.abs(r - hex.r);
    const sDiff = Math.abs(s - hex.s);
    if (qDiff > rDiff && qDiff > sDiff) q = -r - s;
    else if (rDiff > sDiff) r = -q - s;
    else s = -q - r;
    return { q, r, s };
}

/**
 * Project cube/axial coordinates back to pixel space using the provided layout.
 * The helper mirrors the rendering transform so hit-testing aligns with drawHex.
 */
function cubeToPixel(layout, hex) {
    const x = (layout.f0 * hex.q + layout.f1 * hex.r) * layout.size;
    const y = (layout.f2 * hex.q + layout.f3 * hex.r) * layout.size;
    return { x: x + layout.origin.x, y: y + layout.origin.y };
}

function cubeToKey(hex) {
    return `${hex.q},${hex.r}`;
}

function buildHexPolygon(center, size) {
    const vertices = [];
    for (let i = 0; i < 6; i++) {
        const angle = (2 * Math.PI) / 6 * (i + 0.5);
        vertices.push({ x: center.x + size * Math.cos(angle), y: center.y + size * Math.sin(angle) });
    }
    return vertices;
}

function isPointInsidePolygon(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x;
        const yi = polygon[i].y;
        const xj = polygon[j].x;
        const yj = polygon[j].y;
        const intersect = yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
        if (intersect) inside = !inside;
    }
    return inside;
}

/**
 * Determine whether a raw pointer coordinate intersects a drawn hex.
 *
 * The helper converts the pointer to axial coordinates without rounding, then
 * measures distance back to the candidate hex center and rejects clicks that
 * fall outside the actual hex polygon. It also checks whether the hex exists
 * in the active map set for the current game state.
 */
function isPointerOnDrawnHex(options) {
    const {
        x,
        y,
        cam = { x: 0, y: 0 },
        zoom = 1,
        state,
        LayoutImpl = Layout,
        overworldMaps = {},
        combatMaps = {}
    } = options;
    const layout = options.layout || { origin: cam, size: 30 * zoom, ...LayoutImpl };
    const fractional = pixelToAxial(layout, { x, y });
    const rounded = roundCube(fractional);
    const key = cubeToKey(rounded);

    const hasHex =
        state === 'COMBAT'
            ? combatMaps.territory && combatMaps.territory.has(key)
            : (overworldMaps.hexes && overworldMaps.hexes.has(key)) || (overworldMaps.claimable && overworldMaps.claimable.has(key));

    if (!hasHex) return { hit: false, hex: rounded, key, layout };

    const center = cubeToPixel(layout, rounded);
    const radius = layout.size;
    const radialDistance = Math.hypot(x - center.x, y - center.y);
    if (radialDistance > radius) return { hit: false, hex: rounded, key, layout };

    const polygon = buildHexPolygon(center, radius);
    if (!isPointInsidePolygon({ x, y }, polygon)) return { hit: false, hex: rounded, key, layout };

    return { hit: true, hex: rounded, key, layout };
}


/**
 * Register input helpers on the provided global scope for browser access.
 * @param {Window|Object} [target] global object to attach InputHelpers to.
 * @returns {{ Layout: Object, SQRT3: number, isPointerOnDrawnHex: Function, pixelToAxial: Function, cubeToPixel: Function }}
 */
function initInputHelpers(target = typeof window !== 'undefined' ? window : undefined) {
    const api = { Layout, SQRT3, isPointerOnDrawnHex, pixelToAxial, cubeToPixel };
    if (target) {
        target.InputHelpers = api;
    }
    return api;
}

export { Layout, SQRT3, isPointerOnDrawnHex, pixelToAxial, cubeToPixel, initInputHelpers };
