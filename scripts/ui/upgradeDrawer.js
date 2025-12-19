/**
 * Refresh the shared drawer header with context for either upgrades or research.
 * @param {'upgrades'|'research'} mode active drawer view.
 * @param {object} game live game singleton exposing research metadata.
 */
export function syncHudDrawerHeader(mode, game) {
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
export function bindUpgradeButtons(game) {
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
export function createHudDrawerController(game) {
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

const UPGRADE_COPY = {
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

/**
 * Refresh the upgrade drawer so titles, descriptions, scaling text, and purchase
 * buttons reflect the player's current gold and upgrade levels.
 * @param {object} game live game singleton containing upgrade levels and gold.
 */
export function updateUpgradeMenu(game) {
    const definitions = [
        { id: 'soldier', buttonId: 'buy-soldier' },
        { id: 'archer', buttonId: 'buy-archer' },
        { id: 'production', buttonId: 'buy-prod' },
        { id: 'mines', buttonId: 'buy-mines' },
        { id: 'defense', buttonId: 'buy-defense' }
    ];

    const ensureText = (el, text) => { if (el && text) el.innerText = text; };

    definitions.forEach(({ id, buttonId }) => {
        const btn = document.querySelector(`[data-upgrade-button="${id}"]`) || document.getElementById(buttonId);
        const card = btn?.closest?.('[data-upgrade-card]') || document.querySelector(`[data-upgrade-card="${id}"]`);
        const titleEl = document.querySelector(`[data-upgrade-title="${id}"]`);
        const descEl = document.querySelector(`[data-upgrade-description="${id}"]`);
        const scaleEl = document.querySelector(`[data-upgrade-scale="${id}"]`);

        const level = Number.isFinite(game.upgrades?.[id]) ? Math.max(1, game.upgrades[id]) : 1;
        const nextLevel = level + 1;
        const cost = typeof game.getUpgradeCost === 'function' ? game.getUpgradeCost(id) : 0;
        const costLabel = `${cost}g`;
        const canAfford = (Number.isFinite(game.gold) ? game.gold : 0) >= cost;
        const copy = UPGRADE_COPY[id] || {};

        ensureText(titleEl, copy.title);
        ensureText(descEl, copy.description);
        const scaleText = typeof copy.scale === 'function' ? copy.scale(level) : copy.scale;
        ensureText(scaleEl, scaleText);

        if (!btn) return;

        const labelText = `Purchase Lv.${nextLevel}`;
        const combined = canAfford ? `${labelText} (${costLabel})` : costLabel;
        const label = btn.querySelector('[data-upgrade-label]');
        const costEl = btn.querySelector('[data-upgrade-cost]');

        if (label || costEl) {
            if (label) label.innerText = canAfford ? labelText : '';
            if (costEl) costEl.innerText = costLabel;
            btn.setAttribute('aria-label', canAfford ? combined : `Lv.${nextLevel} costs ${costLabel}`);
        } else {
            btn.innerText = combined;
        }

        btn.disabled = !canAfford;
        btn.classList.toggle('affordable', canAfford);
        btn.classList.toggle('unaffordable', !canAfford);
        btn.title = canAfford ? '' : 'Insufficient gold';
        if (card) {
            card.classList.toggle('affordable', canAfford);
            card.classList.toggle('unaffordable', !canAfford);
        }
    });
}

/**
 * Bind upgrade drawer utilities to the game object for easy access elsewhere in the codebase.
 * @param {object} game live game singleton.
 */
export function bindUpgradeDrawer(game) {
    game.updateUpgradeMenu = () => updateUpgradeMenu(game);
}
