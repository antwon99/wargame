import { AMBIENT_STATES } from './ambientConfig.js';
import { SFX_GROUPS, SFX_MANIFEST } from './audioConfig.js';
import { AMBIENT_DEFAULTS, AMBIENT_FEATURE_FLAGS, AmbientConductor, AmbientScheduler, AmbientRandomizer } from './audio/ambient.js';
import { AudioDebugBus } from './audio/debugBus.js';
import { AudioManager, attachCombatStingerGuards, defaultAudioFactory, enterCombat as enterCombatBase, exitCombat as exitCombatBase } from './audio/sfxRouting.js';
import { WeightedSelector } from './audio/selectors.js';

const GameAudio = attachCombatStingerGuards(new AudioManager(SFX_MANIFEST));
const AmbientSoundscape = new AmbientConductor(GameAudio, { initialMode: 'TERRITORY', states: AMBIENT_STATES });

function enterCombat(audioManager = GameAudio, ambient = AmbientSoundscape) {
    return enterCombatBase(audioManager, ambient);
}

function exitCombat(outcome, audioManager = GameAudio, ambient = AmbientSoundscape) {
    return exitCombatBase(outcome, audioManager, ambient);
}

export {
    AMBIENT_DEFAULTS,
    AMBIENT_FEATURE_FLAGS,
    AmbientConductor,
    AmbientScheduler,
    AmbientRandomizer,
    AmbientSoundscape,
    AudioDebugBus,
    AudioManager,
    GameAudio,
    SFX_GROUPS,
    SFX_MANIFEST,
    WeightedSelector,
    attachCombatStingerGuards,
    defaultAudioFactory,
    enterCombat,
    exitCombat
};

/**
 * Attach audio helpers to the provided global scope for browser debugging.
 * @param {Window|Object} [target] global object to attach audio helpers to.
 * @returns {{ AudioManager: Function, GameAudio: Object, AmbientSoundscape: Object, SFX_GROUPS: Object, enterCombat: Function, exitCombat: Function }}
 */
export function initAudio(target = typeof window !== 'undefined' ? window : undefined) {
    if (target) {
        target.AudioManager = AudioManager;
        target.GameAudio = GameAudio;
        target.AmbientSoundscape = AmbientSoundscape;
        target.SFX_GROUPS = SFX_GROUPS;
        target.enterCombat = enterCombat;
        target.exitCombat = exitCombat;
    }
    return {
        AudioManager,
        GameAudio,
        AmbientSoundscape,
        SFX_GROUPS,
        enterCombat,
        exitCombat
    };
}
