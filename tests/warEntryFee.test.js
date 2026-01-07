import assert from 'assert';
import { computeWarEntryFee } from '../scripts/combatEngine.js';

function withMonth(month) {
    return {
        getCalendar: () => ({ month })
    };
}

function testWarEntryScalesWithDifficulty() {
    const dummyGame = { stats: { warsWon: 0 }, timekeeper: withMonth(1) };
    assert.strictEqual(computeWarEntryFee(dummyGame), 22, 'Wars should cost 22g at the baseline enemy level');

    dummyGame.stats.warsWon = 3;
    assert.strictEqual(computeWarEntryFee(dummyGame), 58, 'Enemy level should add significant gold pressure');
}

function testWarEntryRespectsCalendarGrowth() {
    const midCampaign = { stats: { warsWon: 2 }, timekeeper: withMonth(6) };
    assert.strictEqual(computeWarEntryFee(midCampaign), 52, 'Mid-campaign wars should be pricier than early ones');

    const yearTwo = { stats: { warsWon: 1 }, timekeeper: withMonth(13) };
    assert.strictEqual(computeWarEntryFee(yearTwo), 57, 'Looping the calendar should push fees higher still');
}

function run() {
    testWarEntryScalesWithDifficulty();
    testWarEntryRespectsCalendarGrowth();
    console.log('All war entry fee tests passed.');
}

run();
