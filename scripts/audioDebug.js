/**
 * Lightweight debug bus that surfaces audio playback state to overlays and
 * test harnesses without impacting the core audio manager.
 */
const AudioDebugBus = {
    enabled: true,
    sources: new Map(),
    intendedTrack: 'None',
    masterVolume: 1,
    boundNodes: new WeakSet(),
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
    snapshot() {
        return {
            intendedTrack: this.intendedTrack,
            masterVolume: this.masterVolume,
            activeSources: Array.from(this.sources.values())
        };
    }
};

const exported = { AudioDebugBus };
if (typeof module !== 'undefined') {
    module.exports = exported;
}
if (typeof window !== 'undefined') {
    Object.assign(window, exported);
}
