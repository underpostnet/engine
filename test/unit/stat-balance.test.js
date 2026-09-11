import { describe, it, expect } from 'vitest';
import { balanceStats, resolveStatBounds, statPolicyActive } from '../../src/projects/cyberia/stat-balance.js';
import {
  STAT_TYPE_BOUNDS,
  STAT_TYPES,
  statBoundsForType,
} from '../../src/client/components/cyberia/SharedDefaultsCyberia.js';

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
