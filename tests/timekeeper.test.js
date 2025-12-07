const assert = require('assert');

async function run() {
    const { MONTH_NAMES, START_MONTH_INDEX, START_TICK, Timekeeper } = await import('../scripts/timekeeper.js');
    const tkDefault = new Timekeeper();

    assert.strictEqual(tkDefault.ticks, START_TICK, 'default start tick should align with the configured start month');
    const start = tkDefault.getCalendar();
    assert.deepStrictEqual(
        start,
        {
            dayOfWeek: 1,
            weekOfMonth: 1,
            month: START_MONTH_INDEX + 1,
            day: START_TICK + 1,
            dayOfMonth: 1,
            daysPerMonth: 28,
            monthName: MONTH_NAMES[START_MONTH_INDEX],
            year: 1
        },
        'fresh calendar should honor the configured starting month'
    );

    const tk = new Timekeeper({ startTick: 0 });
    tk.advance(6); // Move to final day of first week (7-day week)
    const endOfWeek = tk.getCalendar();
    assert.strictEqual(endOfWeek.dayOfWeek, 7, 'day counter should land on final weekday');
    assert.strictEqual(endOfWeek.weekOfMonth, 1, 'still first week of month one');
    assert.strictEqual(endOfWeek.month, 1, 'month should not advance during first week');

    tk.advance(22); // Cross into the second month (6 + 22 = 28 ticks)
    const newMonth = tk.getCalendar();
    assert.strictEqual(newMonth.dayOfWeek, 1, 'month rollover should reset weekday counter');
    assert.strictEqual(newMonth.weekOfMonth, 1, 'new month should start at week one');
    assert.strictEqual(newMonth.month, 2, 'tick math should advance the month counter');

    const formatted = tk.formatCalendar();
    assert.strictEqual(formatted, 'M: Feb Y1 | W: 1/4 | D: 1/28', 'formatCalendar should match calculated values');

    const rollover = new Timekeeper({ startTick: 27 });
    const endOfMonth = rollover.getCalendar();
    assert.deepStrictEqual(
        endOfMonth,
        { dayOfWeek: 7, weekOfMonth: 4, month: 1, day: 28, dayOfMonth: 28, daysPerMonth: 28, monthName: 'Jan', year: 1 },
        'calendar should recognize the final day of a 28-day month'
    );

    rollover.advance(1);
    const secondMonth = rollover.getCalendar();
    assert.strictEqual(secondMonth.month, 2, 'advancing past tick 39 should enter month two');
    assert.strictEqual(secondMonth.weekOfMonth, 1, 'month rollover resets the week counter');
    assert.strictEqual(secondMonth.dayOfWeek, 1, 'new month starts at day one of the week');

    rollover.reset(4);
    assert.strictEqual(
        rollover.formatCalendar(),
        'M: Jan Y1 | W: 1/4 | D: 5/28',
        'reset should snap back to the revised cadence and formatting'
    );

    console.log('Timekeeper tick conversion tests passed.');
}

run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
