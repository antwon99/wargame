const assert = require('assert');
const RebelSystem = require('../scripts/rebelSystem.js');

class Hex {
    constructor(q, r, s = -q - r) { this.q = q; this.r = r; this.s = s; }
    toString() { return `${this.q},${this.r}`; }
    static neighbor(hex, dir) {
        const dirs = [
            new Hex(1, 0, -1), new Hex(1, -1, 0), new Hex(0, -1, 1),
            new Hex(-1, 0, 1), new Hex(-1, 1, 0), new Hex(0, 1, -1)
        ];
        return new Hex(hex.q + dirs[dir].q, hex.r + dirs[dir].r, hex.s + dirs[dir].s);
    }
}

function buildGameState() {
    const hexes = new Map();
    const addTile = (hex, type = 'field', owner = 'player') => hexes.set(hex.toString(), { hex, type, owner });
    addTile(new Hex(0, 0), 'castle', 'player');
    addTile(new Hex(1, 0));
    addTile(new Hex(0, 1));
    addTile(new Hex(1, 1));
    return { Hex, overworld: { hexes } };
}

(function run() {
    const gameState = buildGameState();
    gameState.overworld.hexes.has = () => true; // Eliminate frontier candidates.
    const camp = RebelSystem.spawnRebelCampNearFrontier(gameState, { random: () => 0 });
    assert.ok(camp, 'Fallback placement should still return a rebel tile.');
    assert.strictEqual(camp.type, 'rebelcamp', 'Fallback should convert the chosen tile into a rebel camp.');
    assert.strictEqual(camp.hex.toString(), '1,1', 'Outer-ring fallback should prioritize the farthest player tile.');

    const doomedState = { Hex, overworld: { hexes: new Map([[ '0,0', { hex: new Hex(0, 0), type: 'castle' } ]]) } };
    doomedState.overworld.hexes.has = () => true;
    assert.throws(
        () => RebelSystem.spawnRebelCampNearFrontier(doomedState, { random: () => 0 }),
        /after frontier and fallback scans/, 
        'An explicit error should surface when no placement tiles exist.'
    );

    console.log('All rebel system tests passed.');
})();
