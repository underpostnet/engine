import { describe, it, expect } from 'vitest';
import {
  detailPass,
  featurePass,
  paletteMap,
  paletteMaps,
  regionDeformation,
  regionFill,
} from '../../../src/projects/cyberia/procedural/generators/skin/operators.js';
import {
  growHair,
  HAIR_STYLES,
  HAIR_STYLE_IDS,
} from '../../../src/projects/cyberia/procedural/generators/skin/hair-growth.js';
import { analyzeFrame } from '../../../src/projects/cyberia/procedural/core/frame-analysis.js';
import { shapeOf } from '../../../src/projects/cyberia/procedural/core/frame-mutation.js';
import { planPalette } from '../../../src/projects/cyberia/procedural/palettes/resolver.js';
import { resolveProceduralContext } from '../../../src/projects/cyberia/procedural/context.js';
import { prepareSkinBatch } from '../../../src/projects/cyberia/procedural/generators/skin/generator.js';
import { protectedCells, resolveTemplate } from '../../../src/projects/cyberia/procedural/templates.js';
import { hexToRgba } from '../../../src/client/components/objectlayer-studio/RenderSource.js';
import { SKIN_DEFAULT_PROFILE as profile } from '../../../src/projects/cyberia/procedural/profiles/registry.js';
import { SKIN_TEMPLATE } from '../../support/procedural-content.js';
import { bareSkin, skinSource } from '../../support/procedural-skin.js';

const genesis = resolveTemplate(SKIN_TEMPLATE);
const PALETTE = { pool: [], roles: {} };
const plan = (roles = {}, extra = {}) =>
  planPalette({ template: genesis, palette: { ...PALETTE, roles }, seed: 3, variation: 0, ...extra });
const paint = (hex) => [...hexToRgba(hex).slice(0, 3), 255];
const keyOf = (frame, x, y) => frame[y][x].join();
const keys = (cells) => new Set(cells.map(([x, y]) => `${x},${y}`));
const batchOf = (source) => prepareSkinBatch(resolveProceduralContext({ source, template: genesis, profile }));
const template = batchOf(bareSkin(genesis));
const rendered = batchOf(skinSource(genesis));
const direction = (batch, code) => {
  const { frames, owned, rule } = batch.directions[code];
  return { ...frames[0], owned, rule };
};
const cellsWhere = (analysis, mask) =>
  [...mask.keys()]
    .filter((cell) => mask[cell])
    .map((cell) => [cell % analysis.width, Math.floor(cell / analysis.width)]);

describe('region fill', () => {
  const { frame, analysis, owned } = direction(template, '08');
  const colors = plan({ skin: { base: '#336699' } });
  const filled = regionFill(frame, { analysis, owned, plan: colors });

  it('leaves the outline and the input as they were', () => {
    for (const [x, y] of cellsWhere(analysis, analysis.outline)) expect(keyOf(filled, x, y)).toBe(keyOf(frame, x, y));
    expect(frame).toEqual(direction(template, '08').frame);
  });

  it('fills each region with its tones, and only its tones', () => {
    for (const [regionId, cells] of Object.entries(owned)) {
      const tones = new Set(
        ['shadow', 'base', 'highlight'].map((tone) => paint(colors.regions[regionId][tone]).join()),
      );
      for (const [x, y] of cells.filter(([cx, cy]) => analysis.interior[cy * analysis.width + cx]))
        expect(tones.has(keyOf(filled, x, y)), `${regionId} [${x},${y}]`).toBe(true);
    }
  });

  it('shades by the outline: a highlight above and left, a shadow below and right, base inside', () => {
    const used = new Set(owned.head.map(([x, y]) => keyOf(filled, x, y)));
    for (const tone of ['shadow', 'base', 'highlight'])
      expect(used.has(paint(colors.regions.head[tone]).join())).toBe(true);
  });
});

describe('palette map', () => {
  const { frame, analysis, owned } = direction(rendered, '08');
  const colors = plan({ skin: { base: '#336699' }, torso: { base: '#aa2222' } });
  const maps = paletteMaps(rendered.entries, colors);
  const mapped = paletteMap(frame, { analysis, owned, maps });

  it('recolors the interior of a region into its tones and keeps the outline and the transparent cells', () => {
    const tones = new Set(['shadow', 'base', 'highlight'].map((tone) => paint(colors.regions.head[tone]).join()));
    for (const [x, y] of owned.head.filter(([cx, cy]) => analysis.interior[cy * analysis.width + cx]))
      expect(tones.has(keyOf(mapped, x, y))).toBe(true);
    for (const [x, y] of cellsWhere(analysis, analysis.outline)) expect(keyOf(mapped, x, y)).toBe(keyOf(frame, x, y));
    expect(mapped[0][0]).toEqual([0, 0, 0, 0]);
  });

  it('keeps the shape: the same cells are occupied', () => {
    expect(shapeOf(mapped)).toEqual(shapeOf(frame));
  });
});

describe('direction features', () => {
  const colors = plan();
  const run = (rule, code = '08', detail = 1, seed = 5) => {
    const { frame, analysis, owned } = direction(template, code);
    return { frame, analysis, ...featurePass(frame, { analysis, owned, rule, plan: colors, seed, detail }) };
  };

  it('draws two eyes on one row for a front face', () => {
    const { marks, frame, analysis } = run({ face: 'front', facing: 'down' });
    const eyes = marks.filter(([x, y]) => keyOf(frame, x, y) === paint(colors.outline).join());
    expect(eyes.length).toBeGreaterThanOrEqual(2);
    expect(new Set(eyes.map(([, y]) => y)).size).toBe(1);
    for (const [x, y] of marks) expect(analysis.interior[y * analysis.width + x]).toBe(1);
  });

  it('draws one eye on the facing side and an ear for a side face, mirrored for the other side', () => {
    const right = run({ face: 'side', facing: 'right' }, '06');
    const left = run({ face: 'side', facing: 'left' }, '06');
    const outline = paint(colors.outline).join();
    const eyeOf = ({ marks, frame }) => marks.find(([x, y]) => keyOf(frame, x, y) === outline);
    const centerX = (cells) => cells.reduce((sum, [x]) => sum + x, 0) / cells.length;
    const head = direction(template, '06').owned.head;
    expect(eyeOf(right)[0]).toBeGreaterThan(centerX(head));
    expect(eyeOf(left)[0]).toBeLessThan(centerX(head));
    expect(right.marks).toHaveLength(2);
  });

  it('draws nothing for a back face and clears a feature the source head held', () => {
    const { frame: base, analysis, owned } = direction(template, '08');
    const [x, y] = owned.head.find(([cx, cy]) => analysis.interior[cy * analysis.width + cx] && cy > 9);
    const marked = base.map((row) => row.map((cell) => cell.slice()));
    marked[y][x] = [0, 0, 0, 255];
    const result = featurePass(marked, {
      analysis,
      owned,
      rule: { face: 'back', facing: 'up' },
      plan: colors,
      seed: 1,
      detail: 1,
    });
    expect(result.marks).toEqual([]);
    expect(result.frame[y][x]).toEqual(paint(colors.regions.head.base));
  });

  it('draws the same face for the same seed and another for another seed', () => {
    const first = run({ face: 'front', facing: 'down' }).marks;
    expect(run({ face: 'front', facing: 'down' }).marks).toEqual(first);
    const faces = new Set(
      [1, 2, 3, 4, 5, 6].map((seed) => JSON.stringify(run({ face: 'front', facing: 'down' }, '08', 1, seed).marks)),
    );
    expect(faces.size).toBeGreaterThan(1);
  });
});

describe('region deformation', () => {
  const { frame, analysis, owned } = direction(template, '08');
  const colors = plan();
  const frozen = keys(protectedCells(genesis, profile, '08'));
  const pairs = profile.constraints.deformablePairs;
  const run = (strength, seed = 2) =>
    regionDeformation(frame, { analysis, owned, pairs, frozen, plan: colors, seed, strength });

  it('changes nothing at strength 0', () => {
    expect(run(0)).toEqual({ frame, changed: 0 });
  });

  it('moves the border of two regions, deterministically, and never the outline or a protected cell', () => {
    const result = run(1);
    expect(result.changed).toBeGreaterThan(0);
    expect(run(1)).toEqual(result);
    for (const [x, y] of [...cellsWhere(analysis, analysis.outline), ...protectedCells(genesis, profile, '08')])
      expect(keyOf(result.frame, x, y)).toBe(keyOf(frame, x, y));
    expect(shapeOf(result.frame)).toEqual(shapeOf(frame));
  });
});

describe('detail pass', () => {
  const { frame, analysis, owned } = direction(template, '08');
  const colors = plan();
  const frozen = keys(protectedCells(genesis, profile, '08'));
  const run = (detail) =>
    detailPass(frame, { analysis, owned, frozen, plan: colors, seedOf: (id) => id.length + 11, detail });

  it('scatters cells by the detail and keeps the outline and the frozen cells', () => {
    expect(run(0)).toEqual(frame);
    const detailed = run(1);
    expect(detailed).not.toEqual(frame);
    for (const [x, y] of [...cellsWhere(analysis, analysis.outline), ...protectedCells(genesis, profile, '08')])
      expect(keyOf(detailed, x, y)).toBe(keyOf(frame, x, y));
  });
});

describe('hair growth', () => {
  const { frame: base, analysis: baseAnalysis, owned, rule } = direction(template, '08');
  const colors = plan();
  const frame = regionFill(base, { analysis: baseAnalysis, owned, plan: colors });
  const frozen = keys(protectedCells(genesis, profile, '08'));
  const grow = (overrides = {}) =>
    growHair(frame, {
      analysis: analyzeFrame(frame),
      hairCells: owned.hair,
      headCells: owned.head,
      frozen,
      rule,
      style: 'long',
      plan: colors,
      seed: 4,
      strength: 1,
      ...overrides,
    });

  it('names its styles', () => {
    expect(HAIR_STYLE_IDS).toEqual(Object.keys(HAIR_STYLES));
    expect(HAIR_STYLE_IDS).toEqual(
      expect.arrayContaining(['short', 'medium', 'long', 'left-heavy', 'right-heavy', 'messy', 'layered']),
    );
  });

  it('adds nothing at strength 0', () => {
    expect(grow({ strength: 0 })).toEqual({ frame, added: 0 });
  });

  it('grows hair on free cells outside the frozen shape, and keeps the components and the holes', () => {
    const results = [1, 2, 3, 4, 5, 6].map((seed) => grow({ seed }));
    expect(results.some(({ added }) => added > 0)).toBe(true);
    for (const result of results) {
      const before = shapeOf(frame);
      const after = shapeOf(result.frame);
      expect([after.components, after.holes]).toEqual([before.components, before.holes]);
      expect(after.count).toBe(before.count + result.added);
      for (const [x, y] of protectedCells(genesis, profile, '08')) expect(keyOf(result.frame, x, y)).toBe(keyOf(frame, x, y));
    }
  });

  it('grows the same hair for the same seed and other hair for other seeds', () => {
    expect(grow({ seed: 9 })).toEqual(grow({ seed: 9 }));
    expect(new Set([1, 2, 3, 4, 5, 6].map((seed) => JSON.stringify(grow({ seed }).frame))).size).toBeGreaterThan(1);
  });

  it('gives a new boundary cell the outline color and a longer style more hair than a shorter one', () => {
    const total = (style) => [1, 2, 3, 4, 5, 6].reduce((sum, seed) => sum + grow({ style, seed }).added, 0);
    expect(total('long')).toBeGreaterThan(total('short'));
    const result = grow({ seed: 2 });
    const after = analyzeFrame(result.frame);
    const added = cellsWhere(after, after.mask).filter(([x, y]) => frame[y][x][3] === 0);
    for (const [x, y] of added.filter(([cx, cy]) => after.outline[cy * after.width + cx]))
      expect(keyOf(result.frame, x, y)).toBe(paint(colors.outline).join());
  });

  it('pulls a heavy style to its side', () => {
    const mean = (style) => {
      const cells = [1, 2, 3, 4, 5, 6, 7, 8].flatMap((seed) => {
        const result = grow({ style, seed });
        return cellsWhere(analyzeFrame(result.frame), analyzeFrame(result.frame).mask).filter(
          ([x, y]) => frame[y][x][3] === 0,
        );
      });
      return cells.reduce((sum, [x]) => sum + x, 0) / cells.length;
    };
    expect(mean('right-heavy')).toBeGreaterThan(mean('left-heavy'));
  });
});
