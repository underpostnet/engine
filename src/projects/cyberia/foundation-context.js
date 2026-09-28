/**
 * The foundation context of the authoring editors: a bounded bundle for one definition, one item
 * label or one map, resolved from the context index of the content artifact.
 *
 * A bundle holds the target in full and every related definition as a summary. A client expands a
 * summary with a second request, so no request walks the whole graph. Every bundle is read-only.
 *
 * @module src/projects/cyberia/foundation-context.js
 * @namespace CyberiaFoundationContext
 */
import { trackComposition } from '../../client/components/cyberia/MapPlacementCyberia.js';
import { contentArtifact } from './content-artifact.js';

const kindOf = (id) => id.slice(0, id.indexOf('.'));

/** Hex colors a free-text palette direction names, in order, once each. */
const namedColors = (text = '') => [...new Set((text.match(/#[0-9a-f]{6}\b/gi) ?? []).map((hex) => hex.toLowerCase()))];

/**
 * The definition summaries and resolvers of one context index.
 * @param {Object} index - `contentArtifact().context`.
 */
function resolverOf(index) {
  const labels = new Map(Object.entries(index.labels).map(([itemId, id]) => [id, itemId]));
  const summary = (id) => {
    const definition = index.definitions[id];
    if (!definition) return null;
    const label = labels.get(id);
    return {
      id,
      kind: kindOf(id),
      name: definition.name,
      source: index.sources[id],
      ...(label ? { label } : {}),
    };
  };
  const withField = (entries = []) => entries.map(({ field, id }) => ({ field, ...summary(id) }));
  const biomePalette = (biome) => ({ id: biome.id, name: biome.name, group: 'biome', roles: biome.palette });

  /** The biomes, regions and layer a definition belongs to: its locations, or the maps that place it. */
  const world = (definition, usage) => {
    const locations = definition.locations ?? [];
    const biomeIds = new Set([
      ...(kindOf(definition.id) === 'biome' ? [definition.id] : []),
      ...(definition.biome ? [definition.biome] : []),
      ...locations.filter((id) => kindOf(id) === 'biome'),
      ...(locations.some((id) => kindOf(id) === 'biome') ? [] : usage.map(({ biome }) => biome).filter(Boolean)),
    ]);
    const biomes = [...biomeIds].map((id) => index.definitions[id]).filter(Boolean);
    const regionIds = new Set([
      ...biomes.map(({ region }) => region),
      ...locations.filter((id) => kindOf(id) === 'region'),
      ...(kindOf(definition.id) === 'region' ? [definition.id] : []),
    ]);
    const regions = [...regionIds].map((id) => index.definitions[id]).filter(Boolean);
    return {
      biomes: biomes.map((biome) => ({
        ...summary(biome.id),
        ambience: biome.ambience,
        region: summary(biome.region),
      })),
      regions: regions.map((region) => ({
        ...summary(region.id),
        layer: region.layer,
        description: region.description,
      })),
      palettes: biomes.filter(({ palette }) => palette).map(biomePalette),
    };
  };

  /** Each map that composes a definition, with how many it places. */
  const usageOf = (id) =>
    (index.referencedBy[id] ?? [])
      .filter(({ field }) => field === 'composition.entity')
      .map(({ id: mapId }) => {
        const map = index.definitions[mapId];
        return {
          map: summary(mapId),
          biome: map.biome,
          count: map.composition.find(({ entity }) => entity === id).count,
        };
      });

  /** The entity types that carry a definition: its own, and each whose item ids name its label. */
  const entityTypesOf = (id) => {
    const label = labels.get(id);
    return [
      ...new Set([
        ...(index.entities[id] ? [index.entities[id].entityType] : []),
        ...Object.values(index.entities)
          .filter(({ objectLayerItemIds }) => label && objectLayerItemIds.includes(label))
          .map(({ entityType }) => entityType),
      ]),
    ].sort();
  };

  return { summary, withField, world, usageOf, biomePalette, entityTypesOf };
}

/** The Object Layer item type of a definition, when it has one. */
const itemTypeOf = (definition) => (definition.objectLayer ? { itemType: definition.objectLayer.itemType } : {});

/**
 * The context of one definition: the definition in full, its item type and the entity types that
 * carry it, its visual guide, its world, the maps that place it, what stands with it there, and
 * every reference in both directions.
 * @param {string} id - Definition id.
 * @param {Object} [index] - Context index; the artifact's by default.
 * @returns {Object|null} Null when no definition has the id.
 * @memberof CyberiaFoundationContext
 */
export function definitionContext(id, index = contentArtifact().context) {
  const definition = index.definitions[id];
  if (!definition) return null;
  const { summary, withField, world, usageOf, entityTypesOf } = resolverOf(index);
  const usage = usageOf(id);
  const place = world(definition, usage);
  const related = {};
  for (const { map } of usage)
    for (const { entity } of index.definitions[map.id].composition)
      if (entity !== id) related[kindOf(entity)] = [...new Set([...(related[kindOf(entity)] ?? []), entity])];
  const foundationColors = namedColors(definition.artBrief?.paletteDirection);
  return {
    ...summary(id),
    description: definition.description,
    role: definition.role,
    ...itemTypeOf(definition),
    entityTypes: entityTypesOf(id),
    ...(index.entities[id] ? { entity: index.entities[id] } : {}),
    definition,
    visual: {
      ...(definition.artBrief ? { artBrief: definition.artBrief } : {}),
      palettes: [
        ...(foundationColors.length
          ? [{ id, name: definition.name, group: 'foundation', roles: { base: foundationColors } }]
          : []),
        ...place.palettes,
      ],
    },
    world: { biomes: place.biomes, regions: place.regions },
    usage,
    related: Object.fromEntries(Object.entries(related).map(([kind, ids]) => [kind, ids.map(summary).filter(Boolean)])),
    references: withField(index.references[id]),
    referencedBy: withField(index.referencedBy[id]),
  };
}

/**
 * The context of an item label: the context of the definition it labels.
 * @param {string} itemId
 * @param {Object} [index]
 * @returns {Object|null} Null when no definition carries the label.
 * @memberof CyberiaFoundationContext
 */
export const itemContext = (itemId, index = contentArtifact().context) =>
  index.labels[itemId] ? definitionContext(index.labels[itemId], index) : null;

/**
 * The context of a map as the editor holds it: its definition, world and palette, the portals that
 * reach it, and its composition tracked against the entities it stores: each composed entity with
 * its item ids, the item type of each, and how many the map holds.
 * @param {Object} params
 * @param {string} params.code - Map code.
 * @param {Object} [params.map] - The stored map: `name`, `description`, `entities`.
 * @param {Object[]} [params.instances] - Instances whose portals name the map: `{ code, portals }`.
 * @param {Object} [index]
 * @returns {Object} The map context. A map no definition composes has no composition.
 * @memberof CyberiaFoundationContext
 */
export function mapContext({ code, map = {}, instances = [] }, index = contentArtifact().context) {
  const { summary, world, biomePalette } = resolverOf(index);
  const id = `map.${code}`;
  const definition = index.definitions[id] ?? null;
  const itemTypeOfLabel = (itemId) => index.definitions[index.labels[itemId]]?.objectLayer?.itemType;
  const composition = trackComposition(
    (definition?.composition ?? []).map(({ entity: entityId }) => {
      const entity = index.entities[entityId];
      return {
        ...summary(entityId),
        entity,
        items: entity.objectLayerItemIds.map((itemId) => ({ id: itemId, type: itemTypeOfLabel(itemId) })),
      };
    }),
    map.entities ?? [],
  );
  const biome = definition ? index.definitions[definition.biome] : null;
  const place = definition ? world(definition, []) : { biomes: [], regions: [] };
  return {
    code,
    definition: definition ? summary(id) : null,
    name: definition?.name ?? map.name ?? code,
    description: definition?.description ?? map.description ?? '',
    role: definition?.role ?? '',
    world: { biomes: place.biomes, regions: place.regions },
    palettes: biome?.palette ? [biomePalette(biome)] : [],
    composition,
    portals: instances.flatMap((instance) =>
      (instance.portals ?? [])
        .filter(({ sourceMapCode, targetMapCode }) => sourceMapCode === code || targetMapCode === code)
        .map((portal) => ({
          instanceCode: instance.code,
          direction: portal.sourceMapCode === code ? 'out' : 'in',
          ...portal,
        })),
    ),
  };
}
