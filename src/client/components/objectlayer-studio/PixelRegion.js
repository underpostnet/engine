/**
 * Regions of a pixel frame and the operations that paint them.
 *
 * A region is a list of `[x, y]` cells, each once. Shapes build regions; operations paint a frame
 * inside one. A frame is a matrix of rgba cells, `frame[y][x] = [r, g, b, a]`. Every operation
 * returns a new frame and leaves its input as it was. Pure functions, no DOM.
 *
 * @module src/client/components/objectlayer-studio/PixelRegion.js
 */

/** Cells once each, in first-seen order. */
const unique = (cells) => {
  const seen = new Set();
  return cells.filter(([x, y]) => !seen.has(`${x},${y}`) && seen.add(`${x},${y}`));
};

/** The cells of a region inside a `width × height` frame. */
export const clip = (cells, width, height) => cells.filter(([x, y]) => x >= 0 && y >= 0 && x < width && y < height);

const bounds = (x0, y0, x1, y1) => [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)];

/** Every cell of the rectangle between two corners. */
export function rectRegion(x0, y0, x1, y1) {
  const [left, top, right, bottom] = bounds(x0, y0, x1, y1);
  const cells = [];
  for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) cells.push([x, y]);
  return cells;
}

/** The border cells of the rectangle between two corners. */
export const rectOutlineRegion = (x0, y0, x1, y1) => {
  const [left, top, right, bottom] = bounds(x0, y0, x1, y1);
  return rectRegion(left, top, right, bottom).filter(
    ([x, y]) => x === left || x === right || y === top || y === bottom,
  );
};

/** The cells of the line between two cells (Bresenham). */
export function lineRegion(x0, y0, x1, y1) {
  const cells = [];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  for (let x = x0, y = y0; ; ) {
    cells.push([x, y]);
    if (x === x1 && y === y1) return cells;
    const twice = 2 * error;
    if (twice >= dy) {
      error += dy;
      x += sx;
    }
    if (twice <= dx) {
      error += dx;
      y += sy;
    }
  }
}

/** The cells of the ellipse inscribed in the rectangle between two corners, filled or as a ring. */
export function ellipseRegion(x0, y0, x1, y1, { filled = true } = {}) {
  const [left, top, right, bottom] = bounds(x0, y0, x1, y1);
  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;
  const rx = (right - left) / 2 + 0.5;
  const ry = (bottom - top) / 2 + 0.5;
  const inside = (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  const disc = rectRegion(left, top, right, bottom).filter(([x, y]) => inside(x, y));
  if (filled) return disc;
  return disc.filter(([x, y]) => !(inside(x - 1, y) && inside(x + 1, y) && inside(x, y - 1) && inside(x, y + 1)));
}

/** The cells whose centre lies inside a polygon of cell corners (even-odd rule). */
export function polygonRegion(points) {
  if (points.length < 3) return unique(points.map(([x, y]) => [x, y]));
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const inside = (px, py) => {
    let odd = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [xi, yi] = points[i];
      const [xj, yj] = points[j];
      if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) odd = !odd;
    }
    return odd;
  };
  return rectRegion(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)).filter(([x, y]) =>
    inside(x + 0.5, y + 0.5),
  );
}

/** A region stated cell by cell: `[[x, y], …]` or `"x,y"` keys. */
export const maskRegion = (cells) =>
  unique(cells.map((cell) => (typeof cell === 'string' ? cell.split(',').map(Number) : [cell[0], cell[1]])));

/**
 * A region from a text query: `x,y x,y …`, `rect x0 y0 x1 y1`, `circle cx cy r` or
 * `poly x,y x,y x,y …`. Null when the text states no region.
 */
export function regionFromQuery(text) {
  const [head, ...rest] = String(text ?? '')
    .trim()
    .split(/\s+/);
  const numbers = rest.map(Number);
  const integers = (count) => numbers.length === count && numbers.every(Number.isInteger);
  if (head === 'rect') return integers(4) ? rectRegion(...numbers) : null;
  if (head === 'circle') {
    if (!integers(3)) return null;
    const [cx, cy, r] = numbers;
    return ellipseRegion(cx - r, cy - r, cx + r, cy + r);
  }
  const points = (head === 'poly' ? rest : [head, ...rest]).map((pair) => pair.split(',').map(Number));
  if (points.some((point) => point.length !== 2 || !point.every(Number.isInteger))) return null;
  return head === 'poly' ? polygonRegion(points) : maskRegion(points);
}

const sameColor = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];

/** The cells of a frame that hold a color, or, with `contiguous`, those joined to a start cell. */
export function colorRegion(frame, rgba, { contiguous = null } = {}) {
  if (!contiguous) return frame.flatMap((row, y) => row.flatMap((cell, x) => (sameColor(cell, rgba) ? [[x, y]] : [])));
  const [startX, startY] = contiguous;
  const cells = [];
  const seen = new Set();
  const stack = [[startX, startY]];
  while (stack.length) {
    const [x, y] = stack.pop();
    if (seen.has(`${x},${y}`) || !frame[y]?.[x] || !sameColor(frame[y][x], rgba)) continue;
    seen.add(`${x},${y}`);
    cells.push([x, y]);
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return cells;
}

/** The transparent cells next to a painted cell: the outline around the shape a frame holds. */
export function outlineRegion(frame) {
  const painted = (x, y) => (frame[y]?.[x]?.[3] ?? 0) > 0;
  return frame.flatMap((row, y) =>
    row.flatMap((cell, x) =>
      !painted(x, y) && (painted(x - 1, y) || painted(x + 1, y) || painted(x, y - 1) || painted(x, y + 1))
        ? [[x, y]]
        : [],
    ),
  );
}

/**
 * A region and its mirror images across the frame's centre lines.
 * @param {Array<[number,number]>} cells
 * @param {{width:number, height:number, axis:''|'x'|'y'|'xy'}} symmetry - `x` mirrors left to right.
 */
export function mirrorRegion(cells, { width, height, axis }) {
  const mirrored = [...cells];
  if (axis.includes('x')) mirrored.push(...mirrored.map(([x, y]) => [width - 1 - x, y]));
  if (axis.includes('y')) mirrored.push(...mirrored.map(([x, y]) => [x, height - 1 - y]));
  return unique(mirrored);
}

const copy = (frame) => frame.map((row) => row.map((cell) => cell.slice()));

/** Paints every cell of a region one color. */
export function fillRegion(frame, cells, rgba) {
  const next = copy(frame);
  for (const [x, y] of clip(cells, frame[0]?.length ?? 0, frame.length)) next[y][x] = rgba.slice();
  return next;
}

/** A seeded generator of numbers in [0, 1): the same seed gives the same sequence. */
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Paints a share of a region's cells with colors drawn from a list, the same way for the same seed.
 * @param {number[][][]} frame
 * @param {Array<[number,number]>} cells
 * @param {number[][]} colors - rgba colors to draw from.
 * @param {{density?:number, seed?:number}} [options] - `density` is the share of cells painted.
 */
export function scatterRegion(frame, cells, colors, { density = 0.3, seed = 1 } = {}) {
  const next = copy(frame);
  const random = seededRandom(seed);
  for (const [x, y] of clip(cells, frame[0]?.length ?? 0, frame.length)) {
    const draw = random();
    const pick = random();
    if (colors.length > 0 && draw < density) next[y][x] = colors[Math.floor(pick * colors.length)].slice();
  }
  return next;
}

/** Writes a stamp with its top-left cell at (x, y). Transparent stamp cells leave the frame as it was. */
export function stampRegion(frame, stamp, x, y) {
  const next = copy(frame);
  stamp.forEach((row, dy) =>
    row.forEach((cell, dx) => {
      if (cell[3] > 0 && next[y + dy]?.[x + dx]) next[y + dy][x + dx] = cell.slice();
    }),
  );
  return next;
}

/** Paints a region with a repeating tile, anchored at an origin cell. Transparent tile cells skip. */
export function patternRegion(frame, cells, tile, { originX = 0, originY = 0 } = {}) {
  const next = copy(frame);
  const height = tile.length;
  const width = tile[0]?.length ?? 0;
  if (!width || !height) return next;
  const wrap = (value, size) => ((value % size) + size) % size;
  for (const [x, y] of clip(cells, frame[0]?.length ?? 0, frame.length)) {
    const cell = tile[wrap(y - originY, height)][wrap(x - originX, width)];
    if (cell[3] > 0) next[y][x] = cell.slice();
  }
  return next;
}

const distance = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/**
 * Moves each painted cell of a region to the nearest palette color, keeping its alpha. Cells of a
 * locked color, whatever their alpha, keep theirs.
 * @param {number[][][]} frame
 * @param {Array<[number,number]>} cells
 * @param {number[][]} palette - rgba colors.
 * @param {{locked?:number[][]}} [options]
 */
export function paletteApply(frame, cells, palette, { locked = [] } = {}) {
  const next = copy(frame);
  if (palette.length === 0) return next;
  for (const [x, y] of clip(cells, frame[0]?.length ?? 0, frame.length)) {
    const cell = frame[y][x];
    if (cell[3] === 0 || locked.some((color) => distance(color, cell) === 0)) continue;
    const nearest = palette.reduce((best, color) => (distance(color, cell) < distance(best, cell) ? color : best));
    next[y][x] = [nearest[0], nearest[1], nearest[2], cell[3]];
  }
  return next;
}

/**
 * Replaces colors inside a region: each `[from, to]` pair turns cells of `from` into `to`. Pairs
 * apply at once, so `[a, b]` with `[b, a]` swaps two colors.
 */
export function paletteSwap(frame, cells, pairs) {
  const next = copy(frame);
  for (const [x, y] of clip(cells, frame[0]?.length ?? 0, frame.length)) {
    const pair = pairs.find(([from]) => sameColor(from, frame[y][x]));
    if (pair) next[y][x] = pair[1].slice();
  }
  return next;
}

/** The color a share `t` (0 to 1) of the way from one color to another, each channel interpolated. */
export const mixColor = (from, to, t) => from.map((channel, at) => Math.round(channel + (to[at] - channel) * t));

/** `steps` colors from one color to another, both included. */
export function colorRamp(from, to, steps) {
  if (steps < 2) return [from.slice()];
  return Array.from({ length: steps }, (_, index) => mixColor(from, to, index / (steps - 1)));
}

/** The frame repeated `times × times`: how it reads as a seamless tile. */
export const tiledPreview = (frame, times = 3) =>
  Array.from({ length: frame.length * times }, (_, y) =>
    Array.from({ length: (frame[0]?.length ?? 0) * times }, (_, x) =>
      frame[y % frame.length][x % frame[0].length].slice(),
    ),
  );
