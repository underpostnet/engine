/**
 * Operator work on player records: the archived prune of quest progress no profile owns and its
 * restore, and the review and explicit rebind of held stacks. Each operation reports without
 * `apply` and writes only with it.
 *
 * @module src/projects/cyberia/player/player-maintenance.js
 * @namespace CyberiaPlayerMaintenance
 */

/** The archive the prune moves quest progress to, beside the quest progress. */
const QUEST_PROGRESS_ARCHIVE = 'cyberiaquestprogressarchives';

/** How many record ids a report names. */
const SAMPLE_SIZE = 10;

/**
 * The quest progress no profile owns: `legacy` records have no profile key at all; `orphaned`
 * records name a profile that does not exist.
 */
const unownedQuestProgress = async ({ QuestProgress, Player }) =>
  await QuestProgress.aggregate([
    { $lookup: { from: Player.collection.name, localField: 'player', foreignField: '_id', as: 'owner' } },
    { $match: { owner: { $size: 0 } } },
    { $project: { owner: 0 } },
  ]);

/** The indexes a sync would drop whose keys name a field the schema still has: not legacy. */
const unexpectedIndexes = (QuestProgress, toDrop, existing) =>
  toDrop.filter((name) =>
    Object.keys(existing.find((index) => index.name === name)?.key ?? {}).some((field) =>
      QuestProgress.schema.path(field),
    ),
  );

/**
 * Moves the quest progress no profile owns to an archive, then makes the quest progress indexes
 * match the schema. Without `apply` it only reports. It changes nothing when a sync would drop an
 * index that is not a legacy one, or when the archive copy does not match.
 * @param {{QuestProgress: import('mongoose').Model, Player: import('mongoose').Model}} models
 * @param {{apply?: boolean}} [options]
 * @returns {Promise<{legacy: number, orphaned: number, sample: string[], indexes: {toDrop: string[], toCreate: object[]}, archived: number, applied: boolean}>}
 * @memberof CyberiaPlayerMaintenance
 */
const pruneQuestProgress = async ({ QuestProgress, Player }, { apply = false } = {}) => {
  const unowned = await unownedQuestProgress({ QuestProgress, Player });
  const indexes = await QuestProgress.diffIndexes();
  const report = {
    legacy: unowned.filter((record) => record.player === undefined).length,
    orphaned: unowned.filter((record) => record.player !== undefined).length,
    sample: unowned.slice(0, SAMPLE_SIZE).map((record) => String(record._id)),
    indexes,
    archived: 0,
    applied: false,
  };
  if (!apply) return report;
  const unexpected = unexpectedIndexes(QuestProgress, indexes.toDrop, await QuestProgress.collection.indexes());
  if (unexpected.length) throw new Error(`prune-quest-progress: refusing to drop ${unexpected.join(', ')}`);
  const archive = QuestProgress.db.collection(QUEST_PROGRESS_ARCHIVE);
  if (unowned.length) {
    const archivedAt = new Date();
    await archive.bulkWrite(
      unowned.map((record) => ({
        replaceOne: { filter: { _id: record._id }, replacement: { ...record, archivedAt }, upsert: true },
      })),
    );
    const ids = unowned.map((record) => record._id);
    if ((await archive.countDocuments({ _id: { $in: ids } })) !== ids.length)
      throw new Error('prune-quest-progress: the archive copy does not match; nothing was removed');
    await QuestProgress.deleteMany({ _id: { $in: ids } });
  }
  await QuestProgress.syncIndexes();
  return { ...report, archived: unowned.length, applied: true };
};

/**
 * Returns archived quest progress whose profile exists again. A legacy record stays archived: the
 * current schema keys quest progress by profile. Without `apply` it only reports.
 * @param {{QuestProgress: import('mongoose').Model, Player: import('mongoose').Model}} models
 * @param {{apply?: boolean}} [options]
 * @returns {Promise<{restorable: number, kept: number, restored: number, applied: boolean}>}
 * @memberof CyberiaPlayerMaintenance
 */
const restoreQuestProgress = async ({ QuestProgress, Player }, { apply = false } = {}) => {
  const archive = QuestProgress.db.collection(QUEST_PROGRESS_ARCHIVE);
  const restorable = await archive
    .aggregate([
      { $lookup: { from: Player.collection.name, localField: 'player', foreignField: '_id', as: 'owner' } },
      { $match: { 'owner.0': { $exists: true } } },
      { $project: { owner: 0, archivedAt: 0 } },
    ])
    .toArray();
  const report = { restorable: restorable.length, kept: (await archive.countDocuments({})) - restorable.length };
  if (!apply || !restorable.length) return { ...report, restored: 0, applied: apply };
  // A newer record of the same quest wins; its archived copy stays.
  const { upsertedIds } = await QuestProgress.collection.bulkWrite(
    restorable.map((record) => ({
      updateOne: {
        filter: { player: record.player, questCode: record.questCode },
        update: { $setOnInsert: record },
        upsert: true,
      },
    })),
  );
  const restored = Object.keys(upsertedIds).map((index) => restorable[Number(index)]._id);
  await archive.deleteMany({ _id: { $in: restored } });
  return { ...report, restored: restored.length, applied: true };
};

/**
 * The held stacks of every profile, one row per world, label, definition and reason.
 * @param {import('mongoose').Model} Player
 * @param {{instanceCode?: string}} [filter]
 * @returns {Promise<{instanceCode: string, itemId: string, olCid: string, reason: string, stacks: number, units: number, profiles: number}[]>}
 * @memberof CyberiaPlayerMaintenance
 */
const heldReport = async (Player, { instanceCode } = {}) =>
  await Player.aggregate([
    { $match: { 'held.0': { $exists: true }, ...(instanceCode ? { instanceCode } : {}) } },
    { $unwind: '$held' },
    {
      $group: {
        _id: {
          instanceCode: '$instanceCode',
          itemId: '$held.stack.itemId',
          olCid: '$held.stack.olCid',
          reason: '$held.reason',
        },
        stacks: { $sum: 1 },
        units: { $sum: '$held.stack.quantity' },
        players: { $addToSet: '$_id' },
      },
    },
    {
      $project: {
        _id: 0,
        instanceCode: '$_id.instanceCode',
        itemId: '$_id.itemId',
        olCid: '$_id.olCid',
        reason: '$_id.reason',
        stacks: 1,
        units: 1,
        profiles: { $size: '$players' },
      },
    },
    { $sort: { instanceCode: 1, itemId: 1, olCid: 1 } },
  ]);

/**
 * Gives the held stacks of one label the definition the catalog binds now, so they load at the next
 * session of their profile. A profile in a live session is skipped: its commits own the held list.
 * @param {{Player: import('mongoose').Model, GameSession: import('mongoose').Model}} models
 * @param {{itemId: string, olCid: string, instanceCode?: string, apply?: boolean}} params
 * @returns {Promise<{profiles: number, stacks: number, live: number, applied: boolean}>}
 * @memberof CyberiaPlayerMaintenance
 */
const rebindHeld = async ({ Player, GameSession }, { itemId, olCid, instanceCode, apply = false }) => {
  const owners = await Player.find(
    { 'held.stack.itemId': itemId, ...(instanceCode ? { instanceCode } : {}) },
    { user: 1, epoch: 1, held: 1 },
  ).lean();
  const live = new Set(
    (
      await GameSession.find(
        { user: { $in: owners.map((p) => p.user) }, expiresAt: { $gt: new Date() } },
        { player: 1 },
      ).lean()
    ).map((lease) => String(lease.player)),
  );
  const report = { profiles: 0, stacks: 0, live: 0, applied: apply };
  for (const owner of owners) {
    if (live.has(String(owner._id))) {
      report.live++;
      continue;
    }
    const stacks = owner.held.filter((h) => h.stack.itemId === itemId && h.stack.olCid !== olCid).length;
    if (stacks === 0) continue;
    report.profiles++;
    report.stacks += stacks;
    if (!apply) continue;
    const held = owner.held.map((h) => (h.stack.itemId === itemId ? { ...h, stack: { ...h.stack, olCid } } : h));
    // A session that started since the read raised the epoch; its profile stays as it is.
    const { matchedCount } = await Player.updateOne({ _id: owner._id, epoch: owner.epoch }, { $set: { held } });
    if (matchedCount === 0) {
      report.profiles--;
      report.stacks -= stacks;
      report.live++;
    }
  }
  return report;
};

export { pruneQuestProgress, restoreQuestProgress, heldReport, rebindHeld };
