/**
 * The composition tracker shared by the engine and the map editor: how many entities of a map
 * answer to each composition entry. Pure functions, no DOM.
 *
 * @module src/client/components/cyberia/MapPlacementCyberia.js
 */

/** The identity of a map entity: its type and the items it holds, in order. */
export const entityKey = ({ entityType, objectLayerItemIds = [] }) => `${entityType}|${objectLayerItemIds.join(',')}`;

/**
 * Each composition entry with the number of map entities of its type and item ids.
 * @param {Array<{entity:{entityType:string,objectLayerItemIds:string[]}}>} entries
 * @param {Object[]} entities - Map entities.
 * @returns {Object[]} Each entry with `placed`; an entry is met once `placed` is one or more.
 */
export function trackComposition(entries, entities) {
  const counts = new Map();
  for (const entity of entities) counts.set(entityKey(entity), (counts.get(entityKey(entity)) ?? 0) + 1);
  return entries.map((entry) => ({ ...entry, placed: counts.get(entityKey(entry.entity)) ?? 0 }));
}
