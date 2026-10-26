import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { findBoundDefinitions } from '../../../src/projects/cyberia/catalog/object-layer-catalog.js';
import { promoteItem } from '../../../src/projects/cyberia/procedural/jobs/promotion.js';
import { approveItem, openForEdit, saveRevision } from '../../../src/projects/cyberia/procedural/jobs/review.js';
import { RANDOM_PALETTE } from '../../../src/projects/cyberia/procedural/spec.js';
import { mongodBinary } from '../../support/mongod.js';
import {
  FOUNDATION_ITEMS,
  boundCid,
  create,
  createRequest,
  drain,
  edited,
  host,
  itemOf,
  itemsOf,
  models,
  MODERATOR,
  startEngine,
  stopEngine,
  updateRequest,
} from '../../support/procedural-engine.js';

// The two workflows of the Procedural Engine, end to end: automation makes candidates, a human
// finishes one in the Object Layer Studio, the saved revision is a new CID that returns to review,
// and the catalog runs it only after an approval and a promotion.

/** The Studio save of a moderator: a new hair cell, a new description and one stat changed. */
const finish = (item, description) =>
  edited(item, { x: 11, y: 4, color: [180, 40, 160, 255] }, ({ item: data, stats }) => ({
    item: { ...data, description },
    stats: { ...stats, utility: stats.utility + 1 },
  }));

/** Edits, approves and promotes one candidate; answers the CID the runtime then resolves. */
async function finishAndPromote(job, candidate, description) {
  const ctx = { models: models(), jobId: job._id, actor: MODERATOR };
  await openForEdit({ ...ctx, id: candidate._id });
  const saved = await saveRevision({
    ...ctx,
    id: candidate._id,
    body: await finish(candidate, description),
    options: host,
  });
  const revised = await itemOf(candidate._id);
  expect(saved.cid).not.toBe(candidate.candidateCid);
  expect(revised).toMatchObject({
    status: 'review',
    generatedCid: candidate.candidateCid,
    candidateCid: saved.cid,
    validation: { ok: true },
  });
  expect(revised.revisions.map(({ kind, cid }) => [kind, cid])).toEqual([
    ['generated', candidate.candidateCid],
    ['edited', saved.cid],
  ]);
  expect(await models().ObjectLayer.findByCid(candidate.candidateCid).lean()).not.toBeNull();
  await approveItem({ ...ctx, id: candidate._id, cid: saved.cid });
  const promoted = await promoteItem({ ...ctx, id: candidate._id, options: host });
  expect(promoted).toMatchObject({ status: 'promoted', promotion: { cid: saved.cid } });
  return saved.cid;
}

describe.skipIf(!mongodBinary)('the procedural workflows, from generation to the runtime', () => {
  beforeAll(() => startEngine(), 60000);
  afterAll(stopEngine);

  it('updates an existing item with an art direction and no render, and the runtime resolves the human revision', async () => {
    const before = await boundCid('ash-raider');
    const job = await create(
      updateRequest({
        source: { itemIds: ['ash-raider'] },
        output: { variantsPerItem: 5 },
        seed: { mode: 'fixed', value: 4401 },
      }),
    );
    expect(job.spec.sources).toMatchObject([{ itemId: 'ash-raider', hasRender: false, templateId: 'skin.humanoid' }]);
    expect(job.spec.sources[0].artDirection.palettes).toMatchObject([
      { group: 'foundation', roles: { base: ['#c0c0c0', '#8b3a1a'] } },
    ]);
    await drain();
    const candidates = await itemsOf(job);
    expect(candidates.map(({ status }) => status)).toEqual(Array(5).fill('review'));
    expect(candidates.every(({ targetItemId }) => targetItemId === 'ash-raider')).toBe(true);
    expect(await boundCid('ash-raider')).toBe(before);

    const cid = await finishAndPromote(job, candidates[2], FOUNDATION_ITEMS['ash-raider'].artBrief.silhouette);
    expect(await boundCid('ash-raider')).toBe(cid);
    const [runtime] = await findBoundDefinitions(models(), ['ash-raider']);
    expect(runtime).toMatchObject({ cid, data: { item: { id: 'ash-raider', description: 'A hooded raider.' } } });
    expect(runtime.data.stats.utility).toBe(
      (await models().ObjectLayer.findByCid(before).lean()).data.stats.utility + 1,
    );
  });

  it('creates a new item from a Genesis Template and a random palette, and the runtime resolves it', async () => {
    const job = await create(
      createRequest({
        template: { id: 'skin.humanoid' },
        palette: { paletteId: RANDOM_PALETTE },
        output: { variants: 10, itemIdPrefix: 'accepted-skin' },
        seed: { mode: 'fixed', value: 4501 },
      }),
    );
    await drain();
    const candidates = await itemsOf(job);
    expect(candidates.map(({ status }) => status)).toEqual(Array(10).fill('review'));
    expect(new Set(candidates.map(({ paletteId }) => paletteId)).size).toBeGreaterThan(1);
    const chosen = candidates[6];
    expect(await boundCid(chosen.targetItemId)).toBeUndefined();

    const cid = await finishAndPromote(job, chosen, 'A wanderer drawn by hand.');
    expect(chosen.targetItemId).toBe('accepted-skin-007');
    const [runtime] = await findBoundDefinitions(models(), ['accepted-skin-007']);
    expect(runtime).toMatchObject({
      cid,
      data: { item: { id: 'accepted-skin-007', type: 'skin', description: 'A wanderer drawn by hand.' } },
    });
    for (const other of candidates.filter(({ _id }) => String(_id) !== String(chosen._id)))
      expect(await boundCid(other.targetItemId)).toBeUndefined();
  });
});
