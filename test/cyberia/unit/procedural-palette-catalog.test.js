import { describe, it, expect, vi } from 'vitest';
import {
  paletteCatalog,
  palettesFor,
  randomPalette,
  validatePaletteTemplate,
} from '../../../src/projects/cyberia/procedural/palettes/catalog.js';
import { resolveTemplate } from '../../../src/projects/cyberia/procedural/templates.js';
import { hexToRgba } from '../../../src/client/components/objectlayer-studio/RenderSource.js';
import { toOklab } from '../../../src/projects/cyberia/procedural/core/oklab.js';
import {
  PALETTE_FAMILIES,
  SKIN_PALETTES,
  SKIN_TEMPLATE,
  writeProceduralArtifact,
} from '../../support/procedural-content.js';

vi.stubEnv('CYBERIA_CONTENT_ROOT', writeProceduralArtifact());

const template = resolveTemplate(SKIN_TEMPLATE);
const skinLightness = ({ roles }) => toOklab(hexToRgba(roles.skin))[0];

describe('the palette catalog', () => {
  it('reads every Palette Template of the content, verified', () => {
    const { families, palettes } = paletteCatalog();
    expect(families).toEqual(PALETTE_FAMILIES);
    expect(palettes.map(({ id }) => id).sort()).toEqual(SKIN_PALETTES.map(({ id }) => id).sort());
    expect(paletteCatalog()).toBe(paletteCatalog());
  });

  it('lists the families in order, each from the darkest skin to the lightest', () => {
    const { palettes } = paletteCatalog();
    const ranks = palettes.map(({ family }) => PALETTE_FAMILIES.indexOf(family));
    expect(ranks).toEqual([...ranks].sort((left, right) => left - right));
    const natural = palettes.filter(({ family }) => family === 'natural').map(skinLightness);
    expect(natural).toEqual([...natural].sort((left, right) => left - right));
  });

  it('fits the palettes of the item type whose roles the template has', () => {
    expect(palettesFor(template)).toHaveLength(SKIN_PALETTES.length);
    expect(palettesFor({ ...template, itemType: 'weapon' })).toEqual([]);
    const roles = Object.fromEntries(Object.entries(template.roles).filter(([role]) => role !== 'legs'));
    expect(palettesFor({ ...template, roles })).toEqual([]);
  });

  it('refuses a palette that breaks the structure', () => {
    const valid = paletteCatalog().palettes.find(({ id }) => id === 'skin.natural-medium');
    const refuse = (change, message) =>
      expect(() => validatePaletteTemplate({ ...valid, ...change }, PALETTE_FAMILIES)).toThrow(message);
    refuse({ id: 'Bad' }, /<itemType>.<slug>/);
    refuse({ id: 'weapon.medium' }, /<itemType>.<slug>/);
    refuse({ family: 'metal' }, /not a family/);
    refuse({ biomeTags: ['Bad Tag'] }, /biomeTags/);
    refuse({ roles: { ...valid.roles, hair: 'red' } }, /#rrggbb/);
    refuse({ roles: { ...valid.roles, torso: valid.roles.outline } }, /torso is too close to the outline/);
    refuse({ constraints: { minContrast: 0.04, contrastRoles: ['wing'] } }, /contrastRoles/);
  });
});

describe('the random palette', () => {
  const take = (overrides) => randomPalette({ template, rootSeed: 7, itemId: 'skin-001', ...overrides }).id;

  it('gives the same palette for the same root seed, item id and variant', () => {
    expect(take()).toBe(take());
  });

  it('depends on the root seed, the item id and the variant', () => {
    const ids = (change) => new Set(Array.from({ length: 40 }, (_, at) => take(change(at))));
    expect(ids((at) => ({ rootSeed: at })).size).toBeGreaterThan(2);
    expect(ids((at) => ({ itemId: `skin-${at}` })).size).toBeGreaterThan(2);
    expect(ids((at) => ({ variant: at })).size).toBeGreaterThan(2);
  });

  it('reaches every fitting palette over a batch, and refuses a template no palette fits', () => {
    const picked = new Set(
      Array.from({ length: 100 }, (_, at) => randomPalette({ template, rootSeed: 1, itemId: `i-${at}` }).id),
    );
    expect(picked.size).toBe(SKIN_PALETTES.length);
    expect(() =>
      randomPalette({ template: { ...template, id: 'weapon.blade', itemType: 'weapon' }, rootSeed: 1, itemId: 'a' }),
    ).toThrow(/No palette fits Genesis Template weapon.blade/);
  });
});
