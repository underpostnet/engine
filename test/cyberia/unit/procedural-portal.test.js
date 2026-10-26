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
import { PORTAL_DEFAULT_PROFILE as profile } from '../../../src/projects/cyberia/procedural/profiles/registry.js';
import { BASELINE_PORTAL, PORTAL_TEMPLATE, paletteFixture } from '../../support/procedural-content.js';

const template = resolveTemplate(PORTAL_TEMPLATE);
const { data } = BASELINE_PORTAL.payload;
const batch = prepareSpriteBatch(
  resolveProceduralContext({
    source: baselineSource('portal', { activable: data.item.activable, stats: data.stats }),
    template,
    profile,
  }),
);
const variant = (seed, palette = candidatePalette(template)) =>
  generateSpriteVariant(batch, {
    itemId: 'rift-001',
    seed,
    parameters: spriteParameters({ variation: 0.6 }, profile),
    palette,
  });

describe('the portal generator', () => {
  it('is a sprite generator of portals with its own profile', () => {
    expect(GENERATORS['portal-variant']).toMatchObject({
      itemType: 'portal',
      defaultProfile: 'portal-default',
      generate: generateSpriteVariant,
    });
    expect(profile).toMatchObject({
      generatorId: 'portal-variant',
      directionRules: {},
      constraints: { protectedRegions: ['core'] },
    });
  });

  it('takes the vortex template, and a vortex with fewer idle frames too', () => {
    expect(templateProblems(template, profile)).toEqual([]);
    const short = resolveTemplate({
      ...PORTAL_TEMPLATE,
      directions: { '08': PORTAL_TEMPLATE.directions['08'].slice(0, 2) },
    });
    expect(templateProblems(short, profile)).toEqual([]);
  });

  it('draws three distinct idle frames that keep the core, with the function of the baseline portal', () => {
    const { data: item, renderSource } = variant(5);
    expect(item).toEqual({
      item: { id: 'rift-001', type: 'portal', description: '', activable: false },
      stats: data.stats,
    });
    const frames = framesByDirection(renderSource)['08'];
    expect(frames).toHaveLength(3);
    expect(new Set(frames.map((frame) => JSON.stringify(frame))).size).toBe(3);
    for (const [index, frame] of frames.entries())
      for (const [x, y] of protectedCells(regionsOf(template, '08', index), profile))
        expect(frame[y][x][3], `frame ${index} core cell ${x},${y}`).toBeGreaterThan(0);
  });

  it('takes the colors of a palette, a skin theme too, and differs from seed to seed', () => {
    const ember = paletteFixture('ember-rift');
    const warm = framesByDirection(variant(5, candidatePalette(template, { palette: ember })).renderSource)['08'][0];
    const cold = framesByDirection(variant(5).renderSource)['08'][0];
    expect(JSON.stringify(warm)).not.toBe(JSON.stringify(cold));
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
