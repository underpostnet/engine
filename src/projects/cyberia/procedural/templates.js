/**
 * Genesis Templates: the reusable visual starts of a generation. Cyberia content owns them; this
 * module reads them from the content artifact, verifies them and answers their geometry: the cells
 * of each region by direction, the protected cells and the base frame a template draws.
 *
 * A template holds a canvas, a region map per direction, the role of each region and the tones of
 * each role. It is not an item, a CID or a binding.
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

const ID_PATTERN = /^[a-z][a-z0-9]*\.[a-z0-9]+(-[a-z0-9]+)*$/;
const ROLE_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const REGION_PATTERN = /^[a-z][A-Za-z0-9]*$/;
const HEX_COLOR = /^#[0-9a-f]{6}$/;

const isCount = (value) => Number.isSafeInteger(value) && value > 0;

function checkRoles(template, legend, fail) {
  const regionRoles = {};
  const roles = {};
  for (const [role, { regions, tones, artDirection = false } = {}] of Object.entries(template.roles ?? {})) {
    if (!ROLE_PATTERN.test(role) || GENERATOR_ROLES.includes(role)) fail(`${role} is not a template role`);
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
  for (const [code, rows] of Object.entries(template.directions ?? {})) {
    if (!OBJECT_LAYER_DIRECTION_CODES.includes(code)) fail(`${code} is not a direction code`);
    if (!Array.isArray(rows) || rows.length !== height || rows.some((row) => typeof row !== 'string' || row.length !== width))
      fail(`direction ${code} needs ${height} rows of ${width} cells`);
    const cells = {};
    rows.forEach((row, y) =>
      [...row].forEach((letter, x) => {
        if (letter === '.') return;
        if (!legend[letter]) fail(`direction ${code} holds ${letter}, which is not in the legend`);
        (cells[legend[letter]] ??= []).push([x, y]);
      }),
    );
    directions[code] = cells;
  }
  if (Object.keys(directions).length === 0) fail('it needs at least one direction');
  return directions;
}

/**
 * A Genesis Template as content holds it, verified and resolved: the role of each region and the
 * cells of each region by direction code.
 * @param {Object} template - A Genesis Template of the content artifact.
 * @returns {{id:string,name:string,description:string,itemType:string,canvas:{width:number,height:number},
 *   frameDurationMs:number,outline:string,roles:Object<string,{regions:string[],tones:Object,artDirection:boolean}>,
 *   regionRoles:Object<string,string>,directions:Object<string,Object<string,Array<[number,number]>>>}}
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
 * What stops a template from serving a profile: its item type, a region the profile does not rank,
 * a direction the profile requires.
 * @param {Object} template - {@link resolveTemplate}.
 * @param {Object} profile - A validated profile.
 * @returns {string[]} One line per problem; empty when the template fits.
 */
export function templateProblems(template, profile) {
  const problems = [];
  if (template.itemType !== profile.itemType) problems.push(`it draws ${template.itemType}, not ${profile.itemType}`);
  const unranked = Object.keys(template.regionRoles).filter((region) => !profile.regionOrder.includes(region));
  if (unranked.length > 0) problems.push(`profile ${profile.profileId} does not rank ${unranked.join(', ')}`);
  for (const code of profile.constraints.requiredDirections)
    if (!template.directions[code]) problems.push(`it has no direction ${code}`);
  return problems;
}

/**
 * What stops an item from serving as the source or the result of a template and a profile: its item
 * type and, when it has a render, the canvas and the required directions of that render.
 * @param {{template:Object,profile:Object}} frame - A resolved template and a validated profile.
 * @param {Object|null} source - A decoded render source; null for an item with no render.
 * @param {string} itemType - The item type of the definition.
 * @returns {string[]} One line per problem; empty when the item fits.
 */
export function compatibilityProblems({ template, profile }, source, itemType) {
  const problems = [];
  if (itemType !== template.itemType) problems.push(`its item type is ${itemType}, not ${template.itemType}`);
  if (!source) return problems;
  const { width, height } = template.canvas;
  if (source.width !== width || source.height !== height)
    problems.push(`its canvas is ${source.width}×${source.height}, not ${width}×${height}`);
  for (const code of profile.constraints.requiredDirections)
    if (!getKeyframeDirectionsByCode(code).some((keyframe) => source.frames[keyframe]?.length > 0))
      problems.push(`it has no frame in direction ${code}`);
  return problems;
}

/**
 * The cells of the regions a profile protects in a direction: their shape stays as it is.
 * @param {Object} template - {@link resolveTemplate}.
 * @param {Object} profile - A validated profile.
 * @param {string} code - Direction code.
 * @returns {Array<[number,number]>}
 */
export const protectedCells = (template, profile, code) =>
  Object.entries(template.directions[code] ?? {})
    .filter(([region]) => profile.constraints.protectedRegions.includes(region))
    .flatMap(([, cells]) => cells);

/**
 * The base frame a template draws in a direction: each region in the base tone of its role, inside a
 * ring of the outline color.
 * @param {Object} template - {@link resolveTemplate}.
 * @param {string} code - A direction code of the template.
 * @returns {number[][][]} An rgba frame.
 */
export function drawTemplate(template, code) {
  const { width, height } = template.canvas;
  const owned = template.directions[code];
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
