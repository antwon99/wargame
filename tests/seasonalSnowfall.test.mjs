import assert from 'assert';
import { computeSeasonalSnowfallIntensity, SeasonalSnowfallController, DEBUG_MODES } from '../scripts/seasonalSnowfall.js';

async function run() {
    const janCalendar = { month: 1, dayOfMonth: 1, daysPerMonth: 28 };
    const julyCalendar = { month: 7, dayOfMonth: 14, daysPerMonth: 28 };
    const novemberCalendar = { month: 11, dayOfMonth: 10, daysPerMonth: 28 };

    const januaryIntensity = computeSeasonalSnowfallIntensity(janCalendar);
    const julyIntensity = computeSeasonalSnowfallIntensity(julyCalendar);
    assert.ok(januaryIntensity > 0.9, 'January should peak the snowfall curve');
    assert.strictEqual(julyIntensity, 0, 'High summer should disable snowfall when no noise floor is used');

    const novemberToDecember = computeSeasonalSnowfallIntensity({ ...novemberCalendar, dayOfMonth: 27, daysPerMonth: 28 });
    const decemberStart = computeSeasonalSnowfallIntensity({ month: 12, dayOfMonth: 1, daysPerMonth: 28 });
    assert.ok(decemberStart >= novemberToDecember, 'Intensity should ramp upward heading into winter');

    const controller = new SeasonalSnowfallController({
        timekeeper: { getCalendar: () => ({ month: 3, dayOfMonth: 14, daysPerMonth: 28 }) },
        noiseFloor: 0.04,
        smoothingRate: 10
    });
    const springProfile = controller.update(0.016);
    assert.ok(springProfile.intensity >= 0.04, 'Noise floor should persist even when the month is mapped to low intensity');

    controller.setDebugMode(DEBUG_MODES.SUMMER);
    const forcedSummer = controller.update(0.5, janCalendar);
    assert.strictEqual(forcedSummer.intensity, controller.noiseFloor, 'Summer override should clamp to the noise floor');

    controller.setDebugMode(DEBUG_MODES.WINTER);
    const forcedWinter = controller.update(0.5, julyCalendar);
    assert.ok(forcedWinter.intensity > 0.9, 'Winter override should force peak intensity');

    controller.freeze(0.25);
    const frozenProfile = controller.update(1, julyCalendar);
    assert.strictEqual(frozenProfile.intensity, 0.25, 'Frozen override should pin the intensity regardless of calendar changes');

    controller.unfreeze();
    controller.setDebugMode(DEBUG_MODES.NONE);
    const resumedProfile = controller.update(0.5, julyCalendar);
    assert.ok(resumedProfile.intensity < 0.26, 'Unfreezing should resume lerping toward the computed target');

    console.log('Seasonal snowfall tests passed.');
}

run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
