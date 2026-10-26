import { describe, it, expect } from 'vitest';
import {
  generateSpriteVariant,
  prepareSpriteBatch,
  spriteParameters,
} from '../../../src/projects/cyberia/procedural/generators/sprite/generator.js';
import { GENERATORS } from '../../../src/projects/cyberia/procedural/generator-registry.js';
import { resolveProceduralContext } from '../../../src/projects/cyberia/procedural/context.js';
import { candidatePalette } from '../../../src/projects/cyberia/procedural/palettes/resolver.js';
import { baselineSource } from '../../../src/projects/cyberia/procedural/source.js';
import {
  protectedCells,
  regionsOf,
  resolveTemplate,
  templateProblems,
} from '../../../src/projects/cyberia/procedural/templates.js';
import { framesByDirection, rgbaToHex } from '../../../src/client/components/objectlayer-studio/RenderSource.js';
import { OBSTACLE_DEFAULT_PROFILE as profile } from '../../../src/projects/cyberia/procedural/profiles/registry.js';
import { BASELINE_OBSTACLE, OBSTACLE_TEMPLATE, paletteFixture } from '../../support/procedural-content.js';

const template = resolveTemplate(OBSTACLE_TEMPLATE);
const { data } = BASELINE_OBSTACLE.payload;
const batch = prepareSpriteBatch(
  resolveProceduralContext({
    source: baselineSource('obstacle', { activable: data.item.activable, stats: data.stats }),
    template,
    profile,
  }),
);
const variant = (seed, palette = candidatePalette(template)) =>
  generateSpriteVariant(batch, {
    itemId: 'rock-pile-001',
    seed,
    parameters: spriteParameters({ variation: 0.6 }, profile),
    palette,
  });

describe('the obstacle generator', () => {
  it('is a sprite generator of obstacles with its own profile and no render check', () => {
    expect(GENERATORS['obstacle-variant']).toMatchObject({
      itemType: 'obstacle',
      modes: ['update-existing', 'create-new'],
      defaultProfile: 'obstacle-default',
      generate: generateSpriteVariant,
    });
    expect(GENERATORS['obstacle-variant'].renderProblems).toBeUndefined();
    expect(profile).toMatchObject({
      generatorId: 'obstacle-variant',
      directionRules: {},
      constraints: { protectedRegions: ['chunk'] },
    });
  });

  it('takes a pile with any frame count, a repeated frame or another direction', () => {
    expect(templateProblems(template, profile)).toEqual([]);
    const [first, second] = OBSTACLE_TEMPLATE.directions['08'];
    const problems = (directions) => templateProblems(resolveTemplate({ ...OBSTACLE_TEMPLATE, directions }), profile);
    expect(problems({ '08': [first, second] })).toEqual([]);
    expect(problems({ '08': [first, second, first, second] })).toEqual([]);
    expect(problems({ '08': [first], 18: [first, second] })).toEqual([]);
  });

  it('draws every direction of a template its author changed', () => {
    const [first, second] = OBSTACLE_TEMPLATE.directions['08'];
    const changed = resolveTemplate({
      ...OBSTACLE_TEMPLATE,
      directions: { '08': [first, second], 18: [first, second] },
    });
    const prepared = prepareSpriteBatch(
      resolveProceduralContext({
        source: baselineSource('obstacle', { activable: data.item.activable, stats: data.stats }),
        template: changed,
        profile,
      }),
    );
    const frames = framesByDirection(
      generateSpriteVariant(prepared, {
        itemId: 'rock-pile-002',
        seed: 3,
        parameters: spriteParameters({ variation: 0.4 }, profile),
        palette: candidatePalette(changed),
      }).renderSource,
    );
    expect([frames['08'].length, frames['18'].length]).toEqual([2, 2]);
  });

  it('draws three distinct idle frames that keep the chunks, with the function of the baseline obstacle', () => {
    const { data: item, renderSource } = variant(5);
    expect(item).toEqual({
      item: { id: 'rock-pile-001', type: 'obstacle', description: '', activable: false },
      stats: data.stats,
    });
    const frames = framesByDirection(renderSource);
    expect(frames['08']).toHaveLength(3);
    expect(new Set(frames['08'].map((frame) => JSON.stringify(frame))).size).toBe(3);
    expect(
      Object.entries(frames)
        .filter(([, list]) => list.length > 0)
        .map(([code]) => code),
    ).toEqual(['08']);
    for (const [index, frame] of frames['08'].entries())
      for (const [x, y] of protectedCells(regionsOf(template, '08', index), profile))
        expect(frame[y][x][3], `frame ${index} chunk cell ${x},${y}`).toBeGreaterThan(0);
  });

  it('takes the colors of a palette, a skin theme too, and differs from seed to seed', () => {
    const concrete = paletteFixture('ruin-concrete');
    const gray = framesByDirection(variant(5, candidatePalette(template, { palette: concrete })).renderSource)['08'][0];
    const brown = framesByDirection(variant(5).renderSource)['08'][0];
    expect(JSON.stringify(gray)).not.toBe(JSON.stringify(brown));
    const teal = paletteFixture('exotic-teal');
    const themed = framesByDirection(variant(5, candidatePalette(template, { palette: teal })).renderSource)['08'][0];
    expect(
      themed.flat().some(([r, g, b, a]) => a > 0 && rgbaToHex([r, g, b, 255]).startsWith(teal.roles.primary)),
    ).toBe(true);
    expect(JSON.stringify(framesByDirection(variant(6).renderSource)['08'])).not.toBe(
      JSON.stringify(framesByDirection(variant(5).renderSource)['08']),
    );
  });
});
