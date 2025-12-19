import { createNotificationStack, getSharedStack, setSharedStack } from './notificationStack.js';

/**
 * Notification binding helpers responsible for wiring the shared toast stack to the game singleton.
 * Keeping these bindings separate makes it easier to unit test enqueue/dismiss behaviors without
 * pulling in unrelated UI wiring.
 */
let cachedNotificationStack = null;

/**
 * Lazily create (or return) the shared notification stack anchored to the game container.
 * Keeping a single instance prevents duplicate DOM overlays when the UI bindings are
 * re-applied after a reset or test harness initialization.
 * @returns {import('./notificationStack.js').NotificationStack|null}
 */
function getOrCreateNotificationStack() {
    if (cachedNotificationStack) return cachedNotificationStack;
    if (typeof document === 'undefined') return null;
    const mountPoint = document.getElementById('game-container') || document.body;
    cachedNotificationStack = createNotificationStack({ mountPoint });
    setSharedStack(cachedNotificationStack);
    return cachedNotificationStack;
}

/**
 * Attach notification helpers to the game object so other systems can enqueue or dismiss toasts
 * without importing DOM-heavy modules.
 * @param {object} game live game singleton.
 * @returns {import('./notificationStack.js').NotificationStack|null}
 */
export function bindNotificationHelpers(game) {
    const notificationStack = getOrCreateNotificationStack();
    /**
     * Surface the shared notification stack so gameplay systems can enqueue toasts without
     * importing DOM code. Cards auto-fade and stack in the HUD corner.
     */
    game.enqueueNotification = (payload) => notificationStack?.enqueue(payload);
    /**
     * Allow direct programmatic dismissal for cases where a notification is superseded
     * (e.g., mandate resolved before the reminder expires).
     */
    game.dismissNotification = (id) => notificationStack?.dismiss(id);
    /** Retrieve the underlying stack instance for advanced UI integration. */
    game.getNotificationStack = () => getSharedStack();
    return notificationStack;
}

export { getOrCreateNotificationStack };
