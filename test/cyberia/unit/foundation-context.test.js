import { describe, it, expect } from 'vitest';
import { contentArtifact, hasContentArtifact } from '../../../src/projects/cyberia/content-artifact.js';
import { definitionContext, itemContext, mapContext } from '../../../src/projects/cyberia/foundation-context.js';

const brief = (paletteDirection) => ({
  silhouette: 'A shape.',
  detail: 'Its detail.',
  distinctiveFeatures: ['one feature'],
  paletteDirection,
  spriteScale: 'One cell.',
  requiredVariants: ['idle'],
});
const PALETTE = { base: ['#44aa44'], shadow: ['#226622'], highlight: ['#88dd88'], outline: ['#112211'] };

// A context index as cyberia-content compiles it: a biome, what stands in it, and one map.
const DEFINITIONS = {
  'region.home': { id: 'region.home', name: 'Home', description: 'The home region.', role: 'r', layer: 'physical' },
  'biome.meadow': {
    id: 'biome.meadow',
    name: 'Meadow',
    description: 'Grass.',
    role: 'r',
    region: 'region.home',
    ambience: 'Calm.',
    palette: PALETTE,
  },
  'floor.grass': {
    id: 'floor.grass',
    name: 'Grass',
    description: 'Green ground.',
    role: 'The ground.',
    locations: ['biome.meadow'],
    artBrief: brief('Greens #44aa44 and #88DD88, no blue.'),
    objectLayer: { itemType: 'floor' },
  },
  'structure.wall': {
    id: 'structure.wall',
    name: 'Wall',
    description: 'A wall.',
    role: 'r',
    locations: ['biome.meadow'],
    artBrief: brief('Grey.'),
    objectLayer: { itemType: 'obstacle' },
  },
  'skin.walker': {
    id: 'skin.walker',
    name: 'Walker',
    description: 'A look.',
    role: 'r',
    objectLayer: { itemType: 'skin' },
  },
  'character.walker': {
    id: 'character.walker',
    name: 'Walker',
    description: 'A walker.',
    role: 'r',
    locations: ['region.home'],
    loadout: ['skin.walker'],
  },
  'map.glade': {
    id: 'map.glade',
    name: 'Glade',
    description: 'A glade.',
    role: 'The hub.',
    biome: 'biome.meadow',
    composition: [
      { entity: 'floor.grass', count: 1 },
      { entity: 'structure.wall', count: 3 },
      { entity: 'character.walker', count: 1 },
    ],
  },
};
const REFERENCES = {
  'biome.meadow': [{ field: 'region', id: 'region.home' }],
  'floor.grass': [{ field: 'locations', id: 'biome.meadow' }],
  'structure.wall': [{ field: 'locations', id: 'biome.meadow' }],
  'character.walker': [
    { field: 'locations', id: 'region.home' },
    { field: 'loadout', id: 'skin.walker' },
  ],
  'map.glade': [
    { field: 'biome', id: 'biome.meadow' },
    { field: 'composition.entity', id: 'floor.grass' },
    { field: 'composition.entity', id: 'structure.wall' },
    { field: 'composition.entity', id: 'character.walker' },
  ],
};
const referencedBy = {};
for (const [id, references] of Object.entries(REFERENCES))
  for (const { field, id: target } of references) (referencedBy[target] ??= []).push({ field, id });
const INDEX = {
  definitions: DEFINITIONS,
  sources: Object.fromEntries(Object.keys(DEFINITIONS).map((id) => [id, 'foundation'])),
  labels: { grass: 'floor.grass', wall: 'structure.wall', walker: 'skin.walker' },
  entities: {
    'floor.grass': { entityType: 'floor', objectLayerItemIds: ['grass'] },
    'structure.wall': { entityType: 'obstacle', objectLayerItemIds: ['wall'] },
    'character.walker': { entityType: 'bot', objectLayerItemIds: ['walker'] },
  },
  references: REFERENCES,
  referencedBy,
};

describe('definition context', () => {
  it('holds the definition, its visual guide, world, usage and related content', () => {
    const context = definitionContext('floor.grass', INDEX);
    expect(context).toMatchObject({
      id: 'floor.grass',
      kind: 'floor',
      name: 'Grass',
      label: 'grass',
      source: 'foundation',
      role: 'The ground.',
      entity: { entityType: 'floor', objectLayerItemIds: ['grass'] },
      definition: DEFINITIONS['floor.grass'],
    });
    expect(context.visual.artBrief.silhouette).toBe('A shape.');
    expect(context.visual.palettes).toEqual([
      { id: 'floor.grass', name: 'Grass', group: 'foundation', roles: { base: ['#44aa44', '#88dd88'] } },
      { id: 'biome.meadow', name: 'Meadow', group: 'biome', roles: PALETTE },
    ]);
    expect(context.world.biomes).toEqual([
      expect.objectContaining({ id: 'biome.meadow', region: expect.objectContaining({ id: 'region.home' }) }),
    ]);
    expect(context.world.regions.map(({ id, layer }) => [id, layer])).toEqual([['region.home', 'physical']]);
    expect(context.usage).toEqual([
      { map: expect.objectContaining({ id: 'map.glade', name: 'Glade' }), biome: 'biome.meadow', count: 1 },
    ]);
    expect(context.related).toEqual({
      structure: [expect.objectContaining({ id: 'structure.wall', label: 'wall' })],
      character: [expect.objectContaining({ id: 'character.walker' })],
    });
    expect(context.referencedBy).toEqual([
      expect.objectContaining({ field: 'composition.entity', id: 'map.glade', kind: 'map' }),
    ]);
  });

  it('names the item type of a definition and the entity types that carry it', () => {
    expect(definitionContext('floor.grass', INDEX)).toMatchObject({ itemType: 'floor', entityTypes: ['floor'] });
    expect(definitionContext('skin.walker', INDEX)).toMatchObject({ itemType: 'skin', entityTypes: ['bot'] });
    const walker = definitionContext('character.walker', INDEX);
    expect(walker.entityTypes).toEqual(['bot']);
    expect(walker).not.toHaveProperty('itemType');
  });

  it('places a definition without a biome location through the maps that compose it', () => {
    const context = definitionContext('character.walker', INDEX);
    expect(context.world.biomes.map(({ id }) => id)).toEqual(['biome.meadow']);
    expect(context.references).toContainEqual(expect.objectContaining({ field: 'loadout', id: 'skin.walker' }));
  });

  it('answers an item label, and nothing for a label no definition carries', () => {
    expect(itemContext('grass', INDEX).id).toBe('floor.grass');
    expect(itemContext('nothing', INDEX)).toBe(null);
    expect(definitionContext('floor.none', INDEX)).toBe(null);
  });
});

describe('map context', () => {
  const at = (x, y, entityType, objectLayerItemIds) => ({ entityType, objectLayerItemIds, initCellX: x, initCellY: y });
  const stored = {
    entities: [
      at(0, 0, 'floor', ['grass']),
      at(4, 4, 'obstacle', ['wall']),
      at(6, 4, 'obstacle', ['wall']),
      at(1, 1, 'static', ['lamp']),
    ],
  };

  it('tracks each composed entity: its item ids, the item type of each, and how many the map holds', () => {
    const context = mapContext({ code: 'glade', map: stored }, INDEX);
    const entry = (id) => context.composition.find((item) => item.id === id);
    expect(entry('floor.grass')).toMatchObject({ placed: 1, items: [{ id: 'grass', type: 'floor' }] });
    expect(entry('structure.wall')).toMatchObject({
      entity: { entityType: 'obstacle', objectLayerItemIds: ['wall'] },
      placed: 2,
      items: [{ id: 'wall', type: 'obstacle' }],
    });
    expect(entry('character.walker')).toMatchObject({ placed: 0, items: [{ id: 'walker', type: 'skin' }] });
    expect(context.palettes).toEqual([{ id: 'biome.meadow', name: 'Meadow', group: 'biome', roles: PALETTE }]);
  });

  it('names the portals that reach the map, in both directions', () => {
    const instances = [
      {
        code: 'W',
        portals: [
          { sourceMapCode: 'glade', targetMapCode: 'cave', portalMode: 'inter-portal' },
          { sourceMapCode: 'cave', targetMapCode: 'glade', portalMode: 'inter-random' },
          { sourceMapCode: 'cave', targetMapCode: 'hill', portalMode: 'inter-portal' },
        ],
      },
    ];
    const { portals } = mapContext({ code: 'glade', map: stored, instances }, INDEX);
    expect(portals.map(({ instanceCode, direction, portalMode }) => [instanceCode, direction, portalMode])).toEqual([
      ['W', 'out', 'inter-portal'],
      ['W', 'in', 'inter-random'],
    ]);
  });

  it('tracks nothing for a map no definition composes', () => {
    const context = mapContext({ code: 'custom', map: { name: 'Custom', entities: stored.entities } }, INDEX);
    expect(context).toMatchObject({ definition: null, name: 'Custom', composition: [] });
  });
});

// The context of the workspace artifact, discovered from its index: no id is named here.
describe.skipIf(!hasContentArtifact())('the workspace foundation context', () => {
  it('finds, for every composed floor, its definition, art brief, biome and the maps that place it', () => {
    const index = contentArtifact().context;
    const floors = Object.keys(index.entities).filter(
      (id) => index.entities[id].entityType === 'floor' && (index.referencedBy[id] ?? []).length > 0,
    );
    expect(floors.length).toBeGreaterThan(0);
    for (const id of floors) {
      const [label] = index.entities[id].objectLayerItemIds;
      const context = itemContext(label);
      const maps = index.referencedBy[id]
        .filter(({ field }) => field === 'composition.entity')
        .map(({ id: map }) => map);
      expect(context.id).toBe(id);
      expect(context.visual.artBrief.silhouette.length).toBeGreaterThan(0);
      expect(context.world.biomes.length).toBeGreaterThan(0);
      expect(context.visual.palettes.some(({ group }) => group === 'biome')).toBe(true);
      expect(context.usage.map(({ map }) => map.id)).toEqual(maps);
      for (const map of maps) {
        const { composition } = mapContext({ code: map.slice(map.indexOf('.') + 1) });
        expect(composition.some((entry) => entry.id === id && entry.placed === 0)).toBe(true);
      }
    }
  });
});
