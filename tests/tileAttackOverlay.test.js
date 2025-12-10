const assert = require('assert');

function createStubButton(id) {
    return {
        id,
        style: {},
        onclick: null,
        attributes: new Map(),
        classList: {
            classes: new Set(),
            add(cls) { this.classes.add(cls); },
            remove(cls) { this.classes.delete(cls); },
            toggle(cls, state) {
                const shouldAdd = state === undefined ? !this.classes.has(cls) : Boolean(state);
                if (shouldAdd) this.classes.add(cls); else this.classes.delete(cls);
            },
            contains(cls) { return this.classes.has(cls); }
        },
        setAttribute(name, value) { this.attributes.set(name, value); },
        getAttribute(name) { return this.attributes.get(name); }
    };
}

async function run() {
    const button = createStubButton('tile-attack-overlay-btn');
    global.document = {
        getElementById: (id) => (id === button.id ? button : null)
    };

    const { updateTileAttackOverlay } = await import('../scripts/bootstrap/tileAttackOverlay.mjs');

    const beginCalls = [];
    const game = {
        state: 'OVERWORLD',
        projectHexToScreen: () => ({ x: 120, y: 180 }),
        beginBattleFromTile: (...args) => beginCalls.push(args)
    };
    const hostileTile = { status: 'HOSTILE', owner: 'enemy', hex: { q: 0, r: 0 } };

    updateTileAttackOverlay(game, hostileTile);

    assert.strictEqual(button.style.display, 'inline-flex', 'hostile tiles should reveal the attack button');
    assert.strictEqual(button.style.left, '120px');
    assert.strictEqual(button.style.top, '148px', 'button should offset slightly above the tile center');
    assert.ok(button.classList.contains('active'), 'active state should reflect hostile target');
    assert.strictEqual(button.getAttribute('aria-hidden'), 'false');

    button.onclick({ stopPropagation: () => {} });
    assert.strictEqual(beginCalls.length, 1, 'clicks should route to beginBattleFromTile');
    assert.strictEqual(beginCalls[0][0], hostileTile, 'click handler should forward the selected tile');

    updateTileAttackOverlay(game, { status: 'FRIENDLY', owner: 'player', hex: { q: 0, r: 0 } });

    assert.strictEqual(button.style.display, 'none', 'non-hostile tiles should hide the attack overlay');
    assert.strictEqual(button.getAttribute('aria-hidden'), 'true');
    assert.strictEqual(button.onclick, null, 'click handler should clear when hidden');

    delete global.document;
    console.log('Tile attack overlay helper tests passed.');
}

run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
