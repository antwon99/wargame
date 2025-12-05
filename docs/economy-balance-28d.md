# 28-Day Economy + AI Scaling Notes

This balance pass realigns the overworld calendar to 7-day weeks and 4-week months while tightening long-run resource pacing and AI pressure.

## Calendar + HUD
- Timekeeper now labels months with real names (Jan, Feb, …) and tracks years every 12 months.
- HUD reads `M: Jan Y1 | W: 1/4 | D: 1/28` by default to reinforce the shorter cadence.

## Overworld Economy
- Tile incomes assume 28-day months: castle gold is 3/day, towns 3/day, mines 4/day (+40g on claim), forests 2 wood/day, ruins 2g/day.
- Claim costs now scale at `12 + 6 * distance` wood to keep expansion meaningful against the faster monthly loop.
- Default tick rate stays at 3.5s/day, yielding ~98 seconds per month with the richer incomes.

## Combat Pressure
- War entry fees: `10 + (difficulty * 12) + (⌊(month-1)/2⌋ * 3) + (year-1) * 5`.
- Victory rewards scale with difficulty and era (every 3 months) to keep wars funding the next push.
- AI prep uses the same calendar: starting gold rises with difficulty and months, and the decision cadence tightens as levels climb.
- Rebels claim 65% of post-war penalty tiles to keep frontier pressure rising.

## Validation
- `tests/longRunSim.test.js` simulates three months of income to verify gold/wood flow under the 28-day loop and checks AI prep scaling.
- `tests/warEntryFee.test.js` covers the new mobilization fee curve across difficulty, month, and year boundaries.
