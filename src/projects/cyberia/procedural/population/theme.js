/**
 * The biome theme of a population: the colors of the biome palette a moderator applies to the
 * targets of a stage.
 *
 * The theme reads the base, outline and accent colors of the biome palette. Each base colors the
 * next art-direction role of the template, and the role derives its shadow and highlight from it. A
 * stage that rotates its theme gives each target the biome bases from another start, so its targets
 * differ. Pure functions.
 *
 * @module src/projects/cyberia/procedural/population/theme.js
 * @namespace CyberiaPopulationTheme
 */
import { foundationRoles } from '../palettes/resolver.js';
import { GENERATOR_ROLES } from '../templates.js';

const rotate = (colors, offset) => colors.map((_, at) => colors[(at + offset) % colors.length]);

/**
 * The palettes a theme reads: of each biome palette its bases, rotated by `offset`, its outline and its accent.
 * @param {Array<{id:string,name:string,group:string,roles:Object<string,string[]>}>} palettes - The palettes of the map.
 * @param {number} [offset]
 * @returns {Object[]}
 * @memberof CyberiaPopulationTheme
 */
export const themePalettes = (palettes, offset = 0) =>
  palettes.map(({ id, name, group, roles }) => ({
    id,
    name,
    group,
    roles: {
      base: rotate(roles.base ?? [], offset),
      ...(roles.outline && { outline: roles.outline }),
      ...(roles.accent && { accent: roles.accent }),
      ...(roles.special && { special: roles.special }),
    },
  }));

/**
 * The slots the biome theme gives one target of a stage: the base of each role the biome colors.
 * @param {Object} template - The resolved Genesis Template of the target.
 * @param {Object} params
 * @param {Object[]} params.palettes - The palettes of the map.
 * @param {number} [params.offset] - The rotation of the biome bases.
 * @returns {Object<string,string>} Slot id → `#rrggbb`.
 * @memberof CyberiaPopulationTheme
 */
export const themeSlots = (template, { palettes, offset = 0 }) =>
  Object.fromEntries(
    Object.entries(foundationRoles(template, themePalettes(palettes, offset))).map(([role, { base }]) => [
      GENERATOR_ROLES.includes(role) ? role : `${role}.base`,
      base,
    ]),
  );
