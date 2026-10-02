/**
 * The foundation context panels of the Cyberia Studio: an item context and a map context as the
 * panel model of `ContextPanel`. The Object Layer editor, the Object Layer viewer and the map
 * editor mount them.
 *
 * @module src/client/components/cyberia/FoundationContextCyberia.js
 */
import { sagaBadges } from './SagaCyberia.js';

const summaryText = ({ name, id, label }) => `${name} (${label ?? id})`;
const chips = (summaries) => summaries.map((summary) => ({ label: summary.name, title: summary.id }));
const labelChips = (labels) => labels.map((label) => ({ label }));
const present = (item) => item.text || item.value || item.chips?.length || item.swatches?.length;
const withItems = (sections) => sections.filter((section) => section.items.length > 0);

const worldSections = ({ biomes, regions }) => [
  {
    id: 'biome',
    title: 'Biome',
    open: true,
    items: biomes.map((entry) => ({ label: entry.name, value: entry.ambience })),
  },
  {
    id: 'world',
    title: 'Region / world',
    items: regions.map((region) => ({ label: `${region.name} · ${region.layer}`, value: region.description })),
  },
];

const paletteSection = (palettes) => ({
  id: 'palette',
  title: 'Palettes',
  open: true,
  items: palettes.map((palette) => ({
    label: `${palette.name} · ${palette.group}`,
    swatches: Object.entries(palette.roles).flatMap(([role, colors]) =>
      colors.map((color) => ({ color, title: `${role} ${color}` })),
    ),
  })),
});

/**
 * The panel of an item context.
 * @param {Object} context - `GET /object-layer/context/:id` data.
 * @returns {Object} The panel model, with the `kind`, the `palettes` and the `biome` of the item.
 */
export function itemContextPanel(context) {
  const brief = context.visual.artBrief ?? {};
  const [biome] = context.world.biomes;
  const references = context.references.filter(({ field }) => field !== 'locations');
  return {
    title: context.name,
    subtitle: `${context.kind} · ${context.label ?? context.id}`,
    badges: sagaBadges(context.sagas),
    kind: context.kind,
    sections: withItems([
      {
        id: 'definition',
        title: 'Definition',
        open: true,
        items: [
          { text: context.description },
          { label: 'Role', value: context.role },
          { label: 'Item type', value: context.itemType },
          { label: 'Entity types', chips: labelChips(context.entityTypes) },
        ].filter(present),
      },
      {
        id: 'visual',
        title: 'Visual guide',
        open: true,
        items: [
          { label: 'Silhouette', value: brief.silhouette },
          { label: 'Detail', value: brief.detail },
          { label: 'Distinctive features', chips: labelChips(brief.distinctiveFeatures ?? []) },
          { label: 'Visual motifs', chips: labelChips(brief.visualMotifs ?? []) },
          { label: 'Palette direction', value: brief.paletteDirection },
          { label: 'Sprite scale', value: brief.spriteScale },
          { label: 'Readability', value: brief.readability },
          { label: 'Required variants', chips: labelChips(brief.requiredVariants ?? []) },
        ].filter(present),
      },
      paletteSection(context.visual.palettes),
      ...worldSections(context.world),
      {
        id: 'usage',
        title: 'Used by',
        open: true,
        items: context.usage.map(({ map, count }) => ({ label: summaryText(map), value: `${count} placed` })),
      },
      {
        id: 'related',
        title: 'Related content',
        items: Object.entries(context.related).map(([kind, summaries]) => ({ label: kind, chips: chips(summaries) })),
      },
      {
        id: 'references',
        title: 'Foundation references',
        items: [
          ...references.map((entry) => ({ label: entry.field, value: summaryText(entry) })),
          ...context.referencedBy.map((entry) => ({ label: `${entry.field} of`, value: summaryText(entry) })),
        ],
      },
    ]),
    palettes: context.visual.palettes,
    raw: context.definition,
    biome: biome?.name ?? '',
  };
}

/**
 * The panel of a map context. A map the foundation does not define still shows its description,
 * its sagas and its portals.
 * @param {Object} context - `GET /cyberia-map/context/:code` data.
 * @returns {Object} The panel model.
 */
export function mapContextPanel(context) {
  const entityTypes = [...new Set(context.composition.map(({ entity }) => entity.entityType))];
  return {
    title: context.name,
    subtitle: `map · ${context.code}${context.definition ? '' : ' · not in the foundation'}`,
    badges: sagaBadges(context.sagas),
    sections: withItems([
      {
        id: 'definition',
        title: 'Definition',
        open: true,
        items: [
          { text: context.description },
          { label: 'Role', value: context.role },
          { label: 'Entity types', chips: labelChips(entityTypes) },
        ].filter(present),
      },
      ...worldSections(context.world),
      paletteSection(context.palettes),
      {
        id: 'portals',
        title: 'Portals',
        open: true,
        items: context.portals.map((portal) => {
          const out = portal.direction === 'out';
          return {
            label: `${out ? '→' : '←'} ${out ? portal.targetMapCode : portal.sourceMapCode}`,
            value: `${portal.portalMode} · ${portal.instanceCode}`,
          };
        }),
      },
    ]),
  };
}
