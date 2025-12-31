import assert from 'assert';

function makeRng(sequence) {
    let idx = 0;
    return () => {
        const value = sequence[Math.min(idx, sequence.length - 1)];
        idx += 1;
        return value;
    };
}

async function testRiverGeneration() {
    const { buildWaterBody } = await import('../scripts/waterGenerator.js');
    const start = { q: 0, r: 0, s: 0, toString: () => '0,0' };
    const rng = makeRng([0.1, 0.0, 0.0, 0.0, 0.0]);
    const body = buildWaterBody(start, { rng, riverLengthRange: [4, 4] });

    assert.strictEqual(body.length, 4, 'river generator should honor provided length bounds');
    const keys = new Set(body.map((h) => `${h.q},${h.r}`));
    assert.strictEqual(keys.size, 4, 'river body should contain unique coordinates');
    console.log('Water river generation test passed.');
}

async function testLakeGenerationAndStamping() {
    const { buildWaterBody, stampWaterBody } = await import('../scripts/waterGenerator.js');
    class Hex {
        constructor(q, r, s = -q - r) { this.q = q; this.r = r; this.s = s; }
        toString() { return `${this.q},${this.r}`; }
    }
    const game = {
        Hex,
        overworld: { hexes: new Map() },
        addOverworldHex(hex, type, owner, extras = {}) {
            const record = { hex, type, owner, ...extras };
            this.overworld.hexes.set(hex.toString(), record);
            return record;
        }
    };

    const start = new Hex(0, 0);
    game.addOverworldHex(start, 'water', 'player');
    const rng = makeRng([0.9, 0.0, 0.2, 0.4, 0.6]);
    const body = buildWaterBody(start, { rng, lakeSizeRange: [3, 3] });
    assert.strictEqual(body.length, 3, 'lake generator should respect target size');

    const stamped = stampWaterBody(game, start, body, { owner: 'player' });
    assert.strictEqual(game.overworld.hexes.size, 3, 'stamping should add missing water tiles');
    assert.ok(stamped.every((tile) => tile.isWater), 'stamped tiles should carry water metadata');
    const startTile = game.overworld.hexes.get('0,0');
    assert.ok(startTile.isWater, 'start tile should retain water metadata');

    // Stamping over existing tiles should be a no-op for occupied coordinates.
    const bodyWithDuplicate = body.concat([{ q: 0, r: 0, s: 0 }]);
    stampWaterBody(game, start, bodyWithDuplicate, { owner: 'player' });
    assert.strictEqual(game.overworld.hexes.size, 3, 'existing coordinates are not overwritten by water stamping');

    console.log('Water lake generation + stamping test passed.');
}

async function testStampingKeepsBodiesContiguous() {
    const { stampWaterBody } = await import('../scripts/waterGenerator.js');
    class Hex {
        constructor(q, r, s = -q - r) { this.q = q; this.r = r; this.s = s; }
        toString() { return `${this.q},${this.r}`; }
    }

    const game = {
        Hex,
        overworld: { hexes: new Map() },
        addOverworldHex(hex, type, owner, extras = {}) {
            const record = { hex, type, owner, ...extras };
            this.overworld.hexes.set(hex.toString(), record);
            return record;
        }
    };

    const start = new Hex(0, 0);
    const blocked = new Hex(1, 0);
    game.addOverworldHex(start, 'water', 'player', { isWater: true });
    game.addOverworldHex(blocked, 'forest', 'player');

    const disconnectedRiver = [start, blocked, new Hex(2, 0)];
    const claimed = stampWaterBody(game, start, disconnectedRiver, { owner: 'player' });

    assert.strictEqual(claimed.length, 0, 'no new tiles should be stamped when path is blocked');
    assert.strictEqual(game.overworld.hexes.size, 2, 'blocked coordinates prevent disjoint water placement');
    assert.ok(!game.overworld.hexes.has('2,0'), 'unreachable river segments are discarded');

    console.log('Water stamping contiguity test passed.');
}

async function run() {
    await testRiverGeneration();
    await testLakeGenerationAndStamping();
    await testStampingKeepsBodiesContiguous();
    console.log('Water generator tests passed.');
}

run();
