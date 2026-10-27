import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Types } from 'mongoose';
import { DataQuery } from '../../../src/server/storage/data-query.js';
import { CyberiaProceduralJobService } from '../../../src/api/cyberia-procedural-job/cyberia-procedural-job.service.js';
import {
  listMapSummaries,
  populationModels,
  resolveMapContext,
} from '../../../src/projects/cyberia/procedural/population/map-context.js';
import {
  addTarget,
  applyPalette,
  cancelPopulation,
  createPopulation,
  deletePopulation,
  forgetRemoved,
  getDraft,
  getPopulation,
  listPopulations,
  previewPalette,
  rebaseDraft,
  removeTarget,
  runsOf,
  saveDraft,
  updateTarget,
} from '../../../src/projects/cyberia/procedural/population/population.js';
import {
  RESULT_LIMIT,
  authorTarget,
  deleteResults,
  generateTarget,
  resetTarget,
  retryEntry,
  selectEntry,
  targetDefinitions,
  targetResults,
} from '../../../src/projects/cyberia/procedural/population/results.js';
import {
  addDefault,
  populationDefaults,
  removeDefault,
} from '../../../src/projects/cyberia/procedural/population/defaults.js';
import {
  advancePublication,
  cancelPublication,
  claimPublication,
  refreshPublication,
  requestPublication,
  retryPublication,
  validatePublication,
} from '../../../src/projects/cyberia/procedural/population/publication.js';
import { migratePopulations } from '../../../src/projects/cyberia/procedural/population/migration.js';
import { POPULATION_VERSION } from '../../../src/api/cyberia-procedural-population/cyberia-procedural-population.model.js';
import { STAGES } from '../../../src/projects/cyberia/procedural/population/stages.js';
import { ITEM_TYPES } from '../../../src/client/components/cyberia/SharedDefaultsCyberia.js';
import { paletteCatalog } from '../../../src/projects/cyberia/procedural/palettes/catalog.js';
import { DataBaseProviderService } from '../../../src/db/DataBaseProvider.js';
import { CyberiaMapService } from '../../../src/api/cyberia-map/cyberia-map.service.js';
import { CyberiaItemCatalogService } from '../../../src/api/cyberia-item-catalog/cyberia-item-catalog.service.js';
import { CyberiaEntityTypeDefaultService } from '../../../src/api/cyberia-entity-type-default/cyberia-entity-type-default.service.js';
import { publishRevision } from '../../../src/projects/cyberia/procedural/jobs/promotion.js';
import { rejectItem, saveRevision } from '../../../src/projects/cyberia/procedural/jobs/review.js';
import { claimNextItem, runItem } from '../../../src/projects/cyberia/procedural/jobs/worker.js';
import { sourceFromDirectionFrames, toWire } from '../../../src/client/components/objectlayer-studio/RenderSource.js';
import { ObjectLayerEngine } from '../../../src/projects/cyberia/object-layer/object-layer.js';
import { catalogModels } from '../../../src/projects/cyberia/catalog/object-layer-catalog.js';
import { mongodBinary } from '../../support/mongod.js';
import { ASH_WASTES, VIOLET_STRATA } from '../../support/procedural-content.js';
import {
  boundCid,
  cids,
  definitionOf,
  drain,
  edited,
  host,
  itemsOf,
  models,
  MODERATOR,
  publishItem,
  rebind,
  rejection,
  startEngine,
  stopEngine,
} from '../../support/procedural-engine.js';

const GRID = { gridX: 32, gridY: 32, cellWidth: 16, cellHeight: 16 };

const WORLD = {
  maps: {
    'violet-hollow': {
      biome: VIOLET_STRATA.id,
      composition: [
        { entity: 'floor.violet-moss', count: 4 },
        { entity: 'character.violet-warden', count: 2 },
      ],
    },
    'violet-array': { biome: VIOLET_STRATA.id },
    'violet-annex': { biome: VIOLET_STRATA.id },
    'ash-plain': { biome: ASH_WASTES.id },
  },
  entities: [
    { id: 'floor.violet-moss', entityType: 'floor', objectLayerItemIds: ['violet-moss'], itemType: 'floor' },
    { id: 'character.violet-warden', entityType: 'bot', objectLayerItemIds: ['violet-skin', 'iron-sword'] },
  ],
  baseline: [
    {
      entityType: 'player',
      liveItemIds: ['hero-skin'],
      deadItemIds: [],
      dropItemIds: [],
      inventoryItemsIds: [],
      overrideItemsIdsState: [],
      behavior: '',
    },
    {
      entityType: 'bot',
      liveItemIds: ['base-skin'],
      deadItemIds: [],
      dropItemIds: [],
      inventoryItemsIds: [],
      overrideItemsIdsState: [],
      behavior: '',
    },
  ],
};
const square = (size) =>
  sourceFromDirectionFrames({
    framesByCode: Object.fromEntries(
      ['08', '06'].map((code) => [
        code,
        [Array.from({ length: size }, () => Array.from({ length: size }, () => [90, 40, 120, 255]))],
      ]),
    ),
    frameDurationMs: 250,
  });
const placed = (entityType, objectLayerItemIds, count = 1, at = 0) =>
  Array.from({ length: count }, (_, index) => ({
    entityType,
    objectLayerItemIds,
    initCellX: at + index,
    initCellY: at + index,
    dimX: 1,
    dimY: 1,
    color: 'rgba(10, 20, 30, 1)',
  }));

const all = () => populationModels(host);
const paletteIds = () => new Set(paletteCatalog().palettes.map(({ id }) => id));
const create = (mapCode, seed = { mode: 'auto' }) =>
  createPopulation({ models: all(), request: { mapCode, seed }, actor: MODERATOR });
const view = (id) => getPopulation(all(), id);
const targetOf = (population, itemId) => population.targets.find((target) => target.itemId === itemId);
const generate = (id, itemId, count = 1) => generateTarget({ models: all(), id, itemId, count, actor: MODERATOR });
const change = (id, itemId, body) => updateTarget({ models: all(), id, itemId, body, actor: MODERATOR });
const keep = (id, itemId) => change(id, itemId, { resolution: 'keep' });
const save = (id, body) => saveDraft({ models: all(), id, body: { grid: GRID, ...body }, actor: MODERATOR });
const resultsOf = async (id, itemId) => (await targetResults(all(), id, itemId)).results;
/** The generated results of an item, newest first. */
const entriesOf = async (id, itemId) => (await resultsOf(id, itemId)).filter(({ jobId }) => jobId);
/** The run ids of an item, oldest first. */
const runIds = async (id, itemId) => (await runsOf(all(), id, itemId)).map(({ _id }) => String(_id)).reverse();
const remove = (id, itemId, ids) =>
  deleteResults({ models: all(), id, itemId, body: { ids }, actor: MODERATOR, options: host });
const reset = (id, itemId) => resetTarget({ models: all(), id, itemId, actor: MODERATOR, options: host });
const select = async (id, itemId, entry) => {
  const chosen = entry ?? (await entriesOf(id, itemId)).find(({ state }) => state === 'ready');
  return await selectEntry({
    models: all(),
    id,
    itemId,
    body: { entryId: chosen.entryId, cid: chosen.cid },
    actor: MODERATOR,
  });
};
const actionOf = (result, id) => result.actions.find((entry) => entry.id === id);
/** Generates one entry of every item that generates, and selects it. */
const decideAll = async (id) => {
  const generating = (await view(id)).targets.filter(
    ({ state }) => state === 'new' || state === 'failed' || state === 'choose',
  );
  for (const { itemId, state } of generating) if (state !== 'choose') await generate(id, itemId);
  await drain();
  for (const { itemId } of generating) await select(id, itemId);
  return await view(id);
};
/** A population of violet-array that publishes new violet-moss and ghost-floor artwork, whatever an earlier test bound. */
const twoAssets = async () => {
  const population = await create('violet-array');
  await keep(population._id, 'violet-stone');
  await change(population._id, 'violet-moss', { resolution: 'render' });
  await change(population._id, 'ghost-floor', { resolution: 'template' });
  await removeTarget({ models: all(), id: population._id, itemId: 'atlas_pistol_mk2', actor: MODERATOR });
  await decideAll(population._id);
  return population;
};
const quiet = async () => ({ cache: true, previews: 'refreshed', servers: [] });
/** Runs the publication that waits, as a worker does. */
const work = async (effects = {}, holder = 'worker-a') => {
  const population = await claimPublication({ models: all(), holder });
  return population
    ? await advancePublication({ models: all(), population, holder, options: host, refresh: quiet, ...effects })
    : null;
};
/** Why a publication stopped, for the message of an assertion. */
const reasonOf = async (id) => JSON.stringify((await view(id)).publication?.error ?? null);
const publish = async (id, acknowledged = []) =>
  await requestPublication({
    models: all(),
    id,
    actor: MODERATOR,
    acknowledged,
    revision: (await all().CyberiaProceduralPopulation.findById(id, { revision: 1 }).lean()).revision,
  });
const mapOf = (code) => all().CyberiaMap.findOne({ code }).lean();

describe.skipIf(!mongodBinary)('map population on a real MongoDB', () => {
  let wardenRow;
  let globalRow;

  beforeAll(async () => {
    await startEngine(WORLD);
    Object.assign(cids, {
      'violet-moss': await publishItem('violet-moss', { type: 'floor', renderSource: square(25) }),
      'violet-stone': await publishItem('violet-stone', { render: false, type: 'floor' }),
      'hero-skin': await publishItem('hero-skin'),
      'small-skin': await publishItem('small-skin', { renderSource: square(24) }),
    });
    const { CyberiaMap, CyberiaInstance, CyberiaInstanceConf, CyberiaEntityTypeDefault } = all();
    await CyberiaMap.create([
      { code: 'violet-hollow', name: 'Violet Hollow', description: 'A hollow.', tags: ['content'], gridX: 8, gridY: 8 },
      {
        code: 'violet-array',
        name: 'Violet Array',
        ...GRID,
        entities: [
          ...placed('floor', ['violet-moss'], 5),
          ...placed('static', ['atlas_pistol_mk2'], 1, 16),
          ...placed('floor', ['violet-stone'], 2, 6),
          ...placed('floor', ['ghost-floor'], 1, 9),
          ...placed('bot', ['base-skin', 'iron-sword'], 3, 10),
          ...placed('bot', ['small-skin'], 1, 14),
          ...placed('player', ['aether-agent'], 1, 15),
        ],
      },
      { code: 'violet-annex', name: 'Violet Annex', ...GRID, entities: placed('floor', ['violet-stone']) },
      { code: 'ash-plain', name: 'Ash Plain', ...GRID, entities: placed('floor', ['violet-moss']) },
      { code: 'blank-room', name: 'Blank Room', ...GRID },
    ]);
    wardenRow = await CyberiaEntityTypeDefault.create({
      entityType: 'bot',
      liveItemIds: ['violet-skin'],
      dropItemIds: ['iron-sword'],
      behavior: 'passive',
    });
    globalRow = await CyberiaEntityTypeDefault.create({
      entityType: 'bot',
      liveItemIds: ['small-skin'],
      behavior: 'hostile',
    });
    await CyberiaInstance.create([
      { code: 'violet-world', name: 'Violet World', cyberiaMapCodes: ['violet-hollow', 'violet-annex'] },
      { code: 'array-world', name: 'Array World', cyberiaMapCodes: ['violet-array'] },
    ]);
    await CyberiaInstanceConf.create([
      { instanceCode: 'violet-world', entityDefaults: [wardenRow._id] },
      { instanceCode: 'array-world', entityDefaults: [] },
    ]);
  }, 120000);
  afterAll(stopEngine);

  describe('the map context', () => {
    it('lists every map, an empty one too, with its instances, biome and composition', async () => {
      const { data, total } = await listMapSummaries(all(), DataQuery.parse({ limit: 10 }));
      expect(total).toBe(5);
      expect(data.find(({ code }) => code === 'violet-hollow')).toMatchObject({
        entityCount: 0,
        biome: 'Violet Strata',
        composition: 2,
        instances: ['Violet World'],
      });
    });

    it('reads the targets of an empty map from its foundation composition', async () => {
      const { targets, findings } = await resolveMapContext(all(), 'violet-hollow');
      expect(
        targets.map(({ itemId, stage, sources, expected, resolution }) => ({
          itemId,
          stage,
          sources,
          expected,
          resolution,
        })),
      ).toEqual([
        {
          itemId: 'iron-sword',
          stage: 'other',
          sources: ['foundation'],
          expected: 2,
          resolution: 'keep',
        },
        {
          itemId: 'violet-moss',
          stage: 'floor',
          sources: ['foundation'],
          expected: 4,
          resolution: 'keep',
        },
        {
          itemId: 'violet-skin',
          stage: 'npc-skin',
          sources: ['foundation'],
          expected: 2,
          resolution: 'keep',
        },
      ]);
      expect(findings.map(({ message }) => message)).toContain(
        'No placed entities yet: prepare the visual assets, then compose the map',
      );
    });

    it('keeps valid artwork, rebuilds a renderless floor from its template and builds an unbound placed floor', async () => {
      const { targets } = await resolveMapContext(all(), 'violet-array');
      expect(targetOf({ targets }, 'violet-stone')).toMatchObject({ resolution: 'template', observed: null });
      expect(targetOf({ targets }, 'ghost-floor')).toMatchObject({
        stage: 'floor',
        cid: null,
        resolution: 'template',
        templateId: 'floor.terrain',
      });
      expect(targetOf({ targets }, 'small-skin')).toMatchObject({
        resolution: 'keep',
        observed: { cid: cids['small-skin'], bindingRevision: 1 },
      });
      expect(targetOf({ targets }, 'aether-agent')).toBeUndefined();
      expect(targetOf({ targets }, 'iron-sword')).toMatchObject({
        stage: 'other',
        itemType: 'weapon',
        resolution: 'keep',
        templateId: '',
      });
      for (const target of targets) expect(target).not.toHaveProperty('strategies');
    });

    it('takes any item id the map places, and holds a new item id to lowercase words joined by hyphens', async () => {
      const { targets, findings } = await resolveMapContext(all(), 'violet-array');
      expect(targetOf({ targets }, 'atlas_pistol_mk2')).toMatchObject({
        stage: 'other',
        itemType: 'static',
        cid: null,
        resolution: 'author',
      });
      expect(findings.map(({ message }) => message)).toContain(
        'No generator draws static items: author atlas_pistol_mk2 by hand',
      );
      const population = await create('blank-room');
      expect(
        await rejection(addTarget({ models: all(), id: population._id, body: { itemId: 'new_moss', stage: 'floor' } })),
      ).toMatchObject({ status: 400, message: 'The new item id new_moss is not lowercase words joined by hyphens' });
      await deletePopulation({ models: all(), id: population._id, options: host });
    });
  });

  describe('the targets of a population', () => {
    it('gives each item its own palette and variation; each run runs the configuration it had', async () => {
      const population = await create('violet-array');
      expect(await rejection(generate(population._id, 'violet-moss'))).toMatchObject({ status: 400 });
      await change(population._id, 'violet-moss', {
        resolution: 'render',
        palette: { paletteId: 'dark-basalt', slots: { 'patch.base': '#123456' } },
        variation: 0.3,
      });
      await change(population._id, 'violet-stone', { palette: { slots: { 'ground.base': '#654321' } } });
      await generate(population._id, 'violet-moss');
      await generate(population._id, 'violet-stone');
      const specOf = async (itemId, run) =>
        (
          await models()
            .CyberiaProceduralJob.findById((await runIds(population._id, itemId))[run])
            .lean()
        ).spec;
      const [moss, stone] = [await specOf('violet-moss', 0), await specOf('violet-stone', 0)];
      expect(moss.palette.items).toEqual([
        { itemId: 'violet-moss', paletteId: 'dark-basalt', slots: { 'patch.base': '#123456' } },
      ]);
      expect(moss.palettes.map(({ id }) => id)).toEqual(['dark-basalt']);
      expect(moss.variation.level).toBe(0.3);
      expect(stone.palette.items).toEqual([{ itemId: 'violet-stone', slots: { 'ground.base': '#654321' } }]);
      expect(stone.sources[0]).toMatchObject({
        itemId: 'violet-stone',
        origin: 'template',
        templateId: 'floor.terrain',
      });
      expect(moss.seed.value).not.toBe(stone.seed.value);
      const changed = await change(population._id, 'violet-moss', { variation: 0.9 });
      expect(targetOf(changed, 'violet-moss')).toMatchObject({ variation: 0.9, state: 'generating' });
      await generate(population._id, 'violet-moss', 2);
      const runs = await runIds(population._id, 'violet-moss');
      expect(runs).toHaveLength(3);
      expect((await view(population._id)).nextRun).toBe(4);
      const later = await specOf('violet-moss', 1);
      expect(later.variation.level).toBe(0.9);
      expect(later.seed.value).not.toBe(moss.seed.value);
      expect((await specOf('violet-moss', 2)).seed.value).not.toBe(later.seed.value);
      expect(await rejection(generate(population._id, 'violet-moss', 5))).toMatchObject({ status: 400 });
      await deletePopulation({ models: all(), id: population._id, options: host });
      expect(await models().CyberiaProceduralJob.countDocuments({ _id: { $in: runs } })).toBe(0);
    });

    it('removes a target of any source from the population, keeps its runs, and adds it back; no item, binding or placement changes', async () => {
      const population = await create('violet-array');
      const before = await mapOf('violet-array');
      const catalog = await models().CyberiaItemCatalog.find({}, { itemId: 1, objectLayerCid: 1, history: 1 }).lean();
      const added = await addTarget({ models: all(), id: population._id, body: { itemId: 'hero-skin' } });
      expect(targetOf(added, 'hero-skin')).toMatchObject({ sources: ['manual'], stage: 'npc-skin', state: 'kept' });
      const again = await addTarget({ models: all(), id: population._id, body: { itemId: 'hero-skin' } });
      expect(again.targets.filter(({ itemId }) => itemId === 'hero-skin')).toHaveLength(1);
      expect(
        await rejection(addTarget({ models: all(), id: population._id, body: { itemId: 'new-moss' } })),
      ).toMatchObject({
        status: 400,
        message: 'Name the stage of the new item new-moss',
      });
      expect(
        await rejection(
          addTarget({ models: all(), id: population._id, body: { itemId: 'old-relic', stage: 'other' } }),
        ),
      ).toMatchObject({ status: 400, message: 'Name the item type of the new item old-relic' });
      expect(
        await rejection(
          addTarget({
            models: all(),
            id: population._id,
            body: { itemId: 'old-relic', stage: 'other', itemType: 'relic' },
          }),
        ),
      ).toMatchObject({ status: 400, message: 'relic is not a Cyberia item type' });
      expect(
        await rejection(
          addTarget({
            models: all(),
            id: population._id,
            body: { itemId: 'old-relic', stage: 'floor', itemType: 'static' },
          }),
        ),
      ).toMatchObject({ status: 400, message: 'old-relic is a static item: stage floor takes floor items' });
      const relic = await addTarget({
        models: all(),
        id: population._id,
        body: { itemId: 'old-relic', stage: 'other', itemType: 'static' },
      });
      expect(targetOf(relic, 'old-relic')).toMatchObject({
        stage: 'other',
        itemType: 'static',
        resolution: 'author',
        state: 'author',
        artwork: { cid: '', source: 'missing' },
        resolutions: [
          { id: 'keep', available: false, reason: 'The item runs no definition: there is no artwork to keep' },
          { id: 'author', available: true, reason: '' },
        ],
      });
      const fresh = await addTarget({
        models: all(),
        id: population._id,
        body: { itemId: 'new-moss', stage: 'floor' },
      });
      expect(targetOf(fresh, 'new-moss')).toMatchObject({
        resolution: 'template',
        cid: null,
        templateId: 'floor.terrain',
        templates: ['floor.terrain'],
      });

      await generate(population._id, 'new-moss');
      await generate(population._id, 'new-moss');
      const runs = await runIds(population._id, 'new-moss');
      expect(runs).toHaveLength(2);
      const removed = await removeTarget({ models: all(), id: population._id, itemId: 'new-moss', actor: MODERATOR });
      expect(targetOf(removed, 'new-moss')).toBeUndefined();
      expect(removed.removed.map(({ target, by }) => [target.itemId, by])).toEqual([['new-moss', MODERATOR]]);
      const jobs = await models()
        .CyberiaProceduralJob.find({ _id: { $in: runs } }, { status: 1 })
        .lean();
      expect(jobs.map(({ status }) => status)).toEqual(['cancelled', 'cancelled']);
      expect(
        await models().CyberiaProceduralAudit.countDocuments({ jobId: { $in: runs }, action: 'job.cancelled' }),
      ).toBe(2);

      const placedOut = await removeTarget({
        models: all(),
        id: population._id,
        itemId: 'small-skin',
        reason: 'It stays as it is',
        actor: MODERATOR,
      });
      expect(targetOf(placedOut, 'small-skin')).toBeUndefined();
      expect(placedOut.removed.find(({ target }) => target.itemId === 'small-skin')).toMatchObject({
        by: MODERATOR,
        reason: 'It stays as it is',
        target: { sources: ['placement'] },
      });
      expect(await boundCid('small-skin')).toBe(cids['small-skin']);
      const restored = await addTarget({ models: all(), id: population._id, body: { itemId: 'small-skin' } });
      expect(targetOf(restored, 'small-skin')).toMatchObject({ state: 'kept', sources: ['placement'] });
      const back = await addTarget({ models: all(), id: population._id, body: { itemId: 'new-moss' } });
      expect(await runIds(population._id, 'new-moss')).toEqual(runs);
      expect(back.nextRun).toBe(2);
      expect(back.removed).toEqual([]);
      expect((await mapOf('violet-array')).entities).toEqual(before.entities);
      expect(await models().CyberiaItemCatalog.find({}, { itemId: 1, objectLayerCid: 1, history: 1 }).lean()).toEqual(
        catalog,
      );
      await deletePopulation({ models: all(), id: population._id, options: host });
    });

    it('forgets a removed target permanently: only its entry in the removed list goes, and a later add shows its results again', async () => {
      const population = await create('violet-array');
      const other = await create('violet-hollow');
      await change(population._id, 'violet-moss', { resolution: 'render' });
      await generate(population._id, 'violet-moss');
      await drain();
      const runs = await runIds(population._id, 'violet-moss');
      await removeTarget({
        models: all(),
        id: population._id,
        itemId: 'violet-moss',
        reason: 'Not here',
        actor: MODERATOR,
      });
      await removeTarget({ models: all(), id: population._id, itemId: 'small-skin', actor: MODERATOR });
      await removeTarget({ models: all(), id: other._id, itemId: 'violet-moss', actor: MODERATOR });
      const snapshot = async () => ({
        catalog: await all().CyberiaItemCatalog.find({}).lean(),
        definitions: await all().ObjectLayer.find({}, { cid: 1, origin: 1 }).sort({ cid: 1 }).lean(),
        entities: (await mapOf('violet-array')).entities,
        defaults: await all().CyberiaEntityTypeDefault.find({}).lean(),
        jobs: await all().CyberiaProceduralJob.find({}).lean(),
        items: await all().CyberiaProceduralJobItem.find({}).lean(),
        audit: await all().CyberiaProceduralAudit.find({}).lean(),
      });
      const before = await snapshot();
      const stored = await view(population._id);
      const forgotten = await forgetRemoved({ models: all(), id: population._id, itemId: 'violet-moss' });
      expect(forgotten.removed).toEqual(stored.removed.filter(({ target }) => target.itemId !== 'violet-moss'));
      expect(forgotten.targets.map(({ itemId }) => itemId)).toEqual(stored.targets.map(({ itemId }) => itemId));
      expect(forgotten.revision).toBe(stored.revision + 1);
      const again = await forgetRemoved({ models: all(), id: population._id, itemId: 'violet-moss' });
      expect(again.revision).toBe(stored.revision + 1);
      expect(await snapshot()).toEqual(before);
      expect((await view(other._id)).removed.map(({ target }) => target.itemId)).toEqual(['violet-moss']);
      const added = await addTarget({ models: all(), id: population._id, body: { itemId: 'violet-moss' } });
      expect(targetOf(added, 'violet-moss')).toMatchObject({ sources: ['manual'], drafts: [] });
      expect(runs).toHaveLength(1);
      expect((await entriesOf(population._id, 'violet-moss')).map(({ id }) => id)).toEqual(runs);
      await deletePopulation({ models: all(), id: population._id, options: host });
      await deletePopulation({ models: all(), id: other._id, options: host });
    });

    it('keeps the current artwork at its binding, shows a rebind as a conflict, keeps again, and resets', async () => {
      const population = await create('violet-array');
      await change(population._id, 'small-skin', {
        resolution: 'template',
        palette: { slots: { 'hair.base': '#101010' } },
      });
      const binding = await models().CyberiaItemCatalog.bindingsOf(['small-skin']);
      const kept = await keep(population._id, 'small-skin');
      expect(targetOf(kept, 'small-skin')).toMatchObject({
        state: 'kept',
        resolution: 'keep',
        observed: { cid: cids['small-skin'], bindingRevision: binding.get('small-skin').revision },
      });
      const other = await publishItem('small-twin', { renderSource: square(24) });
      await rebind('small-skin', other);
      expect(targetOf(await view(population._id), 'small-skin').state).toBe('conflict');
      expect((await validatePublication({ models: all(), id: population._id })).problems).toContain(
        'The binding of small-skin moved since it was kept: keep it again or choose new artwork',
      );
      const again = await keep(population._id, 'small-skin');
      expect(targetOf(again, 'small-skin')).toMatchObject({
        state: 'kept',
        cid: other,
        observed: { cid: other, bindingRevision: binding.get('small-skin').revision + 1 },
      });
      await rebind('small-skin', cids['small-skin']);
      const clean = await reset(population._id, 'small-skin');
      expect(targetOf(clean, 'small-skin')).toMatchObject({
        resolution: 'keep',
        state: 'kept',
        observed: { cid: cids['small-skin'] },
        palette: { slots: {} },
      });
      expect(await rejection(keep(population._id, 'ghost-floor'))).toMatchObject({
        status: 400,
        message: 'ghost-floor cannot take keep: The item runs no definition: there is no artwork to keep',
      });
      expect(await rejection(change(population._id, 'ghost-floor', { resolution: 'render' }))).toMatchObject({
        status: 400,
        message: 'ghost-floor cannot take render: There is no current artwork to generate from',
      });
      expect(await rejection(change(population._id, 'small-skin', { resolution: 'definition' }))).toMatchObject({
        status: 400,
        message: 'definition is not a resolution: keep, render, template, author',
      });
      await deletePopulation({ models: all(), id: population._id, options: host });
    });

    it('applies one palette to several items exactly as its preview shows, and keeps each item its own', async () => {
      const population = await create('violet-hollow');
      await change(population._id, 'violet-moss', { resolution: 'render' });
      await change(population._id, 'violet-skin', {
        resolution: 'render',
        palette: { slots: { 'hair.base': '#0a0a0a' } },
      });
      const body = { itemIds: ['violet-skin', 'violet-moss'], source: 'biome', overrides: 'keep' };
      const preview = await previewPalette({ models: all(), id: population._id, body });
      expect(preview.changes.map(({ itemId }) => itemId)).toEqual(['violet-moss', 'violet-skin']);
      expect(targetOf(await view(population._id), 'violet-moss').palette).toEqual({ slots: {} });
      const applied = await applyPalette({ models: all(), id: population._id, body });
      for (const { itemId, after } of preview.changes) expect(targetOf(applied, itemId).palette).toEqual(after);
      expect(targetOf(applied, 'violet-skin').palette.slots['hair.base']).toBe('#0a0a0a');
      const templated = await applyPalette({
        models: all(),
        id: population._id,
        body: { itemIds: ['violet-skin'], source: 'palette', paletteId: 'exotic-teal', overrides: 'replace' },
      });
      expect(targetOf(templated, 'violet-skin').palette).toEqual({ paletteId: 'exotic-teal', slots: {} });
      expect(targetOf(templated, 'violet-moss').palette).toEqual(targetOf(applied, 'violet-moss').palette);
      const floor = await applyPalette({
        models: all(),
        id: population._id,
        body: { itemIds: ['violet-moss'], source: 'palette', paletteId: 'exotic-teal', overrides: 'keep' },
      });
      expect(targetOf(floor, 'violet-moss').palette).toEqual({
        paletteId: 'exotic-teal',
        slots: targetOf(applied, 'violet-moss').palette.slots,
      });
      expect(
        await rejection(
          applyPalette({
            models: all(),
            id: population._id,
            body: { itemIds: ['violet-moss'], source: 'palette', paletteId: 'skin.exotic-teal', overrides: 'keep' },
          }),
        ),
      ).toMatchObject({ status: 400, message: 'A palette source names the paletteId of a palette of the library' });
      await deletePopulation({ models: all(), id: population._id, options: host });
    });

    it('authors an item no generator draws by hand: a draft definition it uses, published and bound with the map', async () => {
      const population = await create('blank-room');
      await addTarget({
        models: all(),
        id: population._id,
        body: { itemId: 'old-relic', stage: 'other', itemType: 'static' },
      });
      const author = (data, frames = toWire(square(12))) =>
        authorTarget({
          models: all(),
          id: population._id,
          itemId: 'old-relic',
          body: { data, objectLayerRenderFramesData: frames },
          actor: MODERATOR,
          options: host,
        });
      expect(await rejection(author(definitionOf('new-relic', 'static')))).toMatchObject({
        status: 400,
        message: 'The artwork of this item keeps the item id old-relic',
      });
      expect(await rejection(author(definitionOf('old-relic', 'skin')))).toMatchObject({
        status: 400,
        message: 'old-relic is a static item, not a skin item',
      });
      expect(await rejection(author(definitionOf('old-relic', 'static'), null))).toMatchObject({ status: 400 });
      const definition = await author(definitionOf('old-relic', 'static'));
      const stored = await all().ObjectLayer.findOne({ cid: definition.cid }, { origin: 1, 'data.item': 1 }).lean();
      expect(stored).toMatchObject({ origin: 'draft', data: { item: { id: 'old-relic', type: 'static' } } });
      expect(await boundCid('old-relic')).toBeUndefined();
      const authored = targetOf(await view(population._id), 'old-relic');
      expect(authored).toMatchObject({
        stage: 'other',
        resolution: 'author',
        definitionCid: definition.cid,
        state: 'authored',
        artwork: { cid: definition.cid, source: 'authored' },
      });
      expect((await getDraft(all(), population._id)).previewKeys['old-relic']).toBe(definition.cid);
      await publish(population._id);
      expect(await work()).toBe('completed');
      const published = await view(population._id);
      expect(published.publication.commit.assets).toEqual([
        {
          stage: 'other',
          itemId: 'old-relic',
          kind: 'definition',
          previousCid: '',
          revisionCid: definition.cid,
          definitionCid: definition.cid,
        },
      ]);
      expect(await boundCid('old-relic')).toBe(definition.cid);
      await deletePopulation({ models: all(), id: population._id, options: host });
    });

    it('authors an item of a generated type by hand, and a switch of resolution takes back only a stale selection', async () => {
      const population = await create('violet-hollow');
      await change(population._id, 'violet-skin', { resolution: 'render' });
      await generate(population._id, 'violet-skin');
      await drain();
      await select(population._id, 'violet-skin');
      const [entry] = await entriesOf(population._id, 'violet-skin');
      expect(entry.state).toBe('selected');
      const audits = () => models().CyberiaProceduralAudit.countDocuments({ jobItemId: entry.entryId });
      const before = await audits();
      const definition = await authorTarget({
        models: all(),
        id: population._id,
        itemId: 'violet-skin',
        body: { data: definitionOf('violet-skin', 'skin'), objectLayerRenderFramesData: toWire(square(24)) },
        actor: MODERATOR,
        options: host,
      });
      const authored = targetOf(await view(population._id), 'violet-skin');
      expect(authored).toMatchObject({
        resolution: 'author',
        state: 'authored',
        definitionCid: definition.cid,
        artwork: { cid: definition.cid, source: 'authored' },
        binding: { cid: cids['violet-skin'] },
      });
      expect(authored.resolutions.map(({ id, available }) => [id, available])).toEqual([
        ['keep', true],
        ['render', true],
        ['template', true],
        ['author', true],
      ]);
      expect((await entriesOf(population._id, 'violet-skin')).map(({ id, state }) => [id, state])).toEqual([
        [entry.id, 'ready'],
      ]);
      expect(await audits()).toBe(before + 1);
      expect(
        await models()
          .CyberiaProceduralAudit.findOne({ jobItemId: entry.entryId, action: 'item.approval_withdrawn' })
          .lean(),
      ).toMatchObject({ actor: MODERATOR, reason: 'the resolution of violet-skin changed to author' });

      const back = targetOf(await change(population._id, 'violet-skin', { resolution: 'render' }), 'violet-skin');
      expect(back).toMatchObject({ resolution: 'render', state: 'choose', definitionCid: definition.cid });
      await select(population._id, 'violet-skin');
      const kept = targetOf(await keep(population._id, 'violet-skin'), 'violet-skin');
      expect(kept).toMatchObject({ resolution: 'keep', state: 'kept', definitionCid: definition.cid });
      expect((await entriesOf(population._id, 'violet-skin'))[0].state).toBe('ready');
      const again = targetOf(await change(population._id, 'violet-skin', { resolution: 'author' }), 'violet-skin');
      expect(again).toMatchObject({ state: 'authored', definitionCid: definition.cid, observed: null });
      expect(await boundCid('violet-skin')).toBe(cids['violet-skin']);
      expect(await models().CyberiaProceduralJobItem.countDocuments({ _id: entry.entryId })).toBe(1);
      await deletePopulation({ models: all(), id: population._id, options: host });
    });

    it('gives every canonical item type the same resolutions, and authors any of them by hand to a draft', async () => {
      const population = await create('blank-room');
      for (const itemType of Object.values(ITEM_TYPES)) {
        const stage = STAGES.find(({ itemTypes }) => itemTypes.includes(itemType));
        const itemId = `hand-${itemType}`;
        const added = targetOf(
          await addTarget({ models: all(), id: population._id, body: { itemId, stage: stage.id, itemType } }),
          itemId,
        );
        expect(
          added.resolutions.map(({ id, available }) => [id, available]),
          itemType,
        ).toEqual(
          stage.generatorId
            ? [
                ['keep', false],
                ['render', false],
                ['template', true],
                ['author', true],
              ]
            : [
                ['keep', false],
                ['author', true],
              ],
        );
        const definition = await authorTarget({
          models: all(),
          id: population._id,
          itemId,
          body: { data: definitionOf(itemId, itemType), objectLayerRenderFramesData: toWire(square(12)) },
          actor: MODERATOR,
          options: host,
        });
        expect(targetOf(await view(population._id), itemId), itemType).toMatchObject({
          itemType,
          resolution: 'author',
          state: 'authored',
          definitionCid: definition.cid,
          artwork: { cid: definition.cid, source: 'authored' },
        });
        expect(await boundCid(itemId)).toBeUndefined();
      }
      await deletePopulation({ models: all(), id: population._id, options: host });
    });

    it('lists the stored definitions of an item to continue from, and takes one a human authored', async () => {
      const draft = await ObjectLayerEngine.persistObjectLayerDocuments({
        models: catalogModels(host),
        objectLayerRenderFramesData: square(12),
        objectLayerData: { data: definitionOf('lantern-moss', 'floor') },
        persistOptions: { options: host, draft: true },
      });
      const population = await create('blank-room');
      await addTarget({ models: all(), id: population._id, body: { itemId: 'lantern-moss', stage: 'floor' } });
      const found = await targetDefinitions(all(), population._id, 'lantern-moss', { skip: 0, limit: 10 });
      expect(found.data).toEqual([
        expect.objectContaining({ itemId: 'lantern-moss', itemType: 'floor', cid: draft.cid }),
      ]);
      expect(['draft', 'published']).toContain(found.data[0].status);

      const selected = await addTarget({
        models: all(),
        id: population._id,
        body: { itemId: 'lantern-moss', cid: draft.cid },
      });
      expect(targetOf(selected, 'lantern-moss')).toMatchObject({
        stage: 'floor',
        resolution: 'author',
        state: 'authored',
        definitionCid: draft.cid,
        drafts: [],
      });
      expect((await targetDefinitions(all(), population._id, 'lantern-moss', { skip: 0, limit: 10 })).data).toEqual([
        expect.objectContaining({ cid: draft.cid }),
      ]);
      expect((await resultsOf(population._id, 'lantern-moss')).map(({ source, state }) => [source, state])).toEqual([
        ['stored', 'selected'],
      ]);
      expect(await boundCid('lantern-moss')).toBeUndefined();
      expect(
        await rejection(
          addTarget({ models: all(), id: population._id, body: { itemId: 'violet-moss', cid: draft.cid } }),
        ),
      ).toMatchObject({ message: `Definition ${draft.cid} is item lantern-moss, not violet-moss` });
      await deletePopulation({ models: all(), id: population._id, options: host });
    });
  });

  describe('the results of an item', () => {
    const authorSkin = (id, description) =>
      authorTarget({
        models: all(),
        id,
        itemId: 'violet-skin',
        body: {
          data: {
            ...definitionOf('violet-skin', 'skin'),
            item: { ...definitionOf('violet-skin', 'skin').item, description },
          },
          objectLayerRenderFramesData: toWire(square(24)),
        },
        actor: MODERATOR,
        options: host,
      });
    const stored = async (cid) => ({
      definition: Boolean(await models().ObjectLayer.exists({ cid })),
      frames: Boolean(await models().ObjectLayerRenderFrames.exists({ objectLayerCid: cid })),
    });

    it('lists every generated result and every draft it stored with its source, state and actions', async () => {
      const population = await create('violet-hollow');
      const first = await authorSkin(population._id, 'first');
      const second = await authorSkin(population._id, 'second');
      expect((await authorSkin(population._id, 'second')).cid).toBe(second.cid);
      const blank = await authorSkin(population._id, 'no frames');
      await models().ObjectLayerRenderFrames.deleteOne({ objectLayerCid: blank.cid });
      await addTarget({ models: all(), id: population._id, body: { itemId: 'violet-skin', cid: second.cid } });
      await change(population._id, 'violet-skin', { resolution: 'render' });
      await generate(population._id, 'violet-skin');
      await change(population._id, 'violet-skin', { resolution: 'template' });
      await generate(population._id, 'violet-skin');
      await drain();
      const kept = (await targetResults(all(), population._id, 'violet-skin')).results.find(
        ({ cid }) => cid === second.cid,
      );
      expect(kept.state).toBe('saved');
      expect(actionOf(kept, 'delete').reason).toBe(
        'The item keeps it as its authored definition: reset the item, or author it and use another',
      );
      expect(actionOf(kept, 'use').available).toBe(true);
      await change(population._id, 'violet-skin', { resolution: 'author' });

      const { results, retained, limit } = await targetResults(all(), population._id, 'violet-skin');
      expect([retained, limit]).toEqual([5, RESULT_LIMIT]);
      expect(results.map(({ source }) => source)).toEqual(['template', 'render', 'author', 'author', 'author']);
      const row = (cid) => results.find((result) => result.cid === cid);
      expect(row(second.cid)).toMatchObject({ id: second.cid, state: 'selected', hasRender: true });
      expect(row(blank.cid)).toMatchObject({ state: 'saved', hasRender: false });
      expect(row(first.cid)).toMatchObject({ state: 'superseded', hasRender: true, keptBy: '' });
      expect(actionOf(row(second.cid), 'delete')).toEqual({
        id: 'delete',
        available: false,
        reason: 'It is the selected result: use another result or reset the item first',
      });
      expect(actionOf(row(blank.cid), 'use')).toMatchObject({
        available: false,
        reason: expect.stringContaining('no render'),
      });
      expect(actionOf(row(first.cid), 'use').available).toBe(true);
      const [template, render] = results;
      expect(template).toMatchObject({ state: 'ready', hasRender: true, entryId: expect.any(String) });
      expect(render.actions.map(({ id, available }) => [id, available])).toEqual([
        ['use', true],
        ['edit', true],
        ['delete', true],
      ]);
      const earlier = await create('blank-room');
      await addTarget({ models: all(), id: earlier._id, body: { itemId: 'violet-skin' } });
      await change(earlier._id, 'violet-skin', { resolution: 'render' });
      await generate(earlier._id, 'violet-skin');
      await drain();
      const [elsewhere] = await entriesOf(earlier._id, 'violet-skin');
      const sources = (await targetDefinitions(all(), population._id, 'violet-skin', { skip: 0, limit: 50 })).data;
      expect(sources.map(({ cid }) => cid).sort()).toEqual([first.cid, second.cid, blank.cid, elsewhere.cid].sort());
      expect(sources.find(({ cid }) => cid === blank.cid)).toMatchObject({ status: 'draft', hasRender: false });
      expect(sources.some(({ cid }) => [cids['violet-skin'], template.cid, render.cid].includes(cid))).toBe(false);
      await deletePopulation({ models: all(), id: earlier._id, options: host });
      await deletePopulation({ models: all(), id: population._id, options: host });
    });

    it('uses a result once: a generated one of another start switches the resolution, and one with no render is refused', async () => {
      const population = await create('violet-hollow');
      const draft = await authorSkin(population._id, 'to leave');
      await change(population._id, 'violet-skin', { resolution: 'render' });
      await generate(population._id, 'violet-skin', 2);
      await drain();
      const [newer, older] = await entriesOf(population._id, 'violet-skin');
      await change(population._id, 'violet-skin', { resolution: 'author' });
      const used = await select(population._id, 'violet-skin', older);
      expect(targetOf(used, 'violet-skin')).toMatchObject({
        resolution: 'render',
        state: 'selected',
        definitionCid: draft.cid,
        selected: { id: older.entryId, cid: older.cid },
      });
      const { revision } = await view(population._id);
      await select(population._id, 'violet-skin', { ...older, state: 'selected' });
      expect((await view(population._id)).revision).toBe(revision);
      await select(population._id, 'violet-skin', newer);
      expect((await entriesOf(population._id, 'violet-skin')).map(({ state }) => state)).toEqual(['selected', 'ready']);
      expect(await rejection(select(population._id, 'violet-skin', { ...older, cid: newer.cid }))).toMatchObject({
        status: 409,
      });
      await models().ObjectLayerRenderFrames.deleteOne({ objectLayerCid: older.cid });
      expect(await rejection(select(population._id, 'violet-skin', older))).toMatchObject({
        status: 409,
        message: `Result ${older.cid} has no render frames: delete it, or generate a new result`,
      });
      await deletePopulation({ models: all(), id: population._id, options: host });
    });

    it('deletes unselected results with their storage, keeps the selected and the shared, and records each delete', async () => {
      const population = await create('violet-hollow');
      const own = await authorSkin(population._id, 'own');
      const shared = await authorSkin(population._id, 'shared');
      const latest = await authorSkin(population._id, 'latest');
      const other = await create('blank-room');
      await addTarget({ models: all(), id: other._id, body: { itemId: 'violet-skin', cid: shared.cid } });
      await change(population._id, 'violet-skin', { resolution: 'render' });
      await generate(population._id, 'violet-skin', 3);
      await drain();
      const [kept, discarded, plain] = await entriesOf(population._id, 'violet-skin');
      await select(population._id, 'violet-skin', kept);
      await rejectItem({ models: models(), jobId: discarded.jobId, id: discarded.entryId, actor: MODERATOR });
      const listed = await entriesOf(population._id, 'violet-skin');
      expect(listed.find(({ id }) => id === discarded.id)).toMatchObject({ state: 'discarded' });
      expect(
        actionOf(
          listed.find(({ id }) => id === discarded.id),
          'delete',
        ).available,
      ).toBe(true);
      const answer = await remove(population._id, 'violet-skin', [
        discarded.id,
        plain.id,
        kept.id,
        own.cid,
        shared.cid,
        latest.cid,
        cids['violet-skin'],
      ]);
      expect(answer.deleted.removed).toEqual([
        `the generated result ${discarded.cid}`,
        `the generated result ${plain.cid}`,
        `the draft ${own.cid}`,
      ]);
      expect(answer.deleted.retained).toEqual([
        `the generated result ${kept.cid}: It is the selected or published result: use another result or reset the item first`,
        `the draft ${shared.cid}: Draft ${shared.cid} stays: a map population uses it`,
        `the draft ${latest.cid}: The item keeps it as its authored definition: reset the item, or author it and use another`,
        `the draft ${cids['violet-skin']}: Definition ${cids['violet-skin']} is not a draft this workflow stored: it stays`,
      ]);
      expect(answer.deleted.failures).toEqual([]);
      expect(answer.deleted.purged.sort()).toEqual([discarded.cid, plain.cid, own.cid].sort());
      for (const cid of [discarded.cid, plain.cid, own.cid])
        expect(await stored(cid), cid).toEqual({ definition: false, frames: false });
      for (const cid of [kept.cid, shared.cid, latest.cid, cids['violet-skin']])
        expect(await stored(cid), cid).toEqual({ definition: true, frames: true });
      expect(await models().CyberiaProceduralJob.countDocuments({ _id: { $in: [discarded.id, plain.id] } })).toBe(0);
      expect(targetOf(answer, 'violet-skin').drafts).toEqual([shared.cid, latest.cid]);
      expect(
        await models().CyberiaProceduralAudit.countDocuments({
          jobId: { $in: [discarded.id, plain.id] },
          action: { $ne: 'target.entry_deleted' },
        }),
      ).toBe(0);
      expect(await models().CyberiaProceduralAudit.countDocuments({ jobId: kept.id })).toBeGreaterThan(0);
      expect(
        await models()
          .CyberiaProceduralAudit.find(
            { populationId: population._id, action: { $in: ['target.entry_deleted', 'target.draft_deleted'] } },
            { action: 1, previousCid: 1, _id: 0 },
          )
          .sort({ createdAt: 1 })
          .lean(),
      ).toEqual([
        { action: 'target.entry_deleted', previousCid: discarded.cid },
        { action: 'target.entry_deleted', previousCid: plain.cid },
        { action: 'target.draft_deleted', previousCid: own.cid },
      ]);

      const again = await remove(population._id, 'violet-skin', [plain.id, own.cid]);
      expect(again.deleted).toMatchObject({ removed: [], purged: [] });
      expect(again.deleted.failures).toEqual([
        `the draft ${plain.id}: violet-skin has no generated result ${plain.id}`,
        `the draft ${own.cid}: There is no Object Layer definition ${own.cid}`,
      ]);
      expect(await rejection(remove(population._id, 'violet-skin', []))).toMatchObject({ status: 400 });
      await deletePopulation({ models: all(), id: other._id, options: host });
      await deletePopulation({ models: all(), id: population._id, options: host });
    });

    it('keeps at most the result limit: Generate and a Studio save refuse beyond it until a delete makes room', async () => {
      const population = await create('violet-hollow');
      const drafts = [];
      for (let index = 0; index < RESULT_LIMIT - 1; index++)
        drafts.push(await authorSkin(population._id, `draft ${index}`));
      await change(population._id, 'violet-skin', { resolution: 'render' });
      expect(await rejection(generate(population._id, 'violet-skin', 2))).toMatchObject({
        status: 409,
        message: `violet-skin keeps ${RESULT_LIMIT - 1} of ${RESULT_LIMIT} results: delete unselected results to add 2 more`,
      });
      await generate(population._id, 'violet-skin');
      expect(await rejection(authorSkin(population._id, 'one more'))).toMatchObject({
        status: 409,
        message: `violet-skin keeps ${RESULT_LIMIT} of ${RESULT_LIMIT} results: delete unselected results to add 1 more`,
      });
      expect((await targetResults(all(), population._id, 'violet-skin')).retained).toBe(RESULT_LIMIT);
      await remove(population._id, 'violet-skin', [drafts[0].cid]);
      await authorSkin(population._id, 'one more');
      expect((await targetResults(all(), population._id, 'violet-skin')).retained).toBe(RESULT_LIMIT);
      await deletePopulation({ models: all(), id: population._id, options: host });
    });

    it('retries a failed result under its own seed and adds no result; a failure that repeats takes no retry', async () => {
      const population = await create('violet-hollow');
      await change(population._id, 'violet-skin', { resolution: 'render' });
      await generate(population._id, 'violet-skin');
      await drain({
        persist: async () => {
          throw new Error('The store does not answer');
        },
      });
      const [failed] = await entriesOf(population._id, 'violet-skin');
      expect(failed).toMatchObject({ state: 'failed', retryable: true, error: 'The store does not answer' });
      expect(actionOf(failed, 'retry')).toEqual({ id: 'retry', available: true, reason: '' });
      const { seed } = await models().CyberiaProceduralJobItem.findById(failed.entryId).lean();
      await retryEntry({
        models: all(),
        id: population._id,
        itemId: 'violet-skin',
        entryId: failed.entryId,
        actor: MODERATOR,
      });
      await drain();
      const [ready, ...rest] = await entriesOf(population._id, 'violet-skin');
      expect(rest).toEqual([]);
      expect(ready).toMatchObject({ id: failed.id, entryId: failed.entryId, state: 'ready', retryable: false });
      expect((await models().CyberiaProceduralJobItem.findById(failed.entryId).lean()).seed).toBe(seed);
      expect(
        await models().CyberiaProceduralAudit.countDocuments({ jobItemId: failed.entryId, action: 'item.retried' }),
      ).toBe(1);

      await models().CyberiaProceduralJobItem.updateOne(
        { _id: failed.entryId },
        { $set: { status: 'failed', error: { message: 'Invalid render', retryable: false, at: new Date() } } },
      );
      const [repeats] = await entriesOf(population._id, 'violet-skin');
      expect(actionOf(repeats, 'retry')).toMatchObject({ available: false });
      expect(
        await rejection(
          retryEntry({
            models: all(),
            id: population._id,
            itemId: 'violet-skin',
            entryId: failed.entryId,
            actor: MODERATOR,
          }),
        ),
      ).toMatchObject({ status: 409 });
      await deletePopulation({ models: all(), id: population._id, options: host });
    });

    it('fences a run its delete meets mid-generation: the worker purges what it stores afterwards and leaves no draft', async () => {
      const population = await create('violet-hollow');
      await change(population._id, 'violet-skin', { resolution: 'render' });
      await generate(population._id, 'violet-skin');
      const item = await claimNextItem({ models: models(), holder: 'worker-b' });
      const [running] = await entriesOf(population._id, 'violet-skin');
      expect(running).toMatchObject({ state: 'generating', id: String(item.jobId) });
      expect(actionOf(running, 'delete').available).toBe(true);
      let written = '';
      await runItem({
        models: models(),
        item,
        holder: 'worker-b',
        options: host,
        persist: async () => {
          await remove(population._id, 'violet-skin', [running.id]);
          const definition = await ObjectLayerEngine.persistObjectLayerDocuments({
            models: catalogModels(host),
            objectLayerRenderFramesData: square(24),
            objectLayerData: { data: definitionOf('violet-skin', 'skin') },
            persistOptions: { options: host, draft: true },
          });
          written = definition.cid;
          return definition;
        },
      });
      expect(written).not.toBe('');
      expect(await stored(written)).toEqual({ definition: false, frames: false });
      expect(await entriesOf(population._id, 'violet-skin')).toEqual([]);
      await deletePopulation({ models: all(), id: population._id, options: host });
    });

    it('resets the whole workflow: every result and draft it owns goes, what others use stays, and Generate gives new results', async () => {
      const population = await create('violet-hollow');
      const own = await authorSkin(population._id, 'own draft');
      const shared = await authorSkin(population._id, 'shared draft');
      const other = await create('blank-room');
      await addTarget({ models: all(), id: other._id, body: { itemId: 'violet-skin', cid: shared.cid } });
      await change(population._id, 'violet-skin', {
        resolution: 'render',
        palette: { slots: { 'hair.base': '#101010' } },
      });
      await generate(population._id, 'violet-skin', 2);
      await drain();
      await select(population._id, 'violet-skin');
      const entries = await entriesOf(population._id, 'violet-skin');
      await models().CyberiaProceduralJobItem.deleteOne({ _id: entries[1].entryId });
      expect((await entriesOf(population._id, 'violet-skin'))[1]).toMatchObject({ state: 'missing', entryId: '' });
      const seeds = (
        await models()
          .CyberiaProceduralJob.find({ _id: { $in: entries.map(({ id }) => id) } })
          .lean()
      ).map(({ spec }) => spec.seed.value);
      const answer = await reset(population._id, 'violet-skin');
      expect(targetOf(answer, 'violet-skin')).toMatchObject({
        definitionCid: '',
        drafts: [shared.cid],
        palette: { slots: {} },
        variation: null,
        resolution: 'keep',
        state: 'kept',
      });
      expect(answer.reset).toEqual({
        removed: ['2 generated results', `the draft ${own.cid}`],
        retained: [
          `the draft ${shared.cid}: a map population uses it`,
          'published definitions, bindings, placements, defaults and the population audit',
        ],
        failures: [],
        purged: expect.arrayContaining([entries[0].cid, own.cid]),
        remaining: { runs: 0, drafts: 1 },
      });
      expect(await stored(entries[0].cid)).toEqual({ definition: false, frames: false });
      expect(await stored(own.cid)).toEqual({ definition: false, frames: false });
      expect(await stored(shared.cid)).toEqual({ definition: true, frames: true });
      expect(await models().CyberiaProceduralJob.countDocuments({ populationId: population._id })).toBe(0);
      expect(
        await models().CyberiaProceduralJobItem.countDocuments({ jobId: { $in: entries.map(({ id }) => id) } }),
      ).toBe(0);
      expect(
        await models().CyberiaProceduralAudit.countDocuments({ jobId: { $in: entries.map(({ id }) => id) } }),
      ).toBe(0);
      expect(await boundCid('violet-skin')).toBe(cids['violet-skin']);

      const { revision } = await view(population._id);
      const twice = await reset(population._id, 'violet-skin');
      expect(twice.reset).toMatchObject({ removed: [], failures: [], remaining: { runs: 0, drafts: 1 } });
      expect(twice.revision).toBe(revision);
      expect(
        await models().CyberiaProceduralAudit.countDocuments({ action: 'target.reset', populationId: population._id }),
      ).toBe(1);

      await change(population._id, 'violet-skin', { resolution: 'render' });
      await generate(population._id, 'violet-skin');
      const [fresh] = await models().CyberiaProceduralJob.find({ populationId: population._id }).lean();
      expect(seeds).not.toContain(fresh.spec.seed.value);
      await deletePopulation({ models: all(), id: other._id, options: host });
      const deleted = await deletePopulation({ models: all(), id: population._id, options: host });
      expect(deleted).toMatchObject({ jobs: 1, drafts: 1 });
      expect(await stored(shared.cid)).toEqual({ definition: false, frames: false });
    });

    it('answers the binding of each item a live map places with whether it has a render, for the Map Engine', async () => {
      const resolved = await CyberiaItemCatalogService.resolve(
        { query: { ids: 'violet-moss,violet-stone,ghost-floor' } },
        {},
        host,
      );
      expect(resolved).toEqual({
        'violet-moss': { cid: await boundCid('violet-moss'), hasRender: true },
        'violet-stone': { cid: await boundCid('violet-stone'), hasRender: false },
        'ghost-floor': null,
      });
    });

    it('generates any item on its own, and nothing for an item whose binding moved', async () => {
      const population = await create('violet-hollow');
      await change(population._id, 'violet-skin', { resolution: 'render' });
      await change(population._id, 'violet-moss', { resolution: 'render' });
      const started = await generate(population._id, 'violet-skin');
      expect(targetOf(started, 'violet-skin').state).toBe('generating');
      expect(targetOf(started, 'violet-moss').state).toBe('new');
      const moved = await publishItem('violet-twin', { render: true });
      const original = cids['violet-skin'];
      await rebind('violet-skin', moved);
      expect(await rejection(generate(population._id, 'violet-skin'))).toMatchObject({
        status: 409,
        message: `'violet-skin' runs ${moved}, not ${original}. Keep it to read what it runs now, then choose how to generate it.`,
      });
      await rebind('violet-skin', original);
      await deletePopulation({ models: all(), id: population._id, options: host });
    });

    it('selects one result at a time, deletes one, and an edit asks to use it again', async () => {
      const population = await create('violet-hollow');
      await change(population._id, 'violet-moss', { resolution: 'render' });
      await generate(population._id, 'violet-moss', 2);
      await drain();
      const [newer, older] = await entriesOf(population._id, 'violet-moss');
      expect([newer.state, older.state]).toEqual(['ready', 'ready']);
      expect(targetOf(await view(population._id), 'violet-moss').state).toBe('choose');
      await select(population._id, 'violet-moss', older);
      const switched = await select(population._id, 'violet-moss', newer);
      expect(targetOf(switched, 'violet-moss')).toMatchObject({ state: 'selected', selected: { id: newer.entryId } });
      expect((await entriesOf(population._id, 'violet-moss')).map(({ state }) => state)).toEqual(['selected', 'ready']);
      await remove(population._id, 'violet-moss', [older.id]);
      expect((await entriesOf(population._id, 'violet-moss')).map(({ id }) => id)).toEqual([newer.id]);

      const item = await models().CyberiaProceduralJobItem.findById(newer.entryId).lean();
      await saveRevision({
        models: models(),
        id: item._id,
        body: await edited(item, { x: 1, y: 1, color: [255, 0, 0, 255] }),
        actor: MODERATOR,
        options: host,
      });
      expect(targetOf(await view(population._id), 'violet-moss').state).toBe('choose');
      const req = { params: { jobId: item.jobId }, auth: { user: { _id: MODERATOR } }, body: {} };
      for (const call of [CyberiaProceduralJobService.promoteJob, CyberiaProceduralJobService.delete])
        expect(await rejection(call(req, {}, host))).toMatchObject({ status: 409 });
      await deletePopulation({ models: all(), id: population._id, options: host });
    });

    it('derives each step from what is stored, and validates what a publication would do', async () => {
      const population = await create('violet-hollow');
      expect(population.steps).toEqual({
        items: { state: 'ready', detail: '3 of 3 items ready' },
        defaults: { state: 'ready', detail: '1 default · no default names violet-moss' },
        map: { state: 'not-started', detail: 'No map changes: the map stays as it is' },
        publish: { state: 'not-started', detail: 'Not published' },
      });
      const reuse = await validatePublication({ models: all(), id: population._id });
      expect(reuse).toMatchObject({ ready: true, problems: [], plan: { assets: [], media: null } });
      expect(reuse.plan.kept.map(({ itemId }) => itemId)).toEqual(['iron-sword', 'violet-moss', 'violet-skin']);
      const regenerate = await change(population._id, 'violet-moss', { resolution: 'render' });
      expect(regenerate.steps.items).toEqual({ state: 'in-progress', detail: '2 of 3 items ready' });
      expect(await validatePublication({ models: all(), id: population._id })).toMatchObject({
        ready: false,
        problems: ['Keep the current artwork, select new artwork, author it by hand or remove: violet-moss'],
      });
      const decided = await decideAll(population._id);
      expect(decided.steps.items).toEqual({ state: 'ready', detail: '3 of 3 items ready' });
      expect((await validatePublication({ models: all(), id: population._id })).problems).toEqual([
        'Accept the change of violet-moss: each runs beyond map violet-hollow too',
      ]);
      expect(
        await validatePublication({ models: all(), id: population._id, body: { acknowledged: ['violet-moss'] } }),
      ).toMatchObject({ ready: true, problems: [] });
      const request = (revision) =>
        requestPublication({
          models: all(),
          id: population._id,
          actor: MODERATOR,
          acknowledged: ['violet-moss'],
          revision,
        });
      expect(await rejection(request(undefined))).toMatchObject({
        status: 400,
        message: 'A publication names the population revision it reviewed',
      });
      const { revision } = await view(population._id);
      await change(population._id, 'violet-moss', { variation: 0.4 });
      expect(await rejection(request(revision))).toMatchObject({
        status: 409,
        message: 'The population changed since you reviewed it: review it again, then publish',
      });
      expect((await view(population._id)).publication).toBeNull();
      await deletePopulation({ models: all(), id: population._id, options: host });
    });
  });

  describe('the draft and its preview', () => {
    it('draws each placed item by the CID it would run, and keeps its grid and every placement field', async () => {
      const population = await create('violet-array');
      await keep(population._id, 'violet-stone');
      await change(population._id, 'violet-moss', { resolution: 'render' });
      await generate(population._id, 'violet-moss');
      await generate(population._id, 'ghost-floor');
      await drain();
      const chosen = await select(population._id, 'violet-moss');
      const draft = await getDraft(all(), population._id);
      expect(draft.grid).toEqual(GRID);
      expect(draft.previewKeys).toMatchObject({
        'violet-moss': targetOf(chosen, 'violet-moss').selected.cid,
        'aether-agent': cids['aether-agent'],
      });
      expect(targetOf(chosen, 'violet-stone')).toMatchObject({
        binding: { cid: cids['violet-stone'], hasRender: false },
        artwork: { cid: '', source: 'unrendered' },
      });
      expect(draft.previewKeys).not.toHaveProperty('violet-stone');
      expect(draft.previewKeys).not.toHaveProperty('iron-sword');
      const ghost = targetOf(chosen, 'ghost-floor');
      expect(ghost.artwork).toEqual({ cid: ghost.latest.cid, source: 'draft' });
      expect(draft.previewKeys['ghost-floor']).toBe(ghost.latest.cid);
      expect(draft.items).toContainEqual({ itemId: 'ghost-floor', itemType: 'floor', state: 'choose' });
      const bot = {
        ...placed('bot', ['mystery-skin'], 1, 20)[0],
        level: 3,
        spawnRadius: 2,
        aggroRange: 5,
        maxLife: 40,
      };
      const entities = [...draft.entities, bot];
      const grid = { gridX: 64, gridY: 48, cellWidth: 10, cellHeight: 10 };
      const saved = await saveDraft({
        models: all(),
        id: population._id,
        body: { grid, entities, revision: 0, baseRevision: draft.mapRevision },
        actor: MODERATOR,
      });
      expect(saved).toMatchObject({ revision: 1, grid, placements: entities.length });
      const reopened = await getDraft(all(), population._id);
      expect(reopened).toMatchObject({ revision: 1, grid });
      expect(reopened.entities).toEqual(entities.map((entity) => expect.objectContaining(entity)));
      expect(reopened.missing).toEqual([
        {
          itemId: 'atlas_pistol_mk2',
          reason: 'atlas_pistol_mk2 has no artwork yet: generate entries, or author it in the Object Layer Studio',
        },
        {
          itemId: 'violet-stone',
          reason:
            'violet-stone runs a definition with no render: generate entries, or author it in the Object Layer Studio',
        },
        {
          itemId: 'iron-sword',
          reason:
            'iron-sword runs a definition with no render: generate entries, or author it in the Object Layer Studio',
        },
        {
          itemId: 'mystery-skin',
          reason: 'No definition is bound to mystery-skin: add it as an item, or bind it in the catalog',
        },
      ]);
      expect((await view(population._id)).steps.map.state).toBe('attention');
      expect(
        await rejection(save(population._id, { entities: placed('floor', ['violet-stone'], 1, 40), revision: 1 })),
      ).toMatchObject({
        status: 400,
        message: 'An entity starts at (40, 40), outside the 32 × 32 grid: move it or keep the grid larger',
      });
      expect(
        await rejection(save(population._id, { grid: { ...GRID, gridX: 0 }, entities, revision: 1 })),
      ).toMatchObject({
        status: 400,
      });
      const live = await mapOf('violet-array');
      expect([live.revision, live.gridX]).toEqual([draft.mapRevision, GRID.gridX]);
      await deletePopulation({ models: all(), id: population._id, options: host });
    });

    it('moves a draft onto a newer map revision only when the moderator rebases it', async () => {
      const population = await create('blank-room');
      const draft = await getDraft(all(), population._id);
      await save(population._id, {
        entities: placed('floor', ['violet-stone']),
        revision: 0,
        baseRevision: draft.mapRevision,
      });
      await all().CyberiaMap.updateOne({ code: 'blank-room' }, { $inc: { revision: 1 } });
      expect(
        await rejection(
          rebaseDraft({
            models: all(),
            id: population._id,
            body: { mapRevision: draft.mapRevision, revision: 1 },
            actor: MODERATOR,
          }),
        ),
      ).toMatchObject({
        status: 409,
      });
      const rebased = await rebaseDraft({
        models: all(),
        id: population._id,
        body: { mapRevision: draft.mapRevision + 1, revision: 1 },
        actor: MODERATOR,
      });
      expect(rebased.draft).toMatchObject({
        baseRevision: draft.mapRevision + 1,
        revision: 2,
        placements: 1,
        grid: GRID,
      });
      await deletePopulation({ models: all(), id: population._id, options: host });
    });
  });

  describe('the entity-type defaults workspace', () => {
    it('shows the stored defaults of the staged items with no map placement and no instance, and only those', async () => {
      const population = await create('blank-room');
      expect([population.context.instances, population.targets]).toEqual([[], []]);
      for (const itemId of ['small-skin', 'violet-skin', 'ember-warden'])
        await addTarget({
          models: all(),
          id: population._id,
          body: { itemId, ...(itemId === 'ember-warden' && { stage: 'npc-skin' }) },
        });
      expect((await getDraft(all(), population._id)).entities).toEqual([]);
      const workspace = await populationDefaults(all(), population._id);
      expect(workspace.rows.map(({ rowId }) => rowId).sort()).toEqual(
        [String(globalRow._id), String(wardenRow._id)].sort(),
      );
      expect(workspace.rows.find(({ rowId }) => rowId === String(globalRow._id))).toMatchObject({
        entityType: 'bot',
        liveItemIds: ['small-skin'],
        behavior: 'hostile',
        itemIds: ['small-skin'],
        instances: [],
        shadowedBy: [],
        added: false,
      });
      expect(workspace.rows.find(({ rowId }) => rowId === String(wardenRow._id))).toMatchObject({
        dropItemIds: ['iron-sword'],
        itemIds: ['violet-skin'],
        instances: ['violet-world'],
      });
      expect(workspace.missing).toEqual([{ itemId: 'ember-warden', entityType: 'bot' }]);
      const bound = await all().CyberiaItemCatalog.resolve(['small-skin', 'violet-skin']);
      expect(workspace.items).toEqual({
        'small-skin': { itemType: 'skin', cid: bound.get('small-skin'), source: 'kept' },
        'violet-skin': { itemType: 'skin', cid: bound.get('violet-skin'), source: 'kept' },
        'iron-sword': { itemType: 'weapon', cid: '', source: 'unrendered' },
      });
      const view = await getPopulation(all(), population._id);
      expect(view.steps.defaults).toEqual({ state: 'ready', detail: '2 defaults · no default names ember-warden' });
      await deletePopulation({ models: all(), id: population._id, options: host });
    });

    it('shows an instance row that runs in place of a global row, and keeps the global row in the workspace', async () => {
      const { CyberiaEntityTypeDefault, CyberiaInstanceConf } = all();
      const local = await CyberiaEntityTypeDefault.create({
        entityType: 'bot',
        liveItemIds: ['small-skin'],
        behavior: 'passive',
      });
      await CyberiaInstanceConf.updateOne({ instanceCode: 'array-world' }, { $push: { entityDefaults: local._id } });
      const population = await create('blank-room');
      await addTarget({ models: all(), id: population._id, body: { itemId: 'small-skin' } });
      const { rows } = await populationDefaults(all(), population._id);
      expect(rows.find(({ rowId }) => rowId === String(globalRow._id))).toMatchObject({
        instances: [],
        shadowedBy: [{ instanceCode: 'array-world', rowId: String(local._id) }],
      });
      expect(rows.find(({ rowId }) => rowId === String(local._id))).toMatchObject({
        instances: ['array-world'],
        shadowedBy: [],
      });
      await CyberiaInstanceConf.updateOne({ instanceCode: 'array-world' }, { $pull: { entityDefaults: local._id } });
      await CyberiaEntityTypeDefault.deleteOne({ _id: local._id });
      await deletePopulation({ models: all(), id: population._id, options: host });
    });

    it('adds and removes defaults in the workspace, and never changes or deletes a stored default', async () => {
      const population = await create('blank-room');
      await addTarget({ models: all(), id: population._id, body: { itemId: 'small-skin' } });
      const before = await all().CyberiaEntityTypeDefault.find({}).sort({ _id: 1 }).lean();
      const removed = await removeDefault({ models: all(), id: population._id, rowId: String(globalRow._id) });
      expect(removed.rows).toEqual([]);
      expect(removed.removed).toEqual([
        { rowId: String(globalRow._id), entityType: 'bot', liveItemIds: ['small-skin'] },
      ]);
      expect(removed.missing).toEqual([{ itemId: 'small-skin', entityType: 'bot' }]);
      const added = await addDefault({ models: all(), id: population._id, rowId: String(wardenRow._id) });
      expect(added.rows.map(({ rowId, added: byHand }) => [rowId, byHand])).toEqual([[String(wardenRow._id), true]]);
      const back = await addDefault({ models: all(), id: population._id, rowId: String(globalRow._id) });
      expect(back.removed).toEqual([]);
      expect(back.rows.map(({ rowId, added: byHand }) => [rowId, byHand]).sort()).toEqual(
        [
          [String(globalRow._id), false],
          [String(wardenRow._id), true],
        ].sort(),
      );
      expect(
        await rejection(addDefault({ models: all(), id: population._id, rowId: String(new Types.ObjectId()) })),
      ).toMatchObject({ status: 404 });
      expect(await all().CyberiaEntityTypeDefault.find({}).sort({ _id: 1 }).lean()).toEqual(before);
      await deletePopulation({ models: all(), id: population._id, options: host });
    });

    it('takes an edit of a stored default at the version it read, and refuses a save over a newer one', async () => {
      const population = await create('blank-room');
      await addTarget({ models: all(), id: population._id, body: { itemId: 'small-skin' } });
      const [row] = (await populationDefaults(all(), population._id)).rows;
      const put = (body) => CyberiaEntityTypeDefaultService.put({ params: { id: row.rowId }, body }, {}, host);
      const saved = await put({ behavior: 'passive', updatedAt: row.updatedAt });
      expect(saved.behavior).toBe('passive');
      expect(await rejection(put({ behavior: 'hostile', updatedAt: row.updatedAt }))).toMatchObject({ status: 409 });
      const [shown] = (await populationDefaults(all(), population._id)).rows;
      expect(shown).toMatchObject({ behavior: 'passive', updatedAt: saved.updatedAt });
      await put({ behavior: 'hostile', updatedAt: saved.updatedAt });
      await deletePopulation({ models: all(), id: population._id, options: host });
    });
  });

  describe('a population of an earlier version', () => {
    it('opens for nothing but a delete or the migration, and a delete removes every job it stored', async () => {
      const current = await create('blank-room');
      const { CyberiaProceduralPopulation: Population, CyberiaProceduralJob: Job } = all();
      const record = await Population.findById(current._id).lean();
      const { _id, fingerprint, ...fields } = record;
      const [old] = await Population.collection
        .insertMany([{ ...fields, version: 1, fingerprint: `old-${fingerprint}` }])
        .then(({ insertedIds }) => Object.values(insertedIds));
      await Job.collection.insertOne({
        populationId: old,
        requestFingerprint: 'old-job',
        spec: {},
        status: 'completed',
      });
      expect(await rejection(getPopulation(all(), String(old)))).toMatchObject({
        status: 409,
        message: `Population ${old} is a version 1 record: run \`cyberia population migrate --apply\`, or delete it and start the map again`,
      });
      const { data } = await listPopulations(all(), DataQuery.parse({ limit: 50 }));
      expect(data.find((row) => String(row._id) === String(old))).toMatchObject({ status: 'outdated', groups: [] });
      const report = await migratePopulations(all(), { apply: true, palettes: paletteIds() });
      expect(report.outdated).toEqual([
        expect.objectContaining({ id: String(old), version: 1, recovery: expect.stringContaining('delete it') }),
      ]);
      expect((await Population.findById(old).lean()).version).toBe(1);
      expect((await deletePopulation({ models: all(), id: String(old), options: host })).jobs).toBe(1);
      expect(await Population.exists({ _id: old })).toBeNull();
      expect(await Job.exists({ populationId: old })).toBeNull();
      await deletePopulation({ models: all(), id: current._id, options: host });
    });

    it('moves a version 2 record: kept items keep the CID they read, excluded items are removed, default changes are kept for review', async () => {
      const { CyberiaProceduralPopulation: Population, CyberiaProceduralJob: Job } = all();
      const current = await create('violet-array');
      await change(current._id, 'violet-moss', { resolution: 'render' });
      await generate(current._id, 'violet-moss');
      await generate(current._id, 'ghost-floor');
      const { nextRun, ...stored } = await Population.findById(current._id).lean();
      const [mossRun] = await runIds(current._id, 'violet-moss');
      const [ghostRun] = await runIds(current._id, 'ghost-floor');
      await Population.collection.deleteOne({ _id: stored._id });
      await Job.collection.updateMany({ populationId: stored._id }, { $unset: { populationItemId: '' } });
      // A version 2 record as the earlier engine stored it, under the same id: its jobs name it.
      const v2 = {
        ...stored,
        version: 2,
        fingerprint: `v2-${stored.fingerprint}`,
        targets: stored.targets.map(({ observed, resolution, drafts, ...target }) => ({
          ...target,
          runs:
            { 'violet-moss': [mossRun], 'ghost-floor': [ghostRun] }[target.itemId]?.map(
              (id) => new Types.ObjectId(id),
            ) ?? [],
          strategies: ['keep', 'render', 'template'],
          recommended: 'keep',
          strategy: resolution === 'keep' ? 'render' : resolution === 'template' && !target.cid ? 'create' : resolution,
          kept: ['small-skin', 'violet-stone'].includes(target.itemId),
          excluded:
            target.itemId === 'ghost-floor'
              ? { by: MODERATOR, at: new Date('2026-10-20T10:00:00Z'), reason: 'Not this map' }
              : null,
        })),
        defaults: [
          {
            rowId: wardenRow._id,
            action: 'update',
            expectedUpdatedAt: wardenRow.updatedAt,
            row: { entityType: 'bot', liveItemIds: ['violet-skin'], behavior: 'hostile' },
          },
          { rowId: new Types.ObjectId(), action: 'add', row: { entityType: 'bot', liveItemIds: ['ember-warden'] } },
        ],
        publication: { id: 'p1', status: 'publishing_objects', commit: null, history: [{ status: 'queued' }] },
      };
      delete v2.revision;
      delete v2.removed;
      await Population.collection.insertOne(v2);
      const rebound = await publishItem('violet-stone-next', { render: false, type: 'floor' });
      await rebind('violet-stone', rebound);

      const dry = await migratePopulations(all(), { apply: false, palettes: paletteIds() });
      expect(dry.migrated).toEqual([
        expect.objectContaining({
          id: String(v2._id),
          from: 2,
          kept: [
            { itemId: 'small-skin', cid: cids['small-skin'], bindingRevision: expect.any(Number) },
            { itemId: 'violet-stone', cid: cids['violet-stone'], bindingRevision: expect.any(Number) },
          ],
          removed: [{ itemId: 'ghost-floor', runs: 1 }],
          legacyDefaults: [
            {
              rowId: String(wardenRow._id),
              action: 'update',
              row: { entityType: 'bot', liveItemIds: ['violet-skin'], behavior: 'hostile' },
              expectedUpdatedAt: wardenRow.updatedAt,
            },
            expect.objectContaining({ action: 'add', row: { entityType: 'bot', liveItemIds: ['ember-warden'] } }),
          ],
          publication: 'cancelled before its commit at publishing_objects: publish again',
        }),
      ]);
      expect((await Population.findById(v2._id).lean()).version).toBe(2);

      await migratePopulations(all(), { apply: true, palettes: paletteIds() });
      const moved = await view(String(v2._id));
      expect(moved).toMatchObject({ version: POPULATION_VERSION, revision: 0, status: 'open', nextRun });
      expect(moved.defaults.added.map(String)).toEqual([String(wardenRow._id)]);
      expect(targetOf(moved, 'small-skin')).toMatchObject({
        resolution: 'keep',
        state: 'kept',
        cid: cids['small-skin'],
      });
      expect(targetOf(moved, 'violet-stone')).toMatchObject({
        resolution: 'keep',
        state: 'conflict',
        cid: cids['violet-stone'],
        observed: { cid: cids['violet-stone'] },
      });
      expect(await boundCid('violet-stone')).toBe(rebound);
      expect(targetOf(moved, 'violet-moss')).toMatchObject({ resolution: 'render', observed: null });
      expect(targetOf(moved, 'ghost-floor')).toBeUndefined();
      expect(moved.removed).toEqual([
        expect.objectContaining({
          by: MODERATOR,
          reason: 'Not this map',
          target: expect.objectContaining({ itemId: 'ghost-floor' }),
        }),
      ]);
      expect(moved.publication.status).toBe('cancelled_before_commit');
      expect(moved.migration).toMatchObject({ from: 2, legacyDefaults: dry.migrated[0].legacyDefaults });
      expect((await Job.findById(ghostRun).lean()).status).toBe('cancelled');
      expect(await Job.exists({ _id: mossRun })).not.toBeNull();
      expect((await entriesOf(String(v2._id), 'violet-moss')).map(({ id }) => id)).toEqual([mossRun]);
      expect((await all().CyberiaEntityTypeDefault.findById(wardenRow._id).lean()).behavior).toBe('passive');

      const again = await migratePopulations(all(), { apply: true, palettes: paletteIds() });
      expect(again.migrated).toEqual([]);
      expect(await view(String(v2._id))).toMatchObject({ version: POPULATION_VERSION, revision: 0 });
      const raw = await Population.findById(v2._id).lean();
      for (const target of [...raw.targets, ...raw.removed.map(({ target: removed }) => removed)])
        for (const key of ['strategy', 'strategies', 'recommended', 'templates', 'runs'])
          expect(target).not.toHaveProperty(key);
      await rebind('violet-stone', cids['violet-stone']);
      await deletePopulation({ models: all(), id: String(v2._id), options: host });
    });

    it('moves a version 3 record and keeps its pending default changes for review', async () => {
      const { CyberiaProceduralPopulation: Population } = all();
      const current = await create('blank-room');
      const stored = await Population.findById(current._id).lean();
      await Population.collection.deleteOne({ _id: stored._id });
      const change = {
        rowId: globalRow._id,
        action: 'update',
        expectedUpdatedAt: globalRow.updatedAt,
        row: { entityType: 'bot', liveItemIds: ['small-skin'], behavior: 'passive', dropItemIds: ['iron-sword'] },
        savedAt: new Date(),
        savedBy: MODERATOR,
      };
      await Population.collection.insertOne({ ...stored, version: 3, defaults: [change] });
      const { migrated } = await migratePopulations(all(), { apply: true, palettes: paletteIds() });
      expect(migrated).toEqual([expect.objectContaining({ id: String(stored._id), from: 3, kept: [], removed: [] })]);
      const moved = await view(String(stored._id));
      expect(moved.migration.legacyDefaults).toEqual([
        { rowId: String(globalRow._id), action: 'update', row: change.row, expectedUpdatedAt: globalRow.updatedAt },
      ]);
      expect((await populationDefaults(all(), String(stored._id))).rows.map(({ rowId }) => rowId)).toEqual([
        String(globalRow._id),
      ]);
      expect((await all().CyberiaEntityTypeDefault.findById(globalRow._id).lean()).behavior).toBe('hostile');
      await deletePopulation({ models: all(), id: String(stored._id), options: host });
    });

    it('moves a version 4 record: each strategy takes its resolution and each palette its global id; nothing else changes', async () => {
      const { CyberiaProceduralPopulation: Population } = all();
      const current = await create('violet-array');
      await change(current._id, 'violet-moss', { resolution: 'render' });
      await generate(current._id, 'violet-moss');
      const { nextRun, ...stored } = await Population.findById(current._id).lean();
      const runs = await runIds(current._id, 'violet-moss');
      await Population.collection.deleteOne({ _id: stored._id });
      await all().CyberiaProceduralJob.collection.updateMany(
        { populationId: stored._id },
        { $unset: { populationItemId: '' } },
      );
      const strategyOf = { 'ghost-floor': 'create', 'violet-moss': 'render', atlas_pistol_mk2: null };
      const resolutionOf = (strategy) =>
        ({ create: 'template', definition: 'author' })[strategy] ?? strategy ?? 'author';
      const sword = Object.fromEntries(
        Object.entries(stored.targets.find(({ itemId }) => itemId === 'iron-sword')).filter(
          ([key]) => key !== 'resolution',
        ),
      );
      const v4 = {
        ...stored,
        version: 4,
        migration: { from: 3, at: new Date('2026-10-01T00:00:00Z'), kept: [], removed: [], legacyDefaults: [] },
        targets: stored.targets
          .filter(({ itemId }) => itemId !== 'iron-sword')
          .map(({ resolution, drafts, ...target }) => ({
            ...target,
            runs: target.itemId === 'violet-moss' ? runs.map((id) => new Types.ObjectId(id)) : [],
            strategies: [],
            recommended: null,
            templates: target.templateId ? [target.templateId] : [],
            strategy: target.itemId in strategyOf ? strategyOf[target.itemId] : resolution,
            ...(target.itemId === 'violet-moss' && {
              palette: { paletteId: 'floor.dark-basalt', slots: { 'patch.base': '#123456' } },
            }),
          })),
        removed: [
          {
            target: {
              ...sword,
              strategy: 'definition',
              definitionCid: 'bafdraft',
              palette: { paletteId: 'skin.exotic-teal', slots: {} },
            },
            by: MODERATOR,
            at: new Date('2026-10-02T00:00:00Z'),
            reason: 'Later',
          },
        ],
      };
      await Population.collection.insertOne(v4);
      const dry = await migratePopulations(all(), { apply: false, palettes: paletteIds() });
      expect(dry.migrated).toEqual([
        {
          id: String(v4._id),
          mapCode: 'violet-array',
          from: 4,
          resolutions: [
            { itemId: 'atlas_pistol_mk2', from: null, to: 'author' },
            { itemId: 'ghost-floor', from: 'create', to: 'template' },
            { itemId: 'iron-sword', from: 'definition', to: 'author' },
          ],
          palettes: [
            { itemId: 'violet-moss', from: 'floor.dark-basalt', to: 'dark-basalt', resolved: true },
            { itemId: 'iron-sword', from: 'skin.exotic-teal', to: 'exotic-teal', resolved: true },
          ],
          nextRun,
        },
      ]);
      await migratePopulations(all(), { apply: true, palettes: paletteIds() });
      const raw = await Population.findById(v4._id).lean();
      expect(raw).toMatchObject({ version: POPULATION_VERSION, revision: stored.revision, migration: v4.migration });
      expect(raw.defaults).toEqual(stored.defaults);
      expect(raw.targets.map(({ itemId, resolution }) => [itemId, resolution])).toEqual(
        v4.targets.map(({ itemId, strategy }) => [itemId, resolutionOf(strategy)]),
      );
      expect(targetOf(raw, 'violet-moss').palette).toEqual({
        paletteId: 'dark-basalt',
        slots: { 'patch.base': '#123456' },
      });
      expect(raw.removed[0]).toMatchObject({
        by: MODERATOR,
        reason: 'Later',
        target: {
          itemId: 'iron-sword',
          resolution: 'author',
          definitionCid: 'bafdraft',
          palette: { paletteId: 'exotic-teal' },
        },
      });
      expect(raw.nextRun).toBe(nextRun);
      expect(raw.targets.every((target) => !('runs' in target) && target.drafts.length === 0)).toBe(true);
      expect((await entriesOf(String(v4._id), 'violet-moss')).map(({ id }) => id)).toEqual(runs);
      const moved = await view(String(v4._id));
      expect(targetOf(moved, 'ghost-floor')).toMatchObject({ resolution: 'template', state: 'new' });
      expect(targetOf(moved, 'atlas_pistol_mk2')).toMatchObject({ resolution: 'author', state: 'author' });
      expect((await migratePopulations(all(), { apply: true, palettes: paletteIds() })).migrated).toEqual([]);
      expect(await Population.findById(v4._id).lean()).toEqual(raw);
      await deletePopulation({ models: all(), id: String(v4._id), options: host });
    });

    it('moves a version 6 record: its runs leave the targets, the population counts them, and no draft is claimed', async () => {
      const { CyberiaProceduralPopulation: Population } = all();
      const current = await create('violet-array');
      await change(current._id, 'violet-moss', { resolution: 'render' });
      await generate(current._id, 'violet-moss', 2);
      const runs = await runIds(current._id, 'violet-moss');
      const seeds = (
        await models()
          .CyberiaProceduralJob.find({ _id: { $in: runs } })
          .lean()
      ).map(({ spec }) => spec.seed.value);
      const { nextRun, ...stored } = await Population.findById(current._id).lean();
      await all().CyberiaProceduralJob.collection.updateMany(
        { populationId: stored._id },
        { $unset: { populationItemId: '' } },
      );
      await Population.collection.replaceOne(
        { _id: stored._id },
        {
          ...stored,
          version: 6,
          targets: stored.targets.map(({ drafts, ...target }) => ({
            ...target,
            runs: target.itemId === 'violet-moss' ? [new Types.ObjectId(runs[1])] : [],
          })),
        },
      );
      const dry = await migratePopulations(all(), { apply: false, palettes: paletteIds() });
      expect(dry.migrated).toEqual([{ id: String(stored._id), mapCode: 'violet-array', from: 6, nextRun: 2 }]);
      await migratePopulations(all(), { apply: true, palettes: paletteIds() });
      const raw = await Population.findById(stored._id).lean();
      expect(raw).toMatchObject({ version: POPULATION_VERSION, nextRun: 2, revision: stored.revision });
      expect(raw.targets.every((target) => !('runs' in target) && target.drafts.length === 0)).toBe(true);
      expect((await entriesOf(String(stored._id), 'violet-moss')).map(({ id }) => id)).toEqual([...runs].reverse());
      await generate(String(stored._id), 'violet-moss');
      const [fresh] = await models()
        .CyberiaProceduralJob.find({ populationId: stored._id })
        .sort({ createdAt: -1, _id: -1 })
        .lean();
      expect(seeds).not.toContain(fresh.spec.seed.value);
      expect((await migratePopulations(all(), { apply: true, palettes: paletteIds() })).migrated).toEqual([]);
      await deletePopulation({ models: all(), id: String(stored._id), options: host });
    });

    it('moves a version 5 publication: each asset names its revision and result, and the publication resumes on its manifest', async () => {
      const { CyberiaProceduralPopulation: Population } = all();
      const population = await twoAssets();
      await publish(population._id, ['violet-moss']);
      let calls = 0;
      const failing = async (params) => {
        if (++calls === 2) throw new Error('The Object Layer authority does not answer');
        return await publishRevision(params);
      };
      expect(await work({ publish: failing })).toBe('objects_publish_failed');
      const stored = (await Population.findById(population._id).lean()).publication;
      const earlier = {
        ...stored,
        cancelRequestedAt: undefined,
        error: {
          phase: 'publishing_objects',
          itemId: stored.error.itemId,
          message: stored.error.message,
          at: stored.error.at,
        },
        plan: {
          ...Object.fromEntries(Object.entries(stored.plan).filter(([key]) => key !== 'manifestHash')),
          assets: stored.plan.assets.map(({ revisionCid, status, definitionCid, attempts, error, ...asset }) => ({
            ...asset,
            cid: revisionCid,
            published: status === 'published',
            ...(error && { error: error.message }),
          })),
        },
      };
      delete earlier.cancelRequestedAt;
      await Population.collection.updateOne({ _id: population._id }, { $set: { version: 5, publication: earlier } });

      const { migrated } = await migratePopulations(all(), { apply: true, palettes: paletteIds() });
      expect(migrated).toEqual([
        {
          id: String(population._id),
          mapCode: 'violet-array',
          from: 5,
          manifest: true,
          nextRun: await all().CyberiaProceduralJob.countDocuments({ populationId: population._id }),
        },
      ]);
      const moved = (await Population.findById(population._id).lean()).publication;
      expect(
        moved.plan.assets.map(({ status, revisionCid, definitionCid, attempts }) => [
          status,
          revisionCid,
          definitionCid,
          attempts,
        ]),
      ).toEqual(
        stored.plan.assets.map(({ status, revisionCid, definitionCid, attempts }) => [
          status,
          revisionCid,
          definitionCid,
          attempts,
        ]),
      );
      expect(moved.plan.manifestHash).toBe(stored.plan.manifestHash);
      expect(moved.error).toMatchObject({ phase: 'publishing_objects', retryable: true });
      await retryPublication({ models: all(), id: population._id });
      expect(await work(), await reasonOf(population._id)).toBe('completed');
      for (const { itemId, revisionCid } of moved.plan.assets) expect(await boundCid(itemId)).toBe(revisionCid);
    });
  });

  describe('the publication', () => {
    it('publishes onto the same map in ordered phases, binds only what changes, and leaves the defaults as they are', async () => {
      const population = await create('violet-hollow');
      await addTarget({ models: all(), id: population._id, body: { itemId: 'ember-warden', stage: 'npc-skin' } });
      const decided = await decideAll(population._id);
      expect([decided.status, decided.steps.items.state]).toEqual(['open', 'ready']);
      const before = await mapOf('violet-hollow');
      const kept = await models().CyberiaItemCatalog.bindingsOf(['violet-moss', 'violet-skin']);
      const draft = await getDraft(all(), population._id);
      const entities = [...placed('floor', ['violet-moss'], 4), ...placed('bot', ['ember-warden'], 2, 5)];
      const grid = { gridX: 12, gridY: 10, cellWidth: 10, cellHeight: 10 };
      await saveDraft({
        models: all(),
        id: population._id,
        body: { grid, entities, revision: 0, baseRevision: draft.mapRevision },
        actor: MODERATOR,
      });
      const defaults = await all().CyberiaEntityTypeDefault.find({}).sort({ _id: 1 }).lean();
      const requested = await publish(population._id);
      expect(requested.status).toBe('publishing');
      expect(requested.publication.status).toBe('queued');
      const repeated = await publish(population._id);
      expect(repeated.publication.id).toBe(requested.publication.id);

      expect(await work(), await reasonOf(population._id)).toBe('completed');
      const published = await view(population._id);
      expect(published.status).toBe('published');
      expect(published.publication.history.map(({ status }) => status)).toEqual([
        'queued',
        'preflight',
        'publishing_objects',
        'committing_runtime',
        'refreshing_runtime',
        'completed',
      ]);
      const after = await mapOf('violet-hollow');
      expect(String(after._id)).toBe(String(before._id));
      expect(after).toMatchObject({
        code: 'violet-hollow',
        name: 'Violet Hollow',
        description: 'A hollow.',
        tags: ['content'],
        ...grid,
        revision: before.revision + 1,
      });
      expect(published.publication.commit.map).toMatchObject({ grid, placements: entities.length });
      expect(published.steps.publish).toEqual({ state: 'published', detail: 'Published and the runtime refreshed' });
      expect(published.steps.map).toEqual({
        state: 'published',
        detail: `Published as map revision ${before.revision + 1}`,
      });
      expect(after.entities.map(({ objectLayerItemIds }) => objectLayerItemIds)).toEqual(
        entities.map(({ objectLayerItemIds }) => objectLayerItemIds),
      );
      const { assets, kept: reused } = published.publication.commit;
      expect(assets.map(({ itemId, kind, previousCid }) => [itemId, kind, previousCid])).toEqual([
        ['ember-warden', 'create', ''],
      ]);
      for (const { itemId, definitionCid } of assets) expect(await boundCid(itemId)).toBe(definitionCid);
      expect(reused.map(({ itemId }) => itemId)).toEqual(['iron-sword', 'violet-moss', 'violet-skin']);
      expect(await models().CyberiaItemCatalog.bindingsOf(['violet-moss', 'violet-skin'])).toEqual(kept);
      const conf = await all().CyberiaInstanceConf.findOne({ instanceCode: 'violet-world' }).lean();
      expect(conf.entityDefaults.map(String)).toEqual([String(wardenRow._id)]);
      expect(await all().CyberiaEntityTypeDefault.find({}).sort({ _id: 1 }).lean()).toEqual(defaults);
      expect(published.publication.commit).not.toHaveProperty('defaults');
      expect(published.publication.plan.media).toEqual({ mapCode: 'violet-hollow', revision: before.revision + 1 });
      expect(after.media).toMatchObject({ revision: before.revision + 1, status: 'pending' });
      expect(await rejection(publish(population._id))).toMatchObject({ status: 409 });
      expect(await rejection(cancelPublication({ models: all(), id: population._id }))).toMatchObject({ status: 409 });
    });

    it('stops a preflight that needs a decision, and publishes once the moderator gives it', async () => {
      const population = await create('ash-plain');
      await change(population._id, 'violet-moss', { resolution: 'render' });
      await decideAll(population._id);
      await publish(population._id);
      expect(await work()).toBe('preflight_failed');
      const failed = await view(population._id);
      expect(failed.status).toBe('open');
      expect(failed.publication.error.problems).toEqual([
        'Accept the change of violet-moss: each runs beyond map ash-plain too',
      ]);
      await publish(population._id, ['violet-moss']);
      expect(await work()).toBe('completed');
    });

    it('draws the preview of the revision it wrote before it completes, and waits on a failed draw', async () => {
      const population = await create('violet-annex');
      await decideAll(population._id);
      const draft = await getDraft(all(), population._id);
      await save(population._id, {
        entities: placed('floor', ['violet-stone'], 3),
        revision: 0,
        baseRevision: draft.mapRevision,
      });
      await publish(population._id);
      const failing = async (params) => {
        const result = await refreshPublication(params);
        return { ...result, media: { ...result.media, status: 'failed', error: 'the render stopped' } };
      };
      expect(await work({ refresh: failing })).toBe('published_reload_pending');
      const pending = await view(population._id);
      expect(pending.publication.error.message).toContain('the render stopped');
      await retryPublication({ models: all(), id: population._id });
      expect(await work({ refresh: refreshPublication })).toBe('completed');
      const map = await mapOf('violet-annex');
      expect(map.media).toMatchObject({ revision: draft.mapRevision + 1, status: 'ready', error: '' });
      expect((await view(population._id)).publication.refresh.media).toMatchObject({
        mapCode: 'violet-annex',
        revision: draft.mapRevision + 1,
        status: 'ready',
        preview: String(map.preview),
      });
      const file = await DataBaseProviderService.getModel('File', host).findById(map.preview).lean();
      expect([file.mimetype, Buffer.from(file.data.buffer).subarray(1, 4).toString()]).toEqual(['image/png', 'PNG']);
      const served = await CyberiaMapService.get({ params: { id: 'violet-annex' }, query: {} }, {}, host);
      expect(String(served.preview)).toBe(String(map.preview));
      expect(served.thumbnail).toBeUndefined();
      expect((await getDraft(all(), population._id)).preview).toBe(String(map.preview));
    });

    it('stops when the authority does not answer, binds nothing, and resumes with the revisions left', async () => {
      const population = await twoAssets();
      const bindings = { moss: await boundCid('violet-moss'), ghost: await boundCid('ghost-floor') };
      const mapRevision = (await mapOf('violet-array')).revision;
      await publish(population._id, ['violet-moss']);
      const calls = [];
      const failing = async (params) => {
        calls.push(params.revisionCid);
        if (calls.length === 2) throw new Error('The Object Layer authority does not answer');
        return await publishRevision(params);
      };
      expect(await work({ publish: failing })).toBe('objects_publish_failed');
      const stopped = await view(population._id);
      expect(stopped.publication.error).toMatchObject({
        phase: 'publishing_objects',
        message: 'The Object Layer authority does not answer',
        retryable: true,
        revisionCid: calls[1],
      });
      expect(stopped.publication.plan.assets.map(({ status, attempts }) => [status, attempts])).toEqual([
        ['published', 1],
        ['failed', 1],
      ]);
      expect(stopped.publication.plan.assets[0].definitionCid).toBe(stopped.publication.plan.assets[0].revisionCid);
      expect([await boundCid('violet-moss'), await boundCid('ghost-floor')]).toEqual([bindings.moss, bindings.ghost]);
      expect((await mapOf('violet-array')).revision).toBe(mapRevision);

      await retryPublication({ models: all(), id: population._id });
      const resumed = [];
      expect(
        await work({ publish: async (params) => (resumed.push(params.revisionCid), await publishRevision(params)) }),
      ).toBe('completed');
      expect(resumed).toEqual([calls[1]]);
      const done = await view(population._id);
      expect(done.publication.plan.manifestHash).toBe(stopped.publication.plan.manifestHash);
      expect(done.publication.plan.assets.map(({ status, attempts }) => [status, attempts])).toEqual([
        ['published', 1],
        ['published', 2],
      ]);
      for (const { itemId, revisionCid } of stopped.publication.plan.assets)
        expect(await boundCid(itemId)).toBe(revisionCid);
    });

    it('publishes a definition authored by hand exactly as approved, where the definition it replaces names more', async () => {
      const population = await create('violet-hollow');
      const blank = {
        ...definitionOf('violet-skin', 'skin'),
        item: { id: 'violet-skin', type: 'skin', description: '' },
      };
      const authored = await authorTarget({
        models: all(),
        id: population._id,
        itemId: 'violet-skin',
        body: { data: blank, objectLayerRenderFramesData: toWire(square(24)) },
        actor: MODERATOR,
        options: host,
      });
      // The composed path fills the empty description from the bound definition: another definition.
      const draft = await models().ObjectLayer.findByCid(authored.cid);
      const composed = await ObjectLayerEngine.rebuildItemRender({
        models: catalogModels(host),
        objectLayer: draft,
        options: host,
      });
      expect(composed.definition.cid).not.toBe(authored.cid);
      expect(composed.definition.data.item.description).toBe('the violet-skin');

      await publish(population._id);
      expect(await work(), await reasonOf(population._id)).toBe('completed');
      expect(await boundCid('violet-skin')).toBe(authored.cid);
      const { plan } = (await view(population._id)).publication;
      expect(plan.assets.find(({ itemId }) => itemId === 'violet-skin')).toMatchObject({
        kind: 'definition',
        revisionCid: authored.cid,
        definitionCid: authored.cid,
        status: 'published',
        attempts: 1,
        error: null,
      });
      expect((await models().ObjectLayer.findByCid(authored.cid).lean()).data.item.description).toBe('');
      await rebind('violet-skin', cids['violet-skin']);
    });

    it('checks every revision before it publishes one: a revision that does not publish to itself stops it', async () => {
      const population = await create('violet-hollow');
      const fair = await authorTarget({
        models: all(),
        id: population._id,
        itemId: 'violet-skin',
        body: { data: definitionOf('violet-skin', 'skin'), objectLayerRenderFramesData: toWire(square(24)) },
        actor: MODERATOR,
        options: host,
      });
      await models().ObjectLayer.collection.updateOne(
        { cid: fair.cid },
        { $set: { 'data.item.description': 'changed' } },
      );
      const before = await models().ObjectLayer.countDocuments({});
      await publish(population._id);
      expect(await work()).toBe('preflight_failed');
      const stopped = (await view(population._id)).publication;
      expect(stopped.plan).toBeNull();
      expect(stopped.error.problems).toContain(
        `Revision ${fair.cid} of violet-skin does not publish to itself: save it again in the Object Layer Studio`,
      );
      expect(await models().ObjectLayer.countDocuments({})).toBe(before);
      expect(await boundCid('violet-skin')).toBe(cids['violet-skin']);
      await cancelPopulation({ models: all(), id: population._id, actor: MODERATOR });
    });

    it('takes a cancel as a request while a worker holds the publication, and stops at its next checkpoint', async () => {
      const population = await twoAssets();
      const bindings = { moss: await boundCid('violet-moss'), ghost: await boundCid('ghost-floor') };
      await publish(population._id, ['violet-moss']);
      const claimed = await claimPublication({ models: all(), holder: 'worker-c' });
      const published = [];
      let requested;
      const status = await advancePublication({
        models: all(),
        population: claimed,
        holder: 'worker-c',
        options: host,
        refresh: quiet,
        publish: async (params) => {
          published.push(params.revisionCid);
          if (published.length === 1) requested = await cancelPublication({ models: all(), id: population._id });
          return await publishRevision(params);
        },
      });
      expect(requested.publication).toMatchObject({
        status: 'publishing_objects',
        cancelRequestedAt: expect.anything(),
      });
      expect(status).toBe('cancelled_before_commit');
      expect(published).toHaveLength(1);
      const cancelled = (await view(population._id)).publication;
      expect(cancelled).toMatchObject({ status: 'cancelled_before_commit', lease: null });
      expect(cancelled.plan.assets.map(({ status: state }) => state)).toEqual(['published', 'pending']);
      expect([await boundCid('violet-moss'), await boundCid('ghost-floor')]).toEqual([bindings.moss, bindings.ghost]);
      await cancelPopulation({ models: all(), id: population._id, actor: MODERATOR });
    });

    it('fences a worker that lost its lease: it stops, and the next holder finishes on the same manifest', async () => {
      const population = await twoAssets();
      await publish(population._id, ['violet-moss']);
      const claimed = await claimPublication({ models: all(), holder: 'worker-a' });
      const byA = [];
      const stoppedAt = await advancePublication({
        models: all(),
        population: claimed,
        holder: 'worker-a',
        options: host,
        refresh: quiet,
        publish: async (params) => {
          byA.push(params.revisionCid);
          await all().CyberiaProceduralPopulation.updateOne(
            { _id: claimed._id },
            { $set: { 'publication.lease': { holder: 'worker-b', expiresAt: new Date(Date.now() + 60000) } } },
          );
          return await publishRevision(params);
        },
      });
      expect(stoppedAt).toBe('publishing_objects');
      expect(byA).toHaveLength(1);
      const taken = (await view(population._id)).publication;
      expect(taken.plan.assets.map(({ status: state }) => state)).toEqual(['pending', 'pending']);
      const definitions = await models().ObjectLayer.countDocuments({});
      await all().CyberiaProceduralPopulation.updateOne(
        { _id: claimed._id },
        { $set: { 'publication.lease.expiresAt': new Date(0) } },
      );
      expect(await work({}, 'worker-b')).toBe('completed');
      const done = (await view(population._id)).publication;
      expect(done.plan.manifestHash).toBe(taken.plan.manifestHash);
      expect(
        done.plan.assets.every(
          ({ status: state, revisionCid, definitionCid }) => state === 'published' && revisionCid === definitionCid,
        ),
      ).toBe(true);
      expect(await models().ObjectLayer.countDocuments({})).toBe(definitions);
      for (const { itemId, revisionCid } of done.plan.assets) expect(await boundCid(itemId)).toBe(revisionCid);
    });

    it('resumes from the persisted phase when the worker that held it stops', async () => {
      const population = await create('violet-annex');
      await decideAll(population._id);
      await publish(population._id);
      const first = await claimPublication({ models: all(), holder: 'worker-a' });
      await all().CyberiaProceduralPopulation.updateOne(
        { _id: first._id },
        { $set: { 'publication.status': 'publishing_objects', 'publication.lease.expiresAt': new Date(0) } },
      );
      expect(await claimPublication({ models: all(), holder: 'worker-b', now: new Date(0) })).toBeNull();
      await all().CyberiaProceduralPopulation.updateOne(
        { _id: first._id },
        { $set: { 'publication.status': 'preflight' } },
      );
      expect(await work({}, 'worker-b')).toBe('completed');
    });

    it('commits nothing when the map, a binding or a kept binding moved after the preflight', async () => {
      const cases = [
        [
          'the map',
          (code) => all().CyberiaMap.updateOne({ code }, { $inc: { revision: 1 } }),
          'changed after the preflight',
        ],
        [
          'a binding',
          async () => await rebind('violet-stone', await publishItem('violet-other', { render: false, type: 'floor' })),
          'violet-stone',
        ],
        [
          'a kept binding',
          async () => await rebind('hero-skin', await publishItem('hero-other')),
          'hero-skin no longer runs the binding it keeps',
        ],
      ];
      for (const [what, move, message] of cases) {
        const population = await create('violet-annex');
        await addTarget({ models: all(), id: population._id, body: { itemId: 'hero-skin' } });
        await change(population._id, 'violet-stone', { resolution: 'template' });
        await decideAll(population._id);
        const draft = await getDraft(all(), population._id);
        await save(population._id, {
          entities: placed('floor', ['violet-stone'], 2),
          revision: 0,
          baseRevision: draft.mapRevision,
        });
        await publish(population._id);
        const binding = await boundCid('violet-stone');
        const revision = (await mapOf('violet-annex')).revision;
        let moved = false;
        const status = await work({
          publish: async (params) => {
            if (!moved) {
              moved = true;
              await move('violet-annex');
            }
            return await publishRevision(params);
          },
        });
        expect(status, what).toBe('runtime_commit_failed');
        const failed = await view(population._id);
        expect(failed.publication.error.message, what).toContain(message);
        expect((await mapOf('violet-annex')).revision, what).toBe(what === 'the map' ? revision + 1 : revision);
        if (what !== 'a binding') expect(await boundCid('violet-stone'), what).toBe(binding);
        expect(failed.publication.error.retryable, what).toBe(false);
        expect((await rejection(retryPublication({ models: all(), id: population._id }))).status, what).toBe(409);
        const published = failed.publication.plan.assets[0].revisionCid;
        expect(await models().ObjectLayer.exists({ cid: published }), what).not.toBeNull();
        expect((await cancelPublication({ models: all(), id: population._id })).publication.status).toBe(
          'cancelled_before_commit',
        );
        await cancelPopulation({ models: all(), id: population._id, actor: MODERATOR });
      }
    });

    it('stands committed when a game server misses its reload, and converges on a retry', async () => {
      const population = await create('violet-annex');
      await decideAll(population._id);
      const draft = await getDraft(all(), population._id);
      await save(population._id, {
        entities: placed('floor', ['violet-stone'], 3),
        revision: 0,
        baseRevision: draft.mapRevision,
      });
      await publish(population._id);
      const missed = async () => ({
        cache: true,
        previews: 'refreshed',
        servers: [{ instanceCode: 'violet-world', url: 'http://world', error: 'connect ECONNREFUSED' }],
      });
      expect(await work({ refresh: missed })).toBe('published_reload_pending');
      const pending = await view(population._id);
      expect(pending.status).toBe('published');
      expect(pending.publication).toMatchObject({ status: 'published_reload_pending', reloadTries: 1 });
      expect(pending.publication.commit.map).toMatchObject({ from: draft.mapRevision, to: draft.mapRevision + 1 });
      expect((await mapOf('violet-annex')).revision).toBe(draft.mapRevision + 1);
      expect(await claimPublication({ models: all(), holder: 'worker-a' })).toBeNull();
      await retryPublication({ models: all(), id: population._id });
      expect(await work()).toBe('completed');
      expect((await mapOf('violet-annex')).revision).toBe(draft.mapRevision + 1);
    });
  });
});
