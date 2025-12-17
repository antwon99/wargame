const assert = require('assert');
const Persistence = require('../scripts/persistence.js');
const { createCampaignStore } = require('../scripts/campaignStore.js');

describe('CampaignStore.load', () => {
    it('normalizes leaderboard stats when persistence returns legacy fields', () => {
        const slot = '2';
        const persistenceStub = {
            loadSnapshot: () => ({
                slot,
                state: null,
                stats: { bestDifficulty: 5, warsPlayed: 7 }
            }),
            StatHelpers: Persistence.StatHelpers
        };
        const store = createCampaignStore({ persistence: persistenceStub });
        const loaded = store.load(slot);

        assert.strictEqual(loaded.slot, slot, 'load should preserve slot metadata');
        assert.strictEqual(loaded.stats.bestLevel, 5, 'bestDifficulty should map to bestLevel');
        assert.strictEqual(loaded.stats.warsFought, 7, 'warsPlayed should map to warsFought');
        assert.strictEqual(loaded.stats.lastOutcome, 'N/A', 'defaults should be applied via normalization');
    });
});
