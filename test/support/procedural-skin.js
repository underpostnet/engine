'use strict';

/**
 * @module test/support/procedural-skin
 * @description A source skin for the Procedural Engine suites: the cells of the regions of a
 * Genesis Template, each region in a color of its own, inside a ring of outline. A change to any
 * region or to the contour shows.
 */

import { dilate, maskOfCells } from '../../src/projects/cyberia/procedural/core/morphology.js';
import { regionsOf } from '../../src/projects/cyberia/procedural/templates.js';
import { sourceFromDirectionFrames } from '../../src/client/components/objectlayer-studio/RenderSource.js';

/** The color of each region of the source skin. */
export const SKIN_COLORS = Object.freeze({
  hair: [90, 50, 20, 255],
  head: [230, 180, 150, 255],
  skin: [220, 170, 140, 255],
  torso: [40, 80, 160, 255],
  leftLeg: [60, 60, 60, 255],
  rightLeg: [70, 70, 70, 255],
});
export const SKIN_OUTLINE = Object.freeze([0, 0, 0, 255]);

/** A frame of a direction: the regions in their colors inside an outline ring. */
export const skinFrame = (template, code, index = 0) => {
  const { width, height } = template.canvas;
  const owned = regionsOf(template, code, index);
  const body = maskOfCells(Object.values(owned).flat(), width, height);
  const frame = Array.from({ length: height }, () => Array.from({ length: width }, () => [0, 0, 0, 0]));
  dilate(body, width, height).forEach((set, cell) => {
    if (set) frame[Math.floor(cell / width)][cell % width] = [...SKIN_OUTLINE];
  });
  for (const [region, cells] of Object.entries(owned))
    for (const [x, y] of cells) frame[y][x] = [...SKIN_COLORS[region]];
  return frame;
};

/**
 * @param {Object} template - A resolved Genesis Template.
 * @param {Object} [params]
 * @param {string[]} [params.codes] - Directions to fill, each with the frames the template draws.
 * @returns {{cid:string,data:{item:Object,stats:Object},renderSource:Object}}
 */
export const skinSource = (template, { codes = Object.keys(template.directions) } = {}) => ({
  cid: 'bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  data: {
    item: { id: 'base-skin', type: 'skin', description: 'a base', activable: true },
    stats: { effect: 1, agility: 4 },
  },
  renderSource: sourceFromDirectionFrames({
    framesByCode: Object.fromEntries(
      codes.map((code) => [code, template.directions[code].map((_, index) => skinFrame(template, code, index))]),
    ),
    frameDurationMs: 250,
  }),
});

/** The same item with no render. */
export const bareSkin = (template) => ({ ...skinSource(template), renderSource: null });
