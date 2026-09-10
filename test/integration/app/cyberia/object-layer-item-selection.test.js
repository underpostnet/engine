import { describe, it, expect } from 'vitest';
import { ObjectLayerEngine } from '../../../../src/projects/cyberia/object-layer.js';

const select = (storedItemIds, requestedItemIds) =>
  ObjectLayerEngine.selectStoredItemIds({ storedItemIds, requestedItemIds });

describe('ol stored item selection', () => {
  it('takes every stored item when the command gives no item-id', () => {
    expect(select(['hatchet', 'sword'])).toEqual({ itemIds: ['hatchet', 'sword'], missingItemIds: [] });
  });

  it('keeps only the requested items that the collection holds', () => {
    expect(select(['hatchet', 'sword'], ['sword', 'ghost'])).toEqual({
      itemIds: ['sword'],
      missingItemIds: ['ghost'],
    });
  });

  it('removes blanks and duplicates from both sides', () => {
    expect(select(['hatchet', 'hatchet', null, ' sword '], [' hatchet ', 'hatchet', ''])).toEqual({
      itemIds: ['hatchet'],
      missingItemIds: [],
    });
    expect(select([undefined, ''], [])).toEqual({ itemIds: [], missingItemIds: [] });
  });
});

const rebuild = (options) => ObjectLayerEngine.selectAtlasRebuild(options);

describe('ol atlas rebuild selection', () => {
  it('rebuilds when --to-atlas-sprite-sheet is given, with or without a dimension', () => {
    expect(rebuild({ toAtlasSpriteSheet: true })).toBe(true);
    expect(rebuild({ toAtlasSpriteSheet: '2048' })).toBe(true);
    expect(rebuild({ toAtlasSpriteSheet: true, instance: 'TEST' })).toBe(true);
  });

  it('treats a bare --upscale as the rebuild request', () => {
    expect(rebuild({ upscale: 20 })).toBe(true);
    expect(rebuild({ upscale: 20, instance: 'TEST' })).toBe(true);
  });

  it('keeps --upscale a modifier next to another action', () => {
    expect(rebuild({ upscale: 20, import: true })).toBe(false);
    expect(rebuild({ upscale: 20, minify: true })).toBe(false);
    expect(rebuild({ upscale: 20, generate: true })).toBe(false);
    expect(rebuild({ upscale: 20, importTypes: 'skin' })).toBe(false);
    expect(rebuild({ upscale: 20, drop: true })).toBe(false);
    expect(rebuild({ upscale: 20, showFrame: '08_0' })).toBe(false);
    expect(rebuild({ upscale: 20, showAtlasSpriteSheet: true })).toBe(false);
  });

  it('stays out of the way when neither flag is given', () => {
    expect(rebuild({})).toBe(false);
    expect(rebuild({ minify: true, instance: 'TEST' })).toBe(false);
  });
});
