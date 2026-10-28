import { describe, it, expect } from 'vitest';
import {
  animationPace,
  drawEntities,
  entityKey,
  mapMediaDrawing,
  trackComposition,
} from '../../../src/client/components/cyberia/MapPlacementCyberia.js';

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

describe('the drawing of placed entities', () => {
  /** A canvas context that records the calls a drawing makes. */
  const recorder = () => {
    const calls = [];
    const ctx = new Proxy(
      { calls },
      {
        get: (target, key) => (key in target ? target[key] : (...args) => calls.push([key, ...args])),
        set: (target, key, value) => {
          calls.push([`set ${String(key)}`, value]);
          return true;
        },
      },
    );
    return ctx;
  };
  const vortex = {
    image: 'atlas',
    duration: 200,
    frames: [0, 1, 2].map((index) => ({ x: index * 12, y: 0, width: 12, height: 12 })),
  };
  const floor = {
    entityType: 'floor',
    initCellX: 1,
    initCellY: 2,
    dimX: 2,
    dimY: 2,
    color: 'red',
    objectLayerItemIds: ['moss'],
  };
  const portal = { ...floor, entityType: 'portal', objectLayerItemIds: ['gate'] };

  it('draws the idle frame the time shows, over the cells of the entity, with no smoothing', () => {
    const ctx = recorder();
    drawEntities(ctx, [portal], { cellW: 10, cellH: 10, objectLayers: true, spriteOf: () => vortex, now: 450 });
    expect(ctx.calls).toContainEqual(['set imageSmoothingEnabled', false]);
    expect(ctx.calls).toContainEqual(['drawImage', 'atlas', 24, 0, 12, 12, 10, 20, 20, 20]);
    expect(ctx.calls.some(([name]) => name === 'fillRect')).toBe(false);
  });

  it('fills the color while a sprite loads or layers are off, and marks an item whose artwork did not resolve', () => {
    const loading = recorder();
    drawEntities(loading, [floor], { cellW: 10, cellH: 10, objectLayers: true, spriteOf: () => undefined });
    expect(loading.calls).toContainEqual(['fillRect', 10, 20, 20, 20]);
    const off = recorder();
    drawEntities(off, [portal], { cellW: 10, cellH: 10, objectLayers: false, spriteOf: () => vortex });
    expect(off.calls.some(([name]) => name === 'drawImage')).toBe(false);
    const missing = recorder();
    drawEntities(missing, [floor], {
      cellW: 10,
      cellH: 10,
      objectLayers: true,
      spriteOf: () => ({ missing: 'no atlas' }),
    });
    expect(missing.calls).toContainEqual(['fillRect', 10, 20, 20, 20]);
    expect(missing.calls).toContainEqual(['setLineDash', [3, 2]]);
  });

  it('paces an animation by its shortest frame, and none when nothing animates', () => {
    const still = { ...vortex, frames: vortex.frames.slice(0, 1) };
    expect(animationPace([floor, portal], (itemId) => (itemId === 'gate' ? vortex : still))).toBe(200);
    expect(animationPace([floor], () => still)).toBe(0);
    expect(animationPace([floor], () => ({ missing: 'no atlas' }))).toBe(0);
  });
});

describe('the preview state of a map revision', () => {
  const media = (revision, status) => ({ revision, status, error: '' });

  it('runs a draw only while the media of the revision the map is at is pending', () => {
    expect(mapMediaDrawing(media(3, 'pending'), 3)).toBe(true);
    expect(mapMediaDrawing(media(3, 'ready'), 3)).toBe(false);
    expect(mapMediaDrawing(media(3, 'failed'), 3)).toBe(false);
  });

  it('runs no draw for a map with no media or media of another revision', () => {
    expect(mapMediaDrawing(null, 1)).toBe(false);
    expect(mapMediaDrawing(media(2, 'pending'), 3)).toBe(false);
    expect(mapMediaDrawing(media(4, 'pending'), 3)).toBe(false);
  });
});
