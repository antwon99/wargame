/**
 * Upgrade view-model helpers that translate core upgrade state into UI-friendly
 * payloads. DOM nodes should consume these objects instead of recalculating
 * affordability or labels so the view remains a thin rendering layer.
 */

/** Copydeck for upgrade cards used to populate title/description/scale text. */
export const UPGRADE_COPY = {
    soldier: {
        title: 'Soldier Power ⚔️',
        description: 'Sharpen drills and gear to boost your infantry squads.',
        scale: (level) => {
            const scaledLevel = Math.max(1, Number(level) || 1);
            const multi = 1 + ((scaledLevel - 1) * 0.2);
            return `+20% soldier HP & damage per level (Current ×${multi.toFixed(2)})`;
        }
    },
    archer: {
        title: 'Archer Power 🏹',
        description: 'Upgrade fletching, bows, and drills to keep volleys lethal.',
        scale: (level) => {
            const scaledLevel = Math.max(1, Number(level) || 1);
            const multi = 1 + ((scaledLevel - 1) * 0.2);
            return `+20% archer HP & damage per level (Current ×${multi.toFixed(2)})`;
        }
    },
    production: {
        title: 'Production Speed ⚡',
        description: 'Optimize barracks output and rally timing for faster deployments.',
        scale: (level) => {
            const scaledLevel = Math.max(1, Number(level) || 1);
            const multi = Math.pow(0.9, scaledLevel - 1);
            return `-10% training time per level (Current ×${multi.toFixed(2)})`;
        }
    },
    mines: {
        title: 'Mine Efficiency 🏭',
        description: 'Automate ore lines to compound passive gold between assaults.',
        scale: (level) => {
            const scaledLevel = Math.max(1, Number(level) || 1);
            const multi = 1 + ((scaledLevel - 1) * 0.2);
            return `+20% income per level (Current ×${multi.toFixed(2)})`;
        }
    },
    defense: {
        title: 'Defense Systems 🛡️',
        description: 'Reinforce walls and keep defensive emplacements deadly.',
        scale: (level) => {
            const scaledLevel = Math.max(1, Number(level) || 1);
            const multi = 1 + ((scaledLevel - 1) * 0.25);
            return `+25% castle & tower HP/damage per level (Current ×${multi.toFixed(2)})`;
        }
    }
};

const DEFAULT_UPGRADES = [
    { id: 'soldier', buttonId: 'buy-soldier' },
    { id: 'archer', buttonId: 'buy-archer' },
    { id: 'production', buttonId: 'buy-prod' },
    { id: 'mines', buttonId: 'buy-mines' },
    { id: 'defense', buttonId: 'buy-defense' }
];

/**
 * Build a normalized view payload for a single upgrade card.
 * @param {object} game live game singleton exposing upgrades and resource pools.
 * @param {string} upgradeId identifier for the upgrade.
 * @returns {object} payload containing copy, affordability, and labeling data.
 */
export function buildUpgradeCardState(game, upgradeId) {
    const level = Number.isFinite(game?.upgrades?.[upgradeId]) ? Math.max(1, game.upgrades[upgradeId]) : 1;
    const nextLevel = level + 1;
    const copy = UPGRADE_COPY[upgradeId] || {};
    const cost = typeof game?.getUpgradeCost === 'function' ? game.getUpgradeCost(upgradeId) : 0;
    const costLabel = `${cost}g`;
    const gold = Number.isFinite(game?.gold) ? game.gold : 0;
    const canAfford = gold >= cost;
    const purchaseLabel = `Purchase Lv.${nextLevel}`;
    const buttonLabel = canAfford ? `${purchaseLabel} (${costLabel})` : costLabel;
    const scaleText = typeof copy.scale === 'function' ? copy.scale(level) : copy.scale;

    return {
        id: upgradeId,
        level,
        nextLevel,
        title: copy.title || '',
        description: copy.description || '',
        scaleText: scaleText || '',
        cost,
        costLabel,
        canAfford,
        ariaLabel: canAfford ? `${purchaseLabel} (${costLabel})` : `Lv.${nextLevel} costs ${costLabel}`,
        purchaseLabel,
        buttonLabel
    };
}

/**
 * Generate view-model data for every upgrade card in the drawer.
 * @param {object} game live game singleton exposing upgrade state and helpers.
 * @param {Array<object>} [definitions] optional custom definition list for tests.
 * @returns {Array<object>} ordered upgrade card payloads.
 */
export function buildUpgradeView(game, definitions = DEFAULT_UPGRADES) {
    return definitions.map((def) => ({
        ...def,
        ...buildUpgradeCardState(game, def.id)
    }));
}

export default buildUpgradeView;
