import { initInputHelpers } from './inputHelpers.js';
import { initIntroOverlay } from './introOverlay.js';
import { initAudio } from './audio.js';
import { initJuice } from './juice.js';
import { initPersistence } from './persistence.js';
import { initResearchSystem } from './researchSystem.js';
import { initVoidEasterEgg } from './voidEasterEgg.js';
import { initPlatformAdapter } from './platform.js';
import { initDebugToggle } from './debugToggle.js';
import { initRebelSystem } from './rebelSystem.js';
import { initTutorialCallouts } from './tutorialCallouts.js';
import ImperialMandateCalendar from './mandates/imperialMandateCalendar.js';
import createImperialMandates from './mandates/imperialMandatesCore.js';
import ImperialMandateUIAdapter from './mandates/imperialMandatesAdapter.js';
import ImperialMandateManager from './mandates/imperialMandateManager.js';
import { initImperialMandates } from './mandates/imperialMandates.js';
import { initStorageProbe } from './storageProbe.js';
import { bootstrapGame, createGameCore } from './script.js';
import { buildBootstrapDependencies, publishBootstrapHandles } from './globalShim.js';

const bootstrapScope = typeof window !== 'undefined' ? window : globalThis;

initInputHelpers?.(bootstrapScope);
initIntroOverlay?.(bootstrapScope);
initAudio?.(bootstrapScope);
initJuice?.(bootstrapScope);
initPersistence?.(bootstrapScope);
initResearchSystem?.(bootstrapScope);
initVoidEasterEgg?.(bootstrapScope);
initPlatformAdapter?.(bootstrapScope);
initDebugToggle?.(bootstrapScope, { document: bootstrapScope?.document || null });
initRebelSystem?.(bootstrapScope);
initTutorialCallouts?.(bootstrapScope);
ImperialMandateCalendar?.initImperialMandateCalendar?.(bootstrapScope);
createImperialMandates?.initImperialMandatesCore?.(bootstrapScope);
ImperialMandateUIAdapter?.initImperialMandatesAdapter?.(bootstrapScope);
ImperialMandateManager?.initImperialMandateManager?.(bootstrapScope);
initImperialMandates?.(bootstrapScope);
initStorageProbe?.(bootstrapScope);

const dependencies = buildBootstrapDependencies(typeof window !== 'undefined' ? window : globalThis);
const bootstrapWithDependencies = (overrides = {}) => bootstrapGame({ ...dependencies, ...overrides });
const createGameCoreWithDependencies = (overrides = {}) => createGameCore({
    ...overrides,
    dependencies: { ...dependencies, ...(overrides.dependencies || {}) }
});

publishBootstrapHandles(bootstrapWithDependencies, createGameCoreWithDependencies);

if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
        bootstrapWithDependencies();
    });
}
