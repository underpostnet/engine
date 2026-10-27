/**
 * The results of a target in a map population: every artifact its workflow made and keeps, and what
 * each one allows. A generated result is the candidate of one run of the target: a job that names
 * the population and the item. A hand-authored draft is a definition a Studio save stored for the
 * target (`target.drafts`). The definition the target uses (`definitionCid`) shows too when another
 * workflow stored it. Each result has its source, its state and its actions, each with the reason
 * when it is not available. Nothing stores them: a client and a write read the same answer.
 *
 * A target keeps at most {@link RESULT_LIMIT} results: Generate and a Studio save refuse beyond it.
 * Generate stores new runs, each under the seed of a run index of the population no other run took.
 * Retry runs a failed candidate again under its own seed. A delete stops a run first, then removes
 * what only that result keeps: the run with its candidate, revisions, render frames, atlas and audit
 * trail, or the draft. Reset deletes every result the workflow owns and keeps what anything else
 * uses. The population audit records each delete and reset.
 *
 * @module src/projects/cyberia/procedural/population/results.js
 * @namespace CyberiaPopulationResults
 */
import { runsAnother } from '../../../../api/cyberia-item-catalog/cyberia-item-catalog.model.js';
import { fromWire } from '../../../../client/components/objectlayer-studio/RenderSource.js';
import { renderedCids } from '../../catalog/object-layer-catalog.js';
import { ObjectLayerEngine } from '../../object-layer/object-layer.js';
import { deleteJob, purgeRevisions, recordAudit, requestError, revisionKeepers } from '../engine.js';
import { storeJob } from '../jobs/job.js';
import { approveItem, retryItem, withdrawApproval } from '../jobs/review.js';
import { resolveSpec } from '../spec.js';
import {
  addTarget,
  capabilitiesNow,
  closedReason,
  entriesOf,
  findDefinitions,
  findPopulation,
  getPopulation,
  only,
  openPopulation,
  replaced,
  resolvedTarget,
  runsOf,
  targetOf,
  targetRequest,
  writeTargets,
} from './population.js';
import { GENERATING, checkResolution, recommendedOf, resolutionsOf } from './resolution.js';

/**
 * The most results a target keeps: four full Generate requests. One skin result stores about
 * 240 KB (render frames, atlas and its renders), so a target holds under 4 MB, and the results of an
 * item fill a tenth of the 256 sprites a client keeps.
 * @constant {number}
 * @memberof CyberiaPopulationResults
 */
export const RESULT_LIMIT = 16;

/** The most runs one Generate stores. */
const MAX_RUNS = 4;

const isRunId = (id) => /^[0-9a-f]{24}$/i.test(id);
const action = (id, reason) => ({ id, available: !reason, reason });
const key = (population, itemId) => `${population._id}|${itemId}`;

/** Why a generated result takes no Use or Continue editing in its state; empty when it may. */
const ENTRY_BLOCKS = Object.freeze({
  generating: 'It is still generating',
  missing: 'Its run holds no candidate record',
  discarded: 'It was discarded',
  cancelled: 'Its run stopped before it finished',
  published: 'It is published',
});

/** The actions of a generated result; `resolutions` are those of its target now. */
function entryActions(entry, target, { hasRender, resolutions }) {
  const blocked = entry.state === 'failed' ? `Generation failed: ${entry.error}` : (ENTRY_BLOCKS[entry.state] ?? '');
  const switchReason =
    entry.source === target.resolution
      ? ''
      : (resolutions.find(({ id }) => id === entry.source)?.reason ?? `${target.itemId} takes no ${entry.source}`);
  const actions = [
    action(
      'use',
      blocked ||
        (entry.state === 'selected' ? 'It is the selected result' : '') ||
        (!hasRender ? 'Its definition has no render frames' : '') ||
        (!entry.valid ? `It fails validation: ${entry.problems.join('; ')}` : '') ||
        switchReason,
    ),
    action('edit', blocked),
    action(
      'delete',
      entry.state === 'selected'
        ? 'It is the selected result: use another result or reset the item first'
        : entry.state === 'published'
          ? 'It is published: published content stays'
          : '',
    ),
  ];
  if (entry.state === 'failed')
    actions.push(
      action('retry', entry.retryable ? '' : 'A run under the same seed fails the same way: generate a new result'),
    );
  return actions;
}

/**
 * Why a target holds a definition: it is the selected result of an item authored by hand, or the
 * definition the item keeps for when it is authored again; empty for any other definition.
 */
const heldBy = (target, cid) =>
  cid !== target.definitionCid
    ? ''
    : target.resolution === 'author'
      ? 'It is the selected result: use another result or reset the item first'
      : 'The item keeps it as its authored definition: reset the item, or author it and use another';

/** The actions of a definition the target authored or uses. */
function draftActions(draft, target, { owned, keptBy }) {
  const held = heldBy(target, draft.cid);
  const selected = held && target.resolution === 'author';
  return [
    action(
      'use',
      selected
        ? 'It is the selected result'
        : draft.archivedAt
          ? 'It is archived'
          : !draft.hasRender
            ? 'It has no render frames: continue editing it'
            : '',
    ),
    action('edit', ''),
    action(
      'delete',
      held ||
        (!owned
          ? 'This workflow did not store it'
          : draft.origin !== 'draft'
            ? 'It is published: published content stays'
            : keptBy
              ? `It stays: ${keptBy}`
              : ''),
    ),
  ];
}

/** The stored definitions a target authored, and the one it uses, newest first. */
async function definitionsOf({ ObjectLayer }, target) {
  const cids = [...new Set([...target.drafts, target.definitionCid].filter(Boolean))];
  return await ObjectLayer.find(
    { cid: { $in: cids } },
    { cid: 1, origin: 1, archivedAt: 1, createdBy: 1, createdAt: 1, updatedAt: 1 },
  )
    .sort({ updatedAt: -1 })
    .lean();
}

/**
 * The results of a target: its generated results, newest first, then the definitions it authored or
 * uses, newest first; how many it keeps and the most it may keep. A closed population allows no action.
 * @param {Object} models - {@link populationModels}.
 * @param {string} id
 * @param {string} itemId
 * @returns {Promise<{results:Object[],retained:number,limit:number}>}
 * @throws {Error} 404 for an unknown population or target.
 * @memberof CyberiaPopulationResults
 */
export async function targetResults(models, id, itemId) {
  const population = await findPopulation(models, id);
  const { target } = targetOf(population, itemId);
  const [entries, { own, current }, definitions] = await Promise.all([
    entriesOf(models, [population]).then((all) => all.get(key(population, itemId)) ?? []),
    capabilitiesNow(models, target),
    definitionsOf(models, target),
  ]);
  const cids = definitions.map(({ cid }) => cid);
  const [rendered, keepers] = await Promise.all([
    renderedCids(models, [...entries.map(({ cid }) => cid).filter(Boolean), ...cids]),
    revisionKeepers(models, cids),
  ]);
  const resolutions = resolutionsOf(current, own);
  const closed = closedReason(population);
  const closedActions = (actions) => (closed ? actions.map(({ id }) => action(id, closed)) : actions);
  const generated = entries.map(({ id: entryId, jobId, ...entry }) => {
    const hasRender = Boolean(entry.cid) && rendered.has(entry.cid);
    return {
      ...entry,
      id: jobId,
      entryId,
      jobId,
      hasRender,
      keptBy: '',
      actions: closedActions(entryActions(entry, target, { hasRender, resolutions })),
    };
  });
  const usedAt = definitions.find(({ cid }) => cid === target.definitionCid)?.updatedAt;
  const authored = definitions.map((definition) => {
    const used = definition.cid === target.definitionCid;
    const owned = target.drafts.includes(definition.cid);
    const hasRender = rendered.has(definition.cid);
    const keptBy = used ? '' : (keepers.get(definition.cid) ?? '');
    return {
      id: definition.cid,
      entryId: '',
      source: owned ? 'author' : 'stored',
      state:
        used && target.resolution === 'author'
          ? 'selected'
          : usedAt && new Date(definition.updatedAt) < new Date(usedAt)
            ? 'superseded'
            : 'saved',
      cid: definition.cid,
      origin: definition.origin,
      hasRender,
      keptBy,
      createdBy: definition.createdBy ?? '',
      createdAt: definition.createdAt,
      updatedAt: definition.updatedAt,
      actions: closedActions(draftActions({ ...definition, hasRender }, target, { owned, keptBy })),
    };
  });
  const retained = generated.length + authored.filter(({ source }) => source === 'author').length;
  return { results: [...generated, ...authored], retained, limit: RESULT_LIMIT };
}

/**
 * The stored definitions of the item of a target that the Studio can continue from, a page at a time
 * ({@link findDefinitions}): its drafts, the definition it uses, and those any other workflow stored.
 * The revisions of its own runs are left out, since each result continues its own; so is the
 * definition its item runs now, which a client shows first from the target.
 * @param {Object} models - {@link populationModels}.
 * @param {string} id
 * @param {string} itemId
 * @param {{skip:number,limit:number}} page
 * @returns {Promise<{data:Object[],total:number}>}
 * @throws {Error} 404 for an unknown population or target.
 * @memberof CyberiaPopulationResults
 */
export async function targetDefinitions(models, id, itemId, page) {
  const population = await findPopulation(models, id);
  targetOf(population, itemId);
  const [runs, bound] = await Promise.all([
    runsOf(models, population._id, itemId),
    models.CyberiaItemCatalog.resolve([itemId]),
  ]);
  const revisions = await models.CyberiaProceduralJobItem.distinct('revisions.cid', {
    jobId: { $in: runs.map(({ _id }) => _id) },
  });
  return await findDefinitions(models, {
    itemId,
    exclude: [...revisions, bound.get(itemId)].filter(Boolean),
    ...page,
  });
}

/** Refuses `adding` results more than a target may keep, with the remedy. */
async function assertRoom(models, population, target, adding) {
  const [runs, drafts] = await Promise.all([
    runsOf(models, population._id, target.itemId),
    models.ObjectLayer.countDocuments({ cid: { $in: target.drafts } }),
  ]);
  const retained = runs.length + drafts;
  if (retained + adding > RESULT_LIMIT)
    throw requestError(
      `${target.itemId} keeps ${retained} of ${RESULT_LIMIT} results: delete unselected results to add ${adding} more`,
      409,
    );
}

/**
 * Generates new results of a target from its configuration as it is: `count` runs, each a job under
 * the seed of a run index of the population no other run took, so a reset, a delete or a target added
 * again never brings an earlier result back. A target whose binding moved since the population read it generates nothing.
 * @param {Object} params
 * @param {Object} params.models - {@link populationModels}.
 * @param {string} params.id
 * @param {string} params.itemId
 * @param {number} [params.count] - 1 to {@link MAX_RUNS}.
 * @param {string} params.actor
 * @returns {Promise<Object>} {@link populationView}.
 * @throws {Error} 400 for a count out of range or a target no resolution generates; 409 for a closed
 *   population, a moved binding, or a target that keeps {@link RESULT_LIMIT} results.
 * @memberof CyberiaPopulationResults
 */
export async function generateTarget({ models, id, itemId, count = 1, actor }) {
  const population = await openPopulation(models, id);
  const { target } = targetOf(population, itemId);
  if (!Number.isInteger(count) || count < 1 || count > MAX_RUNS)
    throw requestError(`count is an integer from 1 to ${MAX_RUNS}`);
  if (!GENERATING.includes(target.resolution))
    throw requestError(`${itemId} generates nothing: choose a template or its current artwork as the start`);
  const { own, current } = await capabilitiesNow(models, target);
  checkResolution(itemId, current, own, target.resolution);
  const binding = (await models.CyberiaItemCatalog.resolve([itemId])).get(itemId) ?? null;
  if (binding !== target.cid)
    throw requestError(
      `${runsAnother(itemId, binding, target.cid)}. Keep it to read what it runs now, then choose how to generate it.`,
      409,
    );
  await assertRoom(models, population, target, count);
  const { nextRun: first } = await models.CyberiaProceduralPopulation.findOneAndUpdate(
    { _id: population._id },
    { $inc: { nextRun: count, revision: 1 } },
    { projection: { nextRun: 1 }, returnDocument: 'before' },
  ).lean();
  for (let run = first; run < first + count; run++) {
    const { spec } = await resolveSpec(models, targetRequest(target, population, run));
    await storeJob({ models, spec, actor, populationId: population._id, populationItemId: itemId });
  }
  return await getPopulation(models, id);
}

/**
 * Stores the artwork a moderator authored for a target in the Object Layer Studio as a draft
 * definition, lists it among the drafts of the target when this save created it, and makes it the
 * definition the target uses. Nothing is published or bound before the population publishes.
 * @param {Object} params
 * @param {Object} params.models - {@link populationModels}.
 * @param {string} params.id
 * @param {string} params.itemId
 * @param {{data:Object,objectLayerRenderFramesData:Object}} params.body - What the Studio sends.
 * @param {string} params.actor
 * @param {Object} params.options - Router options.
 * @returns {Promise<Object>} The stored definition.
 * @throws {Error} 400 when the save changes the item id or the item type, or has no render; 404 for an
 *   unknown target; 409 for a closed population or a target that keeps {@link RESULT_LIMIT} results.
 * @memberof CyberiaPopulationResults
 */
export async function authorTarget({ models, id, itemId, body, actor, options }) {
  const population = await openPopulation(models, id);
  const { target } = targetOf(population, itemId);
  if (body.data?.item?.id !== itemId) throw requestError(`The artwork of this item keeps the item id ${itemId}`);
  if (body.data.item.type !== target.itemType)
    throw requestError(`${itemId} is a ${target.itemType} item, not a ${body.data.item.type} item`);
  if (!body.objectLayerRenderFramesData) throw requestError('The artwork needs its render frames');
  await assertRoom(models, population, target, 1);
  const startedAt = new Date();
  const definition = await ObjectLayerEngine.persistObjectLayerDocuments({
    models,
    objectLayerRenderFramesData: fromWire(body.objectLayerRenderFramesData),
    objectLayerData: { data: body.data, createdBy: actor },
    persistOptions: { options, draft: true },
  });
  if (definition.origin === 'draft' && definition.createdAt >= startedAt)
    await models.CyberiaProceduralPopulation.updateOne(
      { _id: population._id, 'targets.itemId': itemId },
      { $addToSet: { 'targets.$.drafts': definition.cid }, $inc: { revision: 1 } },
    );
  await addTarget({ models, id, body: { itemId, cid: definition.cid }, actor });
  return definition;
}

/** The generated result of a target by its candidate id, with every generated result of the target. */
async function entryOfTarget(models, population, itemId, entryId) {
  const entries = (await entriesOf(models, [population])).get(key(population, itemId)) ?? [];
  const entry = entryId && entries.find(({ id }) => id === entryId);
  if (!entry) throw requestError(`${itemId} has no generated result ${entryId}`, 404);
  return { entry, entries };
}

/**
 * Uses one generated result: it approves the exact revision the moderator saw, then takes the
 * approval back from the result selected before. A result of another start switches the resolution
 * of the target to that start first, when the target takes it now. One result of a target is
 * selected at a time; using the selected result again changes nothing.
 * @param {Object} params
 * @param {Object} params.models
 * @param {string} params.id
 * @param {string} params.itemId
 * @param {{entryId:string,cid:string}} params.body
 * @param {string} params.actor
 * @returns {Promise<Object>} {@link populationView}.
 * @throws {Error} 400 for a start the target does not take now; 404 for an unknown result; 409 for a
 *   closed population, a revision that is not the current one, or a result with no render.
 * @memberof CyberiaPopulationResults
 */
export async function selectEntry({ models, id, itemId, body, actor }) {
  const population = await openPopulation(models, id);
  const { entryId, cid } = only(body, ['entryId', 'cid'], 'A selection');
  const { at, target } = targetOf(population, itemId);
  const { entry, entries } = await entryOfTarget(models, population, itemId, String(entryId));
  if (entry.cid !== cid)
    throw requestError(`The current revision of this result is ${entry.cid || 'none'}, not ${cid}`, 409);
  if (!(await renderedCids(models, [cid])).has(cid))
    throw requestError(`Result ${cid} has no render frames: delete it, or generate a new result`, 409);
  if (target.resolution !== entry.source) {
    const { own, current } = await capabilitiesNow(models, target);
    checkResolution(itemId, current, own, entry.source);
    await writeTargets(
      models,
      population,
      replaced(population, at, await resolvedTarget(models, population, target, entry.source, actor)),
    );
  }
  if (entry.state !== 'selected')
    await approveItem({ models, jobId: entry.jobId, id: entry.id, cid, actor, reason: 'selected in the population' });
  for (const other of entries)
    if (other.id !== entry.id && other.state === 'selected')
      await withdrawApproval({ models, jobId: other.jobId, id: other.id, actor, reason: `${entry.id} is selected` });
  return await getPopulation(models, id);
}

/**
 * Runs a failed generated result again under its own seed: the same result, never a new one.
 * @param {Object} params
 * @param {Object} params.models
 * @param {string} params.id
 * @param {string} params.itemId
 * @param {string} params.entryId - The candidate id of the result.
 * @param {string} params.actor
 * @returns {Promise<Object>} {@link populationView}.
 * @throws {Error} 404 for an unknown result; 409 for a closed population or a failure a retry repeats.
 * @memberof CyberiaPopulationResults
 */
export async function retryEntry({ models, id, itemId, entryId, actor }) {
  const population = await openPopulation(models, id);
  targetOf(population, itemId);
  const { entry } = await entryOfTarget(models, population, itemId, String(entryId));
  await retryItem({ models, jobId: entry.jobId, id: entry.id, actor });
  return await getPopulation(models, id);
}

/** Deletes one generated result of a target: its run with everything only the run keeps. Answers the revisions removed. */
async function deleteEntry(models, population, entry, { itemId, actor, options, now }) {
  const held = await models.CyberiaProceduralJobItem.exists({
    jobId: entry.jobId,
    status: { $in: ['approved', 'promoted'] },
  });
  if (held)
    throw requestError('It is the selected or published result: use another result or reset the item first', 409);
  const { drafts } = await deleteJob({ models, jobId: entry.jobId, options, now });
  await recordAudit(models, {
    action: 'target.entry_deleted',
    actor,
    populationId: population._id,
    itemId,
    jobId: entry.jobId,
    jobItemId: entry.id || null,
    previousCid: entry.cid,
  });
  return drafts;
}

/** Drops draft CIDs from the drafts of a target. */
const dropDrafts = (models, population, itemId, cids) =>
  models.CyberiaProceduralPopulation.updateOne(
    { _id: population._id, 'targets.itemId': itemId },
    { $pull: { 'targets.$.drafts': { $in: cids } }, $inc: { revision: 1 } },
  );

/** Deletes one draft the target stored, when it does not use it and nothing keeps it. Answers the CIDs removed. */
async function deleteDraft(models, population, target, cid, { actor, options }) {
  const { itemId } = target;
  const definition = await models.ObjectLayer.findOne({ cid }, { origin: 1 }).lean();
  if (!definition) {
    if (!target.drafts.includes(cid)) throw requestError(`There is no Object Layer definition ${cid}`, 404);
    await dropDrafts(models, population, itemId, [cid]);
    return [];
  }
  if (!target.drafts.includes(cid) || definition.origin !== 'draft')
    throw requestError(`Definition ${cid} is not a draft this workflow stored: it stays`, 409);
  const held = heldBy(target, cid);
  if (held) throw requestError(held, 409);
  const keeper = (await revisionKeepers(models, [cid])).get(cid);
  if (keeper) throw requestError(`Draft ${cid} stays: ${keeper}`, 409);
  const purged = await purgeRevisions({ models, options, cids: [cid] });
  await dropDrafts(models, population, itemId, [cid]);
  await recordAudit(models, {
    action: 'target.draft_deleted',
    actor,
    populationId: population._id,
    itemId,
    previousCid: cid,
  });
  return purged;
}

/**
 * Deletes results of a target, on request: each id is a generated result (its run id) or the CID of
 * a draft the target stored. A generated result goes with its run, its candidate and every revision
 * nothing else keeps; a draft goes when the target does not use it and nothing keeps it. The
 * selected result, published content and what others use stay, each with its reason. Each delete is
 * its own: one that fails leaves the others done, and deleting again is safe. The audit records
 * each one.
 * @param {Object} params
 * @param {Object} params.models - {@link populationModels}.
 * @param {string} params.id
 * @param {string} params.itemId
 * @param {{ids:string[]}} params.body
 * @param {string} params.actor
 * @param {Object} params.options - Router options.
 * @param {Date} [params.now]
 * @returns {Promise<Object>} {@link populationView} with `deleted` `{ removed, retained, failures, purged }`:
 *   what went, what stayed and why, what failed, and the CIDs removed from storage.
 * @throws {Error} 400 for a body with no ids; 404 for an unknown target; 409 for a closed population.
 * @memberof CyberiaPopulationResults
 */
export async function deleteResults({ models, id, itemId, body, actor, options, now = new Date() }) {
  const population = await openPopulation(models, id);
  const { target } = targetOf(population, itemId);
  const { ids } = only(body, ['ids'], 'A delete');
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((value) => typeof value === 'string' && value))
    throw requestError('ids lists the results to delete');
  const entries = (await entriesOf(models, [population])).get(key(population, itemId)) ?? [];
  const report = { removed: [], retained: [], failures: [], purged: [] };
  for (const resultId of new Set(ids)) {
    const entry = isRunId(resultId) ? entries.find(({ jobId }) => jobId === resultId) : null;
    const label = entry ? `the generated result ${entry.cid || resultId}` : `the draft ${resultId}`;
    try {
      if (isRunId(resultId) && !entry) throw requestError(`${itemId} has no generated result ${resultId}`, 404);
      const purged = entry
        ? await deleteEntry(models, population, entry, { itemId, actor, options, now })
        : await deleteDraft(models, population, target, resultId, { actor, options });
      report.removed.push(label);
      report.purged.push(...purged);
    } catch (error) {
      (error.status === 409 ? report.retained : report.failures).push(`${label}: ${error.message}`);
    }
  }
  return { ...(await getPopulation(models, id)), deleted: report };
}

/**
 * Resets the workflow of an item to a clean start. Every run of the target goes with its candidate
 * and the revisions nothing else keeps, the selected one too; the target no longer uses its
 * definition, each draft it stored goes when nothing else keeps it, and it takes the recommendation
 * now with no palette choice and no variation. The next Generate gives new results. Published
 * definitions, bindings, placements, defaults, definitions another workflow stored and the
 * population audit stay. A run or a draft that does not go stays listed as a failure: running
 * the reset again retries it. A reset of a clean item changes nothing.
 * @param {Object} params
 * @param {Object} params.models - {@link populationModels}.
 * @param {string} params.id
 * @param {string} params.itemId
 * @param {string} params.actor
 * @param {Object} params.options - Router options.
 * @param {Date} [params.now]
 * @returns {Promise<Object>} {@link populationView} with `reset` `{ removed, retained, failures, purged,
 *   remaining: { runs, drafts } }`: what went, what stayed and why, what failed, the CIDs removed from
 *   storage, and what the workflow still owns after it.
 * @throws {Error} 404 for an unknown target; 409 for a closed population.
 * @memberof CyberiaPopulationResults
 */
export async function resetTarget({ models, id, itemId, actor, options, now = new Date() }) {
  const population = await openPopulation(models, id);
  const { at, target } = targetOf(population, itemId);
  const report = { removed: [], retained: [], failures: [], purged: [] };
  const runs = await runsOf(models, population._id, itemId);
  let deleted = 0;
  for (const { _id } of runs)
    try {
      report.purged.push(...(await deleteJob({ models, jobId: _id, options, now })).drafts);
      deleted++;
    } catch (error) {
      report.failures.push(`run ${_id}: ${error.message}`);
    }
  if (deleted > 0) report.removed.push(`${deleted} generated ${deleted === 1 ? 'result' : 'results'}`);

  const { own, current } = await capabilitiesNow(models, target);
  const bound = current.binding?.cid;
  const clean = {
    ...target,
    definitionCid: '',
    templateId: own.usable[0] ?? '',
    variation: null,
    palette: { slots: {} },
    hasRender: Boolean(bound) && (await renderedCids(models, [bound])).has(bound),
  };
  const next = await resolvedTarget(
    models,
    population,
    clean,
    recommendedOf(clean, resolutionsOf({ ...current, ...clean }, own)),
    actor,
  );
  const changed = JSON.stringify(next) !== JSON.stringify(target);
  if (changed) await writeTargets(models, population, replaced(population, at, next));
  if (target.definitionCid && !target.drafts.includes(target.definitionCid))
    report.retained.push(
      `the definition ${target.definitionCid}: this workflow did not store it; the item no longer uses it`,
    );

  const kinds = new Map(
    (await models.ObjectLayer.find({ cid: { $in: target.drafts } }, { cid: 1, origin: 1 }).lean()).map(
      ({ cid, origin }) => [cid, origin],
    ),
  );
  const stored = [...kinds.keys()];
  const keepers = await revisionKeepers(models, stored);
  const gone = target.drafts.filter((cid) => !kinds.has(cid));
  for (const cid of stored)
    if (kinds.get(cid) !== 'draft') report.retained.push(`the definition ${cid}: it is published`);
    else if (keepers.has(cid)) report.retained.push(`the draft ${cid}: ${keepers.get(cid)}`);
    else
      try {
        report.purged.push(...(await purgeRevisions({ models, options, cids: [cid] })));
        report.removed.push(`the draft ${cid}`);
        gone.push(cid);
      } catch (error) {
        report.failures.push(`the draft ${cid}: ${error.message}`);
      }
  if (gone.length > 0) await dropDrafts(models, population, itemId, gone);

  const [left, kept] = await Promise.all([
    runsOf(models, population._id, itemId),
    models.ObjectLayer.countDocuments({ cid: { $in: target.drafts.filter((cid) => !gone.includes(cid)) } }),
  ]);
  report.remaining = { runs: left.length, drafts: kept };
  report.retained.push('published definitions, bindings, placements, defaults and the population audit');
  if (changed || report.removed.length > 0 || report.failures.length > 0)
    await recordAudit(models, {
      action: 'target.reset',
      actor,
      populationId: population._id,
      itemId,
      reason: [
        `removed: ${report.removed.join('; ') || 'nothing'}`,
        `retained: ${report.retained.join('; ')}`,
        ...(report.failures.length > 0 ? [`failures: ${report.failures.join('; ')}`] : []),
      ].join(' · '),
    });
  return { ...(await getPopulation(models, id)), reset: report };
}
