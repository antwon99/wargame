/**
 * Notification stack manager for lightweight HUD toasts.
 *
 * Renders small, dismissible cards near the HUD corner without blocking tile
 * input. Notifications queue when the stack is saturated and fade out
 * automatically to keep the screen clear during active play sessions.
 */
let sharedStack = null;

/**
 * Wrap notification mutations in a UI audio guard so combat stingers stay
 * locked out while HUD toasts render.
 * @param {Function} fn callback to run while guarded.
 * @returns {*} callback result.
 */
function withNotificationAudioGuard(fn) {
    const audio = (typeof window !== 'undefined' ? window.GameAudio : globalThis.GameAudio);
    if (audio?.runWithUiGuard) return audio.runWithUiGuard(fn);
    return typeof fn === 'function' ? fn() : null;
}

/**
 * Represents a stack of transient notifications anchored to the viewport.
 */
export class NotificationStack {
    /**
     * @param {object} [options] configuration overrides.
     * @param {HTMLElement} [options.mountPoint] container to anchor against (defaults to body).
     * @param {number} [options.maxVisible=3] number of cards visible at once.
     * @param {number} [options.autoDismissMs=5200] default lifetime before auto-fade.
     * @param {boolean} [options.registerGlobal=true] set as the shared stack for other modules.
     * @param {Document} [options.document] optional document reference for test harnesses.
     */
    constructor(options = {}) {
        this.maxVisible = options.maxVisible || 3;
        this.autoDismissMs = options.autoDismissMs || 5200;
        this.document = options.document || (typeof document !== 'undefined' ? document : null);
        this.enabled = Boolean(this.document);
        this.mountPoint = options.mountPoint || (this.enabled ? this.document.body : null);
        this.registerGlobal = options.registerGlobal !== false;

        this.queue = [];
        this.visible = new Map();
        this.history = [];
        this.container = null;
        this.overlayGuardHandler = null;

        if (this.enabled) {
            this.container = this.createContainer();
            if (this.mountPoint) this.mountPoint.appendChild(this.container);
            this.syncIntroOverlayGuards();
            this.bindIntroOverlayEvents();
        }

        if (this.registerGlobal) {
            sharedStack = this;
        }
    }

    /**
     * Create the DOM container that holds all notification cards.
     * Pointer events are disabled at the container level so tiles beneath stay clickable.
     * @returns {HTMLElement} stack wrapper element.
     */
    createContainer() {
        const doc = this.document || document;
        const container = doc.createElement('div');
        container.className = 'notification-stack';
        container.setAttribute('aria-live', 'polite');
        container.setAttribute('role', 'status');
        return container;
    }

    /**
     * Enqueue a notification for rendering.
     * @param {object|string} payload notification fields or a single message string.
     * @param {string} [payload.id] stable identifier for deduplication.
     * @param {string} [payload.title] short headline to render above lines.
     * @param {Array<string>|string} [payload.lines] body text content.
     * @param {string} [payload.tone] optional tone for styling (info|warning|success).
     * @param {number} [payload.duration] override for auto-dismiss timing.
     * @returns {string} identifier for the enqueued notification.
     */
    enqueue(payload) {
        return withNotificationAudioGuard(() => {
            const normalized = typeof payload === 'string' ? { lines: [payload] } : { ...payload };
            const id = normalized.id || `note-${Date.now()}-${Math.random().toString(16).slice(2)}`;
            const lines = Array.isArray(normalized.lines)
                ? normalized.lines
                : (normalized.lines ? [normalized.lines] : []);

            const item = {
                ...normalized,
                id,
                lines,
                duration: typeof normalized.duration === 'number' ? normalized.duration : this.autoDismissMs
            };

            this.queue.push(item);
            this.history.push(item);
            this.flush();
            return id;
        });
    }

    /** Remove any existing notification by id (manual dismiss). */
    dismiss(id) {
        if (this.queue.some((item) => item.id === id)) {
            this.queue = this.queue.filter((item) => item.id !== id);
            return true;
        }

        const entry = this.visible.get(id);
        if (!entry) return false;

        if (entry.element) {
            entry.element.classList.add('closing');
            entry.element.addEventListener('transitionend', () => this.cleanup(id), { once: true });
        } else {
            this.cleanup(id);
        }
        return true;
    }

    /**
     * Render queued notifications until the visible stack is saturated.
     */
    flush() {
        while (this.visible.size < this.maxVisible && this.queue.length) {
            const next = this.queue.shift();
            this.render(next);
        }
        this.updateOffsets();
    }

    /**
     * Render an individual notification card and arm its auto-dismiss timer.
     * @param {object} item normalized notification payload.
     */
    render(item) {
        const entry = { item, element: null, timer: null };
        this.visible.set(item.id, entry);

        if (this.enabled && this.container) {
            entry.element = this.createCard(item);
            this.container.appendChild(entry.element);
            if (typeof requestAnimationFrame === 'function') {
                requestAnimationFrame(() => entry.element.classList.add('visible'));
            } else {
                entry.element.classList.add('visible');
            }
        }

        entry.timer = setTimeout(() => this.dismiss(item.id), item.duration);
    }

    /**
     * Build the DOM node for a single notification card.
     * @param {object} item notification payload.
     * @returns {HTMLElement} fully constructed card element.
     */
    createCard(item) {
        const doc = this.document || document;
        const card = doc.createElement('div');
        card.className = `notification-card${item.tone ? ` notification-card--${item.tone}` : ''}`;
        card.dataset.id = item.id;

        const heading = doc.createElement('div');
        heading.className = 'notification-title';
        heading.innerText = item.title || 'Imperial Dispatch';
        card.appendChild(heading);

        (item.lines || []).forEach((line) => {
            const bodyLine = doc.createElement('p');
            bodyLine.className = 'notification-line';
            bodyLine.innerText = line;
            card.appendChild(bodyLine);
        });

        const closeBtn = doc.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'notification-close';
        closeBtn.setAttribute('aria-label', 'Dismiss notification');
        closeBtn.innerText = '✕';
        closeBtn.addEventListener('click', (evt) => {
            evt.stopPropagation();
            this.dismiss(item.id);
        });
        card.appendChild(closeBtn);

        return card;
    }

    /** Recompute the stacking offsets so cards subtly ladder downward. */
    updateOffsets() {
        if (!this.enabled) return;
        Array.from(this.visible.values()).forEach((entry, idx) => {
            if (entry.element) entry.element.style.setProperty('--stack-index', idx);
        });
    }

    /** Remove a notification from the DOM and display queue. */
    cleanup(id) {
        const entry = this.visible.get(id);
        if (entry?.element?.parentNode) entry.element.parentNode.removeChild(entry.element);
        if (entry?.timer) clearTimeout(entry.timer);
        this.visible.delete(id);
        this.flush();
    }

    /**
     * Keep the notification stack behind the intro overlay and non-interactive
     * while the welcome gate is visible so it cannot block pointer events.
     */
    syncIntroOverlayGuards() {
        if (!this.container) return;
        const overlayActive = this.isIntroOverlayActive();
        this.container.classList.toggle('notification-stack--blocked', overlayActive);
    }

    /**
     * Determine whether the intro overlay is currently covering the viewport.
     * @returns {boolean} true if the intro overlay is active and should occlude notifications.
     */
    isIntroOverlayActive() {
        if (!this.enabled) return false;
        const overlayFromDom = this.document.getElementById
            ? this.document.getElementById('intro-overlay')
            : null;
        if (overlayFromDom && !overlayFromDom.classList.contains('intro-hidden')) return true;

        if (typeof globalThis.IntroOverlay !== 'undefined' && globalThis.IntroOverlay?.active) {
            return true;
        }

        return false;
    }

    /**
     * Listen for intro overlay lifecycle events so pointer guards stay in sync
     * if the player restarts or dismisses the opening overlay.
     */
    bindIntroOverlayEvents() {
        if (typeof window === 'undefined') return;
        this.overlayGuardHandler = () => this.syncIntroOverlayGuards();
        window.addEventListener('intro:begin', this.overlayGuardHandler);
        window.addEventListener('intro:reset', this.overlayGuardHandler);
    }
}

/**
 * Create a new notification stack and optionally register it as the shared instance.
 * @param {object} [options] stack options (see NotificationStack constructor).
 * @returns {NotificationStack} created stack instance.
 */
export function createNotificationStack(options = {}) {
    return new NotificationStack(options);
}

/** Retrieve the shared notification stack, if one has been registered. */
export function getSharedStack() {
    return sharedStack;
}

/** Override the shared stack reference, useful for hot-swapping during tests. */
export function setSharedStack(stack) {
    sharedStack = stack;
}

if (typeof globalThis !== 'undefined') {
    globalThis.NotificationStackApi = {
        NotificationStack,
        createNotificationStack,
        getSharedStack,
        setSharedStack
    };
}

export default NotificationStack;
