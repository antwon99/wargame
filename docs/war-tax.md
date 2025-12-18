# Royal War Tax

This file documents the new royal levy that trims runaway war profits.

## Rate and Scope
- **Flat rate:** 15% of wartime gold flows to the crown.
- **Victory:** The levy is applied to the gold reward calculated from difficulty and era. Wood is untouched.
- **Defeat:** After the pillaging penalty is removed, the levy is taken from the remaining gold to ensure the crown still collects.

## UI Feedback
- `spawnTxt` surfaces a `-Xg royal levy` line alongside the existing victory/defeat messaging so players understand why their payout shrank.
- Floating text mirrors the levy with an alert tone to match other economic hits.

## Balance Intent
The levy reins in extreme early-war profits (high-kill bounties) without eliminating the incentive to engage. Victories still advance difficulty and pay out, but both success and failure now carry a predictable royal skim that scales with the gold at stake.
