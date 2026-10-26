import { describe, it, expect, vi } from 'vitest';
import {
  paletteCatalog,
  paletteOf,
  randomPalette,
  validatePalette,
} from '../../../src/projects/cyberia/procedural/palettes/catalog.js';
import { paletteRoles, rampRoles } from '../../../src/projects/cyberia/procedural/palettes/resolver.js';
import { IMPORT_SLOTS, importPaletteDefaults, importRoles } from '../../../src/projects/cyberia/procedural/spec.js';
import { transformImportedFrames } from '../../../src/projects/cyberia/procedural/core/frame-mutation.js';
import { resolveTemplate } from '../../../src/projects/cyberia/procedural/templates.js';
import { hexToRgba } from '../../../src/client/components/objectlayer-studio/RenderSource.js';
import { toOklab } from '../../../src/projects/cyberia/procedural/core/oklab.js';
import {
  FLOOR_TEMPLATE,
  OBSTACLE_TEMPLATE,
  PALETTES,
  PALETTE_FAMILIES,
  PORTAL_TEMPLATE,
  SKIN_TEMPLATE,
  writeProceduralArtifact,
} from '../../support/procedural-content.js';

vi.stubEnv('CYBERIA_CONTENT_ROOT', writeProceduralArtifact());

const TEMPLATES = [SKIN_TEMPLATE, FLOOR_TEMPLATE, PORTAL_TEMPLATE, OBSTACLE_TEMPLATE].map(resolveTemplate);
const lightness = ({ roles, constraints }) => toOklab(hexToRgba(roles[constraints.contrastRoles[0]]))[0];

describe('the palette catalog', () => {
  it('reads every palette of the library, verified', () => {
    const { families, palettes } = paletteCatalog();
    expect(families).toEqual(PALETTE_FAMILIES);
    expect(palettes.map(({ id }) => id).sort()).toEqual(PALETTES.map(({ id }) => id).sort());
    expect(paletteCatalog()).toBe(paletteCatalog());
  });

  it('lists the families in order, each from the darkest first contrast role to the lightest', () => {
    const { palettes } = paletteCatalog();
    const ranks = palettes.map(({ family }) => PALETTE_FAMILIES.indexOf(family));
    expect(ranks).toEqual([...ranks].sort((left, right) => left - right));
    const natural = palettes.filter(({ family }) => family === 'natural').map(lightness);
    expect(natural).toEqual([...natural].sort((left, right) => left - right));
  });

  it('colors the roles of every template from any palette, by the palette role each role takes', () => {
    for (const palette of PALETTES)
      for (const template of TEMPLATES) {
        const roles = paletteRoles(template, palette);
        for (const [role, { palette: taken }] of Object.entries(template.roles))
          expect(roles[role], `${palette.id} ${template.id} ${role}`).toBe(palette.roles[taken]);
        expect(roles.outline).toBe(palette.roles.outline);
        expect(roles.primary).toBeUndefined();
      }
    const basalt = paletteRoles(TEMPLATES[0], paletteOf('dark-basalt'));
    expect(Object.keys(basalt).sort()).toEqual(['accent', 'legs', 'outline', 'torso']);
  });

  it('remaps imported frames to any palette of the library, whatever the item type', () => {
    const frame = [
      [
        [20, 20, 20, 255],
        [120, 60, 40, 255],
        [0, 0, 0, 0],
      ],
      [
        [200, 180, 160, 255],
        [120, 60, 40, 255],
        [60, 30, 20, 255],
      ],
    ];
    for (const palette of PALETTES) {
      const { framesByCode } = transformImportedFrames({ '08': [frame] }, rampRoles(palette), {
        mutate: true,
        seed: 1,
      });
      const colors = new Set(Object.values(palette.roles));
      const painted = framesByCode['08'][0].flat().filter((cell) => cell[3] > 0);
      expect(painted.length, palette.id).toBe(5);
      for (const [r, g, b] of painted)
        expect(colors.has(`#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`), palette.id).toBe(true);
    }
  });

  it('finds a palette by its id, and names an id it does not hold', () => {
    expect(paletteOf('exotic-teal')).toBe(paletteCatalog().palettes.find(({ id }) => id === 'exotic-teal'));
    expect(() => paletteOf('skin.exotic-teal')).toThrow('There is no palette skin.exotic-teal');
  });

  it('refuses a palette that breaks the structure', () => {
    const valid = paletteOf('natural-medium');
    const refuse = (change, message) =>
      expect(() => validatePalette({ ...valid, ...change }, PALETTE_FAMILIES)).toThrow(message);
    refuse({ id: 'skin.medium' }, /its id must be a slug/);
    refuse({ family: 'metal' }, /not a family/);
    refuse({ biomeTags: ['Bad Tag'] }, /biomeTags/);
    refuse({ roles: { ...valid.roles, detail: 'red' } }, /#rrggbb/);
    refuse({ roles: { ...valid.roles, torso: '#ffffff' } }, /#rrggbb/);
    const without = (name) => Object.fromEntries(Object.entries(valid.roles).filter(([role]) => role !== name));
    refuse({ roles: without('primary') }, /must give primary and outline/);
    refuse({ roles: without('outline') }, /must give primary and outline/);
    expect(() =>
      validatePalette(
        { ...valid, roles: without('feature'), constraints: { minContrast: 0.04, contrastRoles: ['primary'] } },
        PALETTE_FAMILIES,
      ),
    ).not.toThrow();
    refuse(
      { roles: without('detail'), constraints: { minContrast: 0.04, contrastRoles: ['detail'] } },
      /contrastRoles/,
    );
    refuse({ roles: { ...valid.roles, primary: valid.roles.outline } }, /primary is too close to the outline/);
    refuse({ constraints: { minContrast: 0.04, contrastRoles: ['torso'] } }, /contrastRoles/);
  });
});

describe('the random palette', () => {
  const take = (overrides) => randomPalette({ rootSeed: 7, itemId: 'skin-001', ...overrides }).id;

  it('gives the same palette for the same root seed, item id and variant', () => {
    expect(take()).toBe(take());
  });

  it('depends on the root seed, the item id and the variant', () => {
    const ids = (change) => new Set(Array.from({ length: 40 }, (_, at) => take(change(at))));
    expect(ids((at) => ({ rootSeed: at })).size).toBeGreaterThan(2);
    expect(ids((at) => ({ itemId: `skin-${at}` })).size).toBeGreaterThan(2);
    expect(ids((at) => ({ variant: at })).size).toBeGreaterThan(2);
  });

  it('reaches every palette of the library over a batch', () => {
    const picked = new Set(Array.from({ length: 100 }, (_, at) => take({ rootSeed: 1, itemId: `i-${at}` })));
    expect(picked.size).toBe(PALETTES.length);
  });
});

describe('the palette of a frame import', () => {
  const slotsOf = (palette) =>
    Object.fromEntries(
      IMPORT_SLOTS.filter((slot) => palette.roles[slot]).map((slot) => [
        slot,
        { color: palette.roles[slot], origin: 'palette' },
      ]),
    );

  it('takes the palette of the library the author chose, else the first one, slot by slot', () => {
    const teal = paletteOf('exotic-teal');
    expect(importPaletteDefaults({ paletteId: 'exotic-teal' })).toEqual({
      templateId: '',
      palettes: [],
      slots: slotsOf(teal),
    });
    expect(importPaletteDefaults({})).toEqual({
      templateId: '',
      palettes: [],
      slots: slotsOf(paletteCatalog().palettes[0]),
    });
  });

  it('remaps to the palette under the colors the author set, one slot at a time', () => {
    const teal = paletteOf('exotic-teal');
    expect(importRoles({ paletteId: 'exotic-teal' })).toEqual(rampRoles(teal));
    const set = importRoles({ paletteId: 'exotic-teal', slots: { primary: '#123456', outline: '#010101' } });
    expect(set).toEqual(rampRoles({ roles: { ...teal.roles, primary: '#123456', outline: '#010101' } }));
  });

  it('refuses an unknown palette, an unknown slot and a color that is not #rrggbb', () => {
    expect(() => importRoles({ paletteId: 'no-such-theme' })).toThrow('There is no palette no-such-theme');
    expect(() => importRoles({ slots: { hair: '#123456' } })).toThrow('hair is not an import slot');
    expect(() => importRoles({ slots: { primary: 'red' } })).toThrow('primary is not a #rrggbb color');
    expect(() => importRoles({ slots: [] })).toThrow('palette.slots maps an import slot to a #rrggbb color');
  });
});
