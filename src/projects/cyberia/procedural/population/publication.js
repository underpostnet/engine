/**
 * The publication of a map population: a background operation in ordered phases that the worker of
 * the Procedural Engine runs, under a lease, and that survives the browser and the server.
 *
 * | status               | what runs                                                          |
 * | -------------------- | ------------------------------------------------------------------ |
 * | `queued`             | nothing yet                                                        |
 * | `preflight`          | the checks; the plan freezes what the commit writes and checks       |
 * | `publishing_objects` | each approved revision goes to the Object Layer authority            |
 * | `committing_runtime` | one transaction: bindings, the map, the record                       |
 * | `refreshing_runtime` | caches, the map media, previews and the reload of the game servers   |
 * | `completed`          | everything converged                                                |
 *
 * The plan is the manifest of the publication: it freezes at the end of the preflight, with its hash,
 * and every later phase reads it, never the population. It holds only what the publication
 * changes: a kept item publishes and binds nothing, and the commit only checks that it still runs
 * the binding observed. Each asset names the revision it publishes (`revisionCid`), the definition
 * its item runs (`previousCid`) and, once published, the definition the authority holds
 * (`definitionCid`), with its own status, attempts and error. The preflight checks every asset
 * before the first publication: its revision is stored, publishes to itself, and keeps the stat
 * bounds of its type. A revision publishes exactly as stored, never composed over another one.
 *
 * A failed phase stops in `preflight_failed`, `objects_publish_failed` or `runtime_commit_failed`,
 * with an error that says whether a retry can help. A retry resumes the same plan: published assets
 * stay published. An integrity failure needs a repair, then a new review. After the commit, a reload
 * a game server misses leaves `published_reload_pending`, which the worker tries again; the commit
 * stands. A cancel before the commit is a request while a worker holds the publication: the worker
 * stops at its next checkpoint, between two assets, and only then is it `cancelled_before_commit`. A
 * published revision stays published and unbound; nothing deletes it. The transaction holds no
 * network call: the authority publishes before it opens.
 *
 * @module src/projects/cyberia/procedural/population/publication.js
 * @namespace CyberiaPopulationPublication
 */
import { createHash, randomUUID } from 'node:crypto';
import canonicalize from 'canonicalize';
import { loggerFactory } from '../../../../server/ops/logger.js';
import { CacheService } from '../../../../server/storage/cache.js';
import { CLOSED_BEFORE_COMMIT } from '../../../../api/cyberia-procedural-population/cyberia-procedural-population.model.js';
import { runsAnother } from '../../../../api/cyberia-item-catalog/cyberia-item-catalog.model.js';
import { mapCache, pendingMedia } from '../../../../api/cyberia-map/cyberia-map.service.js';
import { bindItem, exactDefinitionCid, renderedCids } from '../../catalog/object-layer-catalog.js';
import { reloadContentServers } from '../../content/content-release.js';
import { refreshMapMedia, refreshMapPreviews } from '../../instance/map-preview-generator.js';
import { integrityError, requestError, syncJob } from '../engine.js';
import { commitPromotion, publishRevision } from '../jobs/promotion.js';
import { targetUsage } from './map-context.js';
import {
  READY_STATES,
  draftProblems,
  findPopulation,
  getPopulation,
  keeps,
  liveMap,
  populationView,
} from './population.js';

const logger = loggerFactory(import.meta);

/** The statuses the worker runs. */
export const RUNNING = Object.freeze([
  'queued',
  'preflight',
  'publishing_objects',
  'committing_runtime',
  'refreshing_runtime',
]);
/** The status a retry resumes from, by failed status. */
const RESUMES = Object.freeze({
  preflight_failed: 'queued',
  objects_publish_failed: 'publishing_objects',
  runtime_commit_failed: 'committing_runtime',
  published_reload_pending: 'refreshing_runtime',
});
/** The statuses a moderator cancels: before the commit begins. */
const CANCELLABLE = Object.freeze([
  'queued',
  'preflight',
  'publishing_objects',
  'objects_publish_failed',
  'runtime_commit_failed',
]);
/** How long a claim holds a publication before another worker may take it. */
const LEASE_MS = 2 * 60 * 1000;
/** The reloads the worker tries before it waits for a moderator. */
export const RELOAD_TRIES = 5;
/** The wait before the next reload, doubled each try. */
const RELOAD_BACKOFF_MS = 30 * 1000;

const messageOf = (error) => String(error?.message ?? error);

/** The result of an asset before its publication. */
const PENDING = Object.freeze({ status: 'pending', definitionCid: '', attempts: 0, error: null });

/** The error of a failed step: its message, and whether a retry can help. */
const failureOf = (error, at = new Date()) => ({ message: messageOf(error), retryable: !error?.integrity, at });

/** The acknowledgements of a publication request, checked. */
/** Why a publication does not start: the population moved on after the review the moderator read. */
const changedSinceReview = () =>
  requestError('The population changed since you reviewed it: review it again, then publish', 409);

function acknowledgementsOf({ acknowledged = [] }) {
  if (!Array.isArray(acknowledged) || acknowledged.some((itemId) => typeof itemId !== 'string'))
    throw requestError('acknowledged lists item ids');
  return { acknowledged };
}

/**
 * What a publication of a population would do now, or why it would stop: the preflight with the
 * acknowledgements given, and nothing stored.
 * @param {Object} params
 * @param {Object} params.models - {@link populationModels}.
 * @param {string} params.id
 * @param {{acknowledged?:string[]}} [params.body]
 * @returns {Promise<{ready:boolean,problems:string[],plan:Object|null}>}
 * @throws {Error} 400 for an invalid acknowledgement; 404 for an unknown population.
 * @memberof CyberiaPopulationPublication
 */
export async function validatePublication({ models, id, body = {} }) {
  const population = await findPopulation(models, id);
  const { plan, problems } = await preflight(models, { ...population, publication: acknowledgementsOf(body) });
  return { ready: problems.length === 0, problems, plan };
}

/**
 * Starts the publication of a population at the revision the moderator reviewed, or answers the one
 * that runs: a request repeated while a publication runs starts nothing new.
 * @param {Object} params
 * @param {Object} params.models - {@link populationModels}.
 * @param {string} params.id
 * @param {string} params.actor
 * @param {number} params.revision - The population revision the moderator reviewed.
 * @param {string[]} [params.acknowledged] - Item ids whose global change the moderator accepts.
 * @param {Date} [params.now]
 * @returns {Promise<Object>} {@link populationView}.
 * @throws {Error} 400 for an invalid acknowledgement or revision; 409 for a cancelled or published
 *   population, an item that is not decided, or a population that changed since the review.
 * @memberof CyberiaPopulationPublication
 */
export async function requestPublication({ models, id, actor, revision, acknowledged = [], now = new Date() }) {
  acknowledgementsOf({ acknowledged });
  if (!Number.isInteger(revision)) throw requestError('A publication names the population revision it reviewed');
  const population = await findPopulation(models, id);
  if (population.cancelledAt) throw requestError('The population was cancelled', 409);
  const { publication } = population;
  if (publication?.commit) throw requestError('The population was published: retry its refresh, if one waits', 409);
  if (publication && !CLOSED_BEFORE_COMMIT.includes(publication.status))
    return await populationView(models, population);
  if (population.revision !== revision) throw changedSinceReview();
  const view = await populationView(models, population);
  if (view.steps.items.state !== 'ready')
    throw requestError(`Decide every item first: ${view.steps.items.detail}`, 409);
  const started = await models.CyberiaProceduralPopulation.updateOne(
    {
      _id: population._id,
      revision,
      $or: [{ publication: null }, { 'publication.status': { $in: CLOSED_BEFORE_COMMIT } }],
    },
    {
      $set: {
        publication: {
          id: randomUUID(),
          status: 'queued',
          requestedAt: now,
          requestedBy: actor,
          acknowledged,
          lease: null,
          cancelRequestedAt: null,
          reloadTries: 0,
          nextAttemptAt: null,
          plan: null,
          commit: null,
          refresh: null,
          error: null,
          history: [{ status: 'queued', at: now }],
        },
      },
    },
  );
  if (!started.modifiedCount) {
    const stored = await models.CyberiaProceduralPopulation.findById(population._id, { revision: 1 }).lean();
    if (stored.revision !== revision) throw changedSinceReview();
    logger.info('A publication of the population started meanwhile', { id });
  }
  return await getPopulation(models, id);
}

/**
 * Moves a publication from one status to the next while the worker holds it: nothing else moved it.
 * @returns {Promise<boolean>} Whether it moved.
 */
async function transition(models, population, { holder, from, to, set = {}, now = new Date() }) {
  const written = await models.CyberiaProceduralPopulation.updateOne(
    {
      _id: population._id,
      'publication.id': population.publication.id,
      'publication.status': from,
      'publication.lease.holder': holder,
    },
    {
      $set: {
        'publication.status': to,
        ...Object.fromEntries(Object.entries(set).map(([key, value]) => [`publication.${key}`, value])),
      },
      $push: { 'publication.history': { status: to, at: now } },
    },
  );
  return written.modifiedCount > 0;
}

/**
 * The plan of a publication, or why it cannot run: every item is decided; each kept item runs the
 * binding observed; the map is at the revision the draft starts from; each selection covers the
 * exact revision of its entry; each binding is the one its item read; the draft places only items
 * that run; each global change is accepted; each revision has its render. The plan freezes the
 * population revision, the kept bindings, the assets with the binding revision each replaces, the
 * map and draft revisions, the grid, and the map revision whose media the refresh draws.
 * @param {Object} models
 * @param {Object} population
 * @returns {Promise<{plan:Object|null,problems:string[]}>}
 * @memberof CyberiaPopulationPublication
 */
export async function preflight(models, population) {
  const { publication, draft } = population;
  const view = await populationView(models, { ...population, publication: null });
  const problems = [];
  const conflicts = view.targets.filter(({ state }) => state === 'conflict').map(({ itemId }) => itemId);
  if (conflicts.length > 0)
    problems.push(
      `The binding of ${conflicts.join(', ')} moved since it was kept: keep it again or choose new artwork`,
    );
  const undecided = view.targets
    .filter(({ state }) => !READY_STATES.includes(state) && state !== 'conflict')
    .map(({ itemId }) => itemId);
  if (undecided.length > 0)
    problems.push(`Keep the current artwork, select new artwork, author it by hand or remove: ${undecided.join(', ')}`);
  const kept = view.targets
    .filter(({ resolution }) => resolution === 'keep')
    .map(({ itemId, observed }) => ({ itemId, cid: observed.cid, bindingRevision: observed.bindingRevision }));
  const map = await liveMap(models, population.mapCode);
  if (draft && map.revision !== draft.baseRevision)
    problems.push(
      `Map ${map.code} is at revision ${map.revision}; the draft starts from revision ${draft.baseRevision}. Review the live map and rebase the draft`,
    );
  const selected = view.targets.filter(({ state }) => state === 'selected');
  const items = await models.CyberiaProceduralJobItem.find(
    { _id: { $in: selected.map(({ selected: entry }) => entry.id) }, status: 'approved' },
    { jobId: 1, targetItemId: 1, candidateCid: 1, sourceCid: 1, review: 1 },
  ).lean();
  const assets = [];
  for (const target of view.targets) {
    if (target.state === 'authored')
      assets.push({
        stage: target.stage,
        itemId: target.itemId,
        itemType: target.itemType,
        kind: 'definition',
        revisionCid: target.definitionCid,
        previousCid: target.cid ?? '',
        ...PENDING,
      });
    if (target.state !== 'selected') continue;
    const item = items.find(({ _id }) => String(_id) === target.selected.id);
    if (!item || item.review?.decision !== 'approved' || item.review.cid !== item.candidateCid) {
      problems.push(`The selection of ${target.itemId} does not cover its current revision: select it again`);
      continue;
    }
    assets.push({
      stage: target.stage,
      itemId: target.itemId,
      itemType: target.itemType,
      kind: item.sourceCid ? 'update' : 'create',
      jobId: String(item.jobId),
      jobItemId: String(item._id),
      revisionCid: item.candidateCid,
      previousCid: item.sourceCid ?? '',
      ...PENDING,
    });
  }
  const itemIds = assets.map(({ itemId }) => itemId);
  const revisionCids = assets.map(({ revisionCid }) => revisionCid);
  const [bindings, rendered, revisions] = await Promise.all([
    models.CyberiaItemCatalog.bindingsOf([...itemIds, ...kept.map(({ itemId }) => itemId)]),
    renderedCids(models, revisionCids),
    models.ObjectLayer.find({ cid: { $in: revisionCids } }, { cid: 1, data: 1 }).lean(),
  ]);
  for (const asset of assets) {
    const binding = bindings.get(asset.itemId);
    if ((binding?.cid ?? '') !== asset.previousCid)
      problems.push(runsAnother(asset.itemId, binding?.cid, asset.previousCid));
    asset.bindingRevision = binding?.revision ?? 0;
    problems.push(
      ...revisionProblems(
        asset,
        revisions.find(({ cid }) => cid === asset.revisionCid),
        rendered,
      ),
    );
  }
  if (draft)
    problems.push(
      ...(
        await draftProblems(models, draft.entities, new Map(assets.map(({ itemId, itemType }) => [itemId, itemType])))
      ).map((problem) => `The draft places what cannot run: ${problem}`),
    );
  const usage = await targetUsage(models, itemIds, {
    mapCode: population.mapCode,
    biomeId: population.context.biome?.id ?? null,
  });
  const unaccepted = itemIds.filter(
    (itemId) => usage.get(itemId).impact === 'global' && !publication.acknowledged.includes(itemId),
  );
  if (unaccepted.length > 0)
    problems.push(`Accept the change of ${unaccepted.join(', ')}: each runs beyond map ${population.mapCode} too`);
  if (problems.length > 0) return { plan: null, problems };
  const plan = {
    populationRevision: population.revision,
    mapRevision: map.revision,
    draftRevision: draft?.revision ?? null,
    grid: draft?.grid ?? null,
    placements: draft ? draft.entities.length : null,
    kept,
    assets,
    media: draft ? { mapCode: map.code, revision: map.revision + 1 } : null,
  };
  return { plan: { ...plan, manifestHash: manifestHashOf(plan) }, problems };
}

/**
 * What stops one asset from publishing exactly: its revision, its render frames, and its identity,
 * which holds its stats inside the stat contract. The save checked them against their bounds.
 */
function revisionProblems(asset, revision, rendered) {
  const { itemId, revisionCid } = asset;
  if (!revision) return [`Revision ${revisionCid} of ${itemId} is not stored`];
  const problems = [];
  if (!rendered.has(revisionCid)) problems.push(`Revision ${revisionCid} of ${itemId} has no stored render frames`);
  let exact = '';
  try {
    exact = exactDefinitionCid(revision);
  } catch (error) {
    problems.push(`Revision ${revisionCid} of ${itemId}: ${messageOf(error)}`);
  }
  if (exact && exact !== revisionCid)
    problems.push(
      `Revision ${revisionCid} of ${itemId} does not publish to itself: save it again in the Object Layer Studio`,
    );
  return problems;
}

/**
 * The hash of a manifest: what it publishes, binds and writes, without the progress of its assets.
 * @param {Object} plan
 * @returns {string}
 * @memberof CyberiaPopulationPublication
 */
export const manifestHashOf = ({ assets, manifestHash, ...plan }) =>
  createHash('sha256')
    .update(
      canonicalize({
        ...plan,
        assets: assets.map(({ status, definitionCid, attempts, error, ...asset }) => asset),
      }),
    )
    .digest('hex');

/** Runs the preflight of a publication and moves it to its next status. */
async function runPreflight(models, population, { holder }) {
  const { plan, problems } = await preflight(models, population);
  if (plan)
    return await transition(models, population, { holder, from: 'preflight', to: 'publishing_objects', set: { plan } });
  return await transition(models, population, {
    holder,
    from: 'preflight',
    to: 'preflight_failed',
    set: { error: { phase: 'preflight', message: problems.join('; '), problems, at: new Date() }, lease: null },
  });
}

/**
 * Whether the worker still holds the publication at a checkpoint: it stops when it lost the lease,
 * and cancels when a moderator asked for it.
 * @returns {Promise<boolean>} Whether to go on.
 */
async function checkpoint(models, population, { holder, from }) {
  const { publication } = await models.CyberiaProceduralPopulation.findById(population._id, { publication: 1 }).lean();
  if (publication?.id !== population.publication.id || publication.status !== from) return false;
  if (publication.lease?.holder !== holder) return false;
  if (!publication.cancelRequestedAt) return true;
  await transition(models, population, { holder, from, to: 'cancelled_before_commit', set: { lease: null } });
  return false;
}

/**
 * Publishes each asset of the plan that is not published yet, one at a time, and records its result:
 * the definition the authority holds, or the failure with whether a retry can help. Between two
 * assets it stops when it lost the lease or a moderator cancelled.
 */
async function publishObjects(models, population, { holder, options, publish }) {
  const { assets } = population.publication.plan;
  const held = { _id: population._id, 'publication.id': population.publication.id, 'publication.lease.holder': holder };
  for (const [index, asset] of assets.entries()) {
    if (asset.status === 'published') continue;
    if (!(await checkpoint(models, population, { holder, from: 'publishing_objects' }))) return false;
    const at = `publication.plan.assets.${index}`;
    await models.CyberiaProceduralPopulation.updateOne(held, { $inc: { [`${at}.attempts`]: 1 } });
    try {
      const definition = await publish({ models, revisionCid: asset.revisionCid, options });
      await models.CyberiaProceduralPopulation.updateOne(held, {
        $set: {
          [`${at}.status`]: 'published',
          [`${at}.definitionCid`]: definition.cid,
          [`${at}.error`]: null,
          'publication.lease.expiresAt': new Date(Date.now() + LEASE_MS),
        },
      });
    } catch (error) {
      const failure = failureOf(error);
      await models.CyberiaProceduralPopulation.updateOne(held, {
        $set: { [`${at}.status`]: 'failed', [`${at}.error`]: failure },
      });
      return await transition(models, population, {
        holder,
        from: 'publishing_objects',
        to: 'objects_publish_failed',
        set: {
          error: { phase: 'publishing_objects', itemId: asset.itemId, revisionCid: asset.revisionCid, ...failure },
          lease: null,
        },
      });
    }
  }
  if (!(await checkpoint(models, population, { holder, from: 'publishing_objects' }))) return false;
  return await transition(models, population, { holder, from: 'publishing_objects', to: 'committing_runtime' });
}

/** Why the bindings of a plan moved since its preflight: each kept item and each asset at the revision read. */
async function movedBindings(models, plan, session) {
  const bindings = await models.CyberiaItemCatalog.bindingsOf(
    [...plan.kept, ...plan.assets].map(({ itemId }) => itemId),
    session,
  );
  return [
    ...plan.kept
      .filter((entry) => !keeps(entry, bindings.get(entry.itemId)))
      .map(({ itemId }) => `${itemId} no longer runs the binding it keeps`),
    ...plan.assets
      .filter(({ itemId, bindingRevision }) => (bindings.get(itemId)?.revision ?? 0) !== bindingRevision)
      .map(({ itemId }) => `${itemId} was bound again after the preflight`),
  ];
}

/**
 * Commits a publication in one transaction: checks the population and every binding of the plan,
 * binds each asset at the binding its target read, writes the draft onto the same map at the revision of the plan with one revision more and its media pending,
 * and records the commit. All of it applies, or none of it does.
 */
async function commitRuntime(models, population, { holder, options }) {
  const { publication, draft } = population;
  const { plan } = publication;
  const now = new Date();
  const session = await models.CyberiaProceduralPopulation.db.startSession();
  try {
    if (population.revision !== plan.populationRevision)
      throw requestError(`The population moved to revision ${population.revision} after the preflight`, 409);
    if (draft && draft.revision !== plan.draftRevision)
      throw requestError(`The draft moved to revision ${draft.revision} after the preflight`, 409);
    const map = await liveMap(models, population.mapCode);
    await session.withTransaction(async () => {
      const moved = await movedBindings(models, plan, session);
      if (moved.length > 0) throw requestError(moved.join('; '), 409);
      for (const asset of plan.assets) {
        if (asset.kind === 'definition') {
          await bindItem({
            models,
            itemId: asset.itemId,
            objectLayerCid: asset.definitionCid,
            expectedCid: asset.previousCid || null,
            source: 'procedural',
            by: publication.requestedBy,
            session,
            options,
          });
          continue;
        }
        const item = await models.CyberiaProceduralJobItem.findById(asset.jobItemId).session(session).lean();
        await commitPromotion({
          models,
          item,
          definition: { cid: asset.definitionCid },
          actor: publication.requestedBy,
          action: asset.kind === 'create' ? 'item.created' : 'item.promoted',
          session,
          options,
          now,
        });
      }
      if (draft) {
        const written = await models.CyberiaMap.updateOne(
          { _id: map._id, revision: plan.mapRevision },
          {
            $set: { ...draft.grid, entities: draft.entities, media: pendingMedia(plan.media.revision) },
            $inc: { revision: 1 },
          },
          { session, runValidators: true },
        );
        if (!written.modifiedCount) throw requestError(`Map ${map.code} changed after the preflight`, 409);
      }
      const commit = {
        at: now,
        kept: plan.kept,
        assets: plan.assets.map(({ stage, itemId, kind, previousCid, revisionCid, definitionCid }) => ({
          stage,
          itemId,
          kind,
          previousCid,
          revisionCid,
          definitionCid,
        })),
        map: draft
          ? {
              code: map.code,
              from: plan.mapRevision,
              to: plan.mapRevision + 1,
              grid: plan.grid,
              placements: plan.placements,
            }
          : null,
      };
      const recorded = await models.CyberiaProceduralPopulation.updateOne(
        {
          _id: population._id,
          'publication.id': publication.id,
          'publication.status': 'committing_runtime',
          'publication.lease.holder': holder,
          'publication.commit': null,
        },
        {
          $set: { 'publication.commit': commit, 'publication.status': 'refreshing_runtime', 'publication.error': null },
          $push: { 'publication.history': { status: 'refreshing_runtime', at: now } },
        },
        { session },
      );
      if (!recorded.modifiedCount) throw requestError('The publication moved meanwhile', 409);
    });
  } catch (error) {
    await transition(models, population, {
      holder,
      from: 'committing_runtime',
      to: 'runtime_commit_failed',
      set: {
        error: {
          phase: 'committing_runtime',
          ...failureOf(error.status === 409 ? integrityError(messageOf(error)) : error),
        },
        lease: null,
      },
    });
    return false;
  } finally {
    await session.endSession();
  }
  for (const jobId of new Set(plan.assets.map(({ jobId }) => jobId).filter(Boolean)))
    await syncJob({ models, jobId, now });
  return true;
}

/**
 * The media of the map revision a commit wrote: `ready` with the preview File once it is stored,
 * `failed` with the error of its render, `superseded` once a later write of the map owns the media.
 */
async function mediaOfCommit(media, options) {
  const current = await refreshMapMedia({ code: media.mapCode }, options);
  if (!current?.media) return { ...media, status: 'failed', preview: null, error: `Map ${media.mapCode} is gone` };
  if (current.media.revision > media.revision) return { ...media, status: 'superseded', preview: null, error: '' };
  return { ...media, status: current.media.status, preview: current.preview ?? null, error: current.media.error ?? '' };
}

/**
 * Refreshes what a commit leaves to refresh: the map cache, the media of the map revision it wrote,
 * the previews of every map the assets reach, and the game servers: the worlds of the map rebuild
 * after a map change, and every world reloads its object layers after a binding.
 * @param {Object} params
 * @param {Object} params.models
 * @param {Object} params.population
 * @param {Object} params.options - Router options.
 * @returns {Promise<{cache:boolean,media:Object|null,previews:string,servers:Object[]}>}
 * @memberof CyberiaPopulationPublication
 */
export async function refreshPublication({ models, population, options }) {
  const { commit, plan } = population.publication;
  const itemIds = commit.assets.map(({ itemId }) => itemId);
  await CacheService.invalidate(mapCache(options));
  const media = plan.media ? await mediaOfCommit(plan.media, options) : null;
  let previews = 'refreshed';
  try {
    if (itemIds.length > 0) await refreshMapPreviews({ itemIds, options });
  } catch (error) {
    previews = messageOf(error);
  }
  const servers = [
    ...(commit.map
      ? (
          await Promise.all(
            population.context.instances.map(({ code }) =>
              reloadContentServers(options, { mode: 'full', instanceCode: code }),
            ),
          )
        ).flat()
      : []),
    ...(itemIds.length > 0 ? await reloadContentServers(options, { mode: 'incremental' }) : []),
  ];
  return { cache: true, media, previews, servers };
}

/** Runs the refresh of a committed publication and records each result; a missed reload waits and tries again. */
async function refreshRuntime(models, population, { holder, options, refresh }) {
  const { publication } = population;
  let result;
  try {
    result = await refresh({ models, population, options });
  } catch (error) {
    result = {
      cache: false,
      media: null,
      previews: '',
      servers: [{ instanceCode: '', url: '', error: messageOf(error) }],
    };
  }
  const missed = [
    ...result.servers.filter(({ error }) => error),
    ...(result.media?.status === 'failed'
      ? [{ url: `media of ${result.media.mapCode} revision ${result.media.revision}`, error: result.media.error }]
      : []),
  ];
  const at = new Date();
  if (missed.length === 0)
    return await transition(models, population, {
      holder,
      from: 'refreshing_runtime',
      to: 'completed',
      set: { refresh: { ...result, at }, lease: null, nextAttemptAt: null, error: null },
    });
  const tries = (publication.reloadTries ?? 0) + 1;
  return await transition(models, population, {
    holder,
    from: 'refreshing_runtime',
    to: 'published_reload_pending',
    set: {
      refresh: { ...result, at },
      lease: null,
      reloadTries: tries,
      nextAttemptAt: tries < RELOAD_TRIES ? new Date(at.getTime() + RELOAD_BACKOFF_MS * 2 ** (tries - 1)) : null,
      error: {
        phase: 'refreshing_runtime',
        message: missed.map(({ url, error }) => `${url || 'reload'}: ${error}`).join('; '),
        retryable: true,
        at,
      },
    },
  });
}

/**
 * Leases the next publication that runs with no live lease, or whose reload waits and is due.
 * @param {Object} params
 * @param {Object} params.models
 * @param {string} params.holder - The worker.
 * @param {Date} [params.now]
 * @returns {Promise<Object|null>} The leased population, or null.
 * @memberof CyberiaPopulationPublication
 */
export async function claimPublication({ models, holder, now = new Date() }) {
  const lease = { holder, expiresAt: new Date(now.getTime() + LEASE_MS) };
  const running = await models.CyberiaProceduralPopulation.findOneAndUpdate(
    {
      'publication.status': { $in: RUNNING },
      $or: [{ 'publication.lease': null }, { 'publication.lease.expiresAt': { $lt: now } }],
    },
    { $set: { 'publication.lease': lease } },
    { returnDocument: 'after', sort: { 'publication.requestedAt': 1 } },
  ).lean();
  if (running) return running;
  return await models.CyberiaProceduralPopulation.findOneAndUpdate(
    { 'publication.status': 'published_reload_pending', 'publication.nextAttemptAt': { $lte: now } },
    {
      $set: { 'publication.lease': lease, 'publication.status': 'refreshing_runtime' },
      $push: { 'publication.history': { status: 'refreshing_runtime', at: now } },
    },
    { returnDocument: 'after' },
  ).lean();
}

/**
 * Runs a leased publication phase after phase until it completes, fails, waits, or loses its lease.
 * @param {Object} params
 * @param {Object} params.models - {@link populationModels}.
 * @param {Object} params.population - A leased population.
 * @param {string} params.holder
 * @param {Object} params.options - Router options.
 * @param {Function} [params.publish] - Publishes a revision: {@link publishRevision}.
 * @param {Function} [params.refresh] - Refreshes the runtime: {@link refreshPublication}.
 * @returns {Promise<string>} The status it stops in.
 * @memberof CyberiaPopulationPublication
 */
export async function advancePublication({
  models,
  population,
  holder,
  options,
  publish = publishRevision,
  refresh = refreshPublication,
}) {
  let current = population;
  for (;;) {
    const { status, cancelRequestedAt } = current.publication;
    if (!RUNNING.includes(status) || current.publication.lease?.holder !== holder) return status;
    if (cancelRequestedAt && CANCELLABLE.includes(status))
      await transition(models, current, { holder, from: status, to: 'cancelled_before_commit', set: { lease: null } });
    else if (status === 'queued') await transition(models, current, { holder, from: 'queued', to: 'preflight' });
    else if (status === 'preflight') await runPreflight(models, current, { holder });
    else if (status === 'publishing_objects') await publishObjects(models, current, { holder, options, publish });
    else if (status === 'committing_runtime') await commitRuntime(models, current, { holder, options });
    else await refreshRuntime(models, current, { holder, options, refresh });
    const next = await findPopulation(models, current._id);
    if (next.publication?.status === status && next.publication.lease?.holder === holder) return status;
    current = next;
  }
}

/**
 * Runs every publication that waits for the worker.
 * @param {Object} params
 * @param {Object} params.models - {@link populationModels}.
 * @param {Object} params.options - Router options.
 * @param {string} params.holder
 * @returns {Promise<number>} Publications run.
 * @memberof CyberiaPopulationPublication
 */
export async function drainPublications({ models, options, holder }) {
  let run = 0;
  for (let population = await claimPublication({ models, holder }); population;) {
    run++;
    try {
      await advancePublication({ models, population, holder, options });
    } catch (error) {
      logger.warn(`Publication of population ${population._id} stopped: ${messageOf(error)}`);
    }
    population = await claimPublication({ models, holder });
  }
  return run;
}

/**
 * Resumes a failed phase on the same manifest: the preflight from the start, the assets not
 * published yet, the commit with its checks, or the refresh of the runtime. A failure a retry
 * meets again needs a repair: cancel, repair, then review and publish again.
 * @param {Object} params
 * @param {Object} params.models
 * @param {string} params.id
 * @param {Date} [params.now]
 * @returns {Promise<Object>} {@link populationView}.
 * @throws {Error} 409 when no phase failed, or when the failure needs a repair.
 * @memberof CyberiaPopulationPublication
 */
export async function retryPublication({ models, id, now = new Date() }) {
  const population = await findPopulation(models, id);
  const { status, error } = population.publication ?? {};
  if (!RESUMES[status]) throw requestError('No phase of the publication waits for a retry', 409);
  if (error?.retryable === false)
    throw requestError(
      `A retry meets this failure again: ${error.message}. Cancel the publication, repair it, then review and publish again`,
      409,
    );
  const written = await models.CyberiaProceduralPopulation.updateOne(
    { _id: population._id, 'publication.id': population.publication.id, 'publication.status': status },
    {
      $set: {
        'publication.status': RESUMES[status],
        'publication.lease': null,
        'publication.nextAttemptAt': null,
        'publication.error': null,
        ...(status === 'published_reload_pending' && { 'publication.reloadTries': 0 }),
      },
      $push: { 'publication.history': { status: RESUMES[status], at: now } },
    },
  );
  if (!written.modifiedCount) throw requestError('The publication moved meanwhile: reload it', 409);
  return await getPopulation(models, id);
}

/**
 * Cancels a publication before its commit. With no worker on it, it cancels at once; while a worker
 * holds it, the cancel is a request the worker honors at its next checkpoint. The population takes
 * changes again once it is cancelled; a revision it published stays published and unbound.
 * @param {Object} params
 * @param {Object} params.models
 * @param {string} params.id
 * @param {Date} [params.now]
 * @returns {Promise<Object>} {@link populationView}.
 * @throws {Error} 409 once the commit began.
 * @memberof CyberiaPopulationPublication
 */
export async function cancelPublication({ models, id, now = new Date() }) {
  const population = await findPopulation(models, id);
  const { status, lease } = population.publication ?? {};
  if (!CANCELLABLE.includes(status))
    throw requestError('Only a publication before its commit cancels: a commit stands once it began', 409);
  const held = RUNNING.includes(status) && lease?.expiresAt && new Date(lease.expiresAt) > now;
  const written = await models.CyberiaProceduralPopulation.updateOne(
    { _id: population._id, 'publication.id': population.publication.id, 'publication.status': status },
    held
      ? { $set: { 'publication.cancelRequestedAt': now } }
      : {
          $set: { 'publication.status': 'cancelled_before_commit', 'publication.lease': null },
          $push: { 'publication.history': { status: 'cancelled_before_commit', at: now } },
        },
  );
  if (!written.modifiedCount) throw requestError('The publication moved meanwhile: reload it', 409);
  return await getPopulation(models, id);
}
