const fallbackBuildResearchStateSafe = ({
    researchSystem,
    saved = {},
    defaultClusterRate = 0,
    logDebug
} = {}) => {
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
        const remainingLives = Math.max(0, Math.min(saved.lives ?? purchasedLives, purchasedLives));
        const bonuses = baseState().bonuses;
        return { technologies, bonuses, lives: remainingLives };
    } catch (error) {
        emitLog('Research snapshot hydration failed; using safe defaults.', error);
        return baseState();
    }
};
let cachedResearchStateBuilder = null;
let researchStateBuilderPromise = null;

/**
 * Resolve the research state builder without forcing the ES module load.
 * @returns {Function} research state builder implementation.
 */
const getResearchStateBuilder = () => {
    if (!cachedResearchStateBuilder) {
        cachedResearchStateBuilder = fallbackBuildResearchStateSafe;
    }

    if (!researchStateBuilderPromise) {
        researchStateBuilderPromise = import('../researchStateBuilder.js')
            .then((module) => {
                cachedResearchStateBuilder = module.buildResearchStateSafe || fallbackBuildResearchStateSafe;
            })
            .catch(() => {
                cachedResearchStateBuilder = cachedResearchStateBuilder || fallbackBuildResearchStateSafe;
            });
    }

    return cachedResearchStateBuilder;
};

export { getResearchStateBuilder };
