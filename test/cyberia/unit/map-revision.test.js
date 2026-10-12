import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const models = {};
vi.mock('../../../src/db/DataBaseProvider.js', () => ({
  DataBaseProviderService: { getModel: (name) => models[name] },
}));
vi.mock('../../../src/server/storage/cache.js', () => ({
  CacheService: { namespace: () => 'maps', invalidate: async () => {} },
}));

const { CyberiaMapService } = await import('../../../src/api/cyberia-map/cyberia-map.service.js');
const { CyberiaEntityTypeDefaultService } =
  await import('../../../src/api/cyberia-entity-type-default/cyberia-entity-type-default.service.js');
const { CyberiaMapModel } = await import('../../../src/api/cyberia-map/cyberia-map.model.js');

const user = { _id: '64b0000000000000000000aa', role: 'admin' };
const updatedAt = new Date('2026-09-28T10:00:00Z');

/** A map collection of one document, whose conditional update matches on id and `updatedAt`. */
const store = (stored) => {
  let current = { ...stored };
  const Model = function (doc) {
    return new CyberiaMapModel(doc);
  };
  Object.defineProperty(Model, 'current', { get: () => current });
  Object.assign(Model, {
    findById: async () => new CyberiaMapModel(current),
    findOneAndUpdate: async ({ _id, updatedAt: at }, { $set, $inc }) => {
      if (String(_id) !== current._id || at.getTime() !== current.updatedAt.getTime()) return null;
      current = { ...current, ...$set, revision: current.revision + $inc.revision, updatedAt: new Date() };
      return current;
    },
  });
  return Model;
};
const save = (revision, changes = {}) =>
  CyberiaMapService.put(
    { params: { id: '64b000000000000000000001' }, body: { revision, ...changes }, auth: { user } },
    {},
    {},
  );

describe('map save revision', () => {
  beforeEach(() => {
    models.CyberiaMap = store({
      _id: '64b000000000000000000001',
      code: 'glade',
      name: 'Glade',
      creator: '64b0000000000000000000aa',
      revision: 4,
      updatedAt,
    });
    models.File = { findByIdAndDelete: async () => {} };
    models.CyberiaInstance = {
      find: ({ cyberiaMapCodes }) => ({
        lean: async () =>
          [{ code: 'forest', cyberiaMapCodes: ['glade'] }].filter((i) => i.cyberiaMapCodes.includes(cyberiaMapCodes)),
      }),
    };
    vi.spyOn(CyberiaEntityTypeDefaultService, 'linkPlacedDefaults').mockResolvedValue({ linked: [] });
  });
  afterEach(() => vi.restoreAllMocks());

  it('saves the revision it was loaded at, and moves the revision forward', async () => {
    const saved = await save(4, { name: 'Glade II' });
    expect(saved).toMatchObject({ name: 'Glade II', revision: 5 });
  });

  it('links the instances that run the map to the defaults it places', async () => {
    await save(4, { entities: [{ entityType: 'obstacle', objectLayerItemIds: ['urn'] }] });
    expect(CyberiaEntityTypeDefaultService.linkPlacedDefaults).toHaveBeenCalledExactlyOnceWith(
      { instanceCode: 'forest' },
      {},
    );
  });

  it('keeps the save when the link fails', async () => {
    CyberiaEntityTypeDefaultService.linkPlacedDefaults.mockRejectedValue(new Error('no conf'));
    await expect(save(4, { name: 'Glade II' })).resolves.toMatchObject({ revision: 5 });
  });

  it('refuses a save from an older revision, and a save without one', async () => {
    await expect(save(3, { name: 'Stale' })).rejects.toMatchObject({ status: 409 });
    await expect(save(undefined, { name: 'Blind' })).rejects.toMatchObject({ status: 409 });
    expect(models.CyberiaMap.current.name).toBe('Glade');
  });

  it('refuses a save when another write lands between its read and its write', async () => {
    const racing = models.CyberiaMap;
    const findOneAndUpdate = racing.findOneAndUpdate;
    racing.findOneAndUpdate = async (filter, update) => {
      await findOneAndUpdate(
        { _id: '64b000000000000000000001', updatedAt },
        { $set: { name: 'Other' }, $inc: { revision: 1 } },
      );
      return findOneAndUpdate(filter, update);
    };
    await expect(save(4, { name: 'Mine' })).rejects.toMatchObject({ status: 409 });
    expect(racing.current.name).toBe('Other');
  });
});
