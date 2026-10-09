/**
 * The analysis of a pixel frame: its silhouette, outline, interior, enclosed cells and the
 * distance of each cell to the contour. A frame is a matrix of rgba cells. Pure functions.
 *
 * @module src/projects/cyberia/procedural/core/frame-analysis.js
 */
import { detectSilhouette } from './frame-mutation.js';
import { distanceField, open } from './morphology.js';

/**
 * The structure of a frame, read from its alpha: `mask` is the silhouette; `outline` the occupied
 * cells next to the exterior (a flood fill from the canvas edge); `interior` the other occupied
 * cells; `core` the interior that survives an opening, so a part thinner than three cells has
 * none; `enclosed` the transparent cells the silhouette closes in; `distance` the cells to the
 * outline.
 * @param {number[][][]} frame
 * @returns {{width:number,height:number,mask:Uint8Array,exterior:Uint8Array,outline:Uint8Array,interior:Uint8Array,core:Uint8Array,enclosed:Uint8Array,distance:Uint8Array}}
 */
export function analyzeFrame(frame) {
  const { width, height, mask, exterior, boundary } = detectSilhouette(frame);
  const outline = new Uint8Array(mask.length);
  for (const cell of boundary) outline[cell] = 1;
  const interior = mask.map((occupied, cell) => (occupied && !outline[cell] ? 1 : 0));
  return {
    width,
    height,
    mask,
    exterior,
    outline,
    interior,
    core: open(interior, width, height),
    enclosed: mask.map((occupied, cell) => (!occupied && !exterior[cell] ? 1 : 0)),
    distance: distanceField(mask, outline, width, height),
  };
}
