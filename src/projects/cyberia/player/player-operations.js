/**
 * Operator changes to player profiles and their accounts: ending a session, changing the stacks of
 * a profile, wearing or taking off an Object Layer, and locking or banning an account; for one
 * profile or for a batch of them.
 *
 * A change of the stacks runs only while no live session plays the profile, under the epoch the
 * operator saw, and it raises the epoch, so no older session writes over it. It applies the rules a
 * game server applies: the open slots of the level, coins in the wallet and never in a slot, stored
 * items never worn, and the equipment rules. A restriction revokes every portal session of the
 * account and ends its live game session; while it holds, the account opens no session
 * (`restrictionOf` of the user model). Each request is one transaction and one audit record, refused
 * or done, and a retry of its operation id answers the recorded outcome. A batch runs each profile
 * as its own request, a few at a time; a preview decides each one and writes nothing.
 *
 * @module src/projects/cyberia/player/player-operations.js
 * @namespace CyberiaPlayerOperations
 */
import { DataBaseProviderService } from '../../../db/DataBaseProvider.js';
import { restrictionOf } from '../../../api/user/user.model.js';
import {
  CYBERIA_INSTANCE_CONF_DEFAULTS,
  EQUIPMENT_RULES_DEFAULTS,
  levelAtXp,
} from '../../../api/cyberia-server-defaults/cyberia-server-defaults.js';
import { commonAdminGuard } from '../../../client/components/core/CommonJs.js';
import {
  CONTAINER_CAPACITY,
  ITEM_TYPES,
  containerSlots,
} from '../../../client/components/cyberia/SharedDefaultsCyberia.js';
import { PROFILE_CONTAINERS } from '../../../api/cyberia-player/cyberia-player.model.js';
import { sessionOf } from './player-admin.js';
import { runTransaction } from './transaction.js';

/**
 * The changes of the stacks of a profile, and the audit action of each.
 * @constant {Readonly<Object<string,string>>}
 * @memberof CyberiaPlayerOperations
 */
const STACK_CHANGES = Object.freeze({
  add: 'inventory.add',
  remove: 'inventory.remove',
  quantity: 'inventory.quantity',
  activate: 'layer.activate',
  deactivate: 'layer.deactivate',
});

/**
 * The restrictions of an account an operator applies or lifts.
 * @constant {ReadonlyArray<string>}
 * @memberof CyberiaPlayerOperations
 */
const ACCOUNT_CHANGES = Object.freeze(['lock', 'ban', 'lift']);

/** The capacity rule of each profile container. */
const CAPACITY = Object.freeze({ bag: CONTAINER_CAPACITY.inventory, storage: CONTAINER_CAPACITY.storage });

const REASON = Object.freeze({ min: 3, max: 200 });
const QUANTITY_MAX = 0xffffffff;
/** The longest lock: a lock always ends, and a longer stop is a ban. */
const LOCK_DAYS_MAX = 90;
/** The profiles one batch takes at most, and how many of them run at once. */
const BATCH = Object.freeze({ max: 50, concurrency: 4 });

const failure = (status, message) => Object.assign(new Error(message), { status, expected: true });
const model = (name, context) => DataBaseProviderService.getModel(name, context);
const isId = (value) => typeof value === 'string' && /^[0-9a-f]{24}$/i.test(value);

/** The first defect of what every operator request names, or ''. */
const requestDefect = ({ operationId, reason }) => {
  if (typeof operationId !== 'string' || !/^[\w-]{8,64}$/.test(operationId))
    return 'An operation id is 8 to 64 word characters';
  const text = typeof reason === 'string' ? reason.trim() : '';
  if (text.length < REASON.min || text.length > REASON.max)
    return `A reason is ${REASON.min} to ${REASON.max} characters`;
  return '';
};

const epochDefect = (epoch) =>
  !Number.isSafeInteger(epoch) || epoch < 0 ? 'The epoch is the one the operator saw' : '';

/** What the audit keeps of a lease the operation found. */
const leaseRecord = (lease) =>
  lease
    ? {
        instanceCode: lease.instanceCode,
        serverId: lease.serverId,
        durability: lease.health?.durability ?? '',
        seq: lease.health?.seq ?? 0,
        durableSeq: lease.health?.durableSeq ?? 0,
        unsavedMs: lease.health?.unsavedMs ?? 0,
      }
    : null;

/** The answer of a request, as recorded. */
const answerOf = ({ operationId, outcome, refusal, epochAfter, after }) => ({
  operationId,
  outcome,
  refusal,
  epoch: epochAfter ?? null,
  after: after ?? [],
});

/**
 * Reads what a request decides on: the profile, the lease of its account, and the account.
 * @returns {Promise<{profile: Object, lease: Object|null, account: Object|null, now: Date}>}
 */
async function readTarget(playerId, context, session = null) {
  const profile = await model('CyberiaPlayer', context).findById(playerId, null, { session }).lean();
  if (!profile) throw failure(404, 'No such profile');
  const [lease, account] = await Promise.all([
    model('CyberiaGameSession', context).findOne({ user: profile.user }, null, { session }).lean(),
    model('User', context).findById(profile.user, { username: 1, role: 1, restriction: 1 }, { session }).lean(),
  ]);
  return { profile, lease, account, now: new Date() };
}

/**
 * Runs one request in a transaction. A recorded operation id answers its outcome. Otherwise `plan`
 * decides on the target and answers `{ refusal, write, record }`: the write runs only without a
 * refusal, and the audit record is stored either way.
 * @param {{playerId: string, operationId: string, actor: string, action: string, reason: string, batchId?: string}} request
 * @param {{host: string, path: string}} context
 * @param {(target: Object, session: import('mongoose').ClientSession) => Promise<Object>} plan
 * @returns {Promise<Object>} {@link answerOf}.
 */
async function runOperation({ playerId, operationId, actor, action, reason, batchId = '' }, context, plan) {
  const Audit = model('CyberiaPlayerAudit', context);
  return await runTransaction(model('CyberiaPlayer', context), async (session) => {
    const recorded = await Audit.findOne({ operationId }, null, { session }).lean();
    if (recorded) {
      if (
        String(recorded.player) !== playerId ||
        String(recorded.actor) !== String(actor) ||
        recorded.action !== action
      )
        throw failure(409, 'The operation id names another request');
      return answerOf(recorded);
    }
    const target = await readTarget(playerId, context, session);
    const { refusal = '', write, record } = await plan(target, session);
    if (!refusal) await write(session);
    const stored = {
      operationId,
      action,
      actor,
      player: target.profile._id,
      account: target.profile.user,
      reason: reason.trim(),
      batchId,
      outcome: refusal ? 'refused' : 'done',
      refusal,
      session: leaseRecord(target.lease),
      ...record,
    };
    await Audit.create([stored], { session });
    return answerOf(stored);
  });
}

/** Ends a live lease: the profile takes the next epoch, so its server writes nothing more, and the lease ends. */
async function endLease({ profile, lease, now }, actor, context, session) {
  await model('CyberiaPlayer', context).updateOne(
    { _id: profile._id, epoch: profile.epoch },
    { $inc: { epoch: 1 } },
    { session },
  );
  await model('CyberiaGameSession', context).updateOne(
    { _id: lease._id, epoch: lease.epoch },
    { $set: { endedBy: actor, expiresAt: now } },
    { session },
  );
}

/**
 * Ends the live session of a profile for an operator. It raises the epoch of the profile, so the
 * server of the session can no longer write it, and marks the lease ended, so that server ends the
 * session at its next checkpoint. The changes the session has not saved are discarded: the view
 * shows them before the operator confirms. Refused unless the profile still has the epoch the
 * operator saw and a lease of it plays.
 * @param {{playerId: string, operationId: string, reason: string, epoch: number, actor: string}} request
 * @param {{host: string, path: string}} context
 * @returns {Promise<{operationId: string, outcome: string, refusal: string, epoch: number|null}>} `refusal`
 *   is empty, or `changed` (the profile has another epoch now) | `no_session`.
 * @memberof CyberiaPlayerOperations
 */
const endSession = async ({ playerId, operationId, reason, epoch, actor }, context) => {
  if (!isId(playerId)) throw failure(400, 'A profile id is 24 hexadecimal characters');
  const defect = requestDefect({ operationId, reason }) || epochDefect(epoch);
  if (defect) throw failure(400, defect);
  return await runOperation(
    { playerId, operationId, actor, reason, action: 'session.end' },
    context,
    async (target) => {
      const { profile, lease, now } = target;
      const live = sessionOf(lease, profile, now)?.live ?? false;
      const refusal = profile.epoch !== epoch ? 'changed' : live ? '' : 'no_session';
      return {
        refusal,
        write: (session) => endLease(target, actor, context, session),
        record: { epochBefore: profile.epoch, epochAfter: refusal ? profile.epoch : profile.epoch + 1 },
      };
    },
  );
};

/** The first defect of a change of the stacks of a profile, or ''. */
const changeDefect = (change) => {
  if (!change || typeof change !== 'object') return 'A change names its op';
  const { op, container, itemId, slot, quantity } = change;
  if (!(op in STACK_CHANGES)) return `A change is one of ${Object.keys(STACK_CHANGES).join(', ')}`;
  if (!PROFILE_CONTAINERS.includes(container))
    return `A change names its container: ${PROFILE_CONTAINERS.join(' or ')}`;
  if (typeof itemId !== 'string' || !itemId || itemId.length > 128) return 'A change names its item id';
  if (slot !== undefined && slot !== null && !(Number.isInteger(slot) && slot >= 0)) return 'A slot is a whole number';
  if ((op === 'add' || op === 'quantity') && !(Number.isInteger(quantity) && quantity >= 1 && quantity <= QUANTITY_MAX))
    return `A quantity is a whole number from 1 to ${QUANTITY_MAX}`;
  if (op === 'quantity' && !Number.isInteger(slot)) return 'A quantity change names the slot of its stack';
  return '';
};

/** The definition each item runs and the type of each definition a change reads. */
async function stackFacts(profile, change, context, session) {
  const binding = await model('CyberiaItemCatalog', context)
    .findOne({ itemId: change.itemId }, { objectLayerCid: 1 }, { session })
    .lean();
  const cids = [...new Set([...profile.bag.map(({ olCid }) => olCid), binding?.objectLayerCid].filter(Boolean))];
  const definitions = await model('ObjectLayer', context)
    .find({ cid: { $in: cids } }, { cid: 1, 'data.item.type': 1 }, { session })
    .lean();
  const types = new Map(definitions.map(({ cid, data }) => [cid, data.item.type]));
  return { boundCid: binding?.objectLayerCid ?? '', typeOf: (cid) => types.get(cid) ?? '' };
}

/** The stacks a change names: the one in its slot, or every stack of its item when it names no slot. */
const namedStacks = (stacks, { itemId, slot }) =>
  stacks.filter((stack) => stack.itemId === itemId && (!Number.isInteger(slot) || stack.slot === slot));

/**
 * What a change does to the stacks of a profile, or why it does nothing. Pure: a preview and a write
 * read the same answer. `add` takes its slot, else the first open one; `remove` takes the stack in its
 * slot, else every stack of its item; `quantity` sets the quantity of the stack in its slot; `activate`
 * and `deactivate` wear or take off the stack in its slot, else the first stack of its item.
 * @param {Object} profile - A lean profile.
 * @param {{op: string, container: string, itemId: string, slot?: number, quantity?: number}} change
 * @param {{boundCid: string, typeOf: (cid: string) => string}} facts
 * @returns {{refusal: string, stacks?: Object[], before?: Object[], after?: Object[]}}
 * @memberof CyberiaPlayerOperations
 */
function stackChange(profile, change, { boundCid, typeOf }) {
  const { op, container, itemId, quantity } = change;
  const stacks = profile[container].map((stack) => ({ ...stack }));
  const slots = containerSlots(CAPACITY[container], levelAtXp(profile.xp));
  const named = namedStacks(stacks, change);
  if (op === 'add') {
    if (!boundCid) return { refusal: 'unknown_item' };
    if (typeOf(boundCid) === ITEM_TYPES.coin) return { refusal: 'coin' };
    const used = new Set(stacks.map(({ slot }) => slot));
    const slot = Number.isInteger(change.slot)
      ? change.slot
      : [...Array(slots).keys()].find((index) => !used.has(index));
    if (slot === undefined) return { refusal: 'no_room' };
    if (slot >= slots) return { refusal: 'locked_slot' };
    if (used.has(slot)) return { refusal: 'slot_taken' };
    const added = { itemId, olCid: boundCid, quantity, slot, active: false };
    return { refusal: '', stacks: [...stacks, added], before: [], after: [added] };
  }
  if (named.length === 0) return { refusal: 'no_stack' };
  if (op === 'remove')
    return { refusal: '', stacks: stacks.filter((stack) => !named.includes(stack)), before: named, after: [] };
  const [stack] = named;
  if (op === 'quantity') {
    const before = { ...stack };
    stack.quantity = quantity;
    return { refusal: '', stacks, before: [before], after: [stack] };
  }
  if (container !== 'bag') return { refusal: 'stored' };
  const type = typeOf(stack.olCid);
  const before = stacks.filter(({ active }) => active).map((worn) => ({ ...worn }));
  if (op === 'activate') {
    if (!EQUIPMENT_RULES_DEFAULTS.activeItemTypes.includes(type)) return { refusal: 'not_wearable' };
    for (const other of stacks)
      if (
        other !== stack &&
        (other.itemId === stack.itemId || (EQUIPMENT_RULES_DEFAULTS.onePerType && typeOf(other.olCid) === type))
      )
        other.active = false;
    stack.active = true;
    if (stacks.filter(({ active }) => active).length > CYBERIA_INSTANCE_CONF_DEFAULTS.maxActiveLayers)
      return { refusal: 'too_many_layers' };
  } else {
    stack.active = false;
    const skinWorn = stacks.some(({ active, olCid }) => active && typeOf(olCid) === ITEM_TYPES.skin);
    if (EQUIPMENT_RULES_DEFAULTS.requireSkin && type === ITEM_TYPES.skin && !skinWorn)
      return { refusal: 'skin_required' };
  }
  return { refusal: '', stacks, before, after: stacks.filter(({ active }) => active) };
}

/** Decides a change of the stacks of a profile, and the write that applies it. */
const stackPlan =
  ({ change, epoch }, context) =>
  async (target, session) => {
    const { profile, lease, now } = target;
    const live = sessionOf(lease, profile, now)?.live ?? false;
    const decided = live
      ? { refusal: 'online' }
      : profile.epoch !== epoch
        ? { refusal: 'changed' }
        : stackChange(profile, change, await stackFacts(profile, change, context, session));
    const { refusal, stacks, before = [], after = [] } = decided;
    return {
      refusal,
      write: (writing) =>
        model('CyberiaPlayer', context).updateOne(
          { _id: profile._id, epoch: profile.epoch },
          { $set: { [change.container]: stacks }, $inc: { epoch: 1, revision: 1 } },
          { session: writing },
        ),
      record: {
        epochBefore: profile.epoch,
        epochAfter: refusal ? profile.epoch : profile.epoch + 1,
        change: {
          op: change.op,
          container: change.container,
          itemId: change.itemId,
          slot: change.slot ?? null,
          quantity: change.quantity ?? null,
        },
        before,
        after,
      },
    };
  };

/**
 * Changes the stacks of a profile for an operator: adds, removes or sets the quantity of a stack,
 * or wears or takes off an Object Layer. Refused while a live session plays the profile, or when
 * the profile has another epoch than the one the operator saw.
 * @param {{playerId: string, operationId: string, reason: string, epoch: number, change: Object, actor: string, batchId?: string}} request -
 *   `change` is `{ op, container, itemId, slot?, quantity? }`; see {@link stackChange}.
 * @param {{host: string, path: string}} context
 * @returns {Promise<{operationId: string, outcome: string, refusal: string, epoch: number|null, after: Object[]}>}
 *   `refusal` is empty, or `online` | `changed` | `unknown_item` | `coin` | `no_room` | `locked_slot` |
 *   `slot_taken` | `no_stack` | `stored` | `not_wearable` | `too_many_layers` | `skin_required`.
 * @memberof CyberiaPlayerOperations
 */
const changeStacks = async ({ playerId, operationId, reason, epoch, change, actor, batchId }, context) => {
  if (!isId(playerId)) throw failure(400, 'A profile id is 24 hexadecimal characters');
  const defect = requestDefect({ operationId, reason }) || epochDefect(epoch) || changeDefect(change);
  if (defect) throw failure(400, defect);
  return await runOperation(
    { playerId, operationId, actor, reason, batchId, action: STACK_CHANGES[change.op] },
    context,
    stackPlan({ change, epoch }, context),
  );
};

/** The first defect of a restriction request, or ''. */
const restrictionDefect = ({ op, until }, now = new Date()) => {
  if (!ACCOUNT_CHANGES.includes(op)) return `An account change is one of ${ACCOUNT_CHANGES.join(', ')}`;
  if (op === 'lift') return until === undefined || until === null ? '' : 'A lift takes no end';
  const end = until === undefined || until === null ? null : new Date(until);
  if (op === 'lock' && !end) return 'A lock names when it ends';
  if (end && !(end > now)) return 'A restriction ends in the future';
  if (op === 'lock' && end - now > LOCK_DAYS_MAX * 86400000)
    return `A lock ends within ${LOCK_DAYS_MAX} days: a longer one is a ban`;
  return '';
};

/** Decides a restriction of the account of a profile, and the write that applies it. */
const restrictionPlan =
  ({ op, until, reason, actor, actorRole }, context) =>
  async (target) => {
    const { profile, lease, account, now } = target;
    const current = restrictionOf(account, now);
    const admin = commonAdminGuard(actorRole);
    const refusal = !account
      ? 'no_account'
      : String(account._id) === String(actor)
        ? 'self'
        : account.role === 'admin' || (account.role === 'moderator' && !admin)
          ? 'protected'
          : op === 'lift' && !current
            ? 'not_restricted'
            : op === 'lift' && current.kind === 'ban' && !admin
              ? 'forbidden'
              : '';
    const live = sessionOf(lease, profile, now)?.live ?? false;
    const restriction =
      op === 'lift'
        ? null
        : {
            kind: op,
            reason: reason.trim(),
            by: actor,
            at: now,
            until: until === undefined || until === null ? null : new Date(until),
          };
    return {
      refusal,
      write: async (session) => {
        await model('User', context).updateOne(
          { _id: account._id },
          { $set: { restriction, ...(restriction && { activeSessions: [] }) } },
          { session },
        );
        if (restriction && live) await endLease(target, actor, context, session);
      },
      record: {
        epochBefore: profile.epoch,
        epochAfter: !refusal && restriction && live ? profile.epoch + 1 : profile.epoch,
        until: restriction?.until ?? null,
        before: current ? [current] : [],
        after: refusal ? (current ? [current] : []) : restriction ? [restriction] : [],
      },
    };
  };

/**
 * Locks, bans or lifts the restriction of the account of a profile for an operator. A lock or a ban
 * revokes every portal session of the account and ends its live game session; while it holds, the
 * account opens no session. A lock ends within {@link LOCK_DAYS_MAX} days; a ban ends when it says,
 * or never. A moderator locks and lifts a lock; an admin also bans and lifts a ban. No operator
 * restricts an admin, the account it signs in with, or, unless an admin, a moderator.
 * @param {{playerId: string, operationId: string, reason: string, op: string, until?: string|Date|null, actor: string, actorRole: string, batchId?: string}} request
 * @param {{host: string, path: string}} context
 * @returns {Promise<{operationId: string, outcome: string, refusal: string, epoch: number|null}>} `refusal`
 *   is empty, or `no_account` | `self` | `protected` | `not_restricted` | `forbidden`.
 * @throws {Error} 400 for a request with a defect; 403 for a ban by a moderator.
 * @memberof CyberiaPlayerOperations
 */
const restrictAccount = async ({ playerId, operationId, reason, op, until, actor, actorRole, batchId }, context) => {
  if (!isId(playerId)) throw failure(400, 'A profile id is 24 hexadecimal characters');
  const defect = requestDefect({ operationId, reason }) || restrictionDefect({ op, until });
  if (defect) throw failure(400, defect);
  if (op === 'ban' && !commonAdminGuard(actorRole)) throw failure(403, 'Only an admin bans an account');
  return await runOperation(
    { playerId, operationId, actor, reason, batchId, action: `account.${op}` },
    context,
    restrictionPlan({ op, until, reason, actor, actorRole }, context),
  );
};

/** The plan and the action of the operation a batch runs on each profile. */
function batchOperation(operation, { epoch, reason, actor, actorRole }, context) {
  if (operation.type === 'stacks')
    return {
      action: STACK_CHANGES[operation.change.op],
      plan: stackPlan({ change: operation.change, epoch }, context),
    };
  return {
    action: `account.${operation.op}`,
    plan: restrictionPlan({ op: operation.op, until: operation.until, reason, actor, actorRole }, context),
  };
}

/** The first defect of a batch request, or ''. */
const batchDefect = ({ batchId, targets, operation }, actorRole) => {
  if (typeof batchId !== 'string' || !/^[\w-]{8,32}$/.test(batchId)) return 'A batch id is 8 to 32 word characters';
  if (!Array.isArray(targets) || targets.length === 0 || targets.length > BATCH.max)
    return `A batch names 1 to ${BATCH.max} profiles`;
  if (new Set(targets.map(({ playerId }) => playerId)).size !== targets.length)
    return 'A batch names each profile once';
  if (!targets.every(({ playerId, epoch }) => isId(playerId) && !epochDefect(epoch)))
    return 'Each profile of a batch names its id and the epoch the operator saw';
  if (operation?.type === 'stacks') {
    if (operation.change?.op === 'quantity') return 'A batch changes no quantity: each stack has its own';
    return commonAdminGuard(actorRole) ? changeDefect(operation.change) : 'forbidden';
  }
  if (operation?.type === 'account') {
    if (operation.op === 'ban' && !commonAdminGuard(actorRole)) return 'forbidden';
    return restrictionDefect(operation);
  }
  return 'A batch operation is of type stacks or account';
};

/**
 * Runs one operation on several profiles, or previews it. A preview decides each profile as the
 * operation would and writes nothing. A run applies it to each profile as its own request, a few at
 * a time, with the operation id `<batchId>-<profile id>`: a profile that fails leaves the others
 * done, and running the batch again for the failed profiles is safe. The authorization of each
 * request is the one a single request needs.
 * @param {Object} request
 * @param {string} request.batchId
 * @param {Array<{playerId: string, epoch: number}>} request.targets - Each profile, with the epoch the operator saw.
 * @param {{type: 'stacks', change: Object}|{type: 'account', op: string, until?: string|null}} request.operation
 * @param {string} request.reason
 * @param {boolean} request.preview
 * @param {string} request.actor
 * @param {string} request.actorRole
 * @param {{host: string, path: string}} context
 * @returns {Promise<{batchId: string, preview: boolean, results: Object[]}>} Each result names its
 *   profile, account name and `outcome`: `eligible` | `refused` in a preview, `done` | `refused` |
 *   `failed` in a run, with its `refusal` or `error`, and what it changes.
 * @throws {Error} 400 for a request with a defect; 403 for an operation the operator may not run.
 * @memberof CyberiaPlayerOperations
 */
const runBatch = async ({ batchId, targets, operation, reason, preview, actor, actorRole }, context) => {
  const defect =
    requestDefect({ operationId: batchId, reason }) || batchDefect({ batchId, targets, operation }, actorRole);
  if (defect === 'forbidden') throw failure(403, 'This operator may not run that operation');
  if (defect) throw failure(400, defect);
  const one = async ({ playerId, epoch }) => {
    const { action, plan } = batchOperation(operation, { epoch, reason, actor, actorRole }, context);
    try {
      if (preview) {
        const target = await readTarget(playerId, context);
        const { refusal, record } = await plan(target, null);
        return {
          playerId,
          username: target.account?.username ?? '',
          outcome: refusal ? 'refused' : 'eligible',
          refusal,
          before: record.before,
          after: record.after,
        };
      }
      const answer = await runOperation(
        { playerId, operationId: `${batchId}-${playerId}`, actor, reason, batchId, action },
        context,
        plan,
      );
      return { playerId, outcome: answer.outcome, refusal: answer.refusal, epoch: answer.epoch, after: answer.after };
    } catch (error) {
      return { playerId, outcome: 'failed', error: error.message };
    }
  };
  const results = [];
  for (let at = 0; at < targets.length; at += BATCH.concurrency)
    results.push(...(await Promise.all(targets.slice(at, at + BATCH.concurrency).map(one))));
  return { batchId, preview: Boolean(preview), results };
};

/**
 * The stacks of a profile for an operator: each stack of its bag and its storage with the type of its
 * definition and the definition its item runs now, the open slots of each at its level, and its coins.
 * @param {string} id - Profile id.
 * @param {{host: string, path: string}} context
 * @returns {Promise<Object>}
 * @memberof CyberiaPlayerOperations
 */
const playerStacks = async (id, context) => {
  if (!isId(id)) throw failure(400, 'A profile id is 24 hexadecimal characters');
  const { profile, lease, now } = await readTarget(id, context);
  const stacks = [...profile.bag, ...profile.storage];
  const [definitions, bindings] = await Promise.all([
    model('ObjectLayer', context)
      .find({ cid: { $in: [...new Set(stacks.map(({ olCid }) => olCid))] } }, { cid: 1, 'data.item.type': 1 })
      .lean(),
    model('CyberiaItemCatalog', context)
      .find({ itemId: { $in: [...new Set(stacks.map(({ itemId }) => itemId))] } }, { itemId: 1, objectLayerCid: 1 })
      .lean(),
  ]);
  const typeOf = new Map(definitions.map(({ cid, data }) => [cid, data.item.type]));
  const boundOf = new Map(bindings.map(({ itemId, objectLayerCid }) => [itemId, objectLayerCid]));
  const level = levelAtXp(profile.xp);
  const containerOf = (container) => ({
    slots: containerSlots(CAPACITY[container], level),
    max: CAPACITY[container].max,
    stacks: profile[container]
      .map(({ itemId, olCid, quantity, slot, active }) => ({
        itemId,
        olCid,
        quantity,
        slot,
        active: Boolean(active),
        itemType: typeOf.get(olCid) ?? '',
        boundCid: boundOf.get(itemId) ?? '',
      }))
      .sort((left, right) => left.slot - right.slot),
  });
  return {
    id,
    epoch: profile.epoch,
    live: sessionOf(lease, profile, now)?.live ?? false,
    level,
    coins: profile.coins,
    held: profile.held.length,
    bag: containerOf('bag'),
    storage: containerOf('storage'),
    wearable: EQUIPMENT_RULES_DEFAULTS.activeItemTypes,
    maxActiveLayers: CYBERIA_INSTANCE_CONF_DEFAULTS.maxActiveLayers,
  };
};

export {
  ACCOUNT_CHANGES,
  BATCH,
  STACK_CHANGES,
  changeStacks,
  endSession,
  playerStacks,
  restrictAccount,
  runBatch,
  stackChange,
};
