/**
 * Voice definitions used by the narrative system to style notification dispatches.
 * Each voice provides a title and tone for notification cards.
 */
export const NARRATIVE_VOICES = {
    imperialClerk: {
        id: 'imperialClerk',
        name: 'Imperial Clerk',
        title: 'Imperial Dispatch',
        tone: 'info'
    },
    frontierElder: {
        id: 'frontierElder',
        name: 'Frontier Elder',
        title: 'Frontier Counsel',
        tone: 'warning'
    },
    rebelHerald: {
        id: 'rebelHerald',
        name: 'Rebel Herald',
        title: 'Rebel Broadcast',
        tone: 'warning'
    }
};

/**
 * Template catalog keyed by event type and severity tier.
 * Strings may include token placeholders (ex: {month}, {week}, {favor}, {goldDelta}, {woodDelta}, {count}).
 */
export const NARRATIVE_TEMPLATES = {
    economy: {
        low: [
            {
                voice: 'imperialClerk',
                lines: [
                    'Ledger update for {month}, week {week}: treasury shift {goldDelta}g, lumber shift {woodDelta}w.'
                ]
            },
            {
                voice: 'frontierElder',
                lines: [
                    'The winds of {month} favor us; stores drift by {goldDelta}g and {woodDelta}w this week.'
                ]
            }
        ],
        high: [
            {
                voice: 'imperialClerk',
                lines: [
                    'Urgent fiscal swing in {month} W{week}: gold {goldDelta}g, wood {woodDelta}w. Adjust quotas.'
                ]
            },
            {
                voice: 'rebelHerald',
                lines: [
                    'They tally losses in {month} W{week}. {goldDelta}g and {woodDelta}w gone from the tyrant’s vaults.'
                ]
            }
        ]
    },
    favor: {
        low: [
            {
                voice: 'imperialClerk',
                lines: [
                    'Favor ledger stands at {favor} as {month} week {week} closes.'
                ]
            }
        ],
        high: [
            {
                voice: 'frontierElder',
                lines: [
                    'The court’s gaze sharpens—favor now {favor} in {month} W{week}.'
                ]
            },
            {
                voice: 'rebelHerald',
                lines: [
                    'They cheer their standing at {favor}. We remember every slight from {month} W{week}.'
                ]
            }
        ]
    },
    rebel: {
        low: [
            {
                voice: 'frontierElder',
                lines: [
                    '{count} embers flicker along the frontier in {month} W{week}. Keep watch.'
                ]
            },
            {
                voice: 'imperialClerk',
                lines: [
                    'Recon reports {count} rebel stirrings for {month} week {week}.'
                ]
            }
        ],
        high: [
            {
                voice: 'rebelHerald',
                lines: [
                    '{count} banners rise this {month} W{week}. The border will remember.'
                ]
            },
            {
                voice: 'imperialClerk',
                lines: [
                    'Escalation: {count} insurgent cells active as {month} W{week} turns.'
                ]
            }
        ]
    }
};

export default {
    NARRATIVE_VOICES,
    NARRATIVE_TEMPLATES
};
