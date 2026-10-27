import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { catalogModels } from '../../../src/projects/cyberia/catalog/object-layer-catalog.js';
import { cancelJob } from '../../../src/projects/cyberia/procedural/engine.js';
import { GENERATORS } from '../../../src/projects/cyberia/procedural/generator-registry.js';
import { randomPalette } from '../../../src/projects/cyberia/procedural/palettes/catalog.js';
import {
  SKIN_DEFAULT_PROFILE,
  ensureDefaultProfiles,
} from '../../../src/projects/cyberia/procedural/profiles/registry.js';
import { RANDOM_PALETTE, proceduralConfig } from '../../../src/projects/cyberia/procedural/spec.js';
import { loadSource } from '../../../src/projects/cyberia/procedural/source.js';
import {
  MAX_ATTEMPTS,
  claimNextItem,
  drainQueue,
  persistCandidate,
  runItem,
  validateRevision,
} from '../../../src/projects/cyberia/procedural/jobs/worker.js';
import { migrateJobs } from '../../../src/projects/cyberia/procedural/jobs/migration.js';
import {
  approveItem,
  openForEdit,
  regenerateItem,
  rejectItem,
} from '../../../src/projects/cyberia/procedural/jobs/review.js';
import { promoteJob } from '../../../src/projects/cyberia/procedural/jobs/promotion.js';
import { resolveProceduralContext } from '../../../src/projects/cyberia/procedural/context.js';
import { spriteParameters } from '../../../src/projects/cyberia/procedural/generators/sprite/generator.js';
import { itemSeed } from '../../../src/projects/cyberia/procedural/core/seed.js';
import { framesByDirection, fromWire } from '../../../src/client/components/objectlayer-studio/RenderSource.js';
import {
  candidatePalette,
  paletteSlots,
  templateSlotColors,
} from '../../../src/projects/cyberia/procedural/palettes/resolver.js';
import { genesisTemplates, resolveTemplate } from '../../../src/projects/cyberia/procedural/templates.js';
import { mongodBinary } from '../../support/mongod.js';
import {
  BASELINE_SKIN,
  PALETTES,
  PALETTE_FAMILIES,
  SKIN_TEMPLATE,
  VIOLET_STRATA,
  paletteFixture,
} from '../../support/procedural-content.js';
import {
  actionsOf,
  auditOf,
  cids,
  create,
  createRequest,
  drain,
  host,
  itemOf,
  itemsOf,
  models,
  MODERATOR,
  rebind,
  rejection,
  slotsOf,
  startEngine,
  stopEngine,
  updateRequest,
} from '../../support/procedural-engine.js';

const template = resolveTemplate(SKIN_TEMPLATE);

/** Cancels the waiting items of jobs a test leaves behind, so the worker tests start from an empty queue. */
const settle = (...jobs) =>
  models().CyberiaProceduralJobItem.updateMany(
    { jobId: { $in: jobs.map(({ _id }) => _id) }, status: 'queued' },
    { $set: { status: 'cancelled' } },
  );

describe.skipIf(!mongodBinary)('the Procedural Engine on a real MongoDB', () => {
  beforeAll(() => startEngine(), 60000);
  afterAll(stopEngine);

  describe('procedural profiles and the configuration', () => {
    it('stores a shipped profile once and resolves it by id', async () => {
      const { CyberiaProceduralProfile } = models();
      await ensureDefaultProfiles(models());
      expect(await CyberiaProceduralProfile.countDocuments({ profileId: 'skin-default' })).toBe(1);
      expect(await CyberiaProceduralProfile.resolve('skin-default')).toEqual(SKIN_DEFAULT_PROFILE);
      expect((await rejection(CyberiaProceduralProfile.resolve('rock-default'))).message).toBe(
        'Procedural profile rock-default is not stored',
      );
    });

    it('keeps one stored copy of a profile id: a store removes any other copy of it', async () => {
      const { CyberiaProceduralProfile } = models();
      await CyberiaProceduralProfile.collection.dropIndex('profileId_1');
      await CyberiaProceduralProfile.collection.insertOne({ profileId: 'skin-default', itemType: 'skin', version: 2 });
      expect(await CyberiaProceduralProfile.countDocuments({ profileId: 'skin-default' })).toBe(2);
      await ensureDefaultProfiles(models());
      expect(await CyberiaProceduralProfile.countDocuments({ profileId: 'skin-default' })).toBe(1);
      expect(await CyberiaProceduralProfile.resolve('skin-default')).toEqual(SKIN_DEFAULT_PROFILE);
      await CyberiaProceduralProfile.syncIndexes();
    });

    it('stores a change over the stored profile, and a start writes the shipped profile back', async () => {
      const { CyberiaProceduralProfile } = models();
      const changed = {
        ...SKIN_DEFAULT_PROFILE,
        constraints: { ...SKIN_DEFAULT_PROFILE.constraints, protectedRegions: [] },
      };
      await CyberiaProceduralProfile.register(changed);
      expect(await CyberiaProceduralProfile.countDocuments({ profileId: 'skin-default' })).toBe(1);
      expect((await CyberiaProceduralProfile.resolve('skin-default')).constraints.protectedRegions).toEqual([]);
      expect((await rejection(CyberiaProceduralProfile.register({ ...changed, regionOrder: [] }))).message).toMatch(
        /regionOrder/,
      );
      await ensureDefaultProfiles(models());
      expect(await CyberiaProceduralProfile.resolve('skin-default')).toEqual(SKIN_DEFAULT_PROFILE);
    });

    it('describes what a client needs to build a request: generators, templates, palettes and limits', async () => {
      const config = await proceduralConfig(models());
      expect(config.generators).toEqual([
        {
          id: 'skin-variant',
          itemType: 'skin',
          modes: ['update-existing', 'create-new'],
          profile: {
            profileId: 'skin-default',
            regionOrder: SKIN_DEFAULT_PROFILE.regionOrder,
            protectedRegions: ['torso', 'leftLeg', 'rightLeg'],
          },
        },
        {
          id: 'portal-variant',
          itemType: 'portal',
          modes: ['update-existing', 'create-new'],
          profile: {
            profileId: 'portal-default',
            regionOrder: ['ring', 'swirl', 'depth', 'core'],
            protectedRegions: ['core'],
          },
        },
        {
          id: 'obstacle-variant',
          itemType: 'obstacle',
          modes: ['update-existing', 'create-new'],
          profile: {
            profileId: 'obstacle-default',
            regionOrder: ['dust', 'chunk', 'seam', 'loose'],
            protectedRegions: ['chunk'],
          },
        },
        {
          id: 'floor-tile',
          itemType: 'floor',
          modes: ['update-existing', 'create-new'],
          profile: { profileId: 'floor-default', regionOrder: ['ground', 'patch'], protectedRegions: [] },
        },
      ]);
      const [view, floorView] = config.templates;
      expect(config.templates.map(({ id }) => id)).toEqual([
        'skin.humanoid',
        'floor.terrain',
        'portal.vortex',
        'obstacle.rock-pile',
      ]);
      expect(floorView).toMatchObject({ itemType: 'floor', canvas: { width: 12, height: 12 }, problems: [] });
      expect(framesByDirection(fromWire(floorView.preview))['08']).toHaveLength(1);
      expect(view).toMatchObject({
        id: 'skin.humanoid',
        name: 'Humanoid',
        itemType: 'skin',
        canvas: { width: 25, height: 25 },
        roles: { legs: { regions: ['leftLeg', 'rightLeg'], artDirection: true } },
        slots: paletteSlots(template),
        slotColors: templateSlotColors(template),
        problems: [],
      });
      const preview = framesByDirection(fromWire(view.preview));
      expect(preview['08']).toHaveLength(1);
      expect(preview['02']).toHaveLength(1);
      expect(preview['18']).toHaveLength(2);
      expect(config.palettes.families).toEqual(PALETTE_FAMILIES);
      expect(config.palettes.palettes.map(({ id }) => id).sort()).toEqual(PALETTES.map(({ id }) => id).sort());
      expect(config.limits).toEqual({ maxCandidates: 200 });
    });
  });

  describe('an update job', () => {
    it('refuses what the engine cannot run', async () => {
      const refused = async (overrides) => (await rejection(create(updateRequest(overrides)))).message;
      expect(await refused({ generator: { id: 'rock-variant' } })).toBe('Unknown generator rock-variant');
      expect(await refused({ template: { id: 'floor.terrain' } })).toMatch(
        /^Genesis Template floor.terrain does not fit item base-skin: it draws floor, not skin/,
      );
      expect(await refused({ variation: { level: 2 } })).toMatch(/variation must be/);
      expect(await refused({ parameters: { speed: 1 } })).toMatch(/Unknown sprite variant parameter/);
      expect(await refused({ palette: { items: [{ itemId: 'base-skin', slots: { wing: '#ffffff' } }] } })).toBe(
        'Genesis Template skin.humanoid has no color slot wing',
      );
      expect(await refused({ palette: { items: [{ itemId: 'base-skin', paletteId: 'skin.exotic-teal' }] } })).toBe(
        'There is no palette skin.exotic-teal',
      );
      expect(await refused({ source: { itemIds: ['base-skin', 'iron-sword'] } })).toMatch(
        /one item type: iron-sword is not skin|skin-variant makes skin, not weapon/,
      );
      expect(await refused({ source: { itemIds: ['iron-sword'] } })).toMatch(/no generator for weapon/);
      expect((await rejection(create(updateRequest({ source: { itemIds: ['no-such-item'] } })))).status).toBe(404);
    });

    it('stores the exact spec: generator, template, sources, palettes and seed, and a candidate for each variant', async () => {
      const job = await create(
        updateRequest({
          source: { itemIds: ['base-skin', 'bare-skin'] },
          output: { variantsPerItem: 2 },
          palette: { items: [{ itemId: 'base-skin', slots: slotsOf('exotic-teal') }] },
        }),
      );
      expect(job).toMatchObject({
        status: 'queued',
        generatorId: 'skin-variant',
        proceduralProfileId: 'skin-default',
        rootSeed: 424242,
        createdBy: MODERATOR,
        counts: { queued: 4, running: 0, review: 0 },
      });
      expect(job.spec).toEqual({
        mode: 'update-existing',
        itemType: 'skin',
        generator: { id: 'skin-variant' },
        profile: SKIN_DEFAULT_PROFILE,
        templates: [SKIN_TEMPLATE],
        palette: { items: [{ itemId: 'base-skin', slots: slotsOf('exotic-teal') }] },
        palettes: [],
        sources: [
          ['base-skin', true, 'render'],
          ['bare-skin', false, 'template'],
        ].map(([itemId, hasRender, origin]) => ({
          itemId,
          cid: cids[itemId],
          itemType: 'skin',
          hasRender,
          artDirection: null,
          origin,
          templateId: 'skin.humanoid',
        })),
        candidates: ['base-skin', 'base-skin', 'bare-skin', 'bare-skin'].map((targetItemId, ordinal) => ({
          ordinal,
          targetItemId,
          sourceCid: cids[targetItemId],
          templateId: 'skin.humanoid',
          paletteId: null,
        })),
        output: { variantsPerItem: 2 },
        variation: { level: 0.6 },
        seed: { mode: 'fixed', value: 424242 },
        parameters: (({ variation, ...operators }) => operators)(
          spriteParameters({ variation: 0.6 }, SKIN_DEFAULT_PROFILE),
        ),
      });
      expect(job.generationRunId).toMatch(/^run-[0-9a-f]{16}$/);
      await settle(job);
    });

    it('gives each candidate the item id of its target, its source cid and a seed of its own', async () => {
      const job = await create(updateRequest({ source: { itemIds: ['base-skin', 'violet-skin'] } }));
      const items = await itemsOf(job);
      expect(items.map(({ targetItemId }) => targetItemId)).toEqual([
        'base-skin',
        'base-skin',
        'violet-skin',
        'violet-skin',
      ]);
      expect(items.map(({ sourceCid }) => sourceCid)).toEqual([
        cids['base-skin'],
        cids['base-skin'],
        cids['violet-skin'],
        cids['violet-skin'],
      ]);
      expect(new Set(items.map(({ seed }) => seed)).size).toBe(4);
      expect(items[1].seed).toBe(
        itemSeed({
          rootSeed: 424242,
          sourceCid: cids['base-skin'],
          itemId: 'base-skin',
          ordinal: 1,
          generationRunId: job.generationRunId,
          generatorId: 'skin-variant',
          profileId: 'skin-default',
        }),
      );
      expect(items[0]).toMatchObject({
        status: 'queued',
        paletteId: '',
        templateId: 'skin.humanoid',
        lineage: {
          parentCid: cids['base-skin'],
          parentItemId: '',
          parentRevision: null,
          generationRunId: job.generationRunId,
        },
        revisions: [],
      });
      expect(await actionsOf({ jobId: job._id })).toEqual(['job.created']);
      await settle(job);
    });

    it('takes an item with no render as a target', async () => {
      const job = await create(updateRequest({ source: { itemIds: ['bare-skin'] }, output: { variantsPerItem: 1 } }));
      expect(job.spec.sources).toMatchObject([{ itemId: 'bare-skin', hasRender: false }]);
      await settle(job);
    });

    it('answers an equal spec with the same job and never doubles its items', async () => {
      const first = await create(updateRequest());
      const again = await create(updateRequest());
      expect(String(again._id)).toBe(String(first._id));
      expect(await models().CyberiaProceduralJob.countDocuments({ requestFingerprint: first.requestFingerprint })).toBe(
        1,
      );
      expect(await itemsOf(first)).toHaveLength(2);
      expect(await actionsOf({ jobId: first._id })).toEqual(['job.created']);
    });

    it('completes a job whose items were stored only in part when the request comes again', async () => {
      const job = await create(updateRequest({ output: { variantsPerItem: 3 } }));
      await models().CyberiaProceduralJobItem.deleteOne({ jobId: job._id, ordinal: 2 });
      expect(await itemsOf(job)).toHaveLength(2);
      await create(updateRequest({ output: { variantsPerItem: 3 } }));
      expect((await itemsOf(job)).map(({ ordinal }) => ordinal)).toEqual([0, 1, 2]);
      expect((await models().CyberiaProceduralJob.findById(job._id).lean()).counts.queued).toBe(3);
      await settle(job);
    });

    it('takes a new random seed for each auto request and stores it', async () => {
      const [first, second] = [
        await create(updateRequest({ seed: { mode: 'auto' }, output: { variantsPerItem: 1 } })),
        await create(updateRequest({ seed: { mode: 'auto' }, output: { variantsPerItem: 1 } })),
      ];
      expect(first.spec.seed.mode).toBe('auto');
      expect(first.rootSeed).toBe(first.spec.seed.value);
      expect(Number.isInteger(first.rootSeed) && first.rootSeed >= 0 && first.rootSeed < 2 ** 32).toBe(true);
      expect(String(second._id)).not.toBe(String(first._id));
      await settle(first, second);
    });

    it('reads the art direction of each item from the content foundation: its art brief and its biome palettes', async () => {
      const job = await create(
        updateRequest({
          source: { itemIds: ['aether-agent', 'ash-raider', 'violet-skin'] },
          output: { variantsPerItem: 1 },
        }),
      );
      const [aether, ash, violet] = job.spec.sources;
      expect(aether).toMatchObject({ itemId: 'aether-agent', hasRender: true });
      expect(aether.artDirection.palettes).toEqual([
        {
          id: 'skin.aether-agent',
          name: 'aether-agent',
          group: 'foundation',
          roles: { base: ['#000000', '#2a2a2a', '#eeeeee', '#350035', '#420042'] },
        },
      ]);
      expect(ash).toMatchObject({ itemId: 'ash-raider', hasRender: false });
      expect(ash.artDirection.palettes[0].roles.base).toContain('#c0c0c0');
      expect(violet.artDirection).toMatchObject({
        brief: null,
        palettes: [{ id: VIOLET_STRATA.id, group: 'biome', roles: VIOLET_STRATA.palette }],
      });
      await settle(job);
    });
  });

  describe('a create job', () => {
    it('refuses a source, and what the engine cannot run', async () => {
      const refused = async (overrides) => (await rejection(create(createRequest(overrides)))).message;
      expect(await refused({ source: { itemIds: ['base-skin'] } })).toMatch(/does not take source/);
      expect(await refused({ itemType: 'weapon' })).toMatch(/no generator for weapon/);
      expect(await refused({ itemType: undefined })).toMatch(/does not take|needs an itemType/);
      expect(await refused({ template: { id: 'skin.winged' } })).toBe('There is no Genesis Template skin.winged');
      expect(await refused({ template: { id: 'skin.humanoid', version: 2 } })).toMatch(
        /template does not take version/,
      );
      expect(await refused({ palette: { paletteId: 'nothing' } })).toBe('There is no palette nothing');
      expect(await refused({ palette: { slots: { wing: '#ffffff' } } })).toMatch(/no color slot wing/);
      expect(await refused({ output: { variants: 201, itemIdPrefix: 'many' } })).toMatch(/from 1 to 200/);
      expect(await refused({ seed: { mode: 'fixed', value: -1 } })).toMatch(/seed is/);
    });

    it('stores a spec with no source: the template, the baseline function, a palette for each proposed item and its new item ids', async () => {
      const job = await create(createRequest({ output: { variants: 3, itemIdPrefix: 'new-skin' } }));
      expect(job.spec).toMatchObject({
        mode: 'create-new',
        itemType: 'skin',
        profile: SKIN_DEFAULT_PROFILE,
        templates: [SKIN_TEMPLATE],
        palette: { paletteId: RANDOM_PALETTE, slots: {} },
        baseline: { itemId: 'drifter', activable: true, stats: BASELINE_SKIN.payload.data.stats },
        sources: [],
        output: { variants: 3, itemIdPrefix: 'new-skin' },
        seed: { mode: 'fixed', value: 424242 },
      });
      expect(job.spec.candidates.map(({ targetItemId }) => targetItemId)).toEqual([
        'new-skin-001',
        'new-skin-002',
        'new-skin-003',
      ]);
      expect(job.spec.candidates.every(({ sourceCid }) => sourceCid === '')).toBe(true);
      expect(job.spec.candidates.map(({ paletteId }) => paletteId)).toEqual(
        ['new-skin-001', 'new-skin-002', 'new-skin-003'].map(
          (itemId) => randomPalette({ template, rootSeed: 424242, itemId }).id,
        ),
      );
      expect(job.spec.palettes.map(({ id }) => id).sort()).toEqual(
        [...new Set(job.spec.candidates.map(({ paletteId }) => paletteId))].sort(),
      );
      const items = await itemsOf(job);
      expect(items[0]).toMatchObject({
        status: 'queued',
        targetItemId: 'new-skin-001',
        sourceCid: '',
        templateId: 'skin.humanoid',
        lineage: { parentCid: '', parentItemId: '', parentRevision: null },
      });
      expect(items.map(({ paletteId }) => paletteId)).toEqual(job.spec.candidates.map(({ paletteId }) => paletteId));
      await settle(job);
    });

    it('takes the first usable template of the item type when the request names none, and one palette', async () => {
      const { template: named, ...request } = createRequest({
        output: { variants: 2, itemIdPrefix: 'plain-skin' },
        palette: { paletteId: 'exotic-teal', slots: { 'hair.base': '#AA00AA' } },
      });
      const job = await create(request);
      expect(job.spec.templates).toEqual([SKIN_TEMPLATE]);
      expect(job.spec.palette).toEqual({ paletteId: 'exotic-teal', slots: { 'hair.base': '#aa00aa' } });
      expect(job.spec.palettes).toEqual([paletteFixture('exotic-teal')]);
      expect(job.spec.candidates).toMatchObject([{ paletteId: 'exotic-teal' }, { paletteId: 'exotic-teal' }]);
      await settle(job);
    });

    it('takes the defaults of the template when no palette is named: no candidate takes a palette', async () => {
      const { palette, ...request } = createRequest({ output: { variants: 1, itemIdPrefix: 'default-palette' } });
      const job = await create(request);
      expect(job.spec.palette).toEqual({ slots: {} });
      expect(job.spec.palettes).toEqual([]);
      expect(job.spec.candidates).toMatchObject([{ paletteId: null }]);
      await settle(job);
    });

    it('refuses another spec that would take the item ids of a live generation', async () => {
      const first = await create(createRequest({ output: { variants: 1, itemIdPrefix: 'live-skin' } }));
      const error = await rejection(
        create(
          createRequest({ output: { variants: 1, itemIdPrefix: 'live-skin' }, seed: { mode: 'fixed', value: 1 } }),
        ),
      );
      expect(error.status).toBe(409);
      await settle(first);
    });

    it('refuses an item id a definition already runs', async () => {
      await rebind('bound-001', cids['base-skin']);
      const error = await rejection(create(createRequest({ output: { variants: 1, itemIdPrefix: 'bound' } })));
      expect(error).toMatchObject({ status: 409, message: 'Item bound-001 already runs a definition' });
    });
  });

  describe('the background worker', () => {
    let job;
    beforeAll(() =>
      models().CyberiaProceduralJobItem.updateMany({ status: 'queued' }, { $set: { status: 'cancelled' } }),
    );

    it('runs an update to review, storing every result as a draft of its target item and binding nothing', async () => {
      job = await create(
        updateRequest({ source: { itemIds: ['base-skin', 'bare-skin'] }, seed: { mode: 'fixed', value: 5 } }),
      );
      expect(await drain()).toBe(4);
      const items = await itemsOf(job);
      expect(items.map(({ status }) => status)).toEqual(['review', 'review', 'review', 'review']);
      for (const item of items) {
        expect(item).toMatchObject({ revision: 0, attempt: 1, validation: { ok: true, problems: [] } });
        expect(item.generatedCid).toBe(item.candidateCid);
        expect(item.revisions).toMatchObject([
          { revision: 0, cid: item.candidateCid, kind: 'generated', parentCid: item.sourceCid },
        ]);
        expect(item.metrics).toMatchObject({ directions: 8, frames: 12 });
        expect(item.diversity.score).toBeGreaterThanOrEqual(job.spec.parameters.minDiversity);
        expect(item.signature.palette).toHaveLength(8);
        const draft = await models().ObjectLayer.findByCid(item.candidateCid).lean();
        expect(draft).toMatchObject({ origin: 'draft', published: false });
        expect(draft.data.item).toMatchObject({ id: item.targetItemId, type: 'skin' });
        expect(draft.data.render.cid).toMatch(/^bafkrei/);
        expect(await models().ObjectLayerRenderFrames.countDocuments({ objectLayerCid: item.candidateCid })).toBe(1);
      }
      expect(new Set(items.map(({ candidateCid }) => candidateCid)).size).toBe(4);
      expect(await models().CyberiaItemCatalog.findOne({ itemId: 'base-skin' }).lean()).toMatchObject({
        objectLayerCid: cids['base-skin'],
      });
      expect(await models().CyberiaItemCatalog.findOne({ itemId: 'bare-skin' }).lean()).toMatchObject({
        objectLayerCid: cids['bare-skin'],
      });
    });

    it('keeps the definition of the target in each candidate: its type, activation, description and stats', async () => {
      for (const item of await itemsOf(job)) {
        const { data } = await models().ObjectLayer.findByCid(item.candidateCid).lean();
        expect(data.item).toEqual({
          id: item.targetItemId,
          type: 'skin',
          description: `the ${item.targetItemId}`,
          activable: true,
        });
        expect(data.stats).toMatchObject({ effect: 1, agility: 4 });
      }
    });

    it('moves the job to completed with its persisted counts and audits the run', async () => {
      const stored = await models().CyberiaProceduralJob.findById(job._id).lean();
      expect(stored).toMatchObject({ status: 'completed', counts: { review: 4, queued: 0, running: 0 } });
      expect(stored.startedAt).toBeInstanceOf(Date);
      expect(stored.finishedAt).toBeInstanceOf(Date);
      expect(await actionsOf({ jobId: job._id, jobItemId: null })).toEqual([
        'job.created',
        'job.started',
        'job.completed',
      ]);
      expect(await models().CyberiaProceduralAudit.countDocuments({ jobId: job._id, action: 'item.generated' })).toBe(
        4,
      );
    });

    it('differs the candidates of one target from one another and from its source by the least diversity', async () => {
      const items = await itemsOf(job);
      expect(items.every(({ diversity }) => diversity.score >= job.spec.parameters.minDiversity)).toBe(true);
      expect(items[0].diversity.nearest).toBe('source');
      expect(items[1].diversity.nearest).toMatch(/^source$|^base-skin#0$/);
      expect(items[3].diversity.nearest).toMatch(/^source$|^bare-skin#2$/);
    });

    it('reproduces a candidate and its cid from the stored spec and the seed its revision records', async () => {
      const second = (await itemsOf(job))[1];
      const generator = GENERATORS['skin-variant'];
      const entry = job.spec.sources[0];
      const context = resolveProceduralContext({
        source: await loadSource(models(), entry.cid),
        template,
        profile: job.spec.profile,
        artDirection: entry.artDirection,
      });
      const result = generator.generate(generator.prepare(context), {
        itemId: second.targetItemId,
        seed: second.revisions[0].seed,
        parameters: { ...job.spec.parameters, minDiversity: 0 },
        palette: candidatePalette(template, { artDirection: entry.artDirection }),
      });
      const again = await persistCandidate({
        models: catalogModels(host),
        result,
        createdBy: MODERATOR,
        options: host,
      });
      expect(again.cid).toBe(second.candidateCid);
    });

    it('colors the candidates of each item with the palette choice of that item, over its foundation palette', async () => {
      const painted = await create(
        updateRequest({
          source: { itemIds: ['base-skin', 'violet-skin'] },
          output: { variantsPerItem: 1 },
          palette: {
            items: [
              { itemId: 'base-skin', paletteId: 'exotic-teal' },
              { itemId: 'violet-skin', slots: { 'legs.base': '#0000ff' } },
            ],
          },
          seed: { mode: 'fixed', value: 6 },
        }),
      );
      expect(painted.spec.palettes).toEqual([paletteFixture('exotic-teal')]);
      await drain();
      const [teal, violet] = await itemsOf(painted);
      expect([teal, violet].map(({ status, paletteId }) => [status, paletteId])).toEqual([
        ['review', 'exotic-teal'],
        ['review', ''],
      ]);
      const colorsOf = async ({ candidateCid }) =>
        models()
          .ObjectLayerRenderFrames.sourceOf(
            await models().ObjectLayerRenderFrames.findOne({ objectLayerCid: candidateCid }).lean(),
          )
          .palette.map((color) => color.slice(0, 7));
      const roles = paletteFixture('exotic-teal').roles;
      expect(await colorsOf(teal)).toEqual(expect.arrayContaining([roles.primary, roles.detail]));
      const violetColors = await colorsOf(violet);
      expect(violetColors).toEqual(expect.arrayContaining(['#2f5a34', '#0000ff']));
      expect(violetColors).not.toContain(roles.primary);
    });

    it('draws a created item from its Genesis Template with the baseline function, an empty description and its proposed id', async () => {
      const made = await create(createRequest({ output: { variants: 2, itemIdPrefix: 'made-skin' } }));
      await drain();
      const items = await itemsOf(made);
      expect(items.map(({ status }) => status)).toEqual(['review', 'review']);
      for (const item of items) {
        const { data } = await models().ObjectLayer.findByCid(item.candidateCid).lean();
        expect(data.item).toEqual({ id: item.targetItemId, type: 'skin', description: '', activable: true });
        expect(data.stats).toEqual(BASELINE_SKIN.payload.data.stats);
        expect(item.metrics).toMatchObject({ directions: 8, frames: 12 });
        expect(item.revisions[0]).toMatchObject({ kind: 'generated', parentCid: '' });
        expect(await models().CyberiaItemCatalog.countDocuments({ itemId: item.targetItemId })).toBe(0);
      }
      expect(items[1].diversity.nearest).toMatch(/^source$|^made-skin-001#0$/);
      const palettes = made.spec.candidates.map(({ paletteId }) => paletteId);
      expect(items.map(({ paletteId }) => paletteId)).toEqual(palettes);
    });

    it('builds a no-render candidate from the template and the art direction palette', async () => {
      const bare = await create(
        updateRequest({
          source: { itemIds: ['bare-skin'] },
          output: { variantsPerItem: 1 },
          seed: { mode: 'fixed', value: 9 },
        }),
      );
      await drain();
      const [item] = await itemsOf(bare);
      expect(item).toMatchObject({ status: 'review', paletteId: '' });
      expect(item.metrics).toMatchObject({ directions: 8, frames: 12 });
    });

    it('colors an item from its art direction, as a render or from the template', async () => {
      const art = await create(
        updateRequest({
          source: { itemIds: ['aether-agent', 'ash-raider'] },
          output: { variantsPerItem: 1 },
          variation: { level: 0 },
          seed: { mode: 'fixed', value: 8 },
        }),
      );
      await drain();
      const items = await itemsOf(art);
      expect(items.map(({ status }) => status)).toEqual(['review', 'review']);
      for (const [index, item] of items.entries()) {
        const stored = await models().ObjectLayerRenderFrames.findOne({ objectLayerCid: item.candidateCid }).lean();
        const colors = new Set(
          models()
            .ObjectLayerRenderFrames.sourceOf(stored)
            .palette.map((c) => c.slice(0, 7)),
        );
        const [first] = art.spec.sources[index].artDirection.palettes[0].roles.base;
        expect(colors.has(first)).toBe(true);
      }
    });

    it('runs nothing when the queue is empty', async () => {
      expect(await drain()).toBe(0);
    });

    it('queues an item again after a failed run and fails it after the last attempt', async () => {
      const retried = await create(createRequest({ output: { variants: 1, itemIdPrefix: 'retry-skin' } }));
      let calls = 0;
      const flaky = (args) => {
        if (++calls < MAX_ATTEMPTS) throw new Error('disk is busy');
        return persistCandidate(args);
      };
      await drain({ persist: flaky });
      const [item] = await itemsOf(retried);
      expect(item).toMatchObject({ status: 'review', attempt: MAX_ATTEMPTS, revision: 0 });
      expect(calls).toBe(MAX_ATTEMPTS);

      const broken = await create(createRequest({ output: { variants: 1, itemIdPrefix: 'broken-skin' } }));
      await drain({
        persist: () => {
          throw new Error('disk is gone');
        },
      });
      const [failed] = await itemsOf(broken);
      expect(failed).toMatchObject({
        status: 'failed',
        attempt: MAX_ATTEMPTS,
        error: { message: 'disk is gone', retryable: true },
      });
      expect((await models().CyberiaProceduralJob.findById(broken._id).lean()).status).toBe('completed');
      expect((await models().CyberiaProceduralJob.findById(broken._id).lean()).counts.failed).toBe(1);
    });

    it('fails a candidate whose stored result is not a sound Object Layer, and audits it', async () => {
      const unsound = await create(createRequest({ output: { variants: 1, itemIdPrefix: 'unsound-skin' } }));
      await drain({
        persist: async ({ result, models: bag }) =>
          bag.ObjectLayer.upsertByIdentity(
            { profile: { id: 'cyberia', version: 2 }, data: { ...result.data, render: { cid: '', metadataCid: '' } } },
            { origin: 'draft' },
          ),
      });
      const [item] = await itemsOf(unsound);
      expect(item).toMatchObject({ status: 'failed', error: { retryable: false } });
      expect(item.validation.problems).toEqual(['it names no render', 'its render frames are not stored']);
      const [event] = (await auditOf({ jobItemId: item._id })).filter(
        ({ action }) => action === 'item.validation_failed',
      );
      expect(event).toMatchObject({ newCid: item.candidateCid, reason: item.validation.problems.join('; ') });
    });

    it('fails a job at once when this process does not run its generator', async () => {
      const gone = await create(createRequest({ output: { variants: 1, itemIdPrefix: 'gone-generator' } }));
      await models().CyberiaProceduralJob.collection.updateOne(
        { _id: gone._id },
        { $set: { 'spec.generator.id': 'gone-variant' } },
      );
      await drain();
      const [item] = await itemsOf(gone);
      expect(item).toMatchObject({ status: 'failed', attempt: 1, error: { retryable: false } });
      expect(item.error.message).toBe('Generator gone-variant is not available');
    });
  });

  describe('claims and leases', () => {
    const T0 = new Date('2030-01-01T00:00:00Z');
    const later = (ms) => new Date(T0.getTime() + ms);
    let job;

    it('leases an item to one worker, and the item after it waits for it', async () => {
      job = await create(createRequest({ output: { variants: 2, itemIdPrefix: 'lease-skin' } }));
      const claims = await Promise.all(
        ['a', 'b', 'c'].map((holder) => claimNextItem({ models: models(), holder, now: T0, leaseMs: 1000 })),
      );
      const held = claims.filter(Boolean);
      expect(held).toHaveLength(1);
      expect(held[0]).toMatchObject({ targetItemId: 'lease-skin-001', status: 'running', attempt: 1 });
      expect(held[0].lease.expiresAt).toEqual(later(1000));
    });

    it('gives an item whose lease expired to another worker, and ignores the first worker afterwards', async () => {
      const [first] = await itemsOf(job);
      expect(await claimNextItem({ models: models(), holder: 'd', now: later(500) })).toBeNull();
      const reclaimed = await claimNextItem({ models: models(), holder: 'd', now: later(2000), leaseMs: 1000 });
      expect(reclaimed).toMatchObject({ targetItemId: first.targetItemId, attempt: 2, lease: { holder: 'd' } });

      const stale = await itemOf(first._id);
      await runItem({
        models: models(),
        item: { ...stale, attempt: 1 },
        holder: 'a',
        options: host,
        persist: persistCandidate,
      });
      expect(await itemOf(first._id)).toMatchObject({ status: 'running', lease: { holder: 'd' }, candidateCid: '' });
    });

    it('fails an item whose lease expires on its last attempt, and then lets the next item run', async () => {
      const [first, second] = await itemsOf(job);
      await models().CyberiaProceduralJobItem.updateOne({ _id: first._id }, { $set: { attempt: MAX_ATTEMPTS } });
      const next = await claimNextItem({ models: models(), holder: 'e', now: later(9000) });
      expect(await itemOf(first._id)).toMatchObject({
        status: 'failed',
        error: { message: 'The lease expired on the last attempt', retryable: true },
      });
      expect(next).toMatchObject({ targetItemId: second.targetItemId, attempt: 1 });
      await models().CyberiaProceduralJobItem.updateOne({ _id: second._id }, { $set: { status: 'cancelled' } });
    });

    it('runs the items of a job in order, one at a time, and the jobs side by side', async () => {
      const [left, right] = [
        await create(
          createRequest({ output: { variants: 4, itemIdPrefix: 'left-skin' }, seed: { mode: 'fixed', value: 31 } }),
        ),
        await create(
          createRequest({ output: { variants: 4, itemIdPrefix: 'right-skin' }, seed: { mode: 'fixed', value: 32 } }),
        ),
      ];
      const running = { left: 0, right: 0 };
      const peak = { left: 0, right: 0, both: 0 };
      const watched = async (args) => {
        const side = args.result.data.item.id.startsWith('left') ? 'left' : 'right';
        running[side]++;
        peak[side] = Math.max(peak[side], running[side]);
        peak.both = Math.max(peak.both, running.left + running.right);
        await new Promise((resolve) => setTimeout(resolve, 25));
        try {
          return await persistCandidate(args);
        } finally {
          running[side]--;
        }
      };
      const runs = await Promise.all([
        drainQueue({ models: models(), options: host, holder: 'one', concurrency: 2, persist: watched }),
        drainQueue({ models: models(), options: host, holder: 'two', concurrency: 1, persist: watched }),
      ]);
      expect(runs.reduce((sum, count) => sum + count, 0)).toBe(8);
      expect([peak.left, peak.right]).toEqual([1, 1]);
      expect(peak.both).toBe(2);
      for (const run of [left, right]) {
        expect((await itemsOf(run)).map(({ status, attempt }) => [status, attempt])).toEqual(
          Array(4).fill(['review', 1]),
        );
        const generated = await auditOf({ jobId: run._id, action: 'item.generated' });
        const ordinals = Object.fromEntries((await itemsOf(run)).map(({ _id, ordinal }) => [String(_id), ordinal]));
        expect(generated.map(({ jobItemId }) => ordinals[String(jobItemId)])).toEqual([0, 1, 2, 3]);
      }
    });

    it('differs a candidate from the siblings before it: the signature of each is stored for the next', async () => {
      const [run] = await models().CyberiaProceduralJob.find({ 'spec.output.itemIdPrefix': 'left-skin' }).lean();
      const items = await itemsOf(run);
      expect(items.every(({ signature }) => signature !== null)).toBe(true);
      const nearest = items.slice(1).map(({ diversity }) => diversity.nearest);
      expect(nearest.every((id) => /^source$|^left-skin-00\d#\d$/.test(id))).toBe(true);
    });
  });

  describe('cancellation', () => {
    it('cancels the waiting items of a job and then refuses to regenerate or cancel again', async () => {
      const job = await create(createRequest({ output: { variants: 2, itemIdPrefix: 'cancel-skin' } }));
      const cancelled = await cancelJob({ models: models(), jobId: job._id, actor: MODERATOR, reason: 'wrong seed' });
      expect(cancelled).toMatchObject({ status: 'cancelled', counts: { cancelled: 2, queued: 0 } });
      expect(await drain()).toBe(0);
      expect(await actionsOf({ jobId: job._id })).toEqual(['job.created', 'job.cancelled']);
      expect((await rejection(cancelJob({ models: models(), jobId: job._id, actor: MODERATOR }))).status).toBe(409);
      const [item] = await itemsOf(job);
      expect(
        (await rejection(regenerateItem({ models: models(), jobId: job._id, id: item._id, actor: MODERATOR }))).status,
      ).toBe(409);
      expect(
        (await rejection(cancelJob({ models: models(), jobId: '64b0000000000000000000ff', actor: MODERATOR }))).status,
      ).toBe(404);
    });

    it('purges the result of a candidate cancelled while it ran: it leaves no draft', async () => {
      const job = await create(createRequest({ output: { variants: 1, itemIdPrefix: 'late-run' } }));
      const cancelling = async (args) => {
        await cancelJob({ models: models(), jobId: job._id, actor: MODERATOR });
        return await persistCandidate(args);
      };
      await drain({ persist: cancelling });
      const [item] = await itemsOf(job);
      expect(item).toMatchObject({ status: 'cancelled', candidateCid: '' });
      expect(await models().ObjectLayer.countDocuments({ 'data.item.id': 'late-run-001' })).toBe(0);
    });

    it('cancels the candidates still under review, keeps what is decided and deletes nothing', async () => {
      const job = await create(
        createRequest({ output: { variants: 2, itemIdPrefix: 'late-cancel' }, seed: { mode: 'fixed', value: 61 } }),
      );
      await drain();
      const [decided, undecided] = await itemsOf(job);
      const ctx = { models: models(), jobId: job._id, actor: MODERATOR };
      await approveItem({ ...ctx, id: decided._id, cid: decided.candidateCid });
      const cancelled = await cancelJob({ ...ctx, reason: 'enough' });
      expect(cancelled.counts).toMatchObject({ approved: 1, cancelled: 1, review: 0 });
      expect((await itemOf(undecided._id)).status).toBe('cancelled');
      expect((await itemOf(decided._id)).status).toBe('approved');
      expect(await models().ObjectLayer.countDocuments({ cid: undecided.candidateCid })).toBe(1);
      for (const decide of [approveItem, rejectItem, regenerateItem, openForEdit])
        expect((await rejection(decide({ ...ctx, id: undecided._id, cid: undecided.candidateCid }))).status).toBe(409);
      expect((await promoteJob({ ...ctx, options: host })).promoted).toEqual(['late-cancel-001']);
      expect((await rejection(cancelJob(ctx))).status).toBe(409);
    });
  });
  describe('a job spec stored before the global palettes', () => {
    /** The spec as the engine stored it before: no palette role on the template roles, `skin.` palette ids, colors by template role. */
    const earlier = (spec) => {
      const takes = Object.fromEntries(
        spec.templates.flatMap(({ roles }) => Object.entries(roles).map(([role, { palette }]) => [palette, role])),
      );
      const old = (id) => (id && id !== RANDOM_PALETTE ? `skin.${id}` : id);
      return {
        ...spec,
        templates: spec.templates.map((stored) => ({
          ...stored,
          roles: Object.fromEntries(Object.entries(stored.roles).map(([role, { palette, ...rest }]) => [role, rest])),
        })),
        palettes: spec.palettes.map(({ id, roles, constraints, ...rest }) => ({
          ...rest,
          id: old(id),
          itemType: 'skin',
          roles: Object.fromEntries(Object.entries(roles).map(([role, color]) => [takes[role] ?? role, color])),
          constraints: { ...constraints, contrastRoles: constraints.contrastRoles.map((role) => takes[role]) },
        })),
        palette: { ...spec.palette, paletteId: old(spec.palette.paletteId) },
        candidates: spec.candidates.map((candidate) => ({ ...candidate, paletteId: old(candidate.paletteId) })),
      };
    };
    const store = async (job, spec) => {
      await models().CyberiaProceduralJob.collection.updateOne({ _id: job._id }, { $set: { spec } });
      await models().CyberiaProceduralJobItem.collection.updateMany(
        { jobId: job._id, paletteId: { $ne: '' } },
        { $set: { paletteId: `skin.${job.spec.palette.paletteId}` } },
      );
    };

    it('moves it with the same colors, seeds and run, waits for a job that generates, and reports what content cannot map', async () => {
      const request = (prefix, value) =>
        createRequest({
          palette: { paletteId: 'exotic-teal', slots: { 'hair.base': '#aa00aa' } },
          output: { variants: 2, itemIdPrefix: prefix },
          seed: { mode: 'fixed', value },
        });
      const settled = await create(request('teal-before', 71));
      await drain();
      const waiting = await create(request('teal-waiting', 72));
      const unknown = await create(request('teal-unknown', 73));
      await drain();
      const current = (await models().CyberiaProceduralJob.findById(settled._id).lean()).spec;
      const items = await itemsOf(settled);
      await store(settled, earlier(current));
      await store(waiting, earlier(waiting.spec));
      await models().CyberiaProceduralJobItem.updateMany({ jobId: waiting._id }, { $set: { status: 'queued' } });
      const lost = earlier(unknown.spec);
      await store(unknown, { ...lost, templates: lost.templates.map((stored) => ({ ...stored, id: 'skin.lost' })) });
      const stored = await models().CyberiaProceduralJob.find({}).sort({ _id: 1 }).lean();

      const dry = await migrateJobs(models(), { apply: false, templates: genesisTemplates() });
      expect(dry.migrated).toEqual([
        { id: String(settled._id), palettes: [{ from: 'skin.exotic-teal', to: 'exotic-teal' }] },
      ]);
      expect(dry.generating.map(({ id }) => id)).toEqual([String(waiting._id)]);
      expect(dry.unresolved).toEqual([
        {
          id: String(unknown._id),
          problems: expect.arrayContaining(['Genesis Template skin.lost: the content gives role hair no palette role']),
        },
      ]);
      expect(await models().CyberiaProceduralJob.find({}).sort({ _id: 1 }).lean()).toEqual(stored);

      const applied = await migrateJobs(models(), { apply: true, templates: genesisTemplates() });
      expect(applied.migrated.map(({ id }) => id)).toEqual([String(settled._id)]);
      const moved = await models().CyberiaProceduralJob.findById(settled._id).lean();
      expect(moved.spec).toEqual(current);
      expect([moved.requestFingerprint, moved.generationRunId]).toEqual([
        settled.requestFingerprint,
        settled.generationRunId,
      ]);
      const after = await itemsOf(settled);
      expect(after.map(({ paletteId, seed, candidateCid }) => [paletteId, seed, candidateCid])).toEqual(
        items.map(({ seed, candidateCid }) => ['exotic-teal', seed, candidateCid]),
      );
      for (const item of after)
        expect(
          await validateRevision({ models: models(), cid: item.candidateCid, item, spec: moved.spec }),
        ).toMatchObject({
          ok: true,
        });
      expect((await models().CyberiaProceduralJob.findById(waiting._id).lean()).spec).toEqual(earlier(waiting.spec));
      expect((await migrateJobs(models(), { apply: true, templates: genesisTemplates() })).migrated).toEqual([]);
      await settle(waiting);
    });
  });
});
