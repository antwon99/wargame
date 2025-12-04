# Imperial Mandate Timelines

Mandate deadlines now align with the Timekeeper tick counter and persist across reloads.

## Duration and cadence
- **Frontier Sweep (`destroy_first_rebel_camp`)**: issued as soon as the overworld exists; deadline is **2 weeks + 1 day** after issuance.
- **Imperial Tax Levy (`levy_tithed_gold`)**: earliest issue after **Week 1** when gold ≥120; deadline is **1 week + 1 day** after issuance.
- **Push the Frontier (`push_the_frontier`)**: earliest issue after **Week 2** once you own ≥4 tiles; deadline is **1 week + 5 days** after issuance.

All deadlines are stored as absolute ticks using the current `daysPerWeek`/`weeksPerMonth` Timekeeper config. Reloads restore the same tick counter so reminder banners and expiry checks resume accurately.

## UX reminders
- Mandate banners enqueue through the notification stack; any queued or visible cards are serialized and replayed after a load to avoid losing warnings.
- Deadline labels use the Timekeeper to render `Month/Week/Day` text, matching the HUD calendar pill.
