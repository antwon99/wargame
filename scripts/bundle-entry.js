import InputHelpers from './inputHelpers.js';
import IntroOverlay from './introOverlay.js';
import { initAudio } from './audio.js';
import Juice from './juice.js';
import Persistence from './persistence.js';
import ResearchSystem from './researchSystem.js';
import VoidEasterEgg from './voidEasterEgg.js';
import PlatformAdapter from './platform.js';
import DebugToggle from './debugToggle.js';
import RebelSystem from './rebelSystem.js';
import TutorialCallouts from './tutorialCallouts.js';
import ImperialMandateCalendar from './mandates/imperialMandateCalendar.js';
import createImperialMandates from './mandates/imperialMandatesCore.js';
import ImperialMandateUIAdapter from './mandates/imperialMandatesAdapter.js';
import ImperialMandateManager from './mandates/imperialMandateManager.js';
import ImperialMandatesBootstrap from './mandates/imperialMandates.js';
import { initStorageProbe } from './storageProbe.js';
import { bootstrapGame, createGameCore } from './script.js';
import { buildBootstrapDependencies, publishBootstrapHandles } from './globalShim.js';

const bootstrapScope = typeof window !== 'undefined' ? window : globalThis;

InputHelpers?.initInputHelpers?.(bootstrapScope);
IntroOverlay?.initIntroOverlay?.(bootstrapScope);
initAudio?.(bootstrapScope);
Juice?.initJuice?.(bootstrapScope);
Persistence?.initPersistence?.(bootstrapScope);
ResearchSystem?.initResearchSystem?.(bootstrapScope);
VoidEasterEgg?.initVoidEasterEgg?.(bootstrapScope);
PlatformAdapter?.initPlatformAdapter?.(bootstrapScope);
DebugToggle?.initDebugToggle?.(bootstrapScope, { document: bootstrapScope?.document || null });
RebelSystem?.initRebelSystem?.(bootstrapScope);
TutorialCallouts?.initTutorialCallouts?.(bootstrapScope);
ImperialMandateCalendar?.initImperialMandateCalendar?.(bootstrapScope);
createImperialMandates?.initImperialMandatesCore?.(bootstrapScope);
ImperialMandateUIAdapter?.initImperialMandatesAdapter?.(bootstrapScope);
ImperialMandateManager?.initImperialMandateManager?.(bootstrapScope);
ImperialMandatesBootstrap?.initImperialMandates?.(bootstrapScope);
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
