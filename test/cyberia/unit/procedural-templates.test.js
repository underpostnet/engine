import { describe, it, expect } from 'vitest';
import {
  compatibilityProblems,
  drawTemplate,
  placeRegions,
  protectedCells,
  regionsOf,
  resolveTemplate,
  templateProblems,
} from '../../../src/projects/cyberia/procedural/templates.js';
import { analyzeFrame } from '../../../src/projects/cyberia/procedural/core/frame-analysis.js';
import { SKIN_DEFAULT_PROFILE } from '../../../src/projects/cyberia/procedural/profiles/registry.js';
import { sourceFromDirectionFrames } from '../../../src/client/components/objectlayer-studio/RenderSource.js';
import { FLOOR_TEMPLATE, SKIN_TEMPLATE } from '../../support/procedural-content.js';

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
  roles: {
    hair: { regions: ['hair'], palette: 'detail', tones: TONES },
    skin: { regions: ['skin'], palette: 'primary', tones: TONES, artDirection: true },
  },
  directions: { '08': [['.hh.', '.ss.', '....']] },
  ...overrides,
});

describe('a Genesis Template', () => {
  it('resolves the cells of each region from its region map, and the role of each region', () => {
    const template = resolveTemplate(tiny());
    expect(template.directions['08']).toEqual([
      {
        hair: [
          [1, 0],
          [2, 0],
        ],
        skin: [
          [1, 1],
          [2, 1],
        ],
      },
    ]);
    expect(template.regionRoles).toEqual({ hair: 'hair', skin: 'skin' });
    expect(template.roles.skin).toEqual({ regions: ['skin'], palette: 'primary', tones: TONES, artDirection: true });
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
      {
        roles: {
          hair: { regions: ['hair', 'skin'], palette: 'detail', tones: TONES },
          skin: { regions: ['skin'], palette: 'primary', tones: TONES },
        },
      },
      /skin is in roles hair and skin/,
    ],
    [
      'a role with a missing tone',
      { roles: { hair: { regions: ['hair', 'skin'], palette: 'detail', tones: { base: '#808080' } } } },
      /tones/,
    ],
    [
      'a role with no palette role',
      { roles: { hair: { regions: ['hair', 'skin'], palette: 'hair', tones: TONES } } },
      /role hair takes no palette role of primary, secondary, detail, feature/,
    ],
    ['a generator role', { roles: { outline: { regions: ['hair', 'skin'], tones: TONES } } }, /not a template role/],
    ['a direction code the protocol lacks', { directions: { 99: [['.hh.', '.ss.', '....']] } }, /not a direction code/],
    ['a direction with no frame', { directions: { '08': [] } }, /direction 08 needs a list of frames/],
    ['rows in place of frames', { directions: { '08': ['.hh.', '.ss.', '....'] } }, /frame 0 of direction 08 needs/],
    ['a row of the wrong length', { directions: { '08': [['.hh', '.ss.', '....']] } }, /3 rows of 4 cells/],
    [
      'a letter the legend lacks',
      { directions: { '08': [['.hx.', '.ss.', '....']] } },
      /frame 0 of direction 08 holds x/,
    ],
    ['no direction', { directions: {} }, /at least one direction/],
  ])('refuses %s', (_, overrides, message) => {
    expect(() => resolveTemplate(tiny(overrides))).toThrow(message);
  });

  it('takes the frames its author chooses, and refuses only a region the profile does not rank', () => {
    const frame = ['.hh.', '.ss.', '....'];
    const step = ['.hh.', '.s..', '....'];
    const facings = Object.fromEntries(
      ['08', '02', '04', '06'].flatMap((idle) => [
        [idle, [frame]],
        [`1${idle[1]}`, [frame, step]],
      ]),
    );
    expect(templateProblems(resolveTemplate(tiny({ directions: facings })), SKIN_DEFAULT_PROFILE)).toEqual([]);
    expect(templateProblems(resolveTemplate(tiny()), SKIN_DEFAULT_PROFILE)).toEqual([]);
    const still = resolveTemplate(tiny({ directions: { ...facings, 18: [frame, frame] } }));
    expect(templateProblems(still, SKIN_DEFAULT_PROFILE)).toEqual([]);
    const tail = tiny({
      directions: facings,
      legend: { h: 'hair', s: 'tail' },
      roles: { hair: { regions: ['hair', 'tail'], palette: 'detail', tones: TONES } },
    });
    expect(templateProblems(resolveTemplate(tail), SKIN_DEFAULT_PROFILE)).toEqual([
      'profile skin-default does not rank tail',
    ]);
  });

  it('reads a frame past the last one as the last frame the template draws', () => {
    const template = resolveTemplate(tiny());
    expect(regionsOf(template, '08', 3)).toBe(template.directions['08'][0]);
    expect(regionsOf(template, '06', 0)).toBeUndefined();
  });

  it('lists the cells of the regions the profile protects', () => {
    const owned = regionsOf(resolveTemplate(tiny()), '08', 0);
    expect(protectedCells(owned, { constraints: { protectedRegions: ['hair'] } })).toEqual([
      [1, 0],
      [2, 0],
    ]);
    expect(protectedCells(owned, SKIN_DEFAULT_PROFILE)).toEqual([]);
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
  const template = resolveTemplate(SKIN_TEMPLATE);

  it('accepts a render of any canvas and directions, and an item with no render', () => {
    expect(compatibilityProblems(template, sourceOf(25, 25), 'skin')).toEqual([]);
    expect(compatibilityProblems(template, sourceOf(26, 26, ['08']), 'skin')).toEqual([]);
    expect(compatibilityProblems(template, null, 'skin')).toEqual([]);
  });

  it('names the item type and a render with no frame', () => {
    expect(compatibilityProblems(template, sourceOf(24, 25), 'weapon')).toEqual(['its item type is weapon, not skin']);
    expect(compatibilityProblems(template, sourceOf(25, 25, []), 'skin')).toEqual(['its render has no frame']);
  });
});

describe('the place of template regions on a render', () => {
  const template = resolveTemplate(SKIN_TEMPLATE);
  const owned = regionsOf(template, '08', 0);
  const cells = Object.values(owned).flat();

  it('keeps the regions where a render of the template canvas stands like the template', () => {
    expect(placeRegions(owned, analyzeFrame(drawTemplate(template, '08')))).toBe(owned);
  });

  it('moves the regions onto the interior of a larger render: bottom on bottom, centre on centre', () => {
    const wide = drawTemplate(template, '08').map((row) => [[0, 0, 0, 0], ...row]);
    wide.unshift(wide[0].map(() => [0, 0, 0, 0]));
    const placed = placeRegions(owned, analyzeFrame(wide));
    const moved = Object.values(placed).flat();
    expect(moved).toHaveLength(cells.length);
    expect(moved).toEqual(cells.map(([x, y]) => [x + 1, y + 1]));
  });
});

describe('the terrain Genesis Template', () => {
  it('draws one static frame facing down', () => {
    expect(resolveTemplate(FLOOR_TEMPLATE).directions).toEqual({ '08': [expect.any(Object)] });
  });
});

describe('the humanoid Genesis Template', () => {
  const template = resolveTemplate(SKIN_TEMPLATE);

  it('fits the shipped skin profile', () => {
    expect(templateProblems(template, SKIN_DEFAULT_PROFILE)).toEqual([]);
  });

  it('gives every canvas cell at most one region, and keeps the head above the torso', () => {
    for (const frames of Object.values(template.directions))
      for (const owned of frames) {
        const keys = Object.values(owned)
          .flat()
          .map(([x, y]) => `${x},${y}`);
        expect(new Set(keys).size).toBe(keys.length);
        expect(Math.max(...owned.head.map(([, y]) => y))).toBeLessThan(Math.min(...owned.torso.map(([, y]) => y)));
      }
  });

  it('shows the back of the head with no face, and the left side as the mirror of the right', () => {
    const [back] = template.directions['02'];
    for (let y = 4; y < 13; y++) {
      const xs = [...back.hair, ...back.head].filter(([, row]) => row === y).map(([x]) => x);
      expect(xs.length).toBe(Math.max(...xs) - Math.min(...xs) + 1);
    }
    const mirror = ([x, y]) => [template.canvas.width - 1 - x, y];
    const [left] = template.directions['04'];
    const [right] = template.directions['06'];
    for (const region of Object.keys(right)) expect([...left[region]].sort()).toEqual(right[region].map(mirror).sort());
  });

  it('walks by lifting one foot, then the other, with the body still', () => {
    for (const [walk, idle] of [
      ['18', '08'],
      ['12', '02'],
      ['14', '04'],
      ['16', '06'],
    ]) {
      const [stand] = template.directions[idle];
      const [left, right] = template.directions[walk];
      for (const region of ['hair', 'head', 'skin', 'torso']) {
        expect(left[region]).toEqual(stand[region]);
        expect(right[region]).toEqual(stand[region]);
      }
      expect(left.leftLeg.length).toBeLessThan(stand.leftLeg.length);
      expect(left.rightLeg).toEqual(stand.rightLeg);
      expect(right.rightLeg.length).toBeLessThan(stand.rightLeg.length);
      expect(right.leftLeg).toEqual(stand.leftLeg);
    }
  });

  it('lets the art direction color the body and gives both legs one role', () => {
    expect(Object.keys(template.roles).filter((role) => template.roles[role].artDirection)).toEqual(['torso', 'legs']);
    expect(template.roles.legs.regions).toEqual(['leftLeg', 'rightLeg']);
  });
});
