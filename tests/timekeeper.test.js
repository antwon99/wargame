const assert = require('assert');

async function run() {
    const { Timekeeper } = await import('../scripts/timekeeper.js');
    const tk = new Timekeeper({ daysPerWeek: 7, weeksPerMonth: 4 });

    const start = tk.getCalendar();
    assert.deepStrictEqual(start, { dayOfWeek: 1, weekOfMonth: 1, month: 1, day: 1 }, 'fresh calendar should start on Day 1');

    tk.advance(6); // Move to final day of first week
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
    assert.strictEqual(formatted, 'Month 2, Week 1, Day 1', 'formatCalendar should match calculated values');

    console.log('Timekeeper tick conversion tests passed.');
}

run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
