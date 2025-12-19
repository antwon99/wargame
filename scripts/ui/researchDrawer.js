import { createHudDrawerController, syncHudDrawerHeader } from './upgradeDrawer.js';

/**
 * Rebuild the research modal using the shared card visuals so tech options mirror
 * the upgrade screen, including hover/active feedback and unified cost badges.
 * @param {object} game live game singleton exposing research state and helpers.
 */
export function updateResearchUI(game) {
    const grid = document.getElementById('tech-grid');
    if (!grid) return;
    grid.innerHTML = '';
    syncHudDrawerHeader('research', game);

    const applyPurchaseAffordability = (btn, canAfford) => {
        if (!btn) return;
        const affordableState = Boolean(canAfford);
        btn.classList.toggle('affordable', affordableState);
        btn.classList.toggle('unaffordable', !affordableState);
    };

    const livesTech = game.getTech('lives');
    const livesCap = livesTech?.maxPurchases || 3;
    const livesLabel = document.getElementById('hud-drawer-lives');
    if (livesLabel) {
        livesLabel.innerText = `❤️ ${game.research.lives}/${livesCap}`;
        livesLabel.setAttribute('aria-hidden', 'false');
        livesLabel.style.display = 'inline-flex';
    }
    const headerLives = document.getElementById('lives-count');
    if (headerLives) headerLives.innerText = game.research.lives;


    game.research.technologies.forEach((tech) => {
        const card = document.createElement('article');
        card.className = 'tech-card command-card upgrade-strip';

        const row = document.createElement('div');
        row.className = 'upgrade-strip__row upgrade-row--header tech-row';

        const title = document.createElement('h3');
        title.className = 'upgrade-strip__title tech-title';
        const titleSuffix = tech.maxPurchases && tech.maxPurchases > 1
            ? ` (${tech.timesPurchased}/${tech.maxPurchases})`
            : '';
        title.innerText = `${tech.name}${titleSuffix}`;

        const controls = document.createElement('div');
        controls.className = 'tech-row__actions';

        const canBuyMore = ResearchSystem.hasRemainingPurchases(tech);
        const purchaseIndexLabel = tech.maxPurchases && tech.maxPurchases > 1
            ? `${tech.timesPurchased + 1}/${tech.maxPurchases}`
            : '';
        let affordable = false;

        if (tech.costOptions && tech.costOptions.length > 0) {
            const optionPicker = document.createElement('div');
            optionPicker.className = 'tech-options option-stack';
            let selectedOptionId = null;

            const hasAffordableOption = tech.costOptions.some((opt) => {
                const optCost = game.getTechCost(tech, opt.id);
                return optCost
                    && (tech.id !== 'land-reclamation' || game.hasFieldToConvert())
                    && game.canPayCost(optCost);
            });

            const purchaseBtn = document.createElement('button');
            purchaseBtn.classList.add('card-btn', 'primary-btn', 'tech-purchase-btn');
            purchaseBtn.disabled = true;

            const formatPurchaseLabel = (costLabel) => {
                const suffix = purchaseIndexLabel ? ` ${purchaseIndexLabel}` : '';
                if (!costLabel) return 'Select focus';
                return `Purchase${suffix ? ` ${suffix}` : ''} (${costLabel})`;
            };

            const updateOptionState = () => {
                const cost = selectedOptionId ? game.getTechCost(tech, selectedOptionId) : null;
                const canAfford = cost
                    && canBuyMore
                    && (tech.id !== 'land-reclamation' || game.hasFieldToConvert())
                    && game.canPayCost(cost);
                const costLabel = cost ? game.formatCost(cost) : '';
                purchaseBtn.disabled = !canAfford;
                applyPurchaseAffordability(purchaseBtn, canAfford);
                purchaseBtn.title = selectedOptionId ? '' : 'Choose an option first';
                purchaseBtn.innerText = formatPurchaseLabel(costLabel);
                affordable = (hasAffordableOption && canBuyMore) || canAfford;
            };

            tech.costOptions.forEach((opt) => {
                const optBtn = document.createElement('button');
                optBtn.innerText = opt.label;
                optBtn.classList.add('card-btn', 'primary-btn', 'option-btn');
                optBtn.onclick = () => {
                    selectedOptionId = opt.id;
                    optionPicker.querySelectorAll('button').forEach((btn) => btn.classList.toggle('active', btn === optBtn));
                    updateOptionState();
                };
                optionPicker.appendChild(optBtn);
            });

            purchaseBtn.onclick = () => {
                if (!selectedOptionId) return;
                game.buyTechnology(tech.id, selectedOptionId);
            };

            controls.appendChild(optionPicker);
            controls.appendChild(purchaseBtn);
            updateOptionState();
        } else {
            const cost = game.getTechCost(tech);
            const costLabel = game.formatCost(cost);
            const btn = document.createElement('button');
            btn.classList.add('card-btn', 'primary-btn', 'tech-purchase-btn');
            btn.innerText = purchaseIndexLabel
                ? `Purchase ${purchaseIndexLabel} (${costLabel})`
                : `Purchase (${costLabel})`;
            affordable = game.canPayCost(cost) && canBuyMore;
            btn.disabled = !affordable;
            applyPurchaseAffordability(btn, affordable);
            btn.onclick = () => game.buyTechnology(tech.id);
            controls.appendChild(btn);
        }

        row.appendChild(title);
        row.appendChild(controls);

        const desc = document.createElement('p');
        desc.className = 'upgrade-strip__desc upgrade-row--desc tech-desc';
        desc.innerText = tech.description;

        card.appendChild(row);
        card.appendChild(desc);

        if (tech.maxPurchases && tech.maxPurchases > 1) {
            const scale = document.createElement('p');
            scale.className = 'upgrade-strip__scale upgrade-row--scale tech-scale';
            scale.innerText = `Scales ×${Math.max(tech.growthFactor || 1, 1).toFixed(2)} per purchase.`;
            card.appendChild(scale);
        }

        if (!canBuyMore) {
            card.classList.add('purchased');
            controls.querySelectorAll('button').forEach((btn) => {
                btn.disabled = true;
            });
            const purchaseBtn = card.querySelector('.tech-purchase-btn');
            if (purchaseBtn) {
                purchaseBtn.classList.remove('affordable', 'unaffordable');
                purchaseBtn.classList.add('purchased-btn');
                purchaseBtn.innerText = 'Purchased';
                purchaseBtn.title = 'Already purchased';
            }
        } else if (affordable) {
            card.classList.add('affordable');
        } else {
            card.classList.add('unaffordable');
        }

        grid.appendChild(card);
    });
}

/**
 * Toggle the research drawer open/closed, creating the controller on demand when needed.
 * @param {object} game live game singleton.
 * @param {boolean} [forceOpen] explicit visibility preference.
 */
export function toggleResearch(game, forceOpen) {
    if (!game.hudDrawer) game.hudDrawer = createHudDrawerController(game);
    const controller = game.hudDrawer;
    if (!controller) return;
    const shouldOpen = forceOpen === false ? false : true;
    if (!shouldOpen) {
        controller.hideIfActive?.('research');
        return;
    }
    controller.showResearch?.();
}

/**
 * Bind research drawer utilities onto the game so game systems can render/update tech UI.
 * @param {object} game live game singleton.
 */
export function bindResearchDrawer(game) {
    game.toggleResearch = (forceOpen) => toggleResearch(game, forceOpen);
    game.updateResearchUI = () => updateResearchUI(game);
}
