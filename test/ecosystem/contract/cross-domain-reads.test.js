import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { cyberiaContext } from '../../support/product-context.js';

const models = {};
const deploy = vi.hoisted(() => ({ conf: null }));
vi.mock('../../../src/server/domain/consumed-api.js', async (importOriginal) => ({
  ...(await importOriginal()),
  deployConfServer: () => deploy.conf,
}));
vi.mock('../../../src/db/DataBaseProvider.js', () => ({
  DataBaseProviderService: {
    getModel: (name) => {
      if (!models[name]) throw new Error(`model ${name} not loaded`);
      return models[name];
    },
  },
}));
// The atlas store needs the Cyberia catalog packages; no suite here reaches it.
vi.mock('../../../src/api/atlas-sprite-sheet/atlas-sprite-sheet.store.js', () => ({ AtlasSpriteSheetStore: {} }));

const { resolveLedgerBindings, resolveObjectLayer, resolveTokenSupply, publishObjectLayer } =
  await import('../../../src/server/domain/object-layer-resolver.js');
const { clearDomainCache, domainOrigin } = await import('../../../src/server/domain/domain-client.js');
const { loadApiExtension } = await import('../../../src/server/domain/consumed-api.js');
const { developmentOrigins, hostPortsFactory, localHostAddress } =
  await import('../../../src/server/network/router.js');
const { contentViewOf, isServiceKey, jwtSign, servicePrincipal } = await import('../../../src/server/security/auth.js');
const { cacheCanonical, isObjectLayerAuthority, publishDefinition } =
  await import('../../../src/api/object-layer/object-layer.publication.js');
const { ObjectLayerService } = await import('../../../src/api/object-layer/object-layer.service.js');
const { apiDocsModulesFactory } = await import('../../../src/server/build/docs.js');
const { objectLayerIdentity } = await import('../../../src/api/object-layer/object-layer.identity.js');

const definition = {
  profile: { id: 'cyberia', version: 2 },
  data: { item: { id: 'hatchet', type: 'weapon' }, stats: {} },
};
const { cid } = objectLayerIdentity(definition);
const consumer = { host: 'www.cyberiaonline.com', path: '/', consumes: { 'object-layer': 'object-layer' } };

let calls = [];
const respond = (status, body) => ({ ok: status < 400, status, json: async () => body });

beforeEach(() => {
  calls = [];
  clearDomainCache();
  for (const key of Object.keys(models)) delete models[key];
  vi.stubGlobal('fetch', async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('/object-layer/canonical'))
      return respond(200, { data: { cid, contentHash: 'h', created: true } });
    if (String(url).includes('/item-ledger/cid/'))
      return respond(200, { data: { data: [{ objectLayerCid: cid, tokenId: '7' }] } });
    return respond(200, { data: { cid, source: 'authority' } });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  deploy.conf = null;
  delete process.env.OBJECT_LAYER_API_ORIGIN;
  delete process.env.ITEM_LEDGER_API_ORIGIN;
  delete process.env.DOMAIN_API_SERVICE_KEY;
});

const localObjectLayer = () => ({ findByCid: () => ({ lean: async () => ({ cid, source: 'local' }) }) });

describe('Object Layer resolution', () => {
  it('reads the owner model on the Object Layer host, even with an authority origin set', async () => {
    process.env.OBJECT_LAYER_API_ORIGIN = 'https://objectlayer.org';
    models.ObjectLayer = localObjectLayer();
    expect(await resolveObjectLayer(cid, { host: 'objectlayer.org', path: '/' })).toEqual({ cid, source: 'local' });
    expect(calls).toHaveLength(0);
  });

  it('asks the authority from Cyberia, which consumes Object Layer', async () => {
    process.env.OBJECT_LAYER_API_ORIGIN = 'https://objectlayer.org';
    models.ObjectLayer = localObjectLayer();
    expect(await resolveObjectLayer(cid, consumer)).toEqual({ cid, source: 'authority' });
    expect(calls[0].url).toBe(`https://objectlayer.org/api/v1/object-layer/${cid}`);
  });

  it('asks the authority from ItemLedger, which holds no Object Layer model', async () => {
    process.env.OBJECT_LAYER_API_ORIGIN = 'https://objectlayer.org';
    expect(await resolveObjectLayer(cid, { host: 'itemledger.com', path: '/' })).toEqual({ cid, source: 'authority' });
  });

  it('reads the consumer cache only when no authority origin is configured', async () => {
    models.ObjectLayer = localObjectLayer();
    expect(await resolveObjectLayer(cid, consumer)).toEqual({ cid, source: 'local' });
    delete models.ObjectLayer;
    expect(await resolveObjectLayer(cid, consumer)).toBeNull();
  });

  it('publishes only the canonical content, with the service key', async () => {
    process.env.OBJECT_LAYER_API_ORIGIN = 'https://objectlayer.org';
    process.env.DOMAIN_API_SERVICE_KEY = 'service-key';
    const stored = await publishObjectLayer({
      ...definition,
      _id: 'local-id',
      cid,
      origin: 'draft',
      data: { ...definition.data, ledger: { tokenId: '1' } },
    });
    expect(stored.cid).toBe(cid);
    const call = calls[0];
    expect(call.url).toBe('https://objectlayer.org/api/v1/object-layer/canonical');
    expect(call.init.headers.authorization).toBe('Bearer service-key');
    const body = JSON.parse(call.init.body);
    expect(Object.keys(body).sort()).toEqual(['data', 'profile', 'schemaVersion']);
    expect(body.data.ledger).toBeUndefined();
  });
});

describe('ItemLedger resolution', () => {
  it('reads the ledger over its API from any other domain', async () => {
    process.env.ITEM_LEDGER_API_ORIGIN = 'https://itemledger.com';
    const bindings = await resolveLedgerBindings(cid, consumer);
    expect(bindings).toEqual([{ objectLayerCid: cid, tokenId: '7' }]);
    expect(calls[0].url).toBe(`https://itemledger.com/api/v1/item-ledger/cid/${cid}`);
  });

  it('answers unregistered, not an error, when the ledger is not configured', async () => {
    expect(await resolveLedgerBindings(cid, consumer)).toEqual([]);
    expect(await resolveTokenSupply({ chainId: 1, contractAddress: '0x0', tokenId: '1' }, consumer)).toBeNull();
  });
});

describe('cross-domain credentials', () => {
  it('accepts the service key in constant time, and nothing when it is unset', () => {
    expect(isServiceKey('anything')).toBe(false);
    process.env.DOMAIN_API_SERVICE_KEY = 'k'.repeat(64);
    expect(isServiceKey('k'.repeat(64))).toBe(true);
    expect(isServiceKey('k'.repeat(63))).toBe(false);
    expect(isServiceKey('')).toBe(false);
  });

  it('acts as a moderator of the receiving host, never as a user', () => {
    const principal = servicePrincipal(
      { headers: { 'x-domain-origin': 'www.cyberiaonline.com<script>' } },
      {
        host: 'objectlayer.org',
        path: '/',
      },
    );
    expect(principal).toEqual({
      _id: 'service:www.cyberiaonline.comscript',
      role: 'moderator',
      username: 'www.cyberiaonline.comscript',
      host: 'objectlayer.org',
      path: '/',
      service: true,
    });
  });
});

describe('documentation ownership', () => {
  it('documents a consumed API at its owner, never at the consumer', () => {
    const apis = ['cyberia-map', 'object-layer', 'atlas-sprite-sheet'];
    const consumes = { 'object-layer': 'object-layer', 'atlas-sprite-sheet': 'object-layer' };
    expect(apiDocsModulesFactory({ docs: { api: apis }, apis, consumes })).toEqual(['cyberia-map']);
    expect(apiDocsModulesFactory({ docs: { api: apis }, apis })).toEqual(apis);
  });
});

describe('database boundaries', () => {
  const root = new URL('../../..', import.meta.url).pathname;
  const sources = (dir) =>
    fs
      .readdirSync(path.join(root, dir), { recursive: true })
      .filter((file) => file.endsWith('.js'))
      .map((file) => ({ file: path.join(dir, file), text: fs.readFileSync(path.join(root, dir, file), 'utf8') }));
  const modelReads = (text, names) => names.filter((name) => new RegExp(`getModel\\(\\s*['"]${name}['"]`).test(text));

  it('keeps ItemLedger code off the Object Layer collections', () => {
    for (const dir of [
      'src/api/item-ledger',
      'src/api/item-ledger-transfer',
      'src/api/item-ledger-balance',
      'src/api/item-ledger-checkpoint',
    ])
      for (const { file, text } of sources(dir))
        expect(
          modelReads(text, ['ObjectLayer', 'object-layer', 'AtlasSpriteSheet', 'atlas-sprite-sheet']),
          file,
        ).toEqual([]);
  });

  it('keeps Object Layer code off the ItemLedger collections', () => {
    for (const dir of ['src/api/object-layer', 'src/api/object-layer-render-frames', 'src/api/atlas-sprite-sheet'])
      for (const { file, text } of sources(dir))
        expect(
          modelReads(text, [
            'ItemLedger',
            'item-ledger',
            'ItemLedgerBalance',
            'ItemLedgerTransfer',
            'ItemLedgerCheckpoint',
          ]),
          file,
        ).toEqual([]);
  });

  it('keeps the canonical protocol free of Cyberia modules', () => {
    for (const file of [
      'src/client/components/object-layer/ObjectLayerProtocol.js',
      'src/api/object-layer/object-layer.identity.js',
    ]) {
      const text = fs.readFileSync(path.join(root, file), 'utf8');
      expect(text, file).not.toMatch(/from ['"][^'"]*cyberia[^'"]*['"]/i);
    }
  });
});

describe('one canonical writer', () => {
  const authority = { host: 'objectlayer.org', path: '/', consumes: {} };
  const ORIGINS = ['draft', 'cache', 'canonical'];
  /** The identity store of one host: the origin only moves up. */
  const store = () => {
    const docs = new Map();
    return {
      docs,
      upsertByIdentity: async (payload, { origin }) => {
        const identity = objectLayerIdentity(payload);
        const doc = docs.get(identity.cid) ?? { ...identity, origin };
        if (ORIGINS.indexOf(origin) > ORIGINS.indexOf(doc.origin)) doc.origin = origin;
        docs.set(identity.cid, doc);
        return { ...doc };
      },
    };
  };

  it('names the authority by what the host consumes', () => {
    expect(isObjectLayerAuthority(authority)).toBe(true);
    expect(isObjectLayerAuthority(consumer)).toBe(false);
  });

  it('refuses the canonical write on a host that consumes Object Layer', async () => {
    await expect(ObjectLayerService.post({ path: '/canonical', body: definition }, {}, consumer)).rejects.toThrow(
      /publish at the Object Layer authority/,
    );
  });

  it('answers the cross-domain read with the one definition a cid names, or 404', async () => {
    const answer = { cid, contentHash: 'h', origin: 'canonical' };
    const stored = { ...answer, populate: async () => stored, toJSON: () => answer };
    const query = (doc) => ({ select: () => query(doc), populate: () => query(doc), then: (ok) => ok(doc) });
    models.ObjectLayer = { findByCid: (key) => query(key === cid ? stored : null) };
    const get = (id) => ObjectLayerService.get({ path: `/${id}`, params: { id }, query: {} }, {}, authority);
    expect(await get(cid)).toEqual(answer);
    const unknown = objectLayerIdentity({ ...definition, data: { ...definition.data, stats: { effect: 2 } } }).cid;
    await expect(get(unknown)).rejects.toMatchObject({ status: 404 });
  });

  it('keeps a draft when no authority is configured', async () => {
    const ObjectLayer = store();
    const publish = vi.fn();
    await expect(publishDefinition({ ObjectLayer, payload: definition, options: consumer, publish })).rejects.toThrow(
      `Object Layer ${cid} is kept as a draft: no Object Layer authority is configured`,
    );
    expect(publish).not.toHaveBeenCalled();
    expect(ObjectLayer.docs.get(cid).origin).toBe('draft');
  });

  it('keeps a draft when the authority stores other content', async () => {
    process.env.OBJECT_LAYER_API_ORIGIN = 'https://objectlayer.org';
    const ObjectLayer = store();
    const publish = async () => ({ cid: 'bafkreiother' });
    await expect(publishDefinition({ ObjectLayer, payload: definition, options: consumer, publish })).rejects.toThrow(
      /the authority stored it as bafkreiother/,
    );
    expect(ObjectLayer.docs.get(cid).origin).toBe('draft');
  });

  it('caches what the authority stored, and publishes a definition once', async () => {
    process.env.OBJECT_LAYER_API_ORIGIN = 'https://objectlayer.org';
    const ObjectLayer = store();
    const publish = vi.fn(async (draft) => ({ cid: draft.cid }));
    expect((await publishDefinition({ ObjectLayer, payload: definition, options: consumer, publish })).origin).toBe(
      'cache',
    );
    expect((await publishDefinition({ ObjectLayer, payload: definition, options: consumer, publish })).origin).toBe(
      'cache',
    );
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('caches only content whose identity is the cid asked for', async () => {
    const other = objectLayerIdentity({ ...definition, data: { ...definition.data, stats: { effect: 1 } } }).cid;
    await expect(cacheCanonical({ ObjectLayer: store(), cid: other, definition })).rejects.toThrow(
      `The authority answered ${other} with content that hashes to ${cid}`,
    );
  });
});

describe('authoring view', () => {
  const host = { host: 'www.cyberiaonline.com', path: '/' };
  const bearer = (token) => ({ headers: { authorization: `Bearer ${token}` } });
  const token = (role, options = host) => jwtSign({ _id: 'u1', role }, options, 5, 10);

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-jwt-secret';
    process.env.DOMAIN_API_SERVICE_KEY = 'service-key';
  });
  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  it('shows the workspace to a moderator of the host only', () => {
    expect(contentViewOf(bearer(token('moderator')), host)).toBe('workspace');
    expect(contentViewOf(bearer(token('admin')), host)).toBe('workspace');
    expect(contentViewOf(bearer(token('user')), host)).toBe('served');
    expect(contentViewOf(bearer(token('moderator', { host: 'objectlayer.org', path: '/' })), host)).toBe('served');
  });

  it('serves the promoted release to everyone else', () => {
    expect(contentViewOf({ headers: {} }, host)).toBe('served');
    expect(contentViewOf(bearer('service-key'), host)).toBe('served');
    expect(contentViewOf(bearer('not-a-token'), host)).toBe('served');
  });
});

describe('API extensions', () => {
  it('mounts an API as its owner ships it when the host declares no extension', async () => {
    expect(await loadApiExtension('object-layer', {})).toBeUndefined();
    expect(await loadApiExtension('object-layer')).toBeUndefined();
  });

  it('refuses an extension name that is not a project', async () => {
    await expect(loadApiExtension('object-layer', { 'object-layer': '../cyberia' })).rejects.toThrow(
      /Invalid extension project/,
    );
  });

  it.skipIf(!cyberiaContext)('loads the Cyberia Studio extensions with the hooks the generic APIs read', async () => {
    const objectLayer = await loadApiExtension('object-layer', { 'object-layer': 'cyberia' });
    for (const hook of ['mount', 'resolveKey', 'beforeDelete']) expect(typeof objectLayer[hook], hook).toBe('function');
    const atlas = await loadApiExtension('atlas-sprite-sheet', { 'atlas-sprite-sheet': 'cyberia' });
    for (const hook of ['mount', 'resolveKey']) expect(typeof atlas[hook], hook).toBe('function');
  });
});

describe('local domain addresses', () => {
  const conf = {
    'www.underpost.net': { '/': { apis: ['core'] } },
    'objectlayer.org': { '/': { apis: ['object-layer'] }, '/docs': { apis: [], singleReplica: true } },
    'itemledger.com': { '/': { apis: ['item-ledger'] } },
    'www.cyberiaonline.com': {
      '/': { apis: ['object-layer', 'cyberia-instance'], consumes: { 'object-layer': 'object-layer' }, peer: true },
    },
  };
  const port = process.env.PORT;
  afterEach(() => {
    if (port === undefined) delete process.env.PORT;
    else process.env.PORT = port;
  });

  it('reaches the owner host on the port the proxy routes it by', () => {
    process.env.PORT = '4000';
    deploy.conf = conf;
    const ports = hostPortsFactory(conf);
    expect(domainOrigin('object-layer')).toBe(`http://127.0.0.1:${ports['objectlayer.org/']}`);
    expect(domainOrigin('item-ledger')).toBe(`http://127.0.0.1:${ports['itemledger.com/']}`);
    expect(domainOrigin('cyberia')).toBe(`http://127.0.0.1:${ports['www.cyberiaonline.com/']}`);
  });

  it('prefers the configured address, and has none for a deploy that owns nothing', () => {
    process.env.PORT = '4000';
    deploy.conf = conf;
    process.env.OBJECT_LAYER_API_ORIGIN = 'https://objectlayer.org';
    expect(domainOrigin('object-layer')).toBe('https://objectlayer.org');
    deploy.conf = { 'www.underpost.net': { '/': { apis: ['core'] } } };
    expect(domainOrigin('item-ledger')).toBe('');
  });

  it('gives a development browser the same port map, and no address for an unserved host', () => {
    process.env.PORT = '4000';
    const ports = hostPortsFactory(conf);
    expect(localHostAddress(conf, 'objectlayer.org')).toBe(`localhost:${ports['objectlayer.org/']}`);
    expect(localHostAddress(conf, 'www.cyberiaonline.com', '/peer')).toBe(
      `localhost:${ports['www.cyberiaonline.com/peer']}`,
    );
    expect(localHostAddress(conf, 'objectlayer.org', '/docs')).toBe('');
    expect(localHostAddress(conf, 'cryptokoyn.net')).toBe('');
  });

  it('lets a development origin in through the dev proxy or its local port, never a stranger', () => {
    process.env.PORT = '4000';
    process.env.DEV_PROXY_PORT_OFFSET = '0';
    const ports = hostPortsFactory(conf);
    const origins = developmentOrigins(conf, ['https://itemledger.com', 'https://server.cyberiaonline.com']);
    expect(origins).toEqual([
      'https://itemledger.com',
      'https://server.cyberiaonline.com',
      'http://itemledger.com',
      `http://localhost:${ports['itemledger.com/']}`,
      'http://server.cyberiaonline.com',
    ]);
    expect(developmentOrigins(conf, [])).toEqual([]);
  });
});

describe('module boundaries', () => {
  const root = new URL('../../..', import.meta.url).pathname;
  const files = (dir) =>
    fs
      .readdirSync(path.join(root, dir), { recursive: true })
      .filter((file) => file.endsWith('.js'))
      .map((file) => path.join(dir, file));

  it('keeps the generic Object Layer APIs free of Cyberia modules', () => {
    for (const dir of [
      'src/api/object-layer',
      'src/api/object-layer-render-frames',
      'src/api/atlas-sprite-sheet',
      'src/api/ipfs',
    ])
      for (const file of files(dir))
        expect(fs.readFileSync(path.join(root, file), 'utf8'), file).not.toMatch(
          /from ['"][^'"]*(projects\/cyberia|components\/cyberia)[^'"]*['"]/,
        );
  });

  it('reaches an atlas through the cid of the definition it materializes, never through its label', () => {
    const byLabel = files('src')
      .concat(files('bin'))
      .filter((file) =>
        /\.(find|findOne|updateOne|updateMany|deleteOne|deleteMany)\(\s*\{\s*['"]metadata\.itemKey['"]/.test(
          fs.readFileSync(path.join(root, file), 'utf8'),
        ),
      );
    expect(byLabel).toEqual([]);
  });

  it('writes a definition only through the publication module', () => {
    const writers = files('src')
      .concat(files('bin'))
      .filter((file) => /\.upsertByIdentity\(/.test(fs.readFileSync(path.join(root, file), 'utf8')));
    expect(writers).toEqual(['src/api/object-layer/object-layer.publication.js']);
  });
});
