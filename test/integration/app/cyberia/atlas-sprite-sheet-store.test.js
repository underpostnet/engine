import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';

const models = {};

vi.mock('../../../../src/db/DataBaseProvider.js', () => ({
  DataBaseProviderService: { getModel: (name) => models[name] },
}));
vi.mock('../../../../src/api/ipfs/ipfs.service.js', () => ({ createPinRecord: async () => ({}) }));
vi.mock('../../../../src/projects/cyberia/ipfs-client.js', () => ({
  IpfsClient: { addBufferToIpfs: async () => null, addJsonToIpfs: async () => null },
}));

const { AtlasSpriteSheetStore } = await import('../../../../src/projects/cyberia/atlas-sprite-sheet-store.js');

const colors = [
  [255, 0, 0, 255],
  [0, 255, 0, 255],
];
const frame = [
  [0, 1],
  [null, 0],
];
const renderFrames = (frames) => ({ colors, frame_duration: 250, frames });
const twoFrames = renderFrames({ down_idle: [frame], up_idle: [frame] });

/** Minimal File collection: the store only upserts, reads and bulk-deletes by _id. */
class FakeFiles {
  constructor() {
    this.docs = new Map();
  }
  async updateOne({ _id }, { $setOnInsert }) {
    const key = String(_id);
    if (!this.docs.has(key)) this.docs.set(key, { ...$setOnInsert });
    return { acknowledged: true };
  }
  async deleteMany({ _id: { $in } }) {
    for (const id of $in) this.docs.delete(String(id));
    return { deletedCount: $in.length };
  }
  async findById(id) {
    return this.docs.get(String(id)) ?? null;
  }
  get size() {
    return this.docs.size;
  }
  has(id) {
    return this.docs.has(String(id));
  }
}

/** Minimal AtlasSpriteSheet collection keyed by metadata.itemKey. */
class FakeAtlases {
  constructor() {
    this.doc = null;
  }
  findOne() {
    return Promise.resolve(this.doc);
  }
  async updateOne(_filter, { $set }) {
    Object.assign(this.doc, $set);
    return { acknowledged: true };
  }
  seed(fields) {
    this.doc = {
      _id: new Types.ObjectId(),
      ...fields,
      set(next) {
        Object.assign(this, next);
      },
      save: async () => this.doc,
    };
    return this.doc;
  }
}

const newAtlasModel = (files) => {
  const atlases = new FakeAtlases();
  function AtlasSpriteSheet(fields) {
    Object.assign(this, fields);
    this.set = (next) => Object.assign(this, next);
    this.save = async () => {
      atlases.doc = this;
      return this;
    };
  }
  AtlasSpriteSheet.findOne = () => atlases.findOne();
  AtlasSpriteSheet.updateOne = (filter, update) => atlases.updateOne(filter, update);
  AtlasSpriteSheet.store = atlases;
  models.AtlasSpriteSheet = AtlasSpriteSheet;
  models.File = files;
  return AtlasSpriteSheet;
};

describe('atlas sprite sheet store', () => {
  let files;

  beforeEach(() => {
    files = new FakeFiles();
    newAtlasModel(files);
  });

  it('stores both renders, the idle still, and describes the minified one', async () => {
    const { atlasDoc } = await AtlasSpriteSheetStore.persist({
      itemKey: 'hatchet',
      objectLayerRenderFrames: twoFrames,
      upscaleFactor: 20,
    });

    expect(atlasDoc.metadata.cellPixelDim).toBe(1);
    expect(atlasDoc.metadata.upscaleFactor).toBe(20);
    const ids = [atlasDoc.fileId, atlasDoc.minifyFileId, atlasDoc.idlePreviewFileId].map(String);
    expect(new Set(ids).size).toBe(3);
    expect(files.size).toBe(3);
    for (const id of ids) expect(files.has(id)).toBe(true);
  });

  it('leaves the same item untouched when persist reruns on unchanged frames', async () => {
    const renders = (doc) => [doc.fileId, doc.minifyFileId, doc.idlePreviewFileId].map(String);
    const first = await AtlasSpriteSheetStore.persist({ itemKey: 'hatchet', objectLayerRenderFrames: twoFrames });

    const second = await AtlasSpriteSheetStore.persist({ itemKey: 'hatchet', objectLayerRenderFrames: twoFrames });

    expect(renders(second.atlasDoc)).toEqual(renders(first.atlasDoc));
    expect(files.size).toBe(3);
  });

  it('deletes the File it replaces when the upscale factor changes', async () => {
    const first = await AtlasSpriteSheetStore.persist({
      itemKey: 'hatchet',
      objectLayerRenderFrames: twoFrames,
      upscaleFactor: 4,
    });
    const firstFileId = String(first.atlasDoc.fileId);
    const firstMinifyFileId = String(first.atlasDoc.minifyFileId);
    const firstIdlePreviewFileId = String(first.atlasDoc.idlePreviewFileId);

    const second = await AtlasSpriteSheetStore.persist({
      itemKey: 'hatchet',
      objectLayerRenderFrames: twoFrames,
      upscaleFactor: 8,
    });

    expect(String(second.atlasDoc.fileId)).not.toBe(firstFileId);
    expect(files.has(firstFileId)).toBe(false);
    // The minified render does not move with the upscale factor; the still, cut from the
    // human-resolution render, does.
    expect(String(second.atlasDoc.minifyFileId)).toBe(firstMinifyFileId);
    expect(String(second.atlasDoc.idlePreviewFileId)).not.toBe(firstIdlePreviewFileId);
    expect(files.has(firstIdlePreviewFileId)).toBe(false);
    expect(files.size).toBe(3);
  });

  it('cuts the still from the down-idle frame, and from any frame when there is none', async () => {
    const { atlasDoc } = await AtlasSpriteSheetStore.persist({
      itemKey: 'hatchet',
      objectLayerRenderFrames: twoFrames,
    });
    expect(atlasDoc.idlePreviewFileId).toBeTruthy();

    const onlyUp = renderFrames({ up_idle: [frame] });
    const { atlasDoc: upOnly } = await AtlasSpriteSheetStore.persist({
      itemKey: 'hatchet',
      objectLayerRenderFrames: onlyUp,
    });
    expect(upOnly.idlePreviewFileId).toBeTruthy();
  });

  it('fills a missing still from the render the atlas already holds, then is a no-op', async () => {
    const atlases = models.AtlasSpriteSheet.store;
    await AtlasSpriteSheetStore.persist({ itemKey: 'hatchet', objectLayerRenderFrames: twoFrames });
    const expected = String(atlases.doc.idlePreviewFileId);
    // An atlas written before the still existed: the field is empty and the File is gone.
    await models.AtlasSpriteSheet.updateOne({}, { $set: { idlePreviewFileId: null } });
    files.docs.delete(expected);

    const filled = await AtlasSpriteSheetStore.syncIdlePreview({ itemKey: 'hatchet' });
    expect(filled.status).toBe('updated');
    expect(String(atlases.doc.idlePreviewFileId)).toBe(expected);
    expect(files.has(expected)).toBe(true);

    const again = await AtlasSpriteSheetStore.syncIdlePreview({ itemKey: 'hatchet' });
    expect(again.status).toBe('unchanged');
    expect(files.size).toBe(3);
  });

  it('reports a missing atlas or render instead of inventing a still', async () => {
    expect((await AtlasSpriteSheetStore.syncIdlePreview({ itemKey: 'nothing' })).status).toBe('missing');
  });

  it('reports a missing atlas instead of creating one', async () => {
    const result = await AtlasSpriteSheetStore.syncMinifyRender({
      itemKey: 'ghost',
      objectLayerRenderFrames: twoFrames,
    });
    expect(result).toEqual({ status: 'missing' });
    expect(files.size).toBe(0);
  });

  it('fills a missing minified render and touches no other attribute', async () => {
    const atlases = models.AtlasSpriteSheet.store;
    await AtlasSpriteSheetStore.persist({ itemKey: 'hatchet', objectLayerRenderFrames: twoFrames });
    const fileIdBefore = atlases.doc.fileId;
    const metadataBefore = atlases.doc.metadata;

    await models.AtlasSpriteSheet.updateOne({}, { $set: { minifyFileId: null } });
    files.docs.delete(String(atlases.doc.minifyFileId));

    const result = await AtlasSpriteSheetStore.syncMinifyRender({
      itemKey: 'hatchet',
      objectLayerRenderFrames: twoFrames,
    });

    expect(result.status).toBe('updated');
    expect(atlases.doc.minifyFileId).toBeTruthy();
    expect(atlases.doc.fileId).toBe(fileIdBefore);
    expect(atlases.doc.metadata).toBe(metadataBefore);
  });

  it('is a no-op when the minified render already matches', async () => {
    const atlases = models.AtlasSpriteSheet.store;
    await AtlasSpriteSheetStore.persist({ itemKey: 'hatchet', objectLayerRenderFrames: twoFrames });
    const before = atlases.doc.minifyFileId;

    const result = await AtlasSpriteSheetStore.syncMinifyRender({
      itemKey: 'hatchet',
      objectLayerRenderFrames: twoFrames,
    });

    expect(result.status).toBe('unchanged');
    expect(String(atlases.doc.minifyFileId)).toBe(String(before));
    expect(files.size).toBe(3);
  });

  it('refuses to write when the render frames moved the atlas layout', async () => {
    const atlases = models.AtlasSpriteSheet.store;
    await AtlasSpriteSheetStore.persist({ itemKey: 'hatchet', objectLayerRenderFrames: twoFrames });
    const before = atlases.doc.minifyFileId;

    const result = await AtlasSpriteSheetStore.syncMinifyRender({
      itemKey: 'hatchet',
      objectLayerRenderFrames: renderFrames({ down_idle: [frame, frame, frame], up_idle: [frame] }),
    });

    expect(result).toEqual({ status: 'stale' });
    expect(String(atlases.doc.minifyFileId)).toBe(String(before));
  });
});

/**
 * Multi-document collections, because a drop is about more than one item. Supports the shapes the
 * store queries with: `$or`, `$in`, `$regex` and the `metadata.itemKey` dot path.
 */
const fakeCollection = (docs) => {
  const read = (doc, path) => path.split('.').reduce((value, part) => value?.[part], doc);
  const matches = (doc, filter) => {
    if (filter.$or) return filter.$or.some((clause) => matches(doc, clause));
    return Object.entries(filter).every(([field, condition]) => {
      const value = read(doc, field);
      if (condition && typeof condition === 'object' && '$in' in condition)
        return value !== undefined && value !== null && condition.$in.map(String).includes(String(value));
      if (condition && typeof condition === 'object' && '$regex' in condition)
        return typeof value === 'string' && condition.$regex.test(value);
      return String(value) === String(condition);
    });
  };
  return {
    get docs() {
      return docs;
    },
    find(filter) {
      return { lean: async () => docs.filter((doc) => matches(doc, filter)) };
    },
    async deleteMany(filter = {}) {
      const removing = new Set(docs.filter((doc) => matches(doc, filter)).map((doc) => String(doc._id)));
      const before = docs.length;
      docs = docs.filter((doc) => !removing.has(String(doc._id)));
      return { deletedCount: before - docs.length };
    },
  };
};

const atlasDoc = (itemKey, suffix) => ({
  _id: new Types.ObjectId(),
  cid: `cid-${itemKey}`,
  fileId: `${itemKey}-atlas-${suffix}`,
  minifyFileId: `${itemKey}-minify-${suffix}`,
  idlePreviewFileId: `${itemKey}-idle-${suffix}`,
  metadata: { itemKey },
});

const renderFile = (id, itemKey, role) => ({ _id: id, name: `${itemKey}-${role}.png` });

describe('purging an atlas', () => {
  let atlases;
  let files;

  beforeEach(() => {
    atlases = fakeCollection([atlasDoc('hatchet', 1), atlasDoc('sword', 1)]);
    files = fakeCollection([
      renderFile('hatchet-atlas-1', 'hatchet', 'atlas'),
      renderFile('hatchet-minify-1', 'hatchet', 'minify'),
      renderFile('hatchet-idle-1', 'hatchet', 'idle'),
      renderFile('sword-atlas-1', 'sword', 'atlas'),
      renderFile('sword-minify-1', 'sword', 'minify'),
      renderFile('sword-idle-1', 'sword', 'idle'),
    ]);
    models.AtlasSpriteSheet = atlases;
    models.File = files;
  });

  it('takes every render of the item, not only the human-resolution one', async () => {
    // Regression: the CLI drop named `fileId` alone, so every minified render the client
    // downloads stayed in the File collection with nothing left pointing at it.
    const result = await AtlasSpriteSheetStore.purge({ itemKeys: ['hatchet'] });

    expect(result).toEqual({ atlases: 1, files: 3, cids: ['cid-hatchet'] });
    expect(files.docs.map((doc) => doc._id)).toEqual(['sword-atlas-1', 'sword-minify-1', 'sword-idle-1']);
    expect(atlases.docs.map((doc) => doc.metadata.itemKey)).toEqual(['sword']);
  });

  it('drops an atlas selected by its document id as readily as by its item key', async () => {
    const linked = atlases.docs.find((doc) => doc.metadata.itemKey === 'sword');

    const result = await AtlasSpriteSheetStore.purge({ atlasIds: [linked._id] });

    expect(result.atlases).toBe(1);
    expect(result.files).toBe(3);
    expect(atlases.docs).toHaveLength(1);
  });

  it('empties the collection when asked for all of it', async () => {
    const result = await AtlasSpriteSheetStore.purge({ all: true });

    expect(result.atlases).toBe(2);
    expect(result.files).toBe(6);
    expect(files.docs).toHaveLength(0);
  });

  it('deletes nothing when no selector is given', async () => {
    expect(await AtlasSpriteSheetStore.purge({})).toEqual({ atlases: 0, files: 0, cids: [] });
    expect(atlases.docs).toHaveLength(2);
    expect(files.docs).toHaveLength(6);
  });

  it('reports zeros on a rerun instead of failing', async () => {
    await AtlasSpriteSheetStore.purge({ itemKeys: ['hatchet'] });
    expect(await AtlasSpriteSheetStore.purge({ itemKeys: ['hatchet'] })).toEqual({
      atlases: 0,
      files: 0,
      cids: [],
    });
  });

  it('keeps a render a second atlas of the same item still points at', async () => {
    atlases.docs.push({ ...atlasDoc('hatchet', 1), _id: new Types.ObjectId() });
    const first = atlases.docs.find((doc) => doc.metadata.itemKey === 'hatchet');

    const result = await AtlasSpriteSheetStore.purge({ atlasIds: [first._id] });

    expect(result.files).toBe(0);
    expect(files.docs.map((doc) => doc._id)).toContain('hatchet-minify-1');
  });
});

describe('pruning renders left behind by an earlier drop', () => {
  it('removes the renders no atlas points at and keeps the ones in use', async () => {
    const atlases = fakeCollection([atlasDoc('sword', 1)]);
    const files = fakeCollection([
      renderFile('hatchet-minify-1', 'hatchet', 'minify'),
      renderFile('hatchet-idle-1', 'hatchet', 'idle'),
      renderFile('sword-atlas-1', 'sword', 'atlas'),
      renderFile('sword-minify-1', 'sword', 'minify'),
      renderFile('sword-idle-1', 'sword', 'idle'),
      { _id: 'thumbnail-1', name: 'map-thumbnail.png' },
    ]);
    models.AtlasSpriteSheet = atlases;
    models.File = files;

    const removed = await AtlasSpriteSheetStore.pruneOrphanRenders({});

    expect(removed).toBe(2);
    expect(files.docs.map((doc) => doc._id)).toEqual([
      'sword-atlas-1',
      'sword-minify-1',
      'sword-idle-1',
      'thumbnail-1',
    ]);
  });

  it('is a no-op on a collection that leaked nothing', async () => {
    models.AtlasSpriteSheet = fakeCollection([atlasDoc('sword', 1)]);
    models.File = fakeCollection([
      renderFile('sword-atlas-1', 'sword', 'atlas'),
      renderFile('sword-minify-1', 'sword', 'minify'),
      renderFile('sword-idle-1', 'sword', 'idle'),
    ]);

    expect(await AtlasSpriteSheetStore.pruneOrphanRenders({})).toBe(0);
    expect(models.File.docs).toHaveLength(3);
  });
});
