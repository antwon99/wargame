import assert from 'assert';
import { createRequire } from 'module';
import { buildResearchStateSafe } from '../scripts/researchStateBuilder.mjs';

const require = createRequire(import.meta.url);
const ResearchSystem = require('../scripts/researchSystem.js');

function captureLogs() {
    const entries = [];
    return {
        entries,
        logger: (message, error) => entries.push({ message, error })
    };
}

function runTests() {
    const { entries, logger } = captureLogs();
    const fallbackState = buildResearchStateSafe({
        researchSystem: null,
        defaultClusterRate: 0.25,
        logDebug: logger
    });
    assert.strictEqual(fallbackState.technologies.length, 0, 'fallback should omit technologies when missing global');
    assert.strictEqual(fallbackState.bonuses.clusterBaseRate, 0.25, 'fallback should preserve provided default cluster rate');
    assert.strictEqual(entries.length, 1, 'logger should record missing ResearchSystem');

    const saved = { technologies: [{ id: 'lives', timesPurchased: 2 }], lives: 5 };
    const hydrated = buildResearchStateSafe({
        researchSystem: ResearchSystem,
        saved,
        defaultClusterRate: 0.1
    });
    assert.ok(hydrated.technologies.length > 0, 'hydration should clone base technologies');
    assert.strictEqual(hydrated.lives, 2, 'lives should clamp to purchased count');
    assert.strictEqual(hydrated.bonuses.clusterBaseRate, 0.1, 'hydrated bonuses should honor supplied default rate');

    const overCapSaved = { technologies: [{ id: 'lives', timesPurchased: 5 }], lives: 5 };
    const overCapHydrated = buildResearchStateSafe({
        researchSystem: ResearchSystem,
        saved: overCapSaved,
        defaultClusterRate: 0.1
    });
    const hydratedLivesTech = overCapHydrated.technologies.find((tech) => tech.id === 'lives');
    assert.strictEqual(
        hydratedLivesTech.timesPurchased,
        hydratedLivesTech.maxPurchases,
        'hydration should clamp saved purchases to the documented maximum'
    );
    assert.strictEqual(overCapHydrated.lives, hydratedLivesTech.maxPurchases, 'persisted lives should honor the cap');

    const { entries: errorEntries, logger: errorLogger } = captureLogs();
    const erroringSystem = { instantiateTechnologies: () => { throw new Error('boom'); } };
    const erroredState = buildResearchStateSafe({
        researchSystem: erroringSystem,
        defaultClusterRate: 0.1,
        logDebug: errorLogger
    });
    assert.strictEqual(erroredState.technologies.length, 0, 'errors should trigger safe fallback state');
    assert.strictEqual(errorEntries[0].error.message, 'boom', 'logger should receive thrown error for diagnostics');

    console.log('researchStateBuilder tests passed');
}

runTests();
