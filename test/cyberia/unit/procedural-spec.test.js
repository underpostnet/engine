import { describe, it, expect } from 'vitest';
import {
  GENERATION_MODES,
  MAX_JOB_ITEMS,
  RANDOM_PALETTE,
  checkRequest,
  proposedItemId,
} from '../../../src/projects/cyberia/procedural/spec.js';

const UPDATE = {
  mode: 'update-existing',
  source: { itemIds: ['skin.worker', 'skin.violet'] },
  output: { variantsPerItem: 3 },
  palette: { items: [{ itemId: 'skin.violet', slots: { 'hair.base': '#AA0000' } }] },
  variation: { level: 0.65 },
  seed: { mode: 'auto' },
};
const CREATE = {
  mode: 'create-new',
  itemType: 'skin',
  template: { id: 'skin.humanoid' },
  palette: { paletteId: RANDOM_PALETTE },
  output: { variants: 10, itemIdPrefix: 'skin-generated' },
  variation: { level: 0.65 },
  seed: { mode: 'auto' },
};
const refused = (request, message) => expect(() => checkRequest(request)).toThrow(message);

describe('the generation modes', () => {
  it('are two, and a random palette is named random', () => {
    expect(GENERATION_MODES).toEqual(['update-existing', 'create-new']);
    expect(RANDOM_PALETTE).toBe('random');
  });
});

describe('an update request', () => {
  it('names existing items and the variants of each, and resolves the defaults the mode owns', () => {
    const checked = checkRequest(UPDATE);
    expect(checked).toMatchObject({
      mode: 'update-existing',
      itemIds: ['skin.worker', 'skin.violet'],
      variants: 3,
      palette: { items: [{ itemId: 'skin.violet', slots: { 'hair.base': '#aa0000' } }] },
      level: 0.65,
      generator: null,
    });
    expect(checked.seed.mode).toBe('auto');
    expect(Number.isInteger(checked.seed.value)).toBe(true);
  });

  it('takes the defaults of each item when no palette is named', () => {
    const { palette, ...request } = UPDATE;
    expect(checkRequest(request).palette).toEqual({ items: [] });
  });

  it('takes the palette choice of each item apart, in the order of the items, and drops an item with none', () => {
    const items = [
      { itemId: 'skin.violet', paletteId: 'exotic-teal', slots: { 'legs.base': '#00FF00' } },
      { itemId: 'skin.worker', paletteId: RANDOM_PALETTE },
    ];
    expect(checkRequest({ ...UPDATE, palette: { items } }).palette.items).toEqual([
      { itemId: 'skin.worker', paletteId: 'random', slots: {} },
      { itemId: 'skin.violet', paletteId: 'exotic-teal', slots: { 'legs.base': '#00ff00' } },
    ]);
    expect(
      checkRequest({ ...UPDATE, palette: { items: [{ itemId: 'skin.worker', slots: {} }] } }).palette.items,
    ).toEqual([]);
  });

  it('needs at least one existing item, each once', () => {
    refused({ ...UPDATE, source: undefined }, /needs source.itemIds/);
    refused({ ...UPDATE, source: { itemIds: [] } }, /needs source.itemIds/);
    refused({ ...UPDATE, source: { itemIds: ['a', 'a'] } }, /each item id once/);
    refused({ ...UPDATE, source: { itemIds: ['a', ''] } }, /each item id once/);
    refused({ ...UPDATE, source: { itemIds: ['a'], cid: 'x' } }, /source does not take cid/);
  });

  it('refuses what only a create takes, and takes the template its items start from', () => {
    expect(checkRequest(UPDATE).template).toBeNull();
    expect(checkRequest({ ...UPDATE, template: { id: 'skin.humanoid' } }).template).toEqual({ id: 'skin.humanoid' });
    refused({ ...UPDATE, template: { id: '' } }, /template needs an id/);
    refused({ ...UPDATE, itemType: 'skin' }, /does not take itemType/);
    refused({ ...UPDATE, output: { variants: 3 } }, /output does not take variants/);
    refused({ ...UPDATE, output: { variantsPerItem: 3, itemIdPrefix: 'x' } }, /output does not take itemIdPrefix/);
  });

  it('keeps the variants per item inside the job limit', () => {
    refused({ ...UPDATE, output: { variantsPerItem: 0 } }, /variantsPerItem must be an integer from 1 to/);
    refused({ ...UPDATE, output: { variantsPerItem: MAX_JOB_ITEMS + 1 } }, /from 1 to/);
    refused({ ...UPDATE, output: { variantsPerItem: 1.5 } }, /from 1 to/);
  });
});

describe('a create request', () => {
  it('names an item type, a template, the variants and the prefix of the new items', () => {
    expect(checkRequest(CREATE)).toMatchObject({
      mode: 'create-new',
      itemType: 'skin',
      template: { id: 'skin.humanoid' },
      variants: 10,
      itemIdPrefix: 'skin-generated',
      palette: { paletteId: 'random', slots: {} },
    });
    expect(checkRequest({ ...CREATE, template: undefined }).template).toBeNull();
  });

  it('takes the defaults of the template when no palette is named, or one palette choice for the run', () => {
    const { palette, ...request } = CREATE;
    expect(checkRequest(request).palette).toEqual({ slots: {} });
    expect(
      checkRequest({ ...CREATE, palette: { paletteId: 'exotic-teal', slots: { 'legs.base': '#123ABC' } } }).palette,
    ).toEqual({ paletteId: 'exotic-teal', slots: { 'legs.base': '#123abc' } });
  });

  it('has no source: any source is refused, whatever it holds', () => {
    refused({ ...CREATE, source: { itemIds: ['skin.worker'] } }, /does not take source/);
    refused({ ...CREATE, source: {} }, /does not take source/);
  });

  it('needs an item type and a valid prefix', () => {
    refused({ ...CREATE, itemType: undefined }, /needs an itemType/);
    refused({ ...CREATE, output: { variants: 2, itemIdPrefix: 'Bad Prefix' } }, /lowercase words/);
    refused({ ...CREATE, output: { variants: 2 } }, /lowercase words/);
    refused({ ...CREATE, output: { variantsPerItem: 2, itemIdPrefix: 'a' } }, /output does not take variantsPerItem/);
  });

  it('names new item ids from the prefix with three digits at least', () => {
    expect(proposedItemId('skin-generated', 0)).toBe('skin-generated-001');
    expect(proposedItemId('skin-generated', 1199)).toBe('skin-generated-1200');
  });

  it('takes exact new item ids in place of a prefix and a count', () => {
    expect(checkRequest({ ...CREATE, output: { itemIds: ['violet-moss', 'violet-stone'] } })).toMatchObject({
      itemIds: ['violet-moss', 'violet-stone'],
    });
    refused({ ...CREATE, output: { itemIds: ['Violet Moss'] } }, /lowercase words/);
    refused({ ...CREATE, output: { itemIds: ['a', 'a'] } }, /each once/);
    refused({ ...CREATE, output: { itemIds: ['a'], variants: 1 } }, /output does not take variants/);
  });
});

describe('the origin of an update', () => {
  it('starts each item from its render, unless the request names it among the items that start from the template', () => {
    expect(checkRequest(UPDATE).fromTemplate).toEqual([]);
    expect(
      checkRequest({ ...UPDATE, source: { itemIds: UPDATE.source.itemIds, fromTemplate: ['skin.violet'] } })
        .fromTemplate,
    ).toEqual(['skin.violet']);
    refused(
      { ...UPDATE, source: { itemIds: ['skin.worker'], fromTemplate: ['skin.violet'] } },
      /fromTemplate lists items/,
    );
  });
});

describe('the palette choice', () => {
  it('names a palette by a non-empty id, and refuses what a choice does not take', () => {
    refused({ ...CREATE, palette: { paletteId: '' } }, /palette.paletteId names a palette or random/);
    refused({ ...CREATE, palette: { items: [] } }, /palette does not take items/);
    refused({ ...UPDATE, palette: { slots: {} } }, /palette does not take slots/);
    refused({ ...UPDATE, palette: { paletteId: 'exotic-teal' } }, /palette does not take paletteId/);
  });

  it('takes slots for the run in a create, and for each item of the source in an update', () => {
    refused(
      { ...CREATE, palette: { slots: { 'hair.base': 'red' } } },
      /palette.slots maps a slot id to a color as #rrggbb/,
    );
    refused({ ...UPDATE, palette: { items: {} } }, /palette.items lists/);
    refused({ ...UPDATE, palette: { items: [{ itemId: 'skin.other' }] } }, /each item of source.itemIds once/);
    refused(
      { ...UPDATE, palette: { items: [{ itemId: 'skin.worker' }, { itemId: 'skin.worker' }] } },
      /each item of source.itemIds once/,
    );
    refused(
      { ...UPDATE, palette: { items: [{ itemId: 'skin.worker', slots: { 'hair.base': 'red' } }] } },
      /a palette item.slots maps a slot id to a color as #rrggbb/,
    );
    refused(
      { ...UPDATE, palette: { items: [{ itemId: 'skin.worker', colors: {} }] } },
      /a palette item does not take colors/,
    );
  });
});

describe('the common fields', () => {
  it('refuses an unknown mode, a mode missing, a non-object and an unknown field', () => {
    refused(undefined, /must be an object/);
    refused([], /must be an object/);
    refused({ ...UPDATE, mode: 'mutate' }, /mode must be update-existing or create-new/);
    refused({ ...UPDATE, mode: undefined }, /mode must be/);
    refused({ ...UPDATE, speed: 2 }, /does not take speed/);
    const { output, ...withoutOutput } = CREATE;
    refused(withoutOutput, /needs an output/);
  });

  it('keeps the seed out of the artistic fields: auto draws one, fixed names it', () => {
    const [first, second] = [checkRequest(UPDATE).seed, checkRequest(UPDATE).seed];
    expect(first.value === second.value && first.mode === second.mode).toBe(false);
    expect(checkRequest({ ...UPDATE, seed: { mode: 'fixed', value: 42 } }).seed).toEqual({ mode: 'fixed', value: 42 });
    expect(checkRequest({ ...UPDATE, seed: undefined }).seed.mode).toBe('auto');
    refused({ ...UPDATE, seed: { mode: 'fixed' } }, /seed is/);
    refused({ ...UPDATE, seed: { mode: 'fixed', value: -1 } }, /seed is/);
    refused({ ...UPDATE, seed: { mode: 'auto', value: 3 } }, /seed is/);
    refused({ ...UPDATE, seed: 5 }, /seed must be an object/);
  });

  it('takes the variation as one level and refuses it in the parameters', () => {
    expect(checkRequest({ ...UPDATE, variation: undefined }).level).toBeUndefined();
    refused({ ...UPDATE, variation: { level: 0.5, mutationFactor: 1 } }, /variation does not take mutationFactor/);
    refused({ ...UPDATE, parameters: { variation: 0.4 } }, /Set the variation in variation.level/);
    expect(checkRequest({ ...UPDATE, parameters: { hairStyle: 'long' } }).parameters).toEqual({ hairStyle: 'long' });
  });

  it('checks the generator and template references', () => {
    expect(checkRequest({ ...UPDATE, generator: { id: 'skin-variant' } }).generator).toEqual({ id: 'skin-variant' });
    refused({ ...UPDATE, generator: {} }, /generator needs an id/);
    refused({ ...CREATE, template: { id: 'skin.humanoid', version: 4 } }, /template does not take version/);
    refused({ ...CREATE, template: {} }, /template needs an id/);
  });
});
