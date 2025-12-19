/**
 * Utility for picking weighted entries so audio variants can bias toward
 * certain takes while still keeping the mix fresh.
 */
class WeightedSelector {
    constructor(entries = []) {
        this.setEntries(entries);
    }

    /** Replace the weighted pool with a new list of entries. */
    setEntries(entries = []) {
        this.entries = entries.map((entry, idx) => ({
            weight: entry.weight ?? 1,
            ...entry,
            id: entry.id || entry.key || entry.src || `v${idx}`
        }));
        this.totalWeight = this.entries.reduce((sum, e) => sum + (e.weight || 0), 0);
        this.source = entries;
    }

    /**
     * Select an entry based on cumulative weight. Defaults to a fair pick
     * when weights are missing or zeroed out.
     * @param {Function} randomFn RNG returning [0,1).
     * @returns {object|null}
     */
    pick(randomFn = Math.random) {
        if (!this.entries.length) return null;
        if (!this.totalWeight) return this.entries[Math.floor(randomFn() * this.entries.length)];

        const target = randomFn() * this.totalWeight;
        let cursor = 0;
        for (const entry of this.entries) {
            cursor += entry.weight || 0;
            if (target <= cursor) return entry;
        }
        return this.entries[this.entries.length - 1];
    }
}

/** Clamp arbitrary volume values into the [0,1] range with a sane fallback. */
function clampVolume(value, fallback = 1) {
    const numeric = Number.isFinite(value) ? value : fallback;
    return Math.max(0, Math.min(1, numeric));
}

export { WeightedSelector, clampVolume };
