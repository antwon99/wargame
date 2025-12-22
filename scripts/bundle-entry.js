import './inputHelpers.js';
import './introOverlay.js';
import './audio.js';
import './juice.js';
import './persistence.js';
import './researchSystem.js';
import './voidEasterEgg.js';
import './platform.js';
import './debugToggle.js';
import './rebelSystem.js';
import './tutorialCallouts.js';
import './imperialMandateCalendar.js';
import './imperialMandatesCore.js';
import './imperialMandatesAdapter.js';
import './imperialMandateManager.js';
import './imperialMandates.js';
import './storageProbe.js';
import { bootstrapGame, createGameCore } from './script.js';
import { ensureGlobalShims, publishBootstrapHandles } from './globalShim.js';

ensureGlobalShims();
publishBootstrapHandles(bootstrapGame, createGameCore);

if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
        ensureGlobalShims();
        bootstrapGame();
    });
}
