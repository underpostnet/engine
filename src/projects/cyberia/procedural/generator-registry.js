/**
 * The generator registry of the Procedural Engine. A generator declares its id, the item type it
 * makes, the modes it supports, its default profile and its implementation: `parameters` checks the
 * parameters of a run, `prepare` analyzes a source once for a batch, `generate` makes one variant,
 * and `renderProblems`, where a generator has one, checks any revision of its item type, an edit too.
 * A new item type is a new entry; the jobs, the worker and the review flow do not change.
 *
 * @module src/projects/cyberia/procedural/generator-registry.js
 * @namespace CyberiaProceduralGenerators
 */
import { floorParameters, floorRenderProblems, generateFloorTile, prepareFloorBatch } from './generators/floor/generator.js';
import { generateSpriteVariant, prepareSpriteBatch, spriteParameters } from './generators/sprite/generator.js';

const sprite = Object.freeze({
  modes: Object.freeze(['update-existing', 'create-new']),
  parameters: spriteParameters,
  prepare: prepareSpriteBatch,
  generate: generateSpriteVariant,
});

/**
 * The generators a job may name: id → the registry entry.
 * @memberof CyberiaProceduralGenerators
 */
export const GENERATORS = Object.freeze({
  'skin-variant': Object.freeze({ ...sprite, id: 'skin-variant', itemType: 'skin', defaultProfile: 'skin-default' }),
  'portal-variant': Object.freeze({
    ...sprite,
    id: 'portal-variant',
    itemType: 'portal',
    defaultProfile: 'portal-default',
  }),
  'obstacle-variant': Object.freeze({
    ...sprite,
    id: 'obstacle-variant',
    itemType: 'obstacle',
    defaultProfile: 'obstacle-default',
  }),
  'floor-tile': Object.freeze({
    id: 'floor-tile',
    itemType: 'floor',
    modes: Object.freeze(['update-existing', 'create-new']),
    defaultProfile: 'floor-default',
    parameters: floorParameters,
    prepare: prepareFloorBatch,
    generate: generateFloorTile,
    renderProblems: floorRenderProblems,
  }),
});

/**
 * The generator of a run: the one the request names, else the first that makes the item type.
 * @param {Object} params
 * @param {string} [params.id] - The generator the request names.
 * @param {string} params.itemType
 * @param {string} params.mode
 * @returns {Object} The registry entry.
 * @throws {RangeError} When no generator makes the item type in the mode.
 * @memberof CyberiaProceduralGenerators
 */
export function resolveGenerator({ id, itemType, mode }) {
  const generator = id ? GENERATORS[id] : Object.values(GENERATORS).find((entry) => entry.itemType === itemType);
  if (!generator) throw new RangeError(id ? `Unknown generator ${id}` : `There is no generator for ${itemType}`);
  if (generator.itemType !== itemType) throw new RangeError(`Generator ${generator.id} makes ${generator.itemType}, not ${itemType}`);
  if (!generator.modes.includes(mode)) throw new RangeError(`Generator ${generator.id} does not run ${mode}`);
  return generator;
}
