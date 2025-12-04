const assert = require('assert');

async function run() {
    const { Timekeeper } = await import('../scripts/timekeeper.js');
    const tk = new Timekeeper({ daysPerWeek: 8, weeksPerMonth: 5 });

    const start = tk.getCalendar();
    assert.deepStrictEqual(
        start,
        { dayOfWeek: 1, weekOfMonth: 1, month: 1, day: 1, dayOfMonth: 1, daysPerMonth: 40 },
        'fresh calendar should start on Day 1'
    );

    tk.advance(7); // Move to final day of first week (8-day week)
    const endOfWeek = tk.getCalendar();
    assert.strictEqual(endOfWeek.dayOfWeek, 8, 'day counter should land on final weekday');
    assert.strictEqual(endOfWeek.weekOfMonth, 1, 'still first week of month one');
    assert.strictEqual(endOfWeek.month, 1, 'month should not advance during first week');

    tk.advance(33); // Cross into the second month (7 + 33 = 40 ticks)
    const newMonth = tk.getCalendar();
    assert.strictEqual(newMonth.dayOfWeek, 1, 'month rollover should reset weekday counter');
    assert.strictEqual(newMonth.weekOfMonth, 1, 'new month should start at week one');
    assert.strictEqual(newMonth.month, 2, 'tick math should advance the month counter');

    const formatted = tk.formatCalendar();
    assert.strictEqual(formatted, 'Month 2, Week 1 of 5, Day 1 of 8', 'formatCalendar should match calculated values');

    const rollover = new Timekeeper({ daysPerWeek: 8, weeksPerMonth: 5, startTick: 39 });
    const endOfMonth = rollover.getCalendar();
    assert.deepStrictEqual(
        endOfMonth,
        { dayOfWeek: 8, weekOfMonth: 5, month: 1, day: 40, dayOfMonth: 40, daysPerMonth: 40 },
        'calendar should recognize the final day of a 40-day month'
    );

    rollover.advance(1);
    const secondMonth = rollover.getCalendar();
    assert.strictEqual(secondMonth.month, 2, 'advancing past tick 39 should enter month two');
    assert.strictEqual(secondMonth.weekOfMonth, 1, 'month rollover resets the week counter');
    assert.strictEqual(secondMonth.dayOfWeek, 1, 'new month starts at day one of the week');

    rollover.reset(4);
    assert.strictEqual(
        rollover.formatCalendar(),
        'Month 1, Week 1 of 5, Day 5 of 8',
        'reset should snap back to the revised cadence and formatting'
    );

    console.log('Timekeeper tick conversion tests passed.');
}

run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
