import assert from 'assert';
import {
    REAL_WORLD_HEX_CONFIG,
    RealWorldOverworldIndex,
    defaultRealWorldProvider
} from '../scripts/realWorldOverworld.js';
import { createGameCore } from '../scripts/game/core.js';

function roughlyEqual(actual, expected, tolerance = 0.0001) {
    return Math.abs(actual - expected) <= tolerance;
}

async function run() {
    const index = new RealWorldOverworldIndex({
        origin: { lat: 0, lon: 0 },
        hexSizeMeters: REAL_WORLD_HEX_CONFIG.approxHexSpacingMeters,
        provider: defaultRealWorldProvider
    });

    const originAxial = index.latLonToAxial({ lat: 0, lon: 0 });
    assert.strictEqual(originAxial.q, 0, 'Origin lat/lon should map to the origin axial coordinate.');
    assert.strictEqual(originAxial.r, 0, 'Origin lat/lon should map to the origin axial coordinate.');

    const originLatLon = index.axialToLatLon({ q: 0, r: 0 });
    assert.ok(roughlyEqual(originLatLon.lat, 0), 'Axial origin should map back to origin latitude.');
    assert.ok(roughlyEqual(originLatLon.lon, 0), 'Axial origin should map back to origin longitude.');

    const sample = { lat: 37.7749, lon: -122.4194 };
    const firstResolve = index.resolveTileForLatLon(sample);
    const secondResolve = index.resolveTileForLatLon(sample);
    assert.strictEqual(firstResolve.tile.type, secondResolve.tile.type, 'Provider should be deterministic for a location.');
    assert.ok(firstResolve.tile.source, 'Provider should supply a source id.');

    const { Game } = createGameCore();
    const claimed = Game.claimRealWorldLocation(sample);
    assert.ok(claimed, 'Claiming a real-world location should return a tile record.');
    assert.strictEqual(Game.overworld.hexes.size, 1, 'Claim should add one overworld hex.');
    assert.strictEqual(Game.overworld.realWorld.enabled, true, 'Real-world mode should enable after a claim.');
    assert.ok(Game.overworld.realWorld.lastClaim, 'Real-world claims should record the last claim metadata.');
}

run().catch((error) => {
    console.error(error);
    process.exit(1);
});
