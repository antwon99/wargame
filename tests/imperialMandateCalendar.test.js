const assert = require('assert');
const Calendar = require('../scripts/imperialMandateCalendar.js');

function buildGameState(overrides = {}) {
    return { timekeeper: { daysPerWeek: 6, weeksPerMonth: 3, ...overrides } };
}

function testConvertToTicksWithCustomCadence() {
    const gameState = buildGameState();
    const ticks = Calendar.convertToTicks({ months: 1, weeks: 1, days: 2 }, gameState);
    assert.strictEqual(ticks, (1 * 3 * 6) + (1 * 6) + 2, 'conversion should respect cadence from game state');
}

function testCalendarLabelsTrackMonthAndDay() {
    const gameState = buildGameState();
    const label = Calendar.formatCalendarLabel(18, gameState);
    assert.ok(label.startsWith('M: Feb Y1'), 'tick 18 should fall in the second month with the custom cadence');
    assert.ok(label.includes('D: 1/18'), 'day of month should match the cadence-derived calendar math');
}

function testDescribeDeadlineUsesCurrentTick() {
    const gameState = buildGameState({ daysPerWeek: 7, weeksPerMonth: 4 });
    const deadline = Calendar.describeDeadlineTick(12, 5, gameState);
    assert.strictEqual(deadline.remainingDays, 7, 'remaining days should subtract the provided current tick');
    assert.ok(deadline.label.includes('D: 12/28'), 'deadline label should format with the supplied cadence');
}

function testEarliestIssueConversion() {
    const entry = { definition: { earliestIssue: { weeks: 2, days: 3 } } };
    const ticks = Calendar.getEarliestIssueTick(entry, buildGameState());
    assert.strictEqual(ticks, (2 * 6) + 3, 'earliestIssue should leverage cadence-aware conversion');
}

async function run() {
    testConvertToTicksWithCustomCadence();
    testCalendarLabelsTrackMonthAndDay();
    testDescribeDeadlineUsesCurrentTick();
    testEarliestIssueConversion();
    console.log('imperialMandateCalendar.test.js passed');
}

if (require.main === module) {
    run();
}

module.exports = { run };
