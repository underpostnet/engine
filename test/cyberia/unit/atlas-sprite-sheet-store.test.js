import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';
import sharp from 'sharp';
import {
  canonicalJsonBytes,
  payloadCid,
  renderContractOf,
} from '../../../src/api/object-layer/object-layer.identity.js';

const models = {};
const ipfs = vi.hoisted(() => ({ addToIpfs: async () => null }));

vi.mock('../../../src/db/DataBaseProvider.js', () => ({
  DataBaseProviderService: { getModel: (name) => models[name] },
}));
vi.mock('../../../src/api/ipfs/ipfs.service.js', () => ({ createPinRecord: async () => ({}) }));
vi.mock('../../../src/api/ipfs/ipfs.client.js', () => ({
  IpfsClient: { addToIpfs: (...args) => ipfs.addToIpfs(...args) },
}));

const { AtlasSpriteSheetStore } = await import('../../../src/api/atlas-sprite-sheet/atlas-sprite-sheet.store.js');
const { CacheService } = await import('../../../src/server/storage/cache.js');
const { objectLayerCache } = await import('../../../src/api/object-layer/object-layer.publication.js');

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

/**
 * In-memory Mongoose collection with the query shapes the store and the File registry use:
 * dot paths, `$in`, `$ne`, `$or`, `$regex`, `$set`, an upserting `$setOnInsert` and an upserting
 * `findOneAndUpdate`.
 */
const fakeModel = (seed = []) => {
  let docs = [...seed];
  const read = (doc, path) => path.split('.').reduce((value, part) => value?.[part], doc);
  const matches = (doc, filter) =>
    Object.entries(filter).every(([field, condition]) => {
      if (field === '$or') return condition.some((clause) => matches(doc, clause));
      const value = read(doc, field);
      if (condition && typeof condition === 'object' && !(condition instanceof Types.ObjectId)) {
        if ('$in' in condition) return value != null && condition.$in.map(String).includes(String(value));
        if ('$ne' in condition) return (value ?? null) !== condition.$ne;
        if ('$regex' in condition) return typeof value === 'string' && condition.$regex.test(value);
      }
      return String(value) === String(condition);
    });
  const lean = (doc) => ({ lean: async () => (doc ? { ...doc } : null), then: (resolve) => resolve(doc ?? null) });

  const Model = {};
  Object.defineProperty(Model, 'docs', { get: () => docs });
  Object.assign(Model, {
    find: (filter = {}) => ({ lean: async () => docs.filter((doc) => matches(doc, filter)) }),
    findOne: (filter) => lean(docs.find((doc) => matches(doc, filter))),
    findById: async (id) => docs.find((doc) => String(doc._id) === String(id)) ?? null,
    findOneAndUpdate(filter, { $set }, { upsert } = {}) {
      let doc = docs.find((candidate) => matches(candidate, filter));
      if (!doc && upsert) docs.push((doc = { _id: new Types.ObjectId(), ...filter }));
      if (doc) Object.assign(doc, $set, { updatedAt: new Date() });
      return lean(doc);
    },
    async updateOne(filter, update, { upsert } = {}) {
      const doc = docs.find((candidate) => matches(candidate, filter));
      if (doc && update.$set) Object.assign(doc, update.$set);
      if (!doc && upsert) docs.push({ ...update.$setOnInsert });
      return { acknowledged: true };
    },
    async deleteMany(filter = {}) {
      const before = docs.length;
      docs = docs.filter((doc) => !matches(doc, filter));
      return { deletedCount: before - docs.length };
    },
  });
  return Model;
};

const HATCHET = `bafkrei${'a'.repeat(52)}`;
const HATCHET_STATS = `bafkrei${'b'.repeat(52)}`;
const fileIds = (doc) => [doc.fileId, doc.upscaleFileId, doc.idlePreviewFileId].map(String);

describe('building a render', () => {
  beforeEach(() => {
    models.File = fakeModel();
    ipfs.addToIpfs = async () => null;
  });

  it('stores the primary render, its derived renders, and metadata that describes the primary', async () => {
    const { atlas, render } = await AtlasSpriteSheetStore.build({
      itemKey: 'hatchet',
      objectLayerRenderFrames: twoFrames,
      upscaleFactor: 20,
    });

    const primary = (await models.File.findById(atlas.fileId)).data;
    const { width, height } = await sharp(primary).metadata();
    expect([width, height]).toEqual([atlas.metadata.atlasWidth, atlas.metadata.atlasHeight]);
    expect(atlas.metadata.cellPixelDim).toBe(1);
    expect(renderContractOf({ primary, metadata: atlas.metadata })).toEqual(render);

    expect(new Set(fileIds(atlas)).size).toBe(3);
    expect(models.File.docs).toHaveLength(3);
    expect((await sharp((await models.File.findById(atlas.upscaleFileId)).data).metadata()).width).toBe(width * 20);
  });

  it('stores no upscaled render when the factor repeats the primary render', async () => {
    const { atlas } = await AtlasSpriteSheetStore.build({
      itemKey: 'hatchet',
      objectLayerRenderFrames: twoFrames,
      upscaleFactor: 1,
    });

    expect(atlas.upscaleFileId).toBeNull();
    expect(atlas.idlePreviewFileId).toBeTruthy();
  });

  it('refuses a pin under another CID than the render contract names', async () => {
    ipfs.addToIpfs = async () => ({ cid: 'bafkreiother' });

    await expect(
      AtlasSpriteSheetStore.build({ itemKey: 'hatchet', objectLayerRenderFrames: twoFrames }),
    ).rejects.toThrow('render contract');
  });

  it('pins the exact bytes the contract names: the primary render and the canonical bytes of its metadata', async () => {
    const pinned = [];
    ipfs.addToIpfs = async (bytes, name, mfsPath) => {
      pinned.push({ bytes, mfsPath });
      return { cid: payloadCid(bytes) };
    };

    const { atlas, render } = await AtlasSpriteSheetStore.build({
      itemKey: 'hatchet',
      objectLayerRenderFrames: twoFrames,
    });

    expect(pinned.map(({ mfsPath }) => mfsPath)).toEqual([
      '/object-layer/hatchet/hatchet_render.png',
      '/object-layer/hatchet/hatchet_render_metadata.json',
    ]);
    expect(pinned[1].bytes.equals(canonicalJsonBytes(atlas.metadata))).toBe(true);
    expect(pinned.map(({ bytes }) => payloadCid(bytes))).toEqual([render.cid, render.metadataCid]);
  });
});

describe('materializing the atlas of a definition', () => {
  beforeEach(() => {
    models.File = fakeModel();
    models.AtlasSpriteSheet = fakeModel();
  });

  it('records one atlas under the definition cid, and no render CID of its own', async () => {
    const { atlas } = await AtlasSpriteSheetStore.build({ itemKey: 'hatchet', objectLayerRenderFrames: twoFrames });
    const stored = await AtlasSpriteSheetStore.materialize({ objectLayerCid: HATCHET, atlas });

    expect(stored).toMatchObject({ objectLayerCid: HATCHET, fileId: atlas.fileId, metadata: atlas.metadata });
    for (const field of ['cid', 'metadataCid', 'renderCid', 'atlasCid']) expect(stored).not.toHaveProperty(field);
    expect(models.AtlasSpriteSheet.docs).toHaveLength(1);
  });

  it('gives two definitions of one render their own atlas over the same Files', async () => {
    const { atlas } = await AtlasSpriteSheetStore.build({ itemKey: 'hatchet', objectLayerRenderFrames: twoFrames });
    await AtlasSpriteSheetStore.materialize({ objectLayerCid: HATCHET, atlas });
    await AtlasSpriteSheetStore.materialize({ objectLayerCid: HATCHET_STATS, atlas });

    expect(models.AtlasSpriteSheet.docs.map((doc) => doc.objectLayerCid)).toEqual([HATCHET, HATCHET_STATS]);
    expect(models.File.docs).toHaveLength(3);
  });

  it('leaves an atlas whose fields equal a rebuild of the same render as it is', async () => {
    const { atlas } = await AtlasSpriteSheetStore.build({ itemKey: 'hatchet', objectLayerRenderFrames: twoFrames });
    await AtlasSpriteSheetStore.materialize({ objectLayerCid: HATCHET, atlas });
    const [stored] = models.AtlasSpriteSheet.docs;
    stored.updatedAt = 'first write';
    const invalidate = vi.spyOn(CacheService, 'invalidate');

    const rebuilt = await AtlasSpriteSheetStore.build({ itemKey: 'hatchet', objectLayerRenderFrames: twoFrames });
    expect(rebuilt.atlas.metadata).not.toBe(atlas.metadata);
    await AtlasSpriteSheetStore.materialize({ objectLayerCid: HATCHET, atlas: rebuilt.atlas });

    expect(models.AtlasSpriteSheet.docs).toHaveLength(1);
    expect(models.AtlasSpriteSheet.docs[0].updatedAt).toBe('first write');
    expect(invalidate).not.toHaveBeenCalled();
    invalidate.mockRestore();
  });

  it('replaces the atlas of a definition, and deletes the Files only the replaced one held', async () => {
    const first = await AtlasSpriteSheetStore.build({ itemKey: 'hatchet', objectLayerRenderFrames: twoFrames });
    await AtlasSpriteSheetStore.materialize({ objectLayerCid: HATCHET, atlas: first.atlas });
    const other = await AtlasSpriteSheetStore.build({
      itemKey: 'hatchet',
      objectLayerRenderFrames: renderFrames({ down_idle: [frame, frame], up_idle: [frame] }),
    });

    await AtlasSpriteSheetStore.materialize({ objectLayerCid: HATCHET, atlas: other.atlas });

    const [stored] = models.AtlasSpriteSheet.docs;
    expect(models.AtlasSpriteSheet.docs).toHaveLength(1);
    expect(fileIds(stored)).toEqual(fileIds(other.atlas));
    expect(models.File.docs.map((doc) => String(doc._id)).sort()).toEqual([...new Set(fileIds(other.atlas))].sort());
  });
});

describe('the label cache', () => {
  beforeEach(() => {
    models.File = fakeModel();
    models.AtlasSpriteSheet = fakeModel();
  });

  it('is invalidated by every write that changes what a label resolves to', async () => {
    const invalidate = vi.spyOn(CacheService, 'invalidate');
    const options = { host: 'cyberia.test', path: '/' };
    const namespaces = () => invalidate.mock.calls.map(([namespace]) => namespace.prefix);

    const { atlas } = await AtlasSpriteSheetStore.build({
      itemKey: 'hatchet',
      objectLayerRenderFrames: twoFrames,
      options,
    });
    await AtlasSpriteSheetStore.materialize({ objectLayerCid: HATCHET, atlas, options });
    await models.AtlasSpriteSheet.updateOne({ objectLayerCid: HATCHET }, { $set: { idlePreviewFileId: null } });
    await AtlasSpriteSheetStore.syncDerivedRenders({ objectLayerCid: HATCHET, options });
    await AtlasSpriteSheetStore.purge({ objectLayerCids: [HATCHET], options });

    expect(namespaces()).toEqual(Array(3).fill(objectLayerCache(options).prefix));
    invalidate.mockRestore();
  });
});

describe('syncing the derived renders of an atlas', () => {
  beforeEach(() => {
    models.File = fakeModel();
    models.AtlasSpriteSheet = fakeModel();
  });

  it('fills a missing derived render and touches neither the primary render nor its metadata', async () => {
    const { atlas } = await AtlasSpriteSheetStore.build({ itemKey: 'hatchet', objectLayerRenderFrames: twoFrames });
    await AtlasSpriteSheetStore.materialize({ objectLayerCid: HATCHET, atlas });
    const [stored] = models.AtlasSpriteSheet.docs;
    const expected = {
      upscaleFileId: String(stored.upscaleFileId),
      idlePreviewFileId: String(stored.idlePreviewFileId),
    };
    const { fileId, metadata } = stored;
    await models.AtlasSpriteSheet.updateOne(
      { objectLayerCid: HATCHET },
      { $set: { upscaleFileId: null, idlePreviewFileId: null } },
    );
    await models.File.deleteMany({ _id: { $in: Object.values(expected) } });

    expect((await AtlasSpriteSheetStore.syncDerivedRenders({ objectLayerCid: HATCHET })).status).toBe('updated');
    expect({
      upscaleFileId: String(stored.upscaleFileId),
      idlePreviewFileId: String(stored.idlePreviewFileId),
    }).toEqual(expected);
    expect(stored.fileId).toBe(fileId);
    expect(stored.metadata).toBe(metadata);
    expect(models.File.docs).toHaveLength(3);

    expect((await AtlasSpriteSheetStore.syncDerivedRenders({ objectLayerCid: HATCHET })).status).toBe('unchanged');
  });

  it('reports a missing atlas instead of inventing a render', async () => {
    expect(await AtlasSpriteSheetStore.syncDerivedRenders({ objectLayerCid: HATCHET })).toEqual({
      status: 'missing',
    });
    expect(await AtlasSpriteSheetStore.syncDerivedRenders({ objectLayerCid: null })).toEqual({ status: 'missing' });
    expect(models.File.docs).toHaveLength(0);
  });
});

const atlasDoc = (itemKey, suffix) => ({
  _id: new Types.ObjectId(),
  objectLayerCid: `cid-${itemKey}`,
  fileId: `${itemKey}-primary-${suffix}`,
  upscaleFileId: `${itemKey}-upscale-${suffix}`,
  idlePreviewFileId: `${itemKey}-idle-${suffix}`,
  metadata: { itemKey },
});

const renderFile = (id, itemKey, role) => ({ _id: id, name: `${itemKey}-${role}.png` });

const renderFiles = (itemKey) => [
  renderFile(`${itemKey}-primary-1`, itemKey, 'primary'),
  renderFile(`${itemKey}-upscale-1`, itemKey, 'upscale'),
  renderFile(`${itemKey}-idle-1`, itemKey, 'idle'),
];

describe('purging an atlas', () => {
  beforeEach(() => {
    models.AtlasSpriteSheet = fakeModel([atlasDoc('hatchet', 1), atlasDoc('sword', 1)]);
    models.File = fakeModel([...renderFiles('hatchet'), ...renderFiles('sword')]);
  });

  it('takes the primary render and every render derived from it', async () => {
    expect(await AtlasSpriteSheetStore.purge({ objectLayerCids: ['cid-hatchet'] })).toEqual({ atlases: 1, files: 3 });
    expect(models.File.docs.map((doc) => doc._id)).toEqual(['sword-primary-1', 'sword-upscale-1', 'sword-idle-1']);
    expect(models.AtlasSpriteSheet.docs.map((doc) => doc.metadata.itemKey)).toEqual(['sword']);
  });

  it('empties the collection when asked for all of it', async () => {
    expect(await AtlasSpriteSheetStore.purge({ all: true })).toEqual({ atlases: 2, files: 6 });
    expect(models.File.docs).toHaveLength(0);
  });

  it('deletes nothing when no selector is given', async () => {
    expect(await AtlasSpriteSheetStore.purge({})).toEqual({ atlases: 0, files: 0 });
    expect(models.AtlasSpriteSheet.docs).toHaveLength(2);
    expect(models.File.docs).toHaveLength(6);
  });

  it('reports zeros on a rerun instead of failing', async () => {
    await AtlasSpriteSheetStore.purge({ objectLayerCids: ['cid-hatchet'] });
    expect(await AtlasSpriteSheetStore.purge({ objectLayerCids: ['cid-hatchet'] })).toEqual({ atlases: 0, files: 0 });
  });

  it('keeps a render the atlas of another definition still points at', async () => {
    models.AtlasSpriteSheet.docs.push({ ...atlasDoc('hatchet', 1), objectLayerCid: 'cid-hatchet-stats' });

    expect((await AtlasSpriteSheetStore.purge({ objectLayerCids: ['cid-hatchet'] })).files).toBe(0);
    expect(models.File.docs.map((doc) => doc._id)).toContain('hatchet-upscale-1');
  });
});

describe('pruning renders no atlas points at', () => {
  it('removes the renders no atlas holds and keeps the ones in use', async () => {
    models.AtlasSpriteSheet = fakeModel([atlasDoc('sword', 1)]);
    models.File = fakeModel([
      ...renderFiles('hatchet'),
      ...renderFiles('sword'),
      { _id: 'thumbnail-1', name: 'map-thumbnail.png' },
    ]);

    expect(await AtlasSpriteSheetStore.pruneOrphanRenders({})).toBe(3);
    expect(models.File.docs.map((doc) => doc._id)).toEqual([
      'sword-primary-1',
      'sword-upscale-1',
      'sword-idle-1',
      'thumbnail-1',
    ]);
  });

  it('is a no-op on a collection that holds no orphan', async () => {
    models.AtlasSpriteSheet = fakeModel([atlasDoc('sword', 1)]);
    models.File = fakeModel(renderFiles('sword'));

    expect(await AtlasSpriteSheetStore.pruneOrphanRenders({})).toBe(0);
    expect(models.File.docs).toHaveLength(3);
  });
});
