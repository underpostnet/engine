import {
  STAT_MODIFIER_MAX,
  STAT_MODIFIER_MIN,
  STAT_TYPES,
  statBoundsForType,
  validateStatModifier,
  validateStats,
} from '../../client/components/cyberia/SharedDefaultsCyberia.js';

/**
 * Stat balancing for every object layer the content pipeline writes.
 *
 * One policy resolves the bounds each stat may take, then either clamps the stats the content
 * carries or draws new ones inside those bounds. The same policy answers every write path, so a
 * run with a given policy over given content is deterministic.
 *
 * @typedef {Object} StatPolicy
 * @property {boolean} [normalize=false] - Bound each stat by the item type's semantic range.
 * @property {boolean} [random=false] - Replace every stat with a value drawn inside its bounds.
 * @property {number} [min] - Narrow every bound from below.
 * @property {number} [max] - Narrow every bound from above.
 */

/** Whether a policy changes anything at all. */
export const statPolicyActive = ({ normalize = false, random = false } = {}) => normalize || random;

/**
 * The inclusive `[min, max]` each stat may take under a policy for one item type.
 *
 * The semantic range wins: `min` and `max` narrow it, and a request that leaves no overlap pins
 * the stat to the semantic edge nearest the request. Without `normalize` the contract range is
 * the whole range.
 *
 * @param {string} itemType
 * @param {StatPolicy} policy
 * @returns {Record<string,[number,number]>}
 */
export function resolveStatBounds(itemType, { normalize = false, min, max } = {}) {
  if (min !== undefined) validateStatModifier(min);
  if (max !== undefined) validateStatModifier(max);
  if (min !== undefined && max !== undefined && min > max)
    throw new RangeError('Stat minimum must not exceed maximum.');
  const semantic = normalize
    ? statBoundsForType(itemType)
    : Object.fromEntries(STAT_TYPES.map((key) => [key, [STAT_MODIFIER_MIN, STAT_MODIFIER_MAX]]));
  return Object.fromEntries(
    STAT_TYPES.map((key) => {
      const [lo, hi] = semantic[key];
      const low = Math.max(lo, min ?? lo);
      const high = Math.min(hi, max ?? hi);
      if (low <= high) return [key, [low, high]];
      // No overlap: the semantic edge the request points at.
      const pinned = (min ?? lo) > hi ? hi : lo;
      return [key, [pinned, pinned]];
    }),
  );
}

/**
 * Applies a policy to one item's stats.
 *
 * @param {Object} params
 * @param {Object} params.stats - Stats as the content carries them.
 * @param {string} params.itemType
 * @param {StatPolicy} [params.policy]
 * @param {() => number} [params.random=Math.random] - Source in [0, 1) for a random draw.
 * @returns {Record<string,number>} The balanced stats, in canonical order.
 */
export function balanceStats({ stats, itemType, policy = {}, random = Math.random }) {
  const current = validateStats(stats);
  const bounds = resolveStatBounds(itemType, policy);
  return Object.fromEntries(
    STAT_TYPES.map((key) => {
      const [lo, hi] = bounds[key];
      if (!policy.random) return [key, Math.min(hi, Math.max(lo, current[key]))];
      const value = random();
      if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('Random source must return [0, 1).');
      return [key, Math.floor(value * (hi - lo + 1)) + lo];
    }),
  );
}
