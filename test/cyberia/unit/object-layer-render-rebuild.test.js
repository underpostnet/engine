import { describe, it, expect, beforeEach, vi } from 'vitest';

// A rebuild reads the stored render frames of the definition, builds the render and publishes.
const store = vi.hoisted(() => ({ renderFrames: new Map() }));
vi.mock('../../../src/db/DataBaseProvider.js', () => ({
  DataBaseProviderService: {
    getModel: () => ({
      findOne: ({ objectLayerCid }) => ({ lean: async () => store.renderFrames.get(objectLayerCid) ?? null }),
      sourceOf: (stored) => ({ source: stored.frames }),
    }),
  },
}));
vi.mock('../../../src/api/atlas-sprite-sheet/atlas-sprite-sheet.store.js', () => ({
  AtlasSpriteSheetStore: {
    build: vi.fn(async ({ itemKey }) => ({
      render: { cid: `render-${itemKey}` },
      atlas: { fileId: `atlas-${itemKey}` },
    })),
  },
}));
vi.mock('../../../src/projects/cyberia/object-layer-catalog.js', () => ({
  findBoundDefinition: async () => null,
  writeItemDefinition: vi.fn(async ({ payload, rendered }) => ({ cid: 'written', data: payload.data, rendered })),
}));

const { ObjectLayerEngine } = await import('../../../src/projects/cyberia/object-layer.js');
const { AtlasSpriteSheetStore } = await import('../../../src/api/atlas-sprite-sheet/atlas-sprite-sheet.store.js');
const { writeItemDefinition } = await import('../../../src/projects/cyberia/object-layer-catalog.js');

const definition = (data) => ({ cid: 'bound', data, toObject: () => ({ data: structuredClone(data) }) });

describe('item render rebuild', () => {
  beforeEach(() => {
    store.renderFrames.clear();
    AtlasSpriteSheetStore.build.mockClear();
    writeItemDefinition.mockClear();
  });

  it('builds from the stored render source and publishes the revised payload under the new render', async () => {
    store.renderFrames.set('bound', { frames: 'down_idle' });
    const objectLayer = definition({ item: { id: 'hatchet', type: 'weapon' }, stats: { effect: 5 } });
    const rebuilt = await ObjectLayerEngine.rebuildItemRender({
      models: {},
      objectLayer,
      upscaleFactor: 20,
      revise: (payload) => {
        payload.data.stats.effect = 9;
      },
      options: { host: 'h', path: '/' },
    });

    expect(AtlasSpriteSheetStore.build.mock.calls[0][0]).toMatchObject({
      itemKey: 'hatchet',
      objectLayerRenderFrames: { source: 'down_idle' },
      upscaleFactor: 20,
      maxAtlasDim: null,
    });
    expect(writeItemDefinition.mock.calls[0][0]).toMatchObject({
      renderFrames: { source: 'down_idle' },
      rendered: { render: { cid: 'render-hatchet' } },
    });
    expect(rebuilt.definition.data.stats.effect).toBe(9);
    expect(rebuilt.atlas).toEqual({ fileId: 'atlas-hatchet' });
    expect(objectLayer.data.stats.effect).toBe(5);
  });

  it('builds and publishes nothing for a definition without render frames', async () => {
    const objectLayer = definition({ item: { id: 'hatchet', type: 'weapon' } });
    expect(await ObjectLayerEngine.rebuildItemRender({ models: {}, objectLayer, options: {} })).toBeNull();
    expect(AtlasSpriteSheetStore.build).not.toHaveBeenCalled();
    expect(writeItemDefinition).not.toHaveBeenCalled();
  });
});
