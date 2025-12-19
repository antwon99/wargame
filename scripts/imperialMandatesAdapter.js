/**
 * UI/audio adapter for imperial mandates.
 *
 * Encapsulates DOM rendering, notification enqueueing, and audio guards so the
 * core state machine can run in headless environments without pulling in
 * browser-only dependencies.
 */
(function (global) {
    const TutorialCallouts = (global.TutorialCallouts)
        || (typeof require === 'function' ? require('./tutorialCallouts.js') : null);

    const UI_ONLY_AUDIO_GUARD = new Set(['wardrum']);

    const IMPERIAL_DECREE_POOL = [
        ['By command of the Emperor, do not relent.'],
        ['Rebel forces regroup in the shadows. Stay alert.'],
        ['Expand, fortify, and remind them who owns these lands.'],
        ['Imperial scribes note your progress. Continue the march.']
    ];

    const DEFAULT_REBEL_DECREE_LINES = [
        'Patrol the frontier.',
        'Rebels have been sighted nearby.',
        "Expand the Empire's reach — and survive the rebels beyond the fog."
    ];
    const DEFAULT_REBEL_DECREE_BODY = DEFAULT_REBEL_DECREE_LINES.join('<br>');

    function getNotificationStackApi() {
        return global.NotificationStackApi || null;
    }

    function withImperialAudioGuard(fn) {
        const audio = global.GameAudio || (typeof window !== 'undefined' ? window.GameAudio : null);
        if (audio?.runWithUiGuard) return audio.runWithUiGuard(fn);
        return typeof fn === 'function' ? fn() : null;
    }

    function sanitizeUIBindings(uiBindings = {}) {
        if (!uiBindings || typeof uiBindings !== 'object') return {};
        if (typeof uiBindings.playSound !== 'function') return uiBindings;

        const safeBindings = { ...uiBindings };
        const originalPlay = uiBindings.playSound;
        safeBindings.playSound = (key, options) => {
            if (!key || UI_ONLY_AUDIO_GUARD.has(key)) return null;
            return originalPlay(key, options);
        };
        return safeBindings;
    }

    function createLineElement(text) {
        const line = document.createElement('p');
        line.className = 'imperial-line';
        line.innerText = text;
        return line;
    }

    function renderImperialModal(config) {
        const { title, lines, buttonLabel, onConfirm, duration } = config;
        const renderFn = () => {
            if (typeof document === 'undefined') {
                if (typeof onConfirm === 'function') onConfirm();
                return;
            }

            const backdrop = document.createElement('div');
            backdrop.className = 'imperial-modal-backdrop';

            const panel = document.createElement('div');
            panel.className = 'imperial-modal-panel';

            const heading = document.createElement('h3');
            heading.className = 'imperial-modal-title';
            heading.innerText = title || 'By Imperial Decree:';
            panel.appendChild(heading);

            (lines || []).forEach((text) => panel.appendChild(createLineElement(text)));

            if (buttonLabel !== null && buttonLabel !== false) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'imperial-modal-btn';
                btn.innerText = buttonLabel || 'Understood';
                btn.addEventListener('click', () => {
                    backdrop.remove();
                    if (typeof onConfirm === 'function') onConfirm();
                });
                panel.appendChild(btn);
            }

            backdrop.appendChild(panel);
            document.body.appendChild(backdrop);

            if (buttonLabel === null || buttonLabel === false) {
                const timeout = typeof duration === 'number' ? duration : 4000;
                setTimeout(() => backdrop.remove(), timeout);
            }
        };

        withImperialAudioGuard(renderFn);
    }

    function showImperialMessage(config, uiBindings) {
        const renderFn = () => {
            if (uiBindings?.showImperialModal) {
                uiBindings.showImperialModal(config);
                return;
            }
            renderImperialModal(config);
        };
        return withImperialAudioGuard(renderFn);
    }

    function getNotificationEnqueue(uiBindings = {}, lastUIBindings = {}) {
        if (typeof uiBindings.enqueueNotification === 'function') return uiBindings.enqueueNotification;
        if (typeof uiBindings.notificationManager?.enqueue === 'function') return uiBindings.notificationManager.enqueue;
        if (typeof lastUIBindings.enqueueNotification === 'function') return lastUIBindings.enqueueNotification;
        if (typeof lastUIBindings.notificationManager?.enqueue === 'function') {
            return lastUIBindings.notificationManager.enqueue;
        }
        const shared = getNotificationStackApi()?.getSharedStack?.();
        if (shared?.enqueue) return shared.enqueue.bind(shared);
        return null;
    }

    function queueImperialNotification(lines, uiBindings, { title, duration, tone } = {}, lastUIBindings = {}) {
        return withImperialAudioGuard(() => {
            const enqueue = getNotificationEnqueue(uiBindings, lastUIBindings);
            if (!enqueue) return false;
            enqueue({
                title: title || 'By Imperial Decree:',
                lines: Array.isArray(lines) ? lines : [lines],
                duration,
                tone
            });
            return true;
        });
    }

    function normalizeDecreeBody(candidate, defaultBody = DEFAULT_REBEL_DECREE_BODY) {
        const trimmed = typeof candidate === 'string' ? candidate.trim() : '';
        const resolved = trimmed || defaultBody;
        return resolved.replace(/\n/g, '<br>');
    }

    function getImperialDecreeLines(lines) {
        if (Array.isArray(lines) && lines.length) return lines;
        const randomIndex = Math.floor(Math.random() * IMPERIAL_DECREE_POOL.length);
        return IMPERIAL_DECREE_POOL[randomIndex];
    }

    function showStandardImperialDecree(lines, uiBindings, { duration, title = 'By Imperial Decree:' } = {}) {
        showImperialMessage({
            title,
            lines: getImperialDecreeLines(lines),
            buttonLabel: null,
            duration
        }, uiBindings);
    }

    function showMandateBanner(lines, uiBindings, title = 'By Imperial Decree:', durationOrOptions = 4200, lastUIBindings = {}) {
        const options = typeof durationOrOptions === 'object'
            ? {
                duration: typeof durationOrOptions.duration === 'number'
                    ? durationOrOptions.duration
                    : durationOrOptions.timeout,
                tone: durationOrOptions.tone
            }
            : { duration: durationOrOptions };

        const normalizedLines = Array.isArray(lines) ? lines : [lines];
        const handled = queueImperialNotification(normalizedLines, uiBindings, { ...options, title }, lastUIBindings);
        if (!handled) {
            showStandardImperialDecree(normalizedLines, uiBindings, { title, duration: options.duration });
        }
        return handled;
    }

    function showRebelDecreeCallout(rebelTile, gameState, uiBindings = {}, options = {}, lastUIBindings = {}) {
        const { autoHide = false, title = 'By Imperial Decree:' } = options;
        const bodyHtml = normalizeDecreeBody(options.body, options.defaultBody || DEFAULT_REBEL_DECREE_BODY);

        const showTileCallout = uiBindings.showTileCallout
            || (TutorialCallouts && TutorialCallouts.showTileCallout);
        const hideTileCallout = uiBindings.hideTileCallout
            || (TutorialCallouts && TutorialCallouts.hideTileCallout);

        if (typeof showTileCallout === 'function') {
            const calloutOptions = {
                title,
                body: bodyHtml,
                defaultBody: options.defaultBody || DEFAULT_REBEL_DECREE_BODY,
                buttonText: options.buttonText || 'Understood',
                duration: autoHide ? 5000 : null,
                onConfirm: () => {
                    if (typeof hideTileCallout === 'function') hideTileCallout();
                }
            };

            const expectsGameFirst = showTileCallout.length >= 3;
            if (expectsGameFirst) {
                showTileCallout(gameState, rebelTile, calloutOptions);
            } else {
                showTileCallout(rebelTile, calloutOptions);
            }
            return true;
        }

        showImperialMessage({
            title,
            lines: bodyHtml.split('<br>'),
            buttonLabel: 'Understood',
            onConfirm: () => {
                if (typeof hideTileCallout === 'function') hideTileCallout();
            }
        }, { ...lastUIBindings, ...uiBindings });
        return false;
    }

    const api = {
        withImperialAudioGuard,
        sanitizeUIBindings,
        renderImperialModal,
        showImperialMessage,
        queueImperialNotification,
        showMandateBanner,
        showRebelDecreeCallout
    };

    global.ImperialMandateUIAdapter = api;
    if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
