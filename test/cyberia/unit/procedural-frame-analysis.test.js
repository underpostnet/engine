import { describe, it, expect } from 'vitest';
import { analyzeFrame } from '../../../src/projects/cyberia/procedural/core/frame-analysis.js';
import {
  cellsOfMask,
  close,
  dilate,
  distanceField,
  erode,
  maskOfCells,
  open,
} from '../../../src/projects/cyberia/procedural/core/morphology.js';

const ON = [10, 10, 10, 255];
const frameOf = (rows) => rows.map((row) => [...row].map((char) => (char === '#' ? ON.slice() : [0, 0, 0, 0])));
const maskRows = (mask, width) =>
  Array.from({ length: mask.length / width }, (_, y) =>
    [...mask.slice(y * width, (y + 1) * width)].map((value) => (value ? '#' : '.')).join(''),
  );

// A 5×5 block with a hole inside, and a separate one-cell spur.
const SHAPE = ['.........', '.#####...', '.#####...', '.##.##...', '.#####...', '.#####...', '.......#.', '.........'];

describe('frame analysis', () => {
  const analysis = analyzeFrame(frameOf(SHAPE));

  it('reads the silhouette as the alpha mask and the outline as the cells next to the exterior', () => {
    expect(maskRows(analysis.mask, 9)).toEqual(SHAPE);
    expect(maskRows(analysis.outline, 9)).toEqual([
      '.........',
      '.#####...',
      '.#...#...',
      '.#...#...',
      '.#...#...',
      '.#####...',
      '.......#.',
      '.........',
    ]);
  });

  it('keeps the cells around the hole as interior and the spur as outline', () => {
    expect(maskRows(analysis.interior, 9)).toEqual([
      '.........',
      '.........',
      '..###....',
      '..#.#....',
      '..###....',
      '.........',
      '.........',
      '.........',
    ]);
  });

  it('tells the hole the shape encloses from the exterior', () => {
    expect(maskRows(analysis.enclosed, 9)[3]).toBe('...#.....');
    expect(analysis.enclosed.reduce((sum, value) => sum + value, 0)).toBe(1);
    expect(analysis.exterior[3 * 9 + 3]).toBe(0);
    expect(analysis.exterior[0]).toBe(1);
  });

  it('measures the distance of each cell to the outline', () => {
    expect(analysis.distance[1 * 9 + 1]).toBe(1);
    expect(analysis.distance[2 * 9 + 2]).toBe(2);
    expect(analysis.distance[3 * 9 + 3]).toBe(0);
    expect(analysis.distance[6 * 9 + 7]).toBe(1);
  });

  it('keeps as core the interior an opening keeps: not the corners of a solid block', () => {
    const block = analyzeFrame(
      frameOf(['.........', '.#######.', ...Array(5).fill('.#######.'), '.#######.', '.........']),
    );
    expect(cellsOfMask(block.interior, 9)).toHaveLength(25);
    expect(cellsOfMask(block.core, 9)).toHaveLength(21);
    expect(cellsOfMask(analysis.core, 9)).toHaveLength(0);
  });
});

describe('morphology', () => {
  const DOT = maskOfCells([[2, 2]], 5, 5);

  it('dilates a cell into a cross and erodes it away', () => {
    expect(maskRows(dilate(DOT, 5, 5), 5)).toEqual(['.....', '..#..', '.###.', '..#..', '.....']);
    expect(maskRows(erode(dilate(DOT, 5, 5), 5, 5), 5)).toEqual(['.....', '.....', '..#..', '.....', '.....']);
  });

  it('opens away a part thinner than the cross and keeps a thick one', () => {
    const mask = maskOfCells(
      [...Array.from({ length: 9 }, (_, i) => [1 + (i % 3), 1 + Math.floor(i / 3)]), [5, 2]],
      7,
      5,
    );
    const opened = open(mask, 7, 5);
    expect(opened[2 * 7 + 5]).toBe(0);
    expect(opened[2 * 7 + 2]).toBe(1);
  });

  it('closes a one-cell hole and leaves a gap that is open on two sides', () => {
    const ring = maskOfCells(
      Array.from({ length: 25 }, (_, i) => [1 + (i % 5), 1 + Math.floor(i / 5)]).filter(([x, y]) => x !== 3 || y !== 3),
      7,
      7,
    );
    expect(close(ring, 7, 7)[3 * 7 + 3]).toBe(1);
    const gap = maskOfCells(
      [
        [0, 1],
        [4, 1],
      ],
      5,
      3,
    );
    expect(close(gap, 5, 3)[1 * 5 + 2]).toBe(0);
  });

  it('measures distance from the outline inward only through the shape', () => {
    const mask = maskOfCells(
      [
        [0, 0],
        [1, 0],
        [2, 0],
      ],
      3,
      1,
    );
    expect([...distanceField(mask, maskOfCells([[0, 0]], 3, 1), 3, 1)]).toEqual([1, 2, 3]);
  });
});
