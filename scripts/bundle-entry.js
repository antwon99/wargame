import { Layout, SQRT3, cubeToPixel, initInputHelpers, isPointerOnDrawnHex, pixelToAxial } from './inputHelpers.js';
import { IntroOverlay, initIntroOverlay } from './introOverlay.js';
import { GameAudio, initAudio } from './audio.js';
import { initJuice } from './juice.js';
import Persistence from './persistence.js';
import { ResearchSystem, initResearchSystem } from './researchSystem.js';
import { initVoidEasterEgg } from './voidEasterEgg.js';
import { PlatformAdapter, initPlatformAdapter } from './platform.js';
import { initDebugToggle } from './debugToggle.js';
import { RebelSystem, initRebelSystem } from './rebelSystem.js';
import { TutorialHandler, initTutorialHandler } from './tutorialHandler.js';
import { TutorialCallouts, initTutorialCallouts } from './tutorialCallouts.js';
import ImperialMandateCalendar from './mandates/imperialMandateCalendar.js';
import createImperialMandates from './mandates/imperialMandatesCore.js';
import ImperialMandateUIAdapter from './mandates/imperialMandatesAdapter.js';
import ImperialMandateManager from './mandates/imperialMandateManager.js';
import { initImperialMandates } from './mandates/imperialMandates.js';
import { initStorageProbe } from './storageProbe.js';
import { bootstrapGame, createGameCore } from './script.js';
import { publishBootstrapHandles } from './globalShim.js';

const bootstrapScope = typeof window !== 'undefined' ? window : globalThis;

const inputHelpers = initInputHelpers?.(bootstrapScope) || {
    Layout,
    SQRT3,
    isPointerOnDrawnHex,
    pixelToAxial,
    cubeToPixel
};
initIntroOverlay?.(bootstrapScope);
initAudio?.(bootstrapScope);
initJuice?.(bootstrapScope);
Persistence?.initPersistence?.(bootstrapScope);
initResearchSystem?.(bootstrapScope);
initVoidEasterEgg?.(bootstrapScope);
initPlatformAdapter?.(bootstrapScope);
initDebugToggle?.(bootstrapScope, { document: bootstrapScope?.document || null });
initRebelSystem?.(bootstrapScope);
initTutorialHandler?.(bootstrapScope);
initTutorialCallouts?.(bootstrapScope);
ImperialMandateCalendar?.initImperialMandateCalendar?.(bootstrapScope);
createImperialMandates?.initImperialMandatesCore?.(bootstrapScope);
ImperialMandateUIAdapter?.initImperialMandatesAdapter?.(bootstrapScope);
const imperialMandateManager = ImperialMandateManager?.initImperialMandateManager?.(bootstrapScope) || ImperialMandateManager;
const imperialMandates = initImperialMandates?.(bootstrapScope) || null;
const storageProbe = initStorageProbe?.(bootstrapScope) || null;
const debugToggles = bootstrapScope?.DebugToggles || null;

const dependencies = {
    inputHelpers,
    researchSystem: ResearchSystem,
    rebelSystem: RebelSystem,
    tutorialHandler: TutorialHandler,
    imperialMandates,
    imperialMandateManager,
    platformAdapter: PlatformAdapter,
    tutorialCallouts: TutorialCallouts,
    introOverlay: IntroOverlay,
    persistence: Persistence,
    storageProbe,
    gameAudio: GameAudio,
    debugToggles,
    windowScope: bootstrapScope
};
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
