const assert = require('assert');
const ImperialMandates = require('../scripts/imperialMandates.js');
const ImperialMandateManager = require('../scripts/imperialMandateManager.js');

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

function buildMinimalGameState() {
    const gameState = {
        Hex,
        overworld: { hexes: new Map() },
        calcOverworldGhosts: () => {},
        playSound: () => null,
        gold: 0,
        wood: 0
    };
    const addTile = (hex) => gameState.overworld.hexes.set(hex.toString(), { hex, type: 'field' });
    addTile(new Hex(0, 0));
    addTile(new Hex(1, 0));
    addTile(new Hex(0, 1));
    addTile(new Hex(1, 1));
    addTile(new Hex(-1, 0));
    return gameState;
}

function buildSilentBindings() {
    return {
        showTileCallout: () => null,
        hideTileCallout: () => null,
        enqueueNotification: () => null
    };
}

async function runHarness() {
    ImperialMandates.resetForNewCampaign();
    ImperialMandateManager.reset();
    const gameState = buildMinimalGameState();
    const uiBindings = buildSilentBindings();

    ImperialMandates.issuePendingMandates(gameState, uiBindings);
    const issuedMandate = ImperialMandates.getKingState().mandates.destroy_first_rebel_camp;
    assert.strictEqual(issuedMandate.status, ImperialMandates.MandateStatus.ACTIVE, 'rebel mandate should issue without UI or audio globals');

    const rebelTile = gameState.overworld.hexes.get(issuedMandate.metadata.targetTileKey);
    ImperialMandates.recordEvent('battle_outcome', { result: 'VICTORY', targetTile: rebelTile }, gameState, uiBindings);
    const resolvedMandate = ImperialMandates.getKingState().mandates.destroy_first_rebel_camp;
    assert.strictEqual(resolvedMandate.status, ImperialMandates.MandateStatus.SUCCEEDED, 'mandate lifecycle should resolve under silent harness');
}

async function run() {
    await runHarness();
    console.log('Imperial mandate lifecycle harness passed.');
}

run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
