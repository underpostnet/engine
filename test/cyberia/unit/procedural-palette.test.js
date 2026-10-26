import { describe, it, expect } from 'vitest';
import {
  candidatePalette,
  foundationRoles,
  paletteSlots,
  planPalette,
  randomSlotColors,
  shiftColor,
  slotDefaults,
  templateSlotColors,
  tonesOf,
} from '../../../src/projects/cyberia/procedural/palettes/resolver.js';
import { seededRandom } from '../../../src/client/components/objectlayer-studio/PixelRegion.js';
import { toOklab, toOklch } from '../../../src/projects/cyberia/procedural/core/oklab.js';
import { resolveTemplate } from '../../../src/projects/cyberia/procedural/templates.js';
import { hexToRgba } from '../../../src/client/components/objectlayer-studio/RenderSource.js';
import { SKIN_TEMPLATE, VIOLET_STRATA, paletteFixture } from '../../support/procedural-content.js';

const lightness = (hex) => toOklab(hexToRgba(hex))[0];
const chroma = (hex) => toOklch(hexToRgba(hex))[1];
const template = resolveTemplate(SKIN_TEMPLATE);
const base = (role) => template.roles[role].tones.base;
const run = (overrides = {}) =>
  planPalette({
    template,
    palette: { roles: {} },
    seed: 7,
    variation: 0,
    ...overrides,
  });

describe('colors and tones', () => {
  it('moves the lightness of a color and keeps it a #rrggbb', () => {
    expect(shiftColor('#808080', { lightness: 0.2 })).toMatch(/^#[0-9a-f]{6}$/);
    expect(lightness(shiftColor('#808080', { lightness: 0.2 }))).toBeGreaterThan(lightness('#808080'));
    expect(shiftColor('#336699', { lightness: 0, hue: 0, chroma: 0 })).toBe('#336699');
  });

  it('moves the chroma by a share of itself and leaves a grey grey', () => {
    expect(chroma(shiftColor('#336699', { chroma: 0.3 }))).toBeGreaterThan(chroma('#336699'));
    expect(chroma(shiftColor('#336699', { chroma: -0.3 }))).toBeLessThan(chroma('#336699'));
    expect(shiftColor('#808080', { chroma: 0.3 })).toBe('#808080');
  });

  it('turns the hue and keeps the lightness near', () => {
    const turned = shiftColor('#cc4422', { hue: 0.25 });
    expect(turned).not.toBe('#cc4422');
    expect(Math.abs(lightness(turned) - lightness('#cc4422'))).toBeLessThan(0.1);
  });

  it('gives a base color a darker shadow and a lighter highlight', () => {
    const { shadow, base, highlight } = tonesOf('#d9a78b');
    expect(base).toBe('#d9a78b');
    expect(lightness(shadow)).toBeLessThan(lightness(base));
    expect(lightness(highlight)).toBeGreaterThan(lightness(base));
  });
});

describe('the palette plan', () => {
  it('takes the tones of the template when nothing else fixes a color, with no variation', () => {
    const plan = run();
    expect(plan.outline).toBe(template.outline);
    for (const { regions, tones } of Object.values(template.roles))
      for (const region of regions) expect(plan.regions[region]).toEqual(tones);
  });

  it('takes an explicit tone over everything else, and derives the tones left open', () => {
    const plan = run({
      palette: {
        pool: [],
        roles: {
          hair: { base: '#112233', shadow: '#000001' },
          outline: { base: '#050505' },
          accent: { base: '#ff00ff' },
        },
      },
    });
    expect(plan.regions.hair.base).toBe('#112233');
    expect(plan.regions.hair.shadow).toBe('#000001');
    expect(lightness(plan.regions.hair.highlight)).toBeGreaterThan(lightness('#112233'));
    expect(plan.outline).toBe('#050505');
    expect(plan.accent).toBe('#ff00ff');
  });

  it('gives one plan to each region of a role, and keeps an explicit base whatever the variation', () => {
    const palette = { roles: { torso: { base: '#aa0000' } } };
    const plan = run({ palette, variation: 1 });
    expect(plan.regions.leftLeg).toEqual(plan.regions.rightLeg);
    expect(plan.regions.head).toEqual(plan.regions.skin);
    expect(plan.regions.torso.base).toBe('#aa0000');
    expect(run({ palette, variation: 0 }).regions.torso.base).toBe('#aa0000');
    expect(plan.regions.hair.base).not.toBe(base('hair'));
  });

  it('moves the colors nothing fixes, by the variation and the seed, and by no more than its bound', () => {
    const [first, again, other] = [run({ variation: 1 }), run({ variation: 1 }), run({ variation: 1, seed: 8 })];
    expect(again).toEqual(first);
    expect(other.regions.head.base).not.toBe(first.regions.head.base);
    for (const seed of [1, 2, 3, 4, 5])
      expect(Math.abs(lightness(run({ variation: 1, seed }).regions.head.base) - lightness(base('skin')))).toBeLessThan(
        0.2,
      );
  });

  it('starts from the dominant color of the source render for a role it has', () => {
    expect(run({ sourceBase: { skin: '#445566' } }).regions.head.base).toBe('#445566');
  });
});

describe('the color slots', () => {
  it('give each role of the template three tones, then the outline and the accent', () => {
    expect(paletteSlots(template).map(({ id }) => id)).toEqual([
      'hair.shadow',
      'hair.base',
      'hair.highlight',
      'skin.shadow',
      'skin.base',
      'skin.highlight',
      'torso.shadow',
      'torso.base',
      'torso.highlight',
      'legs.shadow',
      'legs.base',
      'legs.highlight',
      'outline',
      'accent',
    ]);
    expect(paletteSlots(template).find(({ id }) => id === 'legs.highlight')).toEqual({
      id: 'legs.highlight',
      role: 'legs',
      tone: 'highlight',
    });
  });

  it('take the tones of the template, with no accent', () => {
    const colors = templateSlotColors(template);
    expect(colors['skin.shadow']).toBe(template.roles.skin.tones.shadow);
    expect(colors['legs.base']).toBe(base('legs'));
    expect(colors.outline).toBe(template.outline);
    expect(colors.accent).toBeUndefined();
  });

  it('get random colors in one scheme that keep the lightness of the template', () => {
    const colors = randomSlotColors(template, seededRandom(5));
    expect(Object.keys(colors)).toEqual(paletteSlots(template).map(({ id }) => id));
    expect(randomSlotColors(template, seededRandom(5))).toEqual(colors);
    expect(randomSlotColors(template, seededRandom(6))).not.toEqual(colors);
    expect(lightness(colors.outline)).toBeLessThan(0.3);
    expect(Math.abs(lightness(colors['skin.base']) - lightness(base('skin')))).toBeLessThan(0.1);
    expect(lightness(colors['skin.shadow'])).toBeLessThan(lightness(colors['skin.base']));
    expect(lightness(colors.accent)).toBeGreaterThan(lightness(colors.outline));
  });
});

describe('the foundation palettes of an item', () => {
  const biome = { id: VIOLET_STRATA.id, group: 'biome', roles: VIOLET_STRATA.palette };

  it('color the art roles with each base in order, and its shadow and highlight nearest in hue', () => {
    expect(foundationRoles(template, [biome])).toEqual({
      torso: { base: '#2f5a34', shadow: '#1c3620', highlight: '#8fbf5a' },
      legs: { base: '#6a3fa0', shadow: '#3a2160', highlight: '#9b6fe0' },
      outline: { base: '#120d1c' },
      accent: { base: '#b57bff' },
    });
  });

  it('take the colors the art brief names first, and leave open the tones and roles no palette reaches', () => {
    const brief = { id: 'skin.x', group: 'foundation', roles: { base: ['#aa0000'] } };
    expect(foundationRoles(template, [brief, biome])).toMatchObject({
      torso: { base: '#aa0000' },
      legs: { base: '#2f5a34', shadow: '#1c3620' },
    });
    expect(foundationRoles(template, [brief])).toEqual({ torso: { base: '#aa0000' } });
    expect(foundationRoles(template, [{ roles: { base: ['#2f5a34'], special: ['#6fae3a'] } }])).toMatchObject({
      accent: { base: '#6fae3a' },
    });
    expect(foundationRoles(template)).toEqual({});
  });
});

describe('the palette of a candidate', () => {
  it('takes for each role the color of the palette role it takes, under the slots the request sets', () => {
    const palette = paletteFixture('natural-deep');
    const resolved = candidatePalette(template, {
      palette,
      slots: { 'hair.highlight': '#ffffff', 'skin.base': '#123456' },
    });
    expect(resolved.roles.hair).toEqual({ base: palette.roles.detail, highlight: '#ffffff' });
    expect(resolved.roles.torso).toEqual({ base: palette.roles.primary });
    expect(resolved.roles.legs).toEqual({ base: palette.roles.secondary });
    expect(resolved.roles.skin).toEqual({ base: '#123456' });
    expect(resolved.roles.outline).toEqual({ base: palette.roles.outline });
  });

  it('takes the foundation palettes of its item under the slots of that item, and refuses a slot the template lacks', () => {
    const artDirection = { palettes: [{ group: 'biome', roles: VIOLET_STRATA.palette }] };
    const resolved = candidatePalette(template, { artDirection, slots: { 'legs.base': '#0000ff' } });
    expect(resolved.roles.torso.base).toBe('#2f5a34');
    expect(resolved.roles.legs).toEqual({ base: '#0000ff', shadow: '#3a2160', highlight: '#9b6fe0' });
    expect(() => candidatePalette(template, { slots: { 'wings.base': '#ffffff' } })).toThrow(
      /no color slot wings.base/,
    );
  });
});

describe('the default of each slot', () => {
  const artDirection = { palettes: [{ roles: VIOLET_STRATA.palette }] };

  it('is the foundation color of a role its palettes color, else its render color, else the template color', () => {
    const defaults = slotDefaults({ template, artDirection, sourceBase: { hair: '#5a3a22' } });
    expect(Object.keys(defaults)).toEqual(paletteSlots(template).map(({ id }) => id));
    expect(defaults['torso.shadow']).toEqual({ color: '#1c3620', origin: 'foundation' });
    expect(defaults['legs.base']).toEqual({ color: '#6a3fa0', origin: 'foundation' });
    expect(defaults['hair.base']).toEqual({ color: '#5a3a22', origin: 'render' });
    expect(defaults['hair.shadow']).toEqual({ color: tonesOf('#5a3a22').shadow, origin: 'render' });
    expect(defaults['skin.base']).toEqual({ color: base('skin'), origin: 'template' });
    expect(defaults.outline).toEqual({ color: '#120d1c', origin: 'foundation' });
    expect(defaults.accent).toEqual({ color: '#b57bff', origin: 'foundation' });
  });

  it('takes the colors a palette gives, and keeps the default of a role whose palette role it lacks', () => {
    const palette = paletteFixture('dark-basalt');
    const defaults = slotDefaults({ template, palette });
    expect(defaults['torso.base']).toEqual({ color: palette.roles.primary, origin: 'palette' });
    expect(defaults['legs.base']).toEqual({ color: palette.roles.secondary, origin: 'palette' });
    expect(defaults['hair.base']).toEqual({ color: base('hair'), origin: 'template' });
    expect(defaults['skin.base']).toEqual({ color: base('skin'), origin: 'template' });
    expect(candidatePalette(template, { palette }).roles).not.toHaveProperty('hair');
  });

  it('takes the colors of a palette over the foundation palettes', () => {
    const palette = paletteFixture('natural-deep');
    const defaults = slotDefaults({ template, palette, artDirection });
    expect(defaults['torso.base']).toEqual({ color: palette.roles.primary, origin: 'palette' });
    expect(defaults['hair.base']).toEqual({ color: palette.roles.detail, origin: 'palette' });
    expect(defaults.outline).toEqual({ color: palette.roles.outline, origin: 'palette' });
    expect(defaults['legs.shadow'].origin).toBe('palette');
  });

  it('takes the template with no palette and no render, and the highlight of its first role as accent', () => {
    const defaults = slotDefaults({ template });
    expect(defaults['torso.base']).toEqual({ color: base('torso'), origin: 'template' });
    expect(defaults.outline).toEqual({ color: template.outline, origin: 'template' });
    expect(defaults.accent).toEqual({ color: template.roles.hair.tones.highlight, origin: 'template' });
  });
});
