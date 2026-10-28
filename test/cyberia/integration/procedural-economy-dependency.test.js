// Requires mongod (UNDERPOST_MONGOD_BIN). The content partition serves a release database, as production
// does after a promotion: the workspace database it declares holds no economy.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataBaseProviderService } from '../../../src/db/DataBaseProvider.js';
import { CONTENT_PARTITION } from '../../../src/projects/cyberia/content/content-release.js';
import { compileEconomySnapshot } from '../../../src/projects/cyberia/economy/economy-policy.js';
import { populationModels } from '../../../src/projects/cyberia/procedural/population/map-context.js';
import {
  createPopulation,
  getPopulation,
  updateTarget,
} from '../../../src/projects/cyberia/procedural/population/population.js';
import {
  advancePublication,
  claimPublication,
  requestPublication,
  validatePublication,
} from '../../../src/projects/cyberia/procedural/population/publication.js';
import {
  graphProblems,
  instanceDraftView,
  populationGraph,
  saveInstanceDraft,
} from '../../../src/projects/cyberia/procedural/population/working-graph.js';
import { mongodBinary } from '../../support/mongod.js';
import { sourceFromDirectionFrames } from '../../../src/client/components/objectlayer-studio/RenderSource.js';
import { MODERATOR, host, publishItem, rejection, startEngine, stopEngine } from '../../support/procedural-engine.js';

const WORKSPACE = 'cyberia-procedural-workspace';
const RELEASE = 'cyberia-procedural-release';
const WORLD = 'amethyst-strata-expansion';
const CONTENT_APIS = [
  'cyberia-map',
  'cyberia-instance',
  'cyberia-instance-conf',
  'cyberia-entity-type-default',
  'cyberia-economy',
  'cyberia-economic-item-policy',
];
const GRID = { gridX: 8, gridY: 8, cellWidth: 16, cellHeight: 16 };

const all = () => populationModels(host);
const model = (name) => DataBaseProviderService.getModel(name, host);
const runtime = () => ({
  CyberiaEconomy: model('CyberiaEconomy'),
  CyberiaEconomicItemPolicy: model('CyberiaEconomicItemPolicy'),
  CyberiaItemCatalog: all().CyberiaItemCatalog,
});
const problemsOf = async (id) => await graphProblems(all(), await populationGraph(all(), id, host), host);
const draftWorld = async (id, change) => {
  const view = instanceDraftView(await populationGraph(all(), id, host), WORLD);
  return await saveInstanceDraft({
    models: all(),
    id,
    code: WORLD,
    body: {
      document: { ...view.document, ...change.document },
      conf: { ...view.conf, ...change.conf },
      baseRevision: view.revision,
      revision: view.draftRevision ?? 0,
    },
    actor: MODERATOR,
    options: host,
  });
};

describe.skipIf(!mongodBinary)('the economy a staged world names', () => {
  let population;

  beforeAll(async () => {
    await startEngine({
      maps: {},
      entities: [],
      partitions: { [CONTENT_PARTITION]: { name: WORKSPACE, apis: CONTENT_APIS } },
    });
    await DataBaseProviderService.serveDatabase(host, CONTENT_PARTITION, RELEASE);
    await publishItem('moss', {
      type: 'floor',
      renderSource: sourceFromDirectionFrames({
        framesByCode: { '08': [Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => [40, 120, 70, 255]))] },
        frameDurationMs: 250,
      }),
    });
    const { CyberiaMap, CyberiaInstance, CyberiaInstanceConf } = all();
    await CyberiaMap.create([
      {
        code: 'strata',
        name: 'Strata',
        ...GRID,
        entities: [{ entityType: 'floor', objectLayerItemIds: ['moss'], initCellX: 0, initCellY: 0, dimX: 1, dimY: 1 }],
      },
      { code: 'verdant', name: 'Verdant', ...GRID, worldX: 200, worldY: 0 },
    ]);
    await CyberiaInstance.create([
      { code: WORLD, name: 'Amethyst Strata Expansion', cyberiaMapCodes: ['strata'] },
      { code: 'verdant-world', name: 'Verdant World', cyberiaMapCodes: ['verdant'] },
    ]);
    await CyberiaInstanceConf.create([
      { instanceCode: WORLD, economyCode: 'standard' },
      { instanceCode: 'verdant-world', economyCode: 'standard' },
    ]);
    await model('CyberiaEconomy').create([
      { code: 'standard', name: 'Standard' },
      { code: 'premium', name: 'Premium' },
      { code: 'museum', name: 'Museum', status: 'retired' },
    ]);
    await DataBaseProviderService.getModel('CyberiaUniverse', host).create({
      code: 'cyberia',
      name: 'Cyberia',
      instances: [
        { instanceCode: WORLD, x: 0, y: 0 },
        { instanceCode: 'verdant-world', x: 1, y: 0 },
      ],
    });
    population = await createPopulation({
      models: all(),
      request: { mapCode: 'strata', seed: { mode: 'fixed', value: 1 } },
      actor: MODERATOR,
    });
  }, 120000);

  afterAll(async () => {
    await stopEngine();
  });

  it('reads the economies of the served release, not of the workspace the partition declares', async () => {
    const workspace = DataBaseProviderService.getProvider(host).models.CyberiaEconomy;
    expect(workspace.db.name).toBe(WORKSPACE);
    expect(await workspace.countDocuments()).toBe(0);
    expect(model('CyberiaEconomy').db.name).toBe(RELEASE);
    expect(await all().CyberiaInstanceConf.findOne({ instanceCode: WORLD }).lean()).toMatchObject({
      economyCode: 'standard',
    });
  });

  it('keeps the economy of a staged world and resolves it as the runtime does', async () => {
    const id = population._id;
    const staged = await draftWorld(id, { document: { name: 'Amethyst staged' }, conf: {} });
    expect(staged.conf.economyCode).toBe('standard');
    expect(await problemsOf(id)).toEqual({ errors: [], warnings: [] });
    expect(await compileEconomySnapshot(runtime(), staged.conf.economyCode)).toMatchObject({ code: 'standard' });
  });

  it('resolves a staged economy change from the draft, and refuses an economy the release does not hold or retired', async () => {
    const id = population._id;
    await draftWorld(id, { conf: { economyCode: 'premium' } });
    expect((await problemsOf(id)).errors).toEqual([]);
    await draftWorld(id, { conf: { economyCode: 'ghost' } });
    expect((await problemsOf(id)).errors).toEqual([
      `Instance ${WORLD}: its draft conf names economy ghost, which content database ${RELEASE} does not hold`,
      `Universe cyberia: world ${WORLD} names economy ghost in its draft conf, which content database ${RELEASE} does not hold`,
    ]);
    await draftWorld(id, { conf: { economyCode: 'museum' } });
    expect((await problemsOf(id)).errors).toContain(
      `Instance ${WORLD}: its draft conf names economy museum, which content database ${RELEASE} holds retired`,
    );
    expect(await rejection(draftWorld(id, { conf: { economyCode: { code: 'standard' } } }))).toMatchObject({
      status: 400,
      message: expect.stringContaining('economyCode'),
    });
    await draftWorld(id, { conf: { economyCode: 'standard' } });
    expect(await problemsOf(id)).toEqual({ errors: [], warnings: [] });
  });

  it('publishes the staged world with its economy, and creates no economy on the way', async () => {
    const id = population._id;
    for (const { itemId } of (await getPopulation(all(), id)).targets)
      await updateTarget({ models: all(), id, itemId, body: { resolution: 'keep' }, actor: MODERATOR });
    const review = await validatePublication({ models: all(), id, options: host });
    expect(review).toMatchObject({ ready: true, problems: [] });
    const { revision } = await all().CyberiaProceduralPopulation.findById(id, { revision: 1 }).lean();
    await requestPublication({ models: all(), id, actor: MODERATOR, revision });
    for (let step = 0; step < 6; step++) {
      const claimed = await claimPublication({ models: all(), holder: 'worker' });
      if (!claimed) break;
      await advancePublication({
        models: all(),
        population: claimed,
        holder: 'worker',
        options: host,
        refresh: async () => ({ cache: true, media: null, previews: 'refreshed', servers: [] }),
      });
    }
    const { publication } = await getPopulation(all(), id);
    expect(publication.status, JSON.stringify(publication.error)).toBe('completed');
    expect(await all().CyberiaInstance.findOne({ code: WORLD }).lean()).toMatchObject({ name: 'Amethyst staged' });
    expect(await all().CyberiaInstanceConf.findOne({ instanceCode: WORLD }).lean()).toMatchObject({
      economyCode: 'standard',
    });
    expect(await model('CyberiaEconomy').countDocuments()).toBe(3);
    expect(await DataBaseProviderService.getProvider(host).models.CyberiaEconomy.countDocuments()).toBe(0);
  });
});
