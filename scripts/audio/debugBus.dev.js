/**
 * Developer-only debug bus that tracks active audio sources for the overlay.
 */
function createAudioDebugBus() {
    const bus = {
        enabled: true,
        sources: new Map(),
        intendedTrack: 'None',
        masterVolume: 1,
        boundNodes: new WeakSet(),
        blockedPlays: [],
        groupedClusters: new Map(),
        reportIntent(name) {
            if (!this.enabled) return;
            this.intendedTrack = name || 'Unknown';
        },
        registerPlayback(node, meta = {}) {
            if (!this.enabled || !node) return;
            const label = meta.src ? meta.src.split('/').pop() : (meta.key || 'unknown');
            this.sources.set(node, { ...meta, label });

            const cleanup = () => this.unregisterPlayback(node);
            if (typeof node.addEventListener === 'function' && !this.boundNodes.has(node)) {
                node.addEventListener('ended', cleanup);
                node.addEventListener('pause', cleanup);
                this.boundNodes.add(node);
            } else if (!node.onended) {
                node.onended = cleanup;
            }
        },
        unregisterPlayback(node) {
            if (!node) return;
            this.sources.delete(node);
        },
        reportPlaybackFailure(meta = {}) {
            if (!this.enabled) return;
            const entry = { ...meta, at: Date.now() };
            this.blockedPlays.unshift(entry);
            if (this.blockedPlays.length > 5) this.blockedPlays.length = 5;
        },
        /**
         * Record when grouped playback blocks a burst so the debug overlay can
         * verify combat clustering is working as expected.
         * @param {Object} meta grouping metadata
         * @param {string} meta.groupKey cluster identifier for the audio group
         * @param {number} [meta.windowMs] grouping window in milliseconds
         * @param {number} [meta.maxPlays] max plays allowed in the window
         * @param {number} [meta.at] timestamp for when the block occurred
         */
        reportGroupedPlayback(meta = {}) {
            if (!this.enabled) return;
            if (!meta?.groupKey) return;
            const existing = this.groupedClusters.get(meta.groupKey) || {
                groupKey: meta.groupKey,
                windowMs: meta.windowMs,
                maxPlays: meta.maxPlays,
                blockedCount: 0,
                lastBlockedAt: 0
            };
            existing.windowMs = meta.windowMs ?? existing.windowMs;
            existing.maxPlays = meta.maxPlays ?? existing.maxPlays;
            existing.blockedCount += 1;
            existing.lastBlockedAt = meta.at ?? Date.now();
            this.groupedClusters.set(meta.groupKey, existing);
        },
        snapshot() {
            return {
                intendedTrack: this.intendedTrack,
                masterVolume: this.masterVolume,
                activeSources: Array.from(this.sources.values()),
                blockedPlays: [...this.blockedPlays],
                groupedClusters: Array.from(this.groupedClusters.values())
                    .sort((a, b) => (b.lastBlockedAt || 0) - (a.lastBlockedAt || 0))
            };
        }
    };
    return bus;
}

function registerGlobalAudioDebugBus(bus) {
    if (typeof window !== 'undefined') window.AudioDebugBus = bus;
}

export { createAudioDebugBus, registerGlobalAudioDebugBus };
