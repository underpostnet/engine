import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import {
  CYBERIA_RUNTIME_APIS,
  DOMAIN_APIS,
  DOMAIN_HOSTS,
  validateDomainConf,
} from '../../../src/projects/cyberia/domain-ownership.js';
import { consumedApisOf, ownsApi } from '../../../src/server/domain/consumed-api.js';

const OL = DOMAIN_APIS['object-layer'];
const LEDGER = DOMAIN_APIS['item-ledger'];
const SHARED = ['core', 'file', 'user', 'wallet-account', 'document'];
const CONTENT = [
  'cyberia-map',
  'cyberia-instance',
  'cyberia-instance-conf',
  'cyberia-quest',
  'cyberia-action',
  'cyberia-item-catalog',
];

const host = (client, apis, extra = {}) => ({ '/': { client, apis, origins: [], db: { name: client }, ...extra } });

/** A consistent deploy: each domain owns its APIs, Cyberia consumes Object Layer. */
const fixture = () => ({
  confServer: {
    'underpost.net': host('underpost', ['user', 'file', 'test', 'document']),
    'objectlayer.org': host('objectlayer', [...SHARED, ...OL], {
      origins: ['https://objectlayer.org', 'https://itemledger.com', 'https://www.cyberiaonline.com'],
    }),
    'itemledger.com': host('itemledger', [...SHARED, ...LEDGER], {
      origins: ['https://itemledger.com', 'https://objectlayer.org', 'https://www.cyberiaonline.com'],
    }),
    'cryptokoyn.net': host('cryptokoyn', SHARED),
    'www.cyberiaonline.com': host('cyberia-portal', [...SHARED, ...OL, ...CONTENT, ...CYBERIA_RUNTIME_APIS], {
      consumes: Object.fromEntries(OL.map((api) => [api, 'object-layer'])),
      apiExtensions: { 'object-layer': 'cyberia', 'atlas-sprite-sheet': 'cyberia' },
      db: { name: 'cyberia', partitions: { content: { name: 'cyberia-content', apis: [...CONTENT, ...OL] } } },
    }),
  },
  confClient: {
    underpost: { components: { core: ['Docs'] }, services: ['user'], views: [{ path: '/' }, { path: '/docs' }] },
    objectlayer: {
      components: {
        'object-layer': [
          'ObjectLayerProtocol',
          'ObjectLayerEngine',
          'ObjectLayerEngineModal',
          'ObjectLayerEngineViewer',
        ],
      },
      services: ['object-layer', 'item-ledger'],
      apiHosts: { 'item-ledger': 'itemledger.com' },
      views: [{ path: '/' }, { path: '/object-layer-engine-viewer' }, { path: '/docs' }],
      docs: { typedoc: { entryPoints: ['./src/api/object-layer'] }, api: ['object-layer'] },
    },
    itemledger: {
      components: { core: ['Docs'] },
      services: ['item-ledger'],
      views: [{ path: '/' }, { path: '/item-ledger-registry' }, { path: '/docs' }],
      docs: { typedoc: { entryPoints: ['./src/api/item-ledger'] }, api: ['item-ledger'] },
    },
    cryptokoyn: {
      components: { wallet: ['WalletProvider', 'EmbeddedWallet', 'WalletView'] },
      services: ['wallet-account'],
      views: [{ path: '/' }, { path: '/wallet' }, { path: '/docs' }],
      docs: { typedoc: { entryPoints: ['./src/api/wallet-account'] }, api: ['wallet-account'] },
    },
    'cyberia-portal': {
      components: {
        cyberia: ['ObjectLayerProfileCyberia'],
        'object-layer': ['ObjectLayerProtocol', 'ObjectLayerEngineViewer'],
      },
      services: ['object-layer', 'item-ledger'],
      apiHosts: { 'item-ledger': 'itemledger.com' },
      views: [{ path: '/' }, { path: '/server' }, { path: '/docs' }],
      docs: { api: ['cyberia-map'] },
    },
  },
});

describe('domain ownership', () => {
  it('accepts a deploy where every domain owns only its own APIs', () => {
    expect(validateDomainConf(fixture())).toEqual([]);
  });

  it('names one main client per domain', () => {
    const conf = fixture();
    conf.confServer['itemledger.com']['/'].client = 'objectlayer';
    expect(validateDomainConf(conf)).toContain('itemledger.com: main client is "objectlayer", expected "itemledger"');
    expect(Object.keys(DOMAIN_HOSTS)).toEqual([
      'underpost.net',
      'objectlayer.org',
      'itemledger.com',
      'cryptokoyn.net',
      'www.cyberiaonline.com',
    ]);
  });

  it('refuses an ItemLedger API mounted by the Object Layer host', () => {
    const conf = fixture();
    conf.confServer['objectlayer.org']['/'].apis.push('item-ledger');
    expect(validateDomainConf(conf)).toContain(
      'objectlayer.org: mounts item-ledger, owned by item-ledger, without declaring it consumed from item-ledger',
    );
  });

  it('refuses the Object Layer backend mounted by the ItemLedger host', () => {
    const conf = fixture();
    conf.confServer['itemledger.com']['/'].apis.push('object-layer');
    expect(validateDomainConf(conf).join('\n')).toMatch(/itemledger\.com: mounts object-layer, owned by object-layer/);
  });

  it('refuses ItemLedger mounted by Cyberia, even when declared consumed', () => {
    const conf = fixture();
    const cyberia = conf.confServer['www.cyberiaonline.com']['/'];
    cyberia.apis.push('item-ledger');
    cyberia.consumes['item-ledger'] = 'item-ledger';
    expect(validateDomainConf(conf).join('\n')).toMatch(/mounts ItemLedger API item-ledger/);
  });

  it('refuses a consumption that names the wrong owner', () => {
    const conf = fixture();
    conf.confServer['www.cyberiaonline.com']['/'].consumes['object-layer'] = 'item-ledger';
    expect(validateDomainConf(conf).join('\n')).toMatch(
      /consumes object-layer from item-ledger, which does not own it/,
    );
  });

  it('keeps runtime state out of the content partition, and content in it', () => {
    const conf = fixture();
    const partition = conf.confServer['www.cyberiaonline.com']['/'].db.partitions.content;
    partition.apis.push('cyberia-quest-progress');
    partition.apis.splice(partition.apis.indexOf('cyberia-map'), 1);
    const errors = validateDomainConf(conf);
    expect(errors).toContain(
      'www.cyberiaonline.com: runtime api cyberia-quest-progress is inside the content partition',
    );
    expect(errors).toContain('www.cyberiaonline.com: content api cyberia-map is outside the content partition');
  });

  it('requires a content database apart from the runtime database', () => {
    const conf = fixture();
    const db = conf.confServer['www.cyberiaonline.com']['/'].db;
    db.partitions.content.name = db.name;
    expect(validateDomainConf(conf)).toContain('www.cyberiaonline.com: content and runtime share one database');
    delete db.partitions;
    expect(validateDomainConf(conf)).toContain('www.cyberiaonline.com: no "content" database partition');
  });

  it('keeps an owned authority out of a content release', () => {
    const conf = fixture();
    delete conf.confServer['www.cyberiaonline.com']['/'].consumes['object-layer'];
    expect(validateDomainConf(conf).join('\n')).toMatch(/owned authority object-layer is inside the content partition/);
  });

  it('keeps the Cyberia Studio on the Cyberia host, over the Object Layer APIs it mounts', () => {
    const conf = fixture();
    delete conf.confServer['www.cyberiaonline.com']['/'].apiExtensions['atlas-sprite-sheet'];
    conf.confServer['objectlayer.org']['/'].apiExtensions = { 'object-layer': 'cyberia' };
    conf.confServer['itemledger.com']['/'].apiExtensions = { 'object-layer': 'cyberia', 'item-ledger': '../x' };
    const errors = validateDomainConf(conf);
    expect(errors).toContain('www.cyberiaonline.com: mounts atlas-sprite-sheet without its Cyberia Studio extension');
    expect(errors).toContain('objectlayer.org: carries the Cyberia extension of object-layer');
    expect(errors).toContain('itemledger.com: extends object-layer, which it does not mount');
    expect(errors).toContain('itemledger.com: Invalid extension project "../x" for API "item-ledger"');
  });

  it('refuses an extension module that does not exist', () => {
    const conf = fixture();
    conf.confServer['www.cyberiaonline.com']['/'].apiExtensions['cyberia-map'] = 'cyberia';
    expect(validateDomainConf(conf)).toContain('www.cyberiaonline.com: extension cyberia/cyberia-map does not exist');
  });

  it('finds duplicate views', () => {
    const conf = fixture();
    conf.confClient.itemledger.views.push({ path: '/docs' });
    expect(validateDomainConf(conf)).toContain('itemledger: duplicate view /docs');
  });

  it('keeps Object Layer components out of the ItemLedger client', () => {
    // ItemLedger projects ownership; a definition is read at its authority, never rendered here.
    const conf = fixture();
    conf.confClient.itemledger.components['object-layer'] = ['ObjectLayerProtocol', 'ObjectLayerEngineViewer'];
    const errors = validateDomainConf(conf);
    expect(errors).toContain('itemledger: carries component object-layer/ObjectLayerProtocol it does not use');
    expect(errors).toContain('itemledger: carries component object-layer/ObjectLayerEngineViewer it does not use');
  });

  it('keeps the wallet UI whole where it is used, and away from portals without it', () => {
    const conf = fixture();
    conf.confClient.cryptokoyn.components.wallet = ['WalletProvider'];
    conf.confClient.underpost.components.wallet = ['WalletProvider'];
    const errors = validateDomainConf(conf);
    expect(errors).toContain('cryptokoyn: missing component wallet/WalletView');
    expect(errors).toContain('underpost: carries component wallet/WalletProvider it does not use');
  });

  it('maps a service of another domain to its owner, which must allow the origin', () => {
    const conf = fixture();
    conf.confClient.objectlayer.services.push('item-ledger-balance');
    conf.confServer['itemledger.com']['/'].origins = [];
    const errors = validateDomainConf(conf);
    expect(errors).toContain(
      "objectlayer: service item-ledger-balance is item-ledger's; map it to itemledger.com in apiHosts",
    );
    expect(errors).toContain(
      'objectlayer: itemledger.com does not allow the origin https://objectlayer.org for item-ledger',
    );
  });

  it('documents only the APIs a domain owns', () => {
    const conf = fixture();
    conf.confClient.objectlayer.docs.typedoc.entryPoints.push('./src/api/item-ledger');
    conf.confClient.cryptokoyn.docs.api.push('item-ledger-balance');
    const errors = validateDomainConf(conf);
    expect(errors).toContain('objectlayer: typedoc documents item-ledger, owned by item-ledger');
    expect(errors).toContain('cryptokoyn: api docs list item-ledger-balance, owned by item-ledger');
  });

  it('finds stale domain names anywhere in the configuration', () => {
    const conf = fixture();
    conf.confServer['itemledger.com']['/'].origins.push('https://itemledger.org');
    conf.confClient.cryptokoyn.metadata = { url: 'https://cryptokoin.net' };
    const errors = validateDomainConf(conf);
    expect(errors).toContain('stale domain itemledger\\.org in configuration');
    expect(errors).toContain('stale domain cryptokoin\\.net in configuration');
  });

  describe('in production', () => {
    const saved = {};
    const keys = ['OBJECT_LAYER_API_ORIGIN', 'DOMAIN_API_SERVICE_KEY'];
    beforeEach(() => keys.forEach((key) => ((saved[key] = process.env[key]), delete process.env[key])));
    afterEach(() =>
      keys.forEach((key) => (saved[key] === undefined ? delete process.env[key] : (process.env[key] = saved[key]))),
    );

    it('needs the owner URL and the service key of every consumed domain', () => {
      const errors = validateDomainConf({ ...fixture(), env: 'production' });
      expect(errors).toContain('www.cyberiaonline.com: consumes object-layer but its API origin is not configured');
      expect(errors).toContain(
        'www.cyberiaonline.com: consumes another domain but DOMAIN_API_SERVICE_KEY is not configured',
      );

      process.env.OBJECT_LAYER_API_ORIGIN = 'https://objectlayer.org';
      process.env.DOMAIN_API_SERVICE_KEY = 'k';
      expect(validateDomainConf({ ...fixture(), env: 'production' })).toEqual([]);
    });
  });
});

describe('API ownership of one host', () => {
  it('tells owned from consumed APIs', () => {
    const cyberia = fixture().confServer['www.cyberiaonline.com']['/'];
    expect(ownsApi(cyberia, 'cyberia-map')).toBe(true);
    expect(ownsApi(cyberia, 'object-layer')).toBe(false);
    expect(ownsApi(cyberia, 'item-ledger')).toBe(false);
    expect(consumedApisOf(cyberia)).toEqual(cyberia.consumes);
  });

  it('refuses a consumption of an API the host does not mount, or of an unknown domain', () => {
    expect(() => consumedApisOf({ apis: [], consumes: { 'object-layer': 'object-layer' } })).toThrow(
      /not in the host's apis/,
    );
    expect(() => consumedApisOf({ apis: ['object-layer'], consumes: { 'object-layer': 'objectlayer' } })).toThrow(
      /unknown domain/,
    );
  });
});

// The live deploy configuration, when this checkout carries it.
const confDir = new URL('../../../engine-private/conf/dd-cyberia', import.meta.url);
describe.skipIf(!fs.existsSync(new URL('conf.server.json', confDir)))('dd-cyberia configuration', () => {
  it('is consistent', async () => {
    const { default: dotenv } = await import('dotenv');
    const envFile = new URL('.env.development', confDir);
    if (fs.existsSync(envFile)) dotenv.config({ path: envFile.pathname, override: false, quiet: true });
    const { loadConfServerJson } = await import('../../../src/server/runtime/conf.js');
    const confServer = loadConfServerJson(new URL('conf.server.json', confDir).pathname, { resolve: true });
    const confClient = JSON.parse(fs.readFileSync(new URL('conf.client.json', confDir), 'utf8'));
    expect(validateDomainConf({ confServer, confClient })).toEqual([]);
  });
});
