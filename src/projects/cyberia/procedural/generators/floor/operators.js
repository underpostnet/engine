/**
 * The operators of the floor generator. A floor tile is a torus: its right edge joins its left edge
 * and its bottom edge joins its top edge, so every operator reads its neighbors across the edges
 * and a tile always joins its copies. A layout holds the region of each cell, row by row. Each
 * operator draws its randomness from the random numbers it is given. Pure functions.
 *
 * | operator         | changes                                                     |
 * | ---------------- | ----------------------------------------------------------- |
 * | `shiftLayout`    | where the pattern sits on the tile                          |
 * | `tradeBorders`   | which cells two regions hold at their border                |
 * | `paintLayout`    | the tone of each cell: noise, then relief at region borders |
 * | `scatterAccents` | single accent cells on the lowest region                    |
 * | `recolorFrame`   | the colors of a rendered tile, never its cells              |
 *
 * @module src/projects/cyberia/procedural/generators/floor/operators.js
 */
import { hexToRgba } from '../../../../../client/components/objectlayer-studio/RenderSource.js';
import { toOklab } from '../../core/oklab.js';
import { regionsOf } from '../../templates.js';

/** The greatest share of the border cells one trade pass may move at full variation. */
const MAX_TRADE_SHARE = 0.35;
/** The share of the tile accents may cover at full detail. */
const ACCENT_SHARE = 0.012;
/** How much a cell's own grain moves its noise. */
const GRAIN = 0.3;
/** The lattice cells of the coarse and the fine noise, per axis. */
const NOISE_PERIODS = Object.freeze([3, 6]);

const CROSS = Object.freeze([
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]);

const wrap = (value, size) => ((value % size) + size) % size;
const paint = (hex) => [...hexToRgba(hex).slice(0, 3), 255];

/** The cell of `(x, y)` on a torus of `width × height`. */
const cellAt = (x, y, width) => y * width + x;

/** The four neighbor cells of a cell, across the edges. */
export function neighborsOf(cell, width, height) {
  const x = cell % width;
  const y = (cell - x) / width;
  return CROSS.map(([dx, dy]) => cellAt(wrap(x + dx, width), wrap(y + dy, height), width));
}

/**
 * The region of each cell of the first frame of one direction of a template: a floor is static.
 * @param {Object} template - A resolved Genesis Template.
 * @param {string} code - A direction code of the template.
 * @returns {Array<string|null>} Null where the template leaves a cell empty.
 */
export function layoutOf(template, code) {
  const { width, height } = template.canvas;
  const layout = new Array(width * height).fill(null);
  for (const [region, cells] of Object.entries(regionsOf(template, code, 0)))
    for (const [x, y] of cells) layout[cellAt(x, y, width)] = region;
  return layout;
}

/** The `[x, y]` cells of each region of a layout. */
export const ownedOf = (layout, width) => {
  const owned = {};
  layout.forEach((region, cell) => (owned[region] ??= []).push([cell % width, Math.floor(cell / width)]));
  return owned;
};

/** The cells each region holds. */
const countsOf = (layout) => {
  const counts = {};
  for (const region of layout) counts[region] = (counts[region] ?? 0) + 1;
  return counts;
};

/**
 * The layout moved on the torus: the cell at `(x, y)` takes the region of `(x - dx, y - dy)`.
 * @param {string[]} layout
 * @param {{width:number,height:number,dx:number,dy:number}} shift
 * @returns {string[]}
 */
export function shiftLayout(layout, { width, height, dx, dy }) {
  return layout.map((_, cell) => {
    const x = cell % width;
    const y = (cell - x) / width;
    return layout[cellAt(wrap(x - dx, width), wrap(y - dy, height), width)];
  });
}

/**
 * Trades cells at the borders of each region pair. A trade keeps each region within `maxShift` of
 * its share in `reference`, leaves no protected region, and makes no cell thin: a cell keeps a
 * neighbor of its own region on each axis, so no region grows a line one cell wide.
 * @param {string[]} layout
 * @param {Object} context
 * @param {number} context.width
 * @param {number} context.height
 * @param {Array<[string,string]>} context.pairs - The region pairs whose border moves.
 * @param {string[]} context.protectedRegions - Regions whose cells stay.
 * @param {string[]} context.reference - The layout the shares are bound to.
 * @param {number} context.maxShift - The greatest move of a share, 0 to 1.
 * @param {() => number} context.random
 * @param {number} context.strength - The variation of the trade, 0 to 1.
 * @returns {{layout:string[],traded:number}}
 */
export function tradeBorders(
  layout,
  { width, height, pairs, protectedRegions, reference, maxShift, random, strength },
) {
  const next = layout.slice();
  const total = next.length;
  const counts = countsOf(next);
  const bounds = Object.fromEntries(
    Object.entries(countsOf(reference)).map(([region, count]) => [
      region,
      { min: Math.ceil((count / total - maxShift) * total), max: Math.floor((count / total + maxShift) * total) },
    ]),
  );
  const trades = (from, to) =>
    from !== to &&
    !protectedRegions.includes(from) &&
    !protectedRegions.includes(to) &&
    pairs.some(([left, right]) => (left === from && right === to) || (left === to && right === from));
  const thin = (cell) => {
    const [right, left, below, above] = neighborsOf(cell, width, height).map((neighbor) => next[neighbor]);
    const region = next[cell];
    return !((right === region || left === region) && (below === region || above === region));
  };
  const border = () =>
    next.flatMap((region, cell) =>
      [...new Set(neighborsOf(cell, width, height).map((neighbor) => next[neighbor]))]
        .filter((other) => trades(region, other))
        .map((other) => [cell, other]),
    );
  const budget = Math.round(strength * MAX_TRADE_SHARE * new Set(border().map(([cell]) => cell)).size);
  let traded = 0;
  for (let step = 0; step < budget; step++) {
    const candidates = border();
    if (candidates.length === 0) break;
    const [cell, to] = candidates[Math.floor(random() * candidates.length)];
    const from = next[cell];
    if (counts[from] - 1 < bounds[from].min || counts[to] + 1 > bounds[to].max) continue;
    const around = [cell, ...neighborsOf(cell, width, height)];
    const thinBefore = around.map(thin);
    next[cell] = to;
    if (around.some((other, at) => thin(other) && !thinBefore[at])) {
      next[cell] = from;
      continue;
    }
    counts[from]--;
    counts[to]++;
    traded++;
  }
  return { layout: next, traded };
}

/** Smooth noise on the torus from 0 to 1: `period` random lattice values per axis, blended between them. */
function torusNoise(width, height, period, random) {
  const lattice = Array.from({ length: period * period }, () => random());
  const smooth = (t) => t * t * (3 - 2 * t);
  const values = new Float32Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const u = (x * period) / width;
      const v = (y * period) / height;
      const [x0, y0] = [Math.floor(u), Math.floor(v)];
      const [x1, y1] = [(x0 + 1) % period, (y0 + 1) % period];
      const [tx, ty] = [smooth(u - x0), smooth(v - y0)];
      const at = (lx, ly) => lattice[ly * period + lx];
      const top = at(x0, y0) * (1 - tx) + at(x1, y0) * tx;
      const bottom = at(x0, y1) * (1 - tx) + at(x1, y1) * tx;
      values[cellAt(x, y, width)] = top * (1 - ty) + bottom * ty;
    }
  return values;
}

/**
 * The frame of a layout: each cell in a tone of its region. Noise, stretched over the tile, picks
 * the shadow, base or highlight tone; more detail moves more cells off the base. Then the relief: a
 * region above a lower region in the profile order lights its top edge and takes the outline color
 * on its bottom edge, and the lower region takes its shadow under it.
 * @param {string[]} layout
 * @param {Object} context
 * @param {number} context.width
 * @param {number} context.height
 * @param {{outline:string,regions:Object<string,{shadow:string,base:string,highlight:string}>}} context.plan - A palette plan.
 * @param {string[]} context.regionOrder - The regions, lowest first.
 * @param {() => number} context.random
 * @param {number} context.detail - 0 to 1.
 * @returns {{frame:number[][][],contour:Set<number>}} The frame, and the cells of the outline color.
 */
export function paintLayout(layout, { width, height, plan, regionOrder, random, detail }) {
  const layers = NOISE_PERIODS.map((period) => torusNoise(width, height, period, random));
  const spread = 0.5 - 0.35 * detail;
  const tones = Object.fromEntries(
    Object.entries(plan.regions).map(([region, planned]) => [
      region,
      Object.fromEntries(Object.entries(planned).map(([tone, hex]) => [tone, paint(hex)])),
    ]),
  );
  const noise = layout.map((_, cell) => 0.6 * layers[0][cell] + 0.4 * layers[1][cell] + (random() - 0.5) * GRAIN);
  const [low, high] = [Math.min(...noise), Math.max(...noise)];
  const toneAt = noise.map((value) => {
    const level = (value - low) / (high - low || 1);
    return level < 0.5 - spread ? 'shadow' : level > 0.5 + spread ? 'highlight' : 'base';
  });
  const rank = (cell) => regionOrder.indexOf(layout[cell]);
  const contour = new Set();
  layout.forEach((_, cell) => {
    const [, , below, above] = neighborsOf(cell, width, height);
    if (rank(below) < rank(cell)) contour.add(cell);
    else if (rank(above) < rank(cell)) toneAt[cell] = 'highlight';
    else if (rank(above) > rank(cell)) toneAt[cell] = 'shadow';
  });
  const outline = paint(plan.outline);
  const frame = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => {
      const cell = cellAt(x, y, width);
      return (contour.has(cell) ? outline : tones[layout[cell]][toneAt[cell]]).slice();
    }),
  );
  return { frame, contour };
}

/**
 * Single accent cells on the lowest region, away from the outline color and from each other.
 * @param {number[][][]} frame
 * @param {Object} context
 * @param {string[]} context.layout
 * @param {Set<number>} context.contour
 * @param {string} context.lowest - The lowest region of the profile order.
 * @param {string} context.accent - `#rrggbb`.
 * @param {() => number} context.random
 * @param {number} context.detail - 0 to 1.
 * @returns {{frame:number[][][],accents:number}}
 */
export function scatterAccents(frame, { layout, contour, lowest, accent, random, detail }) {
  const height = frame.length;
  const width = frame[0].length;
  const count = Math.round(detail * ACCENT_SHARE * width * height);
  const next = frame.map((row) => row.map((cell) => cell.slice()));
  const taken = new Set();
  const near = (cell) => {
    const x = cell % width;
    const y = (cell - x) / width;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const other = cellAt(wrap(x + dx, width), wrap(y + dy, height), width);
        if (contour.has(other) || taken.has(other)) return true;
      }
    return false;
  };
  const open = layout.flatMap((region, cell) => (region === lowest ? [cell] : []));
  const color = paint(accent);
  while (taken.size < count && open.length > 0) {
    const [cell] = open.splice(Math.floor(random() * open.length), 1);
    if (near(cell)) continue;
    taken.add(cell);
    next[Math.floor(cell / width)][cell % width] = color.slice();
  }
  return { frame: next, accents: taken.size };
}

/**
 * A rendered tile in the tones of a plan. The mean OKLab lightness of the tile moves to the base of
 * `anchor`, and the middle of its lightness spread widens to the span from the shadow to the
 * highlight of `anchor`; each opaque cell then takes the tone nearest to its lightness. So the
 * texture of the tile shows in the tones of the plan. Every cell keeps its place and its alpha, so
 * the tile joins its neighbors as before.
 * @param {number[][][]} frame
 * @param {string[]} tones - `#rrggbb` colors.
 * @param {{shadow:string,base:string,highlight:string}} anchor - The tones of the lowest region.
 * @returns {number[][][]}
 */
export function recolorFrame(frame, tones, anchor) {
  const lightness = (rgba) => toOklab(rgba)[0];
  const of = (hex) => lightness(hexToRgba(hex));
  const ramp = tones.map((hex) => ({ rgb: hexToRgba(hex).slice(0, 3), lightness: of(hex) }));
  const values = frame
    .flat()
    .filter((cell) => cell[3] > 0)
    .map(lightness)
    .sort((left, right) => left - right);
  const at = (share) => values[Math.floor(share * (values.length - 1))] ?? 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / (values.length || 1);
  const spread = at(0.9) - at(0.1);
  const scale = spread > 0 ? Math.max(1, (of(anchor.highlight) - of(anchor.shadow)) / spread) : 1;
  const toneOf = new Map();
  return frame.map((row) =>
    row.map((cell) => {
      if (cell[3] === 0) return cell.slice();
      const key = cell.slice(0, 3).join();
      if (!toneOf.has(key)) {
        const target = of(anchor.base) + (lightness(cell) - mean) * scale;
        toneOf.set(
          key,
          ramp.reduce((best, tone) =>
            Math.abs(tone.lightness - target) < Math.abs(best.lightness - target) ? tone : best,
          ).rgb,
        );
      }
      return [...toneOf.get(key), cell[3]];
    }),
  );
}
