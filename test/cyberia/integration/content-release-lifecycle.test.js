import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { createHash } from 'node:crypto';
import os from 'node:os';
import nodePath from 'node:path';
import fs from 'fs-extra';
import express from 'express';
import { Types } from 'mongoose';
import { DataBaseProviderService } from '../../../src/db/DataBaseProvider.js';
import { MongooseDB } from '../../../src/db/mongo/MongooseDB.js';
import { publishDefinition } from '../../../src/api/object-layer/object-layer.publication.js';
import { clearDomainCache } from '../../../src/server/domain/domain-client.js';
import { authMiddlewareFactory, jwtSign } from '../../../src/server/security/auth.js';
import { CyberiaMapRouter } from '../../../src/api/cyberia-map/cyberia-map.router.js';
import { fetchMapData, getInstanceModels } from '../../../src/projects/cyberia/instance-data.js';
import { objectLayerIdentity, renderContractOf } from '../../../src/api/object-layer/object-layer.identity.js';
import { FileFactory } from '../../../src/api/file/file.service.js';
import { AtlasSpriteSheetGenerator } from '../../../src/api/atlas-sprite-sheet/atlas-sprite-sheet.generator.js';
import { sourceFromIndexedFrames } from '../../../src/client/components/objectlayer-studio/RenderSource.js';
import { profileRef } from '../../../src/client/components/objectlayer-studio/ObjectLayerProtocol.js';
import { CyberiaObjectLayerProfile } from '../../../src/client/components/cyberia/ObjectLayerProfileCyberia.js';
import {
  catalogModels,
  reconcileItemCatalog,
  seedItemCatalog,
  writeItemDefinition,
} from '../../../src/projects/cyberia/object-layer-catalog.js';
import {
  CONTENT_PARTITION,
  activateContentRelease,
  materializeWorkspace,
  advanceContentRelease,
  beginContentRelease,
  failContentRelease,
  promoteContentRelease,
  pruneContentReleases,
  retireContentRelease,
  rollbackContentRelease,
  validateContentRelease,
} from '../../../src/projects/cyberia/content-release.js';
import {
  CONTENT_FAMILIES,
  CONTENT_SCHEMA_VERSION,
  contentArtifact,
  openContentArtifact,
  servedContentArtifact,
  storeContentArtifact,
} from '../../../src/projects/cyberia/content-artifact.js';
import { mongodBinary, startMongod } from '../../support/mongod.js';

// A real replica set: transactions, unique indexes and cross-database `$out` behave as in
// production. Needs `mongod` 5.0 or later: `UNDERPOST_MONGOD_BIN`, or one on PATH.
const SERVICE_KEY = 'test-service-key';
const CONTENT_APIS = [
  'cyberia-item-catalog',
  'object-layer',
  'object-layer-render-frames',
  'atlas-sprite-sheet',
  'cyberia-quest',
  'cyberia-action',
  'cyberia-map',
  'cyberia-entity-type-default',
  'cyberia-skill',
  'cyberia-instance',
  'cyberia-instance-conf',
];
const RUNTIME_APIS = ['cyberia-content-release', 'cyberia-quest-progress', 'cyberia-server-registry', 'file', 'user'];
const WORKSPACE = 'cyberia-content';
const releaseDb = (id) => `${WORKSPACE}-${id}`;

const authority = { host: 'objectlayer.test', path: '/', consumes: {} };
/** The `cyberia` CLI: it authors the workspace and builds releases. */
const cyberia = {
  host: 'cyberia.test',
  path: '/',
  consumes: {
    'object-layer': 'object-layer',
    'object-layer-render-frames': 'object-layer',
    'atlas-sprite-sheet': 'object-layer',
  },
};
/** The engine runtime: another process on the same databases, serving the active release. */
const runtime = { ...cyberia, path: '/runtime' };

let mongod;
let authorityServer;
let authorityDown = false;
let dbHost;

/** The Object Layer authority over its public contract, backed by its own database. */
const startAuthority = () =>
  new Promise((resolve) => {
    authorityServer = http.createServer(async (req, res) => {
      const reply = (status, data) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(data === undefined ? {} : { status: 'success', data }));
      };
      if (authorityDown) return reply(503);
      const ObjectLayer = DataBaseProviderService.getModel('ObjectLayer', authority);
      if (req.method === 'POST' && req.url === '/api/v1/object-layer/canonical') {
        if (req.headers.authorization !== `Bearer ${SERVICE_KEY}`) return reply(401);
        let body = '';
        for await (const chunk of req) body += chunk;
        const stored = await publishDefinition({ ObjectLayer, payload: JSON.parse(body), options: authority });
        return reply(200, { cid: stored.cid, contentHash: stored.contentHash, created: true });
      }
      const match = /^\/api\/v1\/object-layer\/(bafkrei[a-z2-7]+)$/.exec(req.url);
      if (req.method === 'GET' && match) {
        const doc = await ObjectLayer.findByCid(match[1]).lean();
        return doc ? reply(200, doc) : reply(404);
      }
      return reply(404);
    });
    authorityServer.listen(0, '127.0.0.1', () => resolve(authorityServer.address().port));
  });

const loadHosts = async () => {
  const base = { provider: 'mongoose', host: dbHost, replicaSet: 'testset' };
  await DataBaseProviderService.load({ apis: ['object-layer'], ...authority, db: { ...base, name: 'objectlayer' } });
  for (const context of [cyberia, runtime])
    await DataBaseProviderService.load({
      apis: [...RUNTIME_APIS, ...CONTENT_APIS],
      ...context,
      db: {
        ...base,
        name: 'cyberia-runtime',
        partitions: { [CONTENT_PARTITION]: { name: WORKSPACE, apis: CONTENT_APIS } },
      },
    });
};

/** Closes every host and forgets it, as a process exit does. */
const closeHosts = async () => {
  for (const context of [authority, cyberia, runtime]) {
    await DataBaseProviderService.getProvider(context).close();
    delete DataBaseProviderService.instance[`${context.host}${context.path}`];
  }
};

const model = (name, context = cyberia) => DataBaseProviderService.getModel(name, context);
const connection = () => DataBaseProviderService.getConnection(cyberia);

/** The content models of one release database, as a validation reads them. */
const releaseModels = async (database) => {
  const models = {};
  for (const api of CONTENT_APIS) {
    const bound = await MongooseDB.bindModel(connection().useDb(database, { useCache: true }), api);
    models[bound.modelName] = bound;
  }
  return models;
};

const PROFILE = profileRef(CyberiaObjectLayerProfile);
const payload = (itemId, effect, render = { cid: '', metadataCid: '' }) => ({
  data: {
    item: { id: itemId, type: 'weapon', description: '', activable: true },
    stats: CyberiaObjectLayerProfile.validateStats({ effect }),
    render,
  },
});
/** A definition as a writer outside the catalog stores it. */
const definition = (itemId, effect) => ({ profile: PROFILE, ...payload(itemId, effect) });

/** Content the portal authors, all of it in the workspace. */
const authorWorkspace = async ({ mapCode = 'forest-1' } = {}) => {
  const hatchet = await writeItemDefinition({
    models: catalogModels(cyberia),
    payload: payload('hatchet', 5),
    options: cyberia,
  });
  const { primary, metadata } = await AtlasSpriteSheetGenerator.generateAtlas(
    sourceFromIndexedFrames({ colors: [[255, 0, 0, 255]], frames: { down_idle: [[[0]]] }, frameDurationMs: 100 }),
    'sword',
  );
  const file = await model('File').findOneAndUpdate(
    { name: 'sword-primary.png' },
    { $setOnInsert: FileFactory.create(primary, 'sword-primary.png') },
    { upsert: true, returnDocument: 'after' },
  );
  const sword = await writeItemDefinition({
    models: catalogModels(cyberia),
    payload: payload('sword', 9),
    rendered: { render: renderContractOf({ primary, metadata }), atlas: { fileId: file._id, metadata } },
    options: cyberia,
  });
  const conf = await model('CyberiaInstanceConf').findOneAndUpdate(
    { instanceCode: 'FOREST' },
    { $setOnInsert: { instanceCode: 'FOREST' } },
    { upsert: true, returnDocument: 'after' },
  );
  await model('CyberiaMap').updateOne(
    { code: mapCode },
    { $set: { code: mapCode, entities: [{ entityType: 'resource', objectLayerItemIds: ['hatchet'] }] } },
    { upsert: true },
  );
  const maps = (await model('CyberiaMap').find({}, { code: 1 }).lean()).map((map) => map.code);
  await model('CyberiaInstance').updateOne(
    { code: 'FOREST' },
    { $set: { code: 'FOREST', conf: conf._id, cyberiaMapCodes: maps } },
    { upsert: true },
  );
  await model('CyberiaQuest').updateOne(
    { code: 'q1' },
    {
      $set: {
        code: 'q1',
        title: 'First',
        steps: [
          { id: 's1', objectives: [{ type: 'collect', itemId: 'hatchet', objectLayerCid: hatchet.cid, quantity: 1 }] },
        ],
        rewards: [{ itemId: 'sword', objectLayerCid: sword.cid, quantity: 1 }],
      },
    },
    { upsert: true },
  );
  return { hatchet, sword };
};

const sha256 = (data) => `sha256:${createHash('sha256').update(data).digest('hex')}`;

/** A content artifact on disk, as cyberia-content builds one, whose context names the release it is for. */
const writeArtifact = (releaseId) => {
  const root = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'cyberia-release-artifact-'));
  const files = {
    ...Object.fromEntries(Object.values(CONTENT_FAMILIES).map((family) => [`foundation/${family}.json`, []])),
    'foundation/baseline.json': [],
    'context.json': {
      definitions: { 'map.forest-1': { id: 'map.forest-1', name: releaseId } },
      labels: {},
      sources: { 'map.forest-1': 'foundation' },
      references: {},
      referencedBy: {},
      entities: {},
    },
    'instances/FOREST/cyberia-instance.json': { code: 'FOREST' },
  };
  const digests = {};
  for (const [file, value] of Object.entries(files)) {
    const data = Buffer.from(JSON.stringify(value));
    fs.outputFileSync(nodePath.join(root, 'dist', file), data);
    digests[file] = sha256(data);
  }
  const lines = Object.keys(digests)
    .sort()
    .map((file) => `${file} ${digests[file]}\n`)
    .join('');
  fs.outputJsonSync(nodePath.join(root, 'dist', 'manifest.json'), {
    repository: 'underpostnet/cyberia-content',
    contentVersion: '1.0.0',
    sourceRevision: 'a'.repeat(40),
    schemaVersion: CONTENT_SCHEMA_VERSION,
    contentDigest: sha256(lines),
    build: {},
    instances: ['FOREST'],
    sagas: [],
    files: digests,
  });
  return openContentArtifact(root);
};

/** The name the served content artifact gives the forest map: the release whose artifact the runtime reads. */
const servedArtifactName = () => contentArtifact().context.definitions['map.forest-1'].name;

/** A release of the workspace, through the release lifecycle: building, candidate, validated or failed. */
const buildRelease = async (releaseId) => {
  const database = releaseDb(releaseId);
  const ledger = model('CyberiaContentRelease');
  const artifact = writeArtifact(releaseId);
  const { contentVersion: version, contentDigest: digest } = artifact.manifest;
  await beginContentRelease(ledger, {
    releaseId,
    holder: 'test',
    fields: { database, source: { from: 'workspace' }, content: { version, digest } },
  });
  await storeContentArtifact(connection().getClient().db(database), artifact);
  await materializeWorkspace({ connection: connection(), workspace: WORKSPACE, database, apis: CONTENT_APIS });
  await advanceContentRelease(ledger, releaseId, 'candidate');
  const validation = await validateContentRelease(
    { ...(await releaseModels(database)), File: model('File') },
    { options: cyberia, artifact: { db: connection().getClient().db(database), digest } },
  );
  const { manifest, dependencies, ...report } = validation;
  await ledger.updateOne({ releaseId }, { $set: { validation: report, manifest, dependencies } });
  if (validation.ok) await advanceContentRelease(ledger, releaseId, 'validated');
  else await failContentRelease(ledger, releaseId, 'validate', 'Content validation failed');
  return validation;
};

/** A digest of every document in a database's content collections. */
const snapshot = async (database) => {
  const models = await releaseModels(database);
  const rows = {};
  for (const [name, bound] of Object.entries(models))
    rows[name] = JSON.stringify(await bound.find({}).sort({ _id: 1 }).lean());
  return rows;
};

describe.skipIf(!mongodBinary)('Cyberia content releases on a MongoDB replica set', () => {
  beforeAll(async () => {
    for (const key of [
      'DB_USER',
      'DB_PASSWORD',
      'DB_AUTH_SOURCE',
      'DB_REPLICA_SET',
      'DEFAULT_DEPLOY_ID',
      'ITEM_LEDGER_API_ORIGIN',
    ])
      delete process.env[key];
    process.env.IPFS_API_URL = 'http://127.0.0.1:9';
    process.env.IPFS_CLUSTER_API_URL = 'http://127.0.0.1:9';
    process.env.DOMAIN_API_SERVICE_KEY = SERVICE_KEY;
    process.env.CYBERIA_CONTENT_RELEASE_WATCH_MS = '0';

    mongod = await startMongod('cyberia', { replSet: 'testset' });
    dbHost = mongod.host;
    process.env.OBJECT_LAYER_API_ORIGIN = `http://127.0.0.1:${await startAuthority()}`;
    await loadHosts();
    // Player state that no content operation may touch.
    await model('CyberiaQuestProgress').create([
      {
        playerId: 'p1',
        questCode: 'q1',
        stepProgress: [{ stepId: 's1', objectiveProgress: [{ current: 1, required: 1 }] }],
      },
      { playerId: 'p2', questCode: 'q1', status: 'completed' },
    ]);
  });

  afterAll(async () => {
    await closeHosts().catch(() => {});
    await new Promise((resolve) => authorityServer?.close(resolve));
    await mongod?.stop();
  });

  describe('databases and indexes', () => {
    it('runs on a replica set, with the identity and ledger indexes in place', async () => {
      const admin = connection().db.admin();
      expect((await admin.command({ hello: 1 })).setName).toBe('testset');

      await model('ObjectLayer').init();
      const objectLayerIndexes = await model('ObjectLayer').collection.indexes();
      expect(objectLayerIndexes.find((index) => index.key.cid)?.unique).toBe(true);
      expect(objectLayerIndexes.some((index) => index.key.origin)).toBe(true);

      await model('CyberiaContentRelease').syncIndexes();
      const ledgerIndexes = await model('CyberiaContentRelease').collection.indexes();
      const active = ledgerIndexes.find((index) => index.partialFilterExpression?.status === 'active');
      expect(active?.unique).toBe(true);
    });

    it('keeps content in the workspace database and player state in the runtime database', () => {
      expect(model('ObjectLayer').db.name).toBe(WORKSPACE);
      expect(model('CyberiaMap').db.name).toBe(WORKSPACE);
      expect(model('CyberiaQuestProgress').db.name).toBe('cyberia-runtime');
      expect(model('CyberiaContentRelease').db.name).toBe('cyberia-runtime');
    });
  });

  describe('one canonical writer', () => {
    it('publishes at the authority, and keeps only a cache copy on Cyberia', async () => {
      const definition = await writeItemDefinition({
        models: catalogModels(cyberia),
        payload: payload('shield', 3),
        options: cyberia,
      });

      const atAuthority = await model('ObjectLayer', authority).findByCid(definition.cid).lean();
      expect(atAuthority.origin).toBe('canonical');
      expect(definition.origin).toBe('cache');
      expect(await model('ObjectLayer').countDocuments({ origin: 'canonical' })).toBe(0);
      expect((await model('CyberiaItemCatalog').findOne({ itemId: 'shield' }).lean()).objectLayerCid).toBe(
        definition.cid,
      );
    });

    it('keeps a draft and binds nothing when the authority does not answer', async () => {
      const before = (await model('CyberiaItemCatalog').findOne({ itemId: 'shield' }).lean()).objectLayerCid;
      authorityDown = true;
      let refused;
      try {
        await writeItemDefinition({ models: catalogModels(cyberia), payload: payload('shield', 4), options: cyberia });
      } catch (error) {
        refused = error;
      } finally {
        authorityDown = false;
      }
      expect(refused?.name).toBe('PublicationError');
      const { cid } = refused;
      expect((await model('ObjectLayer').findByCid(cid).lean()).origin).toBe('draft');
      expect(await model('ObjectLayer', authority).findByCid(cid).lean()).toBeNull();
      expect((await model('CyberiaItemCatalog').findOne({ itemId: 'shield' }).lean()).objectLayerCid).toBe(before);

      // A retry once the authority answers publishes the same draft.
      const published = await writeItemDefinition({
        models: catalogModels(cyberia),
        payload: payload('shield', 4),
        options: cyberia,
      });
      expect(published.cid).toBe(cid);
      expect(published.origin).toBe('cache');
    });

    it('never binds a draft a seed finds alone under its label', async () => {
      const draft = await model('ObjectLayer').upsertByIdentity(definition('lonely', 1), { origin: 'draft' });
      await seedItemCatalog(catalogModels(cyberia));
      expect(await model('CyberiaItemCatalog').findOne({ itemId: 'lonely' }).lean()).toBeNull();
      await model('ObjectLayer').deleteOne({ cid: draft.cid });
    });

    it('migrates a legacy document once: profile reference, content identity, draft origin', async () => {
      const { data } = payload('legacy', 2);
      await model('ObjectLayer').collection.insertOne({ data, cid: 'legacy-cid', sha256: 'legacy' });
      const first = await model('ObjectLayer').migrateIdentity({ profile: CyberiaObjectLayerProfile, origin: 'draft' });
      const second = await model('ObjectLayer').migrateIdentity({
        profile: CyberiaObjectLayerProfile,
        origin: 'draft',
      });
      expect([first.migrated, first.originsSet]).toEqual([1, 1]);
      expect([second.migrated, second.originsSet]).toEqual([0, 0]);

      const { cid } = objectLayerIdentity(definition('legacy', 2));
      const migrated = await model('ObjectLayer').collection.findOne({ cid });
      expect(migrated).toMatchObject({ profile: PROFILE, origin: 'draft' });
      expect(migrated.sha256).toBeUndefined();
      await model('ObjectLayer').deleteOne({ cid });
    });
  });

  describe('ownership and lifecycle', () => {
    it('owns a definition by the principal that stored it, once', async () => {
      const first = await writeItemDefinition({
        models: catalogModels(cyberia),
        payload: { ...payload('lantern', 1), createdBy: 'moderator-1' },
        options: cyberia,
      });
      const again = await writeItemDefinition({
        models: catalogModels(cyberia),
        payload: { ...payload('lantern', 1), createdBy: 'moderator-2' },
        options: cyberia,
      });
      expect(again.cid).toBe(first.cid);
      expect(again.createdBy).toBe('moderator-1');
      expect(again.archivedAt).toBeNull();
    });

    it('archives at the authority and keeps the content under its cid', async () => {
      const bound = await model('CyberiaItemCatalog').findOne({ itemId: 'lantern' }).lean();
      const archived = await model('ObjectLayer', authority).setArchived(bound.objectLayerCid, true);
      expect(archived.archivedAt).toBeInstanceOf(Date);
      expect(archived.cid).toBe(bound.objectLayerCid);
      expect(await model('ObjectLayer', authority).findByCid(bound.objectLayerCid).lean()).not.toBeNull();
    });

    it('reconciles Cyberia bindings with the authority, idempotently', async () => {
      const bound = await model('CyberiaItemCatalog').findOne({ itemId: 'lantern' }).lean();
      const first = await reconcileItemCatalog(catalogModels(cyberia), cyberia);
      expect(first.unbound).toEqual([{ itemId: 'lantern', objectLayerCid: bound.objectLayerCid, reason: 'archived' }]);
      expect(await model('CyberiaItemCatalog').findOne({ itemId: 'lantern' }).lean()).toBeNull();
      expect(await model('CyberiaItemCatalog').findOne({ itemId: 'shield' }).lean()).not.toBeNull();
      const second = await reconcileItemCatalog(catalogModels(cyberia), cyberia);
      expect(second.unbound).toEqual([]);
      expect(second.checked).toBe(first.checked - 1);
    });

    it('changes nothing when the authority does not answer', async () => {
      clearDomainCache();
      authorityDown = true;
      try {
        await expect(reconcileItemCatalog(catalogModels(cyberia), cyberia)).rejects.toThrow(/503/);
      } finally {
        authorityDown = false;
      }
      expect(await model('CyberiaItemCatalog').findOne({ itemId: 'shield' }).lean()).not.toBeNull();
    });

    it('offers an archived definition again when the authority publishes its content again', async () => {
      const { cid } = objectLayerIdentity(definition('lantern', 1));
      const published = await publishDefinition({
        ObjectLayer: model('ObjectLayer', authority),
        payload: definition('lantern', 1),
        options: authority,
      });
      expect(published.cid).toBe(cid);
      expect(published.archivedAt).toBeNull();
      expect(published.createdBy).toBe('');
    });
  });

  describe('content release lifecycle', () => {
    let r1Snapshot;

    it('builds a candidate the runtime cannot read, and validates it', async () => {
      await authorWorkspace();
      const validation = await buildRelease('r1');
      expect(validation.checks.filter((entry) => !entry.ok)).toEqual([]);
      expect(validation.manifest).toMatchObject({ instances: ['FOREST'], maps: 1 });
      expect(validation.dependencies.length).toBeGreaterThanOrEqual(2);

      // Nothing promoted: the runtime serves the workspace until a release is active.
      await activateContentRelease(runtime);
      expect(DataBaseProviderService.servedDatabase(runtime, CONTENT_PARTITION)).toBe(WORKSPACE);
      r1Snapshot = await snapshot(releaseDb('r1'));
    });

    it('promotes in one transaction and serves the release, while authoring keeps the workspace', async () => {
      const ledger = model('CyberiaContentRelease');
      await expect(promoteContentRelease(ledger, 'missing')).rejects.toThrow(/does not exist/);
      await expect(rollbackContentRelease(ledger)).rejects.toThrow(/No previous release/);

      const { active, retired } = await promoteContentRelease(ledger, 'r1');
      expect(active.status).toBe('active');
      expect(retired).toBeNull();
      const again = await promoteContentRelease(ledger, 'r1');
      expect(again.active.promotedAt).toEqual(active.promotedAt);
      expect(again.retired).toBeNull();

      const result = await activateContentRelease(runtime);
      expect(result).toMatchObject({
        releaseId: 'r1',
        database: releaseDb('r1'),
        changed: true,
        artifact: { releaseId: 'r1', error: '' },
      });
      expect(model('CyberiaMap', runtime).db.name).toBe(releaseDb('r1'));
      expect(model('CyberiaMap').db.name).toBe(WORKSPACE);
      expect(servedArtifactName()).toBe('r1');
      expect((await activateContentRelease(runtime)).changed).toBe(false);
    });

    it('never lets a candidate build touch the active release', async () => {
      await authorWorkspace({ mapCode: 'forest-2' });
      const validation = await buildRelease('r2');
      expect(validation.ok).toBe(true);
      expect(validation.manifest.maps).toBe(2);

      expect(await snapshot(releaseDb('r1'))).toEqual(r1Snapshot);
      expect(await model('CyberiaMap', runtime).countDocuments()).toBe(1);
    });

    it('switches the served release atomically on promotion', async () => {
      await promoteContentRelease(model('CyberiaContentRelease'), 'r2');
      await activateContentRelease(runtime);
      expect(await model('CyberiaMap', runtime).countDocuments()).toBe(2);
      expect(servedArtifactName()).toBe('r2');
      expect(await model('CyberiaContentRelease').countDocuments({ status: 'active' })).toBe(1);
    });

    it('rolls back to the previous validated release, and forward again', async () => {
      const ledger = model('CyberiaContentRelease');
      const { active, retired } = await rollbackContentRelease(ledger);
      expect(active.releaseId).toBe('r1');
      expect(retired.releaseId).toBe('r2');
      expect((await rollbackContentRelease(ledger)).active.releaseId).toBe('r2');
      expect((await rollbackContentRelease(ledger)).active.releaseId).toBe('r1');
      await activateContentRelease(runtime);
      expect(await model('CyberiaMap', runtime).countDocuments()).toBe(1);
      expect(servedArtifactName()).toBe('r1');
    });

    it('retires the active release so the workspace serves again, and rolls forward to it', async () => {
      const ledger = model('CyberiaContentRelease');
      const retired = await retireContentRelease(ledger);
      expect(retired.releaseId).toBe('r1');
      await activateContentRelease(runtime);
      expect(DataBaseProviderService.servedDatabase(runtime, CONTENT_PARTITION)).toBe(WORKSPACE);
      expect(await model('CyberiaMap', runtime).countDocuments()).toBe(2);
      expect(servedContentArtifact()).toEqual({ releaseId: '', error: '' });
      await expect(retireContentRelease(ledger)).rejects.toThrow(/No release is active/);

      expect((await rollbackContentRelease(ledger)).active.releaseId).toBe('r1');
      await activateContentRelease(runtime);
      expect(await model('CyberiaMap', runtime).countDocuments()).toBe(1);
    });

    it('refuses a release that names a definition the authority does not hold', async () => {
      const { cid } = await model('ObjectLayer').upsertByIdentity(definition('ghost', 1), { origin: 'cache' });
      await model('CyberiaItemCatalog').bind('ghost', cid);
      const validation = await buildRelease('r3');
      expect(validation.ok).toBe(false);
      const failing = Object.fromEntries(
        validation.checks.filter((entry) => !entry.ok).map((entry) => [entry.name, entry.findings]),
      );
      expect(failing.canonical.join('\n')).toContain(`${cid}: unknown to the Object Layer authority`);
      await expect(promoteContentRelease(model('CyberiaContentRelease'), 'r3')).rejects.toThrow(
        /only a validated release/,
      );
      expect(await model('CyberiaContentRelease').findOne({ releaseId: 'r3' }).lean()).toMatchObject({
        status: 'failed',
        failure: { stage: 'validate' },
      });
      await activateContentRelease(runtime);
      expect(DataBaseProviderService.servedDatabase(runtime, CONTENT_PARTITION)).toBe(releaseDb('r1'));
      await model('CyberiaItemCatalog').deleteOne({ itemId: 'ghost' });
    });

    it('prunes only releases nothing still points at', async () => {
      const removed = await pruneContentReleases({
        CyberiaContentRelease: model('CyberiaContentRelease'),
        connection: connection(),
        keep: 0,
      });
      expect(await model('CyberiaContentRelease').exists({ releaseId: 'r3' })).toBeNull();
      expect(removed).toEqual(['r3']);
      const databases = (await connection().db.admin().listDatabases()).databases.map((db) => db.name);
      expect(databases).toEqual(expect.arrayContaining([releaseDb('r1'), releaseDb('r2'), WORKSPACE]));
      expect(databases).not.toContain(releaseDb('r3'));
    });

    it('serves the active release again after a restart', async () => {
      await closeHosts();
      await loadHosts();
      await activateContentRelease(runtime);
      expect(DataBaseProviderService.servedDatabase(runtime, CONTENT_PARTITION)).toBe(releaseDb('r1'));
      expect(await model('CyberiaMap', runtime).countDocuments()).toBe(1);
      expect(servedArtifactName()).toBe('r1');
    });

    it('keeps one active release when two promotions race', async () => {
      await authorWorkspace({ mapCode: 'forest-3' });
      await buildRelease('r4');
      await buildRelease('r5');
      const results = await Promise.allSettled([
        promoteContentRelease(model('CyberiaContentRelease'), 'r4'),
        promoteContentRelease(model('CyberiaContentRelease'), 'r5'),
      ]);
      expect(results.some((result) => result.status === 'fulfilled')).toBe(true);
      expect(await model('CyberiaContentRelease').countDocuments({ status: 'active' })).toBe(1);
      await expect(
        model('CyberiaContentRelease').collection.insertOne({ releaseId: 'forged', database: 'x', status: 'active' }),
      ).rejects.toThrow(/duplicate key/);
    });

    it('builds one release at a time, retries a failed one from the same source, and refuses another', async () => {
      const ledger = model('CyberiaContentRelease');
      const source = { from: 'source', channel: 'private', repository: 'acme/content', sourceRevision: 'a'.repeat(40) };
      const begin = (releaseId, fields = {}, params = {}) =>
        beginContentRelease(ledger, {
          releaseId,
          holder: 'job',
          fields: { database: releaseDb(releaseId), source, ...fields },
          ...params,
        });

      expect((await begin('s1')).release).toMatchObject({ status: 'building', lease: { executing: true } });
      await expect(begin('s2')).rejects.toThrow(/Release s1 is executing; one release builds at a time/);
      await failContentRelease(ledger, 's1', 'contract', new Error('npm test failed'));
      expect(await ledger.findOne({ releaseId: 's1' }).lean()).toMatchObject({
        status: 'failed',
        failure: { stage: 'contract', message: 'npm test failed' },
      });

      const reset = [];
      const retried = await begin(
        's1',
        { source: { ...source, channel: 'public' } },
        { reset: async (database) => reset.push(database) },
      );
      expect(retried.release).toMatchObject({
        status: 'building',
        source: { channel: 'public' },
        failure: { stage: '' },
      });
      // A retry starts from an empty candidate database: nothing the failed attempt wrote survives.
      expect(reset).toEqual([releaseDb('s1')]);
      await failContentRelease(ledger, 's1', 'contract', 'again');
      await expect(begin('s1', { source: { ...source, sourceRevision: 'b'.repeat(40) } })).rejects.toThrow(
        /another source/,
      );

      // An execution that stopped holds the lease no longer than its lifetime.
      await begin('s3');
      const taken = await begin('s4', {}, { leaseMs: 0 });
      expect(taken.release.status).toBe('building');
      expect(await ledger.findOne({ releaseId: 's3' }).lean()).toMatchObject({
        status: 'failed',
        failure: { stage: 'lease' },
      });
      await failContentRelease(ledger, 's4', 'contract', 'done');
    });

    it('lets a production runtime take a new release only from an exact source, and roll back to any it served', async () => {
      const ledger = model('CyberiaContentRelease');
      const served = await ledger.active();
      expect(served.source?.from).not.toBe('source');
      const validated = async (releaseId, source) => {
        await beginContentRelease(ledger, {
          releaseId,
          holder: 'job',
          fields: { database: releaseDb(releaseId), source },
        });
        await advanceContentRelease(ledger, releaseId, 'candidate');
        await advanceContentRelease(ledger, releaseId, 'validated');
      };
      await validated('p0', { from: 'backups' });
      await expect(promoteContentRelease(ledger, 'p0', { production: true })).rejects.toThrow(
        /no exact source revision/,
      );
      await validated('p1', {
        from: 'source',
        channel: 'private',
        repository: 'acme/content',
        sourceRevision: 'c'.repeat(40),
      });
      const { active } = await promoteContentRelease(ledger, 'p1', { production: true });
      expect(active).toMatchObject({ releaseId: 'p1', status: 'active', source: { channel: 'private' } });
      expect(await rollbackContentRelease(ledger, { production: true, from: 'p0' })).toBeNull();
      expect((await ledger.active()).releaseId).toBe('p1');
      expect((await rollbackContentRelease(ledger, { production: true, from: 'p1' })).active.releaseId).toBe(
        served.releaseId,
      );
    });

    it('never rewrites player state', async () => {
      const progress = await model('CyberiaQuestProgress').find({}).sort({ playerId: 1 }).lean();
      expect(progress.map((row) => [row.playerId, row.status])).toEqual([
        ['p1', 'active'],
        ['p2', 'completed'],
      ]);
      expect(progress[0].stepProgress[0].objectiveProgress[0].current).toBe(1);
    });
  });

  describe('one data source for every role', () => {
    const roles = [undefined, 'user', 'moderator', 'admin'];
    const tokens = {};
    let server;
    let origin;

    beforeAll(async () => {
      process.env.JWT_SECRET = 'content-release-test-secret';
      for (const role of roles.filter(Boolean))
        tokens[role] = jwtSign({ _id: `${new Types.ObjectId()}`, role }, runtime, 5, 10);
      const app = express();
      app.use(express.json());
      app.use(
        '/api/v1/cyberia-map',
        CyberiaMapRouter.router({ ...runtime, authMiddleware: authMiddlewareFactory(runtime) }),
      );
      server = await new Promise((resolve) => {
        const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
      });
      origin = `http://127.0.0.1:${server.address().port}/api/v1/cyberia-map`;
      await activateContentRelease(runtime);
      // A map only the workspace holds.
      await model('CyberiaMap').create({ code: 'draft-1' });
    });

    afterAll(async () => {
      await new Promise((resolve) => server?.close(resolve));
      delete process.env.JWT_SECRET;
    });

    /** A request as a guest, or with the token of a role. */
    const call = async (role, path = '', { method = 'GET', body } = {}) => {
      const response = await fetch(`${origin}${path}`, {
        method,
        headers: { 'content-type': 'application/json', ...(role && { authorization: `Bearer ${tokens[role]}` }) },
        body: body && JSON.stringify(body),
      });
      return { status: response.status, data: (await response.json()).data };
    };
    const listed = async (role) => (await call(role)).data.data.map((map) => map.code).sort();
    /** The map codes of the active release database, read past the provider. */
    const served = async () => {
      const { CyberiaMap } = await releaseModels((await model('CyberiaContentRelease').active()).database);
      return (await CyberiaMap.find({}, { code: 1 }).lean()).map((map) => map.code).sort();
    };

    it('answers a guest, a user, a moderator and an admin from the active release', async () => {
      const codes = await served();
      expect(codes).not.toContain('draft-1');
      for (const role of roles) expect(await listed(role)).toEqual(codes);
    });

    it('refuses a change from a guest and a user, and lets a moderator and an admin change the active release', async () => {
      const map = { code: 'live-1', name: 'Live' };
      expect((await call(undefined, '', { method: 'POST', body: map })).status).toBe(401);
      expect((await call('user', '', { method: 'POST', body: map })).status).toBe(403);
      expect((await call('moderator', '', { method: 'POST', body: map })).status).toBe(200);
      const forest = await model('CyberiaMap', runtime).findOne({ code: 'forest-1' }).lean();
      const body = { name: 'Live forest', revision: forest.revision };
      expect((await call('moderator', `/${forest._id}`, { method: 'PUT', body })).status).toBe(403);
      expect((await call('admin', `/${forest._id}`, { method: 'PUT', body })).status).toBe(200);

      const codes = await served();
      expect(codes).toContain('live-1');
      for (const role of roles) {
        expect(await listed(role)).toEqual(codes);
        expect((await call(role, '/forest-1')).data.name).toBe('Live forest');
      }
      expect(await model('CyberiaMap').exists({ code: 'live-1' })).toBeNull();
    });

    it('rebuilds a game server world from the live data', async () => {
      const models = getInstanceModels(runtime);
      expect(models.CyberiaMap.db.name).toBe((await model('CyberiaContentRelease').active()).database);
      expect((await fetchMapData(models, { mapCode: 'live-1' })).map.code).toBe('live-1');
    });

    it('replaces the live data with the baseline of the next release', async () => {
      expect((await buildRelease('r6')).ok).toBe(true);
      await promoteContentRelease(model('CyberiaContentRelease'), 'r6');
      await activateContentRelease(runtime);
      expect(await listed()).toEqual(expect.arrayContaining(['draft-1', 'forest-1']));
      expect(await listed()).not.toContain('live-1');
      const baseline = await model('CyberiaMap').findOne({ code: 'forest-1' }).lean();
      expect((await call(undefined, '/forest-1')).data.name).toBe(baseline.name);
    });
  });
});
