import { describe, it, expect } from 'vitest';
import { entityKey, trackComposition } from '../../../src/client/components/cyberia/MapPlacementCyberia.js';

const at = (x, y, entityType, objectLayerItemIds) => ({ entityType, objectLayerItemIds, initCellX: x, initCellY: y });

describe('the composition tracker', () => {
  const entries = [
    { entity: { entityType: 'obstacle', objectLayerItemIds: ['wall'] } },
    { entity: { entityType: 'bot', objectLayerItemIds: ['walker', 'gun'] } },
  ];

  it('counts the map entities of each entry by type and item ids, in order', () => {
    const tracked = trackComposition(entries, [
      at(0, 0, 'obstacle', ['wall']),
      at(3, 1, 'obstacle', ['wall']),
      at(5, 5, 'bot', ['gun', 'walker']),
      at(6, 6, 'floor', ['wall']),
    ]);
    expect(tracked.map(({ placed }) => placed)).toEqual([2, 0]);
    expect(tracked[0].entity).toBe(entries[0].entity);
  });

  it('meets an entry as soon as the map holds one of its entities', () => {
    const entities = [];
    expect(trackComposition(entries, entities)[1].placed).toBe(0);
    entities.push(at(2, 2, 'bot', ['walker', 'gun']));
    expect(trackComposition(entries, entities)[1].placed).toBe(1);
    expect(entityKey(entities[0])).toBe('bot|walker,gun');
  });
});
