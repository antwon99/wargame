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
        snapshot() {
            return {
                intendedTrack: this.intendedTrack,
                masterVolume: this.masterVolume,
                activeSources: Array.from(this.sources.values()),
                blockedPlays: [...this.blockedPlays]
            };
        }
    };
    return bus;
}

function registerGlobalAudioDebugBus(bus) {
    if (typeof window !== 'undefined') window.AudioDebugBus = bus;
}

export { createAudioDebugBus, registerGlobalAudioDebugBus };
