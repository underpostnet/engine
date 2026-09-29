/**
 * The transform of frames imported from another Object Layer: every opaque cell takes a color of
 * the target palette, and the silhouette can take a bounded, seeded contour mutation.
 *
 * A frame is a matrix of rgba cells, `frame[y][x] = [r, g, b, a]`. Alpha is the shape: a cell with
 * alpha above 0 is occupied. A mutation moves one exposed boundary cell to a transparent cell next
 * to it, so the occupied count stays. Every move stays within one cell of the source contour and
 * keeps the component count, the hole count, the bounding box (±1 cell) and the centroid (±1 cell).
 * Foreground connects in 8 directions, background in 4. Pure functions, no DOM: every function
 * returns new frames and leaves its input as it was.
 *
 * @module src/client/components/objectlayer-studio/FrameMutation.js
 */
import { seededRandom } from './PixelRegion.js';
import { hexToRgba } from './RenderSource.js';

/** The palette roles a lightness ramp runs through, darkest role first. */
const RAMP_ROLES = Object.freeze(['outline', 'shadow', 'base', 'highlight']);
/** An accent covers at most this share of the opaque cells... */
const ACCENT_SHARE = 0.1;
/** ...and its chroma exceeds the mean chroma of the source by at least this much. */
const ACCENT_CHROMA_LEAD = 0.35;
/** The share of the silhouette boundary a mutation factor of 1 moves. */
const MAX_BOUNDARY_SHARE = 0.25;
/** The most moves one frame takes, whatever its size. */
const MAX_MUTATIONS = 64;
/** The tries a mutation spends for each move of its budget. */
const ATTEMPTS_PER_MUTATION = 3;
/** The farthest the centroid moves, in cells. */
const MAX_CENTROID_DRIFT = 1;

const OFFSETS_4 = Object.freeze([
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]);
const OFFSETS_8 = Object.freeze([...OFFSETS_4, [1, 1], [1, -1], [-1, 1], [-1, -1]]);

const lightness = ([r, g, b]) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;
const chroma = ([r, g, b]) => (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
const rgbKey = ([r, g, b]) => (r << 16) | (g << 8) | b;
const byLightness = (left, right) => lightness(left) - lightness(right) || rgbKey(left) - rgbKey(right);

/** The `[r, g, b]` colors of `#rrggbb` hexes, once each, darkest first. */
const tonesOf = (hexes = []) =>
  [...new Set(hexes.map((hex) => hex.slice(0, 7).toLowerCase()))]
    .map((hex) => hexToRgba(hex).slice(0, 3))
    .sort(byLightness);

/**
 * The target color of each source color, shared by every frame of an import. Rare colors whose
 * chroma stands out take the accent role. Of the others, the darkest takes the outline, and the most
 * used of the rest takes the middle base tone; the darker ones spread from the outline toward it and
 * the lighter ones from the highlight toward it, in lightness order.
 * @param {number[][][][]} frames - Every frame of the import.
 * @param {Object<string,string[]>} roles - The target palette: `#rrggbb` colors by role.
 * @returns {Map<number, number[]>} Target `[r, g, b]` by source rgb key.
 * @throws {RangeError} When the palette holds no color.
 */
export function paletteMapping(frames, roles) {
  const ramped = RAMP_ROLES.some((role) => roles[role]?.length);
  const accents = tonesOf(roles.accent);
  const rampTones = tonesOf(
    Object.entries(roles)
      .filter(([role]) => (ramped ? RAMP_ROLES.includes(role) : role !== 'accent'))
      .flatMap(([, hexes]) => hexes),
  );
  const tones = rampTones.length > 0 ? rampTones : accents;
  if (tones.length === 0) throw new RangeError('The target palette holds no color');
  const base = ramped && roles.base?.length ? tonesOf(roles.base) : tones;
  const center = base[Math.floor(base.length / 2)];
  const roleOf = (role) => new Set(ramped ? tonesOf(roles[role]).map(rgbKey) : []);
  const [outline, highlight] = [roleOf('outline'), roleOf('highlight')];
  const others = tones.filter((tone) => rgbKey(tone) !== rgbKey(center));
  const below = others
    .filter((tone) => outline.has(rgbKey(tone)) || (!highlight.has(rgbKey(tone)) && byLightness(tone, center) < 0))
    .sort((left, right) => outline.has(rgbKey(right)) - outline.has(rgbKey(left)) || byLightness(left, right));
  const above = others
    .filter((tone) => !below.includes(tone))
    .sort((left, right) => highlight.has(rgbKey(left)) - highlight.has(rgbKey(right)) || byLightness(left, right));

  const counts = new Map();
  for (const frame of frames)
    for (const row of frame)
      for (const cell of row) if (cell[3] > 0) counts.set(rgbKey(cell), (counts.get(rgbKey(cell)) ?? 0) + 1);
  const colors = [...counts]
    .map(([key, count]) => ({ key, rgb: [key >> 16, (key >> 8) & 255, key & 255], count }))
    .sort((left, right) => byLightness(left.rgb, right.rgb));
  const total = colors.reduce((sum, { count }) => sum + count, 0);
  const meanChroma = colors.reduce((sum, { rgb, count }) => sum + chroma(rgb) * count, 0) / (total || 1);
  const isAccent = ({ rgb, count }) =>
    tones !== accents &&
    accents.length > 0 &&
    count <= ACCENT_SHARE * total &&
    chroma(rgb) >= meanChroma + ACCENT_CHROMA_LEAD;

  const mapping = new Map();
  // The first color of a group takes the first tone; the rest step toward the last tone.
  const spread = (group, targets) =>
    group.forEach(({ key }, index) =>
      mapping.set(key, targets.length > 0 ? targets[Math.floor((index * targets.length) / group.length)] : center),
    );
  spread(colors.filter(isAccent), accents);
  const ramp = colors.filter((color) => !isAccent(color));
  const rest = ramp.length > 1 ? ramp.slice(1) : ramp;
  const dominant = rest.reduce((most, color) => (color.count > most.count ? color : most), rest[0]);
  if (dominant) mapping.set(dominant.key, center);
  spread(ramp.slice(0, ramp.indexOf(dominant)), below);
  spread(ramp.slice(ramp.indexOf(dominant) + 1).reverse(), above.reverse());
  return mapping;
}

/** A frame in the target colors: each opaque cell takes the color of its source color and keeps its alpha. */
export const remapFramePalette = (frame, mapping) =>
  frame.map((row) => row.map((cell) => (cell[3] > 0 ? [...mapping.get(rgbKey(cell)), cell[3]] : cell.slice())));

/** The cells next to a cell of a `width × height` grid, as indexes. */
const around = (index, width, height, offsets) => {
  const x = index % width;
  const y = (index - x) / width;
  const cells = [];
  for (const [dx, dy] of offsets)
    if (x + dx >= 0 && y + dy >= 0 && x + dx < width && y + dy < height) cells.push((y + dy) * width + x + dx);
  return cells;
};

/** The connected regions of the cells `inside` accepts: the region of each cell (0 for none) and their count. */
const regionsOf = (width, height, inside, offsets) => {
  const labels = new Int32Array(width * height);
  let count = 0;
  for (let start = 0; start < labels.length; start++) {
    if (labels[start] || !inside(start)) continue;
    labels[start] = ++count;
    const stack = [start];
    while (stack.length > 0)
      for (const cell of around(stack.pop(), width, height, offsets))
        if (!labels[cell] && inside(cell)) {
          labels[cell] = count;
          stack.push(cell);
        }
  }
  return { labels, count };
};

const onEdge = (index, width, height) => {
  const x = index % width;
  const y = (index - x) / width;
  return x === 0 || y === 0 || x === width - 1 || y === height - 1;
};

/** The transparent regions: which cells reach the canvas edge (the exterior), and how many holes stay enclosed. */
const backgroundOf = (mask, width, height) => {
  const { labels, count } = regionsOf(width, height, (cell) => !mask[cell], OFFSETS_4);
  const edge = new Set();
  for (let cell = 0; cell < labels.length; cell++)
    if (labels[cell] && onEdge(cell, width, height)) edge.add(labels[cell]);
  return { exterior: labels.map((label) => (edge.has(label) ? 1 : 0)), holes: count - edge.size };
};

const maskOf = (frame) => Uint8Array.from(frame.flat(), (cell) => (cell[3] > 0 ? 1 : 0));

/**
 * The structure of a mask: the occupied count, the components, the holes, the bounding box
 * `[x0, y0, x1, y1]` and the centroid `[x, y]`.
 */
const measure = (mask, width, height) => {
  const box = [width, height, -1, -1];
  let count = 0;
  let sumX = 0;
  let sumY = 0;
  for (let cell = 0; cell < mask.length; cell++) {
    if (!mask[cell]) continue;
    const x = cell % width;
    const y = (cell - x) / width;
    count++;
    sumX += x;
    sumY += y;
    box[0] = Math.min(box[0], x);
    box[1] = Math.min(box[1], y);
    box[2] = Math.max(box[2], x);
    box[3] = Math.max(box[3], y);
  }
  return {
    width,
    height,
    count,
    components: regionsOf(width, height, (cell) => mask[cell] === 1, OFFSETS_8).count,
    holes: backgroundOf(mask, width, height).holes,
    box,
    centroid: count > 0 ? [sumX / count, sumY / count] : [0, 0],
  };
};

/** The structure of a frame's shape, as {@link validateShape} compares it. */
export const shapeOf = (frame) => measure(maskOf(frame), frame[0]?.length ?? 0, frame.length);

const silhouetteOf = (mask, width, height) => {
  const { exterior } = backgroundOf(mask, width, height);
  const boundary = [];
  for (let cell = 0; cell < mask.length; cell++)
    if (mask[cell] && around(cell, width, height, OFFSETS_4).some((next) => exterior[next])) boundary.push(cell);
  return { width, height, mask, exterior, boundary };
};

/**
 * The silhouette of a frame: its occupied mask, the transparent cells that reach the canvas edge,
 * and the boundary, the occupied cells next to that exterior. Cells off the boundary are the core.
 * @param {number[][][]} frame
 * @returns {{width: number, height: number, mask: Uint8Array, exterior: Uint8Array, boundary: number[]}}
 */
export const detectSilhouette = (frame) => silhouetteOf(maskOf(frame), frame[0]?.length ?? 0, frame.length);

/**
 * Whether a cell can leave the shape without cutting it locally: at least three of its eight
 * neighbors are occupied, and they connect to each other around it. Tips, thin limbs and one-cell
 * bridges fail.
 */
const removable = (mask, index, width, height) => {
  const x = index % width;
  const y = (index - x) / width;
  const occupied = OFFSETS_8.filter(
    ([dx, dy]) => x + dx >= 0 && y + dy >= 0 && x + dx < width && y + dy < height && mask[(y + dy) * width + x + dx],
  );
  if (occupied.length < 3) return false;
  const reached = new Set([0]);
  const stack = [0];
  while (stack.length > 0) {
    const [ax, ay] = occupied[stack.pop()];
    occupied.forEach(([bx, by], at) => {
      if (!reached.has(at) && Math.abs(ax - bx) <= 1 && Math.abs(ay - by) <= 1) {
        reached.add(at);
        stack.push(at);
      }
    });
  }
  return reached.size === occupied.length;
};

/**
 * The moves a mutation can take now: from a boundary cell outside the protected core that
 * {@link removable} accepts, to a transparent exterior cell of the allowed band next to it. The
 * target cell stays attached to the rest of the shape on a side and has one more occupied
 * neighbor, so no move grows a spike. A move weighs as many as the exterior sides of its cell.
 * @param {Object} silhouette - {@link detectSilhouette} of the current shape.
 * @param {{band: Uint8Array, core: Uint8Array}} limits - Cells a move may fill, and cells it never empties.
 * @returns {Array<{from: number, to: number, weight: number}>}
 */
export function buildMutationCandidates({ width, height, mask, exterior, boundary }, { band, core }) {
  const moves = [];
  for (const from of boundary) {
    if (core[from] || !removable(mask, from, width, height)) continue;
    const weight = around(from, width, height, OFFSETS_4).filter((cell) => exterior[cell]).length;
    const attached = (to) =>
      around(to, width, height, OFFSETS_4).some((cell) => cell !== from && mask[cell]) &&
      around(to, width, height, OFFSETS_8).filter((cell) => cell !== from && mask[cell]).length >= 2;
    for (const to of around(from, width, height, OFFSETS_8))
      if (band[to] && exterior[to] && attached(to)) moves.push({ from, to, weight });
  }
  return moves;
}

/**
 * Whether a shape keeps the structure of its source: the canvas, the occupied count, the
 * components, the holes, the bounding box within one cell, and the centroid within one cell.
 * @param {Object} baseline - {@link shapeOf} the source.
 * @param {Object} shape - {@link shapeOf} the candidate.
 * @returns {boolean}
 */
export const validateShape = (baseline, shape) =>
  shape.width === baseline.width &&
  shape.height === baseline.height &&
  shape.count === baseline.count &&
  shape.components === baseline.components &&
  shape.holes === baseline.holes &&
  shape.box[0] >= baseline.box[0] - 1 &&
  shape.box[1] >= baseline.box[1] - 1 &&
  shape.box[2] <= baseline.box[2] + 1 &&
  shape.box[3] <= baseline.box[3] + 1 &&
  Math.hypot(shape.centroid[0] - baseline.centroid[0], shape.centroid[1] - baseline.centroid[1]) <= MAX_CENTROID_DRIFT;

/**
 * The moves a factor buys for a silhouette: a share of its boundary, never above {@link MAX_MUTATIONS}.
 * @param {number} boundaryCount - The boundary cells of the silhouette.
 * @param {number} factor - 0 to 1.
 * @returns {number}
 */
export const mutationBudget = (boundaryCount, factor) =>
  Math.min(MAX_MUTATIONS, Math.floor(Math.min(1, Math.max(0, factor)) * boundaryCount * MAX_BOUNDARY_SHARE));

const weightedPick = (moves, random) => {
  let rest = random() * moves.reduce((sum, { weight }) => sum + weight, 0);
  const index = moves.findIndex(({ weight }) => (rest -= weight) < 0);
  return index === -1 ? moves.length - 1 : index;
};

/**
 * A frame whose contour takes up to {@link mutationBudget} moves, each drawn from the seed and
 * kept only when {@link validateShape} accepts it. A moved cell keeps its color and alpha. No
 * accepted move leaves the frame as it was.
 * @param {number[][][]} frame
 * @param {{factor?: number, seed?: number}} [options]
 * @returns {{frame: number[][][], accepted: number, rejected: number}}
 */
export function mutateFrameShape(frame, { factor = 0, seed = 0 } = {}) {
  const height = frame.length;
  const width = frame[0]?.length ?? 0;
  const result = { frame: frame.map((row) => row.map((cell) => cell.slice())), accepted: 0, rejected: 0 };
  const source = silhouetteOf(maskOf(frame), width, height);
  const budget = mutationBudget(source.boundary.length, factor);
  if (budget === 0) return result;

  const baseline = measure(source.mask, width, height);
  const edge = new Set(source.boundary);
  const core = source.mask.map((occupied, cell) => (occupied && !edge.has(cell) ? 1 : 0));
  const band = source.exterior.map((outside, cell) =>
    outside && around(cell, width, height, OFFSETS_8).some((next) => source.mask[next]) ? 1 : 0,
  );
  const limits = { band, core };
  const mask = source.mask.slice();
  const random = seededRandom(seed);
  const cellAt = (index) => [index % width, Math.floor(index / width)];

  let candidates = buildMutationCandidates(silhouetteOf(mask, width, height), limits);
  for (let attempt = 0; attempt < budget * ATTEMPTS_PER_MUTATION; attempt++) {
    if (result.accepted === budget || candidates.length === 0) break;
    const pick = weightedPick(candidates, random);
    const { from, to } = candidates[pick];
    mask[from] = 0;
    mask[to] = 1;
    if (validateShape(baseline, measure(mask, width, height))) {
      const [fromX, fromY] = cellAt(from);
      const [toX, toY] = cellAt(to);
      result.frame[toY][toX] = result.frame[fromY][fromX];
      result.frame[fromY][fromX] = [0, 0, 0, 0];
      result.accepted++;
      candidates = buildMutationCandidates(silhouetteOf(mask, width, height), limits);
    } else {
      mask[from] = 1;
      mask[to] = 0;
      result.rejected++;
      candidates.splice(pick, 1);
    }
  }
  return result;
}

/**
 * One imported frame: in the target colors, then mutated when the factor is above 0.
 * @param {number[][][]} frame
 * @param {Map<number, number[]>} mapping - {@link paletteMapping} of the import.
 * @param {{mutationFactor?: number, seed?: number}} [options]
 * @returns {{frame: number[][][], accepted: number, rejected: number}}
 */
export function transformImportedFrame(frame, mapping, { mutationFactor = 0, seed = 0 } = {}) {
  const remapped = remapFramePalette(frame, mapping);
  return mutationFactor > 0
    ? mutateFrameShape(remapped, { factor: mutationFactor, seed })
    : { frame: remapped, accepted: 0, rejected: 0 };
}

/** The seed of one frame of an import: FNV-1a of the operation seed, both items, the direction and the index. */
export const frameSeed = (...parts) => {
  let hash = 0x811c9dc5;
  for (const char of parts.join('|')) hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193);
  return hash >>> 0;
};

/**
 * Every frame of an import in the target palette, each mutated with a seed of its own when `mutate`
 * is on and the factor is above 0. Directions, frame order, frame count and frame size stay.
 * @param {Object<string, number[][][][]>} framesByCode - rgba frames by direction code.
 * @param {Object<string,string[]>} roles - The target palette.
 * @param {Object} [options]
 * @param {boolean} [options.mutate]
 * @param {number} [options.mutationFactor] - 0 to 1.
 * @param {number} [options.seed] - The operation seed.
 * @param {string} [options.source] - The source item id.
 * @param {string} [options.target] - The target item id.
 * @returns {{framesByCode: Object<string, number[][][][]>, frames: number, accepted: number, rejected: number}}
 */
export function transformImportedFrames(
  framesByCode,
  roles,
  { mutate = false, mutationFactor = 0, seed = 0, source = '', target = '' } = {},
) {
  const mapping = paletteMapping(Object.values(framesByCode).flat(), roles);
  const factor = mutate ? Math.min(1, Math.max(0, Number(mutationFactor) || 0)) : 0;
  const result = { framesByCode: {}, frames: 0, accepted: 0, rejected: 0 };
  for (const [code, frames] of Object.entries(framesByCode))
    result.framesByCode[code] = frames.map((frame, index) => {
      const next = transformImportedFrame(frame, mapping, {
        mutationFactor: factor,
        seed: frameSeed(seed, source, target, code, index),
      });
      result.frames++;
      result.accepted += next.accepted;
      result.rejected += next.rejected;
      return next.frame;
    });
  return result;
}
