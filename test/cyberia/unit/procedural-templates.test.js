import { describe, it, expect } from 'vitest';
import {
  compatibilityProblems,
  drawTemplate,
  protectedCells,
  resolveTemplate,
  templateProblems,
} from '../../../src/projects/cyberia/procedural/templates.js';
import { SKIN_DEFAULT_PROFILE } from '../../../src/projects/cyberia/procedural/profiles/registry.js';
import { sourceFromDirectionFrames } from '../../../src/client/components/objectlayer-studio/RenderSource.js';
import { SKIN_TEMPLATE } from '../../support/procedural-content.js';

const TONES = { shadow: '#101010', base: '#808080', highlight: '#f0f0f0' };
const tiny = (overrides = {}) => ({
  id: 'skin.tiny',
  name: 'Tiny',
  description: 'A tiny figure.',
  itemType: 'skin',
  canvas: { width: 4, height: 3 },
  frameDurationMs: 100,
  outline: '#000000',
  legend: { h: 'hair', s: 'skin' },
  roles: { hair: { regions: ['hair'], tones: TONES }, skin: { regions: ['skin'], tones: TONES, artDirection: true } },
  directions: { '08': ['.hh.', '.ss.', '....'] },
  ...overrides,
});

describe('a Genesis Template', () => {
  it('resolves the cells of each region from its region map, and the role of each region', () => {
    const template = resolveTemplate(tiny());
    expect(template.directions['08']).toEqual({
      hair: [
        [1, 0],
        [2, 0],
      ],
      skin: [
        [1, 1],
        [2, 1],
      ],
    });
    expect(template.regionRoles).toEqual({ hair: 'hair', skin: 'skin' });
    expect(template.roles.skin).toEqual({ regions: ['skin'], tones: TONES, artDirection: true });
    expect(template.roles.hair.artDirection).toBe(false);
  });

  it.each([
    ['an id of another item type', { id: 'weapon.tiny' }, /<itemType>.<slug>/],
    ['a canvas without size', { canvas: { width: 0, height: 3 } }, /canvas/],
    ['no frame duration', { frameDurationMs: 0 }, /frameDurationMs/],
    ['an outline that is no color', { outline: 'black' }, /outline/],
    ['a legend letter for two regions', { legend: { h: 'hair', s: 'hair' } }, /legend/],
    ['a region in no role', { legend: { h: 'hair', s: 'skin', e: 'head' } }, /head is in no role/],
    [
      'a region in two roles',
      { roles: { hair: { regions: ['hair', 'skin'], tones: TONES }, skin: { regions: ['skin'], tones: TONES } } },
      /skin is in roles hair and skin/,
    ],
    [
      'a role with a missing tone',
      { roles: { hair: { regions: ['hair', 'skin'], tones: { base: '#808080' } } } },
      /tones/,
    ],
    ['a generator role', { roles: { outline: { regions: ['hair', 'skin'], tones: TONES } } }, /not a template role/],
    ['a direction code the protocol lacks', { directions: { 99: ['.hh.', '.ss.', '....'] } }, /not a direction code/],
    ['a row of the wrong length', { directions: { '08': ['.hh', '.ss.', '....'] } }, /3 rows of 4 cells/],
    ['a letter the legend lacks', { directions: { '08': ['.hx.', '.ss.', '....'] } }, /holds x/],
    ['no direction', { directions: {} }, /at least one direction/],
  ])('refuses %s', (_, overrides, message) => {
    expect(() => resolveTemplate(tiny(overrides))).toThrow(message);
  });

  it('fits a profile that ranks its regions and whose required directions it draws', () => {
    const template = resolveTemplate(tiny());
    const profile = {
      ...SKIN_DEFAULT_PROFILE,
      constraints: { ...SKIN_DEFAULT_PROFILE.constraints, requiredDirections: ['08'] },
    };
    expect(templateProblems(template, profile)).toEqual([]);
    expect(templateProblems(template, SKIN_DEFAULT_PROFILE)).toEqual(['it has no direction 06']);
    expect(
      templateProblems(
        resolveTemplate(
          tiny({ legend: { h: 'hair', s: 'tail' }, roles: { hair: { regions: ['hair', 'tail'], tones: TONES } } }),
        ),
        profile,
      ),
    ).toEqual(['profile skin-default does not rank tail']);
  });

  it('lists the cells of the regions the profile protects', () => {
    const template = resolveTemplate(tiny());
    expect(protectedCells(template, { constraints: { protectedRegions: ['hair'] } }, '08')).toEqual([
      [1, 0],
      [2, 0],
    ]);
    expect(protectedCells(template, SKIN_DEFAULT_PROFILE, '06')).toEqual([]);
  });

  it('draws each region in the base tone of its role inside an outline ring', () => {
    const frame = drawTemplate(resolveTemplate(tiny()), '08');
    expect(frame[0][1]).toEqual([128, 128, 128, 255]);
    expect(frame[0][0]).toEqual([0, 0, 0, 255]);
    expect(frame[2][1]).toEqual([0, 0, 0, 255]);
    expect(frame[2][0]).toEqual([0, 0, 0, 0]);
  });
});

describe('source compatibility', () => {
  const frame = (width, height) =>
    Array.from({ length: height }, () => Array.from({ length: width }, () => [9, 9, 9, 255]));
  const sourceOf = (width, height, codes = ['08', '06']) =>
    sourceFromDirectionFrames({
      framesByCode: Object.fromEntries(codes.map((code) => [code, [frame(width, height)]])),
      frameDurationMs: 100,
    });
  const fit = { template: resolveTemplate(SKIN_TEMPLATE), profile: SKIN_DEFAULT_PROFILE };

  it('accepts a source of the canvas and the required directions, and an item with no render', () => {
    expect(compatibilityProblems(fit, sourceOf(25, 25), 'skin')).toEqual([]);
    expect(compatibilityProblems(fit, null, 'skin')).toEqual([]);
  });

  it('names the item type, the canvas and the missing direction', () => {
    expect(compatibilityProblems(fit, sourceOf(24, 25), 'weapon')).toEqual([
      'its item type is weapon, not skin',
      'its canvas is 24×25, not 25×25',
    ]);
    expect(compatibilityProblems(fit, sourceOf(25, 25, ['08']), 'skin')).toEqual(['it has no frame in direction 06']);
  });
});

describe('the humanoid Genesis Template', () => {
  const template = resolveTemplate(SKIN_TEMPLATE);

  it('fits the shipped skin profile', () => {
    expect(templateProblems(template, SKIN_DEFAULT_PROFILE)).toEqual([]);
  });

  it('gives every canvas cell at most one region, and keeps the head above the torso', () => {
    for (const code of Object.keys(template.directions)) {
      const keys = Object.values(template.directions[code])
        .flat()
        .map(([x, y]) => `${x},${y}`);
      expect(new Set(keys).size).toBe(keys.length);
    }
    const owned = template.directions['08'];
    expect(Math.max(...owned.head.map(([, y]) => y))).toBeLessThan(Math.min(...owned.torso.map(([, y]) => y)));
  });

  it('lets the art direction color the body and gives both legs one role', () => {
    expect(Object.keys(template.roles).filter((role) => template.roles[role].artDirection)).toEqual(['torso', 'legs']);
    expect(template.roles.legs.regions).toEqual(['leftLeg', 'rightLeg']);
  });
});
