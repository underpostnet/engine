import { beforeEach, describe, expect, it, vi } from 'vitest';

const models = {};
const invalidate = vi.fn();
vi.mock('../../../src/projects/cyberia/instance/map-registry.js', () => ({
  registryModels: () => models,
  registryTransaction: async (models, write) => ({ value: await write({}) }),
}));
vi.mock('../../../src/db/DataBaseProvider.js', () => ({
  DataBaseProviderService: { getModel: (name) => models[name] },
}));
vi.mock('../../../src/server/storage/cache.js', () => ({
  CacheService: { namespace: () => 'maps', invalidate },
}));
vi.mock('../../../src/projects/cyberia/instance/map-preview-generator.js', () => ({
  refreshMapMedia: async () => null,
}));

const { CyberiaMapService } = await import('../../../src/api/cyberia-map/cyberia-map.service.js');
const { CyberiaMapModel } = await import('../../../src/api/cyberia-map/cyberia-map.model.js');
const user = { _id: '64b0000000000000000000aa', role: 'admin' };
const create = (body) => CyberiaMapService.post({ body, auth: { user } }, {}, {});

describe('map clone creation', () => {
  let save;

  beforeEach(() => {
    invalidate.mockReset();
    save = vi.fn(async function () {
      return this;
    });
    let created;
    models.CyberiaMap = function (body) {
      created = new CyberiaMapModel(body);
      created.save = save;
      return created;
    };
    models.CyberiaMap.findById = async () => created;
    models.CyberiaInstance = { find: () => ({ lean: async () => [] }) };
  });

  it('creates the map with the entered code and edited metadata', async () => {
    const body = { code: 'map-test-b', name: 'Map B', description: 'Edited map', tags: ['test'] };
    const map = await create(body);
    expect(map.toObject()).toMatchObject({ ...body, revision: 1 });
    expect(String(map.creator)).toBe(user._id);
    expect(save).toHaveBeenCalledOnce();
    expect(invalidate).toHaveBeenCalledExactlyOnceWith('maps');
    expect(body.code).toBe('map-test-b');
  });

  it('starts the media of revision 1 pending, and takes no preview from the client', async () => {
    const map = await create({ code: 'map-test-c', preview: '64b0000000000000000000ff', media: { revision: 7 } });
    expect(map.toObject().media).toMatchObject({ revision: 1, status: 'pending' });
    expect(map.toObject().preview).toBeUndefined();
  });

  it.each([{ keyPattern: { code: 1 } }, { keyValue: { code: 'map-test-b' } }])(
    'rejects an existing code with a clear conflict error: %j',
    async (details) => {
      save.mockRejectedValueOnce(Object.assign(new Error('duplicate key'), { code: 11000, ...details }));
      await expect(create({ code: 'map-test-b' })).rejects.toMatchObject({
        status: 409,
        message: 'Map code "map-test-b" already exists. Enter a different code.',
      });
      expect(save).toHaveBeenCalledOnce();
      expect(invalidate).not.toHaveBeenCalled();
    },
  );

  it.each([
    new Error('database unavailable'),
    Object.assign(new Error('duplicate registry key'), { code: 11000, keyPattern: { mapCode: 1 } }),
  ])('keeps other database errors: %s', async (error) => {
    save.mockRejectedValueOnce(error);
    await expect(create({ code: 'map-test-b' })).rejects.toBe(error);
    expect(invalidate).not.toHaveBeenCalled();
  });
});
