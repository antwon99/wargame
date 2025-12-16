/**
 * Tile inspector view-model helpers that summarize cluster bonuses and adjacency
 * metadata for the HUD panels. These functions operate on plain state objects so
 * uiBindings.js can remain focused on DOM wiring.
 */

/**
 * Build a stable identifier for a tile based on its axial coordinates.
 * @param {object} tile tile containing a hex coordinate.
 * @returns {string} canonical coordinate key.
 */
export function getTileKey(tile) {
    if (tile?.hex?.toString) return tile.hex.toString();
    const q = tile?.hex?.q ?? 0;
    const r = tile?.hex?.r ?? 0;
    return `${q},${r}`;
}

/**
 * Describe adjacency bonuses for a tile, including income modifiers and rate
 * breakdowns. The returned payload is safe to render directly in the inspector.
 * @param {object} game live game singleton exposing overworld cluster metadata.
 * @param {object} tile tile being inspected.
 * @param {string} labelText human-friendly tile label used in messaging.
 * @returns {object|null} adjacency payload, or null when no cluster data exists.
 */
export function buildClusterSummary(game, tile, labelText) {
    const key = getTileKey(tile);
    const clusterMap = game?.overworld?.clusterBonuses;
    const cluster = key && clusterMap?.has(key) ? clusterMap.get(key) : tile?.clusterBonus;
    if (!cluster) {
        return {
            key,
            cluster: null,
            hasAdjacency: false,
            payload: 'No bonus income',
            label: 'No adjacency',
            tooltip: 'No adjacency modifiers',
            pauseSuffix: game?.paused ? ' (paused)' : '',
            summary: 'No adjacency bonuses',
            detail: 'Isolated tile — cluster effects unavailable.',
            resources: []
        };
    }

    const clusterSize = Number.isInteger(cluster.size) ? cluster.size : 0;
    const isClustered = clusterSize >= 2;
    const resources = [];
    if (cluster.goldBonus) resources.push(`+${cluster.goldBonus}g`);
    if (cluster.woodBonus) resources.push(`+${cluster.woodBonus}w`);

    const clusterLabel = isClustered ? `${clusterSize}-tile ${labelText.toLowerCase()} cluster` : 'No adjacency';
    const payload = resources.length ? resources.join(' ') : 'No bonus income';
    const pauseSuffix = game?.paused ? ' (paused)' : '';

    const tooltipParts = [];
    if (isClustered) tooltipParts.push(`Cluster size ${clusterSize}`);
    if (isClustered && typeof cluster.adjacencyRate === 'number') tooltipParts.push(`Adjacency ${(cluster.adjacencyRate * 100).toFixed(0)}%`);
    if (isClustered && typeof cluster.reclamationRate === 'number') tooltipParts.push(`Reclamation ${(cluster.reclamationRate * 100).toFixed(0)}%`);
    const tooltip = tooltipParts.length ? tooltipParts.join(' • ') : 'No adjacency modifiers';

    const hasAdjacency = Boolean(cluster && (isClustered || cluster.totalRate || cluster.goldBonus || cluster.woodBonus));
    const summary = resources.length ? `Cluster bonuses: ${resources.join(' ')}` : 'Cluster bonuses active';
    const rateParts = [];
    if (typeof cluster.totalRate === 'number') rateParts.push(`Total ${(cluster.totalRate * 100).toFixed(0)}%`);
    if (typeof cluster.adjacencyRate === 'number') rateParts.push(`Adjacency ${(cluster.adjacencyRate * 100).toFixed(0)}%`);
    if (typeof cluster.reclamationRate === 'number') rateParts.push(`Reclamation ${(cluster.reclamationRate * 100).toFixed(0)}%`);
    const detailParts = [clusterLabel];
    if (rateParts.length) detailParts.push(rateParts.join(' • '));

    return {
        key,
        cluster,
        hasAdjacency,
        resources,
        payload,
        label: clusterLabel,
        pauseSuffix,
        tooltip,
        summary: hasAdjacency ? summary : 'No adjacency bonuses',
        detail: hasAdjacency ? detailParts.join(' — ') : 'Isolated tile — cluster effects unavailable.'
    };
}

export default buildClusterSummary;
