import { describe, it, expect } from 'vitest';
import { seededRandom } from '../../../src/client/components/objectlayer-studio/PixelRegion.js';
import {
  deriveSeed,
  itemSeed,
  operatorSeed,
  regenerationSeed,
  shuffled,
  trySeed,
} from '../../../src/projects/cyberia/procedural/core/seed.js';

const INPUT = Object.freeze({
  rootSeed: 424242,
  sourceCid: 'bafkreiaaaa',
  itemId: 'human-skin-017',
  ordinal: 3,
  generationRunId: 'run-0123456789abcdef',
  generatorId: 'skin-variant',
  profileId: 'skin-default',
});

describe('procedural seeds', () => {
  it('gives the same sequence for the same seed and another for another seed', () => {
    const take = (seed) => Array.from({ length: 5 }, seededRandom(seed));
    expect(take(7)).toEqual(take(7));
    expect(take(7)).not.toEqual(take(8));
    expect(take(7).every((value) => value >= 0 && value < 1)).toBe(true);
  });

  it('derives an unsigned 32-bit seed from the parts in order', () => {
    expect(deriveSeed('a', 1, 'b')).toBe(deriveSeed('a', 1, 'b'));
    expect(deriveSeed('a', 'b')).not.toBe(deriveSeed('b', 'a'));
    const seed = deriveSeed('x');
    expect(Number.isInteger(seed) && seed >= 0 && seed < 2 ** 32).toBe(true);
  });

  it('makes the item seed depend on every input that decides its content', () => {
    const seeds = new Set([
      itemSeed(INPUT),
      itemSeed({ ...INPUT, rootSeed: 1 }),
      itemSeed({ ...INPUT, sourceCid: 'bafkreibbbb' }),
      itemSeed({ ...INPUT, itemId: 'human-skin-018' }),
      itemSeed({ ...INPUT, ordinal: 4 }),
      itemSeed({ ...INPUT, generationRunId: 'run-fedcba9876543210' }),
      itemSeed({ ...INPUT, generatorId: 'other' }),
      itemSeed({ ...INPUT, profileId: 'skin-other' }),
    ]);
    expect(seeds.size).toBe(8);
    expect(itemSeed({ ...INPUT })).toBe(itemSeed(INPUT));
  });

  it('chains regeneration seeds without repeating', () => {
    const first = itemSeed(INPUT);
    const second = regenerationSeed(first);
    expect(second).toBe(regenerationSeed(first));
    expect(new Set([first, second, regenerationSeed(second)]).size).toBe(3);
  });

  it('derives the seed of an operator step from the variant seed and the inputs the step names', () => {
    const step = { operatorId: 'hair-growth', direction: '08', frameIndex: 1, regionId: 'hair' };
    expect(operatorSeed(7, step)).toBe(operatorSeed(7, { ...step }));
    const seeds = new Set([
      operatorSeed(7, step),
      operatorSeed(8, step),
      operatorSeed(7, { ...step, operatorId: 'detail' }),
      operatorSeed(7, { ...step, direction: '06' }),
      operatorSeed(7, { ...step, frameIndex: 2 }),
      operatorSeed(7, { ...step, regionId: 'head' }),
    ]);
    expect(seeds.size).toBe(6);
    expect(operatorSeed(7, { operatorId: 'palette-plan' })).toBe(operatorSeed(7, { operatorId: 'palette-plan' }));
  });

  it('keeps the seed for the first diversity try and derives the others from it', () => {
    expect(trySeed(5, 0)).toBe(5);
    expect(new Set([0, 1, 2, 3].map((attempt) => trySeed(5, attempt))).size).toBe(4);
  });

  it('shuffles by the random numbers it is given, keeping every item', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const take = (seed) => shuffled(items, seededRandom(seed));
    expect(take(3)).toEqual(take(3));
    expect([...take(3)].sort()).toEqual(items);
    expect(take(3)).not.toEqual(take(4));
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});
