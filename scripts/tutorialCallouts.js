/**
 * Lightweight helper for rendering spatially anchored tutorial callouts near a hex tile.
 * The callout uses simple above/below placement and can be reused for future tutorials
 * without requiring additional overlay systems.
 */
(function (global) {
    let activeCallout = null;

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

        const hex = tile?.hex || tile;
        const canvasRect = (game?.canvas && game.canvas.getBoundingClientRect?.())
            || (typeof document !== 'undefined' && document.getElementById('canvas')?.getBoundingClientRect?.())
            || { left: 0, top: 0 };

        let pos = { x: global.innerWidth * 0.5, y: global.innerHeight * 0.4 };
        if (typeof game?.projectHexToScreen === 'function' && hex) {
            pos = game.projectHexToScreen(hex);
        } else if (hex && typeof hex.toPixel === 'function') {
            const layout = game?.LayoutImpl || { origin: { x: 0, y: 0 }, size: 30, f0: Math.sqrt(3), f1: Math.sqrt(3) / 2, f2: 0, f3: 1.5 };
            pos = hex.toPixel(layout);
        }

        return buildRectFromPoint({ x: pos.x + (canvasRect.left || 0), y: pos.y + (canvasRect.top || 0) }, 56);
    }

    function positionCallout(calloutEl, connectorEl, anchorRect) {
        if (!calloutEl || !connectorEl || !anchorRect) return;
        const viewportWidth = global.innerWidth || 0;
        const viewportHeight = global.innerHeight || 0;
        const cardRect = calloutEl.getBoundingClientRect();
        const centerX = anchorRect.left + anchorRect.width / 2;
        const preferAbove = anchorRect.top > cardRect.height + 32;
        const margin = 16;
        const hudBottom = (typeof document !== 'undefined' && typeof document.querySelector === 'function'
            ? document.querySelector('.top-bar')?.getBoundingClientRect?.()?.bottom || 0
            : 0);
        const minTop = Math.max(margin, hudBottom + 8);
        const maxTop = Math.max(minTop, viewportHeight - cardRect.height - margin);

        const horizontalNudge = preferAbove ? -8 : 8;
        const tentativeLeft = centerX - cardRect.width / 2 + horizontalNudge;
        const clampedLeft = Math.min(Math.max(tentativeLeft, margin), Math.max(margin, viewportWidth - cardRect.width - margin));

        const preferredTop = preferAbove
            ? anchorRect.top - cardRect.height - 14
            : anchorRect.bottom + 14;
        const clampedTop = Math.min(Math.max(preferredTop, minTop), maxTop);

        calloutEl.style.left = `${clampedLeft}px`;
        calloutEl.style.top = `${clampedTop}px`;

        const cardBottom = clampedTop + cardRect.height;
        const connectorStart = preferAbove ? cardBottom : anchorRect.bottom;
        const connectorEnd = preferAbove ? anchorRect.top : clampedTop;
        connectorEl.style.left = `${Math.max(margin, Math.min(centerX, viewportWidth - margin))}px`;
        connectorEl.style.top = `${Math.min(connectorStart, connectorEnd)}px`;
        connectorEl.style.height = `${Math.max(8, Math.abs(connectorEnd - connectorStart))}px`;
        connectorEl.style.transform = 'translateX(-50%)';
    }

    /** Remove any active callout from the DOM. */
    function hideTileCallout() {
        if (activeCallout?.callout) activeCallout.callout.remove();
        if (activeCallout?.connector) activeCallout.connector.remove();
        activeCallout = null;
    }

    /**
     * Render a callout anchored to the provided tile. When a DOM is unavailable the
     * onConfirm callback fires immediately so logic relying on acknowledgement can proceed.
     * @param {object} game live game instance.
     * @param {object} tile overworld tile to anchor against.
     * @param {object} options presentation options (title, body, buttonText, onConfirm).
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
        tick(() => {
            callout.classList.add('tile-callout--visible');
            connector.classList.add('visible');
        });

        activeCallout = { callout, connector };
        return activeCallout;
    }

    const api = { showTileCallout, hideTileCallout };
    global.TutorialCallouts = api;
    if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
