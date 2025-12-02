/**
 * Lightweight helper for rendering spatially anchored tutorial callouts near a hex tile.
 * The callout uses simple above/below placement and can be reused for future tutorials
 * without requiring additional overlay systems.
 */
(function (global) {
    let activeCallout = null;

    function clearAutoHideTimer() {
        if (!activeCallout?.autoHideTimer) return;
        const clearTimer = global.clearTimeout || clearTimeout;
        clearTimer(activeCallout.autoHideTimer);
        activeCallout.autoHideTimer = null;
    }

    function buildRectFromPoint(point, size = 48) {
        const half = size / 2;
        const left = (point?.x || 0) - half;
        const top = (point?.y || 0) - half;
        const width = size;
        const height = size;
        return { left, top, width, height, right: left + width, bottom: top + height };
    }

    function resolveAnchorRect(game, tile) {
        if (typeof document === 'undefined') {
            return buildRectFromPoint({ x: 0, y: 0 });
        }
        const candidate = tile?.element || tile?.el || tile?.node || null;
        if (candidate && typeof candidate.getBoundingClientRect === 'function') {
            const rect = candidate.getBoundingClientRect();
            const width = rect.width ?? (rect.right - rect.left);
            const height = rect.height ?? (rect.bottom - rect.top);
            return {
                left: rect.left,
                top: rect.top,
                width,
                height,
                right: rect.right ?? rect.left + width,
                bottom: rect.bottom ?? rect.top + height
            };
        }

        let pos = { x: global.innerWidth * 0.5, y: global.innerHeight * 0.4 };
        const hex = tile?.hex || tile;
        if (typeof game?.projectHexToScreen === 'function' && hex) {
            pos = game.projectHexToScreen(hex);
        } else if (hex && typeof hex.toPixel === 'function') {
            const layout = game?.LayoutImpl || { origin: { x: 0, y: 0 }, size: 30, f0: Math.sqrt(3), f1: Math.sqrt(3) / 2, f2: 0, f3: 1.5 };
            pos = hex.toPixel(layout);
        }
        return buildRectFromPoint(pos);
    }

    function positionCallout(calloutEl, connectorEl, anchorRect) {
        if (!calloutEl || !connectorEl || !anchorRect) return;
        const viewportWidth = global.innerWidth || 0;
        const viewportHeight = global.innerHeight || 0;
        const cardRect = calloutEl.getBoundingClientRect();
        const centerX = anchorRect.left + anchorRect.width / 2;
        const preferAbove = anchorRect.top > cardRect.height + 24;

        const tentativeLeft = centerX - cardRect.width / 2;
        const clampedLeft = Math.min(Math.max(tentativeLeft, 12), Math.max(12, viewportWidth - cardRect.width - 12));
        const top = preferAbove
            ? Math.max(12, anchorRect.top - cardRect.height - 14)
            : Math.min(anchorRect.bottom + 14, Math.max(12, viewportHeight - cardRect.height - 12));

        calloutEl.style.left = `${clampedLeft}px`;
        calloutEl.style.top = `${top}px`;

        const cardBottom = top + cardRect.height;
        const connectorStart = preferAbove ? cardBottom : anchorRect.bottom;
        const connectorEnd = preferAbove ? anchorRect.top : top;
        connectorEl.style.left = `${centerX}px`;
        connectorEl.style.top = `${Math.min(connectorStart, connectorEnd)}px`;
        connectorEl.style.height = `${Math.max(8, Math.abs(connectorEnd - connectorStart))}px`;
        connectorEl.style.transform = 'translateX(-50%)';
    }

    /** Remove any active callout from the DOM. */
    function hideTileCallout() {
        clearAutoHideTimer();
        if (typeof activeCallout?.cleanup === 'function') activeCallout.cleanup();
        if (activeCallout?.callout) activeCallout.callout.remove();
        if (activeCallout?.connector) activeCallout.connector.remove();
        activeCallout = null;
    }

    /**
     * Render a callout anchored to the provided tile. When a DOM is unavailable the
     * onConfirm callback fires immediately so logic relying on acknowledgement can proceed.
     * @param {object} game live game instance.
     * @param {object} tile overworld tile to anchor against.
     * @param {object} options presentation options (title, body, buttonText, onConfirm, duration).
     */
    function showTileCallout(game, tile, options = {}) {
        if (typeof document === 'undefined') {
            if (typeof options.onConfirm === 'function') options.onConfirm();
            return null;
        }

        hideTileCallout();
        const host = document.getElementById('game-container') || document.body;

        const callout = document.createElement('div');
        callout.className = 'tile-callout';

        if (options.title) {
            const heading = document.createElement('h4');
            heading.className = 'tile-callout__title';
            heading.innerText = options.title;
            callout.appendChild(heading);
        }

        if (options.body) {
            const body = document.createElement('p');
            body.className = 'tile-callout__body';
            body.innerHTML = options.body;
            callout.appendChild(body);
        }

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tile-callout__btn';
        btn.innerText = options.buttonText || 'Understood';
        btn.addEventListener('click', () => {
            clearAutoHideTimer();
            hideTileCallout();
            if (typeof options.onConfirm === 'function') options.onConfirm();
        });
        callout.appendChild(btn);

        const connector = document.createElement('div');
        connector.className = 'tile-callout__connector';

        host.appendChild(connector);
        host.appendChild(callout);

        positionCallout(callout, connector, resolveAnchorRect(game, tile));

        const tick = global.requestAnimationFrame || ((cb) => setTimeout(cb, 16));
        const cancelTick = global.cancelAnimationFrame || global.clearTimeout || clearTimeout;
        const resizeListener = () => positionCallout(callout, connector, resolveAnchorRect(game, tile));

        // Keep the callout locked onto the anchor even as the camera or viewport moves.
        const scheduleReflow = () => {
            const frame = tick(() => {
                if (!activeCallout) return;
                positionCallout(callout, connector, resolveAnchorRect(game, tile));
                scheduleReflow();
            });
            if (activeCallout) {
                activeCallout.frame = frame;
            }
        };

        tick(() => {
            callout.classList.add('tile-callout--visible');
            connector.classList.add('visible');
        });

        activeCallout = {
            callout,
            connector,
            autoHideTimer: null,
            frame: null,
            cleanup() {
                if (typeof global.removeEventListener === 'function') {
                    global.removeEventListener('resize', resizeListener);
                }
                if (this.frame) cancelTick(this.frame);
                this.frame = null;
            }
        };

        if (typeof global.addEventListener === 'function') {
            global.addEventListener('resize', resizeListener);
        }
        scheduleReflow();

        const duration = options.duration === undefined ? 5000 : options.duration;
        if (typeof duration === 'number' && duration > 0) {
            const setTimer = global.setTimeout || setTimeout;
            activeCallout.autoHideTimer = setTimer(() => {
                hideTileCallout();
            }, duration);
        }
        return activeCallout;
    }

    const api = { showTileCallout, hideTileCallout };
    global.TutorialCallouts = api;
    if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
