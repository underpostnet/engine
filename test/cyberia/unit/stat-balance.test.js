import { describe, it, expect } from 'vitest';
import { balanceStats, resolveStatBounds, statPolicyActive } from '../../../src/projects/cyberia/stats/stat-balance.js';
import {
  STAT_TYPE_BOUNDS,
  STAT_TYPES,
  customStatBounds,
  randomStatsWithin,
  statBoundsForType,
  statProblemText,
  statProblems,
} from '../../../src/client/components/cyberia/SharedDefaultsCyberia.js';

const wild = { effect: 60, resistance: -40, agility: 3, range: 25, intelligence: 9, utility: -2 };
const lcg = (seed) => () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;

describe('stat balancing policy', () => {
  it('is inert without normalize or random', () => {
    expect(statPolicyActive({})).toBe(false);
    expect(balanceStats({ stats: wild, itemType: 'weapon' })).toEqual(wild);
  });

  it('clamps into the semantic bounds of the item type', () => {
    expect(balanceStats({ stats: wild, itemType: 'weapon', policy: { normalize: true } })).toEqual({
      effect: 20,
      resistance: -10,
      agility: 3,
      range: 10,
      intelligence: 5,
      utility: 0,
    });
    expect(balanceStats({ stats: wild, itemType: 'skin', policy: { normalize: true } })).toEqual({
      effect: 1,
      resistance: 0,
      agility: 3,
      range: 0,
      intelligence: 2,
      utility: 0,
    });
  });

  it('keeps the contract bounds for a type without semantic bounds', () => {
    expect(statBoundsForType('unknown')).toEqual(Object.fromEntries(STAT_TYPES.map((key) => [key, [-100, 100]])));
    expect(balanceStats({ stats: wild, itemType: 'unknown', policy: { normalize: true } })).toEqual(wild);
  });

  it('is idempotent and deterministic', () => {
    const once = balanceStats({ stats: wild, itemType: 'weapon', policy: { normalize: true } });
    expect(balanceStats({ stats: once, itemType: 'weapon', policy: { normalize: true } })).toEqual(once);
    const policy = { normalize: true, random: true, min: 0, max: 8 };
    const first = balanceStats({ stats: wild, itemType: 'weapon', policy, random: lcg(7) });
    expect(balanceStats({ stats: wild, itemType: 'weapon', policy, random: lcg(7) })).toEqual(first);
    for (const key of STAT_TYPES) {
      const [lo, hi] = resolveStatBounds('weapon', policy)[key];
      expect(first[key]).toBeGreaterThanOrEqual(lo);
      expect(first[key]).toBeLessThanOrEqual(hi);
    }
  });

  it('lets min and max narrow the semantic range and pins a request outside it', () => {
    expect(resolveStatBounds('weapon', { normalize: true, min: 12, max: 30 }).effect).toEqual([12, 20]);
    expect(resolveStatBounds('weapon', { normalize: true, min: 50 }).effect).toEqual([20, 20]);
    expect(resolveStatBounds('weapon', { normalize: true, max: -50 }).resistance).toEqual([-10, -10]);
    expect(resolveStatBounds('weapon', { min: -20, max: 20 }).effect).toEqual([-20, 20]);
    expect(() => resolveStatBounds('weapon', { min: 5, max: 1 })).toThrow('minimum');
    expect(() => resolveStatBounds('weapon', { min: -101 })).toThrow();
  });

  it('declares every semantic bound inside the contract and in order', () => {
    for (const bounds of Object.values(STAT_TYPE_BOUNDS)) {
      for (const [lo, hi] of Object.values(bounds)) expect(lo <= hi && lo >= -100 && hi <= 100).toBe(true);
    }
  });
});

describe('the stat bounds of an item in the editor', () => {
  const weapon = statBoundsForType('weapon');
  const ranges = (range) => Object.fromEntries(STAT_TYPES.map((key) => [key, range]));

  it('reports each stat outside the bounds of its type, and a missing stat at its default', () => {
    const outside = STAT_TYPES.filter((key) => wild[key] < weapon[key][0] || wild[key] > weapon[key][1]);
    expect(statProblems(weapon, wild)).toEqual(
      outside.map((key) => ({ key, value: wild[key], min: weapon[key][0], max: weapon[key][1] })),
    );
    expect(
      statProblems(weapon, balanceStats({ stats: wild, itemType: 'weapon', policy: { normalize: true } })),
    ).toEqual([]);
    expect(statProblems(statBoundsForType('skin'), {}).map(({ key }) => key)).toContain('effect');
    expect(statProblems(weapon, { ...wild, agility: 2.5 }).map(({ key }) => key)).toContain('agility');
    expect(statProblemText({ key: 'effect', value: 60, min: 5, max: 20 })).toBe('effect 60 is outside 5 to 20');
  });

  it('takes custom bounds inside the stat contract, and names the first range that is not', () => {
    const custom = customStatBounds({ ...ranges([-100, 100]), effect: [30, 60] });
    expect(custom.effect).toEqual([30, 60]);
    expect(statProblems(custom, wild)).toEqual([]);
    expect(statProblems(custom, { ...wild, effect: 25 })).toEqual([{ key: 'effect', value: 25, min: 30, max: 60 }]);
    expect(() => customStatBounds({ ...ranges([0, 10]), range: [10, 0] })).toThrow(
      'range: the minimum 10 is above the maximum 0.',
    );
    expect(() => customStatBounds({ ...ranges([0, 10]), utility: [0, 101] })).toThrow(
      'utility: 101 is outside -100 to 100.',
    );
    expect(() => customStatBounds({ ...ranges([0, 10]), agility: [0.5, 2] })).toThrow('agility: 0.5 is outside');
    expect(() => customStatBounds({ effect: [0, 1] })).toThrow('resistance: custom bounds are [min, max].');
    expect(() => customStatBounds(null)).toThrow(RangeError);
  });

  it('draws every stat inside the inclusive bounds in use, both ends included', () => {
    const lowest = randomStatsWithin(weapon, () => 0);
    const highest = randomStatsWithin(weapon, () => 0.999999);
    for (const key of STAT_TYPES) expect([lowest[key], highest[key]]).toEqual(weapon[key]);
    for (const type of Object.keys(STAT_TYPE_BOUNDS))
      expect(statProblems(statBoundsForType(type), randomStatsWithin(statBoundsForType(type), lcg(3)))).toEqual([]);
    const custom = customStatBounds({ ...ranges([-100, -90]), effect: [42, 42] });
    expect(statProblems(custom, randomStatsWithin(custom, lcg(9)))).toEqual([]);
    expect(randomStatsWithin(custom, lcg(9)).effect).toBe(42);
    expect(() => randomStatsWithin(weapon, () => 1)).toThrow(RangeError);
  });
});
