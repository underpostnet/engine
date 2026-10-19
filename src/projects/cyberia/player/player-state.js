/**
 * The durable state of a player profile: its wire form and the commit that stores it.
 *
 * The wire state is the state of one world: the profile of its universe, and what the profile keeps
 * in that world. A commit splits it the same way: coins, XP, the bag, the storage and their held
 * stacks go to the profile; the position, the vaults, their held stacks and the quests go to the
 * world the session lease names.
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
import { CONTAINERS, HELD_REASONS, PROFILE_CONTAINERS } from '../../../api/cyberia-player/cyberia-player.model.js';
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

/**
 * Commits the whole state of one player in the world its lease names. Applies only the epoch of the
 * profile and a sequence above the last applied one; a repeated sequence answers `duplicate`.
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
  const GameSession = DataBaseProviderService.getModel('CyberiaGameSession', context);
  const QuestProgress = DataBaseProviderService.getModel('CyberiaQuestProgress', context);
  const session = await Player.db.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const doc = await Player.findById(
        playerId,
        'user epoch commitSeq revision worlds.instanceCode worlds.positionSeq',
        {
          session,
        },
      ).lean();
      if (!doc) return (result = { refusal: 'unknown', duplicate: false, revision: 0 });
      if (doc.epoch !== epoch) return (result = { refusal: 'stale_session', duplicate: false, revision: doc.revision });
      if (doc.commitSeq >= seq) return (result = { refusal: '', duplicate: true, revision: doc.revision });
      const lease = await GameSession.findOne({ user: doc.user }, 'player epoch instanceCode', { session }).lean();
      if (!lease || String(lease.player) !== playerId || lease.epoch !== epoch)
        return (result = { refusal: 'stale_session', duplicate: false, revision: doc.revision });
      const { instanceCode } = lease;

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
      result = { refusal: '', duplicate: false, revision: doc.revision + 1 };
    });
    return result;
  } finally {
    await session.endSession();
  }
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

export { commitState, loadState, stateDefect, wireState, worldOf, writePositions };
