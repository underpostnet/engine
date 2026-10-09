/**
 * The procedural context: the one boundary between Cyberia content and procedural generation. It
 * resolves a source item, its art direction, a Genesis Template and a profile into one frozen
 * context. A generator reads the context and the palette of a candidate and nothing else: it queries
 * no other source. Pure functions.
 *
 * @module src/projects/cyberia/procedural/context.js
 */
import { framesByDirection } from '../../../client/components/objectlayer-studio/RenderSource.js';
import { OBJECT_LAYER_DIRECTION_CODES } from '../../../client/components/objectlayer-studio/ObjectLayerProtocol.js';
import { compatibilityProblems, templateProblems } from './templates.js';

/**
 * The art direction of an item: what its foundation context says it looks like. `palettes` are the
 * palettes of that context, in its order: the colors its art brief names, then the palette of each
 * biome it belongs to. Each palette gives role → `#rrggbb` colors.
 * @param {Object|null} foundation - The foundation context of the item label.
 * @returns {{brief:Object|null,requiredVariants:string[],palettes:Array<{id:string,name:string,group:string,roles:Object<string,string[]>}>,references:Array<{field:string,id:string,name:string}>}|null}
 *   Null when the foundation holds no art brief and no palette for the item.
 */
export function extractArtDirection(foundation) {
  const artBrief = foundation?.visual?.artBrief ?? null;
  const palettes = foundation?.visual?.palettes ?? [];
  if (!artBrief && palettes.length === 0) return null;
  const { requiredVariants = [], ...brief } = artBrief ?? {};
  return {
    brief: artBrief ? brief : null,
    requiredVariants,
    palettes: palettes.map(({ id, name, group, roles }) => ({
      id,
      name,
      group,
      roles: Object.fromEntries(Object.entries(roles).map(([role, colors]) => [role, [colors].flat()])),
    })),
    references: (foundation.references ?? []).map(({ field, id, name }) => ({ field, id, name })),
  };
}

/**
 * The context of a run: what one generator batch reads about one source item.
 * @param {Object} params
 * @param {Object} params.source - The source item: `cid`, `data` (`item`, `stats`) and its decoded
 *   `renderSource`, null when it has none.
 * @param {Object} params.template - A resolved Genesis Template.
 * @param {Object} params.profile - A validated profile.
 * @param {Object|null} [params.artDirection] - {@link extractArtDirection} of the source.
 * @returns {Readonly<{source:Object,artDirection:Object|null,directions:string[],template:Object,profile:Object}>}
 * @throws {RangeError} When the template does not fit the profile, or the item does not fit them.
 */
export function resolveProceduralContext({ source, template, profile, artDirection = null }) {
  const { item, stats } = source.data;
  const problems = [
    ...templateProblems(template, profile).map((problem) => `template ${template.id}: ${problem}`),
    ...compatibilityProblems({ template, profile }, source.renderSource, item.type),
  ];
  if (problems.length > 0)
    throw new RangeError(`The source does not fit template ${template.id}: ${problems.join('; ')}`);
  const framesByCode = source.renderSource ? framesByDirection(source.renderSource) : null;
  const rendered = framesByCode && OBJECT_LAYER_DIRECTION_CODES.filter((code) => framesByCode[code].length > 0);
  return Object.freeze({
    source: Object.freeze({
      cid: source.cid,
      itemId: item.id,
      itemType: item.type,
      description: item.description,
      activable: item.activable,
      stats,
      renderSource: source.renderSource,
    }),
    artDirection,
    directions: rendered ?? Object.keys(template.directions),
    template,
    profile,
  });
}
