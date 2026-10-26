import { describe, it, expect } from 'vitest';
import {
  floorParameters,
  floorRenderProblems,
  generateFloorTile,
  prepareFloorBatch,
} from '../../../src/projects/cyberia/procedural/generators/floor/generator.js';
import {
  layoutOf,
  paintLayout,
  shiftLayout,
  tradeBorders,
} from '../../../src/projects/cyberia/procedural/generators/floor/operators.js';
import { resolveProceduralContext } from '../../../src/projects/cyberia/procedural/context.js';
import { candidatePalette, planPalette } from '../../../src/projects/cyberia/procedural/palettes/resolver.js';
import { baselineSource } from '../../../src/projects/cyberia/procedural/source.js';
import { resolveTemplate } from '../../../src/projects/cyberia/procedural/templates.js';
import { seededRandom } from '../../../src/client/components/objectlayer-studio/PixelRegion.js';
import {
  OBJECT_LAYER_KEYFRAMES,
  getKeyframeDirectionsByCode,
} from '../../../src/client/components/objectlayer-studio/ObjectLayerProtocol.js';
import {
  framesByDirection,
  hexToRgba,
  sourceFromDirectionFrames,
  toWire,
} from '../../../src/client/components/objectlayer-studio/RenderSource.js';
import { FLOOR_DEFAULT_PROFILE as profile } from '../../../src/projects/cyberia/procedural/profiles/registry.js';
import { BASELINE_FLOOR, FLOOR_TEMPLATE, VIOLET_STRATA } from '../../support/procedural-content.js';

const template = resolveTemplate(FLOOR_TEMPLATE);
const { width, height } = template.canvas;
const { item, stats } = BASELINE_FLOOR.payload.data;
const meadow = {
  cid: 'bafkreimeadow',
  data: { item: { ...item, id: 'meadow', description: 'A meadow.' }, stats },
  renderSource: { width: 16, height: 16, frames: {} },
};
const batch = prepareFloorBatch(resolveProceduralContext({ source: meadow, template, profile, origin: 'template' }));
const parameters = floorParameters({ variation: 0.6 }, profile);
const biome = { palettes: [{ id: VIOLET_STRATA.id, group: 'biome', roles: { base: VIOLET_STRATA.palette.base } }] };
const run = (overrides = {}) =>
  generateFloorTile(batch, {
    itemId: 'meadow',
    seed: 7,
    parameters,
    palette: candidatePalette(template, { artDirection: biome }),
    ...overrides,
  });
const tileOf = (result) => framesByDirection(result.renderSource)['08'][0];
const color = (hex) => [...hexToRgba(hex).slice(0, 3), 255].join();
const distance = (left, right) => Math.hypot(...left.slice(0, 3).map((value, at) => value - right[at]));

/** The mean color step across the edges a tile wraps, and between interior neighbors. */
function steps(frame) {
  const seam = [];
  const interior = [];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      (x === width - 1 ? seam : interior).push(distance(frame[y][x], frame[y][(x + 1) % width]));
      (y === height - 1 ? seam : interior).push(distance(frame[y][x], frame[(y + 1) % height][x]));
    }
  const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  return { seam: mean(seam), interior: mean(interior) };
}

describe('floor tile parameters', () => {
  it('sets every granular variation from the one variation, and the diversity from the profile', () => {
    expect(floorParameters({ variation: 0.4 }, profile)).toEqual({
      variation: 0.4,
      layoutVariation: 0.4,
      regionVariation: 0.4,
      detailVariation: 0.4,
      paletteVariation: 0.4,
      minDiversity: profile.constraints.diversity.threshold,
    });
    expect(floorParameters({ variation: 0.4, detailVariation: 0 }, profile).detailVariation).toBe(0);
  });

  it('refuses a skin parameter and a value out of bounds', () => {
    expect(() => floorParameters({ hairStyle: 'short' }, profile)).toThrow(/Unknown floor tile parameter: hairStyle/);
    expect(() => floorParameters({ variation: 2 }, profile)).toThrow(/variation must be a number from 0 to 1/);
  });
});

describe('the floor batch', () => {
  it('starts from the template: the template gives the canvas and the direction', () => {
    expect(batch.context.source.renderSource).toBeNull();
    expect(batch.context.directions).toEqual(['08']);
    expect(batch.regionOrder).toEqual(['ground', 'patch']);
    const [base] = batch.baseFrames['08'];
    expect(batch.baseFrames['08']).toHaveLength(1);
    expect(base).toHaveLength(height);
    expect(base.every((row) => row.length === width && row.every((cell) => cell[3] === 255))).toBe(true);
  });

  it('refuses a template that leaves a cell empty: a floor fills its tile', () => {
    const holed = resolveTemplate({
      ...FLOOR_TEMPLATE,
      directions: { '08': [FLOOR_TEMPLATE.directions['08'][0].map((row, y) => (y === 0 ? `.${row.slice(1)}` : row))] },
    });
    expect(() =>
      prepareFloorBatch(resolveProceduralContext({ source: meadow, template: holed, profile, origin: 'template' })),
    ).toThrow(/leaves cells of direction 08 empty/);
  });
});

describe('a floor tile', () => {
  const tile = run();

  it('keeps the identity, description, function and stats of its source', () => {
    expect(tile.data).toEqual({ item: { ...meadow.data.item }, stats });
  });

  it('is a static tile of the template canvas: direction 08 feeds its idle keyframes only', () => {
    const { renderSource } = tile;
    expect([renderSource.width, renderSource.height]).toEqual([width, height]);
    expect(renderSource.frameDurationMs).toBe(FLOOR_TEMPLATE.frameDurationMs);
    expect(Object.keys(renderSource.frames).sort()).toEqual(getKeyframeDirectionsByCode('08').sort());
    expect(OBJECT_LAYER_KEYFRAMES.filter((keyframe) => renderSource.frames[keyframe])).toHaveLength(3);
  });

  it('fills every cell with an opaque color', () => {
    expect(floorRenderProblems(tile.renderSource)).toEqual([]);
    expect(
      tileOf(tile)
        .flat()
        .every((cell) => cell[3] === 255),
    ).toBe(true);
  });

  it('joins its own copies: the steps across the wrapped edges match the interior', () => {
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
    const ratios = seeds.map((seed) => {
      const { seam, interior } = steps(tileOf(run({ seed })));
      return seam / interior;
    });
    expect(ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length).toBeLessThan(1.5);
  });

  it('colors the regions with the base of the biome and keeps the colors a slot sets', () => {
    const colors = new Set(
      tileOf(tile)
        .flat()
        .map((cell) => cell.join()),
    );
    expect(colors.has(color(VIOLET_STRATA.palette.base[0]))).toBe(true);
    const slotted = run({
      palette: candidatePalette(template, { artDirection: biome, slots: { 'patch.base': '#ff0000' } }),
    });
    expect(
      new Set(
        tileOf(slotted)
          .flat()
          .map((cell) => cell.join()),
      ).has(color('#ff0000')),
    ).toBe(true);
  });

  it('gives equal inputs an equal tile, and another seed another one', () => {
    expect(toWire(run().renderSource)).toEqual(toWire(tile.renderSource));
    expect(toWire(run({ seed: 8 }).renderSource)).not.toEqual(toWire(tile.renderSource));
  });

  it('stands apart from the source and from the siblings before it', () => {
    expect(tile.diversity.score).toBeGreaterThanOrEqual(parameters.minDiversity);
    const next = run({ seed: 9, siblings: [{ id: 'meadow#0', signature: tile.diversity.signature }] });
    expect(next.diversity.score).toBeGreaterThanOrEqual(parameters.minDiversity);
  });

  it('draws the template at variation 0: no shift, no trade and no accent', () => {
    const still = run({ parameters: floorParameters({ variation: 0, minDiversity: 0 }, profile) });
    expect(still.metrics).toMatchObject({ shift: [0, 0], traded: 0, accents: 0 });
  });
});

describe('the floor operators', () => {
  const reference = layoutOf(template, '08');
  const share = (layout, region) => layout.filter((value) => value === region).length / layout.length;

  it('treat the edges as the interior: a shifted layout paints the shifted tile', () => {
    const plan = planPalette({ template, palette: { roles: {} }, seed: 0, variation: 0 });
    const paint = (layout) =>
      paintLayout(layout, { width, height, plan, regionOrder: ['ground', 'patch'], random: seededRandom(1), detail: 0 })
        .frame;
    const shift = { width, height, dx: 5, dy: 7 };
    const shifted = paint(shiftLayout(reference, shift));
    const base = paint(reference);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        expect(shifted[y][x]).toEqual(base[(y - 7 + height) % height][(x - 5 + width) % width]);
  });

  it('trade border cells inside the share bounds and never strand a cell', () => {
    const { layout, traded } = tradeBorders(reference, {
      width,
      height,
      pairs: [['ground', 'patch']],
      protectedRegions: [],
      reference,
      maxShift: 0.1,
      random: seededRandom(3),
      strength: 1,
    });
    expect(traded).toBeGreaterThan(0);
    expect(Math.abs(share(layout, 'patch') - share(reference, 'patch'))).toBeLessThanOrEqual(0.1);
    const alone = layout.filter((region, cell) => {
      const x = cell % width;
      const y = (cell - x) / width;
      return [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ].every(([nx, ny]) => layout[((ny + height) % height) * width + ((nx + width) % width)] !== region);
    });
    expect(alone).toEqual([]);
  });

  it('trade no cell of a protected region', () => {
    const { layout } = tradeBorders(reference, {
      width,
      height,
      pairs: [['ground', 'patch']],
      protectedRegions: ['patch'],
      reference,
      maxShift: 0.1,
      random: seededRandom(3),
      strength: 1,
    });
    expect(layout).toEqual(reference);
  });
});

describe('a floor tile from a render', () => {
  const size = 16;
  const shades = [
    [40, 90, 50, 255],
    [50, 110, 60, 255],
    [60, 130, 70, 255],
  ];
  const tile = Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) => shades[(x * 3 + y) % 3].slice()),
  );
  const rendered = {
    ...meadow,
    renderSource: sourceFromDirectionFrames({ framesByCode: { '08': [tile, tile] }, frameDurationMs: 800 }),
  };
  const recolored = prepareFloorBatch(resolveProceduralContext({ source: rendered, template, profile }));
  const result = generateFloorTile(recolored, {
    itemId: 'meadow',
    seed: 7,
    parameters,
    palette: candidatePalette(template, { artDirection: biome }),
  });
  const [frame] = framesByDirection(result.renderSource)['08'];

  it('keeps the canvas, the frames and the frame duration of the render', () => {
    expect([result.renderSource.width, result.renderSource.height]).toEqual([size, size]);
    expect(framesByDirection(result.renderSource)['08']).toHaveLength(2);
    expect(result.renderSource.frameDurationMs).toBe(800);
    expect(result.metrics).toMatchObject({ recolored: true, frames: 2 });
  });

  it('keeps every cell in place: cells of one color stay one color, now a tone of the palette', () => {
    const byShade = new Map();
    tile.forEach((row, y) =>
      row.forEach((cell, x) => {
        const key = cell.join();
        if (!byShade.has(key)) byShade.set(key, frame[y][x].join());
        expect(frame[y][x].join()).toBe(byShade.get(key));
      }),
    );
    const plan = planPalette({
      template,
      palette: candidatePalette(template, { artDirection: biome }),
      seed: result.seed,
      variation: parameters.paletteVariation,
    });
    const tones = new Set(
      [
        plan.outline,
        ...Object.values(plan.regions).flatMap(({ shadow, base, highlight }) => [shadow, base, highlight]),
      ].map(color),
    );
    expect([...byShade.values()].every((tone) => tones.has(tone))).toBe(true);
    expect(floorRenderProblems(result.renderSource)).toEqual([]);
  });

  it('starts from the template when the request asks, whatever the render', () => {
    const drawn = prepareFloorBatch(
      resolveProceduralContext({ source: rendered, template, profile, origin: 'template' }),
    );
    expect(drawn.context.source.renderSource).toBeNull();
    expect(drawn.baseFrames['08'][0]).toHaveLength(height);
  });
});

describe('the floor render check', () => {
  it('names each frame with a cell that is not opaque', () => {
    const frame = batch.baseFrames['08'][0].map((row) => row.map((cell) => cell.slice()));
    frame[0][0] = [0, 0, 0, 0];
    frame[1][1] = [10, 10, 10, 128];
    const source = sourceFromDirectionFrames({ framesByCode: { '08': [frame] }, frameDurationMs: 1000 });
    expect(floorRenderProblems(source)).toEqual(
      getKeyframeDirectionsByCode('08').map((keyframe) => `frame 0 of ${keyframe} has 2 cells that are not opaque`),
    );
  });

  it('takes the baseline floor as the source of a new floor', () => {
    const fresh = prepareFloorBatch(
      resolveProceduralContext({ source: baselineSource('floor', { activable: false, stats }), template, profile }),
    );
    expect(fresh.context.source.itemType).toBe('floor');
  });
});
