/**
 * The durable state of a player profile: its wire form and the commit that stores it.
 *
 * The game server computes every value; the engine checks the shape and the bounds, then stores
 * the whole state in one transaction with the changed quest records.
 *
 * @module src/projects/cyberia/player/player-state.js
 * @namespace CyberiaPlayerState
 */
import mongoose from 'mongoose';
import { DataBaseProviderService } from '../../../db/DataBaseProvider.js';
import { CONTAINER_CAPACITY } from '../../../client/components/cyberia/SharedDefaultsCyberia.js';
import { CONTAINERS, HELD_REASONS } from '../../../api/cyberia-player/cyberia-player.model.js';
import { QUEST_STATUSES } from '../../../api/cyberia-quest-progress/cyberia-quest-progress.model.js';

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

const questRecord = (player, quest) => ({
  player,
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

/**
 * The wire `PlayerState` of a profile and its quest records.
 * @param {Object} player - Lean `CyberiaPlayer`.
 * @param {Object[]} quests - Lean `CyberiaQuestProgress` records.
 * @returns {Object}
 * @memberof CyberiaPlayerState
 */
const wireState = (player, quests) => ({
  coins: player.coins,
  xp: player.xp,
  bag: player.bag.map(stackOf),
  storage: player.storage.map(stackOf),
  vaults: player.vaults.map(({ actionCode, stacks }) => ({ actionCode, stacks: stacks.map(stackOf) })),
  held: player.held.map(({ stack, container, actionCode, reason }) => ({
    stack: stackOf(stack),
    container,
    actionCode,
    reason,
  })),
  position: { mapCode: player.position?.mapCode ?? '', x: player.position?.x ?? 0, y: player.position?.y ?? 0, seq: 0 },
  quests: quests.map(wireQuest),
  revision: player.revision,
});

/**
 * Loads the wire state of one profile.
 * @param {Object} player - Lean `CyberiaPlayer`.
 * @param {{host: string, path: string}|string} context
 * @param {import('mongoose').ClientSession} [session]
 * @memberof CyberiaPlayerState
 */
const loadState = async (player, context, session) => {
  const QuestProgress = DataBaseProviderService.getModel('CyberiaQuestProgress', context);
  return wireState(player, await QuestProgress.find({ player: player._id }, null, { session }).lean());
};

/**
 * Commits the whole state of one player. Applies only the epoch of the profile and a sequence
 * above the last applied one; a repeated sequence answers `duplicate`.
 * @param {{playerId: string, epoch: number, seq: number, state: Object, questsChanged: boolean, positionChanged: boolean}} request
 * @param {{host: string, path: string}|string} context
 * @returns {Promise<{refusal: string, duplicate: boolean, revision: number, defect?: string}>}
 * @memberof CyberiaPlayerState
 */
const commitState = async ({ playerId, epoch, seq, state, questsChanged, positionChanged }, context) => {
  if (!mongoose.isValidObjectId(playerId) || !(epoch > 0) || !(seq > 0))
    return { refusal: 'invalid', duplicate: false, revision: 0, defect: 'bad identity' };
  const defect = stateDefect(state, { questsChanged, positionChanged });
  if (defect) return { refusal: 'invalid', duplicate: false, revision: 0, defect };

  const Player = DataBaseProviderService.getModel('CyberiaPlayer', context);
  const QuestProgress = DataBaseProviderService.getModel('CyberiaQuestProgress', context);
  const session = await Player.db.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const doc = await Player.findById(playerId, 'epoch commitSeq positionSeq revision', { session }).lean();
      if (!doc) return (result = { refusal: 'unknown', duplicate: false, revision: 0 });
      if (doc.epoch !== epoch) return (result = { refusal: 'stale_session', duplicate: false, revision: doc.revision });
      if (doc.commitSeq >= seq) return (result = { refusal: '', duplicate: true, revision: doc.revision });

      const set = {
        coins: state.coins,
        xp: state.xp,
        bag: state.bag.map(stackOf),
        storage: state.storage.map(stackOf),
        vaults: state.vaults.map(({ actionCode, stacks }) => ({ actionCode, stacks: stacks.map(stackOf) })),
        held: state.held.map(({ stack, container, actionCode, reason }) => ({
          stack: stackOf(stack),
          container,
          actionCode: actionCode ?? '',
          reason,
        })),
        commitSeq: seq,
      };
      if (positionChanged && state.position.seq > doc.positionSeq) {
        const { mapCode, x, y } = state.position;
        Object.assign(set, { position: { mapCode, x, y, at: new Date() }, positionSeq: state.position.seq });
      }
      await Player.updateOne(
        { _id: playerId, epoch, commitSeq: doc.commitSeq },
        { $set: set, $inc: { revision: 1 } },
        { session },
      );
      if (questsChanged) {
        await QuestProgress.deleteMany(
          { player: playerId, questCode: { $nin: state.quests.map((q) => q.questCode) } },
          { session },
        );
        if (state.quests.length > 0)
          await QuestProgress.bulkWrite(
            state.quests.map((quest) => ({
              replaceOne: {
                filter: { player: playerId, questCode: quest.questCode },
                replacement: questRecord(playerId, quest),
                upsert: true,
              },
            })),
            { session },
          );
      }
      result = { refusal: '', duplicate: false, revision: doc.revision + 1 };
    });
    return result;
  } finally {
    await session.endSession();
  }
};

/**
 * Writes the dirty positions of a checkpoint. A position applies only to the epoch of the profile
 * and above the last applied position sequence, so it never overwrites a newer write.
 * @param {{playerId: string, epoch: number, position: Object}[]} entries
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
    valid.map(({ playerId, epoch, position: { mapCode, x, y, seq } }) => ({
      updateOne: {
        filter: { _id: playerId, epoch, positionSeq: { $lt: seq } },
        update: { $set: { position: { mapCode, x, y, at: now }, positionSeq: seq } },
      },
    })),
    { ordered: false },
  );
};

export { commitState, loadState, stateDefect, wireState, writePositions };
