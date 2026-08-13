'use strict';

import { expect } from 'chai';
import { Types } from 'mongoose';
import {
  ObjectLayerSchema,
  computeObjectLayerSha256,
  mergeObjectLayerData,
} from '../src/api/object-layer/object-layer.model.js';

const storedData = () => ({
  stats: { effect: 5, resistance: 4, agility: 6, range: 2, intelligence: 0, utility: 1 },
  item: { id: 'hatchet', type: 'weapon', description: 'a hatchet', activable: true },
  ledger: { type: 'ERC1155', address: '0xabc', tokenId: '42' },
  render: { cid: 'bafk-atlas', metadataCid: 'bafk-atlas-metadata' },
});

describe('object layer data merge', () => {
  it('keeps the stored value when the writer sends null, undefined or empty string', () => {
    const merged = mergeObjectLayerData(storedData(), {
      render: { cid: null, metadataCid: '' },
      ledger: { address: undefined },
    });

    expect(merged.render.cid).to.equal('bafk-atlas');
    expect(merged.render.metadataCid).to.equal('bafk-atlas-metadata');
    expect(merged.ledger.address).to.equal('0xabc');
  });

  it('prioritizes the last attribute that carries a value', () => {
    const merged = mergeObjectLayerData(storedData(), {
      item: { description: 'sharpened hatchet' },
      render: { cid: 'bafk-new-atlas' },
    });

    expect(merged.item.description).to.equal('sharpened hatchet');
    expect(merged.render.cid).to.equal('bafk-new-atlas');
    expect(merged.render.metadataCid).to.equal('bafk-atlas-metadata');
  });

  it('treats false and 0 as real values, not as absent', () => {
    const merged = mergeObjectLayerData(storedData(), {
      item: { activable: false },
      stats: { effect: 0 },
    });

    expect(merged.item.activable).to.equal(false);
    expect(merged.stats.effect).to.equal(0);
  });

  it('preserves stored attributes the writer does not mention', () => {
    const merged = mergeObjectLayerData(storedData(), { stats: { agility: 9 } });

    expect(merged.stats).to.deep.equal({
      effect: 5,
      resistance: 4,
      agility: 9,
      range: 2,
      intelligence: 0,
      utility: 1,
    });
    expect(merged.ledger).to.deep.equal({ type: 'ERC1155', address: '0xabc', tokenId: '42' });
  });

  it('replaces ObjectIds and Dates atomically instead of merging their internals', () => {
    const storedId = new Types.ObjectId();
    const incomingId = new Types.ObjectId();

    expect(
      mergeObjectLayerData({ objectLayerRenderFramesId: storedId }, { objectLayerRenderFramesId: incomingId })
        .objectLayerRenderFramesId,
    ).to.equal(incomingId);
    expect(
      mergeObjectLayerData({ objectLayerRenderFramesId: storedId }, { objectLayerRenderFramesId: null })
        .objectLayerRenderFramesId,
    ).to.equal(storedId);
    expect(mergeObjectLayerData({ at: new Date(0) }, { at: new Date(1) }).at.getTime()).to.equal(1);
  });

  it('seeds insert-only defaults under the payload, the way generate-saga does', () => {
    const seeded = mergeObjectLayerData(
      { cid: null, data: { ledger: { type: 'OFF_CHAIN', tokenId: '' }, render: {} } },
      { data: { stats: { effect: 1 }, item: { id: 'amethyst-shard' } } },
    );

    expect(seeded.data.ledger).to.deep.equal({ type: 'OFF_CHAIN', tokenId: '' });
    expect(seeded.data.item.id).to.equal('amethyst-shard');
    expect(seeded.data.stats.effect).to.equal(1);
  });

  it('takes the incoming shape when nothing is stored yet', () => {
    expect(mergeObjectLayerData(undefined, { render: { cid: null } })).to.deep.equal({ render: { cid: null } });
  });
});

describe('object layer sha256', () => {
  it('is deterministic regardless of key order', () => {
    const a = { item: { id: 'hatchet' }, stats: { effect: 1 } };
    const b = { stats: { effect: 1 }, item: { id: 'hatchet' } };

    expect(computeObjectLayerSha256(a)).to.equal(computeObjectLayerSha256(b));
    expect(computeObjectLayerSha256(a)).to.match(/^[a-f0-9]{64}$/);
  });

  it('is the single implementation shared with ObjectLayerEngine', async function () {
    // object-layer.js pulls in pngjs/sharp/jimp, which external engine projects
    // may not have installed; dynamic import keeps a missing optional
    // dependency from aborting mocha's file-loading phase for the whole suite.
    let ObjectLayerEngine;
    try {
      ({ ObjectLayerEngine } = await import('../src/projects/cyberia/object-layer.js'));
    } catch (err) {
      if (err.code === 'ERR_MODULE_NOT_FOUND') return this.skip();
      throw err;
    }

    const data = storedData();
    expect(ObjectLayerEngine.computeSha256(data)).to.equal(computeObjectLayerSha256(data));
  });
});

describe('ObjectLayer schema item id contract', () => {
  it('declares data.item.id as a unique index under a stable name', () => {
    const itemIdIndex = ObjectLayerSchema.indexes().find(([fields]) => fields['data.item.id'] === 1);

    expect(itemIdIndex, 'data.item.id index is declared').to.not.equal(undefined);
    expect(itemIdIndex[1].name).to.equal('data.item.id_1');
    expect(itemIdIndex[1].unique).to.equal(true);
  });

  it('exposes the statics that enforce one document per item id', () => {
    for (const name of ['upsertByItemId', 'dedupeByItemId', 'ensureUniqueItemIdIndex']) {
      expect(ObjectLayerSchema.statics[name], name).to.be.a('function');
    }
  });
});

// Stub model standing in for a bound Mongoose model, so the upsert contract is
// exercised without a live MongoDB.
const stubModel = (docs = []) => {
  const state = { docs: [...docs], deletedIds: [], deletedFramesIds: [], created: null, updated: null };
  const model = {
    db: {
      models: {
        ObjectLayerRenderFrames: {
          deleteMany: async ({ _id }) => state.deletedFramesIds.push(..._id.$in),
        },
      },
    },
    find: (query) => ({
      sort: async () => state.docs.filter((doc) => doc.data.item.id === query['data.item.id']),
    }),
    deleteMany: async ({ _id }) => {
      state.deletedIds.push(..._id.$in);
      state.docs = state.docs.filter((doc) => !_id.$in.includes(doc._id));
    },
    create: async (payload) => {
      state.created = payload;
      return payload;
    },
    findByIdAndUpdate: async (_id, { $set }) => {
      state.updated = { _id, $set };
      return $set;
    },
  };
  return { model, state };
};

const stubDoc = (doc) => ({ ...doc, toObject: () => JSON.parse(JSON.stringify(doc)) });

const upsertByItemId = (model, ...args) => ObjectLayerSchema.statics.upsertByItemId.call(model, ...args);

describe('ObjectLayer.upsertByItemId', () => {
  it('rejects a payload without data.item.id', async () => {
    const { model, state } = stubModel();

    let error = null;
    try {
      await upsertByItemId(model, { data: { item: {} } });
    } catch (err) {
      error = err;
    }

    expect(error).to.not.equal(null);
    expect(error.message).to.match(/requires data\.item\.id/);
    expect(state.created).to.equal(null);
  });

  it('creates a new item with the sha256 computed over its data', async () => {
    const { model, state } = stubModel();
    const payload = { data: { item: { id: 'hatchet' }, stats: { effect: 1 } } };

    await upsertByItemId(model, payload);

    expect(state.created.sha256).to.equal(computeObjectLayerSha256(payload.data));
  });

  it('never lets a degraded import erase values already stored', async () => {
    const { model, state } = stubModel([
      stubDoc({
        _id: 'a',
        data: {
          item: { id: 'hatchet', type: 'weapon', description: 'stored description', activable: true },
          stats: { effect: 5 },
          ledger: { type: 'ERC1155', address: '0xabc', tokenId: '42' },
          render: { cid: 'bafk-atlas', metadataCid: 'bafk-atlas-metadata' },
        },
        cid: 'bafk-data',
        objectLayerRenderFramesId: 'render-frames-old',
      }),
    ]);

    // What the CLI stages when IPFS is unreachable: real ids, empty CIDs.
    await upsertByItemId(model, {
      data: {
        item: { id: 'hatchet', type: 'weapon', description: '', activable: true },
        stats: { effect: 7 },
        ledger: { type: 'OFF_CHAIN' },
        render: { cid: '', metadataCid: '' },
      },
      cid: '',
      objectLayerRenderFramesId: 'render-frames-new',
    });

    const { _id, $set } = state.updated;
    expect(_id).to.equal('a');
    expect($set.data.render).to.deep.equal({ cid: 'bafk-atlas', metadataCid: 'bafk-atlas-metadata' });
    expect($set.data.ledger.address).to.equal('0xabc');
    expect($set.data.ledger.tokenId).to.equal('42');
    expect($set.data.item.description).to.equal('stored description');
    expect($set.cid).to.equal('bafk-data');
    // …while everything the writer actually supplied still wins.
    expect($set.data.ledger.type).to.equal('OFF_CHAIN');
    expect($set.data.stats.effect).to.equal(7);
    expect($set.objectLayerRenderFramesId).to.equal('render-frames-new');
    expect($set.sha256).to.equal(computeObjectLayerSha256($set.data));
  });

  it('collapses pre-existing duplicates onto the oldest document', async () => {
    const { model, state } = stubModel([
      stubDoc({ _id: 'a', data: { item: { id: 'hatchet' } }, objectLayerRenderFramesId: 'rf-a' }),
      stubDoc({ _id: 'b', data: { item: { id: 'hatchet' } }, objectLayerRenderFramesId: 'rf-b' }),
      stubDoc({ _id: 'c', data: { item: { id: 'hatchet' } }, objectLayerRenderFramesId: 'rf-c' }),
    ]);

    await upsertByItemId(model, { data: { item: { id: 'hatchet' }, stats: { effect: 9 } } });

    expect(state.deletedIds).to.deep.equal(['b', 'c']);
    expect(state.deletedFramesIds).to.deep.equal(['rf-b', 'rf-c']);
    expect(state.updated._id).to.equal('a');
    expect(state.created).to.equal(null);
  });

  it('merges a backup restore onto the existing document instead of forking the item id', async () => {
    // What `instance <code> --import` reads back from a backup: a full document
    // carrying its own _id and sha256, for an item this database already holds
    // under a different _id.
    const { model, state } = stubModel([
      stubDoc({
        _id: 'live-id',
        data: {
          item: { id: 'biometric-masking-array', type: 'weapon', description: 'live description' },
          stats: { effect: 3 },
          ledger: { type: 'ERC1155', address: '0xabc', tokenId: '42' },
          render: { cid: 'live-atlas', metadataCid: 'live-atlas-metadata' },
        },
        cid: 'live-data',
      }),
    ]);

    await upsertByItemId(model, {
      _id: 'backup-id',
      sha256: 'stale-hash-from-the-backup',
      data: {
        item: { id: 'biometric-masking-array', type: 'weapon', description: '' },
        stats: { effect: 8 },
        ledger: { type: 'OFF_CHAIN' },
        render: { cid: '', metadataCid: '' },
      },
      cid: '',
      objectLayerRenderFramesId: 'restored-render-frames',
    });

    expect(state.created, 'no second document for the same item id').to.equal(null);
    expect(state.updated._id).to.equal('live-id');
    expect(state.updated.$set).to.not.have.property('_id');
    expect(state.updated.$set.data.stats.effect).to.equal(8);
    expect(state.updated.$set.objectLayerRenderFramesId).to.equal('restored-render-frames');
    expect(state.updated.$set.data.item.description).to.equal('live description');
    expect(state.updated.$set.data.render.cid).to.equal('live-atlas');
    expect(state.updated.$set.cid).to.equal('live-data');
    expect(state.updated.$set.sha256).to.equal(computeObjectLayerSha256(state.updated.$set.data));
  });

  it('preserves the backup _id when the item is genuinely new', async () => {
    const { model, state } = stubModel();

    await upsertByItemId(model, { _id: 'backup-id', data: { item: { id: 'fresh' }, stats: { effect: 1 } } });

    expect(state.created._id).to.equal('backup-id');
  });

  it('applies setOnInsert only on create, so a saga rerun cannot downgrade an item', async () => {
    const setOnInsert = { cid: null, data: { ledger: { type: 'OFF_CHAIN', tokenId: '' }, render: {} } };

    const fresh = stubModel();
    await upsertByItemId(fresh.model, { data: { item: { id: 'shard' }, stats: { effect: 1 } } }, { setOnInsert });
    expect(fresh.state.created.data.ledger).to.deep.equal({ type: 'OFF_CHAIN', tokenId: '' });

    const registered = stubModel([
      stubDoc({
        _id: 'a',
        data: {
          item: { id: 'shard' },
          stats: { effect: 1 },
          ledger: { type: 'ERC1155', address: '0xdead', tokenId: '7' },
          render: { cid: 'bafk-atlas', metadataCid: 'bafk-atlas-metadata' },
        },
      }),
    ]);
    await upsertByItemId(registered.model, { data: { item: { id: 'shard' }, stats: { effect: 4 } } }, { setOnInsert });

    expect(registered.state.updated.$set.data.ledger.type).to.equal('ERC1155');
    expect(registered.state.updated.$set.data.render.cid).to.equal('bafk-atlas');
    expect(registered.state.updated.$set.data.stats.effect).to.equal(4);
  });
});
