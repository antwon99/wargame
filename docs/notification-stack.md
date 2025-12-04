# Notification Stack

The notification stack provides lightweight, non-blocking decree cards that live in the HUD corner. It is intended for mandate reminders, rewards, and other short-lived dispatches that should not pause gameplay.

## Behavior
- Cards queue when more than `maxVisible` (default 3) are requested. The queue automatically drains as visible cards fade out.
- Each card auto-dismisses after `autoDismissMs` (default 5200 ms) unless a shorter `duration` is supplied per payload.
- Manual dismissal promotes the next queued card, keeping the stack responsive during heavy notification bursts.
- Pointer events are disabled on the stack container so canvas/tile interactions continue to flow, while the cards themselves remain clickable for dismissal.

## Integration
- `NotificationStackApi` is registered on `globalThis` for non-module consumers and exposes `createNotificationStack`, `getSharedStack`, and `setSharedStack`.
- `applyUIBindings` instantiates a shared stack and injects `enqueueNotification`, `dismissNotification`, and `getNotificationStack` onto the `Game` object so gameplay systems can trigger toasts without touching DOM code.
- Mandate banners now call `enqueueNotification` (falling back to the modal only for the intro decree) to avoid center-screen overlays during play.

## Payload shape
```
{
  title: 'Imperial Reminder',
  lines: ['Levy due in 2 ticks.', 'Secure the tithe before collectors arrive.'],
  duration: 4600, // optional override
  tone: 'warning' // optional: info|warning|success
}
```

Use `tone` to adjust the accent border (success/warning) without changing layout.
