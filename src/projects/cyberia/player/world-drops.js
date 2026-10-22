/**
 * The world drop records of account players: what a drop creates, what a pickup claims and what a
 * world restores at boot. A record is created and claimed only inside the transaction of its joint
 * commit (`player-state.js`).
 *
 * @module src/projects/cyberia/player/world-drops.js
 * @namespace CyberiaWorldDrops
 */
import { DataBaseProviderService } from '../../../db/DataBaseProvider.js';
import { WORLD_DROP_MAX_LIFETIME_MS } from '../../../api/cyberia-world-drop/cyberia-world-drop.model.js';

const ID_LENGTH = 128;

const isText = (value) => typeof value === 'string' && value.length > 0 && value.length <= ID_LENGTH;

/**
 * The first defect of the stack a drop puts on the ground, or ''.
 * @param {Object} drop - Wire `WorldDrop`.
 * @returns {string}
 * @memberof CyberiaWorldDrops
 */
const worldDropDefect = (drop) => {
  if (!isText(drop?.mapCode) || !isText(drop.itemId)) return 'drop without map or item';
  if (typeof drop.olCid !== 'string' || drop.olCid.length > ID_LENGTH) return 'bad drop olCid';
  if (!Number.isFinite(drop.x) || !Number.isFinite(drop.y) || drop.x < 0 || drop.y < 0) return 'bad drop position';
  if (!Number.isInteger(drop.quantity) || drop.quantity < 1 || drop.quantity > 0xffffffff) return 'bad drop quantity';
  if (!Number.isInteger(drop.lifetimeMs) || drop.lifetimeMs < 1 || drop.lifetimeMs > WORLD_DROP_MAX_LIFETIME_MS)
    return 'bad drop lifetime';
  return '';
};

/**
 * Creates the record of a drop in the transaction of its operation. It expires its lifetime after
 * the commit.
 * @param {{dropId: string, instanceCode: string, owner: string, drop: Object}} record
 * @param {import('mongoose').ClientSession} session
 * @param {{host: string, path: string}|string} context
 * @memberof CyberiaWorldDrops
 */
const createWorldDrop = async ({ dropId, instanceCode, owner, drop }, session, context) => {
  const { mapCode, x, y, itemId, olCid, quantity, lifetimeMs } = drop;
  const expiresAt = new Date(Date.now() + lifetimeMs);
  await DataBaseProviderService.getModel('CyberiaWorldDrop', context).create(
    [{ dropId, instanceCode, mapCode, x, y, itemId, olCid, quantity, owner, expiresAt }],
    { session },
  );
};

/**
 * Claims a public record of a world that has not expired, in the transaction of its pickup.
 * @param {{dropId: string, instanceCode: string, collector: string}} claim
 * @param {import('mongoose').ClientSession} session
 * @param {{host: string, path: string}|string} context
 * @returns {Promise<boolean>} False when the record is claimed, expired, of another world or unknown.
 * @memberof CyberiaWorldDrops
 */
const claimWorldDrop = async ({ dropId, instanceCode, collector }, session, context) => {
  const now = new Date();
  const { modifiedCount } = await DataBaseProviderService.getModel('CyberiaWorldDrop', context).updateOne(
    { dropId, instanceCode, status: 'public', expiresAt: { $gt: now } },
    { $set: { status: 'claimed', claimedBy: collector, claimedAt: now } },
    { session },
  );
  return modifiedCount === 1;
};

/**
 * The public records of a world that have not expired: what its server puts back on the ground.
 * @param {{instanceCode: string}} request
 * @param {{host: string, path: string}|string} context
 * @returns {Promise<{drops: Object[]}>} Wire `ListWorldDropsResponse`.
 * @memberof CyberiaWorldDrops
 */
const listWorldDrops = async ({ instanceCode }, context) => {
  if (!isText(instanceCode)) return { drops: [] };
  const records = await DataBaseProviderService.getModel('CyberiaWorldDrop', context)
    .find(
      { instanceCode, status: 'public', expiresAt: { $gt: new Date() } },
      'dropId mapCode x y itemId olCid quantity owner expiresAt',
    )
    .lean();
  return {
    drops: records.map(({ dropId, mapCode, x, y, itemId, olCid, quantity, owner, expiresAt }) => ({
      dropId,
      mapCode,
      x,
      y,
      itemId,
      olCid,
      quantity,
      ownerPlayerId: String(owner),
      expiresAtMs: expiresAt.getTime(),
    })),
  };
};

export { claimWorldDrop, createWorldDrop, listWorldDrops, worldDropDefect };
