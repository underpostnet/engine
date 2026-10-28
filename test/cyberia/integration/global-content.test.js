// Requires mongod (UNDERPOST_MONGOD_BIN). A stub Object Layer authority and a stub IPFS gateway answer over HTTP.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { Types } from 'mongoose';
import { DataBaseProviderService } from '../../../src/db/DataBaseProvider.js';
import {
  canonicalRender,
  objectLayerIdentity,
  renderContractOf,
} from '../../../src/api/object-layer/object-layer.identity.js';
import { AtlasSpriteSheetGenerator } from '../../../src/api/atlas-sprite-sheet/atlas-sprite-sheet.generator.js';
import { AtlasSpriteSheetService } from '../../../src/api/atlas-sprite-sheet/atlas-sprite-sheet.service.js';
import { catalogModels, itemBindingHistory } from '../../../src/projects/cyberia/catalog/object-layer-catalog.js';
import { importDefinition } from '../../../src/projects/cyberia/catalog/object-layer-import.js';
import { listGlobalContent, unregisterGlobalContent } from '../../../src/projects/cyberia/catalog/global-content.js';
import {
  exportGlobalContent,
  readGlobalContentFile,
  reconcileGlobalContent,
  restoreGlobalContent,
} from '../../../src/projects/cyberia/content/global-content-source.js';
import { CONTENT_PARTITION, validateContentRelease } from '../../../src/projects/cyberia/content/content-release.js';
import { CyberiaObjectLayerProfile } from '../../../src/client/components/cyberia/ObjectLayerProfileCyberia.js';
import { STAT_DEFAULTS } from '../../../src/client/components/cyberia/SharedDefaultsCyberia.js';
import { profileRef } from '../../../src/client/components/objectlayer-studio/ObjectLayerProtocol.js';
import { sourceFromDirectionFrames } from '../../../src/client/components/objectlayer-studio/RenderSource.js';
import { mongodBinary, startMongod } from '../../support/mongod.js';

const CONTENT_APIS = [
  'object-layer',
  'object-layer-render-frames',
  'atlas-sprite-sheet',
  'file',
  'ipfs',
  'cyberia-item-catalog',
  'cyberia-global-content',
  'cyberia-quest',
  'cyberia-action',
  'cyberia-map',
  'cyberia-entity-type-default',
  'cyberia-skill',
  'cyberia-instance',
  'cyberia-instance-conf',
];
const consumes = { 'object-layer': 'object-layer' };
/** The live content a host backup served, and an empty release the next deploy builds. */
const live = { host: 'www.cyberia-global.test', path: '/', consumes };
const release = { host: 'www.cyberia-global.test', path: '/release', consumes };
const MODERATOR = '64b000000000000000000009';
const model = (name, context = live) => DataBaseProviderService.getModel(name, context);

const ipfs = new Map();
const authority = new Map();
const gateway = { requests: [] };
const listen = (app) =>
  new Promise((done) => {
    const started = app.listen(0, '127.0.0.1', () => done(started));
  });

/** A canonical definition the authority holds, with its render pinned on IPFS. */
const canonical = async (itemId) => {
  const source = sourceFromDirectionFrames({
    framesByCode: {
      '08': [Array.from({ length: 6 }, (_, y) => Array.from({ length: 6 }, (_, x) => [x * 40, y * 40, 90, 255]))],
      18: [Array.from({ length: 6 }, () => Array.from({ length: 6 }, () => [200, 40, 40, 128]))],
    },
    frameDurationMs: 150,
  });
  const atlas = await AtlasSpriteSheetGenerator.generateAtlas(source, itemId);
  const { payloads, contract } = canonicalRender(atlas);
  ipfs.set(contract.cid, payloads.primary);
  ipfs.set(contract.metadataCid, payloads.metadata);
  const profile = profileRef(CyberiaObjectLayerProfile);
  const data = {
    item: { id: itemId, type: 'skin', description: `the ${itemId}`, activable: true },
    stats: STAT_DEFAULTS,
    render: contract,
  };
  const { cid, contentHash } = objectLayerIdentity({ profile, data });
  authority.set(cid, {
    cid,
    contentHash,
    profile,
    data,
    createdBy: 'service:objectlayer',
    createdAt: '2026-10-20T00:00:00.000Z',
  });
  return { cid, data, atlas };
};

const importOf = (cid, bind) =>
  importDefinition(catalogModels(live), { cid, bind, expectedCid: '', acknowledged: true, actor: MODERATOR }, live);

describe.skipIf(!mongodBinary)('global content', () => {
  let mongod;
  let servers = [];
  const exportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberia-global-'));
  const fixtures = {};

  beforeAll(async () => {
    for (const key of ['DB_USER', 'DB_PASSWORD', 'DB_AUTH_SOURCE', 'DB_REPLICA_SET']) delete process.env[key];
    process.env.IPFS_API_URL = 'http://127.0.0.1:9';
    process.env.IPFS_CLUSTER_API_URL = 'http://127.0.0.1:9';
    process.env.DOMAIN_API_SERVICE_KEY = 'global-test-key';
    const app = express();
    app.use(express.json());
    app.post('/api/v1/object-layer/canonical', (req, res) => {
      const { cid, contentHash } = objectLayerIdentity(req.body);
      authority.set(cid, { cid, contentHash, profile: req.body.profile, data: req.body.data });
      res.json({ status: 'success', data: { cid, created: true } });
    });
    app.get('/api/v1/object-layer/:cid', (req, res) => {
      const held = authority.get(req.params.cid);
      return held ? res.json({ status: 'success', data: held }) : res.status(404).json({ status: 'error' });
    });
    const node = express();
    node.get('/ipfs/:cid', (req, res) => {
      gateway.requests.push(req.params.cid);
      const bytes = ipfs.get(req.params.cid);
      return bytes ? res.end(bytes) : res.status(404).end();
    });
    servers = [await listen(app), await listen(node)];
    process.env.OBJECT_LAYER_API_ORIGIN = `http://127.0.0.1:${servers[0].address().port}`;
    process.env.IPFS_GATEWAY_URL = `http://127.0.0.1:${servers[1].address().port}`;

    mongod = await startMongod('cyberia-global', { replSet: 'globalset' });
    const db = (content) => ({
      provider: 'mongoose',
      host: mongod.host,
      replicaSet: 'globalset',
      name: 'cyberia-global-runtime',
      partitions: { [CONTENT_PARTITION]: { name: content, apis: CONTENT_APIS } },
    });
    await DataBaseProviderService.load({ apis: [...CONTENT_APIS, 'cyberia-player'], ...live, db: db('global-live') });
    await DataBaseProviderService.load({ apis: [...CONTENT_APIS, 'cyberia-player'], ...release, db: db('global-r1') });

    // The live content as an older engine left it: bindings and stacks, with no global content row.
    for (const itemId of ['worn-skin', 'banner-skin', 'relic-skin', 'old-skin', 'opal-skin'])
      fixtures[itemId] = await canonical(itemId);
    await importOf(fixtures['worn-skin'].cid, true);
    await importOf(fixtures['banner-skin'].cid, true);
    await importOf(fixtures['old-skin'].cid, false);
    await model('CyberiaGlobalContent').deleteMany({});
    await importOf(fixtures['opal-skin'].cid, false);
    fixtures.lost = `bafkrei${'l'.repeat(52)}`;
    await model('CyberiaPlayer').collection.insertOne({
      user: new Types.ObjectId(),
      universeCode: 'cyberia',
      bag: [{ itemId: 'relic-skin', olCid: fixtures['relic-skin'].cid, quantity: 1, slot: 0 }],
      storage: [{ itemId: 'lost-skin', olCid: fixtures.lost, quantity: 2, slot: 0 }],
      worlds: [],
      held: [],
    });
  }, 90000);

  beforeEach(() => {
    gateway.requests.length = 0;
  });

  afterAll(async () => {
    for (const key of ['OBJECT_LAYER_API_ORIGIN', 'IPFS_GATEWAY_URL', 'DOMAIN_API_SERVICE_KEY'])
      delete process.env[key];
    for (const context of [live, release])
      await DataBaseProviderService.getProvider(context)
        ?.close()
        .catch(() => {});
    await mongod?.stop();
    for (const server of servers) await new Promise((done) => server.close(done));
    fs.rmSync(exportDir, { recursive: true, force: true });
  });

  it('reports what it would keep, stores nothing without apply, then keeps each binding and stack no world carries, once', async () => {
    const reconcile = (apply) =>
      reconcileGlobalContent(catalogModels(live), {
        options: live,
        represented: new Set([fixtures['worn-skin'].cid]),
        apply,
        by: 'export-live test',
      });
    const kept = [
      { cid: fixtures['banner-skin'].cid, reason: 'catalog', itemIds: ['banner-skin'] },
      { cid: fixtures['relic-skin'].cid, reason: 'owned', itemIds: [] },
    ].sort((a, b) => a.cid.localeCompare(b.cid));
    const planned = await reconcile(false);
    expect(planned).toMatchObject({ applied: false, registered: 1, represented: 1, added: kept });
    expect(planned.invalid).toEqual([
      { cid: fixtures.lost, reason: 'owned', problem: expect.stringContaining('holds no definition') },
    ]);
    expect(planned.unreferenced.cids).toEqual([fixtures['old-skin'].cid]);
    expect(await model('CyberiaGlobalContent').countDocuments()).toBe(1);
    expect(await model('ObjectLayer').exists({ cid: fixtures['relic-skin'].cid })).toBeNull();

    expect(await reconcile(true)).toMatchObject({ applied: true, added: kept });
    expect(
      await model('CyberiaGlobalContent').findOne({ objectLayerCid: fixtures['relic-skin'].cid }).lean(),
    ).toMatchObject({
      reason: 'owned',
      by: 'export-live test',
    });
    expect(await model('AtlasSpriteSheet').exists({ objectLayerCid: fixtures['relic-skin'].cid })).toBeTruthy();
    const again = await reconcile(true);
    expect(again).toMatchObject({
      registered: 3,
      added: [],
      invalid: [expect.objectContaining({ cid: fixtures.lost })],
    });
    expect(await model('CyberiaEntityTypeDefault').countDocuments()).toBe(0);
    expect(await model('CyberiaInstance').countDocuments()).toBe(0);
  });

  it('lists each row with its item, its availability and its bindings, and keeps what an item or a player holds', async () => {
    const { data, total } = await listGlobalContent(live, { query: {}, sort: {}, skip: 0, limit: 10 });
    expect(total).toBe(3);
    expect(Object.fromEntries(data.map((row) => [row.item.id, [row.availability, row.itemIds]]))).toEqual({
      'opal-skin': ['available', []],
      'banner-skin': ['available', ['banner-skin']],
      'relic-skin': ['available', []],
    });
    await expect(unregisterGlobalContent(live, fixtures['banner-skin'].cid)).rejects.toMatchObject({ status: 409 });
    await expect(unregisterGlobalContent(live, fixtures['relic-skin'].cid)).rejects.toMatchObject({ status: 409 });
    await expect(unregisterGlobalContent(live, fixtures['old-skin'].cid)).rejects.toMatchObject({ status: 404 });
  });

  it('exports each row as one canonical file: the definition, its render, its bindings and its row; again, the same bytes', async () => {
    const cids = await exportGlobalContent(catalogModels(live), { dir: exportDir, options: live });
    expect(cids).toEqual([fixtures['opal-skin'].cid, fixtures['banner-skin'].cid, fixtures['relic-skin'].cid].sort());
    const bytes = new Map(cids.map((cid) => [cid, fs.readFileSync(path.join(exportDir, `${cid}.json`), 'utf8')]));
    for (const [cid, text] of bytes) {
      expect(text).toBe(`${JSON.stringify(JSON.parse(text), null, 2)}\n`);
      const file = readGlobalContentFile(cid, text);
      expect(renderContractOf(file.render)).toEqual(file.definition.data.render);
    }
    expect(readGlobalContentFile(fixtures['banner-skin'].cid, bytes.get(fixtures['banner-skin'].cid))).toMatchObject({
      itemIds: ['banner-skin'],
      registration: { reason: 'catalog' },
    });
    expect(() => readGlobalContentFile(fixtures['opal-skin'].cid, bytes.get(fixtures['relic-skin'].cid))).toThrow(
      `holds definition ${fixtures['relic-skin'].cid}`,
    );
    await exportGlobalContent(catalogModels(live), { dir: exportDir, options: live });
    for (const [cid, text] of bytes) expect(fs.readFileSync(path.join(exportDir, `${cid}.json`), 'utf8')).toBe(text);
  });

  it('restores into an empty release with no world, entity default or IPFS read, and validates; again, nothing changes', async () => {
    const cids = fs.readdirSync(exportDir).map((name) => name.slice(0, -'.json'.length));
    const artifact = {
      manifest: { global: cids },
      globalContent: (cid) => fs.readFileSync(path.join(exportDir, `${cid}.json`), 'utf8'),
    };
    const restored = await restoreGlobalContent(catalogModels(release), { artifact, options: release });
    expect(restored.map(({ cid }) => cid)).toEqual(cids);
    expect(gateway.requests).toEqual([]);
    const rows = async (context) =>
      await model('CyberiaGlobalContent', context)
        .find({}, { _id: 0, createdAt: 0, updatedAt: 0, __v: 0 })
        .sort({ objectLayerCid: 1 })
        .lean();
    expect(await rows(release)).toEqual(await rows(live));
    expect((await itemBindingHistory(catalogModels(release), 'banner-skin')).history[0]).toMatchObject({
      objectLayerCid: fixtures['banner-skin'].cid,
      source: 'snapshot',
    });
    expect(await model('CyberiaItemCatalog', release).countDocuments()).toBe(1);

    const validation = await validateContentRelease(DataBaseProviderService.getProvider(release).models, {
      options: release,
    });
    expect(validation.checks.find(({ name }) => name === 'global')).toMatchObject({ ok: true, count: 3 });
    expect(validation.checks.filter(({ ok }) => !ok).map(({ name, findings }) => [name, findings])).toEqual([]);

    const counts = async () =>
      Promise.all(
        ['ObjectLayer', 'AtlasSpriteSheet', 'File', 'CyberiaGlobalContent'].map((name) =>
          model(name, release).countDocuments(),
        ),
      );
    const before = await counts();
    await restoreGlobalContent(catalogModels(release), { artifact, options: release });
    expect(await counts()).toEqual(before);
  });

  it('serves an unbound definition of the release by CID with neither the authority nor IPFS answering', async () => {
    const relic = fixtures['relic-skin'];
    process.env.OBJECT_LAYER_API_ORIGIN = 'http://127.0.0.1:9';
    const gatewayUrl = process.env.IPFS_GATEWAY_URL;
    process.env.IPFS_GATEWAY_URL = 'http://127.0.0.1:9';
    try {
      const render = await AtlasSpriteSheetService.renderOf(relic.cid, release);
      expect(render.png.equals(relic.atlas.primary)).toBe(true);
      expect(render.layout).toEqual(relic.atlas.metadata);
      const still = await AtlasSpriteSheetService.definitionIdlePreview(relic.cid, release);
      expect(still.mimetype).toBe('image/png');
      expect(await model('CyberiaItemCatalog', release).exists({ objectLayerCid: relic.cid })).toBeNull();
    } finally {
      process.env.OBJECT_LAYER_API_ORIGIN = `http://127.0.0.1:${servers[0].address().port}`;
      process.env.IPFS_GATEWAY_URL = gatewayUrl;
    }
  });
});
