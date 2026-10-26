/**
 * Genesis Templates: the reusable visual starts of a generation. Cyberia content owns them; this
 * module reads them from the content artifact, verifies them and answers their geometry: the cells
 * of each region by frame and direction, the protected cells, the base frame a template draws and
 * the place of its regions on a render.
 *
 * A template holds a canvas, the frames of each direction as region maps, the role of each region,
 * and the palette role and the tones of each role. It is not an item, a CID or a binding.
 *
 * @module src/projects/cyberia/procedural/templates.js
 */
import {
  OBJECT_LAYER_DIRECTION_CODES,
  getKeyframeDirectionsByCode,
} from '../../../client/components/objectlayer-studio/ObjectLayerProtocol.js';
import { hexToRgba } from '../../../client/components/objectlayer-studio/RenderSource.js';
import { contentArtifact } from '../content/content-artifact.js';
import { dilate, maskOfCells } from './core/morphology.js';

/** The tones of a template role. */
export const TONES = Object.freeze(['shadow', 'base', 'highlight']);

/** The roles every generator colors besides the roles of a template. */
export const GENERATOR_ROLES = Object.freeze(['outline', 'accent']);

/** The palette roles a template role takes its palette color from. */
export const PALETTE_ROLES = Object.freeze(['primary', 'secondary', 'detail', 'feature']);

const ID_PATTERN = /^[a-z][a-z0-9]*\.[a-z0-9]+(-[a-z0-9]+)*$/;
const ROLE_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const REGION_PATTERN = /^[a-z][A-Za-z0-9]*$/;
const HEX_COLOR = /^#[0-9a-f]{6}$/;

const isCount = (value) => Number.isSafeInteger(value) && value > 0;

function checkRoles(template, legend, fail) {
  const regionRoles = {};
  const roles = {};
  for (const [role, { regions, palette, tones, artDirection = false } = {}] of Object.entries(template.roles ?? {})) {
    if (!ROLE_PATTERN.test(role) || GENERATOR_ROLES.includes(role)) fail(`${role} is not a template role`);
    if (!PALETTE_ROLES.includes(palette)) fail(`role ${role} takes no palette role of ${PALETTE_ROLES.join(', ')}`);
    if (!Array.isArray(regions) || regions.length === 0) fail(`role ${role} needs regions`);
    if (!TONES.every((tone) => HEX_COLOR.test(tones?.[tone] ?? '')))
      fail(`role ${role} needs the tones ${TONES.join(', ')} as #rrggbb`);
    for (const region of regions) {
      if (!Object.values(legend).includes(region)) fail(`region ${region} of role ${role} is not in the legend`);
      if (regionRoles[region]) fail(`region ${region} is in roles ${regionRoles[region]} and ${role}`);
      regionRoles[region] = role;
    }
    roles[role] = {
      regions: [...regions],
      palette,
      tones: Object.fromEntries(TONES.map((tone) => [tone, tones[tone]])),
      artDirection: artDirection === true,
    };
  }
  if (Object.keys(roles).length === 0) fail('it needs at least one role');
  for (const region of Object.values(legend)) if (!regionRoles[region]) fail(`region ${region} is in no role`);
  return { roles, regionRoles };
}

function checkDirections(template, legend, fail) {
  const { width, height } = template.canvas;
  const directions = {};
  for (const [code, frames] of Object.entries(template.directions ?? {})) {
    if (!OBJECT_LAYER_DIRECTION_CODES.includes(code)) fail(`${code} is not a direction code`);
    if (!Array.isArray(frames) || frames.length === 0) fail(`direction ${code} needs a list of frames`);
    directions[code] = frames.map((rows, index) => {
      if (
        !Array.isArray(rows) ||
        rows.length !== height ||
        rows.some((row) => typeof row !== 'string' || row.length !== width)
      )
        fail(`frame ${index} of direction ${code} needs ${height} rows of ${width} cells`);
      const cells = {};
      rows.forEach((row, y) =>
        [...row].forEach((letter, x) => {
          if (letter === '.') return;
          if (!legend[letter]) fail(`frame ${index} of direction ${code} holds ${letter}, which is not in the legend`);
          (cells[legend[letter]] ??= []).push([x, y]);
        }),
      );
      return cells;
    });
  }
  if (Object.keys(directions).length === 0) fail('it needs at least one direction');
  return directions;
}

/**
 * A Genesis Template as content holds it, verified and resolved: the role of each region and, for
 * each direction code, its frames in play order, each the cells of each region.
 * @param {Object} template - A Genesis Template of the content artifact.
 * @returns {{id:string,name:string,description:string,itemType:string,canvas:{width:number,height:number},
 *   frameDurationMs:number,outline:string,roles:Object<string,{regions:string[],palette:string,tones:Object,artDirection:boolean}>,
 *   regionRoles:Object<string,string>,directions:Object<string,Array<Object<string,Array<[number,number]>>>>}}
 * @throws {RangeError} When the template breaks the structure.
 */
export function resolveTemplate(template) {
  const fail = (message) => {
    throw new RangeError(`Genesis Template ${template?.id}: ${message}`);
  };
  if (typeof template?.id !== 'string' || !ID_PATTERN.test(template.id) || !template.id.startsWith(`${template.itemType}.`))
    fail('its id must be <itemType>.<slug>');
  if (!isCount(template.canvas?.width) || !isCount(template.canvas?.height))
    fail('canvas needs a positive integer width and height');
  if (!isCount(template.frameDurationMs)) fail('frameDurationMs must be a positive integer');
  if (!HEX_COLOR.test(template.outline ?? '')) fail('outline must be #rrggbb');
  const legend = template.legend ?? {};
  const regionIds = Object.values(legend);
  if (
    regionIds.length === 0 ||
    Object.keys(legend).some((letter) => letter.length !== 1 || letter === '.') ||
    !regionIds.every((region) => REGION_PATTERN.test(region)) ||
    new Set(regionIds).size !== regionIds.length
  )
    fail('legend maps one letter to each region id, once each');
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    itemType: template.itemType,
    canvas: { width: template.canvas.width, height: template.canvas.height },
    frameDurationMs: template.frameDurationMs,
    outline: template.outline,
    ...checkRoles(template, legend, fail),
    directions: checkDirections(template, legend, fail),
  };
}

/**
 * Every Genesis Template the served content holds, as the content holds it.
 * @returns {ReadonlyArray<Object>}
 * @throws {Error} When the content artifact cannot be read.
 */
export const genesisTemplates = () => contentArtifact().procedural.templates;

/**
 * One Genesis Template of the served content, as the content holds it.
 * @param {string} id
 * @returns {Object}
 * @throws {RangeError} When the content holds no such template.
 */
export function genesisTemplate(id) {
  const found = genesisTemplates().find((template) => template.id === id);
  if (!found) throw new RangeError(`There is no Genesis Template ${id}`);
  return found;
}

/**
 * What stops a template from serving a profile: its item type, or a region the profile does not
 * rank. Its frames and direction codes are the author's choice.
 * @param {Object} template - {@link resolveTemplate}.
 * @param {Object} profile - A validated profile.
 * @returns {string[]} One line per problem; empty when the template fits.
 */
export function templateProblems(template, profile) {
  const problems = [];
  if (template.itemType !== profile.itemType) problems.push(`it draws ${template.itemType}, not ${profile.itemType}`);
  const unranked = Object.keys(template.regionRoles).filter((region) => !profile.regionOrder.includes(region));
  if (unranked.length > 0) problems.push(`profile ${profile.profileId} does not rank ${unranked.join(', ')}`);
  return problems;
}

/**
 * What stops an item from serving as the source or the result of a template: its item type, and a
 * render with no frame. The regions of a template take their place on a render of any canvas.
 * @param {Object} template - A resolved template.
 * @param {Object|null} source - A decoded render source; null for an item with no render.
 * @param {string} itemType - The item type of the definition.
 * @returns {string[]} One line per problem; empty when the item fits.
 */
export function compatibilityProblems(template, source, itemType) {
  const problems = [];
  if (itemType !== template.itemType) problems.push(`its item type is ${itemType}, not ${template.itemType}`);
  if (
    source &&
    !OBJECT_LAYER_DIRECTION_CODES.some((code) =>
      getKeyframeDirectionsByCode(code).some((keyframe) => source.frames[keyframe]?.length > 0),
    )
  )
    problems.push('its render has no frame');
  return problems;
}

/**
 * The region map of one frame of a direction: its own frame, else the last frame the template draws.
 * @param {Object} template - {@link resolveTemplate}.
 * @param {string} code - Direction code.
 * @param {number} index - Frame index.
 * @returns {Object<string,Array<[number,number]>>|undefined} Undefined for a direction the template does not draw.
 */
export const regionsOf = (template, code, index) => {
  const frames = template.directions[code];
  return frames?.[Math.min(index, frames.length - 1)];
};

/**
 * The cells of the regions a profile protects in a region map: their shape stays as it is.
 * @param {Object<string,Array<[number,number]>>} owned - A region map.
 * @param {Object} profile - A validated profile.
 * @returns {Array<[number,number]>}
 */
export const protectedCells = (owned, profile) =>
  Object.entries(owned)
    .filter(([region]) => profile.constraints.protectedRegions.includes(region))
    .flatMap(([, cells]) => cells);

/** The bounding box of some cells. */
const boxOf = (cells) => ({
  left: Math.min(...cells.map(([x]) => x)),
  right: Math.max(...cells.map(([x]) => x)),
  bottom: Math.max(...cells.map(([, y]) => y)),
});

/**
 * A region map placed on a frame: moved so that its regions stand where the interior of the frame
 * stands, bottom on bottom and centre on centre. Cells off the frame go.
 * @param {Object<string,Array<[number,number]>>} owned - A region map of a template.
 * @param {{width:number,height:number,interior:Uint8Array}} analysis - The analysis of the frame.
 * @returns {Object<string,Array<[number,number]>>}
 */
export function placeRegions(owned, { width, height, interior }) {
  const inside = [];
  interior.forEach((set, cell) => set && inside.push([cell % width, Math.floor(cell / width)]));
  const cells = Object.values(owned).flat();
  if (inside.length === 0 || cells.length === 0) return owned;
  const from = boxOf(cells);
  const to = boxOf(inside);
  const dx = Math.round((to.left + to.right - from.left - from.right) / 2);
  const dy = to.bottom - from.bottom;
  if (dx === 0 && dy === 0) return owned;
  return Object.fromEntries(
    Object.entries(owned).map(([region, list]) => [
      region,
      list.map(([x, y]) => [x + dx, y + dy]).filter(([x, y]) => x >= 0 && y >= 0 && x < width && y < height),
    ]),
  );
}

/**
 * The base frame a template draws for a frame of a direction: each region in the base tone of its
 * role, inside a ring of the outline color.
 * @param {Object} template - {@link resolveTemplate}.
 * @param {string} code - A direction code of the template.
 * @param {number} [index] - The frame index.
 * @returns {number[][][]} An rgba frame.
 */
export function drawTemplate(template, code, index = 0) {
  const { width, height } = template.canvas;
  const owned = regionsOf(template, code, index);
  const ring = dilate(maskOfCells(Object.values(owned).flat(), width, height), width, height);
  const frame = Array.from({ length: height }, () => Array.from({ length: width }, () => [0, 0, 0, 0]));
  const paint = (hex) => [...hexToRgba(hex).slice(0, 3), 255];
  ring.forEach((set, cell) => {
    if (set) frame[Math.floor(cell / width)][cell % width] = paint(template.outline);
  });
  for (const [region, cells] of Object.entries(owned))
    for (const [x, y] of cells) frame[y][x] = paint(template.roles[template.regionRoles[region]].tones.base);
  return frame;
}
