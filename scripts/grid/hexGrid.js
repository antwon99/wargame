/**
 * Shared hex grid utilities used by rendering and hit-testing layers.
 * Exposes the axial {@link Hex} coordinate helper and the {@link Layout}
 * transform used to project hexes into screen space.
 */
const SQRT3 = Math.sqrt(3);

/** Default pointy-top axial layout coefficients for cube coordinates. */
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
 * Axial hex coordinate helper that supports neighbor traversal and
 * pixel projection for layout-aware rendering.
 */
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

const HexGrid = { Hex, Layout, SQRT3 };

if (typeof window !== 'undefined') {
    window.HexGrid = HexGrid;
}

export { Hex, Layout, SQRT3 };
export default HexGrid;

if (typeof module !== 'undefined') {
    module.exports = HexGrid;
}
