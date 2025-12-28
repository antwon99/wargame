/**
 * Easter egg messaging helper for void clicks.
 * Provides deterministic message selection that can be shared between
 * browser gameplay and Node-based tests without DOM dependencies.
 */
const VoidEasterEgg = {
    BASE_MESSAGE: 'Out of Bounds',
    SASSY_MESSAGES: [
        'Dude, stop.',
        'Still nothing.',
        'Focus on the war!',
        'Touching the void again...'
    ],

    /**
     * Compute the next void click message based on the 1-indexed click count.
     * Every 6th click returns a random sassy quip; all others return the base
     * "Out of Bounds" prompt. The optional RNG parameter keeps tests
     * deterministic without stubbing Math.random globally.
     */
    computeMessage(count = 0, rng = Math.random) {
        const isSassy = count > 0 && count % 6 === 0;
        if (!isSassy) return { message: this.BASE_MESSAGE, isSassy: false };

        const random = typeof rng === 'function' ? rng() : Math.random();
        const pool = this.SASSY_MESSAGES;
        const index = Math.floor(random * pool.length) % pool.length;
        return { message: pool[index], isSassy: true };
    }
};

/**
 * Register the void easter egg helper on the provided global scope.
 * @param {Window|Object} [target] global object to attach VoidEasterEgg to.
 * @returns {Object} VoidEasterEgg helper API.
 */
function initVoidEasterEgg(target = typeof window !== 'undefined' ? window : undefined) {
    if (target) {
        target.VoidEasterEgg = VoidEasterEgg;
    }
    return VoidEasterEgg;
}

export { VoidEasterEgg, initVoidEasterEgg };

if (typeof module !== 'undefined') {
    VoidEasterEgg.initVoidEasterEgg = initVoidEasterEgg;
    module.exports = VoidEasterEgg;
}
