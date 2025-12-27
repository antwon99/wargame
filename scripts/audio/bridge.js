/**
 * Thin facade over the global GameAudio so gameplay code can request
 * manifest keys without worrying about availability in tests/browsers.
 */
export const AudioBridge = {
    /** Request playback for a manifest entry (sfx or music). */
    play(key, options = {}) {
        if (typeof window === 'undefined') return false;
        const audio = window.GameAudio;
        if (audio && typeof audio.play === 'function') {
            return audio.play(key, options);
        }
        return false;
    },

    /** Convenience helper for looping tracks (ambience/music). */
    playLoop(key, options = {}) {
        return this.play(key, { ...options, loop: options.loop !== false, reset: options.reset !== false });
    },

    /** Begin the shared ambient loop defined by the audio manifest. */
    startAmbient() {
        window.GameAudio?.startAmbientLoop?.();
    },

    /** Stop the current ambient loop (no-op if unavailable). */
    stopAmbient() {
        window.GameAudio?.stop?.();
    },

    /** Halt all cached audio nodes (useful during state transitions). */
    stopAll() {
        window.GameAudio?.stopAll?.();
    }
};

if (typeof window !== 'undefined') window.AudioBridge = AudioBridge;

export default AudioBridge;
