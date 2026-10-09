/**
 * The hair generator: a constrained, seeded growth from the hair region over the head. A strand
 * starts on the outline next to the hair and takes steps outward, pulled by the style: gravity, a
 * side bias (which also picks the roots on that side first), a chance to branch and a length. A
 * step takes only a free cell inside the reach of the head, outside the protected shape and not
 * in a hole the silhouette encloses. A strand that closes a hole or splits the shape is dropped.
 * It is not a contour mutation: the silhouette grows where the hair grows. Pure functions.
 *
 * @module src/projects/cyberia/procedural/generators/skin/hair-growth.js
 */
import { hexToRgba } from '../../../../../client/components/objectlayer-studio/RenderSource.js';
import { seededRandom } from '../../../../../client/components/objectlayer-studio/PixelRegion.js';
import { analyzeFrame } from '../../core/frame-analysis.js';
import { cellsOfMask, close, dilate, maskOfCells } from '../../core/morphology.js';
import { shapeOf } from '../../core/frame-mutation.js';
import { shuffled } from '../../core/seed.js';

/**
 * The hair styles. `length` is the steps of a strand, `reach` the cells from the head a strand may
 * go, `density` the share of the roots that grow, `bias` the pull to the right (negative to the
 * left), `gravity` the pull down and `branch` the chance a step splits.
 */
export const HAIR_STYLES = Object.freeze({
  short: { length: 2, reach: 2, density: 0.4, bias: 0, gravity: 0, branch: 0.05, layers: 1 },
  medium: { length: 3, reach: 3, density: 0.6, bias: 0, gravity: 0.2, branch: 0.15, layers: 1 },
  long: { length: 6, reach: 6, density: 0.5, bias: 0, gravity: 0.9, branch: 0.1, layers: 1 },
  'left-heavy': { length: 4, reach: 4, density: 0.6, bias: -0.9, gravity: 0.3, branch: 0.15, layers: 1 },
  'right-heavy': { length: 4, reach: 4, density: 0.6, bias: 0.9, gravity: 0.3, branch: 0.15, layers: 1 },
  messy: { length: 4, reach: 4, density: 0.8, bias: 0, gravity: 0, branch: 0.5, layers: 1 },
  layered: { length: 3, reach: 4, density: 0.6, bias: 0, gravity: 0.3, branch: 0.2, layers: 2 },
});

/** The ids of the styles, in the order a seeded pick reads them. */
export const HAIR_STYLE_IDS = Object.freeze(Object.keys(HAIR_STYLES));

/** The share of the head and hair cells a full hair variation may add. */
const MAX_GROWTH_SHARE = 0.5;
/** The most occupied neighbors of a cell a strand may enter: more would fill a concavity. */
const MAX_CROWD = 4;
const STEPS = Object.freeze([
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
]);

const paint = (hex) => [...hexToRgba(hex).slice(0, 3), 255];

/**
 * Grows hair over a frame.
 * @param {number[][][]} frame
 * @param {Object} context
 * @param {Object} context.analysis - {@link analyzeFrame} of the frame.
 * @param {Array<[number,number]>} context.hairCells - The hair region cells.
 * @param {Array<[number,number]>} context.headCells - The head region cells.
 * @param {Set<string>} context.frozen - `x,y` keys of the cells that never take hair.
 * @param {{facing:string,hairMass:number}} context.rule - The rules of the direction.
 * @param {string} context.style - A key of {@link HAIR_STYLES}.
 * @param {Object} context.plan - The palette plan.
 * @param {number} context.seed - The seed of the step: variant seed, direction and frame.
 * @param {number} context.strength - The hair variation, 0 to 1.
 * @returns {{frame:number[][][],added:number}} The frame the hair changed, or the frame as it was
 *   when no strand fits.
 */
export function growHair(frame, { analysis, hairCells, headCells, frozen, rule, style, plan, seed, strength }) {
  const { width, height, mask, outline, enclosed } = analysis;
  const shape = HAIR_STYLES[style];
  const body = [...hairCells, ...headCells].filter(([x, y]) => mask[y * width + x]);
  const budget = Math.round(strength * rule.hairMass * MAX_GROWTH_SHARE * body.length);
  const hairKeys = new Set(hairCells.map(([x, y]) => `${x},${y}`));
  const touchesHair = (x, y) =>
    hairKeys.has(`${x},${y}`) || STEPS.some(([dx, dy]) => hairKeys.has(`${x + dx},${y + dy}`));
  const roots = cellsOfMask(outline, width).filter(([x, y]) => touchesHair(x, y));
  if (budget < 1 || roots.length === 0) return { frame, added: 0 };

  const random = seededRandom(seed);
  const zone = dilate(maskOfCells(body, width, height), width, height, shape.reach);
  const occupied = mask.slice();
  const center = [
    body.reduce((sum, [x]) => sum + x, 0) / body.length,
    body.reduce((sum, [, y]) => sum + y, 0) / body.length,
  ];
  const facingBias = rule.facing === 'right' ? -0.4 : rule.facing === 'left' ? 0.4 : 0;
  const added = [];
  const free = (x, y) =>
    x >= 0 &&
    y >= 0 &&
    x < width &&
    y < height &&
    !occupied[y * width + x] &&
    !enclosed[y * width + x] &&
    zone[y * width + x] &&
    !frozen.has(`${x},${y}`);
  const crowd = (x, y) =>
    STEPS.filter(
      ([dx, dy]) =>
        x + dx >= 0 && y + dy >= 0 && x + dx < width && y + dy < height && occupied[(y + dy) * width + x + dx],
    ).length;

  const before = shapeOf(frame);
  const keepsTopology = (cells) => {
    const { components, holes } = shapeOf(
      Array.from({ length: height }, (_, y) =>
        Array.from({ length: width }, (_, x) => (cells[y * width + x] ? [0, 0, 0, 255] : [0, 0, 0, 0])),
      ),
    );
    return components === before.components && holes === before.holes;
  };
  const order = shuffled(roots, random)
    .map((root) => ({ root, score: ((root[0] - center[0]) * shape.bias) / 4 + random() }))
    .sort((left, right) => right.score - left.score)
    .map(({ root }) => root);
  for (let layer = 0; layer < shape.layers; layer++) {
    const length = Math.max(1, Math.round(shape.length * (layer === 0 ? 1 : 0.5)));
    for (const root of order.slice(0, Math.max(1, Math.round(roots.length * shape.density)))) {
      const start = added.length;
      const stack = [{ at: root, left: length }];
      while (stack.length > 0 && added.length < budget) {
        const { at, left } = stack.pop();
        if (left < 1) continue;
        const outward = [at[0] - center[0], at[1] - center[1]];
        const pull = [outward[0] + shape.bias + facingBias, outward[1] + shape.gravity * 2];
        const norm = Math.hypot(...pull) || 1;
        const options = STEPS.map(([dx, dy]) => ({ x: at[0] + dx, y: at[1] + dy, dx, dy }))
          .filter(({ x, y }) => free(x, y) && crowd(x, y) <= MAX_CROWD)
          .map((option) => ({
            ...option,
            weight:
              Math.max(
                0.05,
                1 + (option.dx * pull[0] + option.dy * pull[1]) / (norm * Math.hypot(option.dx, option.dy)),
              ) * (option.dx === 0 || option.dy === 0 ? 1.5 : 1),
          }));
        if (options.length === 0) continue;
        let rest = random() * options.reduce((sum, { weight }) => sum + weight, 0);
        const chosen = options.find(({ weight }) => (rest -= weight) < 0) ?? options.at(-1);
        occupied[chosen.y * width + chosen.x] = 1;
        added.push([chosen.x, chosen.y]);
        stack.push({ at: [chosen.x, chosen.y], left: left - 1 });
        if (random() < shape.branch) stack.push({ at: [chosen.x, chosen.y], left: Math.floor(left / 2) });
      }
      if (!keepsTopology(occupied)) for (const [x, y] of added.splice(start)) occupied[y * width + x] = 0;
    }
  }
  const closed = close(occupied, width, height);
  for (let cell = 0; cell < closed.length && added.length < budget; cell++) {
    const [x, y] = [cell % width, Math.floor(cell / width)];
    if (closed[cell] && free(x, y)) {
      occupied[cell] = 1;
      added.push([x, y]);
    }
  }
  if (added.length === 0 || !keepsTopology(occupied)) return { frame, added: 0 };

  const grown = frame.map((row) => row.map((cell) => cell.slice()));
  for (const [x, y] of added) grown[y][x] = paint(plan.regions.hair.base);
  const after = analyzeFrame(grown);
  for (const [x, y] of added) if (after.outline[y * width + x]) grown[y][x] = paint(plan.outline);
  return { frame: grown, added: added.length };
}
