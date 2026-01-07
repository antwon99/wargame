import assert from 'assert';
import { updateHUD } from '../scripts/uiBindings.js';

function createStubElement() {
    return {
        innerText: '',
        title: '',
        classList: {
            toggle: () => {}
        },
        setAttribute: () => {}
    };
}

function createDocumentStub(ids) {
    const elements = new Map();
    ids.forEach((id) => elements.set(id, createStubElement()));
    return {
        getElementById: (id) => elements.get(id) || null,
        elements
    };
}

function testLevelDisplayDerivedFromWarsWon() {
    const originalDocument = global.document;
    try {
        const doc = createDocumentStub([
            'gold',
            'wood',
            'lives-count',
            'imperial-favor',
            'calendar-readout',
            'btn-pause',
            'pause-indicator',
            'lvl-txt'
        ]);
        global.document = doc;

        const game = {
            gold: 100,
            wood: 50,
            paused: false,
            difficulty: 3,
            research: { lives: 1 },
            imperialFavor: 5,
            timekeeper: {
                formatCalendar: () => 'M: Jan Y1 | W: 1/4 | D: 1/28',
                weeksPerMonth: 4,
                daysPerWeek: 7
            },
            stats: { warsWon: 1, warsFought: 1 }
        };

        updateHUD(game);

        assert.strictEqual(
            doc.elements.get('lvl-txt').innerText,
            'Lv.2',
            'level display should derive from wars won with the +1 baseline'
        );
    } finally {
        global.document = originalDocument;
    }
}

testLevelDisplayDerivedFromWarsWon();
console.log('Leaderboard level invariant test passed.');
