// Requires mongod (UNDERPOST_MONGOD_BIN). A stub game server answers the hot reloads over HTTP.
// No Valkey runs: every draft read and write here goes to MongoDB alone.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import { DataBaseProviderService } from '../../../src/db/DataBaseProvider.js';
import { connectPortals } from '../../../src/api/cyberia-instance/cyberia-portal-connector.js';
import { CyberiaEntityTypeDefaultService } from '../../../src/api/cyberia-entity-type-default/cyberia-entity-type-default.service.js';
import { resolveEntityDefaultBuild } from '../../../src/api/cyberia-server-defaults/cyberia-server-defaults.js';
import {
  DEFAULT_ROW_FIELDS,
  INSTANCE_FIELDS,
} from '../../../src/api/cyberia-procedural-population/cyberia-procedural-population.model.js';
import { populationModels } from '../../../src/projects/cyberia/procedural/population/map-context.js';
import {
  cancelPopulation,
  createPopulation,
  getPopulation,
  saveDraft,
  updateTarget,
} from '../../../src/projects/cyberia/procedural/population/population.js';
import {
  addDefault,
  defaultView,
  defaultWorlds,
  discardDefaultDraft,
  populationDefaults,
  saveDefault,
} from '../../../src/projects/cyberia/procedural/population/defaults.js';
import {
  advancePublication,
  claimPublication,
  refreshPublication,
  requestPublication,
} from '../../../src/projects/cyberia/procedural/population/publication.js';
import { pruneClosedDrafts } from '../../../src/projects/cyberia/procedural/population/retention.js';
import {
  changedWorlds,
  discardDocumentDraft,
  draftMapPicture,
  draftWorldPicture,
  graphPortals,
  graphProblems,
  instanceDraftView,
  populationGraph,
  saveInstanceDraft,
  saveUniverseDraft,
  writeDraft,
} from '../../../src/projects/cyberia/procedural/population/working-graph.js';
import { sourceFromDirectionFrames } from '../../../src/client/components/objectlayer-studio/RenderSource.js';
import { MongooseDB } from '../../../src/db/mongo/MongooseDB.js';
import { mongodBinary } from '../../support/mongod.js';
import { MODERATOR, host, publishItem, rejection, startEngine, stopEngine } from '../../support/procedural-engine.js';

const GRID = { gridX: 8, gridY: 8, cellWidth: 16, cellHeight: 16 };
const DAY_MS = 24 * 60 * 60 * 1000;
const entity = (entityType, objectLayerItemIds, x, y) => ({
  entityType,
  objectLayerItemIds,
  initCellX: x,
  initCellY: y,
  dimX: 1,
  dimY: 1,
  color: 'rgba(10, 20, 30, 1)',
});
const portal = (sourceMapCode, sourceCellX, sourceCellY, targetMapCode, targetCellX, targetCellY, portalMode) => ({
  sourceMapCode,
  sourceCellX,
  sourceCellY,
  targetMapCode,
  targetCellX,
  targetCellY,
  portalMode: portalMode ?? 'inter-portal',
});
const tile = sourceFromDirectionFrames({
  framesByCode: { '08': [Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => [40, 120, 70, 255]))] },
  frameDurationMs: 250,
});

const all = () => populationModels(host);
const graphOf = (id) => populationGraph(all(), id, host);
const problemsOf = async (id) => await graphProblems(all(), await graphOf(id), host);
const instanceOf = (code) => all().CyberiaInstance.findOne({ code }).lean();
const recordOf = (id) => all().CyberiaProceduralPopulation.findById(id).lean();
const pick = (value, fields) => Object.fromEntries(fields.filter((field) => field in value).map((f) => [f, value[f]]));
const draftInstance = async (id, code, change, body = {}) => {
  const view = instanceDraftView(await graphOf(id), code);
  return await saveInstanceDraft({
    models: all(),
    id,
    code,
    body: {
      document: { ...view.document, ...change },
      conf: view.conf,
      baseRevision: view.revision,
      revision: view.draftRevision ?? 0,
      ...body,
    },
    actor: MODERATOR,
    options: host,
  });
};
/** Saves a default as the Entity Studio does: from the view it read, with a changed row or instances. */
const saveAs = async (id, ref, { row = {}, instanceCodes, global = false } = {}) => {
  const view = await defaultView(all(), id, String(ref), host);
  return await saveDefault({
    models: all(),
    id,
    body: {
      rowId: view.rowId,
      key: view.key,
      baseUpdatedAt: view.baseUpdatedAt,
      revision: view.revision,
      row: { ...view.row, ...row },
      instanceCodes: instanceCodes ?? view.instanceCodes,
      global,
      populationRevision: view.populationRevision,
    },
    actor: MODERATOR,
    options: host,
  });
};
const populate = async (seed) =>
  await createPopulation({
    models: all(),
    request: { mapCode: 'glade', seed: { mode: 'fixed', value: seed } },
    actor: MODERATOR,
  });
/** Keeps the bound artwork of every item, then runs the publication to its end, as the worker does. */
const publish = async (id) => {
  for (const { itemId } of (await getPopulation(all(), id)).targets)
    await updateTarget({ models: all(), id, itemId, body: { resolution: 'keep' }, actor: MODERATOR });
  const { revision } = await recordOf(id);
  await requestPublication({ models: all(), id, actor: MODERATOR, revision });
  for (let step = 0; step < 6; step++) {
    const claimed = await claimPublication({ models: all(), holder: 'worker' });
    if (!claimed) break;
    await advancePublication({
      models: all(),
      population: claimed,
      holder: 'worker',
      options: host,
      refresh: refreshPublication,
    });
  }
  return (await recordOf(id)).publication;
};

describe.skipIf(!mongodBinary)('the typed drafts of a map population', () => {
  const reloads = [];
  const rows = {};
  let server;
  let population;

  beforeAll(async () => {
    await startEngine({ maps: {}, entities: [] });
    process.env.CYBERIA_SERVER_API_KEY = 'draft-contracts-key';
    const app = express();
    app.use(express.json());
    app.post(/\/api\/v1\/hot-reload$/, (req, res) => {
      reloads.push({ instanceCode: req.body.instanceCode, mode: req.body.mode });
      res.json({ message: 'reloading' });
    });
    server = await new Promise((done) => {
      const listening = app.listen(0, '127.0.0.1', () => done(listening));
    });
    await publishItem('moss', { type: 'floor', renderSource: tile });
    const { CyberiaMap, CyberiaInstance, CyberiaInstanceConf, CyberiaEntityTypeDefault } = all();
    await CyberiaMap.create([
      {
        code: 'glade',
        name: 'Glade',
        ...GRID,
        entities: [entity('floor', ['moss'], 0, 0), entity('portal', [], 2, 2)],
      },
      { code: 'cave', name: 'Cave', ...GRID, worldX: 100, worldY: 0, entities: [entity('portal', [], 1, 1)] },
      { code: 'peak', name: 'Peak', ...GRID, worldX: 200, worldY: 0 },
      { code: 'dune', name: 'Dune', ...GRID, worldX: 300, worldY: 0, entities: [entity('bot', ['guard-skin'], 1, 1)] },
      { code: 'moor', name: 'Moor', ...GRID, worldX: 400, worldY: 0, entities: [entity('portal', [], 3, 3)] },
    ]);
    Object.assign(rows, {
      shared: await CyberiaEntityTypeDefault.create({
        entityType: 'bot',
        liveItemIds: ['guard-skin'],
        behavior: 'passive',
      }),
      wolf: await CyberiaEntityTypeDefault.create({
        entityType: 'bot',
        liveItemIds: ['wolf-skin'],
        behavior: 'hostile',
      }),
      solo: await CyberiaEntityTypeDefault.create({
        entityType: 'bot',
        liveItemIds: ['imp-skin'],
        behavior: 'passive',
      }),
    });
    await DataBaseProviderService.getModel('CyberiaEconomy', host).create({ code: 'standard', name: 'Standard' });
    await CyberiaInstance.create([
      { code: 'home', name: 'Home', cyberiaMapCodes: ['cave'] },
      { code: 'far-world', name: 'Far World', cyberiaMapCodes: ['dune'] },
      { code: 'other', name: 'Other', cyberiaMapCodes: ['peak'] },
    ]);
    await CyberiaInstanceConf.create([
      { instanceCode: 'home', entityDefaults: [rows.shared._id] },
      { instanceCode: 'far-world', entityDefaults: [rows.shared._id] },
      { instanceCode: 'other', entityDefaults: [rows.solo._id] },
    ]);
    const base = `http://127.0.0.1:${server.address().port}`;
    const now = new Date();
    await DataBaseProviderService.getModel('CyberiaServerRegistry', host).create(
      ['home', 'far-world', 'other'].map((code, index) => ({
        serverId: `server-${index}`,
        url: `${base}/${code}`,
        instanceCode: code,
        state: 'ready',
        seq: 1,
        startedAt: now,
        lastSeen: now,
      })),
    );
    population = await populate(1);
  }, 120000);

  afterAll(async () => {
    delete process.env.CYBERIA_SERVER_API_KEY;
    await new Promise((done) => server.close(done));
    await stopEngine();
  });

  it('keeps each draft to its typed contract, and refuses a stale, a duplicate or a late write', async () => {
    const id = population._id;
    const view = instanceDraftView(await graphOf(id), 'home');
    const save = (change, body) => draftInstance(id, 'home', change, body);
    expect(await rejection(save({ portals: [{ ...portal('cave', 1, 1, 'cave', 1, 1), bogus: 1 }] }))).toMatchObject({
      status: 400,
      message: expect.stringContaining('bogus'),
    });
    expect(await rejection(save({ secret: 1 }))).toMatchObject({
      status: 400,
      message: expect.stringContaining('secret'),
    });
    expect(await rejection(save({ portals: [{ sourceCellX: 1, targetMapCode: 'cave' }] }))).toMatchObject({
      status: 400,
      message: expect.stringMatching(/sourceMapCode.*required/),
    });
    expect(await rejection(save({}, { conf: { ...view.conf, entityDefaults: ['not-a-row'] } }))).toMatchObject({
      status: 400,
      message: expect.stringContaining('a row id, a variant of the draft or a new row of the population'),
    });
    expect(await rejection(save({}, { baseRevision: 7 }))).toMatchObject({ status: 409 });
    expect(await save({ name: 'Home typed' })).toMatchObject({ state: 'draft', draftRevision: 1 });
    expect(await rejection(save({ name: 'Home again' }, { revision: 0 }))).toMatchObject({ status: 409 });
    const [entry] = (await recordOf(id)).instanceDrafts;
    expect(Object.keys(entry.document).sort()).toEqual(INSTANCE_FIELDS.filter((field) => field !== 'thumbnail').sort());
    expect(entry).toMatchObject({ code: 'home', baseRevision: 1, revision: 1, document: { name: 'Home typed' } });

    expect(
      await rejection(
        saveUniverseDraft({
          models: all(),
          id,
          code: 'realm',
          body: {
            document: { name: 'Realm', instances: [{ instanceCode: 'home', x: 0, y: 0, extra: 1 }], links: [] },
            baseRevision: null,
            revision: 0,
          },
          actor: MODERATOR,
          options: host,
        }),
      ),
    ).toMatchObject({ status: 400, message: expect.stringContaining('extra') });

    const twin = () =>
      saveInstanceDraft({
        models: all(),
        id,
        code: 'twin',
        body: { document: { name: 'Twin' }, conf: {}, baseRevision: null, revision: 0 },
        actor: MODERATOR,
        options: host,
      });
    const twins = await Promise.allSettled([twin(), twin()]);
    expect(twins.map(({ status }) => status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(twins.find(({ status }) => status === 'rejected').reason.status).toBe(409);
    expect((await recordOf(id)).instanceDrafts.filter(({ code }) => code === 'twin')).toHaveLength(1);
    await discardDocumentDraft({ models: all(), id, kind: 'instance', code: 'twin', options: host });

    const edits = await Promise.allSettled([
      saveAs(id, rows.shared._id, { row: { behavior: 'hostile' } }),
      saveAs(id, rows.shared._id, { row: { behavior: 'hostile' } }),
    ]);
    expect(edits.map(({ status }) => status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(edits.find(({ status }) => status === 'rejected').reason.status).toBe(409);
    expect((await recordOf(id)).defaultDrafts).toHaveLength(1);
    await discardDefaultDraft({ models: all(), id, key: edits.find(({ status }) => status === 'fulfilled').value.key });

    const read = await recordOf(id);
    await all().CyberiaProceduralPopulation.updateOne(
      { _id: id },
      { $set: { publication: { id: 'queued-one', status: 'queued', history: [] } } },
    );
    const late = {
      code: 'late',
      baseRevision: null,
      revision: 1,
      document: { name: 'Late', instances: [], links: [] },
      savedAt: new Date(),
    };
    expect(
      await rejection(
        writeDraft({
          models: all(),
          population: read,
          field: 'universeDrafts',
          identity: { code: 'late' },
          revision: 0,
          next: late,
        }),
      ),
    ).toMatchObject({ status: 409 });
    await all().CyberiaProceduralPopulation.updateOne({ _id: id }, { $set: { publication: null } });
  });

  it('reads and saves over drafts written before the typed contracts and before the global choice', async () => {
    const id = population._id;
    const far = await instanceOf('far-world');
    const document = { name: 'Far written raw', cyberiaMapCodes: ['dune'], portals: [], mapLayout: [], tags: [] };
    await all().CyberiaProceduralPopulation.collection.updateOne(
      { _id: id },
      {
        $push: {
          instanceDrafts: {
            code: 'far-world',
            baseRevision: far.revision,
            base: { document: { ...document, name: 'Far World' }, conf: { entityDefaults: [String(rows.shared._id)] } },
            revision: 1,
            document,
            conf: { aoiRadius: 12, economyCode: '', entityDefaults: [String(rows.shared._id)] },
            variants: [],
            savedAt: new Date(),
            savedBy: MODERATOR,
          },
        },
      },
    );
    expect(instanceDraftView(await graphOf(id), 'far-world')).toMatchObject({
      state: 'draft',
      draftRevision: 1,
      document: { name: 'Far written raw' },
    });
    expect(await draftInstance(id, 'far-world', { name: 'Far typed' })).toMatchObject({
      draftRevision: 2,
      document: { name: 'Far typed', status: 'unlisted' },
      conf: { aoiRadius: 12 },
    });
    await discardDocumentDraft({ models: all(), id, kind: 'instance', code: 'far-world', options: host });

    const solo = await all().CyberiaEntityTypeDefault.findById(rows.solo._id).lean();
    await all().CyberiaProceduralPopulation.collection.updateOne(
      { _id: id },
      {
        $push: {
          defaultDrafts: {
            key: 'legacy-solo',
            rowId: String(solo._id),
            baseUpdatedAt: solo.updatedAt,
            revision: 1,
            row: pick({ ...solo, behavior: 'hostile' }, DEFAULT_ROW_FIELDS),
            savedAt: new Date(),
            savedBy: MODERATOR,
          },
        },
      },
    );
    expect(await defaultView(all(), id, 'legacy-solo', host)).toMatchObject({
      revision: 1,
      global: false,
      instanceCodes: ['other'],
      row: { behavior: 'hostile' },
    });
    expect(await saveAs(id, 'legacy-solo')).toMatchObject({ revision: 2, global: false, instanceCodes: ['other'] });
    await discardDefaultDraft({ models: all(), id, key: 'legacy-solo' });
  });

  it('connects portals through the map draft, between stored and drafted maps, and keeps the stored instance as it is', async () => {
    const id = population._id;
    const glade = await all().CyberiaMap.findOne({ code: 'glade' }).lean();
    await saveDraft({
      models: all(),
      id,
      body: {
        grid: GRID,
        entities: [entity('floor', ['moss'], 0, 0), entity('portal', [], 2, 2), entity('portal', [], 5, 5)],
        revision: 0,
        baseRevision: glade.revision,
      },
      actor: MODERATOR,
    });
    const codes = ['cave', 'glade', 'moor'];
    const proposed = graphPortals(await graphOf(id), codes);
    const fromDraft = ({ sourceMapCode, sourceCellX }) => sourceMapCode === 'glade' && sourceCellX === 5;
    expect(proposed.portals.some(fromDraft)).toBe(true);
    const storedMaps = await all()
      .CyberiaMap.find({ code: { $in: codes } })
      .lean();
    expect(connectPortals(codes, storedMaps).portals.some(fromDraft)).toBe(false);

    const portals = [...proposed.portals, portal('glade', 5, 5, 'glade', 2, 2, 'intra-portal')];
    await draftInstance(id, 'home', {
      cyberiaMapCodes: codes,
      mapLayout: codes.map((mapCode, x) => ({ mapCode, x, y: 0 })),
      portals,
    });
    expect((await problemsOf(id)).errors).toEqual([]);
    expect(instanceDraftView(await graphOf(id), 'home').document.portals).toHaveLength(portals.length);
    expect(await instanceOf('home')).toMatchObject({ cyberiaMapCodes: ['cave'], portals: [] });
  });

  it('draws each preview at the revision asked, refuses one of an older revision, and never draws another revision under a racing save', async () => {
    const id = population._id;
    const { draft, revision } = await recordOf(id);
    expect(Buffer.isBuffer(await draftMapPicture(all(), id, host, draft.revision))).toBe(true);
    expect(await rejection(draftMapPicture(all(), id, host, draft.revision - 1))).toMatchObject({ status: 409 });
    const world = await draftWorldPicture(all(), id, 'home', host, revision);
    expect(Buffer.isBuffer(world)).toBe(true);
    expect(await rejection(draftWorldPicture(all(), id, 'home', host, revision - 1))).toMatchObject({ status: 409 });
    const kept = ['cave', 'glade'];
    const { portals } = instanceDraftView(await graphOf(id), 'home').document;
    const layout = {
      cyberiaMapCodes: kept,
      mapLayout: kept.map((mapCode, x) => ({ mapCode, x, y: 0 })),
      portals: portals.filter(
        ({ sourceMapCode, targetMapCode }) => kept.includes(sourceMapCode) && kept.includes(targetMapCode),
      ),
    };
    await draftInstance(id, 'home', layout);
    const at = (await recordOf(id)).revision;
    const moved = await draftWorldPicture(all(), id, 'home', host, at);
    expect(moved.equals(world)).toBe(false);

    const racing = await Promise.allSettled([
      draftWorldPicture(all(), id, 'home', host, at),
      draftInstance(id, 'home', {
        cyberiaMapCodes: ['cave'],
        mapLayout: [{ mapCode: 'cave', x: 0, y: 0 }],
        portals: [],
      }),
      draftWorldPicture(all(), id, 'home', host, at + 1),
    ]);
    const next = await draftWorldPicture(all(), id, 'home', host, at + 1);
    for (const [result, drawn] of [
      [racing[0], moved],
      [racing[2], next],
    ])
      if (result.status === 'fulfilled') expect(result.value.equals(drawn)).toBe(true);
      else expect(result.reason.status).toBe(409);
    expect(racing[1].status).toBe('fulfilled');
    await draftInstance(id, 'home', layout);
  });

  it('edits a default and the instances that run it in one save, and keeps a row global only by choice', async () => {
    const id = population._id;
    const [shared, wolf, solo] = [rows.shared, rows.wolf, rows.solo].map(({ _id }) => String(_id));
    for (const rowId of [shared, wolf]) await addDefault({ models: all(), id, rowId });

    const linked = await saveAs(id, wolf, { instanceCodes: ['home'] });
    expect(linked).toMatchObject({ state: 'persisted', instanceCodes: ['home'], storedInstanceCodes: [] });
    expect(instanceDraftView(await graphOf(id), 'home').conf.entityDefaults).toEqual([shared, wolf]);
    expect((await problemsOf(id)).warnings).toContain(
      `Entity-type default ${wolf} runs in every world now; once home references it, only home runs it`,
    );
    const workspace = await populationDefaults(all(), id);
    expect(workspace.rows.find(({ rowId }) => rowId === wolf)).toMatchObject({ instances: ['home'], joins: ['home'] });
    expect(await defaultWorlds(all(), await recordOf(id))).toEqual([]);
    expect(await rejection(saveAs(id, wolf, { instanceCodes: [] }))).toMatchObject({
      status: 400,
      message: 'Choose the instances that run this default, or make it global: every world runs it',
    });
    expect(await saveAs(id, wolf, { instanceCodes: [], global: true })).toMatchObject({ instanceCodes: [] });
    expect(instanceDraftView(await graphOf(id), 'home').conf.entityDefaults).toEqual([shared]);

    const madeGlobal = await saveAs(id, solo, { instanceCodes: [], global: true });
    expect(madeGlobal).toMatchObject({
      state: 'draft',
      global: true,
      instanceCodes: [],
      storedInstanceCodes: ['other'],
    });
    expect((await problemsOf(id)).errors).toEqual([]);
    await discardDefaultDraft({ models: all(), id, key: madeGlobal.key });
    expect((await problemsOf(id)).errors).toContain(
      `Entity-type default ${solo} loses its last instance reference and would run in every world: drop the variant that replaces it`,
    );
    await discardDocumentDraft({ models: all(), id, kind: 'instance', code: 'other', options: host });

    const edit = await saveAs(id, shared, { row: { behavior: 'hostile' } });
    expect(edit).toMatchObject({
      state: 'draft',
      revision: 1,
      instanceCodes: ['far-world', 'home'],
      row: { behavior: 'hostile' },
    });
    expect((await populationDefaults(all(), id)).rows.find(({ rowId }) => rowId === shared)).toMatchObject({
      behavior: 'hostile',
      draft: { key: edit.key, state: 'draft' },
      instances: ['far-world', 'home'],
    });
    expect(await all().CyberiaEntityTypeDefault.findById(shared).lean()).toMatchObject({ behavior: 'passive' });
    expect(await defaultWorlds(all(), await recordOf(id))).toEqual(['far-world']);

    const stored = await all().CyberiaEntityTypeDefault.findById(shared).lean();
    await all().CyberiaEntityTypeDefault.updateOne(
      { _id: shared },
      { $set: { updatedAt: new Date(Date.now() + 1000) } },
      { timestamps: false },
    );
    expect((await problemsOf(id)).errors).toContain(
      `Entity-type default ${shared} changed after the draft: discard its edit, then edit it again`,
    );
    await all().CyberiaEntityTypeDefault.updateOne(
      { _id: shared },
      { $set: { updatedAt: stored.updatedAt } },
      { timestamps: false },
    );
    expect((await problemsOf(id)).errors).toEqual([]);
  });

  it('starts a new default with the instance it comes from, shows the same links when reopened, and discards them with it', async () => {
    const id = population._id;
    const moth = { entityType: 'bot', liveItemIds: ['moth-skin'], behavior: 'hostile' };
    expect(await rejection(saveAs(id, 'new', { row: moth, instanceCodes: [] }))).toMatchObject({ status: 400 });
    const created = await saveAs(id, 'new', { row: moth, instanceCodes: ['home'] });
    expect(created).toMatchObject({ state: 'new', rowId: null, revision: 1, instanceCodes: ['home'] });
    const ref = `draft:${created.key}`;
    expect(instanceDraftView(await graphOf(id), 'home').conf.entityDefaults).toContain(ref);
    expect(await defaultView(all(), id, created.key, host)).toMatchObject({ instanceCodes: ['home'], row: moth });
    expect((await populationDefaults(all(), id)).rows.find(({ rowId }) => rowId === ref)).toMatchObject({
      instances: ['home'],
      draft: { state: 'new' },
    });
    expect((await problemsOf(id)).errors).toEqual([]);

    const extra = await saveAs(id, 'new', {
      row: { ...moth, liveItemIds: ['gnat-skin'] },
      instanceCodes: ['far-world'],
    });
    await discardDefaultDraft({ models: all(), id, key: extra.key });
    expect(instanceDraftView(await graphOf(id), 'far-world').conf.entityDefaults).not.toContain(`draft:${extra.key}`);
    expect((await problemsOf(id)).errors).toEqual([]);
  });

  it('publishes the reviewed graph, reloads every consumer of the edited default and no other world, and runs what the workspace showed', async () => {
    const id = population._id;
    const shared = String(rows.shared._id);
    const proposed = instanceDraftView(await graphOf(id), 'home').document.portals;
    const predicted = (await populationDefaults(all(), id)).rows.find(({ rowId }) => rowId === shared);
    reloads.length = 0;
    const publication = await publish(id);
    expect(publication.status, JSON.stringify(publication.error)).toBe('completed');
    expect(publication.commit).toMatchObject({
      defaults: [
        { rowId: shared, created: false },
        { created: true, rowId: expect.stringMatching(/^[0-9a-f]{24}$/) },
      ],
      instances: [{ code: 'home', from: 1, to: 2 }],
      worlds: ['far-world', 'home'],
    });
    const moth = publication.commit.defaults[1].rowId;
    expect(
      (await all().CyberiaInstanceConf.findOne({ instanceCode: 'home' }).lean()).entityDefaults.map(String),
    ).toEqual([shared, moth]);
    expect(reloads.map(({ instanceCode }) => instanceCode).sort()).toEqual(['far-world', 'home']);
    expect((await instanceOf('home')).portals).toEqual(proposed);
    expect(await all().CyberiaEntityTypeDefault.findById(shared).lean()).toMatchObject({ behavior: 'hostile' });
    for (const code of predicted.instances) {
      const conf = await all().CyberiaInstanceConf.findOne({ instanceCode: code }).lean();
      const running = await CyberiaEntityTypeDefaultService.resolveWithCanonical(conf.entityDefaults, host);
      expect(resolveEntityDefaultBuild({ entityType: 'bot', itemIds: ['guard-skin'] }, running)).toMatchObject({
        behavior: predicted.behavior,
        liveItemIds: predicted.liveItemIds,
      });
      const mothRunner = resolveEntityDefaultBuild({ entityType: 'bot', itemIds: ['moth-skin'] }, running);
      expect(mothRunner.liveItemIds.includes('moth-skin')).toBe(code === 'home');
    }
  });

  it('keeps the working copies of a closed population for the retention window, then clears them once, safely', async () => {
    const published = await recordOf(population._id);
    const closedAt = published.publication.history.findLast(({ status }) => status === 'completed').at;
    const File = DataBaseProviderService.getModel('File', host);
    const file = (name) => ({ name, data: Buffer.from(name), mimetype: 'image/png' });
    const [orphan, shared, released] = await File.create([file('draft-only'), file('shared'), file('released')]);
    const cancelled = await populate(2);
    await draftInstance(cancelled._id, 'other', { thumbnail: String(orphan._id) });
    await draftInstance(cancelled._id, 'far-world', { thumbnail: String(shared._id) });
    await draftInstance(cancelled._id, 'home', { thumbnail: String(released._id) });
    await cancelPopulation({ models: all(), id: cancelled._id, actor: MODERATOR, now: closedAt });
    const open = await populate(3);
    await draftInstance(open._id, 'far-world', { name: 'Far in an open population', thumbnail: String(shared._id) });
    const releaseDatabase = 'cyberia-procedural-release-kept';
    await DataBaseProviderService.getModel('CyberiaContentRelease', host).create({
      releaseId: 'kept',
      database: releaseDatabase,
      status: 'retired',
    });
    const { connection } = DataBaseProviderService.getProvider(host);
    await (
      await MongooseDB.bindModel(connection.useDb(releaseDatabase, { useCache: true }), 'cyberia-instance')
    ).create({ code: 'home', thumbnail: released._id });

    const prune = (days, apply = false) =>
      pruneClosedDrafts({ models: all(), options: host, apply, now: new Date(closedAt.getTime() + days * DAY_MS) });
    const early = await prune(1);
    expect(early.cleaned).toEqual([]);
    expect(early.retained.map(({ id }) => id).sort()).toEqual([String(published._id), String(cancelled._id)].sort());

    const dry = await prune(15);
    expect(dry.cleaned.map(({ id, closed }) => [id, closed]).sort()).toEqual(
      [
        [String(published._id), 'published'],
        [String(cancelled._id), 'cancelled'],
      ].sort(),
    );
    expect(dry.cleaned.every(({ bytes }) => bytes > 0)).toBe(true);
    expect(dry.cleaned.find(({ id }) => id === String(cancelled._id)).files).toEqual({
      deleted: [String(orphan._id)],
      kept: expect.arrayContaining([String(shared._id), String(released._id)]),
    });
    expect(await File.exists({ _id: orphan._id })).not.toBeNull();
    expect((await recordOf(published._id)).instanceDrafts).toHaveLength(1);

    const applied = await prune(15, true);
    expect(applied.cleaned.find(({ id }) => id === String(published._id)).drafts).toEqual({
      map: 1,
      instances: 1,
      universes: 0,
      defaults: 2,
    });
    const cleaned = await recordOf(published._id);
    expect(cleaned).toMatchObject({ draft: null, instanceDrafts: [], universeDrafts: [], defaultDrafts: [] });
    expect(cleaned.draftsPrunedAt).toBeInstanceOf(Date);
    expect(cleaned.publication).toMatchObject({ status: 'completed', commit: published.publication.commit });
    expect(await File.exists({ _id: orphan._id })).toBeNull();
    expect(await File.exists({ _id: shared._id })).not.toBeNull();
    expect(await File.exists({ _id: released._id })).not.toBeNull();
    expect((await recordOf(open._id)).instanceDrafts).toHaveLength(1);

    await all().CyberiaProceduralPopulation.updateOne(
      { _id: open._id },
      {
        $set: {
          cancelledAt: closedAt,
          publication: {
            id: 'held',
            status: 'queued',
            lease: { holder: 'w', expiresAt: new Date(closedAt.getTime() + 60 * DAY_MS) },
            history: [],
          },
        },
      },
    );
    expect((await prune(30)).cleaned.map(({ id }) => id)).not.toContain(String(open._id));
    expect((await prune(30, true)).cleaned).toEqual([]);
  });
});
