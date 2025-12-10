import { createNotificationStack, getSharedStack, setSharedStack } from '../notificationStack.js';

let cachedNotificationStack = null;

/**
 * Lazily create (or return) the shared notification stack anchored to the game container.
 * Keeping a single instance prevents duplicate DOM overlays when the UI bindings are
 * re-applied after a reset or test harness initialization.
 * @returns {import('../notificationStack.js').NotificationStack|null}
 */
export function getOrCreateNotificationStack() {
    if (cachedNotificationStack) return cachedNotificationStack;
    if (typeof document === 'undefined') return null;
    const mountPoint = document.getElementById('game-container') || document.body;
    cachedNotificationStack = createNotificationStack({ mountPoint });
    setSharedStack(cachedNotificationStack);
    return cachedNotificationStack;
}

/**
 * Bind notification helpers onto the live game instance.
 * @returns {object} thin wrapper exposing enqueue/dismiss controls for the shared stack.
 */
export function applyNotificationBindings() {
    const notificationStack = getOrCreateNotificationStack();
    return {
        notificationStack,
        enqueueNotification: (payload) => notificationStack?.enqueue(payload),
        dismissNotification: (id) => notificationStack?.dismiss(id),
        getNotificationStack: () => getSharedStack()
    };
}
