/**
 * Morphology of cell masks: conversion between masks and cell lists, erosion, dilation, opening,
 * closing and the distance to an outline. A mask is a `Uint8Array` of `width × height`, row by row.
 * The operations work with the 4-neighbor cross. Pure functions.
 *
 * @module src/projects/cyberia/procedural/core/morphology.js
 */
const CROSS = Object.freeze([
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]);

const inside = (x, y, width, height) => x >= 0 && y >= 0 && x < width && y < height;

/** The mask of a list of `[x, y]` cells. */
export function maskOfCells(cells, width, height) {
  const mask = new Uint8Array(width * height);
  for (const [x, y] of cells) if (inside(x, y, width, height)) mask[y * width + x] = 1;
  return mask;
}

/** The `[x, y]` cells a mask sets, row by row. */
export const cellsOfMask = (mask, width) =>
  Array.from(mask.keys())
    .filter((cell) => mask[cell])
    .map((cell) => [cell % width, Math.floor(cell / width)]);

/** The cells of `mask` that keep every cross neighbor inside it, after `steps` rounds. */
export function erode(mask, width, height, steps = 1) {
  let current = mask;
  for (let step = 0; step < steps; step++) {
    const next = new Uint8Array(current.length);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        next[y * width + x] =
          current[y * width + x] &&
          CROSS.every(([dx, dy]) => inside(x + dx, y + dy, width, height) && current[(y + dy) * width + x + dx])
            ? 1
            : 0;
    current = next;
  }
  return current;
}

/** The cells of `mask` and their cross neighbors, after `steps` rounds. */
export function dilate(mask, width, height, steps = 1) {
  let current = mask;
  for (let step = 0; step < steps; step++) {
    const next = current.slice();
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        if (current[y * width + x])
          for (const [dx, dy] of CROSS) if (inside(x + dx, y + dy, width, height)) next[(y + dy) * width + x + dx] = 1;
    current = next;
  }
  return current;
}

/** Erosion then dilation: it removes the parts thinner than the cross. */
export const open = (mask, width, height, steps = 1) => dilate(erode(mask, width, height, steps), width, height, steps);

/** Dilation then erosion: it fills the one-cell gaps and notches. */
export const close = (mask, width, height, steps = 1) =>
  erode(dilate(mask, width, height, steps), width, height, steps);

/**
 * The distance in cells of each occupied cell to the outline: 1 on the outline, 0 off the shape.
 * @param {Uint8Array} mask
 * @param {Uint8Array} outline
 * @param {number} width
 * @param {number} height
 * @returns {Uint8Array}
 */
export function distanceField(mask, outline, width, height) {
  const distance = new Uint8Array(mask.length);
  const queue = [];
  for (let cell = 0; cell < mask.length; cell++)
    if (mask[cell] && outline[cell]) {
      distance[cell] = 1;
      queue.push(cell);
    }
  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head];
    const x = cell % width;
    const y = (cell - x) / width;
    for (const [dx, dy] of CROSS) {
      const next = (y + dy) * width + x + dx;
      if (inside(x + dx, y + dy, width, height) && mask[next] && !distance[next]) {
        distance[next] = Math.min(255, distance[cell] + 1);
        queue.push(next);
      }
    }
  }
  return distance;
}
