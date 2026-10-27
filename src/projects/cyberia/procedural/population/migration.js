/**
 * The migration of map populations to the record version of the model. A version 2 to 6 record
 * moves; a record of any other earlier version stays outdated and read-only, and a delete takes it.
 *
 * | earlier record                       | version 7                                                      |
 * | ------------------------------------ | -------------------------------------------------------------- |
 * | v2 target with `kept: true`          | resolution `keep` at the CID it read, at the revision it bound |
 * | v2 target with `excluded`            | a removed target, with who removed it, when and why           |
 * | v2 or v3 entity-default change       | kept in full in `migration.legacyDefaults`; the row it names  |
 * |                                      | joins the defaults workspace                                   |
 * | v2 or v3 publication before commit   | cancelled before its commit: the moderator publishes again     |
 * | strategy `create`, `definition`, none | resolution `template`, `author`, `author`                      |
 * | palette `<itemType>.<slug>`          | the global palette `<slug>`, with the same colors              |
 * | publication asset `cid`, `published` | `revisionCid`, its status and its definition; a manifest hash  |
 * | target `runs`                        | none: each job names the item of the target that listed it, or |
 * |                                      | of its candidate when none did; `nextRun` counts the jobs, so  |
 * |                                      | no later run takes an earlier seed                             |
 * | no list of stored drafts             | `drafts` empty: an earlier draft shows among the stored        |
 * |                                      | definitions of its item, and a reset leaves it                 |
 *
 * A version 4 to 6 record keeps its revision, its defaults, its publication and the report of its
 * own migration. Nothing changes a binding, a CID, an entity-type default, a placement or a job. The jobs
 * of a removed target stop their active work and stay, with their audit. Running the migration
 * again changes nothing.
 *
 * @module src/projects/cyberia/procedural/population/migration.js
 * @namespace CyberiaPopulationMigration
 */
import {
  CLOSED_BEFORE_COMMIT,
  POPULATION_VERSION,
} from '../../../../api/cyberia-procedural-population/cyberia-procedural-population.model.js';
import { runsOf, stopJob } from './population.js';
import { manifestHashOf } from './publication.js';

/** The record versions this migration moves. */
const FROM_VERSIONS = Object.freeze([2, 3, 4, 5, 6]);

/** The resolution of each earlier strategy; a target with none is authored by hand. */
const RESOLUTION_OF = Object.freeze({
  keep: 'keep',
  render: 'render',
  template: 'template',
  create: 'template',
  definition: 'author',
});

/** The global palette id of an earlier Palette Template id: `<itemType>.<slug>` is `<slug>`. */
const globalPaletteId = (id) => id.slice(id.indexOf('.') + 1);

/**
 * The binding revision at which a catalog entry bound a CID: its last entry of that CID in the
 * history, else the revision it is at when it runs that CID now; 0 when it never ran it.
 */
function revisionOf(entry, cid) {
  const at = (entry?.history ?? []).map(({ objectLayerCid }) => objectLayerCid).lastIndexOf(cid);
  if (at >= 0) return at + 1;
  return entry?.objectLayerCid === cid ? (entry.history?.length ?? 0) : 0;
}

/** The targets and removed targets of a version 2 record, and the targets it kept. */
function keptTargets(record, catalog, now) {
  const kept = [];
  const removed = [];
  const targets = [];
  for (const { kept: wasKept, excluded, ...stored } of record.targets) {
    const keeps = wasKept && Boolean(stored.cid);
    const target = {
      ...stored,
      strategy: keeps ? 'keep' : stored.strategy,
      observed: keeps ? { cid: stored.cid, bindingRevision: revisionOf(catalog.get(stored.itemId), stored.cid) } : null,
    };
    if (keeps) kept.push({ itemId: stored.itemId, ...target.observed });
    if (excluded)
      removed.push({ target, by: excluded.by ?? '', at: excluded.at ?? now, reason: excluded.reason ?? '' });
    else targets.push(target);
  }
  return { targets, removed, kept };
}

/**
 * A target of an earlier version in this version: its resolution, its palette under its global id,
 * and none of the lists it froze. What moved goes to `moves`.
 */
function currentTarget({ strategies, recommended, templates, strategy, ...stored }, moves, palettes) {
  const resolution = RESOLUTION_OF[strategy] ?? 'author';
  if (strategy !== resolution)
    moves.resolutions.push({ itemId: stored.itemId, from: strategy ?? null, to: resolution });
  const { paletteId } = stored.palette ?? {};
  const renamed = paletteId ? globalPaletteId(paletteId) : paletteId;
  if (renamed !== paletteId)
    moves.palettes.push({ itemId: stored.itemId, from: paletteId, to: renamed, resolved: palettes.has(renamed) });
  return {
    ...stored,
    resolution,
    palette: { slots: {}, ...stored.palette, ...(renamed && { paletteId: renamed }) },
  };
}

/**
 * A publication of an earlier version in the current form: each asset names its revision and its
 * result, the manifest has its hash, and each error says whether a retry can help. An asset that
 * failed before the exact publication retries.
 */
function currentPublication(publication) {
  if (!publication) return null;
  const plan = publication.plan && {
    ...publication.plan,
    assets: publication.plan.assets.map(({ cid, published, error, ...asset }) => ({
      ...asset,
      revisionCid: cid,
      status: published ? 'published' : error ? 'failed' : 'pending',
      definitionCid: published ? cid : '',
      attempts: published || error ? 1 : 0,
      error: error ? { message: error, retryable: true, at: null } : null,
    })),
  };
  const { conflict, ...error } = publication.error ?? {};
  return {
    ...publication,
    cancelRequestedAt: null,
    plan: plan && { ...plan, manifestHash: manifestHashOf(plan) },
    commit: publication.commit && {
      ...publication.commit,
      assets: publication.commit.assets.map(({ cid, ...asset }) => ({
        ...asset,
        revisionCid: cid,
        definitionCid: cid,
      })),
    },
    error: publication.error ? { ...error, retryable: !conflict } : null,
  };
}

/** A version 2 to 5 population in the form of version 6, and what the move changed and kept. */
function sixOf(record, { catalog, rows, palettes, now }) {
  const publication = currentPublication(record.publication);
  if (record.version === 5) return { set: { publication }, report: { manifest: Boolean(publication?.plan) } };
  const moved =
    record.version === 2
      ? keptTargets(record, catalog, now)
      : { targets: record.targets, removed: record.removed ?? [], kept: [] };
  const moves = { resolutions: [], palettes: [] };
  const targets = moved.targets.map((target) => currentTarget(target, moves, palettes));
  const removed = moved.removed.map((entry) => ({ ...entry, target: currentTarget(entry.target, moves, palettes) }));
  if (record.version === 4) return { set: { targets, removed, publication }, report: moves };
  const legacyDefaults = (record.defaults ?? []).map(({ rowId, action, row, expectedUpdatedAt }) => ({
    rowId: String(rowId),
    action,
    row: row ?? null,
    expectedUpdatedAt: expectedUpdatedAt ?? null,
  }));
  const added = (record.defaults ?? [])
    .map(({ rowId }) => rowId)
    .filter(
      (rowId, at, all) => rows.has(String(rowId)) && all.findIndex((other) => String(other) === String(rowId)) === at,
    );
  const running = publication && !publication.commit && !CLOSED_BEFORE_COMMIT.includes(publication.status);
  const report = {
    kept: moved.kept,
    removed:
      record.version === 2
        ? moved.removed.map(({ target }) => ({ itemId: target.itemId, runs: (target.runs ?? []).length }))
        : [],
    legacyDefaults,
    publication: running ? `cancelled before its commit at ${publication.status}: publish again` : null,
  };
  return {
    set: {
      revision: record.revision ?? 0,
      targets,
      removed,
      defaults: { added, removed: [] },
      migration: { from: record.version, at: now, ...report },
      publication: running
        ? {
            ...publication,
            status: 'cancelled_before_commit',
            lease: null,
            history: [...(publication.history ?? []), { status: 'cancelled_before_commit', at: now }],
          }
        : publication,
    },
    report: { ...report, ...moves },
  };
}

/**
 * Names on each job of an earlier population the item it generates: the target whose runs list it,
 * else the item its candidate names. A job that names its item already stays as it is.
 */
async function tagRuns(Job, record) {
  const untagged = { populationId: record._id, populationItemId: { $in: ['', null] } };
  for (const target of [...record.targets, ...(record.removed ?? []).map(({ target: removed }) => removed)])
    if (target.runs?.length > 0)
      await Job.collection.updateMany(
        { ...untagged, _id: { $in: target.runs } },
        { $set: { populationItemId: target.itemId } },
      );
  for (const { _id, spec } of await Job.find(untagged, { 'spec.candidates.targetItemId': 1 }).lean())
    await Job.collection.updateOne(
      { _id, ...untagged },
      { $set: { populationItemId: spec.candidates?.[0]?.targetItemId ?? '' } },
    );
}

/**
 * A version 2 to 6 population in this version, and what the move changed and kept. Pure.
 * @param {Object} record - A lean version 2 to 6 population.
 * @param {Object} live
 * @param {Map<string,Object>} live.catalog - The catalog entry of each kept item, with its history.
 * @param {Set<string>} live.rows - The ids of the stored entity-type defaults among those the changes name.
 * @param {Set<string>} live.palettes - The ids of the global palettes.
 * @param {number} live.runs - The jobs that name the population.
 * @param {Date} live.now
 * @returns {{set:Object,report:Object}}
 * @memberof CyberiaPopulationMigration
 */
export function migratedPopulation(record, live) {
  const { set, report } = record.version === 6 ? { set: {}, report: {} } : sixOf(record, live);
  const current = ({ runs, ...target }) => ({ ...target, drafts: [] });
  const targets = (set.targets ?? record.targets).map(current);
  const removed = (set.removed ?? record.removed ?? []).map((entry) => ({ ...entry, target: current(entry.target) }));
  return {
    set: { ...set, version: POPULATION_VERSION, nextRun: live.runs, targets, removed },
    report: { ...report, nextRun: live.runs },
  };
}

/**
 * Moves every version 2 to 6 population to this version, or reports what a move would do with
 * `apply` false. A record of another earlier version stays outdated, with its recovery.
 * @param {Object} models - {@link populationModels}.
 * @param {Object} params
 * @param {boolean} params.apply - Whether to write.
 * @param {Set<string>} params.palettes - The ids of the global palettes.
 * @param {string} [params.actor] - Who the job audit names for a stopped run.
 * @param {Date} [params.now]
 * @returns {Promise<{applied:boolean,migrated:Object[],outdated:Object[]}>}
 * @memberof CyberiaPopulationMigration
 */
export async function migratePopulations(
  models,
  { apply, palettes, actor = 'population-migration', now = new Date() },
) {
  const {
    CyberiaProceduralPopulation: Population,
    CyberiaProceduralJob,
    CyberiaItemCatalog,
    CyberiaEntityTypeDefault,
  } = models;
  const records = await Population.find({ version: { $ne: POPULATION_VERSION } })
    .sort({ createdAt: 1 })
    .lean();
  const result = { applied: apply, migrated: [], outdated: [] };
  for (const record of records) {
    if (!FROM_VERSIONS.includes(record.version)) {
      result.outdated.push({
        id: String(record._id),
        mapCode: record.mapCode,
        version: record.version,
        recovery: `No migration moves version ${record.version}: delete it and start the map again`,
      });
      continue;
    }
    const keptIds = record.version === 2 ? record.targets.filter(({ kept }) => kept).map(({ itemId }) => itemId) : [];
    const named = record.version >= 4 ? [] : (record.defaults ?? []).map(({ rowId }) => rowId);
    const [entries, stored, runs] = await Promise.all([
      CyberiaItemCatalog.find({ itemId: { $in: keptIds } }, { itemId: 1, objectLayerCid: 1, history: 1 }).lean(),
      CyberiaEntityTypeDefault.find({ _id: { $in: named } }, { _id: 1 }).lean(),
      CyberiaProceduralJob.countDocuments({ populationId: record._id }),
    ]);
    const { set, report } = migratedPopulation(record, {
      catalog: new Map(entries.map((entry) => [entry.itemId, entry])),
      rows: new Set(stored.map(({ _id }) => String(_id))),
      palettes,
      runs,
      now,
    });
    if (apply) {
      await tagRuns(CyberiaProceduralJob, record);
      if (record.version === 2)
        for (const { target } of set.removed)
          for (const { _id } of await runsOf(models, record._id, target.itemId))
            await stopJob(models, _id, {
              actor,
              reason: `${target.itemId} removed by the population migration`,
              now,
            });
      await Population.collection.updateOne({ _id: record._id, version: record.version }, { $set: set });
    }
    result.migrated.push({ id: String(record._id), mapCode: record.mapCode, from: record.version, ...report });
  }
  return result;
}
