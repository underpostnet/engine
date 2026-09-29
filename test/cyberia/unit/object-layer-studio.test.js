import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/client/services/object-layer/object-layer.service.js', () => ({ ObjectLayerService: {} }));
vi.mock('../../../src/client/services/cyberia-saga/cyberia-saga.service.js', () => ({ CyberiaSagaService: {} }));

const { contextPanel } = await import('../../../src/client/components/cyberia/ObjectLayerStudioCyberia.js');
const { CyberiaObjectLayerTemplates } =
  await import('../../../src/client/components/cyberia/ObjectLayerTemplatesCyberia.js');
const { renderTemplate, templateSuits } = await import('../../../src/client/components/object-layer/PixelTemplate.js');

const PALETTE = { base: ['#44aa44'], shadow: ['#226622'], highlight: ['#88dd88'], outline: ['#112211'] };
const context = {
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
    palettes: [{ id: 'biome.meadow', name: 'Meadow', group: 'biome', roles: PALETTE }],
  },
  world: {
    biomes: [{ id: 'biome.meadow', name: 'Meadow', ambience: 'Calm.' }],
    regions: [{ id: 'region.home', name: 'Home', layer: 'physical', description: 'Home.' }],
  },
  usage: [{ map: { id: 'map.glade', name: 'Glade' }, count: 1 }],
  related: { structure: [{ id: 'structure.wall', name: 'Wall' }] },
  references: [{ field: 'locations', id: 'biome.meadow', name: 'Meadow' }],
  referencedBy: [{ field: 'composition.entity', id: 'map.glade', name: 'Glade' }],
};

describe('the Object Layer context panel of the Cyberia Studio', () => {
  it('turns a foundation context into sections an artist reads while painting', () => {
    const panel = contextPanel(context);
    expect(panel.title).toBe('Grass');
    expect(panel.subtitle).toBe('floor · grass');
    expect(panel.badges).toEqual([]);
    expect(panel.kind).toBe('floor');
    expect(panel.sections.map(({ id }) => id)).toEqual([
      'definition',
      'visual',
      'biome',
      'world',
      'usage',
      'related',
      'references',
    ]);
    expect(panel.sections.find(({ id }) => id === 'definition').items.slice(2)).toEqual([
      { label: 'Item type', value: 'floor' },
      { label: 'Entity types', chips: [{ label: 'floor' }] },
    ]);
    const visual = panel.sections.find(({ id }) => id === 'visual');
    expect(visual.items.map(({ label }) => label)).toEqual([
      'Silhouette',
      'Detail',
      'Distinctive features',
      'Palette direction',
      'Required variants',
    ]);
    expect(panel.sections.find(({ id }) => id === 'usage').items).toEqual([
      { label: 'Glade (map.glade)', value: '1 placed' },
    ]);
    expect(panel.palettes).toEqual(context.visual.palettes);
    expect(panel.raw).toEqual({ id: 'floor.grass' });
  });

  it('marks an item with a badge for each saga it belongs to, in the color of the saga', () => {
    const badges = contextPanel({ ...context, sagas: ['ash-and-iron', 'the-last-signal'] }).badges;
    expect(badges.map(({ label }) => label)).toEqual(['ash-and-iron', 'the-last-signal']);
    expect(badges[1]).toMatchObject({ title: 'Belongs to the saga the-last-signal' });
    expect(badges[1].color).toMatch(/^hsl\(\d+, 60%, 40%\)$/);
    expect(contextPanel({ ...context, sagas: ['the-last-signal'] }).badges[0].color).toBe(badges[1].color);
    expect(badges[0].color).not.toBe(badges[1].color);
  });

  it('offers a template for each kind of item, painted in the biome palette', () => {
    for (const [itemType, kind] of [
      ['floor', ''],
      ['resource', 'tree'],
      ['resource', 'rock'],
      ['obstacle', 'structure'],
      ['portal', ''],
      ['weapon', ''],
      ['skill', ''],
    ])
      expect(
        CyberiaObjectLayerTemplates.some((template) => templateSuits(template, itemType, kind)),
        `${itemType} ${kind}`,
      ).toBe(true);
    const floor = CyberiaObjectLayerTemplates.find(({ id }) => id === 'floor-tile');
    const frame = renderTemplate(floor, PALETTE);
    const colors = new Set(frame.flat().map((cell) => cell.join()));
    expect(colors).toEqual(new Set(['68,170,68,255', '34,102,34,255', '136,221,136,255']));
    for (const template of CyberiaObjectLayerTemplates) {
      const cells = template.roles;
      expect(
        cells.every((row) => row.length === cells[0].length),
        template.id,
      ).toBe(true);
    }
  });
});
