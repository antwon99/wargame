const assert = require('assert');
const MandateCalendar = require('../scripts/mandateCalendar.js');

function testConvertToTicksRespectsConfig() {
    const defaultTicks = MandateCalendar.convertToTicks({ months: 1, weeks: 1, days: 3 });
    assert.strictEqual(defaultTicks, 38, 'default calendar should convert months, weeks, and days to ticks');

    const gameState = { timekeeper: { daysPerWeek: 5, weeksPerMonth: 3 } };
    const customTicks = MandateCalendar.convertToTicks({ months: 1, weeks: 2, days: 1 }, gameState);
    assert.strictEqual(customTicks, 26, 'custom pacing should influence tick conversion');
}

function testMonthLabelsRollOverIntoYears() {
    const thirteenthMonth = MandateCalendar.getMonthLabel(13);
    assert.strictEqual(thirteenthMonth.label, 'Jan Y2', 'month labels should roll over to the next year after month 12');
    assert.strictEqual(thirteenthMonth.year, 2, 'year count should increment after the first 12 months');
}

function testDescribeDeadlineFormatting() {
    const { label, remainingDays } = MandateCalendar.describeDeadlineTick(15, { currentTick: 10 });
    assert.strictEqual(remainingDays, 5, 'remaining days should subtract current tick from the deadline');
    assert.strictEqual(label, 'M: Jan Y1 | W: 3/4 | D: 15/28', 'deadline labels should include month, week, and day progress');
}

async function run() {
    testConvertToTicksRespectsConfig();
    testMonthLabelsRollOverIntoYears();
    testDescribeDeadlineFormatting();
    console.log('All mandate calendar tests passed.');
}

run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
