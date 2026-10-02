import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/client/services/cyberia-saga/cyberia-saga.service.js', () => ({ CyberiaSagaService: {} }));

const { itemContextPanel, mapContextPanel } =
  await import('../../../src/client/components/cyberia/FoundationContextCyberia.js');

const PALETTE = { base: ['#44aa44'], shadow: ['#226622'] };
const MEADOW = { id: 'biome.meadow', name: 'Meadow', group: 'biome', roles: PALETTE };
const WORLD = {
  biomes: [{ id: 'biome.meadow', name: 'Meadow', ambience: 'Calm.' }],
  regions: [{ id: 'region.home', name: 'Home', layer: 'physical', description: 'Home.' }],
};
const item = {
  id: 'floor.grass',
  kind: 'floor',
  name: 'Grass',
  label: 'grass',
  source: 'foundation',
  sagas: [],
  description: 'Green ground.',
  role: 'The ground.',
  itemType: 'floor',
  entityTypes: ['floor'],
  definition: { id: 'floor.grass' },
  visual: {
    artBrief: {
      silhouette: 'Flat.',
      detail: 'Blades.',
      distinctiveFeatures: ['tufts'],
      paletteDirection: 'Greens.',
      requiredVariants: ['a', 'b'],
    },
    palettes: [MEADOW],
  },
  world: WORLD,
  usage: [{ map: { id: 'map.glade', name: 'Glade' }, count: 1 }],
  related: { structure: [{ id: 'structure.wall', name: 'Wall' }] },
  references: [{ field: 'locations', id: 'biome.meadow', name: 'Meadow' }],
  referencedBy: [{ field: 'composition.entity', id: 'map.glade', name: 'Glade' }],
};
const map = {
  code: 'glade',
  definition: { id: 'map.glade', name: 'Glade' },
  name: 'Glade',
  description: 'A clearing.',
  role: 'The first map.',
  sagas: ['the-last-signal'],
  world: WORLD,
  palettes: [MEADOW],
  composition: [
    { id: 'floor.grass', entity: { entityType: 'floor' } },
    { id: 'structure.wall', entity: { entityType: 'obstacle' } },
    { id: 'floor.moss', entity: { entityType: 'floor' } },
  ],
  portals: [
    {
      instanceCode: 'home',
      direction: 'out',
      sourceMapCode: 'glade',
      targetMapCode: 'cave',
      portalMode: 'inter-portal',
    },
    {
      instanceCode: 'home',
      direction: 'in',
      sourceMapCode: 'town',
      targetMapCode: 'glade',
      portalMode: 'inter-random',
    },
  ],
};
const sectionIds = (panel) => panel.sections.map(({ id }) => id);
const section = (panel, id) => panel.sections.find((entry) => entry.id === id);

describe('the foundation context panel of an item', () => {
  it('turns a foundation context into sections an artist reads while painting', () => {
    const panel = itemContextPanel(item);
    expect(panel.title).toBe('Grass');
    expect(panel.subtitle).toBe('floor · grass');
    expect(panel.badges).toEqual([]);
    expect(panel.kind).toBe('floor');
    expect(sectionIds(panel)).toEqual([
      'definition',
      'visual',
      'palette',
      'biome',
      'world',
      'usage',
      'related',
      'references',
    ]);
    expect(section(panel, 'definition').items.slice(2)).toEqual([
      { label: 'Item type', value: 'floor' },
      { label: 'Entity types', chips: [{ label: 'floor' }] },
    ]);
    expect(section(panel, 'visual').items.map(({ label }) => label)).toEqual([
      'Silhouette',
      'Detail',
      'Distinctive features',
      'Palette direction',
      'Required variants',
    ]);
    expect(section(panel, 'usage').items).toEqual([{ label: 'Glade (map.glade)', value: '1 placed' }]);
    expect(section(panel, 'references').items).toEqual([
      { label: 'composition.entity of', value: 'Glade (map.glade)' },
    ]);
    expect(panel.palettes).toEqual([MEADOW]);
    expect(panel.raw).toEqual({ id: 'floor.grass' });
    expect(panel.biome).toBe('Meadow');
  });

  it('shows each palette as swatches, one per color, titled by its role', () => {
    expect(section(itemContextPanel(item), 'palette').items).toEqual([
      {
        label: 'Meadow · biome',
        swatches: [
          { color: '#44aa44', title: 'base #44aa44' },
          { color: '#226622', title: 'shadow #226622' },
        ],
      },
    ]);
  });

  it('marks an item with a badge for each saga it belongs to, in the color of the saga', () => {
    const badges = itemContextPanel({ ...item, sagas: ['ash-and-iron', 'the-last-signal'] }).badges;
    expect(badges.map(({ label }) => label)).toEqual(['ash-and-iron', 'the-last-signal']);
    expect(badges[1]).toMatchObject({ title: 'Belongs to the saga the-last-signal' });
    expect(badges[1].color).toMatch(/^hsl\(\d+, 60%, 40%\)$/);
    expect(itemContextPanel({ ...item, sagas: ['the-last-signal'] }).badges[0].color).toBe(badges[1].color);
    expect(badges[0].color).not.toBe(badges[1].color);
  });

  it('leaves out every section the context has nothing for', () => {
    const bare = {
      ...item,
      role: '',
      entityTypes: [],
      visual: { palettes: [] },
      world: { biomes: [], regions: [] },
      usage: [],
      related: {},
      references: [],
      referencedBy: [],
    };
    const panel = itemContextPanel(bare);
    expect(sectionIds(panel)).toEqual(['definition']);
    expect(section(panel, 'definition').items).toEqual([
      { text: 'Green ground.' },
      { label: 'Item type', value: 'floor' },
    ]);
  });
});

describe('the foundation context panel of a map', () => {
  it('shows the definition, the world, the palettes and the portals of the map, with its sagas', () => {
    const panel = mapContextPanel(map);
    expect(panel.title).toBe('Glade');
    expect(panel.subtitle).toBe('map · glade');
    expect(panel.badges.map(({ label }) => label)).toEqual(['the-last-signal']);
    expect(panel.raw).toBeUndefined();
    expect(sectionIds(panel)).toEqual(['definition', 'biome', 'world', 'palette', 'portals']);
    expect(section(panel, 'definition').items).toEqual([
      { text: 'A clearing.' },
      { label: 'Role', value: 'The first map.' },
      { label: 'Entity types', chips: [{ label: 'floor' }, { label: 'obstacle' }] },
    ]);
    expect(section(panel, 'portals').items).toEqual([
      { label: '→ cave', value: 'inter-portal · home' },
      { label: '← town', value: 'inter-random · home' },
    ]);
  });

  it('still shows a map the foundation does not define: its description, sagas and portals', () => {
    const panel = mapContextPanel({
      ...map,
      definition: null,
      role: '',
      world: { biomes: [], regions: [] },
      palettes: [],
      composition: [],
    });
    expect(panel.subtitle).toBe('map · glade · not in the foundation');
    expect(panel.badges).toHaveLength(1);
    expect(sectionIds(panel)).toEqual(['definition', 'portals']);
    expect(section(panel, 'definition').items).toEqual([{ text: 'A clearing.' }]);
  });
});
