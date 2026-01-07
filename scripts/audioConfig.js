/**
 * Canonical audio library manifest for the overworld. This file isolates the
 * track group definitions (loops, weights, cooldowns) from runtime logic so
 * tests and tools can load sound metadata without pulling in the full
 * AudioManager.
 */

/**
 * Grouped audio file paths used to build the manifest. Entries that require
 * weighted randomisation keep their weight metadata here so selection logic can
 * remain generic.
 */
export const SFX_GROUPS = {
    ambientLoops: ['sfx/ambient/ambient.mp3'],
    // Wind bed intentionally disabled until a distinct loop is available to avoid
    // stacking the same ambience twice.
    windBeds: [],
    wardrums: ['sfx/system/wardrum.mp3'],
    city: ['sfx/territory/city.mp3'],
    swords: [
        { src: 'sfx/combat/sword/sword.mp3', weight: 2 },
        { src: 'sfx/combat/sword/sword2.mp3', weight: 1 },
        { src: 'sfx/combat/sword/sword3.mp3', weight: 1 },
        { src: 'sfx/combat/sword/sword4.mp3', weight: 1 },
        { src: 'sfx/combat/sword/sword5.mp3', weight: 1 }
    ],
    arrows: [
        { src: 'sfx/combat/arrow/arrow.mp3', weight: 2 },
        { src: 'sfx/combat/arrow/arrow2.mp3', weight: 1 },
        { src: 'sfx/combat/arrow/arrow3.mp3', weight: 1 },
        { src: 'sfx/combat/arrow/arrow4.mp3', weight: 1 }
    ],
    towers: [
        { src: 'sfx/combat/tower/tower.mp3', weight: 2 },
        { src: 'sfx/combat/tower/tower2.mp3', weight: 1 },
        { src: 'sfx/combat/tower/tower3.mp3', weight: 1 }
    ],
    rares: [
        { src: 'sfx/combat/rare/rare.mp3', weight: 2 },
        { src: 'sfx/combat/rare/rare2.mp3', weight: 1 },
        { src: 'sfx/combat/rare/rare3.mp3', weight: 1 }
    ],
    deaths: [
        { src: 'sfx/combat/deaths/death/death1.mp3', weight: 1 },
        { src: 'sfx/combat/deaths/death/death2.mp3', weight: 1 },
        { src: 'sfx/combat/deaths/death/death3.mp3', weight: 1 },
        { src: 'sfx/combat/deaths/death/death4.mp3', weight: 1 },
        { src: 'sfx/combat/deaths/death/death5.mp3', weight: 1 }
    ],
    rareDeaths: [
        { src: 'sfx/combat/deaths/raredeath/raredeath1.mp3', weight: 1 },
        { src: 'sfx/combat/deaths/raredeath/raredeath2.mp3', weight: 1 },
        { src: 'sfx/combat/deaths/raredeath/raredeath3.mp3', weight: 1 },
        { src: 'sfx/combat/deaths/raredeath/raredeath4.mp3', weight: 1 },
        { src: 'sfx/combat/deaths/raredeath/raredeath5.mp3', weight: 1 }
    ],
    victory: ['sfx/system/victory.mp3'],
    defeat: ['sfx/system/defeat.mp3'],
    territoryMusic: [
        'sfx/ambient/ambiance_upbeat.mp3',
        'sfx/ambient/ambiance_uplifting.mp3',
        'sfx/ambient/ambiance_uptake.mp3'
    ],
    warMusic: [
        'sfx/ambient/ambiance_sorrow.mp3',
        'sfx/ambient/ambiance_dark.mp3',
        'sfx/ambient/ambiance_anger.mp3'
    ],
    /**
     * Choptree straddles UI feedback and resource collection but currently
     * lives alongside other territory cues to keep surface interactions
     * bundled together.
     */
    misc: ['sfx/territory/choptree.mp3']
};

/**
 * Manifest mapping for AudioManager consumers. Each entry defines playback
 * options so the runtime can remain declarative.
 */
export const SFX_MANIFEST = {
    wardrum: { src: SFX_GROUPS.wardrums[0], cooldownMs: 1200 },
    sword: {
        allowOverlap: true,
        cooldownMs: 90,
        variations: SFX_GROUPS.swords
    },
    arrow: {
        allowOverlap: true,
        cooldownMs: 90,
        variations: SFX_GROUPS.arrows
    },
    tower: {
        allowOverlap: true,
        cooldownMs: 120,
        variations: SFX_GROUPS.towers
    },
    rare: {
        allowOverlap: true,
        cooldownMs: 140,
        variations: SFX_GROUPS.rares
    },
    death: {
        allowOverlap: true,
        cooldownMs: 80,
        groupKey: 'combat-death',
        groupWindowMs: 140,
        maxGroupPlays: 1,
        volume: 0.45,
        variations: SFX_GROUPS.deaths
    },
    raredeath: {
        allowOverlap: true,
        cooldownMs: 80,
        groupKey: 'combat-death',
        groupWindowMs: 140,
        maxGroupPlays: 1,
        volume: 0.45,
        variations: SFX_GROUPS.rareDeaths
    },
    defeat: { src: SFX_GROUPS.defeat[0], cooldownMs: 400 },
    victory: { src: SFX_GROUPS.victory[0], cooldownMs: 400 },
    city: { src: SFX_GROUPS.city[0], cooldownMs: 100 },
    choptree: { src: SFX_GROUPS.misc[0], cooldownMs: 100 },
    ambient: { src: SFX_GROUPS.ambientLoops[0], loop: true, volume: 0.35, isAmbient: true, cooldownMs: 0, category: 'music' },
    ambiance_upbeat: { src: SFX_GROUPS.territoryMusic[0], volume: 0.55, cooldownMs: 0, allowOverlap: true, category: 'music' },
    ambiance_uplifting: { src: SFX_GROUPS.territoryMusic[1], volume: 0.55, cooldownMs: 0, allowOverlap: true, category: 'music' },
    ambiance_uptake: { src: SFX_GROUPS.territoryMusic[2], volume: 0.55, cooldownMs: 0, allowOverlap: true, category: 'music' },
    ambiance_sorrow: { src: SFX_GROUPS.warMusic[0], volume: 0.6, cooldownMs: 0, allowOverlap: true, category: 'music' },
    ambiance_dark: { src: SFX_GROUPS.warMusic[1], volume: 0.6, cooldownMs: 0, allowOverlap: true, category: 'music' },
    ambiance_anger: { src: SFX_GROUPS.warMusic[2], volume: 0.6, cooldownMs: 0, allowOverlap: true, category: 'music' }
};
