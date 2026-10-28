// Requires mongod (UNDERPOST_MONGOD_BIN). A stub Object Layer authority and a stub IPFS gateway answer over HTTP.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { DataBaseProviderService } from '../../../src/db/DataBaseProvider.js';
import {
  canonicalJsonBytes,
  canonicalRender,
  objectLayerIdentity,
  payloadCid,
  renderContractOf,
} from '../../../src/api/object-layer/object-layer.identity.js';
import { ObjectLayerService } from '../../../src/api/object-layer/object-layer.service.js';
import { AtlasSpriteSheetGenerator } from '../../../src/api/atlas-sprite-sheet/atlas-sprite-sheet.generator.js';
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
import {
  canonicalObjectLayer,
  profileRef,
} from '../../../src/client/components/objectlayer-studio/ObjectLayerProtocol.js';
import { sourceFromDirectionFrames } from '../../../src/client/components/objectlayer-studio/RenderSource.js';
import { mongodBinary, startMongod } from '../../support/mongod.js';

const host = { host: 'www.cyberia-import.test', path: '/', consumes: { 'object-layer': 'object-layer' } };
const APIS = [
  'object-layer',
  'object-layer-render-frames',
  'atlas-sprite-sheet',
  'file',
  'ipfs',
  'cyberia-item-catalog',
  'cyberia-global-content',
];
const MODERATOR = '64b000000000000000000009';
const model = (name) => DataBaseProviderService.getModel(name, host);
const models = () => catalogModels(host);

/** The bytes an IPFS node holds, by CID. */
const ipfs = new Map();

/**
 * A canonical definition as the authority stores it, with its render on IPFS: the render frames
 * it was drawn from, the primary render and its layout, under the CIDs its render contract names.
 */
const canonical = async (
  itemId,
  { type = 'skin', profile = profileRef(CyberiaObjectLayerProfile), render = true } = {},
) => {
  const source = sourceFromDirectionFrames({
    framesByCode: {
      '08': [Array.from({ length: 12 }, (_, y) => Array.from({ length: 12 }, (_, x) => [x * 20, y * 20, 90, 255]))],
      18: [
        Array.from({ length: 12 }, () => Array.from({ length: 12 }, () => [200, 40, 40, 255])),
        Array.from({ length: 12 }, (_, y) => Array.from({ length: 12 }, () => [40, 40, y * 20, 255])),
      ],
    },
    frameDurationMs: 200,
  });
  const atlas = render ? await AtlasSpriteSheetGenerator.generateAtlas(source, itemId) : null;
  const { payloads, contract } = atlas ? canonicalRender(atlas) : { contract: { cid: '', metadataCid: '' } };
  if (payloads) {
    ipfs.set(contract.cid, payloads.primary);
    ipfs.set(contract.metadataCid, payloads.metadata);
  }
  const data = {
    item: { id: itemId, type, description: `the ${itemId}`, activable: true },
    stats: STAT_DEFAULTS,
    render: contract,
  };
  const { cid } = objectLayerIdentity({ profile, data });
  return {
    cid,
    data,
    atlas,
    definition: { cid, profile, data, createdBy: 'service:objectlayer', createdAt: '2026-10-20T00:00:00.000Z' },
  };
};

const authority = { definitions: new Map(), requests: [], published: [] };
const gateway = { requests: [] };
const serve = (entry, served = entry.definition) => authority.definitions.set(entry.cid, { ...entry, served });
const counts = async () => ({
  definitions: await model('ObjectLayer').countDocuments({}),
  frames: await model('ObjectLayerRenderFrames').countDocuments({}),
  atlases: await model('AtlasSpriteSheet').countDocuments({}),
});
const reload = vi.fn(async () => ({}));
const importOf = (request) =>
  importDefinition(
    models(),
    { actor: MODERATOR, acknowledged: true, bind: true, expectedCid: '', ...request },
    host,
    reload,
  );
const documentOf = (entry) => JSON.stringify(canonicalObjectLayer(entry.definition ?? entry));
const globalRow = (cid) => model('CyberiaGlobalContent').findOne({ objectLayerCid: cid }).lean();
const listen = (app) =>
  new Promise((done) => {
    const started = app.listen(0, '127.0.0.1', () => done(started));
  });

describe.skipIf(!mongodBinary)('an import from the Object Layer authority', () => {
  let mongod;
  let server;
  let ipfsServer;
  let origin;

  beforeAll(async () => {
    for (const key of ['DB_USER', 'DB_PASSWORD', 'DB_AUTH_SOURCE', 'DB_REPLICA_SET']) delete process.env[key];
    process.env.IPFS_API_URL = 'http://127.0.0.1:9';
    process.env.IPFS_CLUSTER_API_URL = 'http://127.0.0.1:9';
    process.env.DOMAIN_API_SERVICE_KEY = 'import-test-key';
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      authority.requests.push(req.originalUrl);
      next();
    });
    app.post('/api/v1/object-layer/canonical', (req, res) => {
      const { cid } = objectLayerIdentity(req.body);
      authority.published.push(cid);
      authority.definitions.set(cid, { cid, served: { cid, profile: req.body.profile, data: req.body.data } });
      res.json({ status: 'success', data: { cid, created: true } });
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
    server = await listen(app);
    origin = `http://127.0.0.1:${server.address().port}`;
    process.env.OBJECT_LAYER_API_ORIGIN = origin;

    const node = express();
    node.get('/ipfs/:cid', (req, res) => {
      gateway.requests.push(req.params.cid);
      const bytes = ipfs.get(req.params.cid);
      return bytes ? res.end(bytes) : res.status(404).end();
    });
    ipfsServer = await listen(node);
    process.env.IPFS_GATEWAY_URL = `http://127.0.0.1:${ipfsServer.address().port}`;

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
    authority.published.length = 0;
    gateway.requests.length = 0;
  });

  afterAll(async () => {
    for (const key of ['OBJECT_LAYER_API_ORIGIN', 'IPFS_GATEWAY_URL', 'DOMAIN_API_SERVICE_KEY'])
      delete process.env[key];
    await DataBaseProviderService.getProvider(host)
      ?.close()
      .catch(() => {});
    await mongod?.stop();
    await new Promise((done) => server.close(done));
    await new Promise((done) => ipfsServer.close(done));
  });

  it('finds canonical definitions at the authority by a part of the item id or by CID', async () => {
    const lantern = await canonical('lantern-skin');
    serve(lantern);
    serve(await canonical('ember-blade', { type: 'weapon' }));
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

  it('previews a definition with the render rebuilt from its render contract, and stores nothing', async () => {
    const lantern = await canonical('lantern-skin');
    serve(lantern);
    const before = await counts();
    const preview = await previewImport(models(), { cid: lantern.cid }, host);
    expect(preview).toMatchObject({
      cid: lantern.cid,
      source: { domain: new URL(origin).host, at: 'authority', createdBy: 'service:objectlayer' },
      item: { id: 'lantern-skin', type: 'skin' },
      render: { width: 12, height: 12, preview: { keyframe: 'down_idle', width: 12, height: 12 } },
      stores: { definition: true, frames: true, atlas: true },
      validation: { ok: true, problems: [] },
      target: { itemId: 'lantern-skin', boundCid: '', unchanged: false, replaces: false },
    });
    expect(preview.validation.warnings).toEqual([expect.stringContaining('names no license or author')]);
    expect(gateway.requests.sort()).toEqual([lantern.data.render.cid, lantern.data.render.metadataCid].sort());
    expect(await counts()).toEqual(before);
  });

  it('imports a definition, rebuilds its frames and atlas exactly, binds it with its provenance, and reloads', async () => {
    const lantern = await canonical('lantern-skin');
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

    const RenderFrames = model('ObjectLayerRenderFrames');
    const frames = RenderFrames.sourceOf(await RenderFrames.findOne({ objectLayerCid: lantern.cid }).lean());
    expect(renderContractOf(await AtlasSpriteSheetGenerator.generateAtlas(frames, 'lantern-skin'))).toEqual(
      lantern.data.render,
    );
    const atlas = await model('AtlasSpriteSheet').findOne({ objectLayerCid: lantern.cid }).lean();
    const primary = await model('File').findById(atlas.fileId);
    expect(renderContractOf({ primary: Buffer.from(primary.data), metadata: atlas.metadata })).toEqual(
      lantern.data.render,
    );

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

  it('serves an imported definition with no request to the authority or IPFS: catalog, viewer and preview read this host', async () => {
    const lantern = await canonical('lantern-skin');
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
      expect(await previewImport(models(), { cid: lantern.cid }, host)).toMatchObject({
        source: { at: 'host' },
        stores: { definition: false, frames: false, atlas: false },
      });
    } finally {
      process.env.OBJECT_LAYER_API_ORIGIN = origin;
    }
    expect(authority.requests).toEqual([]);
    expect(gateway.requests).toEqual([]);
  });

  it('adds a definition to the live content without a bind, and moves no item', async () => {
    const opal = await canonical('opal-skin');
    serve(opal);
    expect(await importOf({ cid: opal.cid, bind: false })).toMatchObject({
      binding: 'none',
      stored: { definition: true, frames: true, atlas: true },
      entry: null,
    });
    expect(await model('CyberiaItemCatalog').exists({ itemId: 'opal-skin' })).toBeNull();
    expect(await model('AtlasSpriteSheet').exists({ objectLayerCid: opal.cid })).toBeTruthy();
    expect(reload).not.toHaveBeenCalled();
    expect(await importOf({ cid: opal.cid })).toMatchObject({
      binding: 'bound',
      stored: { definition: false, frames: false, atlas: false },
    });
  });

  it('restores the frames and atlas of a definition an item runs, and reloads the game servers', async () => {
    const lantern = await canonical('lantern-skin');
    await model('ObjectLayerRenderFrames').deleteMany({ objectLayerCid: lantern.cid });
    await AtlasSpriteSheetStore.purge({ objectLayerCids: [lantern.cid], options: host });
    expect((await previewImport(models(), { cid: lantern.cid }, host)).stores).toEqual({
      definition: false,
      frames: true,
      atlas: true,
    });
    expect(await importOf({ cid: lantern.cid, bind: false })).toMatchObject({
      binding: 'unchanged',
      stored: { definition: false, frames: true, atlas: true },
    });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('imports a definition from its document alone, and publishes one the authority does not hold', async () => {
    const lantern = await canonical('lantern-skin');
    expect(await previewImport(models(), { document: documentOf(lantern) }, host)).toMatchObject({
      cid: lantern.cid,
      source: { at: 'host' },
    });

    const coral = await canonical('coral-skin');
    const preview = await previewImport(models(), { document: documentOf(coral) }, host);
    expect(preview).toMatchObject({
      cid: coral.cid,
      source: { at: 'document' },
      stores: { definition: true, frames: true, atlas: true },
      validation: { ok: true },
    });
    expect(authority.published).toEqual([]);
    expect(await importOf({ document: documentOf(coral) })).toMatchObject({ cid: coral.cid, binding: 'bound' });
    expect(authority.published).toEqual([coral.cid]);
    expect((await model('ObjectLayer').findOne({ cid: coral.cid }).lean()).origin).toBe('cache');
    expect(await model('ObjectLayerRenderFrames').exists({ objectLayerCid: coral.cid })).toBeTruthy();
  });

  it('accepts a document only in the definition format, and asks nothing for a document it refuses', async () => {
    const lantern = await canonical('lantern-skin');
    const payload = canonicalObjectLayer(lantern.definition);
    const { data } = payload;
    const refusal = (document) => previewImport(models(), { document }, host);
    const message = async (document) => (await refusal(document).catch((error) => error)).message;
    const withData = (changes) => JSON.stringify({ ...payload, data: { ...data, ...changes } });
    const withItem = (item) => withData({ item: { ...data.item, ...item } });
    expect(await message(JSON.stringify(data))).toContain(
      'schemaVersion is null: this host reads Object Layer schema 1',
    );
    expect(await message(JSON.stringify({ ...payload, schemaVersion: 2 }))).toContain('schemaVersion is 2');
    expect(await message(JSON.stringify({ ...payload, profile: { id: 'cyberia', version: 1 } }))).toContain(
      'profile.version is',
    );
    expect(await message(JSON.stringify({ ...payload, ledger: {} }))).toContain('ledger is not in the format');
    expect(await message(withData({ stats: undefined }))).toContain('data.stats is missing');
    const { effect, ...fewer } = data.stats;
    expect(await message(withData({ stats: fewer }))).toContain('data.stats.effect is missing');
    expect(await message(withData({ stats: { ...data.stats, effect: 1.5 } }))).toContain(
      'data.stats.effect is an integer',
    );
    expect(await message(withItem({ id: '<img src=x onerror=alert(1)>' }))).toContain('data.item.id is 1 to 128');
    expect(await message(withItem({ type: 'relic' }))).toContain('data.item.type is one of');
    expect(await message(withItem({ activable: 'yes' }))).toContain('data.item.activable is true or false');
    expect(await message(withData({ render: { cid: 'http://169.254.169.254/', metadataCid: '' } }))).toContain(
      'data.render.cid is a CID',
    );
    expect(await message(documentOf(lantern).replace('"data":', '"data":{},"data":'))).toContain(
      'Duplicate property "data"',
    );
    expect(await message('{"data":')).toContain('The document is not JSON');
    expect(await message(JSON.stringify({ ...payload, pad: 'x'.repeat(70 * 1024) }))).toContain('at most 64 KB');
    await expect(
      importDefinition(models(), { cid: 'bafkrei', document: documentOf(lantern) }, host),
    ).rejects.toMatchObject({ status: 400, message: expect.stringContaining('not both') });
    expect(authority.requests).toEqual([]);
    expect(gateway.requests).toEqual([]);
  });

  it('imports a document under the exact identity its bytes give, and refuses a render that is not the one it names', async () => {
    const ember = await canonical('ember-skin');
    const preview = await previewImport(models(), { document: documentOf(ember) }, host);
    expect(preview.cid).toBe(ember.cid);
    expect(objectLayerIdentity(JSON.parse(documentOf(ember))).cid).toBe(ember.cid);

    const wrongRender = await canonical('wrong-render', { render: false });
    const unpinned = payloadCid(Buffer.from('a render nobody pinned'));
    const named = (render) =>
      canonicalObjectLayer({ ...wrongRender.definition, data: { ...wrongRender.data, render } });
    const problemsOf = async (render) =>
      (await previewImport(models(), { document: JSON.stringify(named(render)) }, host)).validation.problems;
    expect(await problemsOf({ cid: unpinned, metadataCid: ember.data.render.metadataCid })).toEqual([
      `IPFS holds no render ${unpinned} with its layout ${ember.data.render.metadataCid}`,
    ]);
    expect(await problemsOf({ cid: ember.data.render.cid, metadataCid: unpinned })).toEqual([
      `IPFS holds no render ${ember.data.render.cid} with its layout ${unpinned}`,
    ]);
  });

  it('refuses a render that is not a PNG, a layout frame outside the atlas, and an atlas over the limits', async () => {
    const base = await canonical('limits-skin');
    const pin = (bytes) => {
      const cid = payloadCid(bytes);
      ipfs.set(cid, bytes);
      return cid;
    };
    const problemOf = async (primary, metadata) => {
      const render = { cid: pin(primary), metadataCid: pin(canonicalJsonBytes(metadata)) };
      const document = canonicalObjectLayer({ ...base.definition, data: { ...base.data, render } });
      const { validation } = await previewImport(models(), { document: JSON.stringify(document) }, host);
      expect(validation.ok).toBe(false);
      return validation.problems.join('; ');
    };
    const { primary, metadata } = base.atlas;
    expect(await problemOf(Buffer.from('GIF89a, not a render'), metadata)).toContain('not a PNG');
    expect(await problemOf(Buffer.concat([primary.subarray(0, 24), Buffer.alloc(40)]), metadata)).toContain(
      'does not decode',
    );
    const [first] = metadata.frames.down_idle;
    expect(
      await problemOf(primary, {
        ...metadata,
        frames: { ...metadata.frames, down_idle: [{ ...first, x: metadata.atlasWidth }] },
      }),
    ).toContain('lies outside the render');
    expect(await problemOf(primary, { ...metadata, atlasWidth: 4096, atlasHeight: 4096 })).toContain(
      'The atlas holds over',
    );
    const large = Buffer.alloc(300 * 1024, 1);
    const largeCid = `bafkrei${'q'.repeat(52)}`;
    ipfs.set(largeCid, large);
    const render = { cid: largeCid, metadataCid: pin(canonicalJsonBytes(metadata)) };
    const document = canonicalObjectLayer({ ...base.definition, data: { ...base.data, render } });
    const { validation } = await previewImport(models(), { document: JSON.stringify(document) }, host);
    expect(validation.problems).toEqual([`IPFS holds no render ${largeCid} with its layout ${render.metadataCid}`]);
  });

  it('registers every import as global content once, with its provenance, bound or not', async () => {
    const quartz = await canonical('quartz-skin');
    serve(quartz);
    expect(await previewImport(models(), { cid: quartz.cid }, host)).toMatchObject({ global: false });
    expect(await importOf({ cid: quartz.cid, bind: false })).toMatchObject({ binding: 'none', global: true });
    expect(await globalRow(quartz.cid)).toMatchObject({
      reason: 'import',
      by: MODERATOR,
      provenance: { domain: new URL(origin).host, createdBy: 'service:objectlayer' },
    });
    const registeredAt = (await globalRow(quartz.cid)).registeredAt;
    expect(await previewImport(models(), { cid: quartz.cid }, host)).toMatchObject({ global: true });
    expect(await importOf({ cid: quartz.cid })).toMatchObject({ binding: 'bound', global: false });
    expect(await importOf({ cid: quartz.cid, expectedCid: quartz.cid })).toMatchObject({ global: false });
    expect(await model('CyberiaGlobalContent').countDocuments({ objectLayerCid: quartz.cid })).toBe(1);
    expect((await globalRow(quartz.cid)).registeredAt).toEqual(registeredAt);
  });

  it('imports a definition given whole with its render, reading neither the authority render route nor IPFS', async () => {
    const given = await canonical('given-skin');
    ipfs.delete(given.data.render.cid);
    ipfs.delete(given.data.render.metadataCid);
    const render = { primary: given.atlas.primary, metadata: given.atlas.metadata };
    const definition = canonicalObjectLayer(given.definition);
    const registration = { reason: 'owned', by: 'export-live', registeredAt: '2026-01-02T00:00:00.000Z' };
    const imported = await importDefinition(
      models(),
      { definition, render, acknowledged: true, actor: 'release', registration },
      host,
    );
    expect(imported).toMatchObject({ cid: given.cid, stored: { definition: true, frames: true, atlas: true } });
    expect(gateway.requests).toEqual([]);
    expect(await globalRow(given.cid)).toMatchObject({ reason: 'owned', by: 'export-live' });
    expect((await globalRow(given.cid)).registeredAt.toISOString()).toBe(registration.registeredAt);

    const other = await canonical('given-other');
    const mismatch = await previewImport(
      models(),
      { definition: canonicalObjectLayer(other.definition), render },
      host,
    );
    expect(mismatch.validation.problems).toEqual([
      expect.stringMatching(/^The render given is \w+ with its layout \w+$/),
    ]);
  });

  it('refuses a render IPFS does not hold, or bytes that are not the render the definition names', async () => {
    const torn = await canonical('torn-skin');
    serve(torn);
    const { cid: renderCid, metadataCid } = torn.data.render;
    ipfs.set(renderCid, Buffer.concat([torn.atlas.primary, Buffer.from('tampered')]));
    const forged = await previewImport(models(), { cid: torn.cid }, host);
    expect(forged.validation.problems).toEqual([`IPFS holds no render ${renderCid} with its layout ${metadataCid}`]);
    ipfs.delete(renderCid);
    expect((await previewImport(models(), { cid: torn.cid }, host)).validation.ok).toBe(false);
    await expect(importOf({ cid: torn.cid })).rejects.toMatchObject({ status: 400 });
    expect(await model('ObjectLayer').exists({ cid: torn.cid })).toBeNull();
  });

  it('refuses content whose bytes do not hash to its CID, an unknown item type and another profile, and stores nothing', async () => {
    const forged = await canonical('forged-skin');
    serve(forged, {
      ...forged.definition,
      data: { ...forged.definition.data, stats: { ...STAT_DEFAULTS, effect: 9 } },
    });
    const relic = await canonical('old-relic', { type: 'relic' });
    serve(relic);
    const foreign = await canonical('foreign-sword', { type: 'weapon', profile: { id: 'other-game', version: 1 } });
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
      previewImport(models(), { cid: (await canonical('lantern-skin')).cid, itemId: '../x' }, host),
    ).rejects.toMatchObject({
      status: 400,
    });
    expect(authority.requests).toEqual([]);
  });

  it('imports a definition that names no render, and binds it with no artwork', async () => {
    const bare = await canonical('bare-banner', { render: false });
    serve(bare);
    const preview = await previewImport(models(), { cid: bare.cid }, host);
    expect(preview).toMatchObject({ render: null, validation: { ok: true } });
    expect(preview.validation.warnings).toContain('It names no render: the item runs with no artwork');
    expect(await importOf({ cid: bare.cid })).toMatchObject({
      binding: 'bound',
      stored: { definition: true, frames: false, atlas: false },
    });
    expect(await CyberiaItemCatalogService.resolve({ query: { ids: 'bare-banner' } }, {}, host)).toEqual({
      'bare-banner': { cid: bare.cid, hasRender: false },
    });
  });

  it('never replaces a binding silently: a replacement needs the binding the moderator saw and a decision', async () => {
    const first = await canonical('lantern-skin');
    const next = await canonical('lantern-skin-next');
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
    const listener = await listen(app);
    const base = `http://127.0.0.1:${listener.address().port}/catalog`;
    const call = (path, role, method = 'GET', body) =>
      fetch(`${base}${path}`, {
        method,
        headers: { 'content-type': 'application/json', ...(role && { 'x-role': role }) },
        ...(body && { body: JSON.stringify(body) }),
      }).then((res) => res.status);
    const lantern = await canonical('lantern-skin');
    const document = { document: documentOf(lantern) };
    try {
      expect(await call('/import/search?q=lantern')).toBe(401);
      expect(await call('/import/search?q=lantern', 'user')).toBe(403);
      expect(await call(`/import/${lantern.cid}`, 'user')).toBe(403);
      expect(await call('/import/preview', 'user', 'POST', document)).toBe(403);
      expect(await call('/import', 'user', 'POST', { cid: lantern.cid })).toBe(403);
      expect(await call('/import/search?q=lantern', 'moderator')).toBe(200);
      expect(await call(`/import/${lantern.cid}`, 'moderator')).toBe(200);
      expect(await call('/import/preview', 'moderator', 'POST', document)).toBe(200);
    } finally {
      await new Promise((done) => listener.close(done));
    }
  });

  it('resumes an import that failed after it stored the definition and its frames, and stores nothing twice', async () => {
    const amber = await canonical('amber-skin');
    serve(amber);
    const store = vi.spyOn(AtlasSpriteSheetStore, 'storeRender').mockRejectedValueOnce(new Error('The disk is full'));
    await expect(importOf({ cid: amber.cid })).rejects.toThrow('The disk is full');
    expect(await model('ObjectLayer').exists({ cid: amber.cid })).toBeTruthy();
    expect(await model('CyberiaItemCatalog').exists({ itemId: 'amber-skin' })).toBeNull();
    const resumed = await importOf({ cid: amber.cid });
    store.mockRestore();
    expect(resumed).toMatchObject({ binding: 'bound', stored: { definition: false, frames: false, atlas: true } });
    expect(await model('ObjectLayer').countDocuments({ cid: amber.cid })).toBe(1);
  });
});
