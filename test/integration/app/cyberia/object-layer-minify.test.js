import { describe, it, expect } from 'vitest';
import { ObjectLayerEngine } from '../../../../src/projects/cyberia/object-layer.js';

const select = (storedItemIds, requestedItemIds) =>
  ObjectLayerEngine.selectMinifyItemIds({ storedItemIds, requestedItemIds });

describe('ol --minify item selection', () => {
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
