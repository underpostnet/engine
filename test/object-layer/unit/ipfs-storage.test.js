import { describe, it, expect, beforeEach, vi } from 'vitest';

// CID-first IPFS storage over a stubbed node and store: what a bundle pins, records and lists,
// what a prune collects, and what a migration moves.
const models = {};
const node = vi.hoisted(() => ({
  added: [],
  listed: [],
  removed: [],
  unpinned: [],
  directories: {},
  pinned: new Set(),
  answer: null,
}));
const records = vi.hoisted(() => []);

vi.mock('../../../src/db/DataBaseProvider.js', () => ({
  DataBaseProviderService: { getModel: (name) => models[name] },
}));
vi.mock('../../../src/api/ipfs/ipfs.service.js', () => ({
  createPinRecord: async (record) => records.push(record),
}));
vi.mock('../../../src/api/ipfs/ipfs.client.js', async () => {
  const { payloadCid } = await import('../../../src/api/object-layer/object-layer.identity.js');
  return {
    IpfsClient: {
      addToIpfs: async (bytes, filename) => {
        node.added.push({ bytes, filename });
        if (node.answer === 'down') return null;
        return { cid: node.answer ?? payloadCid(bytes), size: bytes.length };
      },
      copyToMfs: async (cid, path) => (node.listed.push([path, cid]), true),
      removeMfsPath: async (path) => (node.removed.push(path), true),
      unpinCid: async (cid) => (node.unpinned.push(cid), true),
      listMfsDirectory: async (path) => node.directories[path] ?? null,
      isCidPinned: async (cid) => node.pinned.has(cid),
      isClusterPinned: async (cid) => node.pinned.has(cid),
      statMfsPath: async (path) => {
        const listed = node.listed.findLast(([at]) => at === path);
        return listed ? { cid: listed[1] } : null;
      },
    },
  };
});

const { canonicalJsonBytes, canonicalObjectLayerBytes, canonicalRender, objectLayerIdentity } =
  await import('../../../src/api/object-layer/object-layer.identity.js');
const {
  migrateObjectLayerStorage,
  objectLayerIpfsState,
  objectLayerMfsPaths,
  publishObjectLayerBundle,
  pruneUnreferencedContent,
} = await import('../../../src/api/object-layer/object-layer.ipfs.js');

const lean = (value) => ({ lean: async () => value });
const primary = Buffer.from('a primary render');
const metadata = { atlasWidth: 1, atlasHeight: 1, cellPixelDim: 1, frames: {} };
const { contract } = canonicalRender({ primary, metadata });
const OL = `bafkrei${'d'.repeat(52)}`;
const definition = (extra = {}) => ({
  cid: OL,
  origin: 'cache',
  profile: { id: 'cyberia', version: 2 },
  data: { item: { id: 'hatchet', type: 'weapon' }, render: contract },
  ...extra,
});

beforeEach(() => {
  Object.assign(node, { added: [], listed: [], removed: [], unpinned: [], directories: {}, answer: null });
  node.pinned = new Set();
  records.length = 0;
  models.AtlasSpriteSheet = {
    findOne: ({ objectLayerCid }) => lean(objectLayerCid === OL ? { fileId: 'f1', metadata } : null),
  };
  models.File = { findById: async (id) => (id === 'f1' ? { data: primary } : null) };
});

describe('the CID-first layout', () => {
  it('derives every path of a bundle from the definition cid alone', () => {
    expect(objectLayerMfsPaths(OL)).toEqual({
      root: `/object-layer/cid/${OL}`,
      'object-layer.json': `/object-layer/cid/${OL}/object-layer.json`,
      'atlas.png': `/object-layer/cid/${OL}/atlas.png`,
      'atlas.json': `/object-layer/cid/${OL}/atlas.json`,
    });
  });
});

describe('publishing a bundle', () => {
  it('pins the exact render bytes, records them and lists them under the definition cid', async () => {
    const { root, resources } = await publishObjectLayerBundle({ definition: definition() });
    expect(root).toBe(`/object-layer/cid/${OL}`);
    expect(resources.map(({ name, cid, pinned, listed }) => [name, cid, pinned, listed])).toEqual([
      ['atlas.png', contract.cid, true, true],
      ['atlas.json', contract.metadataCid, true, true],
    ]);
    expect(node.added[0].bytes.equals(primary)).toBe(true);
    expect(node.added[1].bytes.equals(canonicalJsonBytes(metadata))).toBe(true);
    expect(records.map(({ cid, resourceType }) => [cid, resourceType])).toEqual([
      [contract.cid, 'atlas-sprite-sheet'],
      [contract.metadataCid, 'atlas-metadata'],
    ]);
    expect(node.listed).toEqual([
      [`/object-layer/cid/${OL}/atlas.png`, contract.cid],
      [`/object-layer/cid/${OL}/atlas.json`, contract.metadataCid],
    ]);
  });

  it('pins the canonical bytes only for the Object Layer authority, and never for a draft', async () => {
    const published = { ...definition(), ...objectLayerIdentity(definition()) };
    const json = `/object-layer/cid/${published.cid}/object-layer.json`;
    await publishObjectLayerBundle({ definition: published });
    expect(node.listed).toEqual([]);
    await publishObjectLayerBundle({ definition: published, canonical: true });
    expect(node.listed).toEqual([[json, published.cid]]);
    expect(node.added.at(-1).bytes.equals(canonicalObjectLayerBytes(published))).toBe(true);
    expect(records.at(-1)).toMatchObject({ cid: published.cid, resourceType: 'object-layer-data' });
    node.listed.length = 0;
    await publishObjectLayerBundle({ definition: { ...published, origin: 'draft' }, canonical: true });
    expect(node.listed).toEqual([]);
  });

  it('refuses a CID other than the contract names, and records nothing', async () => {
    node.answer = `bafkrei${'x'.repeat(52)}`;
    await expect(publishObjectLayerBundle({ definition: definition() })).rejects.toThrow(/contract names/);
    expect(records).toEqual([]);
    expect(node.listed).toEqual([]);
  });

  it('records and lists nothing while the node does not answer', async () => {
    node.answer = 'down';
    const { resources } = await publishObjectLayerBundle({ definition: definition() });
    expect(resources.every(({ pinned, listed }) => !pinned && !listed)).toBe(true);
    expect(records).toEqual([]);
  });

  it('stores no render of an atlas that is not the render the definition names', async () => {
    const other = definition({ data: { item: { id: 'hatchet' }, render: { cid: 'bafkreiother', metadataCid: 'x' } } });
    expect((await publishObjectLayerBundle({ definition: other })).resources).toEqual([]);
  });

  it('writes the same records and listings again: a rerun changes nothing', async () => {
    await publishObjectLayerBundle({ definition: definition() });
    const first = { listed: [...node.listed], records: [...records] };
    node.listed.length = 0;
    records.length = 0;
    await publishObjectLayerBundle({ definition: definition() });
    expect(node.listed).toEqual(first.listed);
    expect(records).toEqual(first.records);
  });
});

describe('the IPFS state of a definition', () => {
  it('reports each file by concern: registry, Kubo pin, Cluster pin and the CID its path lists', async () => {
    models.Ipfs = { distinct: async () => [contract.cid] };
    await publishObjectLayerBundle({ definition: definition() });
    node.pinned = new Set([contract.cid]);
    const state = await objectLayerIpfsState({ definition: definition() });
    expect(state).toEqual([
      {
        name: 'object-layer.json',
        cid: OL,
        path: `/object-layer/cid/${OL}/object-layer.json`,
        registered: false,
        pinned: false,
        cluster: false,
        listedCid: null,
      },
      {
        name: 'atlas.png',
        cid: contract.cid,
        path: `/object-layer/cid/${OL}/atlas.png`,
        registered: true,
        pinned: true,
        cluster: true,
        listedCid: contract.cid,
      },
      {
        name: 'atlas.json',
        cid: contract.metadataCid,
        path: `/object-layer/cid/${OL}/atlas.json`,
        registered: false,
        pinned: false,
        cluster: false,
        listedCid: contract.metadataCid,
      },
    ]);
  });
});

describe('pruning content no kept store references', () => {
  const store = (definitions, cids) => {
    const registry = cids.map(([cid, resourceType]) => ({ cid, resourceType }));
    return {
      ObjectLayer: { find: () => lean(definitions) },
      Ipfs: {
        registry,
        find: ({ resourceType }) => lean(registry.filter((record) => record.resourceType !== resourceType.$ne)),
        deleteMany: async ({ cid }) => {
          const before = registry.length;
          registry.splice(0, registry.length, ...registry.filter((record) => !cid.$in.includes(record.cid)));
          return { deletedCount: before - registry.length };
        },
      },
    };
  };

  it('unpins a render no kept store names, keeps one any kept store names, and never the canonical bytes', async () => {
    const shared = { cid: 'bafkrei-ol-b', data: { render: { cid: 'render-shared', metadataCid: 'layout-shared' } } };
    const a = store(
      [],
      [
        ['render-shared', 'atlas-sprite-sheet'],
        ['render-gone', 'atlas-sprite-sheet'],
        ['bafkrei-ol-gone', 'object-layer-data'],
      ],
    );
    const b = store([shared], [['layout-shared', 'atlas-metadata']]);
    node.directories = {
      '/object-layer/cid': ['bafkrei-ol-b', 'bafkrei-ol-gone'],
      '/object-layer/cid/bafkrei-ol-gone': ['object-layer.json', 'atlas.png'],
    };
    const report = await pruneUnreferencedContent({ stores: [a, b] });
    expect(report).toEqual({ records: 1, unpinned: 1, listings: 1 });
    expect(node.unpinned).toEqual(['render-gone']);
    expect(a.Ipfs.registry.map(({ cid }) => cid)).toEqual(['render-shared', 'bafkrei-ol-gone']);
    expect(node.removed).toEqual(['/object-layer/cid/bafkrei-ol-gone/atlas.png']);
  });
});

describe('migrating to the CID-first layout', () => {
  const registry = () => {
    const docs = [
      { _id: 1, cid: contract.cid, mfsPath: '/object-layer/hatchet/hatchet_render.png' },
      { _id: 2, cid: contract.cid, mfsPath: '/object-layer/axe/axe_render.png' },
      { _id: 3, cid: contract.metadataCid, mfsPath: '/object-layer/hatchet/hatchet_render_metadata.json' },
    ];
    return {
      docs,
      synced: 0,
      collection: {
        find: () => ({ toArray: async () => docs.map(({ _id, cid }) => ({ _id, cid })) }),
        deleteMany: async ({ _id }) => docs.splice(0, docs.length, ...docs.filter((doc) => !_id.$in.includes(doc._id))),
        updateMany: async () => docs.forEach((doc) => delete doc.mfsPath),
      },
      async syncIndexes() {
        this.synced++;
      },
    };
  };

  it('reports and writes nothing without apply', async () => {
    const Ipfs = registry();
    node.directories = { '/object-layer': ['hatchet', 'axe', 'cid'] };
    const report = await migrateObjectLayerStorage({ ObjectLayer: { find: () => lean([definition()]) }, Ipfs });
    expect(report).toEqual({
      applied: false,
      registry: { records: 3, duplicates: 1 },
      definitions: 1,
      stored: 0,
      failed: [],
      legacy: ['/object-layer/hatchet', '/object-layer/axe'],
    });
    expect(Ipfs.docs).toHaveLength(3);
    expect(node.listed).toEqual([]);
    expect(node.removed).toEqual([]);
  });

  it('keeps one record per CID, lists every definition under its cid, and removes every listing by item id', async () => {
    const Ipfs = registry();
    node.directories = { '/object-layer': ['hatchet', 'axe', 'cid'] };
    const report = await migrateObjectLayerStorage({
      ObjectLayer: { find: () => lean([definition()]) },
      Ipfs,
      apply: true,
    });
    expect(report).toMatchObject({ applied: true, stored: 1, failed: [] });
    expect(Ipfs.docs).toEqual([
      { _id: 1, cid: contract.cid },
      { _id: 3, cid: contract.metadataCid },
    ]);
    expect(Ipfs.synced).toBe(1);
    expect(node.listed.map(([path]) => path)).toEqual([
      `/object-layer/cid/${OL}/atlas.png`,
      `/object-layer/cid/${OL}/atlas.json`,
    ]);
    expect(node.removed).toEqual(['/object-layer/hatchet', '/object-layer/axe']);
  });
});
