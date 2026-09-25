import { describe, it, expect, beforeEach, vi } from 'vitest';
import sharp from 'sharp';

// A map preview is cached by its layout and by the idle preview File each label resolves to now.
const store = vi.hoisted(() => ({ bindings: {}, previews: {}, files: {} }));
vi.mock('../../../src/db/DataBaseProvider.js', () => ({
  DataBaseProviderService: {
    getModel: () => ({
      find: ({ objectLayerCid }) => ({
        lean: async () =>
          objectLayerCid.$in.map((cid) => ({ objectLayerCid: cid, idlePreviewFileId: store.previews[cid] ?? null })),
      }),
    }),
  },
}));
vi.mock('../../../src/projects/cyberia/object-layer-catalog.js', () => ({
  catalogMounted: () => true,
  catalogModels: () => ({
    CyberiaItemCatalog: {
      resolve: async (itemIds) =>
        new Map(itemIds.filter((itemId) => store.bindings[itemId]).map((itemId) => [itemId, store.bindings[itemId]])),
    },
  }),
}));
vi.mock('../../../src/api/atlas-sprite-sheet/atlas-sprite-sheet.service.js', () => ({
  renderFileBytes: async (fileId) => store.files[fileId] ?? null,
}));

const { cacheMapPreview } = await import('../../../src/projects/cyberia/map-preview-generator.js');

const solid = (background) =>
  sharp({ create: { width: 4, height: 4, channels: 4, background } })
    .png()
    .toBuffer();
const topLeft = async (png) => [...(await sharp(png).raw().toBuffer()).subarray(0, 4)];
const map = {
  code: 'forest-1',
  gridX: 2,
  gridY: 2,
  entities: [{ initCellX: 0, initCellY: 0, dimX: 2, dimY: 2, objectLayerItemIds: ['hatchet'] }],
};

describe('map previews', () => {
  beforeEach(async () => {
    store.files['f-red'] = await solid('#ff0000');
    store.files['f-blue'] = await solid('#0000ff');
    store.bindings.hatchet = 'cid-hatchet';
    store.previews['cid-hatchet'] = 'f-red';
  });

  it('draws each entity with the idle preview its label resolves to', async () => {
    expect(await topLeft(await cacheMapPreview('first', map))).toEqual([255, 0, 0, 255]);
  });

  it('reuses an unchanged preview, and renders again when a label resolves to another picture', async () => {
    const first = await cacheMapPreview('second', map);
    expect(await cacheMapPreview('second', map)).toBe(first);

    store.previews['cid-hatchet'] = 'f-blue';
    expect(await topLeft(await cacheMapPreview('second', map))).toEqual([0, 0, 255, 255]);
  });
});
