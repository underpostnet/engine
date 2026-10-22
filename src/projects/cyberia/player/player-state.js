/**
 * The durable state of a player profile: its wire form and the commit that stores it.
 *
 * The wire state is the state of one world: the profile of its universe, and what the profile keeps
 * in that world. A commit splits it the same way: coins, XP, the bag, the storage and their held
 * stacks go to the profile; the position, the vaults, their held stacks and the quests go to the
 * world the session lease names.
 *
 * The game server computes every value; the engine checks the shape and the bounds, then stores
 * the whole state in one transaction with the changed quest records. A joint operation commits its
 * states and its effect in one transaction: a trade the states of its players, a drop the state of
 * its owner and a new world drop record, a pickup the state of its collector and the claim of one, a
 * market operation the state of its player and the change of the market.
 *
 * A write the database refuses as it stands answers `integrity`: the game server keeps the state
 * and retries slowly until an operator repairs the records, instead of a retry loop.
 *
 * @module src/projects/cyberia/player/player-state.js
 * @namespace CyberiaPlayerState
 */
import crypto from 'crypto';
import mongoose from 'mongoose';
import { DataBaseProviderService } from '../../../db/DataBaseProvider.js';
import {
  ECONOMY_OPERATION_KINDS,
  OPERATION_RECORD_DAYS,
} from '../../../api/cyberia-economy-operation/cyberia-economy-operation.model.js';
import { claimWorldDrop, createWorldDrop, worldDropDefect } from './world-drops.js';
import { MARKET_KINDS, applyMarketOp, marketOpDefect } from './market.js';
import { integrityFailure, runTransaction } from './transaction.js';
import { CONTAINER_CAPACITY } from '../../../client/components/cyberia/SharedDefaultsCyberia.js';
import { CONTAINERS, HELD_REASONS, PROFILE_CONTAINERS } from '../../../api/cyberia-player/cyberia-player.model.js';
import { QUEST_STATUSES } from '../../../api/cyberia-quest-progress/cyberia-quest-progress.model.js';
import { loggerFactory } from '../../../server/ops/logger.js';

const logger = loggerFactory(import.meta);

/**
 * Runs a commit transaction. A write the database refuses as it stands logs the database error
 * and answers `refused`; any other failure throws.
 */
const commitTransaction = async (Model, work, what, refused) => {
  try {
    return await runTransaction(Model, work);
  } catch (error) {
    if (!integrityFailure(error)) throw error;
    logger.error(`${what} refused by the database: ${error.message}`);
    return refused;
  }
};

/** Sanity bounds of a commit. Content defines the real limits; these stop a malformed write. */
const LIMITS = Object.freeze({
  idLength: 128,
  vaultSlots: 256,
  vaults: 256,
  held: 512,
  quests: 512,
  steps: 64,
  objectives: 64,
  uint32: 0xffffffff,
});

const isText = (value) => typeof value === 'string' && value.length > 0 && value.length <= LIMITS.idLength;
const isCount = (value, max = LIMITS.uint32) => Number.isInteger(value) && value >= 0 && value <= max;

/**
 * The first defect of a stack list, or ''.
 * @param {Object[]} stacks
 * @param {number} slots - Slot count of the container.
 * @returns {string}
 */
const stackDefect = (stacks, slots) => {
  if (!Array.isArray(stacks) || stacks.length > slots) return 'too many stacks';
  const used = new Set();
  for (const stack of stacks) {
    if (!isText(stack?.itemId)) return 'stack without item id';
    if (typeof stack.olCid !== 'string' || stack.olCid.length > LIMITS.idLength) return `bad olCid on ${stack.itemId}`;
    if (!isCount(stack.quantity) || stack.quantity < 1) return `bad quantity on ${stack.itemId}`;
    if (!isCount(stack.slot, slots - 1) || used.has(stack.slot)) return `bad slot on ${stack.itemId}`;
    used.add(stack.slot);
  }
  return '';
};

const questDefect = (quests) => {
  if (!Array.isArray(quests) || quests.length > LIMITS.quests) return 'too many quests';
  const codes = new Set();
  for (const quest of quests) {
    if (!isText(quest?.questCode) || codes.has(quest.questCode)) return 'bad quest code';
    codes.add(quest.questCode);
    if (!QUEST_STATUSES.includes(quest.status)) return `bad status on ${quest.questCode}`;
    if (!Array.isArray(quest.steps) || quest.steps.length > LIMITS.steps) return `bad steps on ${quest.questCode}`;
    for (const step of quest.steps) {
      if (!isText(step?.stepId) || !Array.isArray(step.objectives) || step.objectives.length > LIMITS.objectives)
        return `bad step on ${quest.questCode}`;
      if (!step.objectives.every((o) => isCount(o?.current) && isCount(o?.required) && o.required >= 1))
        return `bad objective on ${quest.questCode}`;
    }
  }
  return '';
};

/**
 * The first defect of a committed state, or ''.
 * @param {Object} state - Wire `PlayerState`.
 * @param {{questsChanged: boolean, positionChanged: boolean}} changes
 * @returns {string}
 * @memberof CyberiaPlayerState
 */
const stateDefect = (state, { questsChanged, positionChanged }) => {
  if (!state || !isCount(state.coins) || !Number.isSafeInteger(state.xp) || state.xp < 0) return 'bad coins or xp';
  const defect =
    stackDefect(state.bag, CONTAINER_CAPACITY.inventory.max) ||
    stackDefect(state.storage, CONTAINER_CAPACITY.storage.max);
  if (defect) return defect;
  if (!Array.isArray(state.vaults) || state.vaults.length > LIMITS.vaults) return 'too many vaults';
  const vaultCodes = new Set();
  for (const vault of state.vaults) {
    if (!isText(vault?.actionCode) || vaultCodes.has(vault.actionCode)) return 'bad vault code';
    vaultCodes.add(vault.actionCode);
    const vaultDefect = stackDefect(vault.stacks, LIMITS.vaultSlots);
    if (vaultDefect) return `${vault.actionCode}: ${vaultDefect}`;
  }
  if (!Array.isArray(state.held) || state.held.length > LIMITS.held) return 'too many held stacks';
  for (const held of state.held) {
    if (!CONTAINERS.includes(held?.container) || !HELD_REASONS.includes(held.reason)) return 'bad held stack';
    if (stackDefect([held.stack], LIMITS.vaultSlots)) return 'bad held stack';
  }
  if (positionChanged) {
    const p = state.position;
    if (!isText(p?.mapCode) || !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.y < 0 || !(p.seq > 0))
      return 'bad position';
  }
  return questsChanged ? questDefect(state.quests) : '';
};

const stackOf = ({ itemId, olCid, quantity, slot, active }) => ({ itemId, olCid, quantity, slot, active: !!active });

const questRecord = (player, instanceCode, quest) => ({
  player,
  instanceCode,
  questCode: quest.questCode,
  status: quest.status,
  stepProgress: quest.steps.map((step) => ({
    stepId: step.stepId,
    objectiveProgress: step.objectives.map(({ current, required }) => ({ current, required })),
  })),
  startedAt: quest.startedAtMs ? new Date(quest.startedAtMs) : new Date(),
  completedAt: quest.completedAtMs ? new Date(quest.completedAtMs) : null,
});

const wireQuest = (record) => ({
  questCode: record.questCode,
  status: record.status,
  steps: (record.stepProgress ?? []).map((step) => ({
    stepId: step.stepId,
    objectives: (step.objectiveProgress ?? []).map(({ current, required }) => ({ current, required })),
  })),
  startedAtMs: record.startedAt ? record.startedAt.getTime() : 0,
  completedAtMs: record.completedAt ? record.completedAt.getTime() : 0,
});

const heldOf = ({ stack, container, actionCode, reason }) => ({
  stack: stackOf(stack),
  container,
  actionCode: actionCode ?? '',
  reason,
});

const vaultOf = ({ actionCode, stacks }) => ({ actionCode, stacks: stacks.map(stackOf) });

/**
 * What a profile keeps in one world; empty for a world it never played.
 * @param {Object} player - Lean `CyberiaPlayer`.
 * @param {string} instanceCode
 * @returns {{position: Object, positionSeq: number, vaults: Object[], held: Object[]}}
 * @memberof CyberiaPlayerState
 */
const worldOf = (player, instanceCode) =>
  player.worlds?.find((world) => world.instanceCode === instanceCode) ?? {
    position: {},
    positionSeq: 0,
    vaults: [],
    held: [],
  };

/**
 * The wire `PlayerState` of a profile in one world, with the quest records of that world.
 * @param {Object} player - Lean `CyberiaPlayer`.
 * @param {string} instanceCode
 * @param {Object[]} quests - Lean `CyberiaQuestProgress` records of the world.
 * @returns {Object}
 * @memberof CyberiaPlayerState
 */
const wireState = (player, instanceCode, quests) => {
  const world = worldOf(player, instanceCode);
  return {
    coins: player.coins,
    xp: player.xp,
    bag: player.bag.map(stackOf),
    storage: player.storage.map(stackOf),
    vaults: world.vaults.map(vaultOf),
    held: [...player.held, ...world.held].map(heldOf),
    position: {
      mapCode: world.position?.mapCode ?? '',
      x: world.position?.x ?? 0,
      y: world.position?.y ?? 0,
      seq: 0,
    },
    quests: quests.map(wireQuest),
    revision: player.revision,
  };
};

/**
 * Loads the wire state of one profile in one world.
 * @param {Object} player - Lean `CyberiaPlayer`.
 * @param {string} instanceCode
 * @param {{host: string, path: string}|string} context
 * @param {import('mongoose').ClientSession} [session]
 * @memberof CyberiaPlayerState
 */
const loadState = async (player, instanceCode, context, session) => {
  const QuestProgress = DataBaseProviderService.getModel('CyberiaQuestProgress', context);
  const quests = await QuestProgress.find({ player: player._id, instanceCode }, null, { session }).lean();
  return wireState(player, instanceCode, quests);
};

/** The models a commit reads and writes. */
const commitModels = (context) => ({
  Player: DataBaseProviderService.getModel('CyberiaPlayer', context),
  GameSession: DataBaseProviderService.getModel('CyberiaGameSession', context),
  QuestProgress: DataBaseProviderService.getModel('CyberiaQuestProgress', context),
});

/**
 * Checks one commit inside a transaction: the profile exists, its epoch and lease are the
 * session's, and the sequence is new. Writes nothing.
 * @returns {Promise<{refusal: string, duplicate: boolean, revision: number, doc?: Object, instanceCode?: string}>}
 */
const checkCommit = async ({ Player, GameSession }, { playerId, epoch, seq }, session) => {
  const doc = await Player.findById(playerId, 'user epoch commitSeq revision worlds.instanceCode worlds.positionSeq', {
    session,
  }).lean();
  if (!doc) return { refusal: 'unknown', duplicate: false, revision: 0 };
  if (doc.epoch !== epoch) return { refusal: 'stale_session', duplicate: false, revision: doc.revision };
  if (doc.commitSeq >= seq) return { refusal: '', duplicate: true, revision: doc.revision };
  const lease = await GameSession.findOne({ user: doc.user }, 'player epoch instanceCode', { session }).lean();
  if (!lease || String(lease.player) !== playerId || lease.epoch !== epoch)
    return { refusal: 'stale_session', duplicate: false, revision: doc.revision };
  return { refusal: '', duplicate: false, revision: doc.revision, doc, instanceCode: lease.instanceCode };
};

/** Writes one checked commit: the profile, the world of its lease and the changed quest records. */
const writeCommit = async (
  { Player, QuestProgress },
  { playerId, epoch, seq, state, questsChanged, positionChanged },
  { doc, instanceCode },
  session,
) => {
  const held = state.held.map(heldOf);
  const set = {
    coins: state.coins,
    xp: state.xp,
    bag: state.bag.map(stackOf),
    storage: state.storage.map(stackOf),
    held: held.filter(({ container }) => PROFILE_CONTAINERS.includes(container)),
    commitSeq: seq,
    'worlds.$[world].vaults': state.vaults.map(vaultOf),
    'worlds.$[world].held': held.filter(({ container }) => !PROFILE_CONTAINERS.includes(container)),
  };
  if (positionChanged && state.position.seq > worldOf(doc, instanceCode).positionSeq) {
    const { mapCode, x, y } = state.position;
    Object.assign(set, {
      'worlds.$[world].position': { mapCode, x, y, at: new Date() },
      'worlds.$[world].positionSeq': state.position.seq,
    });
  }
  await Player.updateOne(
    { _id: playerId, epoch, commitSeq: doc.commitSeq },
    { $set: set, $inc: { revision: 1 } },
    { arrayFilters: [{ 'world.instanceCode': instanceCode }], session },
  );
  if (questsChanged) {
    await QuestProgress.deleteMany(
      { player: playerId, instanceCode, questCode: { $nin: state.quests.map((q) => q.questCode) } },
      { session },
    );
    if (state.quests.length > 0)
      await QuestProgress.bulkWrite(
        state.quests.map((quest) => ({
          replaceOne: {
            filter: { player: playerId, instanceCode, questCode: quest.questCode },
            replacement: questRecord(playerId, instanceCode, quest),
            upsert: true,
          },
        })),
        { session },
      );
  }
  return doc.revision + 1;
};

/** The first defect of a commit request before any read, or ''. */
const requestDefect = ({ playerId, epoch, seq, state, questsChanged, positionChanged }) => {
  if (!mongoose.isValidObjectId(playerId) || !(epoch > 0) || !(seq > 0)) return 'bad identity';
  return stateDefect(state, { questsChanged, positionChanged });
};

/**
 * Commits the whole state of one player in the world its lease names. Applies only the epoch of the
 * profile and a sequence above the last applied one; a repeated sequence answers `duplicate`.
 * @param {{playerId: string, epoch: number, seq: number, state: Object, questsChanged: boolean, positionChanged: boolean}} request
 * @param {{host: string, path: string}|string} context
 * @returns {Promise<{refusal: string, duplicate: boolean, revision: number, defect?: string}>} `refusal`
 *   is empty, or stale_session | unknown | invalid | integrity.
 * @memberof CyberiaPlayerState
 */
const commitState = async (request, context) => {
  const defect = requestDefect(request);
  if (defect) return { refusal: 'invalid', duplicate: false, revision: 0, defect };
  const models = commitModels(context);
  return await commitTransaction(
    models.Player,
    async (session) => {
      const checked = await checkCommit(models, request, session);
      if (checked.refusal || checked.duplicate)
        return { refusal: checked.refusal, duplicate: checked.duplicate, revision: checked.revision };
      return { refusal: '', duplicate: false, revision: await writeCommit(models, request, checked, session) };
    },
    `Commit of player ${request.playerId} seq ${request.seq}`,
    { refusal: 'integrity', duplicate: false, revision: 0 },
  );
};

/** The fingerprint of a joint commit request: a retry carries the same bytes. */
const operationFingerprint = ({ kind, commits, drop, claimDropId, market }) =>
  crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        kind,
        commits,
        ...(drop && { drop }),
        ...(claimDropId && { claimDropId }),
        ...(market && { market }),
      }),
    )
    .digest('hex');

/** The first defect of the players and the effect an operation kind joins, or ''. */
const operationDefect = ({ kind, commits, drop, claimDropId, market }) => {
  if (new Set(commits.map(({ playerId }) => playerId)).size !== commits.length)
    return 'an operation joins distinct players';
  if (MARKET_KINDS.includes(kind))
    return commits.length === 1 && !drop && !claimDropId ? marketOpDefect(kind, market) : 'a market joins one player';
  if (market) return 'only a market operation carries a market';
  switch (kind) {
    case 'trade':
      return commits.length >= 2 && !drop && !claimDropId ? '' : 'a trade joins two or more players and no drop';
    case 'drop':
      return commits.length === 1 && !claimDropId ? worldDropDefect(drop) : 'a drop joins one player and its drop';
    case 'pickup':
      return commits.length === 1 && !drop && isText(claimDropId) ? '' : 'a pickup joins one player and one claim';
  }
  return 'bad operation kind';
};

/**
 * Commits the states and the effect of one operation in one transaction: all or nothing. A drop
 * creates its world drop record under the operation id; a pickup claims a public record of the
 * world of its collector that has not expired, or answers `drop_gone` and writes nothing; a market
 * operation changes the market, or answers a refusal of `MARKET_REFUSALS` and writes nothing. The
 * operation record joins the transaction, so a retry of the same operation answers `duplicate`,
 * and the same id with another request is refused. One refusal refuses the whole operation and
 * names its player; `integrity` names none.
 * @param {{operationId: string, kind: string, commits: Object[], drop?: Object, claimDropId?: string, market?: Object}} request - Each commit as {@link commitState} takes it.
 * @param {{host: string, path: string}|string} context
 * @returns {Promise<{refusal: string, playerId: string, duplicate: boolean, defect?: string}>}
 * @memberof CyberiaPlayerState
 */
const commitStates = async (
  { operationId, kind, commits = [], drop = null, claimDropId = '', market = null },
  context,
) => {
  const invalid = (defect, playerId = '') => ({ refusal: 'invalid', playerId, duplicate: false, defect });
  if (!isText(operationId)) return invalid('bad operation id');
  if (!ECONOMY_OPERATION_KINDS.includes(kind)) return invalid('bad operation kind');
  const shape = operationDefect({ kind, commits, drop, claimDropId, market });
  if (shape) return invalid(shape);
  for (const commit of commits) {
    const defect = requestDefect(commit);
    if (defect) return invalid(defect, commit.playerId);
  }
  const models = commitModels(context);
  const Operation = DataBaseProviderService.getModel('CyberiaEconomyOperation', context);
  const fingerprint = operationFingerprint({ kind, commits, drop, claimDropId, market });
  const run = async (session) => {
    const recorded = await Operation.findOne({ operationId }, { fingerprint: 1 }, { session }).lean();
    if (recorded)
      return recorded.fingerprint === fingerprint
        ? { refusal: '', playerId: '', duplicate: true }
        : invalid('operation id reused with another request');
    const checks = [];
    for (const commit of commits) {
      const checked = await checkCommit(models, commit, session);
      if (checked.refusal) return { refusal: checked.refusal, playerId: commit.playerId, duplicate: false };
      if (checked.duplicate) return invalid('a sequence of the operation was applied alone', commit.playerId);
      checks.push(checked);
    }
    const [{ playerId }] = commits;
    const { instanceCode } = checks[0];
    if (
      claimDropId &&
      !(await claimWorldDrop({ dropId: claimDropId, instanceCode, collector: playerId }, session, context))
    )
      return { refusal: 'drop_gone', playerId, duplicate: false };
    if (market) {
      const refusal = await applyMarketOp({ kind, market, operationId, playerId, instanceCode }, session, context);
      if (refusal) return { refusal, playerId, duplicate: false };
    }
    for (const [i, commit] of commits.entries()) await writeCommit(models, commit, checks[i], session);
    if (drop) await createWorldDrop({ dropId: operationId, instanceCode, owner: playerId, drop }, session, context);
    await Operation.create(
      [
        {
          operationId,
          kind,
          instanceCode,
          players: commits.map(({ playerId }) => playerId),
          seqs: commits.map(({ seq }) => seq),
          fingerprint,
          expiresAt: new Date(Date.now() + OPERATION_RECORD_DAYS * 86400000),
        },
      ],
      { session },
    );
    return { refusal: '', playerId: '', duplicate: false };
  };
  return await commitTransaction(models.Player, run, `Operation ${operationId} (${kind})`, {
    refusal: 'integrity',
    playerId: '',
    duplicate: false,
  });
};

/**
 * Writes the dirty positions of a checkpoint, each in the world of its lease. A position applies
 * only to the epoch of the profile and above the last applied position sequence of that world, so
 * it never overwrites a newer write.
 * @param {{playerId: string, epoch: number, instanceCode: string, position: Object}[]} entries
 * @param {{host: string, path: string}|string} context
 * @memberof CyberiaPlayerState
 */
const writePositions = async (entries, context) => {
  const valid = entries.filter(
    ({ position: p }) => isText(p?.mapCode) && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.y >= 0,
  );
  if (valid.length === 0) return;
  const now = new Date();
  await DataBaseProviderService.getModel('CyberiaPlayer', context).bulkWrite(
    valid.map(({ playerId, epoch, instanceCode, position: { mapCode, x, y, seq } }) => ({
      updateOne: {
        filter: { _id: playerId, epoch, worlds: { $elemMatch: { instanceCode, positionSeq: { $lt: seq } } } },
        update: { $set: { 'worlds.$.position': { mapCode, x, y, at: now }, 'worlds.$.positionSeq': seq } },
      },
    })),
    { ordered: false },
  );
};

export { commitState, commitStates, loadState, stateDefect, wireState, worldOf, writePositions };
