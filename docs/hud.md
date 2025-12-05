# HUD Elements

The HUD surfaces quick-read campaign data without opening menus. Layout now sits in three anchored horizontal zones so players can predict where to look as situations change:

- **Left**: System controls. The hamburger sidebar toggle and pause cluster stay pinned to the far left.
- **Center**: Economy and threat. Gold, wood, lives, enemy level, and imperial favor cluster together and remain horizontally centered on the viewport.
- **Right**: Imperial systems. Calendar/timekeeping and the Tasks/Mandates trigger anchor to the far right, with the mandates panel sliding in from this edge.

All HUD bindings still hydrate from live game state and persistence snapshots so favor, calendar position, and reminders remain aligned with the stored timeline.

## Mandates Panel

Mandate notifications appear in a right-anchored, sliding panel. Cards enter from the right edge, stack downward, and can be replayed after UI bindings mount so reminders persist when players reload mid-mandate.

```
| Left (controls) |                 Center (resources + threat)                  | Right (imperial systems) |
| menu | pause    | [gold][wood][lives]  [enemy][favor]                         | [calendar] [Tasks/Mandates ↦] |
|                 |                                                          ↤ slide-in mandates panel          |
```
