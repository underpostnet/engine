import { describe, it, expect, beforeEach, vi } from 'vitest';

// The provider under the cache: an in-memory Valkey with the commands the cache uses.
const store = new Map();
const valkey = { connected: true, failing: false };
const command =
  (fn) =>
  (...args) => {
    if (valkey.failing) throw new Error('connection lost');
    return fn(...args);
  };
const client = {
  scan: async (cursor, _match, pattern, _count) => {
    const prefix = pattern.replace(/\*$/, '');
    return ['0', [...store.keys()].filter((key) => key.startsWith(prefix))];
  },
  del: async (...keys) => keys.filter((key) => store.delete(key)).length,
};
vi.mock('../../../src/db/valkey/Valkey.js', () => ({
  ValkeyAPI: {
    isConnected: () => valkey.connected,
    get: command(async (_options, key) => {
      const raw = store.get(key);
      return raw === undefined ? null : JSON.parse(raw);
    }),
    set: command(async (_options, key, payload) => {
      store.set(key, typeof payload === 'string' ? JSON.stringify(payload) : JSON.stringify(payload));
      return 'OK';
    }),
    incr: command(async (_options, key) => {
      const next = (Number(JSON.parse(store.get(key) ?? '0')) || 0) + 1;
      store.set(key, JSON.stringify(String(next)));
      return next;
    }),
    client: () => client,
  },
}));

const { CacheService, CACHE_POLICY } = await import('../../../src/server/storage/cache.js');
const { runInContentView } = await import('../../../src/db/content-view.js');

const options = { host: 'objectlayer.org', path: '/' };
const loader = (value) => vi.fn(async () => value);

beforeEach(() => {
  store.clear();
  valkey.connected = true;
  valkey.failing = false;
});

describe('a cache namespace', () => {
  it('is keyed by environment, deployment context and resource', () => {
    const namespace = CacheService.namespace(options, 'object-layer', CACHE_POLICY.registry);
    expect(namespace.prefix).toBe(`cache:${process.env.NODE_ENV || 'development'}:objectlayer.org/:object-layer`);
    expect(namespace.ttlMs).toBe(CACHE_POLICY.registry.ttlMs);
    expect(CacheService.namespace({ host: 'a', path: '/x' }, 'r').prefix).not.toBe(
      CacheService.namespace({ host: 'b', path: '/x' }, 'r').prefix,
    );
  });

  it('gives one variant to one query, in any parameter order', () => {
    expect(CacheService.variant({ page: '1', limit: '10' })).toBe(CacheService.variant({ limit: '10', page: '1' }));
    expect(CacheService.variant(undefined)).toBe(CacheService.variant({}));
  });

  it('gives another variant to another value, another order of one parameter, or another split', () => {
    expect(CacheService.variant({ page: '1' })).not.toBe(CacheService.variant({ page: '2' }));
    expect(CacheService.variant({ tag: ['a', 'b'] })).not.toBe(CacheService.variant({ tag: ['b', 'a'] }));
    expect(CacheService.variant({ q: 'a&b=c' })).not.toBe(CacheService.variant({ q: 'a', b: 'c' }));
  });
});

describe('a cache-aside read', () => {
  const namespace = CacheService.namespace(options, 'object-layer', CACHE_POLICY.registry);

  it('loads once and answers from the cache after that', async () => {
    const load = loader({ data: [1, 2] });
    const read = () => CacheService.getOrLoad(namespace, { identifier: 'list', variant: 'a', load });
    expect(await read()).toEqual({ data: [1, 2] });
    expect(await read()).toEqual({ data: [1, 2] });
    expect(load).toHaveBeenCalledTimes(1);
    expect([...store.keys()].some((key) => key.includes(':v0:workspace.public:list:a'))).toBe(true);
  });

  it('shares one load between concurrent misses', async () => {
    const load = vi.fn(() => new Promise((resolve) => setTimeout(() => resolve('value'), 20)));
    const reads = [1, 2, 3].map(() => CacheService.getOrLoad(namespace, { identifier: 'slow', load }));
    expect(await Promise.all(reads)).toEqual(['value', 'value', 'value']);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('separates the content views and the scopes of a request', async () => {
    const read = (scope) => CacheService.getOrLoad(namespace, { identifier: 'list', scope, load: loader(scope) });
    expect(await runInContentView('served', () => read('public'))).toBe('public');
    expect(await runInContentView('workspace', () => read('public'))).toBe('public');
    expect(await read('user:1')).toBe('user:1');
    expect([...store.keys()].filter((key) => key.includes(':list:')).length).toBe(3);
  });

  it('does not keep an empty answer', async () => {
    const load = loader(null);
    await CacheService.getOrLoad(namespace, { identifier: 'missing', load });
    await CacheService.getOrLoad(namespace, { identifier: 'missing', load });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('round-trips a binary value', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]);
    const read = () => CacheService.getOrLoad(namespace, { identifier: 'still', load: loader(png), binary: true });
    expect(await read()).toEqual(png);
    expect(Buffer.isBuffer(await read())).toBe(true);
    expect(await read()).toEqual(png);
  });
});

describe('invalidation', () => {
  const namespace = CacheService.namespace(options, 'object-layer', CACHE_POLICY.registry);

  it('bumps the namespace version, so every variant and scope reloads and no key is scanned', async () => {
    const load = loader('old');
    await CacheService.getOrLoad(namespace, { identifier: 'list', variant: 'a', load });
    await CacheService.getOrLoad(namespace, { identifier: 'list', variant: 'b', load });
    await CacheService.invalidate(namespace);
    const fresh = loader('new');
    expect(await CacheService.getOrLoad(namespace, { identifier: 'list', variant: 'a', load: fresh })).toBe('new');
    expect(await CacheService.getOrLoad(namespace, { identifier: 'list', variant: 'b', load: fresh })).toBe('new');
    expect(fresh).toHaveBeenCalledTimes(2);
    expect(store.get(`${namespace.prefix}:version`)).toBe(JSON.stringify('1'));
    expect([...store.keys()].filter((key) => key.includes(':v0:')).length).toBe(2);
  });

  it('leaves another resource untouched', async () => {
    const other = CacheService.namespace(options, 'item-ledger', CACHE_POLICY.registry);
    const load = loader('kept');
    await CacheService.getOrLoad(other, { identifier: 'list', load });
    await CacheService.invalidate(namespace);
    await CacheService.getOrLoad(other, { identifier: 'list', load });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('clears one deployment context, as the operator asks, and no other', async () => {
    const elsewhere = CacheService.namespace({ host: 'www.cyberiaonline.com', path: '/' }, 'cyberia-map');
    await CacheService.getOrLoad(namespace, { identifier: 'list', load: loader(1) });
    await CacheService.getOrLoad(elsewhere, { identifier: 'list', load: loader(2) });
    expect(await CacheService.clear(options)).toBe(1);
    expect([...store.keys()]).toEqual([`${elsewhere.prefix}:v0:workspace.public:list:`]);
  });
});

describe('a failing provider', () => {
  const namespace = CacheService.namespace(options, 'object-layer', CACHE_POLICY.registry);

  it('is bypassed when not connected: the loader answers every time', async () => {
    valkey.connected = false;
    const load = loader('live');
    expect(await CacheService.getOrLoad(namespace, { identifier: 'list', load })).toBe('live');
    expect(await CacheService.getOrLoad(namespace, { identifier: 'list', load })).toBe('live');
    expect(load).toHaveBeenCalledTimes(2);
    expect(store.size).toBe(0);
    await expect(CacheService.invalidate(namespace)).resolves.toBeUndefined();
  });

  it('never fails a read: an error degrades to the loader', async () => {
    valkey.failing = true;
    expect(await CacheService.getOrLoad(namespace, { identifier: 'list', load: loader('live') })).toBe('live');
    await expect(CacheService.invalidate(namespace)).resolves.toBeUndefined();
  });
});
