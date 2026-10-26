/**
 * The resolutions of a target: how its artwork resolves. `keep` keeps the artwork it runs now,
 * `render` generates variants from that artwork, `template` builds new artwork from a Genesis
 * Template, and `author` uses a definition a moderator authors by hand. The content and the
 * generator registry tell what each item type supports; the artwork of a target tells the rest.
 * Each resolution comes with its availability and the reason when it is not available. Nothing
 * stores them: a client and a write read the same answer.
 *
 * @module src/projects/cyberia/procedural/population/resolution.js
 * @namespace CyberiaPopulationResolution
 */
import { requestError } from '../engine.js';
import { GENERATORS } from '../generator-registry.js';
import { usableTemplates } from '../spec.js';
import { genesisTemplates } from '../templates.js';
import { STAGES } from './stages.js';

/**
 * The resolutions, in the order a client lists them.
 * @constant {ReadonlyArray<string>}
 * @memberof CyberiaPopulationResolution
 */
export const RESOLUTIONS = Object.freeze(['keep', 'render', 'template', 'author']);

/**
 * The resolutions that generate entries.
 * @constant {ReadonlyArray<string>}
 * @memberof CyberiaPopulationResolution
 */
export const GENERATING = Object.freeze(['render', 'template']);

/**
 * What each item type of each stage supports: the Genesis Templates of the type, the ones the
 * generator of the stage serves under its default profile, and the modes of that generator.
 * @param {{CyberiaProceduralProfile:import('mongoose').Model}} models
 * @returns {Promise<Object<string,Object<string,{templates:string[],usable:string[],modes:string[]}>>>} Stage id → item type → support.
 * @memberof CyberiaPopulationResolution
 */
export async function itemSupport({ CyberiaProceduralProfile }) {
  const ids = (templates) => templates.map(({ id }) => id);
  return Object.fromEntries(
    await Promise.all(
      STAGES.map(async ({ id, generatorId, itemTypes }) => {
        const generator = generatorId ? GENERATORS[generatorId] : null;
        const profile = generator ? await CyberiaProceduralProfile.resolve(generator.defaultProfile) : null;
        const types = itemTypes.map((itemType) => [
          itemType,
          {
            templates: ids(genesisTemplates().filter((template) => template.itemType === itemType)),
            usable: profile ? ids(usableTemplates(itemType, profile)) : [],
            modes: generator ? [...generator.modes] : [],
          },
        ]);
        return [id, Object.fromEntries(types)];
      }),
    ),
  );
}

/**
 * What an item type offers at all, and why a target cannot take each resolution now. `keep` needs a
 * binding now; `render` a generator that makes variants, a Genesis Template it serves, and current
 * artwork with a render; `template` a Genesis Template of the type and a generator that builds from
 * it; `author` needs nothing. A type offers `render` only with a generator that makes variants, and
 * `template` only with a Genesis Template or a generator.
 */
function capabilities({ itemType, cid, hasRender, binding }, { templates, usable, modes }) {
  const none = `No Genesis Template exists for ${itemType} items`;
  const unserved = templates.length === 0 ? none : `No ${itemType} Genesis Template serves its generator`;
  const reasons = {
    keep: binding ? '' : 'The item runs no definition: there is no artwork to keep',
    render: !modes.includes('update-existing')
      ? `No generator makes variants of ${itemType} items`
      : usable.length === 0
        ? unserved
        : !cid
          ? 'There is no current artwork to generate from'
          : !hasRender
            ? 'The current artwork has no render frames'
            : '',
    template:
      templates.length === 0
        ? none
        : !modes.includes(cid ? 'update-existing' : 'create-new')
          ? `No generator builds ${itemType} items from a Genesis Template`
          : usable.length === 0
            ? unserved
            : '',
    author: '',
  };
  const offered = {
    keep: true,
    render: modes.includes('update-existing'),
    template: templates.length > 0 || modes.length > 0,
    author: true,
  };
  return { reasons, offered };
}

/**
 * The resolutions a target offers, each with its availability and the reason when it is not
 * available. A resolution its item type cannot offer at all is left out: an item no generator draws
 * and no Genesis Template serves offers `keep` and `author`.
 * @param {{itemType:string,cid:string|null,hasRender:boolean,binding:Object|null}} target - `cid` is
 *   the artwork the population read; `binding` is the one the item runs now.
 * @param {{templates:string[],usable:string[],modes:string[]}} support - {@link itemSupport} of its stage and type.
 * @returns {Array<{id:string,available:boolean,reason:string}>}
 * @memberof CyberiaPopulationResolution
 */
export function resolutionsOf(target, support) {
  const { reasons, offered } = capabilities(target, support);
  return RESOLUTIONS.filter((id) => offered[id]).map((id) => ({ id, available: !reasons[id], reason: reasons[id] }));
}

/**
 * The resolution that changes nothing the moderator did not ask for: an authored definition, else
 * the current artwork while it has a render or no template rebuilds it, else a Genesis Template,
 * else authoring by hand.
 * @param {{hasRender:boolean,definitionCid:string}} target
 * @param {Array<{id:string,available:boolean}>} resolutions - {@link resolutionsOf}.
 * @returns {string}
 * @memberof CyberiaPopulationResolution
 */
export function recommendedOf({ hasRender, definitionCid }, resolutions) {
  const available = (id) => resolutions.some((resolution) => resolution.id === id && resolution.available);
  if (definitionCid) return 'author';
  if (available('keep') && (hasRender || !available('template'))) return 'keep';
  return available('template') ? 'template' : 'author';
}

/**
 * Checks that a target takes a resolution now.
 * @param {string} itemId
 * @param {Object} target - See {@link resolutionsOf}.
 * @param {Object} support - See {@link resolutionsOf}.
 * @param {string} id - A resolution.
 * @returns {void}
 * @throws {Error} 400 with the reason it does not.
 * @memberof CyberiaPopulationResolution
 */
export function checkResolution(itemId, target, support, id) {
  if (!RESOLUTIONS.includes(id)) throw requestError(`${id} is not a resolution: ${RESOLUTIONS.join(', ')}`);
  const { reasons } = capabilities(target, support);
  if (reasons[id]) throw requestError(`${itemId} cannot take ${id}: ${reasons[id]}`);
}
