import ResearchSystem from '../researchSystem.js';

/**
 * Normalize research technologies into view-friendly payloads.
 * Keeps pricing, scaling, and affordability logic out of DOM rendering code so
 * UI bindings can focus solely on presenting the data and dispatching actions.
 */

/**
 * Summarize revive charge progress for the HUD header.
 * @param {object} research research state container.
 * @param {Function} getTech accessor used to fetch the lives tech definition.
 * @returns {{current: number, cap: number}} current and maximum revive counts.
 */
export function summarizeLivesProgress(research, getTech) {
    const livesTech = typeof getTech === 'function' ? getTech('lives') : null;
    const livesCap = livesTech?.maxPurchases || 3;
    return { current: research?.lives ?? 0, cap: livesCap };
}

/**
 * Build option metadata for a multi-cost technology such as land reclamation.
 * @param {object} tech technology entry containing costOptions.
 * @param {object} helpers pricing and formatting hooks from the game singleton.
 * @returns {Array<object>} option payloads with affordability baked in.
 */
export function buildOptionStates(tech, helpers) {
    const { canPayCost, getTechCost, formatCost, canPlaceReclamation, canBuyMore, purchasePrefix } = helpers;
    const options = tech?.costOptions || [];
    return options.map((opt) => {
        const optCost = typeof getTechCost === 'function' ? getTechCost(tech, opt.id) : null;
        const costLabel = optCost && typeof formatCost === 'function' ? formatCost(optCost) : '';
        const affordable = Boolean(optCost)
            && canBuyMore
            && canPlaceReclamation
            && (typeof canPayCost === 'function' ? canPayCost(optCost) : true);
        return {
            id: opt.id,
            label: opt.label,
            cost: optCost,
            costLabel,
            affordable,
            purchaseLabel: costLabel ? `${helpers.purchasePrefix} (${costLabel})` : 'Select focus'
        };
    });
}

/**
 * Derive view-state for a single technology card.
 * @param {object} game live game singleton with research helpers.
 * @param {object} tech technology definition/state entry.
 * @returns {object} payload describing labels, pricing, and affordance state.
 */
export function buildTechCardState(game, tech) {
    const canBuyMore = ResearchSystem.hasRemainingPurchases(tech);
    const purchaseIndexLabel = tech.maxPurchases && tech.maxPurchases > 1
        ? `${tech.timesPurchased + 1}/${tech.maxPurchases}`
        : '';
    const purchasePrefix = purchaseIndexLabel ? `Purchase ${purchaseIndexLabel}` : 'Purchase';

    const baseTitleSuffix = tech.maxPurchases && tech.maxPurchases > 1
        ? ` (${tech.timesPurchased}/${tech.maxPurchases})`
        : '';
    const title = `${tech.name}${baseTitleSuffix}`;

    const canPayCost = (cost) => (typeof game.canPayCost === 'function' ? game.canPayCost(cost) : true);
    const formatCost = (cost) => (typeof game.formatCost === 'function' ? game.formatCost(cost) : '');
    const getTechCost = (targetTech, optionId) => (typeof game.getTechCost === 'function'
        ? game.getTechCost(targetTech, optionId)
        : null);
    const canPlaceReclamation = tech.id !== 'land-reclamation' || (typeof game.hasFieldToConvert === 'function'
        ? game.hasFieldToConvert()
        : true);

    const baseCost = getTechCost(tech);
    const baseCostLabel = baseCost ? formatCost(baseCost) : '';
    const baseAffordable = Boolean(baseCost) && canBuyMore && canPayCost(baseCost);

    const options = Array.isArray(tech.costOptions)
        ? buildOptionStates(tech, { canPayCost, getTechCost, formatCost, canPlaceReclamation, canBuyMore, purchasePrefix })
        : [];
    const hasOptions = options.length > 0;
    const hasAffordableOption = hasOptions && options.some((opt) => opt.affordable);

    const affordable = hasOptions ? hasAffordableOption : baseAffordable;

    return {
        id: tech.id,
        title,
        description: tech.description,
        purchaseIndexLabel,
        purchasePrefix,
        hasOptions,
        canBuyMore,
        options,
        baseCost,
        baseCostLabel,
        baseAffordable,
        affordable,
        purchaseLabel: baseCostLabel ? `${purchasePrefix} (${baseCostLabel})` : purchasePrefix,
        scaleHint: tech.maxPurchases && tech.maxPurchases > 1
            ? `Scales ×${Math.max(tech.growthFactor || 1, 1).toFixed(2)} per purchase.`
            : null
    };
}

/**
 * Aggregate the entire research view so the UI renderer can stay dumb and fast.
 * @param {object} game live game singleton exposing research state and helpers.
 * @returns {object} payload containing lives progress and card states.
 */
export function buildResearchView(game) {
    const research = game?.research || {};
    const lives = summarizeLivesProgress(research, game?.getTech);
    const technologies = Array.isArray(research.technologies)
        ? research.technologies.map((tech) => buildTechCardState(game, tech))
        : [];
    return { lives, technologies };
}

export default buildResearchView;
