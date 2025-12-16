/**
 * Declarative registry of imperial mandate blueprints.
 *
 * Entries capture descriptive fields only so runtime mandate logic can remain
 * in the manager while sharing consistent labels, timelines, and descriptors.
 */
(function (global) {
    const imperialMandateRegistry = [
        {
            id: 'destroy_first_rebel_camp',
            title: 'Frontier Sweep',
            description: 'Destroy the first rebel encampment seeded near the foggy frontier before the Emperor loses patience.',
            duration: { weeks: 3 },
            resolutionType: 'timed',
            rewardDescriptor: 'Territorial reprieve for clearing the rebel encampment',
            triggerConditions: 'Frontier world initialized with at least one rebel spawn location'
        },
        {
            id: 'levy_tithed_gold',
            title: 'Imperial Tax Levy',
            description: 'Deliver a gold tithe to the capital. Maintain reserves long enough for the courier to collect payment.',
            duration: { weeks: 1, days: 4 },
            earliestIssue: { weeks: 1, days: 2 },
            resolutionType: 'timed',
            rewardDescriptor: 'Partial rebate on remitted levy',
            triggerConditions: 'Gold reserves meet levy threshold'
        },
        {
            id: 'push_the_frontier',
            title: 'Push the Frontier',
            description: 'Claim additional territory before the frontier stagnates. Expansion proves loyalty.',
            duration: { weeks: 2, days: 3 },
            earliestIssue: { weeks: 2, days: 4 },
            resolutionType: 'timed',
            rewardDescriptor: 'Signing bonus for securing additional holdings',
            triggerConditions: 'Sufficient initial territory held'
        },
        {
            id: 'infrastructure_quota',
            title: 'Infrastructure Quota',
            description: 'Stage materials for imperial engineers so roads, depots, and waystations can be laid without delay.',
            duration: { weeks: 1, days: 1 },
            earliestIssue: { weeks: 2, days: 3 },
            resolutionType: 'timed',
            rewardDescriptor: 'Logistics stipend when depots are stocked',
            triggerConditions: 'Adequate baseline wood and gold reserves',
            successFavorDelta: 2,
            failureFavorDelta: -2
        },
        {
            id: 'rotating_resource_levy',
            title: 'Rotating Imperial Levy',
            description: 'Alternate between gold and timber tributes so the treasury stays balanced and the navy stays supplied.',
            duration: { weeks: 1, days: 4 },
            earliestIssue: { weeks: 3 },
            resolutionType: 'timed',
            rewardDescriptor: 'Rebate for timely rotating levy compliance',
            triggerConditions: 'Frontier holdings established with strong reserves',
            successFavorDelta: 1,
            failureFavorDelta: -2
        },
        {
            id: 'diplomatic_envoys',
            title: 'Dispatch Diplomatic Envoys',
            description: 'Spend favor and coin to keep frontier courts aligned with the Empire.',
            duration: { weeks: 1 },
            earliestIssue: { weeks: 2, days: 2 },
            resolutionType: 'timed',
            rewardDescriptor: 'Favor boost for funding envoys and securing alliances',
            triggerConditions: 'Imperial favor and gold reserves above diplomatic threshold',
            successFavorDelta: 2,
            failureFavorDelta: -3
        }
    ];

    global.ImperialMandateRegistry = imperialMandateRegistry;
    if (typeof module !== 'undefined') module.exports = imperialMandateRegistry;
})(typeof window !== 'undefined' ? window : globalThis);
