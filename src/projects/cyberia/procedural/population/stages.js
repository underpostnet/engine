/**
 * The stages of a map population: the item groups a moderator prepares. A generator stage names the
 * placed entities it reads, the item type it generates for them, the generator that runs it, and how
 * a biome palette colors its items. The `other` stage takes every canonical item type no generator
 * stage takes: a moderator authors those items in the Object Layer Studio. A new generator stage
 * takes its item type out of `other`. Stages are independent; `order` is the order a client lists them.
 *
 * @module src/projects/cyberia/procedural/population/stages.js
 * @namespace CyberiaPopulationStages
 */
import {
  ENTITY_TYPES,
  ENTITY_TYPE_TO_ITEM_TYPES,
  ITEM_TYPES,
} from '../../../../client/components/cyberia/SharedDefaultsCyberia.js';
import { requestError } from '../engine.js';
import { GENERATORS } from '../generator-registry.js';

/** The entity types a map places: a player enters a map, the map never places one. */
const PLACED_TYPES = Object.keys(ENTITY_TYPE_TO_ITEM_TYPES).filter(
  (type) => type !== ENTITY_TYPES.player && type !== ENTITY_TYPES.other_player,
);

const GENERATOR_STAGES = [
  {
    id: 'floor',
    name: 'Floors',
    entityTypes: [ENTITY_TYPES.floor],
    itemTypes: [ITEM_TYPES.floor],
    generatorId: 'floor-tile',
    rotatesTheme: false,
    description: 'Seamless ground tiles that join their neighbors.',
  },
  {
    id: 'npc-skin',
    name: 'NPC skins',
    entityTypes: [ENTITY_TYPES.bot],
    itemTypes: [ITEM_TYPES.skin],
    generatorId: 'skin-variant',
    rotatesTheme: true,
    description: 'Bot skins that idle and walk in four facings.',
  },
  {
    id: 'portal',
    name: 'Portals',
    entityTypes: [ENTITY_TYPES.portal],
    itemTypes: [ITEM_TYPES.portal],
    generatorId: 'portal-variant',
    rotatesTheme: true,
    description: 'Portal art that turns in three idle frames. Where a portal leads is set in the Instance Studio.',
  },
  {
    id: 'obstacle',
    name: 'Obstacles',
    entityTypes: [ENTITY_TYPES.obstacle],
    itemTypes: [ITEM_TYPES.obstacle],
    generatorId: 'obstacle-variant',
    rotatesTheme: true,
    description: 'Rock and rubble piles that block movement and shift in three idle frames.',
  },
];
const generated = new Set(GENERATOR_STAGES.flatMap(({ itemTypes }) => itemTypes));
const otherTypes = Object.values(ITEM_TYPES).filter((type) => !generated.has(type));

/**
 * The stages: `id` is stable, `order` is the list order. `rotatesTheme` gives each item the biome
 * colors from another start, so the items of one stage differ. `generatorId` is null where no
 * generator draws the items.
 * @memberof CyberiaPopulationStages
 */
export const STAGES = Object.freeze(
  [
    ...GENERATOR_STAGES,
    {
      id: 'other',
      name: 'Other',
      entityTypes: PLACED_TYPES.filter((type) => ENTITY_TYPE_TO_ITEM_TYPES[type].some((t) => otherTypes.includes(t))),
      itemTypes: otherTypes,
      generatorId: null,
      rotatesTheme: false,
      description: 'Items no generator draws yet: author each in the Object Layer Studio, or keep what it runs.',
    },
  ].map((stage, order) => {
    const generator = stage.generatorId && GENERATORS[stage.generatorId];
    if (
      stage.generatorId &&
      (!generator?.modes.includes('update-existing') || generator.itemType !== stage.itemTypes[0])
    )
      throw new Error(`Stage ${stage.id} needs a generator that updates ${stage.itemTypes[0]} items`);
    for (const entityType of stage.entityTypes)
      if (!ENTITY_TYPE_TO_ITEM_TYPES[entityType]?.some((type) => stage.itemTypes.includes(type)))
        throw new Error(`Stage ${stage.id}: a ${entityType} entity carries none of ${stage.itemTypes.join(', ')}`);
    return Object.freeze({
      ...stage,
      order,
      entityTypes: Object.freeze(stage.entityTypes),
      itemTypes: Object.freeze(stage.itemTypes),
    });
  }),
);

/**
 * The stage of an id.
 * @param {string} id
 * @returns {Object}
 * @throws {Error} 404 for an unknown stage.
 * @memberof CyberiaPopulationStages
 */
export function stageOf(id) {
  const stage = STAGES.find((entry) => entry.id === id);
  if (!stage) throw requestError(`There is no stage ${id}`, 404);
  return stage;
}
