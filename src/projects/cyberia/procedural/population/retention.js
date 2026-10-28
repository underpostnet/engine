/**
 * The working copies a closed map population keeps, and their cleanup. A population that published
 * holds its publication record (the reviewed plan and what the commit wrote), and the stored maps,
 * instances, universes and defaults hold what it published; its map draft and its instance, universe
 * and default drafts are then copies. A cancelled population published nothing. Both keep their
 * working copies for a retention window, for recovery and review, then a cleanup clears them.
 *
 * | state     | the population                                                           |
 * | --------- | ------------------------------------------------------------------------ |
 * | retained  | closed for less than the retention window: its working copies stay      |
 * | eligible  | closed for longer: a cleanup clears its working copies                    |
 * | cleaned   | `draftsPrunedAt` is set: the publication record and the targets stay      |
 *
 * An open population, one whose publication still runs or waits for its reload, or one a worker lease
 * holds, is never touched; the write checks it again. The cleanup deletes a thumbnail of a draft, or of
 * the stored document it started from, only when no instance or map of any content database or kept
 * release and no draft of any population references it, so a thumbnail the publication wrote stays. It
 * is idempotent: a second run finds nothing to clear.
 *
 * @module src/projects/cyberia/procedural/population/retention.js
 * @namespace CyberiaPopulationRetention
 */
import { dropDraftThumbnails } from './population.js';

/**
 * The days a closed population keeps its working copies.
 * @constant {number}
 * @memberof CyberiaPopulationRetention
 */
export const DRAFT_RETENTION_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

/** When a population closed: its publication completed, or a moderator cancelled it; null while it is not closed. */
const closedAt = ({ cancelledAt, publication }) => {
  if (publication?.status === 'completed')
    return publication.history.findLast(({ status }) => status === 'completed')?.at ?? null;
  return publication?.commit ? null : (cancelledAt ?? null);
};

/**
 * Clears the working copies of every closed population past the retention window: the map draft and
 * the instance, universe and default drafts, with the thumbnails nothing references any more. Writes
 * nothing without `apply`, and reports the same either way.
 * @param {Object} params
 * @param {Object} params.models - {@link populationModels}.
 * @param {Object} params.options - Router options: the File model of the host.
 * @param {boolean} [params.apply=false]
 * @param {number} [params.retentionDays] - {@link DRAFT_RETENTION_DAYS} by default.
 * @param {Date} [params.now]
 * @returns {Promise<{cleaned:Object[], retained:Object[]}>} Each population cleaned (or to clean without
 *   `apply`) with the bytes and drafts it held and the files it deletes and keeps, and each closed
 *   population the window still keeps.
 * @memberof CyberiaPopulationRetention
 */
export async function pruneClosedDrafts({
  models,
  options,
  apply = false,
  retentionDays = DRAFT_RETENTION_DAYS,
  now = new Date(),
}) {
  const { CyberiaProceduralPopulation: Population } = models;
  const holding = {
    draftsPrunedAt: null,
    $or: [
      { draft: { $ne: null } },
      { 'instanceDrafts.0': { $exists: true } },
      { 'universeDrafts.0': { $exists: true } },
      { 'defaultDrafts.0': { $exists: true } },
    ],
  };
  const closing = {
    $and: [
      { $or: [{ 'publication.status': 'completed' }, { cancelledAt: { $ne: null } }] },
      {
        $or: [{ publication: null }, { 'publication.lease': null }, { 'publication.lease.expiresAt': { $lt: now } }],
      },
    ],
  };
  const closed = await Population.aggregate([
    { $match: { $and: [holding, closing] } },
    { $addFields: { bytes: { $bsonSize: '$$ROOT' } } },
  ]);
  const cutoff = now.getTime() - retentionDays * DAY_MS;
  const report = { cleaned: [], retained: [] };
  for (const population of closed) {
    const at = closedAt(population);
    if (!at) continue;
    const entry = {
      id: String(population._id),
      mapCode: population.mapCode,
      closed: population.publication?.status === 'completed' ? 'published' : 'cancelled',
      at,
    };
    if (at.getTime() > cutoff) {
      report.retained.push({ ...entry, until: new Date(at.getTime() + retentionDays * DAY_MS) });
      continue;
    }
    const drafts = {
      map: population.draft ? 1 : 0,
      instances: population.instanceDrafts.length,
      universes: population.universeDrafts.length,
      defaults: population.defaultDrafts.length,
    };
    const exclude = { populationId: population._id, codes: population.instanceDrafts.map(({ code }) => code) };
    if (apply) {
      const written = await Population.updateOne(
        { _id: population._id, $and: [holding, closing] },
        { $set: { draft: null, instanceDrafts: [], universeDrafts: [], defaultDrafts: [], draftsPrunedAt: now } },
      );
      if (!written.modifiedCount) continue;
    }
    const files = await dropDraftThumbnails(models, population.instanceDrafts, { options, exclude, apply });
    report.cleaned.push({ ...entry, drafts, files, bytes: population.bytes });
  }
  return report;
}
