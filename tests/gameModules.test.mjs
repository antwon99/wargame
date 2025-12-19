import assert from 'assert';
import { shouldShowClaimCostLabels } from '../scripts/game/overworld.js';
import { stepCombatFx, stepCombatParticles } from '../scripts/game/combat.js';

// Overworld claim cost labels honor feature toggles for debug overlays.
const toggledGame = { featureToggles: { overworld: { showClaimCosts: true } } };
assert.strictEqual(shouldShowClaimCostLabels(toggledGame), true);

const disabledGame = { featureToggles: { overworld: { showClaimCosts: false } } };
assert.strictEqual(shouldShowClaimCostLabels(disabledGame), false);

// Combat FX and particle stepping remove expired entries without touching active effects.
const removed = [];
const game = {
    combat: {
        fx: [{ life: 0.05 }, { life: 0.2 }],
        particles: [
            { life: 0.05, el: { remove: () => removed.push('first') } },
            { life: 0.2, el: { remove: () => removed.push('second') } }
        ]
    }
};

stepCombatFx(game, 0.1);
assert.strictEqual(game.combat.fx.length, 1, 'expired FX entries should be culled');

stepCombatParticles(game, 0.1);
assert.strictEqual(game.combat.particles.length, 1, 'expired particles should be removed');
assert.deepStrictEqual(removed, ['first']);
