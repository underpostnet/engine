import { describe, it, expect } from 'vitest';
import {
  colorRamp,
  mixColor,
  colorRegion,
  ellipseRegion,
  fillRegion,
  lineRegion,
  mirrorRegion,
  outlineRegion,
  paletteApply,
  paletteSwap,
  patternRegion,
  polygonRegion,
  rectOutlineRegion,
  rectRegion,
  regionFromQuery,
  scatterRegion,
  stampRegion,
  tiledPreview,
} from '../../../src/client/components/objectlayer-studio/PixelRegion.js';
import { renderTemplate, templateSuits } from '../../../src/client/components/objectlayer-studio/PixelTemplate.js';

const _ = [0, 0, 0, 0];
const R = [255, 0, 0, 255];
const G = [0, 255, 0, 255];
const B = [0, 0, 255, 255];
const blank = (width, height) => Array.from({ length: height }, () => Array.from({ length: width }, () => _.slice()));
const keys = (cells) => cells.map(([x, y]) => `${x},${y}`).sort();

describe('pixel regions', () => {
  it('builds shapes as cells once each', () => {
    expect(keys(rectRegion(2, 1, 0, 0))).toEqual(
      keys([
        [0, 0],
        [1, 0],
        [2, 0],
        [0, 1],
        [1, 1],
        [2, 1],
      ]),
    );
    expect(rectOutlineRegion(0, 0, 2, 2)).toHaveLength(8);
    expect(lineRegion(0, 0, 3, 3)).toEqual([
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 3],
    ]);
    expect(lineRegion(0, 0, 3, 1)).toHaveLength(4);
    const disc = ellipseRegion(0, 0, 4, 4);
    const ring = ellipseRegion(0, 0, 4, 4, { filled: false });
    expect(disc).toContainEqual([2, 2]);
    expect(ring).not.toContainEqual([2, 2]);
    expect(keys(ring).every((key) => keys(disc).includes(key))).toBe(true);
    expect(
      keys(
        polygonRegion([
          [0, 0],
          [4, 0],
          [0, 4],
        ]),
      ),
    ).toContain('0,0');
    expect(
      keys(
        polygonRegion([
          [0, 0],
          [4, 0],
          [0, 4],
        ]),
      ),
    ).not.toContain('3,3');
  });

  it('reads a region from a coordinate or shape query', () => {
    expect(regionFromQuery('1,2 3,4 1,2')).toEqual([
      [1, 2],
      [3, 4],
    ]);
    expect(regionFromQuery('rect 0 0 1 1')).toHaveLength(4);
    expect(regionFromQuery('circle 4 4 2')).toContainEqual([4, 4]);
    expect(regionFromQuery('poly 0,0 4,0 0,4').length).toBeGreaterThan(3);
    expect(regionFromQuery('')).toBe(null);
    expect(regionFromQuery('rect 0 0 1')).toBe(null);
    expect(regionFromQuery('1,a')).toBe(null);
  });

  it('selects cells by colour, joined to a start cell or all of them', () => {
    const frame = [
      [R, R, G],
      [G, R, R],
      [R, G, R],
    ];
    expect(keys(colorRegion(frame, R, { contiguous: [0, 0] }))).toEqual(
      keys([
        [0, 0],
        [1, 0],
        [1, 1],
        [2, 1],
        [2, 2],
      ]),
    );
    expect(colorRegion(frame, R)).toHaveLength(6);
  });

  it('mirrors a region across the frame centre lines', () => {
    expect(keys(mirrorRegion([[0, 0]], { width: 4, height: 4, axis: 'x' }))).toEqual(['0,0', '3,0']);
    expect(mirrorRegion([[0, 0]], { width: 4, height: 4, axis: 'xy' })).toHaveLength(4);
  });

  it('fills, stamps, patterns and outlines a frame without changing its input', () => {
    const frame = blank(4, 4);
    const filled = fillRegion(frame, rectRegion(1, 1, 2, 2), R);
    expect(frame[1][1]).toEqual(_);
    expect(filled[1][1]).toEqual(R);
    expect(outlineRegion(filled)).toHaveLength(8);
    const stamped = stampRegion(filled, [[G, _]], 1, 1);
    expect([stamped[1][1], stamped[1][2]]).toEqual([G, R]);
    const patterned = patternRegion(frame, rectRegion(0, 0, 3, 0), [[R, B]], { originX: 1 });
    expect(patterned[0]).toEqual([B, R, B, R]);
  });

  it('scatters the same way for the same seed, and only inside the region', () => {
    const cells = rectRegion(0, 0, 7, 7);
    const first = scatterRegion(blank(10, 10), cells, [R, G], { density: 0.5, seed: 7 });
    const again = scatterRegion(blank(10, 10), cells, [R, G], { density: 0.5, seed: 7 });
    const other = scatterRegion(blank(10, 10), cells, [R, G], { density: 0.5, seed: 8 });
    expect(again).toEqual(first);
    expect(other).not.toEqual(first);
    expect(first[9].every((cell) => cell[3] === 0)).toBe(true);
    const painted = first.flat().filter((cell) => cell[3] > 0).length;
    expect(painted).toBeGreaterThan(10);
    expect(painted).toBeLessThan(54);
  });

  it('swaps, replaces and applies a palette, keeping locked colours and alpha', () => {
    const frame = [[R, G, [250, 5, 5, 128], B]];
    const cells = rectRegion(0, 0, 3, 0);
    expect(
      paletteSwap(frame, cells, [
        [R, G],
        [G, R],
      ])[0].slice(0, 2),
    ).toEqual([G, R]);
    const applied = paletteApply(frame, cells, [R, G], { locked: [B] });
    expect(applied[0]).toEqual([R, G, [255, 0, 0, 128], B]);
    expect(colorRamp([0, 0, 0, 255], [100, 200, 50, 255], 3)).toEqual([
      [0, 0, 0, 255],
      [50, 100, 25, 255],
      [100, 200, 50, 255],
    ]);
    expect(mixColor([200, 100, 0], [255, 255, 255], 0.5)).toEqual([228, 178, 128]);
    expect(mixColor([200, 100, 0], [0, 0, 0], 0.25)).toEqual([150, 75, 0]);
    expect(tiledPreview([[R, G]], 3)).toHaveLength(3);
    expect(tiledPreview([[R, G]], 3)[0]).toHaveLength(6);
  });
});

describe('pixel templates', () => {
  const template = {
    id: 't',
    label: 'T',
    itemTypes: ['obstacle'],
    kinds: ['structure'],
    roles: [
      [null, 'outline'],
      ['base', 'shadow'],
    ],
  };

  it('paints a role template in a palette, and falls back to base for a role it lacks', () => {
    expect(renderTemplate(template, { base: ['#102030'], outline: ['#000000'], shadow: ['#0a0a0a'] })).toEqual([
      [_, [0, 0, 0, 255]],
      [
        [16, 32, 48, 255],
        [10, 10, 10, 255],
      ],
    ]);
    expect(renderTemplate(template, { base: ['#102030'] })[1][1]).toEqual([16, 32, 48, 255]);
    expect(renderTemplate({ ...template, roles: undefined, colors: [['#ffffff', null]] })).toEqual([
      [[255, 255, 255, 255], _],
    ]);
  });

  it('suits the item types and content kinds it names', () => {
    expect(templateSuits(template, 'obstacle', 'structure')).toBe(true);
    expect(templateSuits(template, 'obstacle')).toBe(true);
    expect(templateSuits(template, 'obstacle', 'tree')).toBe(false);
    expect(templateSuits(template, 'floor', 'structure')).toBe(false);
    expect(templateSuits({ ...template, itemTypes: [] }, 'floor')).toBe(true);
  });
});
