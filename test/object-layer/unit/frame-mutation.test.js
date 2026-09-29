import { describe, it, expect } from 'vitest';
import {
  buildMutationCandidates,
  detectSilhouette,
  frameSeed,
  mutateFrameShape,
  mutationBudget,
  paletteMapping,
  remapFramePalette,
  shapeOf,
  transformImportedFrame,
  transformImportedFrames,
  validateShape,
} from '../../../src/client/components/objectlayer-studio/FrameMutation.js';

const ROLES = Object.freeze({
  outline: ['#081226'],
  shadow: ['#16305e', '#0c1b38'],
  base: ['#e8eef7', '#2f6fd6', '#1d4fa3'],
  highlight: ['#ffffff', '#9cc7ff'],
  accent: ['#ff3fb4'],
});
const CELLS = Object.freeze({
  o: [20, 20, 20, 255],
  b: [120, 120, 120, 255],
  h: [230, 230, 230, 255],
  m: [255, 0, 255, 255],
  g: [120, 120, 120, 128],
});
const frameOf = (rows) => rows.map((row) => [...row].map((char) => (CELLS[char] ?? [0, 0, 0, 0]).slice()));
const hex = ([r, g, b]) => `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
const paletteHexes = new Set(Object.values(ROLES).flat());

// An outlined body with a shine and a magenta eye.
const SPRITE = [
  '................',
  '................',
  '.....oooooo.....',
  '...oobbbbbboo...',
  '...obbbbbbbbo...',
  '..obbbbbmbbbbo..',
  '..obbbbhhbbbbo..',
  '..obbbhhhhbbbo..',
  '..obbbhhhhbbbo..',
  '..obbbbhhbbbbo..',
  '..obbbbbbbbbbo..',
  '...obbbbbbbbo...',
  '...oobbbbbboo...',
  '.....oooooo.....',
  '................',
  '................',
];
// A ring with a hole, a one-cell antenna and a separate dot.
const RING = [
  '..............',
  '.....o........',
  '.....o........',
  '...ooooooo....',
  '...obbbbbo....',
  '...ob...bo....',
  '...ob...bo..o.',
  '...ob...bo....',
  '...obbbbbo....',
  '...ooooooo....',
  '..............',
];
const sprite = () => frameOf(SPRITE);
const mapOf = (frames) => paletteMapping(frames, ROLES);
const colorAt = (frame, x, y) => hex(frame[y][x]);

describe('frame palette remap', () => {
  it('keeps transparent cells as they were', () => {
    const source = sprite();
    const remapped = remapFramePalette(source, mapOf([source]));
    source.forEach((row, y) =>
      row.forEach((cell, x) => {
        if (cell[3] === 0) expect(remapped[y][x]).toEqual(cell);
      }),
    );
  });

  it('paints every opaque cell with a color of the target palette and keeps its alpha', () => {
    const source = frameOf(['obg', 'hmo']);
    const remapped = remapFramePalette(source, mapOf([source]));
    for (const [y, row] of remapped.entries())
      for (const [x, cell] of row.entries()) {
        expect(paletteHexes.has(hex(cell))).toBe(true);
        expect(cell[3]).toBe(source[y][x][3]);
      }
  });

  it('maps outline, body, shine and a rare saturated color to their roles', () => {
    const source = sprite();
    const remapped = remapFramePalette(source, mapOf([source]));
    expect(colorAt(remapped, 5, 2)).toBe(ROLES.outline[0]);
    expect(ROLES.base).toContain(colorAt(remapped, 5, 4));
    expect(ROLES.highlight).toContain(colorAt(remapped, 7, 7));
    expect(colorAt(remapped, 8, 5)).toBe(ROLES.accent[0]);
  });

  it('gives the base tone to the most used color, darker colors below it and lighter above', () => {
    const source = frameOf(['ooobbbbbbbbbbhh']).map((row) =>
      row.map((cell, x) => (x === 3 ? [60, 60, 60, 255] : cell)),
    );
    const remapped = remapFramePalette(source, mapOf([source]));
    expect(colorAt(remapped, 0, 0)).toBe(ROLES.outline[0]);
    expect(ROLES.shadow).toContain(colorAt(remapped, 3, 0));
    expect(colorAt(remapped, 4, 0)).toBe('#2f6fd6');
    expect(colorAt(remapped, 14, 0)).toBe('#ffffff');
  });

  it('keeps the outline on the darkest color when it covers the most cells', () => {
    const source = frameOf(['oooooo', 'obbbbo', 'ohbbbo', 'oooooo']);
    const remapped = remapFramePalette(source, mapOf([source]));
    expect([colorAt(remapped, 0, 0), colorAt(remapped, 2, 1), colorAt(remapped, 1, 2)]).toEqual([
      ROLES.outline[0],
      '#2f6fd6',
      '#ffffff',
    ]);
  });

  it('maps one source color to one target color in every frame', () => {
    const first = frameOf(['ob.', '.bh']);
    const second = frameOf(['bho', 'o..']);
    const mapping = mapOf([first, second]);
    const [a, b] = [remapFramePalette(first, mapping), remapFramePalette(second, mapping)];
    expect(a[0][0]).toEqual(b[0][2]);
    expect(a[0][1]).toEqual(b[0][0]);
    expect(a[1][2]).toEqual(b[0][1]);
  });

  it('keeps the lightness order in a palette of base colors only', () => {
    const source = frameOf(['ooobbbbbbhh']);
    const remapped = remapFramePalette(source, paletteMapping([source], { base: ['#ffeeaa', '#332211', '#886644'] }));
    expect([colorAt(remapped, 0, 0), colorAt(remapped, 4, 0), colorAt(remapped, 10, 0)]).toEqual([
      '#332211',
      '#886644',
      '#ffeeaa',
    ]);
  });

  it('refuses a palette with no color', () => {
    expect(() => paletteMapping([sprite()], {})).toThrow(RangeError);
    expect(() => paletteMapping([sprite()], { base: [] })).toThrow(RangeError);
  });
});

describe('frame silhouette', () => {
  it('finds the boundary next to the exterior and leaves the hole out of it', () => {
    const { boundary, exterior, width } = detectSilhouette(frameOf(RING));
    const cell = (x, y) => y * width + x;
    expect(boundary).toContain(cell(3, 3));
    expect(boundary).not.toContain(cell(4, 5));
    expect(exterior[cell(6, 5)]).toBe(0);
    expect(exterior[cell(0, 0)]).toBe(1);
  });

  it('measures components, holes, box and centroid', () => {
    const shape = shapeOf(frameOf(RING));
    expect(shape.components).toBe(2);
    expect(shape.holes).toBe(1);
    expect(shape.box).toEqual([3, 1, 12, 9]);
  });

  it('offers no move from the core, a tip, a thin limb or into the hole', () => {
    const silhouette = detectSilhouette(frameOf(RING));
    const { width, height, mask } = silhouette;
    const everywhere = new Uint8Array(width * height).fill(1);
    const moves = buildMutationCandidates(silhouette, { band: everywhere, core: new Uint8Array(width * height) });
    const froms = new Set(moves.map(({ from }) => from));
    const cell = (x, y) => y * width + x;
    for (const antenna of [cell(5, 1), cell(5, 2), cell(12, 6)]) expect(froms.has(antenna)).toBe(false);
    for (const { to } of moves) {
      expect(mask[to]).toBe(0);
      expect(to).not.toBe(cell(6, 5));
    }
    const core = mask.slice();
    expect(buildMutationCandidates(silhouette, { band: everywhere, core })).toEqual([]);
  });
});

describe('frame shape validation', () => {
  const ring = shapeOf(frameOf(['.ooo.', '.o.o.', '.ooo.', '.....']));

  it('accepts a moved cell that keeps the structure', () => {
    expect(validateShape(ring, shapeOf(frameOf(['.oo..', '.o.o.', '.ooo.', '...o.'])))).toBe(true);
  });

  it('rejects a split, a filled hole and a lost cell', () => {
    const bar = shapeOf(frameOf(['.....', '.ooo.', '.....']));
    expect(validateShape(bar, shapeOf(frameOf(['.....', 'oo.o.', '.....'])))).toBe(false);
    expect(validateShape(ring, shapeOf(frameOf(['.oo..', '.ooo.', '.ooo.', '.....'])))).toBe(false);
    expect(validateShape(ring, shapeOf(frameOf(['.oo..', '.o.o.', '.ooo.', '.....'])))).toBe(false);
  });

  it('rejects a box or a centroid that drifts past one cell', () => {
    expect(validateShape(ring, { ...ring, box: [ring.box[0] - 2, ...ring.box.slice(1)] })).toBe(false);
    expect(validateShape(ring, { ...ring, centroid: [ring.centroid[0] + 1.5, ring.centroid[1]] })).toBe(false);
  });
});

describe('frame mutation', () => {
  it('buys no move at factor 0 and more moves at a higher factor, within a fixed limit', () => {
    expect(mutationBudget(40, 0)).toBe(0);
    expect(mutationBudget(40, 0.2)).toBeLessThan(mutationBudget(40, 0.8));
    expect(mutationBudget(20, 1)).toBeLessThan(mutationBudget(200, 1));
    expect(mutationBudget(100000, 1)).toBe(64);
    expect(mutationBudget(40, 5)).toBe(mutationBudget(40, 1));
  });

  it('keeps the canvas, the cell count, the components, the holes and the source', () => {
    for (const rows of [SPRITE, RING]) {
      const source = frameOf(rows);
      const before = JSON.stringify(source);
      const baseline = shapeOf(source);
      for (let seed = 1; seed <= 20; seed++) {
        const { frame } = mutateFrameShape(source, { factor: 1, seed });
        const shape = shapeOf(frame);
        expect([frame.length, frame[0].length]).toEqual([source.length, source[0].length]);
        expect(shape.count).toBe(baseline.count);
        expect(shape.components).toBe(baseline.components);
        expect(shape.holes).toBe(baseline.holes);
        expect(validateShape(baseline, shape)).toBe(true);
      }
      expect(JSON.stringify(source)).toBe(before);
    }
  });

  it('never empties a core cell and moves colors only, never makes them', () => {
    const source = sprite();
    const { mask, boundary } = detectSilhouette(source);
    const edge = new Set(boundary);
    const colors = new Set(source.flat().map((cell) => cell.join()));
    for (let seed = 1; seed <= 10; seed++) {
      const { frame } = mutateFrameShape(source, { factor: 1, seed });
      frame.flat().forEach((cell, index) => {
        if (mask[index] && !edge.has(index)) expect(cell[3]).toBeGreaterThan(0);
        expect(colors.has(cell.join())).toBe(true);
      });
    }
  });

  it('moves the contour for some seeds', () => {
    const accepted = [1, 2, 3, 4, 5].reduce(
      (sum, seed) => sum + mutateFrameShape(sprite(), { factor: 1, seed }).accepted,
      0,
    );
    expect(accepted).toBeGreaterThan(0);
  });

  it('gives the same frame for the same seed and other frames for other seeds', () => {
    const run = (seed) => JSON.stringify(mutateFrameShape(sprite(), { factor: 1, seed }).frame);
    expect(run(7)).toBe(run(7));
    expect(new Set([1, 2, 3, 4, 5].map(run)).size).toBeGreaterThan(1);
  });

  it('remaps only at factor 0', () => {
    const source = sprite();
    const mapping = mapOf([source]);
    expect(transformImportedFrame(source, mapping, { mutationFactor: 0, seed: 3 })).toEqual({
      frame: remapFramePalette(source, mapping),
      accepted: 0,
      rejected: 0,
    });
  });
});

describe('frame import', () => {
  const framesByCode = () => ({ '08': [sprite(), frameOf(RING), sprite()], 18: [sprite()], '02': [] });
  const paletteOnly = transformImportedFrames(framesByCode(), ROLES);

  it('keeps the directions, the frame count, the order and the size', () => {
    expect(Object.keys(paletteOnly.framesByCode).sort()).toEqual(['02', '08', '18']);
    expect(paletteOnly.framesByCode['08']).toHaveLength(3);
    expect(paletteOnly.framesByCode['02']).toEqual([]);
    expect(paletteOnly.frames).toBe(4);
    expect(shapeOf(paletteOnly.framesByCode['08'][1])).toEqual(shapeOf(frameOf(RING)));
    expect(paletteOnly.framesByCode['08'][0]).toEqual(paletteOnly.framesByCode['08'][2]);
  });

  it('mutates nothing with Mutate off, or on at factor 0', () => {
    const options = { seed: 9, source: 'a', target: 'b' };
    const off = transformImportedFrames(framesByCode(), ROLES, { ...options, mutate: false, mutationFactor: 0.9 });
    const zero = transformImportedFrames(framesByCode(), ROLES, { ...options, mutate: true, mutationFactor: 0 });
    expect(off.framesByCode).toEqual(paletteOnly.framesByCode);
    expect(zero.framesByCode).toEqual(paletteOnly.framesByCode);
    expect([off.accepted, zero.accepted]).toEqual([0, 0]);
  });

  it('gives each frame a seed of its own', () => {
    expect(frameSeed(1, 'a', 'b', '08', 0)).toBe(frameSeed(1, 'a', 'b', '08', 0));
    const seeds = [
      frameSeed(1, 'a', 'b', '08', 0),
      frameSeed(1, 'a', 'b', '08', 1),
      frameSeed(1, 'a', 'b', '18', 0),
      frameSeed(1, 'a', 'c', '08', 0),
      frameSeed(1, 'c', 'b', '08', 0),
      frameSeed(2, 'a', 'b', '08', 0),
    ];
    expect(new Set(seeds).size).toBe(seeds.length);
    const mutated = transformImportedFrames(framesByCode(), ROLES, {
      mutate: true,
      mutationFactor: 1,
      seed: 4,
      source: 'a',
      target: 'b',
    });
    const [first, , third] = mutated.framesByCode['08'];
    expect(first).not.toEqual(third);
  });

  it('gives the same import for the same seed', () => {
    const options = { mutate: true, mutationFactor: 0.6, seed: 11, source: 'a', target: 'b' };
    expect(transformImportedFrames(framesByCode(), ROLES, options)).toEqual(
      transformImportedFrames(framesByCode(), ROLES, options),
    );
  });
});
