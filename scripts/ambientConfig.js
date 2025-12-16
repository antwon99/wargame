/**
 * Ambient playlist definitions keyed by gameplay mode. Extracted into its own
 * module so schedulers/randomisers can be swapped without touching static
 * content.
 */
const AMBIENT_STATES = {
    TERRITORY: {
        tracks: [
            { key: 'ambiance_upbeat', weight: 1, volume: 0.55 },
            { key: 'ambiance_uplifting', weight: 1, volume: 0.55 }
        ],
        beds: [],
        silenceRangeMs: [14000, 42000],
        fadeMs: 1600,
        maxTrackMs: 120000,
        volume: 0.55
    },
    WAR: {
        tracks: [
            { key: 'ambiance_sorrow', weight: 1, volume: 0.62 },
            { key: 'ambiance_dark', weight: 1, volume: 0.62 }
        ],
        beds: [],
        silenceRangeMs: [12000, 36000],
        fadeMs: 1800,
        maxTrackMs: 110000,
        volume: 0.62
    }
};

module.exports = { AMBIENT_STATES };
