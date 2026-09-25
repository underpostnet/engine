import { describe, it, expect, beforeEach, vi } from 'vitest';

// A purge over a stubbed store: what it removes, what it refuses, and what it reports.
const models = {};
const ipfs = { unpinned: [], mfsRemoved: [], fail: false };
const registered = new Set();
const atlasPurge = vi.fn(async ({ objectLayerCids }) => ({
  atlases: objectLayerCids.length,
  files: objectLayerCids.length * 3,
}));
const prunedOrphans = vi.fn(async () => 2);

vi.mock('../../../src/db/DataBaseProvider.js', () => ({
  DataBaseProviderService: { getModel: (name) => models[name] },
}));
vi.mock('../../../src/api/atlas-sprite-sheet/atlas-sprite-sheet.store.js', () => ({
  AtlasSpriteSheetStore: { purge: (args) => atlasPurge(args), pruneOrphanRenders: () => prunedOrphans() },
}));
vi.mock('../../../src/api/ipfs/ipfs.client.js', () => ({
  IpfsClient: {
    unpinCid: async (cid) => {
      if (ipfs.fail) return false;
      ipfs.unpinned.push(cid);
      return true;
    },
    removeMfsPath: async (path) => {
      ipfs.mfsRemoved.push(path);
      return true;
    },
  },
}));
vi.mock('../../../src/server/domain/object-layer-resolver.js', () => ({
  resolveRegisteredCids: async (cids) => new Set(cids.filter((cid) => registered.has(cid))),
}));
vi.mock('../../../src/server/storage/cache.js', () => ({
  CACHE_POLICY: { registry: { ttlMs: 1 } },
  CacheService: { namespace: () => ({}), invalidate: (...args) => invalidations.push(args) },
}));

const invalidations = [];
const { purgeObjectLayers } = await import('../../../src/api/object-layer/object-layer.purge.js');

const options = { host: 'objectlayer.org', path: '/' };
const definition = (itemId, index) => ({
  _id: `doc-${itemId}`,
  cid: `bafkrei${itemId}`,
  data: {
    item: { id: itemId, type: 'weapon' },
    render: { cid: `bafkreirender${index}`, metadataCid: `bafkreilayout${index}` },
  },
});

let stored;
const deleted = { ObjectLayer: [], ObjectLayerRenderFrames: [], Ipfs: [] };

beforeEach(() => {
  stored = [definition('hatchet', 1), definition('sword', 2)];
  for (const key of Object.keys(deleted)) deleted[key] = [];
  ipfs.unpinned = [];
  ipfs.mfsRemoved = [];
  ipfs.fail = false;
  registered.clear();
  invalidations.length = 0;
  atlasPurge.mockClear();
  prunedOrphans.mockClear();

  const read = (doc, field) => field.split('.').reduce((value, key) => value?.[key], doc);
  const collection = (name, rows = []) => ({
    find: () => ({ lean: async () => [...rows] }),
    distinct: async (field, filter) => {
      const wanted = filter[field].$in.map(String);
      return [...new Set(rows.map((row) => read(row, field)).filter((value) => wanted.includes(String(value))))];
    },
    deleteMany: async (filter) => {
      deleted[name].push(filter);
      const [[field, { $in: values }]] = Object.entries(filter);
      rows.splice(0, rows.length, ...rows.filter((row) => !values.includes(read(row, field))));
      return { deletedCount: values.length };
    },
  });
  models.ObjectLayer = collection('ObjectLayer', stored);
  models.ObjectLayerRenderFrames = collection('ObjectLayerRenderFrames');
  models.Ipfs = collection('Ipfs');
});

describe('a purge', () => {
  it('removes the definition, its storage documents, its pins and its MFS paths', async () => {
    const report = await purgeObjectLayers({ options });

    // Each definition's own cid, its canonical render CID and its canonical metadata CID.
    expect(report).toMatchObject({ objectLayers: 2, renderFrames: 2, atlases: 2, files: 6, pinRecords: 6 });
    expect(report.itemIds).toEqual(['hatchet', 'sword']);
    // The definition's own cid, and both cids of each render.
    expect(ipfs.unpinned).toEqual(
      expect.arrayContaining([
        'bafkreihatchet',
        'bafkreisword',
        'bafkreirender1',
        'bafkreilayout1',
        'bafkreirender2',
        'bafkreilayout2',
      ]),
    );
    expect(report.unpinned).toBe(ipfs.unpinned.length);
    expect(ipfs.mfsRemoved).toEqual(['/object-layer/hatchet', '/object-layer/sword']);
    expect(report.mfsPaths).toBe(2);
    expect(invalidations).toHaveLength(1);
  });

  it('takes the atlases and render frames of the purged definitions, by their cid', async () => {
    await purgeObjectLayers({ options });
    expect(atlasPurge).toHaveBeenCalledWith({ objectLayerCids: ['bafkreihatchet', 'bafkreisword'], options });
    expect(deleted.ObjectLayerRenderFrames).toEqual([{ objectLayerCid: { $in: ['bafkreihatchet', 'bafkreisword'] } }]);
  });

  it('keeps the render and label a surviving definition still names, and its own materializations', async () => {
    // Another definition of the same label and render: ItemLedger registers it, so it stays.
    stored.push({ ...definition('hatchet', 1), _id: 'doc-hatchet-2', cid: 'bafkreihatchet2' });
    registered.add('bafkreihatchet2');

    const report = await purgeObjectLayers({ options });

    expect(report.objectLayers).toBe(2);
    expect(atlasPurge).toHaveBeenCalledWith({ objectLayerCids: ['bafkreihatchet', 'bafkreisword'], options });
    expect(ipfs.unpinned.sort()).toEqual(['bafkreihatchet', 'bafkreilayout2', 'bafkreirender2', 'bafkreisword']);
    expect(ipfs.mfsRemoved).toEqual(['/object-layer/sword']);
  });

  it('asks the Studio what it keeps for each definition, and says whether the assets go', async () => {
    const beforeDelete = vi.fn();
    await purgeObjectLayers({ options: { ...options, extension: { beforeDelete } }, assets: false });
    expect(beforeDelete).toHaveBeenCalledTimes(2);
    expect(beforeDelete.mock.calls[0][2]).toEqual({ assets: false });
    // The documents are gone first, so the Studio sees only surviving definitions.
    expect(deleted.ObjectLayer).toHaveLength(1);
  });

  it('keeps a definition ItemLedger registers, and reports it', async () => {
    registered.add('bafkreisword');
    const report = await purgeObjectLayers({ options });
    expect(report.objectLayers).toBe(1);
    expect(report.kept).toEqual([{ cid: 'bafkreisword', itemId: 'sword' }]);
    expect(ipfs.mfsRemoved).toEqual(['/object-layer/hatchet']);
  });

  it('reports zeros when nothing matches, and still prunes orphan renders when asked', async () => {
    registered.add('bafkreihatchet');
    registered.add('bafkreisword');
    const report = await purgeObjectLayers({ options, pruneOrphans: true });
    expect(report).toMatchObject({ objectLayers: 0, atlases: 0, files: 2, itemIds: [] });
    expect(report.kept).toHaveLength(2);
    expect(atlasPurge).not.toHaveBeenCalled();
    expect(ipfs.unpinned).toEqual([]);
  });

  it('counts only the pins the node answered for', async () => {
    ipfs.fail = true;
    const report = await purgeObjectLayers({ options });
    expect(report.unpinned).toBe(0);
    // The registry records go either way: the purge never leaves a record of content it dropped.
    expect(report.pinRecords).toBe(6);
  });
});
