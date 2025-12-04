# HUD Elements

The HUD surfaces quick-read campaign data without opening menus. Layout is organized into four horizontal zones so players can predict where to look as situations change:

- **Left**: Player economy. Gold and Wood counters live here and refresh when income ticks or mandates alter stockpiles.
- **Middle-Left**: Imperial favor. The `#imperial-favor` pill shows the clamped 1–10 favor score that influences decree tone. Saves persist this value so reloads retain political standing.
- **Middle**: Timekeeping. The `#calendar-readout` renders `Timekeeper.formatCalendar()` (Month → Week → Day), with persistence storing ticks/config so the calendar remains accurate after reloads.
- **Right**: Threat/updates. Enemy proximity or threat indicators sit adjacent to the notification stack.

Favor and enemy widgets bookend the central timeline: favor stays just left of center to mirror your standing, while enemy pressure lives to the right to mirror approaching danger.

The HUD reads directly from live game state and persistence snapshots to keep favor, calendar position, and reminders aligned with the stored timeline.

## Mandates Panel

Mandate notifications appear in a right-anchored, sliding panel. Cards enter from the right edge, stack downward, and can be replayed after UI bindings mount so reminders persist when players reload mid-mandate.

```
| Left            | Middle-Left      | Middle            | Right (slides in) |
| gold | wood     | [favor pill]     | [calendar]        | [enemy][alerts]   |
|                 |                  |                   | >>> [mandates]    |
```
