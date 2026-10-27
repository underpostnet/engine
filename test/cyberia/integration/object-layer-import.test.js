// Requires mongod (UNDERPOST_MONGOD_BIN). A stub Object Layer authority answers over HTTP.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { DataBaseProviderService } from '../../../src/db/DataBaseProvider.js';
import { objectLayerIdentity } from '../../../src/api/object-layer/object-layer.identity.js';
import { ObjectLayerService } from '../../../src/api/object-layer/object-layer.service.js';
import { AtlasSpriteSheetStore } from '../../../src/api/atlas-sprite-sheet/atlas-sprite-sheet.store.js';
import { CyberiaItemCatalogService } from '../../../src/api/cyberia-item-catalog/cyberia-item-catalog.service.js';
import { ApiRouter as CatalogRouter } from '../../../src/api/cyberia-item-catalog/cyberia-item-catalog.router.js';
import { catalogModels, itemBindingHistory } from '../../../src/projects/cyberia/catalog/object-layer-catalog.js';
import {
  importDefinition,
  previewImport,
  searchAuthority,
} from '../../../src/projects/cyberia/catalog/object-layer-import.js';
import { CyberiaObjectLayerProfile } from '../../../src/client/components/cyberia/ObjectLayerProfileCyberia.js';
import { STAT_DEFAULTS } from '../../../src/client/components/cyberia/SharedDefaultsCyberia.js';
import { profileRef } from '../../../src/client/components/objectlayer-studio/ObjectLayerProtocol.js';
import { sourceFromDirectionFrames, toWire } from '../../../src/client/components/objectlayer-studio/RenderSource.js';
import { mongodBinary, startMongod } from '../../support/mongod.js';

const host = { host: 'www.cyberia-import.test', path: '/', consumes: { 'object-layer': 'object-layer' } };
const APIS = [
  'object-layer',
  'object-layer-render-frames',
  'atlas-sprite-sheet',
  'file',
  'ipfs',
  'cyberia-item-catalog',
];
const MODERATOR = '64b000000000000000000009';
const model = (name) => DataBaseProviderService.getModel(name, host);
const models = () => catalogModels(host);

/** A canonical definition as the authority stores it, and its render frames in wire form. */
const canonical = (itemId, { type = 'skin', profile = profileRef(CyberiaObjectLayerProfile), frames = true } = {}) => {
  const data = {
    item: { id: itemId, type, description: `the ${itemId}`, activable: true },
    stats: STAT_DEFAULTS,
    render: { cid: '', metadataCid: '' },
  };
  const { cid } = objectLayerIdentity({ profile, data });
  const wire = frames
    ? toWire(
        sourceFromDirectionFrames({
          framesByCode: {
            '08': [
              Array.from({ length: 12 }, (_, y) => Array.from({ length: 12 }, (_, x) => [x * 20, y * 20, 90, 255])),
            ],
          },
          frameDurationMs: 200,
        }),
      )
    : null;
  return {
    cid,
    definition: { cid, profile, data, createdBy: 'service:objectlayer', createdAt: '2026-10-20T00:00:00.000Z' },
    wire,
  };
};

const authority = { definitions: new Map(), requests: [] };
const serve = (entry, served = entry.definition) => authority.definitions.set(entry.cid, { ...entry, served });
const counts = async () => ({
  definitions: await model('ObjectLayer').countDocuments({}),
  frames: await model('ObjectLayerRenderFrames').countDocuments({}),
  atlases: await model('AtlasSpriteSheet').countDocuments({}),
});
const reload = vi.fn(async () => ({}));
const importOf = (request) =>
  importDefinition(models(), { actor: MODERATOR, acknowledged: true, expectedCid: '', ...request }, host, reload);

describe.skipIf(!mongodBinary)('an import from the Object Layer authority', () => {
  let mongod;
  let server;
  let origin;

  beforeAll(async () => {
    for (const key of ['DB_USER', 'DB_PASSWORD', 'DB_AUTH_SOURCE', 'DB_REPLICA_SET']) delete process.env[key];
    process.env.IPFS_API_URL = 'http://127.0.0.1:9';
    process.env.IPFS_CLUSTER_API_URL = 'http://127.0.0.1:9';
    const app = express();
    app.use((req, res, next) => {
      authority.requests.push(req.originalUrl);
      next();
    });
    app.get('/api/v1/object-layer/render/:cid', (req, res) => {
      const entry = authority.definitions.get(req.params.cid);
      if (!entry) return res.status(404).json({ status: 'error' });
      res.json({
        status: 'success',
        data: { cid: entry.cid, renderFrames: entry.wire && { revision: 1, ...entry.wire } },
      });
    });
    app.get('/api/v1/object-layer/:cid', (req, res) => {
      const entry = authority.definitions.get(req.params.cid);
      if (!entry) return res.status(404).json({ status: 'error' });
      res.json({ status: 'success', data: entry.served });
    });
    app.get('/api/v1/object-layer', (req, res) => {
      const { 'data.item.id': named } = JSON.parse(req.query.filterModel);
      const data = [...authority.definitions.values()]
        .map(({ served }) => served)
        .filter(({ data: { item } }) => item.id.includes(named.filter));
      res.json({ status: 'success', data: { data, total: data.length } });
    });
    await new Promise((done) => (server = app.listen(0, '127.0.0.1', done)));
    origin = `http://127.0.0.1:${server.address().port}`;
    process.env.OBJECT_LAYER_API_ORIGIN = origin;
    mongod = await startMongod('cyberia-import', { replSet: 'importset' });
    await DataBaseProviderService.load({
      apis: APIS,
      ...host,
      db: { provider: 'mongoose', host: mongod.host, replicaSet: 'importset', name: 'cyberia-import' },
    });
  }, 60000);

  beforeEach(() => {
    reload.mockClear();
    authority.requests.length = 0;
  });

  afterAll(async () => {
    delete process.env.OBJECT_LAYER_API_ORIGIN;
    await DataBaseProviderService.getProvider(host)
      ?.close()
      .catch(() => {});
    await mongod?.stop();
    await new Promise((done) => server.close(done));
  });

  it('finds canonical definitions at the authority by a part of the item id or by CID', async () => {
    const lantern = canonical('lantern-skin');
    serve(lantern);
    serve(canonical('ember-blade', { type: 'weapon' }));
    const found = await searchAuthority({ q: 'lantern' });
    expect(found.data).toEqual([
      expect.objectContaining({ cid: lantern.cid, itemId: 'lantern-skin', itemType: 'skin', profile: 'cyberia v2' }),
    ]);
    const asked = new URL(authority.requests[0], origin);
    expect(JSON.parse(asked.searchParams.get('filterModel'))).toEqual({
      'data.item.id': { filterType: 'text', type: 'contains', filter: 'lantern' },
      status: { values: ['canonical'] },
    });
    expect((await searchAuthority({ q: lantern.cid })).data.map(({ cid }) => cid)).toEqual([lantern.cid]);
    await expect(searchAuthority({ q: 'x'.repeat(65) })).rejects.toMatchObject({ status: 400 });
  });

  it('previews a definition with its source, render, warnings and the binding it takes, and stores nothing', async () => {
    const lantern = canonical('lantern-skin');
    serve(lantern);
    const before = await counts();
    const preview = await previewImport(models(), { cid: lantern.cid }, host);
    expect(preview).toMatchObject({
      cid: lantern.cid,
      source: { domain: new URL(origin).host, createdBy: 'service:objectlayer' },
      item: { id: 'lantern-skin', type: 'skin' },
      render: { width: 12, height: 12, preview: { keyframe: 'down_idle', width: 12, height: 12 } },
      stored: { definition: false, frames: false, atlas: false },
      validation: { ok: true, problems: [] },
      target: { itemId: 'lantern-skin', boundCid: '', unchanged: false, replaces: false },
    });
    expect(preview.validation.warnings).toEqual([expect.stringContaining('names no license or author')]);
    expect(await counts()).toEqual(before);
  });

  it('imports a definition with its frames and atlas, binds it with its provenance, and reloads the game servers', async () => {
    const lantern = canonical('lantern-skin');
    serve(lantern);
    await expect(importOf({ cid: lantern.cid, acknowledged: false })).rejects.toMatchObject({ status: 400 });
    const imported = await importOf({ cid: lantern.cid });
    expect(imported).toMatchObject({
      itemId: 'lantern-skin',
      binding: 'bound',
      stored: { definition: true, frames: true, atlas: true },
    });
    expect(reload).toHaveBeenCalledTimes(1);
    expect((await model('ObjectLayer').findOne({ cid: lantern.cid }).lean()).origin).toBe('cache');
    expect(await model('AtlasSpriteSheet').exists({ objectLayerCid: lantern.cid })).toBeTruthy();
    const history = await itemBindingHistory(models(), 'lantern-skin');
    expect(history.objectLayerCid).toBe(lantern.cid);
    expect(history.history[0]).toMatchObject({
      source: 'import',
      by: MODERATOR,
      provenance: {
        domain: new URL(origin).host,
        createdBy: 'service:objectlayer',
        acknowledged: true,
        warnings: [expect.stringContaining('names no license or author')],
      },
    });

    const before = await counts();
    const again = await importOf({ cid: lantern.cid, expectedCid: lantern.cid });
    expect(again).toMatchObject({ binding: 'unchanged', stored: { definition: false, frames: false, atlas: false } });
    expect(await counts()).toEqual(before);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('serves an imported definition with no request to the authority: catalog, viewer and preview read this host', async () => {
    const lantern = canonical('lantern-skin');
    process.env.OBJECT_LAYER_API_ORIGIN = 'http://127.0.0.1:9';
    try {
      expect(await CyberiaItemCatalogService.resolve({ query: { ids: 'lantern-skin' } }, {}, host)).toEqual({
        'lantern-skin': { cid: lantern.cid, hasRender: true },
      });
      const render = await ObjectLayerService.get(
        { path: `/render/${lantern.cid}`, params: { id: lantern.cid }, query: {} },
        {},
        host,
      );
      expect(render).toMatchObject({ cid: lantern.cid, renderFrames: { width: 12, height: 12 } });
      expect((await previewImport(models(), { cid: lantern.cid }, host)).stored).toEqual({
        definition: true,
        frames: true,
        atlas: true,
      });
    } finally {
      process.env.OBJECT_LAYER_API_ORIGIN = origin;
    }
    expect(authority.requests).toEqual([]);
  });

  it('refuses content whose bytes do not hash to its CID, an unknown item type and another profile, and stores nothing', async () => {
    const forged = canonical('forged-skin');
    serve(forged, {
      ...forged.definition,
      data: { ...forged.definition.data, stats: { ...STAT_DEFAULTS, effect: 9 } },
    });
    const relic = canonical('old-relic', { type: 'relic' });
    serve(relic);
    const foreign = canonical('foreign-sword', { type: 'weapon', profile: { id: 'other-game', version: 1 } });
    serve(foreign);
    const before = await counts();
    const problemsOf = async (cid) => (await previewImport(models(), { cid }, host)).validation;
    expect(await problemsOf(forged.cid)).toMatchObject({
      ok: false,
      problems: [expect.stringMatching(/^Its bytes hash to \w+, not /)],
    });
    expect((await problemsOf(relic.cid)).problems).toContain('relic is not a Cyberia item type');
    expect((await problemsOf(foreign.cid)).problems).toContain('It follows the profile other-game, not cyberia');
    for (const { cid } of [forged, relic, foreign])
      await expect(importOf({ cid, itemId: 'safe-target' })).rejects.toMatchObject({ status: 400 });
    expect(await counts()).toEqual(before);
    expect(await model('CyberiaItemCatalog').exists({ itemId: 'safe-target' })).toBeNull();
  });

  it('takes no URL or path as a source, and asks nothing for a request it refuses', async () => {
    for (const cid of ['http://169.254.169.254/latest', '../../admin', 'bafy evil'])
      await expect(previewImport(models(), { cid }, host)).rejects.toMatchObject({ status: 400 });
    await expect(
      previewImport(models(), { cid: canonical('lantern-skin').cid, itemId: '../x' }, host),
    ).rejects.toMatchObject({
      status: 400,
    });
    expect(authority.requests).toEqual([]);
  });

  it('imports a definition with no render frames, and binds it with no artwork', async () => {
    const bare = canonical('bare-banner', { type: 'skin', frames: false });
    serve(bare);
    const preview = await previewImport(models(), { cid: bare.cid }, host);
    expect(preview).toMatchObject({ render: null, validation: { ok: true } });
    expect(preview.validation.warnings).toContain('It has no render frames: the item runs with no artwork');
    expect(await importOf({ cid: bare.cid })).toMatchObject({
      binding: 'bound',
      stored: { definition: true, frames: false, atlas: false },
    });
    expect(await CyberiaItemCatalogService.resolve({ query: { ids: 'bare-banner' } }, {}, host)).toEqual({
      'bare-banner': { cid: bare.cid, hasRender: false },
    });
  });

  it('never replaces a binding silently: a replacement needs the binding the moderator saw and a decision', async () => {
    const first = canonical('lantern-skin');
    const next = canonical('lantern-skin-next');
    serve(next);
    await expect(importOf({ cid: next.cid, itemId: 'lantern-skin' })).rejects.toMatchObject({ status: 409 });
    await expect(importOf({ cid: next.cid, itemId: 'lantern-skin', expectedCid: first.cid })).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining('decide to replace'),
    });
    expect((await previewImport(models(), { cid: next.cid, itemId: 'lantern-skin' }, host)).target).toMatchObject({
      boundCid: first.cid,
      replaces: true,
    });
    const replaced = await importOf({ cid: next.cid, itemId: 'lantern-skin', expectedCid: first.cid, replace: true });
    expect(replaced).toMatchObject({ binding: 'replaced' });
    const history = await itemBindingHistory(models(), 'lantern-skin');
    expect(history.history.map(({ objectLayerCid, previousCid }) => [objectLayerCid, previousCid])).toEqual([
      [next.cid, first.cid],
      [first.cid, ''],
    ]);
    expect(await model('ObjectLayer').exists({ cid: first.cid })).toBeTruthy();
  });

  it('refuses every import route to a role below moderator, on the server', async () => {
    const app = express();
    app.use(express.json());
    const authMiddleware = (req, res, next) => {
      if (!req.headers['x-role']) return res.status(401).json({ status: 'error', message: 'unauthorized' });
      req.auth = { user: { _id: MODERATOR, role: req.headers['x-role'] } };
      next();
    };
    app.use('/catalog', CatalogRouter({ ...host, authMiddleware }));
    const listener = await new Promise((done) => {
      const started = app.listen(0, '127.0.0.1', () => done(started));
    });
    const base = `http://127.0.0.1:${listener.address().port}/catalog`;
    const call = (path, role, method = 'GET', body) =>
      fetch(`${base}${path}`, {
        method,
        headers: { 'content-type': 'application/json', ...(role && { 'x-role': role }) },
        ...(body && { body: JSON.stringify(body) }),
      }).then((res) => res.status);
    const { cid } = canonical('lantern-skin');
    try {
      expect(await call('/import/search?q=lantern')).toBe(401);
      expect(await call('/import/search?q=lantern', 'user')).toBe(403);
      expect(await call(`/import/${cid}`, 'user')).toBe(403);
      expect(await call('/import', 'user', 'POST', { cid })).toBe(403);
      expect(await call('/import/search?q=lantern', 'moderator')).toBe(200);
      expect(await call(`/import/${cid}`, 'moderator')).toBe(200);
    } finally {
      await new Promise((done) => listener.close(done));
    }
  });

  it('resumes an import that failed after it stored the definition, and stores nothing twice', async () => {
    const amber = canonical('amber-skin');
    serve(amber);
    const build = vi.spyOn(AtlasSpriteSheetStore, 'build').mockRejectedValueOnce(new Error('The disk is full'));
    await expect(importOf({ cid: amber.cid })).rejects.toThrow('The disk is full');
    expect(await model('ObjectLayer').exists({ cid: amber.cid })).toBeTruthy();
    expect(await model('CyberiaItemCatalog').exists({ itemId: 'amber-skin' })).toBeNull();
    const resumed = await importOf({ cid: amber.cid });
    build.mockRestore();
    expect(resumed).toMatchObject({ binding: 'bound', stored: { definition: false, frames: false, atlas: true } });
    expect(await model('ObjectLayer').countDocuments({ cid: amber.cid })).toBe(1);
  });
});
