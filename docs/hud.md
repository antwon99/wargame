# HUD Elements

The HUD surfaces quick-read campaign data without opening menus. Layout now sits in three anchored horizontal zones so players can predict where to look as situations change:

- **Left**: System controls. The hamburger sidebar toggle and pause cluster stay pinned to the far left.
- **Center**: Economy and threat. Gold, wood, lives, and a unified enemy level + imperial favor pill remain horizontally centered on the viewport.
- **Right**: Imperial systems. Calendar/timekeeping (compact `M | W | D` readout) and the Tasks/Mandates trigger anchor to the far right, with the mandates panel sliding in from this edge.

All HUD bindings still hydrate from live game state and persistence snapshots so favor, calendar position, and reminders remain aligned with the stored timeline.

## Stateful HUD behaviors
Each HUD pill is tied to the 28-day timeline described in `docs/timekeeper.md`. The calendar pill always formats Month → Week → Day, while pause and mandate toggles keep the slab readable even when the overworld loop is stopped.

| Trigger | Calendar pill | Pause button | Pause indicator | Mandates panel |
| --- | --- | --- | --- | --- |
| Overworld tick (unpaused) | Updates `M: <Mon> Y# | W: #/4 | D: #/28` | Shows ⏸️ Pause | “Live”, no `paused` class | Can slide open; badge tones update from deadlines |
| Toggle pause | Holds current calendar text (Timekeeper frozen) | Swaps to ▶️ Resume + `aria-pressed="true"` | “Paused” + `paused` class | Still readable; pointer-events remain off on the canvas |
| Leave overworld (combat/intro) | Calendar persists from last tick | No change | No change | Flyout stays closed; tile inspector hides |

```
[Timekeeper.advance()] -> updateHUD() -> calendar text + tooltip refresh
                                   -> pause button label + aria state
                                   -> pause indicator text + class toggle
```

## Mandates Panel

Mandate notifications appear in a right-anchored, sliding panel. Cards enter from the right edge, stack downward, and can be replayed after UI bindings mount so reminders persist when players reload mid-mandate.

```
| Left (controls) |                 Center (resources + threat)                  | Right (imperial systems) |
| menu | pause    | [gold][wood][lives]  [enemy | favor]                        | [calendar] [Tasks/Mandates ↦] |
|                 |                                                          ↤ slide-in mandates panel          |
```
