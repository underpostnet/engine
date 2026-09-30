import { describe, it, expect, beforeEach, vi } from 'vitest';
import sharp from 'sharp';

// A map preview draws the idle preview File each label resolves to now, and a refresh stores it.
const store = vi.hoisted(() => {
  const state = { bindings: {}, previews: {}, files: {}, maps: [], fileDocs: new Map(), seq: 0 };
  class File {
    constructor(doc) {
      Object.assign(this, doc);
    }
    async save() {
      this._id = `file-${++state.seq}`;
      state.fileDocs.set(this._id, this);
      return this;
    }
    static async deleteOne({ _id }) {
      state.fileDocs.delete(_id);
    }
    static async exists({ _id, md5 }) {
      return state.fileDocs.get(_id)?.md5 === md5;
    }
  }
  const matches = (map, condition) => Object.entries(condition).every(([key, value]) => (map[key] ?? null) === value);
  state.models = {
    AtlasSpriteSheet: {
      find: ({ objectLayerCid }) => ({
        lean: async () =>
          objectLayerCid.$in.map((cid) => ({ objectLayerCid: cid, idlePreviewFileId: state.previews[cid] ?? null })),
      }),
    },
    CyberiaMap: {
      updateOne: vi.fn(async ({ _id, preview }, update) => {
        const map = state.maps.find((stored) => matches(stored, { _id, preview }));
        if (!map) return { matchedCount: 0 };
        if (update.$set) Object.assign(map, update.$set);
        if (update.$unset) delete map.preview;
        return { matchedCount: 1 };
      }),
      exists: async ({ $or }) => state.maps.some((map) => $or.some((condition) => matches(map, condition))),
      find: (filter) => {
        const labels = filter['entities.objectLayerItemIds']?.$in;
        const places = (map) =>
          (map.entities ?? []).some((entity) => entity.objectLayerItemIds.some((id) => labels.includes(id)));
        const found = state.maps.filter((map) => !labels || places(map)).map((map) => ({ ...map }));
        return { select: () => ({ lean: async () => found }) };
      },
    },
    File,
  };
  state.invalidate = vi.fn();
  return state;
});
vi.mock('../../../src/db/DataBaseProvider.js', () => ({
  DataBaseProviderService: { getModel: (name) => store.models[name] },
}));
vi.mock('../../../src/server/storage/cache.js', () => ({ CacheService: { invalidate: store.invalidate } }));
vi.mock('../../../src/api/cyberia-map/cyberia-map.service.js', () => ({ mapCache: () => 'cyberia-map' }));
vi.mock('../../../src/api/file/file.service.js', () => ({
  FileFactory: { create: (data, name) => ({ data, name, md5: `md5-of-${data.length}-${data[data.length - 20]}` }) },
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

const { renderMapPreviewPng, refreshMapPreview, refreshMapPreviews } =
  await import('../../../src/projects/cyberia/map-preview-generator.js');

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
const stored = (fields) => {
  const doc = { ...map, _id: 'map-1', preview: 'old-preview', ...fields };
  store.maps.push(doc);
  return { ...doc };
};

describe('map previews', () => {
  beforeEach(async () => {
    store.files['f-red'] = await solid('#ff0000');
    store.files['f-blue'] = await solid('#0000ff');
    store.bindings.hatchet = 'cid-hatchet';
    store.previews['cid-hatchet'] = 'f-red';
    store.maps = [];
    store.fileDocs = new Map([['old-preview', { _id: 'old-preview' }]]);
    store.invalidate.mockClear();
    store.models.CyberiaMap.updateOne.mockClear();
  });

  it('draws each entity with the idle preview its label resolves to', async () => {
    expect(await topLeft(await renderMapPreviewPng(map))).toEqual([255, 0, 0, 255]);
  });

  it('draws the new picture when a label resolves to another one', async () => {
    await renderMapPreviewPng(map);
    store.previews['cid-hatchet'] = 'f-blue';
    expect(await topLeft(await renderMapPreviewPng(map))).toEqual([0, 0, 255, 255]);
  });

  it('stores the new picture as the preview and deletes the File it replaced', async () => {
    const png = await refreshMapPreview(stored(), {});
    const [preview] = store.maps.map((doc) => doc.preview);
    expect(await topLeft(png)).toEqual([255, 0, 0, 255]);
    expect(store.fileDocs.get(preview).name).toBe('forest-1-preview.png');
    expect(store.fileDocs.has('old-preview')).toBe(false);
    expect(store.models.CyberiaMap.updateOne.mock.calls[0][2]).toEqual({ timestamps: false });
    expect(store.invalidate).toHaveBeenCalledWith('cyberia-map');
  });

  it('writes nothing when the stored preview already holds the picture', async () => {
    const read = stored();
    await refreshMapPreview(read, {});
    const [preview] = store.maps.map((doc) => doc.preview);
    store.models.CyberiaMap.updateOne.mockClear();
    expect(await refreshMapPreview({ ...read, preview }, {})).not.toBeNull();
    expect(store.maps[0].preview).toBe(preview);
    expect(store.models.CyberiaMap.updateOne).not.toHaveBeenCalled();
  });

  it('keeps a replaced File another map still names', async () => {
    store.maps.push({ _id: 'map-2', code: 'forest-2', thumbnail: 'old-preview' });
    await refreshMapPreview(stored(), {});
    expect(store.fileDocs.has('old-preview')).toBe(true);
  });

  it('leaves no preview on a map that draws nothing, and no File behind', async () => {
    store.bindings = {};
    expect(await refreshMapPreview(stored({ entities: [] }), {})).toBeNull();
    expect('preview' in store.maps[0]).toBe(false);
    expect([...store.fileDocs.keys()]).toEqual([]);
  });

  it('keeps the preview another write stored meanwhile, and deletes its own picture', async () => {
    const read = stored();
    store.maps[0].preview = 'editor-preview';
    expect(await refreshMapPreview(read, {})).toBeNull();
    expect(store.maps[0].preview).toBe('editor-preview');
    expect([...store.fileDocs.keys()]).toEqual(['old-preview']);
    expect(store.invalidate).not.toHaveBeenCalled();
  });

  it('draws the maps that place a written label, or every map, and goes on past a failure', async () => {
    stored();
    stored({ _id: 'map-2', code: 'forest-2', entities: [{ ...map.entities[0], objectLayerItemIds: ['sword'] }] });
    expect(await refreshMapPreviews({ itemIds: ['hatchet'], options: {} })).toEqual({ drawn: 1, empty: 0, failed: [] });

    store.previews['cid-hatchet'] = 'f-blue';
    store.models.CyberiaMap.updateOne.mockRejectedValueOnce(new Error('connection lost'));
    expect(await refreshMapPreviews({ itemIds: null, options: {} })).toEqual({
      drawn: 0,
      empty: 1,
      failed: ['forest-1'],
    });
  });
});
