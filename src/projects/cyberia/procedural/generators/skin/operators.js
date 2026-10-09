/**
 * The operators of the skin generator. An operator takes a frame and the analysis and context of
 * its direction, and returns a new frame; the input stays as it was. Each operator draws its
 * randomness from the seed it is given, and no operator paints a cell of the outline.
 *
 * | operator             | seed inputs                             |
 * | -------------------- | --------------------------------------- |
 * | `regionFill`         | none: shading follows the outline       |
 * | `paletteMap`         | none: the mapping follows the colors    |
 * | `featurePass`        | variant seed, direction                 |
 * | `regionDeformation`  | variant seed, direction, frame index    |
 * | `detailPass`         | variant seed, direction, frame, region  |
 *
 * Pure functions.
 *
 * @module src/projects/cyberia/procedural/generators/skin/operators.js
 */
import { hexToRgba } from '../../../../../client/components/objectlayer-studio/RenderSource.js';
import { scatterRegion, seededRandom } from '../../../../../client/components/objectlayer-studio/PixelRegion.js';
import { paletteMapping, remapFramePalette } from '../../core/frame-mutation.js';

const copy = (frame) => frame.map((row) => row.map((cell) => cell.slice()));
const paint = (hex) => [...hexToRgba(hex).slice(0, 3), 255];
const lightnessOf = ([r, g, b]) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;
/** How much darker than the base of a region a cell is to count as a feature. */
const FEATURE_CONTRAST = 0.2;

/** The cells of a region that are interior and occupied, as `[x, y]`. */
const interiorOf = (cells, analysis) => cells.filter(([x, y]) => analysis.interior[y * analysis.width + x]);

/** Whether a cell is off the shape or on its outline: the light and the shade stop there. */
const isEdge = ({ width, height, mask, outline }, x, y) =>
  x < 0 || y < 0 || x >= width || y >= height || !mask[y * width + x] || outline[y * width + x] === 1;

/**
 * Fills the interior of each region with its tones: highlight where the light meets the outline
 * (above and left), shadow where the shade does (below and right), base elsewhere. The outline
 * stays.
 * @param {number[][][]} frame
 * @param {{analysis:Object,owned:Object<string,Array<[number,number]>>,plan:Object}} context
 * @returns {number[][][]}
 */
export function regionFill(frame, { analysis, owned, plan }) {
  const next = copy(frame);
  for (const [regionId, cells] of Object.entries(owned)) {
    const tones = Object.fromEntries(
      ['shadow', 'base', 'highlight'].map((tone) => [tone, paint(plan.regions[regionId][tone])]),
    );
    for (const [x, y] of interiorOf(cells, analysis)) {
      const lit = isEdge(analysis, x, y - 1) || isEdge(analysis, x - 1, y);
      const shaded = isEdge(analysis, x, y + 1) || isEdge(analysis, x + 1, y);
      next[y][x] = (lit && !shaded ? tones.highlight : shaded && !lit ? tones.shadow : tones.base).slice();
    }
  }
  return next;
}

/** A frame with only the cells of a list; the rest is transparent. */
const restrict = (frame, cells) => {
  const only = frame.map((row) => row.map(() => [0, 0, 0, 0]));
  for (const [x, y] of cells) only[y][x] = frame[y][x].slice();
  return only;
};

/**
 * The color mapping of each region, drawn from every frame of every direction, so one source color
 * becomes one target color wherever a region shows it.
 * @param {Array<{frame:number[][][],analysis:Object,owned:Object<string,Array<[number,number]>>}>} entries
 * @param {Object} plan - The palette plan.
 * @returns {Object<string,Map<number,number[]>>}
 */
export function paletteMaps(entries, plan) {
  const maps = {};
  const regionIds = [...new Set(entries.flatMap(({ owned }) => Object.keys(owned)))];
  for (const regionId of regionIds) {
    const { shadow, base, highlight } = plan.regions[regionId];
    maps[regionId] = paletteMapping(
      entries.map(({ frame, analysis, owned }) => restrict(frame, interiorOf(owned[regionId] ?? [], analysis))),
      { shadow: [shadow], base: [base], highlight: [highlight] },
    );
  }
  return maps;
}

/**
 * Recolors the interior of each region with the mapping of its region, so the details of the
 * source stay. The outline stays.
 * @param {number[][][]} frame
 * @param {{analysis:Object,owned:Object<string,Array<[number,number]>>,maps:Object<string,Map<number,number[]>>}} context
 * @returns {number[][][]}
 */
export function paletteMap(frame, { analysis, owned, maps }) {
  const next = copy(frame);
  for (const [regionId, cells] of Object.entries(owned)) {
    const mapped = remapFramePalette(restrict(frame, interiorOf(cells, analysis)), maps[regionId]);
    for (const [x, y] of interiorOf(cells, analysis)) if (frame[y][x][3] > 0) next[y][x] = mapped[y][x];
  }
  return next;
}

/** The `[x0, y0, x1, y1]` box of a list of cells. */
const boxOf = (cells) => [
  Math.min(...cells.map(([x]) => x)),
  Math.min(...cells.map(([, y]) => y)),
  Math.max(...cells.map(([x]) => x)),
  Math.max(...cells.map(([, y]) => y)),
];

/**
 * The face of the head, by the rules of the direction. It first clears the features the head
 * holds, the cells much darker than its base, then draws the ones the direction shows: a front
 * face two eyes and, by chance, a nose and brows; a side face one eye on the facing side and an
 * ear; a back face nothing.
 * @param {number[][][]} frame
 * @param {Object} context
 * @param {Object} context.analysis
 * @param {Object<string,Array<[number,number]>>} context.owned
 * @param {{face:string,facing:string}} context.rule
 * @param {Object} context.plan
 * @param {number} context.seed - The seed of the step: variant seed and direction.
 * @param {number} context.detail - The detail variation, 0 to 1.
 * @returns {{frame:number[][][],marks:Array<[number,number]>}} The frame and the feature cells it drew.
 */
export function featurePass(frame, { analysis, owned, rule, plan, seed, detail }) {
  const face = interiorOf(owned.head ?? [], analysis);
  if (face.length === 0) return { frame, marks: [] };
  const next = copy(frame);
  const base = paint(plan.regions.head.base);
  const baseLightness = lightnessOf(base);
  for (const [x, y] of face) if (lightnessOf(next[y][x]) < baseLightness - FEATURE_CONTRAST) next[y][x] = base.slice();

  const random = seededRandom(seed);
  const [x0, y0, x1, y1] = boxOf(face);
  const inFace = new Set(face.map(([x, y]) => `${x},${y}`));
  const marks = [];
  const mark = (x, y, hex) => {
    if (!inFace.has(`${x},${y}`)) return false;
    next[y][x] = paint(hex);
    marks.push([x, y]);
    return true;
  };
  const eyeY = y0 + Math.round((y1 - y0) * (0.5 + (random() - 0.5) * 0.3 * detail));
  if (rule.face === 'front') {
    const center = (x0 + x1) / 2;
    const spread = 1 + Math.floor(random() * 2) + (x1 - x0 >= 8 ? 1 : 0);
    const eyes = [...new Set([Math.round(center - spread), Math.round(center + spread)])];
    for (const x of eyes) mark(x, eyeY, plan.outline);
    if (random() < 0.35 + 0.5 * detail) mark(Math.round(center), eyeY + 2, plan.regions.head.shadow);
    if (random() < 0.5 * detail) for (const x of eyes) mark(x, eyeY - 1, plan.regions.head.shadow);
  } else if (rule.face === 'side') {
    const sign = rule.facing === 'left' ? -1 : 1;
    const eyeX = sign > 0 ? x1 - 1 - Math.floor(random() * 2) : x0 + 1 + Math.floor(random() * 2);
    mark(eyeX, eyeY, plan.outline);
    mark(
      sign > 0 ? x0 + Math.round((x1 - x0) * 0.3) : x1 - Math.round((x1 - x0) * 0.3),
      eyeY + 1,
      plan.regions.head.shadow,
    );
  }
  return { frame: next, marks };
}

/**
 * Moves the border of two regions near the contour: a cell of one region that touches the other
 * takes the base color of the other, with a chance that falls with its depth below the outline. A
 * protected cell and an outline cell never change.
 * @param {number[][][]} frame
 * @param {Object} context
 * @param {Object} context.analysis
 * @param {Object<string,Array<[number,number]>>} context.owned
 * @param {Array<[string,string]>} context.pairs - Regions that deform each other.
 * @param {Set<string>} context.frozen - `x,y` keys of the cells that stay.
 * @param {Object} context.plan
 * @param {number} context.seed
 * @param {number} context.strength - The region variation, 0 to 1.
 * @returns {{frame:number[][][],changed:number}}
 */
export function regionDeformation(frame, { analysis, owned, pairs, frozen, plan, seed, strength }) {
  const next = copy(frame);
  const random = seededRandom(seed);
  const regionAt = new Map(
    Object.entries(owned).flatMap(([regionId, cells]) => cells.map(([x, y]) => [`${x},${y}`, regionId])),
  );
  let changed = 0;
  for (const [first, second] of pairs.flatMap(([a, b]) => [
    [a, b],
    [b, a],
  ])) {
    for (const [x, y] of interiorOf(owned[first] ?? [], analysis)) {
      const depth = analysis.distance[y * analysis.width + x] - 1;
      const touches = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx, dy]) => regionAt.get(`${x + dx},${y + dy}`) === second);
      if (!touches || frozen.has(`${x},${y}`) || depth < 1) continue;
      if (random() < (strength * 0.6) / depth) {
        next[y][x] = paint(plan.regions[second].base);
        changed++;
      }
    }
  }
  return { frame: next, changed };
}

/**
 * Scatters accent and tone cells over the interior of the regions that may change: a share of the
 * cells of each region, set by the detail variation. Feature cells and protected cells stay.
 * @param {number[][][]} frame
 * @param {Object} context
 * @param {Object} context.analysis
 * @param {Object<string,Array<[number,number]>>} context.owned
 * @param {Set<string>} context.frozen - `x,y` keys of the cells that stay.
 * @param {Object} context.plan
 * @param {(regionId:string)=>number} context.seedOf - The seed of a region.
 * @param {number} context.detail - The detail variation, 0 to 1.
 * @returns {number[][][]}
 */
export function detailPass(frame, { analysis, owned, frozen, plan, seedOf, detail }) {
  let next = frame;
  for (const [regionId, cells] of Object.entries(owned)) {
    const free = interiorOf(cells, analysis).filter(([x, y]) => !frozen.has(`${x},${y}`));
    const tones = plan.regions[regionId];
    next = scatterRegion(next, free, [paint(tones.highlight), paint(tones.shadow), paint(plan.accent)], {
      density: detail * 0.06,
      seed: seedOf(regionId),
    });
  }
  return next;
}
