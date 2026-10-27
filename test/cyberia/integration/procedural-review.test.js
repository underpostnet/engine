import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { catalogModels } from '../../../src/projects/cyberia/catalog/object-layer-catalog.js';
import { DataBaseProviderService } from '../../../src/db/DataBaseProvider.js';
import { ObjectLayerEngine } from '../../../src/projects/cyberia/object-layer/object-layer.js';
import { cancelJob, deleteJob } from '../../../src/projects/cyberia/procedural/engine.js';
import { GENERATORS } from '../../../src/projects/cyberia/procedural/generator-registry.js';
import { promoteItem, promoteJob } from '../../../src/projects/cyberia/procedural/jobs/promotion.js';
import {
  approveItem,
  itemProvenance,
  openForEdit,
  regenerateItem,
  rejectItem,
  saveRevision,
} from '../../../src/projects/cyberia/procedural/jobs/review.js';
import { persistCandidate } from '../../../src/projects/cyberia/procedural/jobs/worker.js';
import { resolveProceduralContext } from '../../../src/projects/cyberia/procedural/context.js';
import { candidatePalette } from '../../../src/projects/cyberia/procedural/palettes/resolver.js';
import { baselineSource } from '../../../src/projects/cyberia/procedural/source.js';
import { specPalette, specTemplate } from '../../../src/projects/cyberia/procedural/spec.js';
import { regenerationSeed } from '../../../src/projects/cyberia/procedural/core/seed.js';
import { mongodBinary } from '../../support/mongod.js';
import {
  actionsOf,
  auditOf,
  boundCid,
  cids,
  create,
  createRequest,
  drain,
  edited,
  host,
  itemOf,
  itemsOf,
  models,
  MODERATOR,
  rebind,
  rejection,
  startEngine,
  stopEngine,
  updateRequest,
} from '../../support/procedural-engine.js';

describe.skipIf(!mongodBinary)('human review and promotion on a real MongoDB', () => {
  beforeAll(() => startEngine(), 60000);
  afterAll(stopEngine);

  describe('human review of a create run', () => {
    let job;
    let first;
    let second;
    let third;
    const ctx = () => ({ models: models(), jobId: job._id, actor: MODERATOR });

    it('starts from generated candidates in review', async () => {
      job = await create(
        createRequest({ output: { variants: 3, itemIdPrefix: 'review-skin' }, seed: { mode: 'fixed', value: 99 } }),
      );
      await drain();
      [first, second, third] = await itemsOf(job);
      expect([first, second, third].map(({ status }) => status)).toEqual(['review', 'review', 'review']);
    });

    it('opens a candidate for edit and records it', async () => {
      const context = await openForEdit({ ...ctx(), id: first._id });
      expect(context).toEqual({
        generationRunId: job.generationRunId,
        jobId: String(job._id),
        jobItemId: String(first._id),
        targetItemId: 'review-skin-001',
        candidateCid: first.candidateCid,
        candidateRevision: 0,
      });
      expect((await itemOf(first._id)).status).toBe('editing');
      expect((await auditOf({ jobItemId: first._id })).at(-1)).toMatchObject({
        action: 'item.opened_for_edit',
        actor: MODERATOR,
        previousCid: first.candidateCid,
        newCid: first.candidateCid,
      });
    });

    it('stores a manual save as a new revision, keeps the generated one and returns to review', async () => {
      const body = await edited(first, { x: 10, y: 6, color: [255, 0, 0, 255] });
      const definition = await saveRevision({ ...ctx(), id: first._id, body, options: host });
      expect(definition.cid).not.toBe(first.candidateCid);
      expect(definition.origin).toBe('draft');
      const item = await itemOf(first._id);
      expect(item).toMatchObject({
        status: 'review',
        revision: 1,
        candidateCid: definition.cid,
        generatedCid: first.candidateCid,
        validation: { ok: true },
      });
      expect(item.revisions).toMatchObject([
        { revision: 0, cid: first.candidateCid, kind: 'generated' },
        { revision: 1, cid: definition.cid, kind: 'edited', parentCid: first.candidateCid, actor: MODERATOR },
      ]);
      expect(await models().ObjectLayer.countDocuments({ cid: first.candidateCid })).toBe(1);
      expect((await auditOf({ jobItemId: first._id })).at(-1)).toMatchObject({
        action: 'item.revision_created',
        previousRevision: 0,
        newRevision: 1,
        previousCid: first.candidateCid,
        newCid: definition.cid,
      });
      expect(await boundCid('review-skin-001')).toBeUndefined();
    });

    it('adds no revision for a save that changes nothing', async () => {
      const item = await itemOf(first._id);
      const body = await edited(item, { x: 10, y: 6, color: [255, 0, 0, 255] });
      await saveRevision({ ...ctx(), id: first._id, body, options: host });
      expect((await itemOf(first._id)).revisions).toHaveLength(2);
    });

    it('refuses a save that renames the item or brings no frames', async () => {
      const item = await itemOf(first._id);
      const body = await edited(item, { x: 1, y: 1, color: [1, 2, 3, 255] });
      const renamed = { ...body, data: { ...body.data, item: { ...body.data.item, id: 'other-skin' } } };
      expect(
        (await rejection(saveRevision({ ...ctx(), id: first._id, body: renamed, options: host }))).message,
      ).toMatch(/keeps the item id review-skin-001/);
      const bare = { data: body.data };
      expect((await rejection(saveRevision({ ...ctx(), id: first._id, body: bare, options: host }))).message).toMatch(
        /render frames/,
      );
    });

    it('approves only the revision it names, and only a technically valid one', async () => {
      const item = await itemOf(first._id);
      const stale = await rejection(approveItem({ ...ctx(), id: first._id, cid: first.candidateCid }));
      expect(stale).toMatchObject({ status: 409 });
      expect((await rejection(approveItem({ ...ctx(), id: first._id }))).status).toBe(400);
      await models().CyberiaProceduralJobItem.updateOne({ _id: first._id }, { $set: { 'validation.ok': false } });
      expect((await rejection(approveItem({ ...ctx(), id: first._id, cid: item.candidateCid }))).message).toMatch(
        /not technically valid/,
      );
      await models().CyberiaProceduralJobItem.updateOne({ _id: first._id }, { $set: { 'validation.ok': true } });

      const approved = await approveItem({
        ...ctx(),
        id: first._id,
        cid: item.candidateCid,
        reason: 'the face reads well',
      });
      expect(approved).toMatchObject({
        status: 'approved',
        review: {
          decision: 'approved',
          reviewer: MODERATOR,
          revision: 1,
          cid: item.candidateCid,
          reason: 'the face reads well',
        },
      });
      expect((await auditOf({ jobItemId: first._id })).at(-1)).toMatchObject({
        action: 'item.approved',
        actor: MODERATOR,
        newRevision: 1,
        newCid: item.candidateCid,
      });
    });

    it('ends the approval when a manual edit stores a new revision', async () => {
      const approved = await itemOf(first._id);
      await openForEdit({ ...ctx(), id: first._id });
      expect((await itemOf(first._id)).review.decision).toBe('approved');
      const body = await edited(approved, { x: 11, y: 6, color: [0, 255, 0, 255] });
      const definition = await saveRevision({ ...ctx(), id: first._id, body, options: host });
      const item = await itemOf(first._id);
      expect(item).toMatchObject({
        status: 'review',
        revision: 2,
        candidateCid: definition.cid,
        review: { decision: '' },
      });
      expect((await promoteJob({ ...ctx(), options: host })).promoted).toEqual([]);
      expect((await auditOf({ jobItemId: first._id })).at(-1)).toMatchObject({
        action: 'item.revision_created',
        reason: 'the approval of the previous revision no longer applies',
      });
    });

    it('refuses to promote a candidate that is not approved', async () => {
      const error = await rejection(promoteItem({ ...ctx(), id: first._id, options: host }));
      expect(error).toMatchObject({ status: 409 });
      expect(error.message).toMatch(/needs approved/);
    });

    it('promotes the approved revision as a new item: the proposed id becomes a bound definition', async () => {
      const item = await itemOf(first._id);
      await approveItem({ ...ctx(), id: first._id, cid: item.candidateCid });
      const result = await promoteJob({ ...ctx(), options: host });
      expect(result).toEqual({ promoted: ['review-skin-001'], failed: [] });
      const promoted = await itemOf(first._id);
      expect(promoted).toMatchObject({
        status: 'promoted',
        promotion: { cid: item.candidateCid, previousCid: '', by: MODERATOR },
      });
      expect(await models().ObjectLayer.findByCid(item.candidateCid).lean()).toMatchObject({ origin: 'canonical' });
      expect(await boundCid('review-skin-001')).toBe(item.candidateCid);
      expect(await models().ObjectLayer.findByCid(first.candidateCid).lean()).toMatchObject({ origin: 'draft' });
      expect((await auditOf({ jobItemId: first._id })).at(-1)).toMatchObject({
        action: 'item.created',
        previousCid: item.candidateCid,
        newCid: item.candidateCid,
      });
      expect((await promoteJob({ ...ctx(), options: host })).promoted).toEqual([]);
      expect((await rejection(openForEdit({ ...ctx(), id: first._id }))).status).toBe(409);
      expect((await rejection(regenerateItem({ ...ctx(), id: first._id }))).status).toBe(409);
      expect((await rejection(rejectItem({ ...ctx(), id: first._id }))).status).toBe(409);
    });

    it('rejects a candidate and regenerates it under a new seed, keeping every earlier revision', async () => {
      const rejected = await rejectItem({ ...ctx(), id: second._id, reason: 'the head is too round' });
      expect(rejected).toMatchObject({ status: 'rejected', review: { decision: 'rejected', reviewer: MODERATOR } });
      const queued = await regenerateItem({ ...ctx(), id: second._id, reason: 'try again' });
      expect(queued).toMatchObject({
        status: 'queued',
        seed: regenerationSeed(second.seed),
        attempt: 0,
        predecessor: { cid: second.candidateCid, seed: second.seed, revision: 0 },
        review: { decision: '' },
      });
      expect((await models().CyberiaProceduralJob.findById(job._id).lean()).counts.queued).toBe(1);
      await drain();
      const item = await itemOf(second._id);
      expect(item).toMatchObject({ status: 'review', revision: 1, seed: regenerationSeed(second.seed) });
      expect(item.candidateCid).not.toBe(second.candidateCid);
      expect(item.generatedCid).toBe(item.candidateCid);
      expect(item.revisions).toMatchObject([
        { revision: 0, cid: second.candidateCid, kind: 'generated', seed: expect.any(Number) },
        { revision: 1, cid: item.candidateCid, kind: 'regenerated', seed: expect.any(Number) },
      ]);
      expect(await models().ObjectLayer.countDocuments({ cid: second.candidateCid })).toBe(1);
      expect(await actionsOf({ jobItemId: second._id })).toEqual([
        'item.generated',
        'item.rejected',
        'item.regenerated',
        'item.generated',
      ]);
    });

    it('reproduces a regeneration from the seed its revision records', async () => {
      const item = await itemOf(second._id);
      const generator = GENERATORS['skin-variant'];
      const template = specTemplate(job.spec, item.templateId);
      const context = resolveProceduralContext({
        source: baselineSource(job.spec.itemType, job.spec.baseline),
        template,
        profile: job.spec.profile,
      });
      const result = generator.generate(generator.prepare(context), {
        itemId: item.targetItemId,
        seed: item.revisions.at(-1).seed,
        parameters: { ...job.spec.parameters, minDiversity: 0 },
        palette: candidatePalette(template, { palette: specPalette(job.spec, item.paletteId) }),
      });
      const again = await persistCandidate({
        models: catalogModels(host),
        result,
        createdBy: MODERATOR,
        options: host,
      });
      expect(again.cid).toBe(item.candidateCid);
    });

    it('answers with the provenance of a candidate: its run, revisions and decisions', async () => {
      const { job: run, item, audit } = await itemProvenance(models(), job._id, first._id);
      expect(run).toMatchObject({
        generatorId: 'skin-variant',
        proceduralProfileId: 'skin-default',
        rootSeed: 99,
        spec: { mode: 'create-new' },
      });
      expect(item).toMatchObject({ targetItemId: 'review-skin-001', seed: first.seed });
      expect(item.promotion.cid).toBe(item.candidateCid);
      expect(item.revisions.map(({ kind }) => kind)).toEqual(['generated', 'edited', 'edited']);
      expect(item.review).toMatchObject({ decision: 'approved', reviewer: MODERATOR, cid: item.candidateCid });
      expect(audit.map(({ action }) => action)).toEqual([
        'item.generated',
        'item.opened_for_edit',
        'item.revision_created',
        'item.approved',
        'item.opened_for_edit',
        'item.revision_created',
        'item.approved',
        'item.created',
      ]);
    });

    it('names a procedural revision as the parent of an update made from it', async () => {
      const item = await itemOf(first._id);
      const chained = await create(
        updateRequest({
          source: { itemIds: ['review-skin-001'] },
          output: { variantsPerItem: 1 },
          seed: { mode: 'fixed', value: 3 },
        }),
      );
      const [child] = await itemsOf(chained);
      expect(child.lineage).toEqual({
        parentCid: item.candidateCid,
        parentItemId: 'review-skin-001',
        parentRevision: 2,
        generationRunId: chained.generationRunId,
      });
      expect(third.status).toBe('review');
    });
  });

  describe('an update promotion', () => {
    let job;
    let first;
    let second;
    const ctx = () => ({ models: models(), jobId: job._id, actor: MODERATOR });

    it('keeps the item id of every candidate of a target and drafts them without binding', async () => {
      job = await create(
        updateRequest({
          source: { itemIds: ['violet-skin'] },
          output: { variantsPerItem: 2 },
          seed: { mode: 'fixed', value: 12 },
        }),
      );
      await drain();
      [first, second] = await itemsOf(job);
      expect([first, second].map(({ targetItemId }) => targetItemId)).toEqual(['violet-skin', 'violet-skin']);
      expect(first.candidateCid).not.toBe(second.candidateCid);
      expect(await boundCid('violet-skin')).toBe(cids['violet-skin']);
    });

    it('lets one candidate of a target be approved: a rival is refused', async () => {
      await approveItem({ ...ctx(), id: first._id, cid: first.candidateCid });
      const error = await rejection(approveItem({ ...ctx(), id: second._id, cid: second.candidateCid }));
      expect(error).toMatchObject({ status: 409 });
      expect(error.message).toMatch(/Another candidate of violet-skin is already approved/);
    });

    it('answers 409 when the target item changed since the run, and promotes nothing', async () => {
      await rebind('violet-skin', cids['base-skin']);
      const error = await rejection(promoteItem({ ...ctx(), id: first._id, options: host }));
      expect(error).toMatchObject({ status: 409 });
      expect(error.message).toBe(`'violet-skin' runs ${cids['base-skin']}, not ${cids['violet-skin']}`);
      expect(await itemOf(first._id)).toMatchObject({ status: 'approved' });
      expect(await boundCid('violet-skin')).toBe(cids['base-skin']);
      expect(await promoteJob({ ...ctx(), options: host })).toEqual({
        promoted: [],
        failed: [{ targetItemId: 'violet-skin', message: error.message }],
      });
      await rebind('violet-skin', cids['violet-skin']);
    });

    it('promotes the approved candidate to the same item id: a new cid, the replaced cid kept in the record', async () => {
      const promoted = await promoteItem({ ...ctx(), id: first._id, options: host });
      expect(promoted).toMatchObject({
        status: 'promoted',
        targetItemId: 'violet-skin',
        promotion: { cid: first.candidateCid, previousCid: cids['violet-skin'], by: MODERATOR },
      });
      expect(await boundCid('violet-skin')).toBe(first.candidateCid);
      expect(first.candidateCid).not.toBe(cids['violet-skin']);
      expect(await models().ObjectLayer.findByCid(cids['violet-skin']).lean()).toMatchObject({ origin: 'canonical' });
      const { data } = await models().ObjectLayer.findByCid(first.candidateCid).lean();
      expect(data.item.id).toBe('violet-skin');
      expect(await models().CyberiaItemCatalog.countDocuments({ itemId: 'violet-skin' })).toBe(1);
      expect((await auditOf({ jobItemId: first._id })).at(-1)).toMatchObject({
        action: 'item.promoted',
        previousCid: cids['violet-skin'],
        newCid: first.candidateCid,
      });
    });

    it('refuses the sibling once the target runs another definition', async () => {
      const error = await rejection(approveItem({ ...ctx(), id: second._id, cid: second.candidateCid }));
      expect(error).toMatchObject({ status: 409 });
      expect((await itemOf(second._id)).status).toBe('review');
    });

    it('promotes a retouched revision: the exact current revision is the one that becomes active', async () => {
      const retouch = await create(
        updateRequest({
          source: { itemIds: ['ash-raider'] },
          output: { variantsPerItem: 1 },
          seed: { mode: 'fixed', value: 14 },
        }),
      );
      await drain();
      const [item] = await itemsOf(retouch);
      const rctx = { models: models(), jobId: retouch._id, actor: MODERATOR };
      expect(item.metrics.directions).toBe(8);
      await openForEdit({ ...rctx, id: item._id });
      const saved = await saveRevision({
        ...rctx,
        id: item._id,
        body: await edited(item, { x: 12, y: 7, color: [250, 10, 10, 255] }),
        options: host,
      });
      const revised = await itemOf(item._id);
      expect(revised).toMatchObject({ revision: 1, candidateCid: saved.cid, status: 'review' });
      await approveItem({ ...rctx, id: item._id, cid: saved.cid });
      await promoteItem({ ...rctx, id: item._id, options: host });
      expect(await boundCid('ash-raider')).toBe(saved.cid);
      expect(await itemOf(item._id)).toMatchObject({
        promotion: { cid: saved.cid, previousCid: cids['ash-raider'] },
        revisions: [{ kind: 'generated' }, { kind: 'edited' }],
      });
    });
  });

  describe('a create promotion', () => {
    it('answers 409 when the proposed item id is taken since the run, and promotes nothing', async () => {
      const job = await create(
        createRequest({ output: { variants: 1, itemIdPrefix: 'taken-skin' }, seed: { mode: 'fixed', value: 4 } }),
      );
      await drain();
      const [item] = await itemsOf(job);
      const ctx = { models: models(), jobId: job._id, actor: MODERATOR };
      await approveItem({ ...ctx, id: item._id, cid: item.candidateCid });
      await rebind('taken-skin-001', cids['base-skin']);
      const error = await rejection(promoteItem({ ...ctx, id: item._id, options: host }));
      expect(error).toMatchObject({
        status: 409,
        message: `'taken-skin-001' runs ${cids['base-skin']}, not no definition`,
      });
      expect(await itemOf(item._id)).toMatchObject({ status: 'approved' });
      expect(await boundCid('taken-skin-001')).toBe(cids['base-skin']);
    });

    it('creates each approved candidate as its own item, and no other', async () => {
      const job = await create(
        createRequest({ output: { variants: 3, itemIdPrefix: 'batch-skin' }, seed: { mode: 'fixed', value: 15 } }),
      );
      await drain();
      const items = await itemsOf(job);
      const ctx = { models: models(), jobId: job._id, actor: MODERATOR };
      await approveItem({ ...ctx, id: items[0]._id, cid: items[0].candidateCid });
      await approveItem({ ...ctx, id: items[2]._id, cid: items[2].candidateCid });
      expect(await promoteJob({ ...ctx, options: host })).toEqual({
        promoted: ['batch-skin-001', 'batch-skin-003'],
        failed: [],
      });
      expect(await boundCid('batch-skin-001')).toBe(items[0].candidateCid);
      expect(await boundCid('batch-skin-002')).toBeUndefined();
      expect(await boundCid('batch-skin-003')).toBe(items[2].candidateCid);
      expect((await rejection(promoteJob({ ...ctx, jobId: '64b0000000000000000000ff', options: host }))).status).toBe(
        404,
      );
    });
  });

  describe('deleting a run', () => {
    const stored = async (cids) => ({
      definitions: await models().ObjectLayer.countDocuments({ cid: { $in: cids } }),
      frames: await models().ObjectLayerRenderFrames.countDocuments({ objectLayerCid: { $in: cids } }),
      atlases: await DataBaseProviderService.getModel('AtlasSpriteSheet', host).countDocuments({
        objectLayerCid: { $in: cids },
      }),
    });

    it('stops a run that still works and deletes it, so the worker makes nothing more for it', async () => {
      const job = await create(
        createRequest({ output: { variants: 2, itemIdPrefix: 'live-run' }, seed: { mode: 'fixed', value: 21 } }),
      );
      const ctx = { models: models(), jobId: job._id, options: host };
      expect(await deleteJob(ctx)).toEqual({ stopped: 2, drafts: [], candidates: 2, audit: expect.any(Number) });
      expect(await models().CyberiaProceduralAudit.countDocuments({ jobId: job._id })).toBe(0);
      expect(await drain()).toBe(0);
      expect(await models().CyberiaProceduralJob.exists({ _id: job._id })).toBeNull();
      expect(await models().ObjectLayer.countDocuments({ 'data.item.id': /^live-run-/ })).toBe(0);
      expect((await rejection(deleteJob({ ...ctx, jobId: '64b0000000000000000000ff' }))).status).toBe(404);
    });

    it('deletes a completed run whose candidates were all rejected, with no cancel first', async () => {
      const job = await create(
        createRequest({ output: { variants: 2, itemIdPrefix: 'done-run' }, seed: { mode: 'fixed', value: 24 } }),
      );
      await drain();
      const ctx = { models: models(), jobId: job._id, actor: MODERATOR };
      for (const item of await itemsOf(job)) await rejectItem({ ...ctx, id: item._id });
      expect((await models().CyberiaProceduralJob.findById(job._id).lean()).status).toBe('completed');
      expect((await rejection(cancelJob(ctx))).status).toBe(409);
      const drafts = (await itemsOf(job)).map(({ candidateCid }) => candidateCid);
      const removed = await deleteJob({ models: models(), jobId: job._id, options: host });
      expect(removed).toMatchObject({ stopped: 0, candidates: 2 });
      expect(removed.drafts.sort()).toEqual([...drafts].sort());
      expect(await stored(drafts)).toEqual({ definitions: 0, frames: 0, atlases: 0 });
    });

    it('deletes a run in any state with no cancel first, with its audit: only the definition of a promoted item stays', async () => {
      const job = await create(
        createRequest({ output: { variants: 4, itemIdPrefix: 'gone-run' }, seed: { mode: 'fixed', value: 22 } }),
      );
      await drain();
      const [promoted, approved, retouched, rejected] = await itemsOf(job);
      const ctx = { models: models(), jobId: job._id, actor: MODERATOR };
      await approveItem({ ...ctx, id: promoted._id, cid: promoted.candidateCid });
      await promoteItem({ ...ctx, id: promoted._id, options: host });
      await approveItem({ ...ctx, id: approved._id, cid: approved.candidateCid });
      await openForEdit({ ...ctx, id: retouched._id });
      await saveRevision({
        ...ctx,
        id: retouched._id,
        body: await edited(retouched, { x: 12, y: 8, color: [5, 200, 5, 255] }),
        options: host,
      });
      await rejectItem({ ...ctx, id: rejected._id });
      const drafts = (await itemsOf(job))
        .filter(({ _id }) => String(_id) !== String(promoted._id))
        .flatMap(({ revisions }) => revisions.map(({ cid }) => cid));
      expect(drafts).toHaveLength(4);
      expect(await stored(drafts)).toEqual({ definitions: 4, frames: 4, atlases: 4 });

      const audit = await models().CyberiaProceduralAudit.countDocuments({ jobId: job._id });
      const removed = await deleteJob({ models: models(), jobId: job._id, options: host });
      expect(removed).toMatchObject({ stopped: 1, candidates: 4, audit });
      expect(removed.drafts.sort()).toEqual([...drafts].sort());
      expect(await stored(drafts)).toEqual({ definitions: 0, frames: 0, atlases: 0 });
      expect(await models().CyberiaProceduralJob.exists({ _id: job._id })).toBeNull();
      expect(await models().CyberiaProceduralJobItem.countDocuments({ jobId: job._id })).toBe(0);
      expect(await models().CyberiaProceduralAudit.countDocuments({ jobId: job._id })).toBe(0);
      expect(await boundCid('gone-run-001')).toBe(promoted.candidateCid);
      expect(await stored([promoted.candidateCid])).toMatchObject({ definitions: 1, frames: 1 });
      expect((await rejection(deleteJob({ models: models(), jobId: job._id, options: host }))).status).toBe(404);
    });

    it('purges a published revision no item runs, and keeps one an item ran', async () => {
      const job = await create(
        createRequest({ output: { variants: 2, itemIdPrefix: 'left-run' }, seed: { mode: 'fixed', value: 25 } }),
      );
      await drain();
      const [ran, published] = await itemsOf(job);
      const ctx = { models: models(), jobId: job._id, actor: MODERATOR };
      await approveItem({ ...ctx, id: ran._id, cid: ran.candidateCid });
      await promoteItem({ ...ctx, id: ran._id, options: host });
      await rebind('left-run-001', cids['base-skin']);
      // A promotion whose bind failed leaves its revision published, and no item runs it.
      const draft = await models().ObjectLayer.findByCid(published.candidateCid);
      await ObjectLayerEngine.rebuildItemRender({ models: catalogModels(host), objectLayer: draft, options: host });
      expect((await models().ObjectLayer.findByCid(published.candidateCid).lean()).origin).toBe('canonical');

      expect(await deleteJob({ models: models(), jobId: job._id, options: host })).toMatchObject({
        drafts: [published.candidateCid],
        candidates: 2,
      });
      expect(await stored([published.candidateCid])).toEqual({ definitions: 0, frames: 0, atlases: 0 });
      expect(await stored([ran.candidateCid])).toMatchObject({ definitions: 1, frames: 1 });
    });

    it('keeps a draft another run still names', async () => {
      const job = await create(
        createRequest({ output: { variants: 1, itemIdPrefix: 'shared-run' }, seed: { mode: 'fixed', value: 23 } }),
      );
      await drain();
      const [item] = await itemsOf(job);
      const other = await models().CyberiaProceduralJobItem.create({
        jobId: '64b0000000000000000000ee',
        ordinal: 0,
        targetItemId: 'shared-run-001',
        templateId: 'skin.humanoid',
        seed: 1,
        revisions: [{ revision: 0, cid: item.candidateCid, kind: 'generated', at: new Date() }],
      });
      await cancelJob({ models: models(), jobId: job._id, actor: MODERATOR });
      expect((await deleteJob({ models: models(), jobId: job._id, options: host })).drafts).toEqual([]);
      expect(await stored([item.candidateCid])).toMatchObject({ definitions: 1 });
      await models().CyberiaProceduralJobItem.deleteOne({ _id: other._id });
    });
  });
});
