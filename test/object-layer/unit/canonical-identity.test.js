import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  canonicalObjectLayer,
  isProfileRef,
  isStatRecord,
  profileRef,
  OBJECT_LAYER_SCHEMA_VERSION,
} from '../../../src/client/components/objectlayer-studio/ObjectLayerProtocol.js';
import {
  canonicalObjectLayerBytes,
  cidFromSha256Hex,
  computeObjectLayerCid,
  computeObjectLayerContentHash,
  isObjectLayerCid,
  objectLayerIdentity,
  sha256HexFromCid,
} from '../../../src/api/object-layer/object-layer.identity.js';
import { ObjectLayerModel, ObjectLayerSchema } from '../../../src/api/object-layer/object-layer.model.js';
import { Binary } from 'mongodb';
import {
  ObjectLayerRenderFramesModel,
  ObjectLayerRenderFramesSchema,
} from '../../../src/api/object-layer-render-frames/object-layer-render-frames.model.js';
import { sourceFromIndexedFrames } from '../../../src/client/components/objectlayer-studio/RenderSource.js';

const vectors = JSON.parse(readFileSync(new URL('../../support/object-layer-identity-vectors.json', import.meta.url)));
const profile = { id: 'cyberia', version: 2 };
const hatchet = (stats = { effect: 5 }, extra = {}) => ({
  profile,
  data: { item: { id: 'hatchet', type: 'weapon', description: 'A rusted hatchet', activable: true }, stats, ...extra },
});

describe('canonical Object Layer payload', () => {
  it('holds content only: profile, item, stats and render under a schema version', () => {
    const canonical = canonicalObjectLayer({
      _id: 'x',
      cid: 'self',
      contentHash: 'self',
      origin: 'cache',
      published: true,
      createdAt: new Date(),
      profile: { id: 'cyberia', version: 2, extra: true },
      data: {
        item: { id: 'hatchet', type: 'weapon' },
        stats: { effect: 5 },
        render: { cid: 'bafk-atlas' },
        ledger: { type: 'ERC1155', address: '0xabc', tokenId: '42' },
        owner: '0xdead',
      },
    });
    expect(canonical).toEqual({
      schemaVersion: OBJECT_LAYER_SCHEMA_VERSION,
      profile: { id: 'cyberia', version: 2 },
      data: {
        item: { id: 'hatchet', type: 'weapon', description: '', activable: false },
        stats: { effect: 5 },
        render: { cid: 'bafk-atlas', metadataCid: '' },
      },
    });
  });

  it('accepts an integer record as the mechanical block and nothing else', () => {
    expect(isStatRecord({ effect: 5, agility: -3 })).toBe(true);
    expect(isStatRecord({})).toBe(true);
    expect(isStatRecord({ effect: 0.5 })).toBe(false);
    expect(isStatRecord({ effect: Infinity })).toBe(false);
    expect(isStatRecord({ effect: '5' })).toBe(false);
    expect(isStatRecord([1])).toBe(false);
    expect(isStatRecord(null)).toBe(false);
  });

  it('names the profile that interprets the mechanical block', () => {
    expect(profileRef({ id: 'cyberia', version: 2, validateStats() {} })).toEqual({ id: 'cyberia', version: 2 });
    expect(isProfileRef({ id: 'cyberia', version: 2 })).toBe(true);
    expect(isProfileRef({ id: '', version: 2 })).toBe(false);
    expect(isProfileRef({ id: 'cyberia', version: 0 })).toBe(false);
    expect(isProfileRef({ id: 'cyberia', version: 1.5 })).toBe(false);
  });
});

describe('Object Layer identity', () => {
  it('reproduces every identity vector from the canonical bytes', () => {
    for (const vector of vectors.definitions) {
      expect(canonicalObjectLayerBytes(vector.canonical).toString('utf8')).toBe(vector.canonicalBytes);
      expect(objectLayerIdentity(vector.canonical)).toEqual({ contentHash: vector.contentHash, cid: vector.cid });
    }
    for (const anchor of vectors.anchors) {
      expect(cidFromSha256Hex(anchor.contentHash)).toBe(anchor.cid);
      expect(sha256HexFromCid(anchor.cid)).toBe(anchor.contentHash);
    }
  });

  it('gives the same identity to the same canonical content, whatever the key order', () => {
    const a = { profile, data: { item: { id: 'hatchet', type: 'weapon' }, stats: { effect: 5, range: 1 } } };
    const b = {
      data: { stats: { range: 1, effect: 5 }, item: { type: 'weapon', id: 'hatchet' } },
      profile: { version: 2, id: 'cyberia' },
    };
    expect(objectLayerIdentity(a)).toEqual(objectLayerIdentity(b));
    expect(canonicalObjectLayerBytes(a).equals(canonicalObjectLayerBytes(b))).toBe(true);
  });

  it('gives different identities to different canonical content that shares an item id', () => {
    const a = objectLayerIdentity(hatchet({ effect: 5 }));
    const b = objectLayerIdentity(hatchet({ effect: 8 }));
    expect(a.cid).not.toBe(b.cid);
    expect(a.contentHash).not.toBe(b.contentHash);
  });

  it('changes identity with the profile the content follows', () => {
    const v1 = objectLayerIdentity({ ...hatchet(), profile: { id: 'cyberia', version: 1 } });
    expect(v1.cid).not.toBe(objectLayerIdentity(hatchet()).cid);
  });

  it('ignores ownership, token registration and its own identity fields', () => {
    const bare = objectLayerIdentity(hatchet());
    const decorated = objectLayerIdentity({
      ...hatchet({ effect: 5 }, { ledger: { type: 'ERC1155', address: '0xabc', tokenId: '42' }, owner: '0xdead' }),
      cid: 'bafkreiselfreference',
      contentHash: 'f'.repeat(64),
      tokenId: '42',
      balance: '3',
    });
    expect(decorated).toEqual(bare);
  });

  it('is the CID Kubo assigns to the canonical bytes: CIDv1, raw, sha2-256, base32', () => {
    const [kubo] = vectors.anchors;
    expect(cidFromSha256Hex(kubo.contentHash)).toBe(kubo.cid);
    expect(isObjectLayerCid(kubo.cid)).toBe(true);
    expect(isObjectLayerCid(`sha256:${kubo.contentHash}`)).toBe(false);
    expect(isObjectLayerCid('')).toBe(false);
  });

  it('derives the cid from the content hash of the same bytes', () => {
    const input = hatchet();
    const contentHash = computeObjectLayerContentHash(input);
    expect(contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(computeObjectLayerCid(input)).toBe(cidFromSha256Hex(contentHash));
  });
});

describe('ObjectLayer schema identity contract', () => {
  it('keeps cid and contentHash unique and the item id a plain index', () => {
    expect(ObjectLayerSchema.path('cid').options.unique).toBe(true);
    expect(ObjectLayerSchema.path('contentHash').options.unique).toBe(true);
    const itemIdIndex = ObjectLayerSchema.indexes().find(([fields]) => fields['data.item.id'] === 1);
    expect(itemIdIndex, 'data.item.id index is declared').not.toBe(undefined);
    expect(itemIdIndex[1]?.unique).not.toBe(true);
  });

  it('stores no ledger state and no stat contract version', () => {
    expect(ObjectLayerSchema.path('data.ledger')).toBe(undefined);
    expect(ObjectLayerSchema.path('statContractVersion')).toBe(undefined);
  });

  it('computes the identity on creation from the content', async () => {
    const doc = new ObjectLayerModel(hatchet());
    await doc.validate();
    expect(doc.cid).toBe(computeObjectLayerCid(hatchet()));
    expect(doc.contentHash).toBe(computeObjectLayerContentHash(hatchet()));
    expect(doc.schemaVersion).toBe(OBJECT_LAYER_SCHEMA_VERSION);
    expect(doc.profile.toObject()).toEqual(profile);
  });

  it('refuses to change the content of a stored definition', async () => {
    const doc = new ObjectLayerModel(hatchet());
    await doc.validate();
    doc.isNew = false;
    doc.data.stats = { effect: 8 };
    await expect(doc.validate()).rejects.toThrow(/immutable/);
    doc.data.stats = { effect: 5 };
    doc.archivedAt = new Date();
    await doc.validate();
  });

  it('requires a profile reference', async () => {
    await expect(new ObjectLayerModel({ data: hatchet().data }).validate()).rejects.toThrow(/profile/);
    await expect(
      new ObjectLayerModel({ ...hatchet(), profile: { id: 'cyberia', version: 0 } }).validate(),
    ).rejects.toThrow();
  });

  it('lets two definitions carry the same item id', async () => {
    const a = new ObjectLayerModel(hatchet({ effect: 5 }));
    const b = new ObjectLayerModel(hatchet({ effect: 8 }));
    await a.validate();
    await b.validate();
    expect(a.data.item.id).toBe(b.data.item.id);
    expect(a.cid).not.toBe(b.cid);
  });

  it('rejects a mechanical block that is not an integer record', async () => {
    await expect(new ObjectLayerModel(hatchet({ effect: 0.5 })).validate()).rejects.toThrow(/integers/);
    await expect(new ObjectLayerModel(hatchet({ effect: NaN })).validate()).rejects.toThrow(/integers/);
  });

  it('exposes identity lookups and no label-keyed or in-place write', () => {
    for (const name of ['findByCid', 'upsertByIdentity', 'migrateIdentity', 'migrateMaterializations']) {
      expect(ObjectLayerSchema.statics[name], name).toBeTypeOf('function');
    }
    for (const name of [
      'upsertByItemId',
      'findByItemId',
      'dedupeByItemId',
      'ensureUniqueItemIdIndex',
      'updateDefinition',
      'listByItemId',
    ]) {
      expect(ObjectLayerSchema.statics[name], name).toBe(undefined);
    }
  });
});

// Stub model standing in for a bound Mongoose model, so the write contract is exercised
// without a live MongoDB.
const stubModel = (docs = []) => {
  const state = { docs: [...docs], created: null };
  const model = {
    findOne: async ({ cid }) => state.docs.find((doc) => doc.cid === cid) ?? null,
    create: async (payload) => {
      if (state.docs.some((doc) => doc.cid === payload.cid)) throw Object.assign(new Error('dup'), { code: 11000 });
      state.created = payload;
      return payload;
    },
  };
  return { model, state };
};
const stubDoc = (doc) => ({
  ...doc,
  async save() {
    return this;
  },
});
const upsertByIdentity = (model, payload, origin = 'canonical') =>
  ObjectLayerSchema.statics.upsertByIdentity.call(model, payload, { origin });

describe('ObjectLayer.upsertByIdentity', () => {
  it('creates a document for new content with its identity and profile, and nothing a writer adds beside it', async () => {
    const { model, state } = stubModel();
    await upsertByIdentity(model, { ...hatchet(), renderFrames: { frames: {} }, atlas: 'x' });
    expect(state.created).toMatchObject({ ...objectLayerIdentity(hatchet()), profile });
    expect(state.created.data).toEqual(hatchet().data);
    expect(Object.keys(state.created).sort()).toEqual(
      ['cid', 'contentHash', 'createdBy', 'data', 'origin', 'profile', 'schemaVersion'].sort(),
    );
  });

  it('resolves identical content to the stored document', async () => {
    const stored = stubDoc({ _id: 'a', ...hatchet(), ...objectLayerIdentity(hatchet()) });
    const { model, state } = stubModel([stored]);
    expect((await upsertByIdentity(model, hatchet()))._id).toBe('a');
    expect(state.created).toBe(null);
  });

  it('keeps a backup _id for new content', async () => {
    const { model, state } = stubModel();
    await upsertByIdentity(model, { _id: 'backup-id', ...hatchet() });
    expect(state.created._id).toBe('backup-id');
  });

  it('states what the stored copy is, and never lets a published copy become a draft', async () => {
    const { model, state } = stubModel();
    await upsertByIdentity(model, hatchet(), 'draft');
    expect(state.created.origin).toBe('draft');

    const cached = stubDoc({ _id: 'a', ...hatchet(), ...objectLayerIdentity(hatchet()), origin: 'cache' });
    const stored = stubModel([cached]);
    expect((await upsertByIdentity(stored.model, hatchet(), 'draft')).origin).toBe('cache');
    expect((await upsertByIdentity(stored.model, hatchet(), 'canonical')).origin).toBe('canonical');
    await expect(upsertByIdentity(stored.model, hatchet(), 'published')).rejects.toThrow(/Unknown Object Layer origin/);
  });
});

describe('ObjectLayer materializations', () => {
  it('holds no reference to a document of another model: a materialization references it', () => {
    const references = Object.entries(ObjectLayerSchema.paths)
      .filter(([path, schemaType]) => path !== '_id' && schemaType.instance === 'ObjectId')
      .map(([path]) => path);
    expect(references).toEqual([]);
  });

  it('keeps one editor source per definition, named by its canonical CID', () => {
    const source = { format: 'indexed8', width: 0, height: 0, palette: [], frameDurationMs: 100, frames: {} };
    expect(new ObjectLayerRenderFramesModel(source).validateSync().errors).toHaveProperty('objectLayerCid');
    const labelled = new ObjectLayerRenderFramesModel({ ...source, objectLayerCid: 'hatchet' }).validateSync();
    expect(labelled.errors).toHaveProperty('objectLayerCid');
    const unique = ObjectLayerRenderFramesSchema.indexes().filter(([, options]) => options?.unique);
    expect(unique.map(([fields]) => Object.keys(fields))).toEqual([['objectLayerCid']]);
  });

  describe('storing an editor source', () => {
    const cid = `bafkrei${'c'.repeat(52)}`;
    const source = () =>
      sourceFromIndexedFrames({
        frames: {
          down_idle: [
            [
              [0, 1],
              [2, 1],
            ],
            [
              [1, 0],
              [0, 2],
            ],
          ],
          up_idle: [
            [
              [1, 1],
              [1, 1],
            ],
          ],
        },
        colors: [
          [0, 0, 0, 0],
          [255, 0, 0, 255],
          [0, 0, 255, 128],
        ],
        frameDurationMs: 100,
      });
    // A lean read: fields in the order the document holds them, frames as BSON Binary.
    const stored = (next = source()) => {
      const frames = Object.fromEntries(
        Object.entries(next.frames)
          .reverse()
          .map(([keyframe, list]) => [keyframe, list.map((pixels) => new Binary(Buffer.from(pixels)))]),
      );
      return Object.fromEntries(Object.entries({ objectLayerCid: cid, revision: 3, ...next, frames }).reverse());
    };

    /** Whether storing `next` over `document`, as the lean read answers it, writes. */
    const writes = async (document, next) => {
      const findOne = vi.spyOn(ObjectLayerRenderFramesModel, 'findOne').mockReturnValue({ lean: async () => document });
      const update = vi
        .spyOn(ObjectLayerRenderFramesModel, 'findOneAndUpdate')
        .mockReturnValue({ lean: async () => document });
      try {
        const result = await ObjectLayerRenderFramesModel.materialize(cid, next);
        expect(result).toBe(document);
        return update.mock.calls.length > 0;
      } finally {
        findOne.mockRestore();
        update.mockRestore();
      }
    };

    it('reads a stored document back as the source it stores', () => {
      expect(ObjectLayerRenderFramesModel.sourceOf(stored())).toEqual(source());
    });

    it('writes nothing for a source that holds the same render, whatever the field order', async () => {
      expect(await writes(stored(), source())).toBe(false);
      const reordered = Object.fromEntries(Object.entries(source()).reverse());
      expect(await writes(stored(), reordered)).toBe(false);
    });

    it('rewrites a source that differs in one value or one order, and counts the write', async () => {
      const changes = {
        'a pixel of a frame': (next) => (next.frames.down_idle[0][1] = 2),
        'the order of the frames': (next) => next.frames.down_idle.reverse(),
        'one frame more': (next) => next.frames.up_idle.push(Uint8Array.from([0, 0, 0, 0])),
        'a palette color': (next) => (next.palette[1] = '#ff0001ff'),
        'the order of the palette': (next) => next.palette.reverse(),
        'the frame duration': (next) => (next.frameDurationMs = 120),
      };
      for (const [change, apply] of Object.entries(changes)) {
        const next = source();
        apply(next);
        expect(await writes(stored(), next), change).toBe(true);
      }
      const update = vi
        .spyOn(ObjectLayerRenderFramesModel, 'findOneAndUpdate')
        .mockReturnValue({ lean: async () => ({}) });
      const findOne = vi.spyOn(ObjectLayerRenderFramesModel, 'findOne').mockReturnValue({ lean: async () => null });
      await ObjectLayerRenderFramesModel.materialize(cid, source());
      expect(update.mock.calls[0][1].$inc).toEqual({ revision: 1 });
      expect(Buffer.isBuffer(update.mock.calls[0][1].$set.frames.down_idle[0])).toBe(true);
      update.mockRestore();
      findOne.mockRestore();
    });

    it('replaces a source only at the revision the writer read', async () => {
      const update = vi
        .spyOn(ObjectLayerRenderFramesModel, 'findOneAndUpdate')
        .mockImplementation(({ revision }) => ({ lean: async () => (revision === 3 ? { revision: 4 } : null) }));
      const findById = vi
        .spyOn(ObjectLayerRenderFramesModel, 'findById')
        .mockImplementation((id) => ({ lean: async () => (id === 'rf-1' ? { revision: 3 } : null) }));
      try {
        expect(await ObjectLayerRenderFramesModel.replaceAt('rf-1', source(), 3)).toEqual({ revision: 4 });
        await expect(ObjectLayerRenderFramesModel.replaceAt('rf-1', source(), 2)).rejects.toMatchObject({
          status: 409,
        });
        await expect(ObjectLayerRenderFramesModel.replaceAt('rf-9', source(), 2)).rejects.toMatchObject({
          status: 404,
        });
        expect(update.mock.calls[0][1].$inc).toEqual({ revision: 1 });
      } finally {
        update.mockRestore();
        findById.mockRestore();
      }
    });

    it('moves a stored nested-matrix source to indexed frames, once', async () => {
      const legacy = {
        _id: 'rf-1',
        objectLayerCid: cid,
        colors: [
          [0, 0, 0, 0],
          [9, 9, 9, 255],
        ],
        frame_duration: 150,
        frames: { down_idle: [[[0, 1]]], up_idle: [] },
      };
      const docs = [legacy, { _id: 'rf-2', objectLayerCid: cid, format: 'indexed8' }];
      const collection = {
        find: ({ format }) => docs.filter((doc) => (format.$exists ? 'format' in doc : !('format' in doc))),
        updateOne: async ({ _id }, { $set, $unset }) => {
          const doc = docs.find((entry) => entry._id === _id);
          Object.assign(doc, $set);
          for (const field of Object.keys($unset)) delete doc[field];
        },
      };
      const spy = vi.spyOn(ObjectLayerRenderFramesModel, 'collection', 'get').mockReturnValue(collection);
      try {
        expect(await ObjectLayerRenderFramesModel.migrateFormat()).toBe(1);
        expect(await ObjectLayerRenderFramesModel.migrateFormat()).toBe(0);
      } finally {
        spy.mockRestore();
      }
      expect(legacy).not.toHaveProperty('colors');
      expect(ObjectLayerRenderFramesModel.sourceOf(legacy)).toEqual({
        format: 'indexed8',
        width: 2,
        height: 1,
        palette: ['#00000000', '#090909ff'],
        frameDurationMs: 150,
        frames: { down_idle: [Uint8Array.from([0, 1])] },
      });
      expect(legacy.revision).toBe(1);
    });
  });

  // A collection of plain documents, as the migration reads and writes it.
  const memoryCollection = (docs) => ({
    docs,
    countDocuments: async ({ objectLayerCid }) => docs.filter((doc) => doc.objectLayerCid === objectLayerCid).length,
    findOne: async ({ _id }) => docs.find((doc) => doc._id === _id) ?? null,
    insertOne: async (doc) => docs.push({ _id: `copy-${docs.length}`, ...doc }),
    updateOne: async ({ _id }, { $set }) =>
      Object.assign(
        docs.find((doc) => doc._id === _id),
        $set,
      ),
    deleteMany: async () => {
      const owned = docs.filter((doc) => doc.objectLayerCid);
      const deletedCount = docs.length - owned.length;
      docs.splice(0, docs.length, ...owned);
      return { deletedCount };
    },
  });
  const migrate = (owners, atlases, frames, state = {}) =>
    ObjectLayerSchema.statics.migrateMaterializations.call(
      { collection: { find: () => owners, updateMany: async (filter, update) => (state.unset = update.$unset) } },
      { AtlasSpriteSheet: { collection: atlases }, ObjectLayerRenderFrames: { collection: frames } },
    );
  const owners = () => [
    { cid: 'cid-a', atlasSpriteSheetId: 'at1', objectLayerRenderFramesId: 'rf1' },
    { cid: 'cid-b', atlasSpriteSheetId: 'at1', objectLayerRenderFramesId: 'rf1' },
  ];

  it('links every materialization to its definition by cid, one copy per definition that shared it', async () => {
    const atlases = memoryCollection([{ _id: 'at1', fileId: 'f1' }, { _id: 'unowned' }]);
    const frames = memoryCollection([{ _id: 'rf1', frames: {} }]);
    const state = {};

    expect(await migrate(owners(), atlases, frames, state)).toEqual({ linked: 4, unowned: 1 });
    expect(atlases.docs.map(({ objectLayerCid, fileId }) => [objectLayerCid, fileId])).toEqual([
      ['cid-a', 'f1'],
      ['cid-b', 'f1'],
    ]);
    expect(frames.docs.map((doc) => doc.objectLayerCid)).toEqual(['cid-a', 'cid-b']);
    expect(Object.keys(state.unset).sort()).toEqual(['atlasSpriteSheetId', 'objectLayerRenderFramesId']);
  });

  it('is idempotent: a second run links nothing', async () => {
    const atlases = memoryCollection([{ _id: 'at1' }]);
    const frames = memoryCollection([{ _id: 'rf1' }]);
    await migrate(owners(), atlases, frames);

    expect(await migrate(owners(), atlases, frames)).toEqual({ linked: 0, unowned: 0 });
    expect(atlases.docs).toHaveLength(2);
  });
});

describe('ObjectLayer.migrateIdentity', () => {
  const legacy = (id, extra = {}) => ({
    _id: id,
    statContractVersion: 2,
    sha256: 'a'.repeat(64),
    cid: '',
    data: { item: { id, type: 'weapon' }, stats: { effect: 1 }, ledger: { type: 'OFF_CHAIN', tokenId: '' }, ...extra },
  });

  const stubCollection = (docs, indexes) => {
    const state = { dropped: [], updates: [], synced: false };
    const model = {
      syncIndexes: async () => (state.synced = true),
      collection: {
        indexes: async () => indexes,
        dropIndex: async (name) => state.dropped.push(name),
        find: () => ({
          [Symbol.asyncIterator]: async function* () {
            yield* docs;
          },
        }),
        updateOne: async (filter, update) => state.updates.push({ filter, update }),
        updateMany: async (filter, update) => {
          state.originUpdate = { filter, update };
          return { modifiedCount: docs.length };
        },
      },
    };
    return { model, state };
  };
  const migrate = (model, params = {}) => ObjectLayerSchema.statics.migrateIdentity.call(model, { profile, ...params });

  it('stamps the profile, recomputes the identity, drops ledger state and the legacy indexes', async () => {
    const { model, state } = stubCollection(
      [legacy('hatchet')],
      [{ name: '_id_' }, { name: 'data.item.id_1', unique: true }, { name: 'sha256_1', unique: true }],
    );
    const result = await migrate(model);
    expect(state.dropped).toEqual(['data.item.id_1', 'sha256_1']);
    expect(result).toMatchObject({ migrated: 1, bindings: 0, unbound: [] });
    const [{ update }] = state.updates;
    const identity = objectLayerIdentity({ ...legacy('hatchet'), profile });
    expect(update.$set).toEqual({ ...identity, schemaVersion: OBJECT_LAYER_SCHEMA_VERSION, profile });
    expect(update.$unset).toEqual({ sha256: '', statContractVersion: '', 'data.ledger': '' });
    expect(result.labels).toEqual([{ itemId: 'hatchet', cid: identity.cid }]);
    expect(state.synced).toBe(true);
    expect(state.originUpdate).toEqual({
      filter: { origin: { $exists: false } },
      update: { $set: { origin: 'draft' } },
    });
  });

  it('gives a legacy document the origin of the host: canonical only on the authority', async () => {
    const { model, state } = stubCollection([], []);
    await migrate(model, { origin: 'canonical' });
    expect(state.originUpdate.update).toEqual({ $set: { origin: 'canonical' } });
    await expect(migrate(model, { origin: 'cache' })).rejects.toThrow(/draft or, on the authority, canonical/);
  });

  it('requires the profile the legacy documents follow', async () => {
    const { model } = stubCollection([], []);
    await expect(ObjectLayerSchema.statics.migrateIdentity.call(model, {})).rejects.toThrow(/profile/);
  });

  it('keeps a plain item id index and hands a legacy on-chain ledger to ItemLedger', async () => {
    const bound = [];
    const ItemLedger = { bind: async (binding) => bound.push(binding) };
    const { model, state } = stubCollection(
      [legacy('hatchet', { ledger: { type: 'ERC1155', address: '0xabc', tokenId: '42' } })],
      [{ name: 'data.item.id_1' }],
    );
    const result = await migrate(model, { ItemLedger, chainId: 777771 });
    expect(state.dropped).toEqual([]);
    expect(result.bindings).toBe(1);
    expect(bound[0]).toMatchObject({ itemId: 'hatchet', chainId: 777771, contractAddress: '0xabc', tokenId: '42' });
    expect(isObjectLayerCid(bound[0].objectLayerCid)).toBe(true);
  });

  it('reports a legacy on-chain ledger it cannot bind', async () => {
    const { model } = stubCollection(
      [legacy('hatchet', { ledger: { type: 'ERC1155', address: '0xabc', tokenId: '42' } })],
      [],
    );
    const result = await migrate(model);
    expect(result.unbound).toHaveLength(1);
    expect(result.unbound[0]).toMatchObject({ itemId: 'hatchet', contractAddress: '0xabc', tokenId: '42' });
  });
});
