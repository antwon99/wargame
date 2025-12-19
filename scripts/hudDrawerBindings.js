/**
 * HUD drawer bindings manage upgrade/research drawers and HUD counters independently
 * from the broader UI wiring so each area can be tested in isolation.
 */
const DEFAULT_IMPERIAL_FAVOR = 5;

/** Clamp imperial favor values to the HUD's 1–10 range for display. */
function clampImperialFavor(value) {
    const numeric = Number.isFinite(value) ? Math.round(value) : DEFAULT_IMPERIAL_FAVOR;
    return Math.min(10, Math.max(1, numeric));
}

/**
 * Refresh the shared drawer header with context for either upgrades or research.
 * @param {'upgrades'|'research'} mode active drawer view.
 * @param {object} game live game singleton exposing research metadata.
 */
function syncHudDrawerHeader(mode, game) {
    const eyebrow = document.getElementById('hud-drawer-eyebrow');
    const title = document.getElementById('hud-drawer-title');
    const subtitle = document.getElementById('hud-drawer-subtitle');
    const lives = document.getElementById('hud-drawer-lives');
    if (!eyebrow || !title || !subtitle || !lives) return;

    if (mode === 'research') {
        const livesTech = typeof game.getTech === 'function' ? game.getTech('lives') : null;
        const livesCap = livesTech?.maxPurchases || 3;
        eyebrow.innerText = 'Arcane Bureau';
        title.innerText = 'Research';
        subtitle.innerText = 'Spend gold and wood on late-game tech that buffs your economy or rescues doomed runs.';
        lives.innerText = `❤️ ${game.research?.lives ?? 0}/${livesCap}`;
        lives.setAttribute('aria-hidden', 'false');
        lives.style.display = 'inline-flex';
    } else {
        eyebrow.innerText = 'Imperial Engineering';
        title.innerText = 'Imperial Upgrades';
        subtitle.innerText = 'Invest resources to harden defenses and accelerate production between wars.';
        lives.setAttribute('aria-hidden', 'true');
        lives.style.display = 'none';
    }
}

/**
 * Attach upgrade purchase handlers after the drawer template has been cloned.
 * @param {object} game live game singleton.
 */
function bindUpgradeButtons(game) {
    const mapping = {
        'buy-soldier': 'soldier',
        'buy-archer': 'archer',
        'buy-prod': 'production',
        'buy-mines': 'mines',
        'buy-defense': 'defense'
    };
    Object.entries(mapping).forEach(([id, key]) => {
        const btn = document.getElementById(id);
        if (btn) btn.onclick = () => game.buyUpgrade(key);
    });
}

/**
 * Create and manage the bottom HUD drawer shared by upgrades and research.
 * Handles swapping template content, accessibility states, and close affordances.
 * @param {object} game live game singleton.
 * @returns {object} drawer controller with show/hide helpers.
 */
function createHudDrawerController(game) {
    const drawer = document.getElementById('hud-drawer');
    const anchor = drawer?.closest?.('.hud-controls-anchor') || document;
    const getScopedElement = (selector) => {
        const scoped = anchor?.querySelector?.(selector);
        if (scoped) return scoped;
        if (selector.startsWith('#')) return document.getElementById(selector.slice(1));
        return document.querySelector(selector);
    };
    const contentHost = getScopedElement('#hud-drawer-content');
    const body = getScopedElement('#hud-drawer-body');
    const templates = {
        upgrades: getScopedElement('#drawer-upgrades-template'),
        research: getScopedElement('#drawer-research-template')
    };
    const triggers = {
        upgrades: getScopedElement('#btn-upg'),
        research: getScopedElement('#btn-research')
    };
    const closeBtn = getScopedElement('#hud-drawer-close');

    if (!drawer || !contentHost) {
        return {
            showUpgrades: () => bindUpgradeButtons(game),
            showResearch: () => game.updateResearchUI?.(),
            hide: () => {},
            hideIfActive: () => {},
            activeView: () => null
        };
    }

    let activeView = drawer.dataset.activeView || null;

    const updateTriggerState = (mode, open) => {
        if (drawer) drawer.setAttribute('aria-hidden', open ? 'false' : 'true');
        Object.entries(triggers).forEach(([key, btn]) => {
            if (!btn) return;
            btn.setAttribute('aria-controls', 'hud-drawer');
            const expanded = open && key === mode;
            btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
            btn.setAttribute('aria-pressed', expanded ? 'true' : 'false');
        });
    };

    const swapContent = (mode) => {
        contentHost.innerHTML = '';
        const tpl = templates[mode];
        if (tpl && tpl.content) contentHost.appendChild(tpl.content.cloneNode(true));
        drawer.dataset.activeView = mode;
        syncHudDrawerHeader(mode, game);
        if (mode === 'upgrades') {
            bindUpgradeButtons(game);
            game.updateUpgradeMenu?.();
        }
        if (mode === 'research') game.updateResearchUI?.();
        if (body?.scrollTo) body.scrollTo({ top: 0 });
    };

    const hide = () => {
        drawer.classList.remove('open');
        drawer.style.display = 'none';
        activeView = null;
        updateTriggerState(null, false);
    };

    const show = (mode) => {
        activeView = mode;
        swapContent(mode);
        drawer.style.display = 'block';
        drawer.classList.add('open');
        updateTriggerState(mode, true);
    };

    const hideIfActive = (mode) => {
        if (activeView === mode) hide();
    };

    const onDocClick = (evt) => {
        if (!drawer.classList.contains('open')) return;
        const target = evt.target;
        const isTrigger = Object.values(triggers).some(btn => btn && btn.contains(target));
        if (drawer.contains(target) || isTrigger) return;
        hide();
    };

    const onKeyDown = (evt) => {
        if (evt.key === 'Escape' && drawer.classList.contains('open')) hide();
    };

    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    if (closeBtn) closeBtn.onclick = () => hide();

    return {
        showUpgrades: () => show('upgrades'),
        showResearch: () => show('research'),
        hide,
        hideIfActive,
        activeView: () => activeView
    };
}

/**
 * Toggle the research drawer while respecting an explicit close request from other systems.
 * @param {object} game live game singleton.
 * @param {boolean} [forceOpen] explicitly close when false, otherwise open.
 */
function toggleResearch(game, forceOpen) {
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
 * Rebuild the research modal using the shared card visuals so tech options mirror
 * the upgrade screen, including hover/active feedback and unified cost badges.
 * @param {object} game live game singleton exposing research state and helpers.
 */
function updateResearchUI(game) {
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

            tech.costOptions.forEach((opt, idx) => {
                const optCost = game.getTechCost(tech, opt.id);
                const label = document.createElement('button');
                const costLabel = optCost ? game.formatCost(optCost) : '';
                label.className = 'card-btn option-btn';
                label.innerText = `${opt.name}\n${costLabel}`;
                label.setAttribute('aria-pressed', 'false');
                label.onclick = () => {
                    selectedOptionId = opt.id;
                    purchaseBtn.disabled = !optCost || !game.canPayCost(optCost);
                    applyPurchaseAffordability(purchaseBtn, !purchaseBtn.disabled);
                    optionPicker.querySelectorAll('button').forEach((btn) => btn.classList.remove('active'));
                    label.classList.add('active');
                    label.setAttribute('aria-pressed', 'true');
                    purchaseBtn.innerText = formatPurchaseLabel(costLabel);
                    purchaseBtn.title = opt.tooltip || '';
                };
                if (idx === 0) label.onclick();
                optionPicker.appendChild(label);
            });

            purchaseBtn.innerText = formatPurchaseLabel(hasAffordableOption ? 'Select focus' : null);
            purchaseBtn.title = 'Choose a focus to see its cost.';
            applyPurchaseAffordability(purchaseBtn, false);
            purchaseBtn.onclick = () => {
                const option = tech.costOptions.find((opt) => opt.id === selectedOptionId);
                if (!option) return;
                game.buyTech(tech, option);
            };

            controls.appendChild(optionPicker);
            controls.appendChild(purchaseBtn);
            affordable = hasAffordableOption;
        } else {
            const purchaseBtn = document.createElement('button');
            const cost = game.getTechCost(tech);
            const costLabel = cost ? game.formatCost(cost) : '';
            purchaseBtn.classList.add('card-btn', 'primary-btn', 'tech-purchase-btn');
            purchaseBtn.innerText = `Purchase${purchaseIndexLabel ? ` ${purchaseIndexLabel}` : ''} (${costLabel})`;
            purchaseBtn.onclick = () => game.buyTech(tech);
            affordable = cost && (tech.id !== 'land-reclamation' || game.hasFieldToConvert()) && game.canPayCost(cost);
            applyPurchaseAffordability(purchaseBtn, affordable);
            controls.appendChild(purchaseBtn);
        }

        const desc = document.createElement('p');
        desc.className = 'upgrade-strip__description';
        desc.innerText = tech.description;

        const costs = document.createElement('div');
        costs.className = 'tech-row__costs';
        const spend = game.getTechCost(tech);
        const hasWoodCost = spend && typeof spend.wood === 'number';
        const hasGoldCost = spend && typeof spend.gold === 'number';
        const hasRequirements = (Array.isArray(tech.requirements) && tech.requirements.length > 0)
            || typeof tech.requiresLives === 'number'
            || tech.prereq;

        const createCostBadge = (icon, text) => {
            const badge = document.createElement('span');
            badge.className = 'cost-badge';
            badge.innerText = `${icon} ${text}`;
            return badge;
        };

        if (hasWoodCost) costs.appendChild(createCostBadge('🪵', `${spend.wood} wood`));
        if (hasGoldCost) costs.appendChild(createCostBadge('🪙', `${spend.gold} gold`));
        if (tech.prereq) costs.appendChild(createCostBadge('✨', `${tech.prereq} required`));
        if (typeof tech.requiresLives === 'number') costs.appendChild(createCostBadge('❤️', `${tech.requiresLives} lives`));
        if (hasRequirements) costs.appendChild(createCostBadge('🔗', 'Has dependencies'));

        const status = document.createElement('div');
        status.className = 'tech-row__status';
        const owned = document.createElement('span');
        owned.className = 'tech-row__owned';
        owned.innerText = tech.timesPurchased > 0 ? 'Owned' : 'Locked';

        const footer = document.createElement('div');
        footer.className = 'tech-row__footer';
        footer.innerText = tech.flavour || 'Focus specialization for the Imperial Bureau of Technology.';

        const requirementLabel = game.describeTechRequirements(tech);
        const reqEl = document.createElement('p');
        reqEl.className = 'tech-row__requirements';
        reqEl.innerText = requirementLabel;
        reqEl.title = requirementLabel;

        const purchasable = affordable && canBuyMore;
        const purchaseState = purchasable ? 'Available' : canBuyMore ? 'Locked' : 'Maxed';
        const stateLabel = document.createElement('span');
        stateLabel.className = `tech-state tech-state--${purchasable ? 'ready' : 'blocked'}`;
        stateLabel.innerText = purchaseState;

        status.appendChild(owned);
        status.appendChild(stateLabel);

        row.appendChild(title);
        row.appendChild(controls);
        card.appendChild(row);
        card.appendChild(costs);
        card.appendChild(status);
        card.appendChild(desc);
        card.appendChild(reqEl);
        card.appendChild(footer);

        grid.appendChild(card);
    });
}

/**
 * Refresh the HUD resource slab with the latest overworld economy and imperial favor.
 * @param {object} game live game singleton exposing resource values and favor.
 */
function updateHUD(game) {
    document.getElementById('gold').innerText = Math.floor(game.gold);
    document.getElementById('wood').innerText = Math.floor(game.wood);
    const lives = document.getElementById('lives-count');
    if (lives) lives.innerText = game.research.lives;
    const imperialFavor = document.getElementById('imperial-favor');
    if (imperialFavor) imperialFavor.innerText = clampImperialFavor(game.imperialFavor ?? DEFAULT_IMPERIAL_FAVOR);
    const calendar = document.getElementById('calendar-readout');
    if (calendar) {
        const formatted = game.timekeeper?.formatCalendar?.() || 'M: Jan Y1 | W: 1/4 | D: 1/28';
        calendar.innerText = formatted;
        const weeksPerMonth = game.timekeeper?.weeksPerMonth || 4;
        const daysPerWeek = game.timekeeper?.daysPerWeek || 7;
        calendar.title = `${weeksPerMonth} weeks/month · ${daysPerWeek}-day weeks`;
    }
    const pauseToggle = document.getElementById('btn-pause');
    if (pauseToggle) {
        pauseToggle.innerText = game.paused ? '▶️ Resume' : '⏸️ Pause';
        pauseToggle.setAttribute('aria-pressed', game.paused ? 'true' : 'false');
    }
    const pauseIndicator = document.getElementById('pause-indicator');
    if (pauseIndicator) {
        pauseIndicator.innerText = game.paused ? 'Paused' : 'Live';
        pauseIndicator.classList.toggle('paused', !!game.paused);
    }
    document.getElementById('lvl-txt').innerText = `Lv.${game.difficulty}`;
}

export { clampImperialFavor, createHudDrawerController, toggleResearch, updateHUD, updateResearchUI };
