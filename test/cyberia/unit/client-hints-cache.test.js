import { describe, it, expect, vi } from 'vitest';

// An in-memory Valkey with the commands the cache uses.
const store = new Map();
vi.mock('../../../src/db/valkey/Valkey.js', () => ({
  ValkeyAPI: {
    isConnected: () => true,
    get: async (_options, key) => (store.has(key) ? JSON.parse(store.get(key)) : null),
    set: async (_options, key, value) => store.set(key, JSON.stringify(value)),
    incr: async (_options, key) => {
      const next = Number(JSON.parse(store.get(key) ?? '"0"')) + 1;
      store.set(key, JSON.stringify(String(next)));
      return next;
    },
  },
}));

// One instance conf, as the served content database holds it.
const models = vi.hoisted(() => {
  const conf = { _id: 'c1', code: 'FOREST', interpolationMs: 100 };
  return {
    CyberiaClientHints: { findOne: () => ({ lean: async () => null }) },
    CyberiaInstanceConf: {
      findOne: vi.fn(({ code }) => ({ lean: async () => (code === conf.code ? { ...conf } : null) })),
      findByIdAndUpdate: async (id, changes) => Object.assign(conf, changes),
    },
  };
});
vi.mock('../../../src/db/DataBaseProvider.js', () => ({
  DataBaseProviderService: { getModel: (name) => models[name] },
}));

const { resolveClientHints } = await import('../../../src/api/cyberia-client-hints/cyberia-client-hints.service.js');
const { CyberiaInstanceConfService } =
  await import('../../../src/api/cyberia-instance-conf/cyberia-instance-conf.service.js');

const options = { host: 'www.cyberiaonline.com', path: '/' };
const interpolation = async () => (await resolveClientHints('FOREST', options)).data.interpolationMs;

describe('the client hints of a live instance conf', () => {
  it('answers from the cache, and answers a conf change at once', async () => {
    expect(await interpolation()).toBe(100);
    expect(await interpolation()).toBe(100);
    expect(models.CyberiaInstanceConf.findOne).toHaveBeenCalledOnce();

    await CyberiaInstanceConfService.put({ params: { id: 'c1' }, body: { interpolationMs: 250 } }, {}, options);
    expect(await interpolation()).toBe(250);
  });
});
