/**
 * Build a research state snapshot in a defensive way so missing globals or
 * hydration errors cannot abort initialization.
 *
 * The builder intentionally avoids DOM access and accepts its dependencies as
 * parameters so it can run in Node-based tests and constrained bootstrap
 * environments.
 *
 * @param {object} params configuration payload.
 * @param {object|null} params.researchSystem injected ResearchSystem API with instantiate/lookup helpers.
 * @param {object} [params.saved] optional saved payload from persistence.
 * @param {number} [params.defaultClusterRate=0] base cluster bonus rate for overworld adjacency.
 * @param {function} [params.logDebug] optional logger receiving (message, error) for diagnostics.
 * @returns {{technologies: Array, bonuses: object, lives: number}} hydrated or default research state.
 */
export function buildResearchStateSafe({
    researchSystem,
    saved = {},
    defaultClusterRate = 0,
    logDebug
} = {}) {
    const baseState = () => ({
        technologies: [],
        bonuses: {
            townGoldBonus: 0,
            forestWoodBonus: 0,
            clusterBaseRate: defaultClusterRate,
            landReclamationClusterBonus: 0
        },
        lives: 0
    });

    const emitLog = (message, error) => {
        if (typeof logDebug === 'function') logDebug(message, error);
    };

    if (!researchSystem || typeof researchSystem.instantiateTechnologies !== 'function') {
        emitLog('ResearchSystem unavailable; using default research state.');
        return baseState();
    }

    try {
        const technologies = researchSystem.instantiateTechnologies(saved.technologies || []);
        const livesTech = technologies.find((tech) => tech.id === 'lives');
        const purchasedLives = Math.min(livesTech?.timesPurchased || 0, livesTech?.maxPurchases || 0);
        const remainingLives = Math.min(saved.lives ?? purchasedLives, purchasedLives);
        const bonuses = baseState().bonuses;
        return { technologies, bonuses, lives: remainingLives };
    } catch (error) {
        emitLog('Research snapshot hydration failed; using safe defaults.', error);
        return baseState();
    }
}
