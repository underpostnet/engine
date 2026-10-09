/**
 * The diversity of a variant: how far it stands from the source and from the siblings accepted
 * before it. A variant keeps a compact signature, never its frames: a coarse grid of the silhouette
 * and of the lightness of the first frame of each direction, how the tones of the palette plan
 * spread over each region, and the base colors of the plan in OKLab. The distance of two signatures
 * is the weighted mean of four distances, each from 0 (the same) to 1 (nothing in common). Pure
 * functions.
 *
 * @module src/projects/cyberia/procedural/core/diversity.js
 */
import { hexToRgba } from '../../../../client/components/objectlayer-studio/RenderSource.js';
import { toOklab } from './oklab.js';

const GRID = 8;
const LEVELS = 15;
/** The OKLab distance of two colors that counts as nothing in common. */
const PALETTE_REACH = 0.4;
/** A cell farther than this in rgb from every tone of the plan is `other`. */
const TONE_REACH = 60;
const TONES = Object.freeze(['outline', 'shadow', 'base', 'highlight', 'accent', 'other']);
/** The weight of each distance in the score. */
const WEIGHTS = Object.freeze({ silhouette: 0.25, frame: 0.25, regionPattern: 0.25, palette: 0.25 });

const lightnessOf = ([r, g, b]) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;

/** The coarse grids of a frame: the share of each block that is occupied, and its mean lightness, in 0 to 15. */
function gridsOf(frame) {
  const height = frame.length;
  const width = frame[0].length;
  const blocks = Array.from({ length: GRID * GRID }, () => ({ cells: 0, occupied: 0, light: 0 }));
  frame.forEach((row, y) =>
    row.forEach((cell, x) => {
      const block = blocks[Math.floor((y * GRID) / height) * GRID + Math.floor((x * GRID) / width)];
      block.cells++;
      if (cell[3] > 0) {
        block.occupied++;
        block.light += lightnessOf(cell);
      }
    }),
  );
  return {
    silhouette: blocks.map(({ cells, occupied }) => Math.round((occupied / cells) * LEVELS)),
    light: blocks.map(({ occupied, light }) => (occupied ? Math.round((light / occupied) * LEVELS) : 0)),
  };
}

/** The tone of the plan a cell is nearest to, or `other`. */
function toneOf(cell, tones) {
  let nearest = 'other';
  let best = TONE_REACH;
  for (const [tone, rgb] of tones) {
    const distance = Math.hypot(cell[0] - rgb[0], cell[1] - rgb[1], cell[2] - rgb[2]);
    if (distance < best) [nearest, best] = [tone, distance];
  }
  return nearest;
}

const bytes = (counts, total) => counts.map((count) => Math.round((count / (total || 1)) * 255));

/**
 * The signature of a variant.
 * @param {Object} params
 * @param {Object<string,number[][][]>} params.firstFrames - The first frame of each direction, by direction code.
 * @param {Object<string,Object<string,Array<[number,number]>>>} params.ownedByCode - The cells of each region, by direction code.
 * @param {string[]} params.regionIds - The regions, in profile order.
 * @param {Object} params.plan - The palette plan the variant took.
 * @returns {{silhouette:Object<string,number[]>,light:Object<string,number[]>,tones:number[],palette:number[][]}}
 */
export function signatureOf({ firstFrames, ownedByCode, regionIds, plan }) {
  const silhouette = {};
  const light = {};
  const toneCounts = Object.fromEntries(regionIds.map((id) => [id, new Array(TONES.length).fill(0)]));
  const regionTones = (regionId) => [
    ['outline', hexToRgba(plan.outline)],
    ['accent', hexToRgba(plan.accent)],
    ...['shadow', 'base', 'highlight'].map((tone) => [tone, hexToRgba(plan.regions[regionId][tone])]),
  ];
  for (const [code, frame] of Object.entries(firstFrames)) {
    ({ silhouette: silhouette[code], light: light[code] } = gridsOf(frame));
    for (const [regionId, cells] of Object.entries(ownedByCode[code] ?? {}))
      for (const [x, y] of cells)
        if (frame[y][x][3] > 0) toneCounts[regionId][TONES.indexOf(toneOf(frame[y][x], regionTones(regionId)))]++;
  }
  return {
    silhouette,
    light,
    tones: regionIds.flatMap((id) =>
      bytes(
        toneCounts[id],
        toneCounts[id].reduce((sum, count) => sum + count, 0),
      ),
    ),
    palette: [...regionIds.map((id) => plan.regions[id].base), plan.outline, plan.accent].map((hex) =>
      toOklab(hexToRgba(hex)).map((value) => Math.round(value * 1000) / 1000),
    ),
  };
}

/** The share of two number lists that differs: the sum of their gaps over the sum of their larger values. */
const spread = (left, right) => {
  const total = left.reduce((sum, value, at) => sum + Math.max(value, right[at]), 0);
  return total === 0 ? 0 : left.reduce((sum, value, at) => sum + Math.abs(value - right[at]), 0) / total;
};

/** The mean OKLab distance of two palettes, color by color, over the reach: 0 for the same, 1 for none in common. */
const paletteSpread = (left, right) =>
  Math.min(
    1,
    left.reduce((sum, color, at) => sum + Math.hypot(...color.map((value, axis) => value - right[at][axis])), 0) /
      left.length /
      PALETTE_REACH,
  );

const meanOver = (codes, left, right) =>
  codes.length === 0 ? 1 : codes.reduce((sum, code) => sum + spread(left[code], right[code]), 0) / codes.length;

/**
 * The distance of two signatures.
 * @param {Object} left
 * @param {Object} right
 * @returns {{silhouette:number,frame:number,regionPattern:number,palette:number,score:number}} Each distance and their weighted mean, in 0 to 1.
 */
export function diversityBetween(left, right) {
  const codes = Object.keys(left.silhouette).filter((code) => right.silhouette[code]);
  const metrics = {
    silhouette: meanOver(codes, left.silhouette, right.silhouette),
    frame: meanOver(codes, left.light, right.light),
    regionPattern: spread(left.tones, right.tones),
    palette: paletteSpread(left.palette, right.palette),
  };
  const score = Object.entries(WEIGHTS).reduce((sum, [name, weight]) => sum + weight * metrics[name], 0);
  return { ...metrics, score };
}

/**
 * The diversity of a signature against the references: the distance to the nearest one.
 * @param {Object} signature
 * @param {Array<{id:string,signature:Object}>} references - The source and the accepted siblings.
 * @returns {{score:number,nearest:string,metrics:Object}} The distance, the nearest reference and the four distances to it.
 */
export function diversityAgainst(signature, references) {
  let best = null;
  for (const { id, signature: other } of references) {
    const { score, ...metrics } = diversityBetween(signature, other);
    if (!best || score < best.score) best = { score, nearest: id, metrics };
  }
  return best ?? { score: 1, nearest: '', metrics: {} };
}
