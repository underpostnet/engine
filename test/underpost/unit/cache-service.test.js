import { describe, it, expect, beforeEach, vi } from 'vitest';

// The provider under the cache: an in-memory Valkey with the commands the cache uses.
const store = new Map();
// `versionGate` holds the answer of a version read, taken when the command runs, until it opens.
const valkey = { connected: true, failing: false, versionGate: null };
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
      if (valkey.versionGate && key.endsWith(':version')) await valkey.versionGate;
      return raw === undefined ? null : JSON.parse(raw);
    }),
    set: command(async (_options, key, payload) => {
      store.set(key, typeof payload === 'string' ? JSON.stringify(payload) : JSON.stringify(payload));
      return 'OK';
    }),
    client: () => client,
  },
}));

const { CacheService, CACHE_POLICY } = await import('../../../src/server/storage/cache.js');
const { recordServedDatabases } = await import('../../../src/db/served-databases.js');

const options = { host: 'objectlayer.org', path: '/' };
const loader = (value) => vi.fn(async () => value);

beforeEach(() => {
  store.clear();
  valkey.connected = true;
  valkey.failing = false;
  valkey.versionGate = null;
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
    const version = JSON.parse(store.get(`${namespace.prefix}:version`));
    expect([...store.keys()].some((key) => key.includes(`:v${version}:base.public:list:a`))).toBe(true);
  });

  it('shares one load between concurrent misses', async () => {
    const load = vi.fn(() => new Promise((resolve) => setTimeout(() => resolve('value'), 20)));
    const reads = [1, 2, 3].map(() => CacheService.getOrLoad(namespace, { identifier: 'slow', load }));
    expect(await Promise.all(reads)).toEqual(['value', 'value', 'value']);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('gives the concurrent first reads of a namespace one version, so the next read is a hit', async () => {
    const fresh = CacheService.namespace(options, 'first-reads', CACHE_POLICY.registry);
    const load = vi.fn(() => new Promise((resolve) => setTimeout(() => resolve('drawn'), 20)));
    const read = () => CacheService.getOrLoad(fresh, { identifier: 'picture', load });
    expect(await Promise.all([read(), read(), read()])).toEqual(['drawn', 'drawn', 'drawn']);
    expect(await read()).toBe('drawn');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('separates the scopes of a request', async () => {
    const read = (scope) => CacheService.getOrLoad(namespace, { identifier: 'list', scope, load: loader(scope) });
    expect(await read('public')).toBe('public');
    expect(await read('user:1')).toBe('user:1');
    expect([...store.keys()].filter((key) => key.includes(':list:')).length).toBe(2);
  });

  it('keeps the served data of each bound database apart, so a rollback reads its own values again', async () => {
    const served = (value) => CacheService.getOrLoad(namespace, { identifier: 'release', load: loader(value) });
    try {
      expect(await served('base data')).toBe('base data');
      recordServedDatabases('objectlayer.org/', 'content=release-a');
      expect(await served('release a')).toBe('release a');
      recordServedDatabases('objectlayer.org/', 'content=release-b');
      expect(await served('release b')).toBe('release b');
      recordServedDatabases('objectlayer.org/', 'content=release-a');
      expect(await served('not loaded')).toBe('release a');
      recordServedDatabases('objectlayer.org/', '');
      expect(await served('not loaded')).toBe('base data');
    } finally {
      recordServedDatabases('objectlayer.org/', '');
    }
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
    const before = JSON.parse(store.get(`${namespace.prefix}:version`));
    await CacheService.invalidate(namespace);
    const fresh = loader('new');
    expect(await CacheService.getOrLoad(namespace, { identifier: 'list', variant: 'a', load: fresh })).toBe('new');
    expect(await CacheService.getOrLoad(namespace, { identifier: 'list', variant: 'b', load: fresh })).toBe('new');
    expect(fresh).toHaveBeenCalledTimes(2);
    expect(JSON.parse(store.get(`${namespace.prefix}:version`))).not.toBe(before);
    expect([...store.keys()].filter((key) => key.includes(`:v${before}:`)).length).toBe(2);
  });

  it('never reads an old value again once the version key expires or is evicted, and the next invalidation finds none either', async () => {
    const versionKey = `${namespace.prefix}:version`;
    await CacheService.getOrLoad(namespace, { identifier: 'list', load: loader('first') });
    await CacheService.invalidate(namespace);
    await CacheService.getOrLoad(namespace, { identifier: 'list', load: loader('second') });
    const versions = new Set([JSON.parse(store.get(versionKey))]);
    for (let evictions = 0; evictions < 3; evictions++) {
      store.delete(versionKey);
      const reload = loader('current');
      expect(await CacheService.getOrLoad(namespace, { identifier: 'list', load: reload })).toBe('current');
      expect(reload).toHaveBeenCalledTimes(1);
      await CacheService.invalidate(namespace);
      const after = loader('after');
      expect(await CacheService.getOrLoad(namespace, { identifier: 'list', load: after })).toBe('after');
      expect(after).toHaveBeenCalledTimes(1);
      expect(versions.has(JSON.parse(store.get(versionKey)))).toBe(false);
      versions.add(JSON.parse(store.get(versionKey)));
    }
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
    expect(await CacheService.clear(options)).toBe(2);
    expect([...store.keys()].every((key) => key.startsWith(elsewhere.prefix))).toBe(true);
    expect([...store.keys()].some((key) => key.endsWith(':base.public:list:'))).toBe(true);
  });
});

describe('reads concurrent with an invalidation', () => {
  const read = (namespace, load) => CacheService.getOrLoad(namespace, { identifier: 'list', load });
  const gate = () => {
    let open;
    const opened = new Promise((resolve) => (open = resolve));
    return { opened, open };
  };

  it('never gives a read that starts after an invalidation the load of a read before it, and keeps the old value off the new version', async () => {
    const namespace = CacheService.namespace(options, 'slow-load', CACHE_POLICY.registry);
    const slow = gate();
    const before = read(namespace, () => slow.opened.then(() => 'old'));
    await vi.waitFor(() => expect([...store.keys()].some((key) => key.endsWith(':version'))).toBe(true));
    await CacheService.invalidate(namespace);
    const after = read(namespace, loader('new'));
    slow.open();
    expect(await before).toBe('old');
    expect(await after).toBe('new');
    const later = loader('later');
    expect(await read(namespace, later)).toBe('new');
    expect(later).not.toHaveBeenCalled();
  });

  it('never gives a read that starts after an invalidation the version a read before it took', async () => {
    const namespace = CacheService.namespace(options, 'slow-version', CACHE_POLICY.registry);
    await read(namespace, loader('old'));
    const slow = gate();
    valkey.versionGate = slow.opened;
    const before = read(namespace, loader('unused'));
    await CacheService.invalidate(namespace);
    const after = read(namespace, loader('new'));
    slow.open();
    expect(await before).toBe('old');
    expect(await after).toBe('new');
  });

  it('applies an invalidation the provider missed once it answers again, and answers from the loader until then', async () => {
    for (const outage of ['connected', 'failing']) {
      const namespace = CacheService.namespace(options, `outage-${outage}`, CACHE_POLICY.registry);
      const versionKey = `${namespace.prefix}:version`;
      await read(namespace, loader('old'));
      const stored = store.get(versionKey);
      valkey[outage] = outage === 'failing';
      await CacheService.invalidate(namespace);
      expect(await read(namespace, loader('during'))).toBe('during');
      expect(store.get(versionKey)).toBe(stored);
      Object.assign(valkey, { connected: true, failing: false });
      const fresh = loader('new');
      expect(await read(namespace, fresh)).toBe('new');
      expect(await read(namespace, fresh)).toBe('new');
      expect(fresh).toHaveBeenCalledTimes(1);
      expect(store.get(versionKey)).not.toBe(stored);
    }
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
