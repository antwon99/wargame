/**
 * ResearchSystem centralizes the tech tree metadata and affordability helpers.
 * Definitions here are DOM-free so both the browser game and Node tests can
 * share logic without invoking the full renderer.
 */
/**
 * Build the research system API with base tech definitions.
 * @returns {Object} research system helpers and static tech definitions.
 */
function createResearchSystem() {
    const BASE_TECHNOLOGIES = [
        {
            id: 'lives',
            name: 'Lives',
            description: 'Gain an extra chance to ignore a defeat. Costs scale heavily and caps at three revives.',
            cost: { gold: 1000 },
            maxPurchases: 3,
            growthFactor: 2.5
        },
        {
            id: 'architecture',
            name: 'Architecture',
            description: 'Improve town planning to squeeze more gold out of each settlement.',
            cost: { gold: 200 },
            maxPurchases: 1,
            growthFactor: 1
        },
        {
            id: 'lumberjacks',
            name: 'Lumberjacks',
            description: 'Train specialized woodcutters to harvest more lumber from forests.',
            cost: { gold: 400 },
            maxPurchases: 1,
            growthFactor: 1
        },
        {
            id: 'land-reclamation',
            name: 'Land Reclamation',
            description: 'Spend gold to reclaim a field of your choice into a forest or town. Costs scale per purchase.',
            costOptions: [
                { id: 'forest', label: 'Plant Forest', cost: { gold: 500 } },
                { id: 'town', label: 'Raise City', cost: { gold: 500 } }
            ],
            optionPurchaseCounts: { forest: 0, town: 0 },
            growthFactor: 1.35
        }
    ];

    function cloneCost(cost = {}) {
        return { ...cost };
    }

    function cloneOptions(options = []) {
        return options.map(opt => ({ ...opt, cost: cloneCost(opt.cost) }));
    }

    function buildOptionPurchaseCounts(options = []) {
        return options.reduce((acc, option) => {
            if (option?.id) acc[option.id] = 0;
            return acc;
        }, {});
    }

    function hydrateOptionPurchaseCounts(savedCounts, options = []) {
        const baseCounts = buildOptionPurchaseCounts(options);
        if (!savedCounts || typeof savedCounts !== 'object') return baseCounts;
        Object.entries(savedCounts).forEach(([key, value]) => {
            if (!Object.prototype.hasOwnProperty.call(baseCounts, key)) return;
            const numeric = Number.isFinite(value) ? value : 0;
            baseCounts[key] = Math.max(0, numeric);
        });
        return baseCounts;
    }

    /**
     * Clone the base tech definitions and merge saved purchase state.
     * @param {Array} [saved] persisted payload from the game save system.
     * @returns {Array} hydrated technology entries ready for gameplay.
     */
    function instantiateTechnologies(saved = []) {
        const savedMap = new Map(saved.map(t => [t.id, t]));
        return BASE_TECHNOLOGIES.map(base => {
            const savedTech = savedMap.get(base.id);
            const savedTimesPurchased = Math.max(savedTech?.timesPurchased || 0, 0);
            const cappedPurchases = typeof base.maxPurchases === 'number'
                ? Math.min(savedTimesPurchased, base.maxPurchases)
                : savedTimesPurchased;
            const optionPurchaseCounts = base.costOptions
                ? hydrateOptionPurchaseCounts(savedTech?.optionPurchaseCounts, base.costOptions)
                : undefined;
            const clone = {
                ...base,
                cost: cloneCost(base.cost),
                costOptions: cloneOptions(base.costOptions),
                optionPurchaseCounts,
                purchased: cappedPurchases > 0,
                timesPurchased: cappedPurchases
            };
            return clone;
        });
    }

    /**
     * Compute the current scaled cost for a technology, respecting growth
     * factors and optional cost variants.
     * @param {object} tech technology entry to evaluate.
     * @param {string} [optionId] optional option key for variable-cost tech.
     * @returns {object|null} resource cost keyed by gold/wood, or null when an
     * option is required but missing/invalid.
     */
    function getCostForTech(tech, optionId) {
        const factor = Math.max(tech.growthFactor || 1, 1);
        const hasOptions = Array.isArray(tech.costOptions) && tech.costOptions.length > 0;
        let purchaseCount = tech.timesPurchased || 0;
        let baseCost;

        if (hasOptions) {
            if (!optionId) {
                throw new Error(`optionId is required for technology "${tech.id}"`);
            }
            const selectedOption = tech.costOptions.find(opt => opt.id === optionId);
            if (!selectedOption) return null;
            const optionCounts = tech.optionPurchaseCounts || {};
            purchaseCount = Math.max(optionCounts[optionId] || 0, 0);
            baseCost = cloneCost(selectedOption.cost);
        } else {
            baseCost = cloneCost(tech.cost);
        }

        const scaledCost = {};
        Object.entries(baseCost).forEach(([key, value]) => {
            if (typeof value !== 'number') return;
            const scaled = Math.floor(value * Math.pow(factor, purchaseCount));
            scaledCost[key] = scaled;
        });
        return Object.keys(scaledCost).length > 0 ? scaledCost : null;
    }

    /**
     * Check if a tech can be purchased again based on its maxPurchases cap.
     * @param {object} tech technology entry to inspect.
     * @returns {boolean} true when the tech has capacity for more buys.
     */
    function hasRemainingPurchases(tech) {
        if (typeof tech.maxPurchases !== 'number') return true;
        return (tech.timesPurchased || 0) < tech.maxPurchases;
    }

    /**
     * Increment purchase metadata for a tech after a successful transaction.
     * @param {object} tech technology entry to mutate.
     * @param {string} [optionId] optional option key for variable-cost techs.
     */
    function recordPurchase(tech, optionId) {
        tech.timesPurchased = (tech.timesPurchased || 0) + 1;
        tech.purchased = true;
        if (optionId && Array.isArray(tech.costOptions)) {
            const optionExists = tech.costOptions.some(option => option.id === optionId);
            if (optionExists) {
                if (!tech.optionPurchaseCounts || typeof tech.optionPurchaseCounts !== 'object') {
                    tech.optionPurchaseCounts = buildOptionPurchaseCounts(tech.costOptions);
                }
                const current = tech.optionPurchaseCounts[optionId] || 0;
                tech.optionPurchaseCounts[optionId] = current + 1;
            }
        }
    }

    /**
     * Determine whether a player resource pool can satisfy a tech cost.
     * @param {object} resources available resources (gold/wood).
     * @param {object} cost desired purchase cost.
     * @returns {boolean} true when every cost component is covered.
     */
    function isAffordable(resources = {}, cost = {}) {
        return Object.entries(cost).every(([key, price]) => {
            const available = resources[key] || 0;
            return available >= price;
        });
    }

    const api = {
        BASE_TECHNOLOGIES,
        instantiateTechnologies,
        getCostForTech,
        isAffordable,
        hasRemainingPurchases,
        recordPurchase
    };

    return api;
}

const ResearchSystem = createResearchSystem();

/**
 * Register the research helpers on the provided global scope.
 * @param {Window|Object} [target] global object to attach ResearchSystem to.
 * @returns {Object} research system API.
 */
function initResearchSystem(target = typeof window !== 'undefined' ? window : globalThis) {
    if (target) {
        target.ResearchSystem = ResearchSystem;
    }
    return ResearchSystem;
}

export { createResearchSystem, ResearchSystem, initResearchSystem };

if (typeof module !== 'undefined') {
    ResearchSystem.initResearchSystem = initResearchSystem;
    ResearchSystem.createResearchSystem = createResearchSystem;
    module.exports = ResearchSystem;
}
