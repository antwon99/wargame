const assert = require('assert');
const { computeWarEntryFee } = require('../scripts/combatEngine.js');

function withMonth(month) {
    return {
        getCalendar: () => ({ month })
    };
}

function testWarEntryScalesWithDifficulty() {
    const dummyGame = { difficulty: 0, timekeeper: withMonth(1) };
    assert.strictEqual(computeWarEntryFee(dummyGame), 10, 'Wars should cost a nominal 10g at campaign start');

    dummyGame.difficulty = 3;
    assert.strictEqual(computeWarEntryFee(dummyGame), 46, 'Difficulty should add significant gold pressure');
}

function testWarEntryRespectsCalendarGrowth() {
    const midCampaign = { difficulty: 2, timekeeper: withMonth(6) };
    assert.strictEqual(computeWarEntryFee(midCampaign), 40, 'Mid-campaign wars should be pricier than early ones');

    const yearTwo = { difficulty: 1, timekeeper: withMonth(13) };
    assert.strictEqual(computeWarEntryFee(yearTwo), 45, 'Looping the calendar should push fees higher still');
}

function run() {
    testWarEntryScalesWithDifficulty();
    testWarEntryRespectsCalendarGrowth();
    console.log('All war entry fee tests passed.');
}

run();
