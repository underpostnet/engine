import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const models = {};
vi.mock('../../../src/projects/cyberia/instance/map-registry.js', () => ({
  registryModels: () => models,
  registryTransaction: async (models, write) => ({ value: await write({}) }),
}));
vi.mock('../../../src/db/DataBaseProvider.js', () => ({
  DataBaseProviderService: { getModel: (name) => models[name] },
}));
vi.mock('../../../src/server/storage/cache.js', () => ({
  CacheService: { namespace: () => 'maps', invalidate: async () => {} },
}));
const drawn = vi.hoisted(() => []);
// The draw a test holds: a promise that settles when the test says, else one that settles at once.
const draw = vi.hoisted(() => ({ held: null }));
vi.mock('../../../src/projects/cyberia/instance/map-preview-generator.js', () => ({
  refreshMapMedia: (filter) => {
    drawn.push(filter);
    return draw.held ?? Promise.resolve(null);
  },
}));

const { CyberiaMapService } = await import('../../../src/api/cyberia-map/cyberia-map.service.js');
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
    exists: async ({ $or }) =>
      $or.some((condition) => Object.entries(condition).every(([key, value]) => current[key] === value)),
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
    deleted.length = 0;
    drawn.length = 0;
    draw.held = null;
    models.File = { findByIdAndDelete: async (id) => deleted.push(id) };
  });
  afterEach(() => vi.restoreAllMocks());
  const deleted = [];

  it('saves the revision it was loaded at, and moves the revision forward', async () => {
    const saved = await save(4, { name: 'Glade II' });
    expect(saved).toMatchObject({ name: 'Glade II', revision: 5 });
  });

  it('writes the media of the new revision pending, then draws its preview after the commit', async () => {
    await save(4, { entities: [{ entityType: 'obstacle', objectLayerItemIds: ['urn'] }] });
    expect(models.CyberiaMap.current.media).toMatchObject({ revision: 5, status: 'pending' });
    expect(drawn).toEqual([{ _id: '64b000000000000000000001' }]);
  });

  it('answers before the preview draws, and a failed draw fails no save', async () => {
    draw.held = new Promise(() => {});
    const saved = await save(4, { entities: [{ entityType: 'obstacle', objectLayerItemIds: ['urn'] }] });
    expect(saved.media).toMatchObject({ revision: 5, status: 'pending' });
    draw.held = Promise.reject(new Error('sharp is out of memory'));
    await expect(save(5, { name: 'Glade III' })).resolves.toMatchObject({ revision: 6 });
    expect(drawn).toHaveLength(2);
  });

  it('takes no preview, media, owner or revision from the client', async () => {
    await save(4, {
      preview: '64b0000000000000000000ff',
      media: { revision: 9, status: 'ready' },
      creator: '64b0000000000000000000bb',
    });
    expect(models.CyberiaMap.current).toMatchObject({ revision: 5, creator: '64b0000000000000000000aa' });
    expect(models.CyberiaMap.current.preview).toBeUndefined();
    expect(models.CyberiaMap.current.media.revision).toBe(5);
  });

  it('keeps a custom thumbnail, and releases it once the map uses its preview again', async () => {
    await save(4, { thumbnail: '64b0000000000000000000c1' });
    expect(models.CyberiaMap.current.thumbnail).toBe('64b0000000000000000000c1');
    await save(5, { thumbnail: null });
    expect(models.CyberiaMap.current.thumbnail).toBeNull();
    expect(deleted.map(String)).toEqual(['64b0000000000000000000c1']);
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
