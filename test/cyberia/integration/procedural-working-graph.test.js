// Requires mongod (UNDERPOST_MONGOD_BIN). A stub game server answers the hot reloads over HTTP.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import { DataBaseProviderService } from '../../../src/db/DataBaseProvider.js';
import { portalTopology } from '../../../src/api/cyberia-instance/cyberia-portal-connector.js';
import { findGlobalDefaults } from '../../../src/api/cyberia-entity-type-default/cyberia-entity-type-default.service.js';
import { populationModels } from '../../../src/projects/cyberia/procedural/population/map-context.js';
import {
  createPopulation,
  getPopulation,
  saveDraft,
  updateTarget,
} from '../../../src/projects/cyberia/procedural/population/population.js';
import { authorTarget } from '../../../src/projects/cyberia/procedural/population/results.js';
import { workspaceOf } from '../../../src/projects/cyberia/procedural/population/defaults.js';
import { publishRevision } from '../../../src/projects/cyberia/procedural/jobs/promotion.js';
import {
  advancePublication,
  claimPublication,
  refreshPublication,
  requestPublication,
  validatePublication,
} from '../../../src/projects/cyberia/procedural/population/publication.js';
import {
  discardDocumentDraft,
  dropVariant,
  graphProblems,
  graphTopology,
  instanceDraftView,
  populationGraph,
  proposeVariant,
  rebaseDocumentDraft,
  runtimeContextOf,
  saveInstanceDraft,
  saveUniverseDraft,
  saveVariant,
  universeDraftView,
  variantRef,
} from '../../../src/projects/cyberia/procedural/population/working-graph.js';
import { sourceFromDirectionFrames, toWire } from '../../../src/client/components/objectlayer-studio/RenderSource.js';
import { mongodBinary } from '../../support/mongod.js';
import {
  MODERATOR,
  definitionOf,
  host,
  publishItem,
  rejection,
  startEngine,
  stopEngine,
} from '../../support/procedural-engine.js';

const GRID = { gridX: 8, gridY: 8, cellWidth: 16, cellHeight: 16 };
const entity = (entityType, objectLayerItemIds, x, y) => ({
  entityType,
  objectLayerItemIds,
  initCellX: x,
  initCellY: y,
  dimX: 1,
  dimY: 1,
  color: 'rgba(10, 20, 30, 1)',
});
const portal = (sourceMapCode, sourceCellX, sourceCellY, targetMapCode, targetCellX, targetCellY) => ({
  sourceMapCode,
  sourceCellX,
  sourceCellY,
  targetMapCode,
  targetCellX,
  targetCellY,
  portalMode: 'inter-portal',
});
const tile = sourceFromDirectionFrames({
  framesByCode: { '08': [Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => [40, 120, 70, 255]))] },
  frameDurationMs: 250,
});

const all = () => populationModels(host);
const graphOf = (id) => populationGraph(all(), id, host);
const problemsOf = async (id) => await graphProblems(all(), await graphOf(id), host);
const instanceOf = (code) => all().CyberiaInstance.findOne({ code }).lean();
const confOf = (code) => all().CyberiaInstanceConf.findOne({ instanceCode: code }).lean();
const universeModel = () => DataBaseProviderService.getModel('CyberiaUniverse', host);
/** Saves the draft of an instance from what the working graph holds, with changes. */
const draftInstance = async (id, code, change) => {
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
    },
    actor: MODERATOR,
    options: host,
  });
};
const newInstance = (id, code, document) =>
  saveInstanceDraft({
    models: all(),
    id,
    code,
    body: { document: { name: code, cyberiaMapCodes: [], ...document }, conf: {}, baseRevision: null, revision: 0 },
    actor: MODERATOR,
    options: host,
  });
const draftUniverse = (id, code, document, baseRevision = null, revision = 0) =>
  saveUniverseDraft({
    models: all(),
    id,
    code,
    body: { document: { name: code, description: '', links: [], ...document }, baseRevision, revision },
    actor: MODERATOR,
    options: host,
  });

describe.skipIf(!mongodBinary)('the working graph of a map population', () => {
  const reloads = [];
  let server;
  let shared;
  let population;

  beforeAll(async () => {
    await startEngine({ maps: {}, entities: [] });
    process.env.CYBERIA_SERVER_API_KEY = 'working-graph-key';
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
      { code: 'dune', name: 'Dune', ...GRID, worldX: 300, worldY: 0 },
    ]);
    shared = await CyberiaEntityTypeDefault.create({
      entityType: 'bot',
      liveItemIds: ['guard-skin'],
      behavior: 'passive',
    });
    await CyberiaEntityTypeDefault.create({ entityType: 'bot', liveItemIds: ['wolf-skin'], behavior: 'hostile' });
    await DataBaseProviderService.getModel('CyberiaEconomy', host).create({ code: 'standard', name: 'Standard' });
    await CyberiaInstance.create([
      { code: 'home', name: 'Home', cyberiaMapCodes: ['cave'] },
      { code: 'far-world', name: 'Far World', cyberiaMapCodes: ['dune'] },
      { code: 'other', name: 'Other', cyberiaMapCodes: ['peak'] },
    ]);
    await CyberiaInstanceConf.create([
      { instanceCode: 'home', entityDefaults: [shared._id] },
      { instanceCode: 'far-world', entityDefaults: [shared._id] },
      { instanceCode: 'other', entityDefaults: [] },
    ]);
    await universeModel().create({
      code: 'realm',
      name: 'Realm',
      instances: [{ instanceCode: 'far-world', x: 0, y: 0 }],
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const now = new Date();
    await DataBaseProviderService.getModel('CyberiaServerRegistry', host).create(
      ['home', 'far-world', 'other', 'new-world'].map((code, index) => ({
        serverId: `server-${index}`,
        url: `${base}/${code}`,
        instanceCode: code,
        state: 'ready',
        seq: 1,
        startedAt: now,
        lastSeen: now,
      })),
    );
    population = await createPopulation({
      models: all(),
      request: { mapCode: 'glade', seed: { mode: 'fixed', value: 1 } },
      actor: MODERATOR,
    });
  }, 120000);

  afterAll(async () => {
    delete process.env.CYBERIA_SERVER_API_KEY;
    await new Promise((done) => server.close(done));
    await stopEngine();
  });

  it('shows an unassigned map as optional context, and keeps a saved instance draft out of the stored instance', async () => {
    const id = population._id;
    expect((await getPopulation(all(), id)).steps.context).toEqual({
      state: 'optional',
      detail: 'This map is not assigned to an instance or universe.',
    });
    expect((await runtimeContextOf(await graphOf(id), host)).instances).toEqual([]);
    const stored = await instanceOf('home');
    const saved = await draftInstance(id, 'home', {
      cyberiaMapCodes: ['cave', 'glade'],
      mapLayout: [
        { mapCode: 'cave', x: 0, y: 0 },
        { mapCode: 'glade', x: 1, y: 0 },
      ],
      portals: [portal('glade', 2, 2, 'cave', 1, 1), portal('cave', 1, 1, 'glade', 2, 2)],
    });
    expect(saved).toMatchObject({ state: 'draft', baseRevision: 1, draftRevision: 1, preview: 'draft' });
    expect(await instanceOf('home')).toEqual(stored);

    const context = await runtimeContextOf(await graphOf(id), host);
    expect(context.instances).toEqual([
      expect.objectContaining({
        code: 'home',
        state: 'draft',
        association: 'adds',
        membership: 'same',
        universe: null,
        preview: 'draft',
        servers: { available: 1, total: 1 },
        defaults: { rows: 1, variants: 0 },
      }),
    ]);
    expect((await getPopulation(all(), id)).steps.context).toEqual({
      state: 'ready',
      detail: 'Run by 1 instance · 1 draft saved to the population',
    });
    expect(instanceDraftView(await graphOf(id), 'home').document.cyberiaMapCodes).toEqual(['cave', 'glade']);
    await expect(
      saveInstanceDraft({
        models: all(),
        id,
        code: 'home',
        body: { document: saved.document, conf: saved.conf, baseRevision: 1, revision: 0 },
        actor: MODERATOR,
        options: host,
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(await problemsOf(id)).toEqual({ errors: [], warnings: [] });
  });

  it('resolves portals against the map draft, and names a portal to a map outside the instance', async () => {
    const id = population._id;
    const draft = (await getPopulation(all(), id)).draft;
    await saveDraft({
      models: all(),
      id,
      body: {
        grid: GRID,
        entities: [entity('floor', ['moss'], 0, 0), entity('portal', [], 2, 2), entity('portal', [], 5, 5)],
        revision: draft?.revision ?? 0,
        baseRevision: (await all().CyberiaMap.findOne({ code: 'glade' }).lean()).revision,
      },
      actor: MODERATOR,
    });
    const portals = [portal('glade', 5, 5, 'cave', 1, 1), portal('cave', 1, 1, 'glade', 2, 2)];
    const graph = await graphOf(id);
    expect(graphTopology(graph, { mapCodes: ['cave', 'glade'], portals })).toMatchObject({
      unresolved: [],
      invalid: [],
      unreachable: [],
    });
    const persisted = await all()
      .CyberiaMap.find({ code: { $in: ['cave', 'glade'] } })
      .lean();
    expect(portalTopology(['cave', 'glade'], persisted, portals).unresolved).toEqual([
      expect.objectContaining({ sourceMapCode: 'glade', sourceCellX: 5, sourceCellY: 5 }),
    ]);
    await draftInstance(id, 'home', { portals: [...portals, portal('glade', 2, 2, 'ghost', 0, 0)] });
    expect((await problemsOf(id)).errors).toEqual([
      'Instance home: the portal from glade to ghost names a map outside the instance or a deleted map',
    ]);
    await draftInstance(id, 'home', { portals });
    expect((await problemsOf(id)).errors).toEqual([]);
  });

  it('refuses a map two instances list, as the map registry refuses it, and a discard brings back the stored instance', async () => {
    const id = population._id;
    await draftInstance(id, 'far-world', {
      cyberiaMapCodes: ['dune', 'glade'],
      mapLayout: [
        { mapCode: 'dune', x: 0, y: 0 },
        { mapCode: 'glade', x: 1, y: 0 },
      ],
    });
    expect((await problemsOf(id)).errors).toContain('Map glade has conflicting owners: far-world, home');
    expect(await discardDocumentDraft({ models: all(), id, kind: 'instance', code: 'far-world' })).toEqual({
      discarded: true,
    });
    expect(instanceDraftView(await graphOf(id), 'far-world')).toMatchObject({ state: 'persisted' });
    expect((await problemsOf(id)).errors).toEqual([]);
  });

  it('drafts a new instance and a new universe of drafted members, and refuses an instance in two universes or an unknown member', async () => {
    const id = population._id;
    await newInstance(id, 'new-world', { name: 'New World' });
    const universe = await draftUniverse(id, 'new-realm', {
      instances: [
        { instanceCode: 'new-world', x: 0, y: 0 },
        { instanceCode: 'home', x: 1, y: 0 },
      ],
      links: [{ sourceInstanceCode: 'new-world', targetInstanceCode: 'home', bidirectional: true }],
    });
    expect(universe).toMatchObject({ state: 'new', members: [{ state: 'new' }, { state: 'draft', preview: 'draft' }] });
    expect(await universeModel().exists({ code: 'new-realm' })).toBeNull();
    expect(await instanceOf('new-world')).toBeNull();
    const context = await runtimeContextOf(await graphOf(id), host);
    expect(context.instances.find(({ code }) => code === 'home')).toMatchObject({
      membership: 'joins',
      universe: { code: 'new-realm', state: 'new' },
    });
    expect(context.universes).toEqual([
      expect.objectContaining({ code: 'new-realm', state: 'new', joins: ['new-world', 'home'], leaves: [] }),
    ]);
    expect((await problemsOf(id)).errors).toEqual([]);

    const realm = await universeModel().findOne({ code: 'realm' }).lean();
    await draftUniverse(
      id,
      'realm',
      {
        name: 'Realm',
        instances: [
          { instanceCode: 'far-world', x: 0, y: 0 },
          { instanceCode: 'home', x: 1, y: 0 },
          { instanceCode: 'nobody', x: 2, y: 0 },
        ],
      },
      realm.revision,
    );
    expect((await problemsOf(id)).errors).toEqual([
      'Universe realm names instance nobody, which neither exists nor is drafted',
      'Instance home joins universes realm and new-realm',
    ]);
    await discardDocumentDraft({ models: all(), id, kind: 'universe', code: 'realm', options: host });
    await expect(
      draftUniverse(id, 'bad', {
        instances: [{ instanceCode: 'home', x: 0, y: 0 }],
        links: [{ sourceInstanceCode: 'home', targetInstanceCode: 'home' }],
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(universeDraftView(await graphOf(id), 'realm')).toMatchObject({ state: 'persisted' });
  });

  it('proposes an instance-specific variant of a shared default: only that instance changes, and no global row appears', async () => {
    const id = population._id;
    const proposed = await proposeVariant({
      models: all(),
      id,
      code: 'home',
      rowId: String(shared._id),
      actor: MODERATOR,
      options: host,
    });
    expect(proposed.conf.entityDefaults).toEqual([variantRef(proposed.key)]);
    expect(proposed.variants).toEqual([
      expect.objectContaining({
        key: proposed.key,
        from: String(shared._id),
        row: expect.objectContaining({ behavior: 'passive' }),
      }),
    ]);
    const saved = await saveVariant({
      models: all(),
      id,
      code: 'home',
      key: proposed.key,
      body: { row: { ...proposed.variants[0].row, behavior: 'hostile' }, revision: proposed.draftRevision },
      actor: MODERATOR,
      options: host,
    });
    expect(saved.variants[0].row.behavior).toBe('hostile');
    expect(instanceDraftView(await graphOf(id), 'far-world').conf.entityDefaults).toEqual([String(shared._id)]);
    expect(await all().CyberiaEntityTypeDefault.countDocuments()).toBe(2);
    expect((await problemsOf(id)).errors).toEqual([]);
  });

  it('gives one instance a variant of a global default, shows who runs each row, and refuses a variant that would turn a row global', async () => {
    const id = population._id;
    const wolf = await all().CyberiaEntityTypeDefault.findOne({ liveItemIds: 'wolf-skin' }).lean();
    const proposed = await proposeVariant({
      models: all(),
      id,
      code: 'other',
      rowId: String(wolf._id),
      actor: MODERATOR,
      options: host,
    });
    expect(proposed.conf.entityDefaults).toEqual([variantRef(proposed.key)]);
    expect(proposed.variants).toEqual([expect.objectContaining({ from: String(wolf._id), scope: 'global' })]);
    expect((await problemsOf(id)).errors).toEqual([]);

    const lean = await all().CyberiaProceduralPopulation.findById(id).lean();
    const { rows } = await workspaceOf(
      all(),
      { ...lean, defaults: { added: [shared._id, wolf._id], removed: [] } },
      [],
    );
    const home = instanceDraftView(await graphOf(id), 'home').variants[0];
    expect(
      rows.map(({ rowId, instances, variant, overriddenBy, behavior }) => ({
        rowId,
        instances,
        variant,
        overriddenBy,
        behavior,
      })),
    ).toEqual([
      {
        rowId: String(shared._id),
        instances: ['far-world'],
        variant: null,
        overriddenBy: [{ instanceCode: 'home', key: home.key, from: String(shared._id), scope: 'shared' }],
        behavior: 'passive',
      },
      {
        rowId: String(wolf._id),
        instances: [],
        variant: null,
        overriddenBy: [{ instanceCode: 'other', key: proposed.key, from: String(wolf._id), scope: 'global' }],
        behavior: 'hostile',
      },
      {
        rowId: variantRef(home.key),
        instances: ['home'],
        variant: { instanceCode: 'home', key: home.key, from: String(shared._id), scope: 'shared' },
        overriddenBy: [],
        behavior: 'hostile',
      },
      {
        rowId: variantRef(proposed.key),
        instances: ['other'],
        variant: { instanceCode: 'other', key: proposed.key, from: String(wolf._id), scope: 'global' },
        overriddenBy: [],
        behavior: 'hostile',
      },
    ]);

    expect(
      await rejection(
        proposeVariant({
          models: all(),
          id,
          code: 'far-world',
          rowId: String(shared._id),
          actor: MODERATOR,
          options: host,
        }),
      ),
    ).toMatchObject({
      status: 409,
      message: `Entity-type default ${shared._id} runs only in instance far-world: edit it in the Entity Studio, a variant is for a shared or global row`,
    });
    await all().CyberiaInstanceConf.updateOne({ instanceCode: 'far-world' }, { $set: { entityDefaults: [] } });
    expect((await problemsOf(id)).errors).toEqual([
      `Entity-type default ${shared._id} loses its last instance reference and would run in every world: drop the variant that replaces it`,
    ]);
    await all().CyberiaInstanceConf.updateOne(
      { instanceCode: 'far-world' },
      { $set: { entityDefaults: [shared._id] } },
    );

    const dropped = await dropVariant({
      models: all(),
      id,
      code: 'other',
      key: proposed.key,
      actor: MODERATOR,
      options: host,
    });
    expect(dropped).toMatchObject({ conf: { entityDefaults: [] }, variants: [] });
    await discardDocumentDraft({ models: all(), id, kind: 'instance', code: 'other', options: host });
    expect((await problemsOf(id)).errors).toEqual([]);
  });

  it('deletes the thumbnail a draft uploaded when another replaces it or the draft goes, and keeps the stored one', async () => {
    const id = population._id;
    const File = DataBaseProviderService.getModel('File', host);
    const [stored, first, second] = await File.create(
      ['stored', 'first', 'second'].map((name) => ({ name, data: Buffer.from(name), mimetype: 'image/png' })),
    );
    await all().CyberiaInstance.updateOne({ code: 'other' }, { $set: { thumbnail: stored._id } });
    await draftInstance(id, 'other', { thumbnail: String(first._id) });
    await draftInstance(id, 'other', { thumbnail: String(second._id) });
    expect(await File.exists({ _id: first._id })).toBeNull();
    expect(await File.exists({ _id: second._id })).not.toBeNull();
    await discardDocumentDraft({ models: all(), id, kind: 'instance', code: 'other', options: host });
    expect(await File.exists({ _id: second._id })).toBeNull();
    expect(await File.exists({ _id: stored._id })).not.toBeNull();
    await all().CyberiaInstance.updateOne({ code: 'other' }, { $unset: { thumbnail: 1 } });
    await File.deleteOne({ _id: stored._id });
  });

  it('refuses a draft whose stored document moved, and a rebase keeps both changes or names the field both changed', async () => {
    const id = population._id;
    await all().CyberiaInstance.updateOne({ code: 'home' }, { $set: { description: 'edited elsewhere', revision: 2 } });
    expect((await problemsOf(id)).errors).toEqual([
      'Instance home moved to revision 2; the draft starts from revision 1: reopen it in the Instance Studio',
    ]);
    const rebase = (body) =>
      rebaseDocumentDraft({ models: all(), id, kind: 'instance', code: 'home', body, actor: MODERATOR, options: host });
    const rebased = await rebase();
    expect(rebased).toMatchObject({
      state: 'draft',
      baseRevision: 2,
      revision: 2,
      document: { description: 'edited elsewhere', cyberiaMapCodes: ['cave', 'glade'] },
    });
    expect(rebased.conf.entityDefaults).toEqual([expect.stringMatching(/^variant:/)]);
    expect((await problemsOf(id)).errors).toEqual([]);

    await draftInstance(id, 'home', { name: 'Home of the draft' });
    await all().CyberiaInstance.updateOne({ code: 'home' }, { $set: { name: 'Home elsewhere', revision: 3 } });
    expect(await rejection(rebase())).toMatchObject({
      status: 409,
      message: 'home changed name in the draft and at revision 3: keep the draft values, or discard the draft',
    });
    expect(await rebase({ prefer: 'draft' })).toMatchObject({
      baseRevision: 3,
      document: { name: 'Home of the draft' },
    });
    await draftInstance(id, 'home', { name: 'Home elsewhere' });
    expect((await problemsOf(id)).errors).toEqual([]);
  });

  it('publishes the whole graph in one commit and reloads exactly the worlds it changed', async () => {
    const id = population._id;
    const moss = (await getPopulation(all(), id)).targets.find(({ itemId }) => itemId === 'moss');
    await updateTarget({ models: all(), id, itemId: moss.itemId, body: { resolution: 'keep' }, actor: MODERATOR });
    const review = await validatePublication({ models: all(), id, options: host });
    expect(review).toMatchObject({ ready: true, problems: [] });
    expect(review.plan).toMatchObject({
      instances: [
        { code: 'home', baseRevision: 3 },
        { code: 'new-world', baseRevision: null },
      ],
      universes: [{ code: 'new-realm', baseRevision: null }],
      worlds: ['home', 'new-world'],
    });
    const { revision } = await all().CyberiaProceduralPopulation.findById(id, { revision: 1 }).lean();
    await requestPublication({ models: all(), id, actor: MODERATOR, revision });
    let status = '';
    for (let step = 0; step < 6 && status !== 'completed'; step++) {
      const claimed = await claimPublication({ models: all(), holder: 'worker-a' });
      if (!claimed) break;
      await advancePublication({
        models: all(),
        population: claimed,
        holder: 'worker-a',
        options: host,
        refresh: refreshPublication,
      });
      status = (await getPopulation(all(), id)).publication.status;
    }
    expect(status, JSON.stringify((await getPopulation(all(), id)).publication.error)).toBe('completed');

    const home = await instanceOf('home');
    expect(home).toMatchObject({
      revision: 4,
      name: 'Home elsewhere',
      cyberiaMapCodes: ['cave', 'glade'],
      description: 'edited elsewhere',
    });
    expect(home.portals.map(({ sourceMapCode, sourceCellX }) => [sourceMapCode, sourceCellX])).toEqual([
      ['glade', 5],
      ['cave', 1],
    ]);
    const [homeConf, farConf, created] = await Promise.all([
      confOf('home'),
      confOf('far-world'),
      instanceOf('new-world'),
    ]);
    expect(farConf.entityDefaults.map(String)).toEqual([String(shared._id)]);
    const [variantId] = homeConf.entityDefaults.map(String);
    expect(variantId).not.toBe(String(shared._id));
    expect(await all().CyberiaEntityTypeDefault.findById(variantId).lean()).toMatchObject({ behavior: 'hostile' });
    expect(await all().CyberiaEntityTypeDefault.findById(shared._id).lean()).toMatchObject({ behavior: 'passive' });
    expect((await findGlobalDefaults(all())).map(({ _id }) => String(_id))).not.toContain(variantId);
    expect(created).toMatchObject({ revision: 1, name: 'New World', conf: (await confOf('new-world'))._id });
    expect(await universeModel().findOne({ code: 'new-realm' }).lean()).toMatchObject({
      revision: 1,
      instances: [
        expect.objectContaining({ instanceCode: 'new-world' }),
        expect.objectContaining({ instanceCode: 'home' }),
      ],
    });
    const owner = await DataBaseProviderService.getModel('CyberiaGlobalMapCodeRegistry', host)
      .findOne({ mapCode: 'glade' })
      .lean();
    expect(owner).toMatchObject({ instanceCode: 'home' });
    expect((await getPopulation(all(), id)).publication.commit).toMatchObject({
      instances: [
        { code: 'home', from: 3, to: 4 },
        { code: 'new-world', from: null, to: 1 },
      ],
      universes: [{ code: 'new-realm', from: null, to: 1 }],
      variants: [expect.objectContaining({ instanceCode: 'home', rowId: variantId })],
      worlds: ['home', 'new-world'],
    });
    expect(reloads.sort((a, b) => a.instanceCode.localeCompare(b.instanceCode))).toEqual([
      { instanceCode: 'home', mode: 'full' },
      { instanceCode: 'new-world', mode: 'full' },
    ]);
  });

  it('stops a commit when a drafted instance moved after the review, and changes nothing', async () => {
    const second = await createPopulation({
      models: all(),
      request: { mapCode: 'glade', seed: { mode: 'fixed', value: 2 } },
      actor: MODERATOR,
    });
    const id = second._id;
    await authorTarget({
      models: all(),
      id,
      itemId: 'moss',
      body: { data: definitionOf('moss', 'floor'), objectLayerRenderFramesData: toWire(tile) },
      actor: MODERATOR,
      options: host,
    });
    await draftInstance(id, 'other', { description: 'proposed' });
    const { revision } = await all().CyberiaProceduralPopulation.findById(id, { revision: 1 }).lean();
    await requestPublication({ models: all(), id, actor: MODERATOR, revision });
    // Another editor saves the instance while the artwork publishes: after the preflight, before the commit.
    const publish = async (params) => {
      await all().CyberiaInstance.updateOne({ code: 'other' }, { $set: { revision: 5 } });
      return await publishRevision(params);
    };
    const claimed = await claimPublication({ models: all(), holder: 'worker-b' });
    await advancePublication({ models: all(), population: claimed, holder: 'worker-b', options: host, publish });
    expect((await getPopulation(all(), id)).publication).toMatchObject({
      status: 'runtime_commit_failed',
      error: { message: 'Instance other moved after the preflight', retryable: false },
    });
    expect(await instanceOf('other')).toMatchObject({ revision: 5, description: '' });
    expect(await rejection(draftInstance(id, 'other', { description: 'again' }))).toMatchObject({ status: 409 });
  });
});
