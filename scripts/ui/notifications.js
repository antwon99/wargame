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
 * Attach notification helpers to the provided game instance so gameplay systems can
 * enqueue and dismiss toast cards without importing DOM-centric code.
 * @param {object} game live game singleton.
 * @returns {import('../notificationStack.js').NotificationStack|null}
 */
export function bindNotificationHelpers(game) {
    const notificationStack = getOrCreateNotificationStack();
    game.enqueueNotification = (payload) => notificationStack?.enqueue(payload);
    game.dismissNotification = (id) => notificationStack?.dismiss(id);
    game.getNotificationStack = () => getSharedStack();
    return notificationStack;
}
