/**
 * Platform-aware helpers for scaling the canvas to match the current device.
 *
 * The detection routine looks at both the user agent and viewport bounds so we
 * can tune the camera zoom and backing-store resolution on small screens
 * without requiring brittle CSS hacks. The sizing helper then applies a
 * high-DPI transform so the game renders crisply on retina/mobile devices
 * while keeping the logical coordinate system tied to CSS pixels.
 */
const MOBILE_REGEX = /(Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile)/i;

/**
 * Derive a rendering profile for the current browser.
 *
 * @param {Object} [options] - Optional overrides used by tests or callers that
 * need to supply their own environment measurements.
 * @param {string} [options.userAgent] - The UA string to inspect.
 * @param {number} [options.viewportWidth] - CSS pixel width of the viewport.
 * @param {number} [options.viewportHeight] - CSS pixel height of the viewport.
 * @param {number} [options.devicePixelRatio] - Device pixel ratio reported by the browser.
 * @returns {Object} profile describing the environment
 * @returns {boolean} return.isMobile - True when the UA hints at a touch device or the viewport is narrow.
 * @returns {number} return.viewportWidth - CSS pixel width used for logical layout.
 * @returns {number} return.viewportHeight - CSS pixel height used for logical layout.
 * @returns {number} return.deviceScale - Capped device pixel ratio applied to the backing store.
 * @returns {number} return.baseZoom - Recommended camera zoom for the current platform.
 */
function detectPlatformProfile(options = {}) {
    const ua = options.userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent || '' : '');
    const viewportWidth =
        options.viewportWidth !== undefined
            ? options.viewportWidth
            : typeof window !== 'undefined'
                ? window.innerWidth
                : 1024;
    const viewportHeight =
        options.viewportHeight !== undefined
            ? options.viewportHeight
            : typeof window !== 'undefined'
                ? window.innerHeight
                : 768;
    const devicePixelRatio =
        options.devicePixelRatio !== undefined
            ? options.devicePixelRatio
            : typeof window !== 'undefined'
                ? window.devicePixelRatio || 1
                : 1;

    const isMobileUA = MOBILE_REGEX.test(ua);
    const smallViewport = Math.min(viewportWidth, viewportHeight) < 900;
    const isMobile = isMobileUA || smallViewport;

    // Cap the backing store multiplier to avoid massive buffers on extreme devices.
    const deviceScale = Math.min(Math.max(devicePixelRatio, 1), 3);
    const baseZoom = isMobile ? 0.82 : 1.0;

    return { isMobile, viewportWidth, viewportHeight, deviceScale, baseZoom };
}

/**
 * Resize a canvas to match the active platform profile and apply a retina
 * transform so draw operations remain aligned to CSS pixels.
 *
 * @param {HTMLCanvasElement|Object} canvas - Target canvas element.
 * @param {CanvasRenderingContext2D|Object} ctx - Rendering context with setTransform.
 * @param {Object} profile - Result from detectPlatformProfile.
 */
function sizeCanvasForDisplay(canvas, ctx, profile) {
    if (!canvas || !ctx || !profile) return;
    const width = profile.viewportWidth;
    const height = profile.viewportHeight;
    const scale = profile.deviceScale || 1;

    canvas.width = Math.floor(width * scale);
    canvas.height = Math.floor(height * scale);
    if (canvas.style) {
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
    }

    if (typeof ctx.setTransform === 'function') {
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
    }
}

const PlatformAdapter = { detectPlatformProfile, sizeCanvasForDisplay };

if (typeof module !== 'undefined') {
    module.exports = PlatformAdapter;
}

if (typeof window !== 'undefined') {
    window.PlatformAdapter = PlatformAdapter;
}
