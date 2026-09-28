/**
 * What the Cyberia Studio adds to the Object Layer editor: the foundation context of the item
 * being painted, and the pixel templates. The context arrives as a panel the generic editor
 * renders without knowing Cyberia.
 *
 * @module src/client/components/cyberia/ObjectLayerStudioCyberia.js
 */
import { ObjectLayerService } from '../../services/object-layer/object-layer.service.js';
import { CyberiaObjectLayerTemplates } from './ObjectLayerTemplatesCyberia.js';

const summaryText = ({ name, id, label }) => `${name} (${label ?? id})`;
const chips = (summaries) => summaries.map((summary) => ({ label: summary.name, title: summary.id }));

/**
 * The editor panel of a foundation context bundle.
 * @param {Object} context - `GET /object-layer/context/:id` data.
 * @returns {{title:string, subtitle:string, kind:string, sections:Object[], palettes:Object[], raw:Object}}
 */
export function contextPanel(context) {
  const brief = context.visual.artBrief ?? {};
  const [biome] = context.world.biomes;
  const references = context.references.filter(({ field }) => field !== 'locations');
  return {
    title: context.name,
    subtitle: `${context.kind} · ${context.label ?? context.id} · ${context.source}`,
    kind: context.kind,
    sections: [
      {
        id: 'definition',
        title: 'Definition',
        open: true,
        items: [
          { text: context.description },
          { label: 'Role', value: context.role },
          { label: 'Item type', value: context.itemType },
          { label: 'Entity types', chips: context.entityTypes.map((label) => ({ label })) },
        ].filter((item) => item.text || item.value || item.chips?.length),
      },
      {
        id: 'visual',
        title: 'Visual guide',
        open: true,
        items: [
          { label: 'Silhouette', value: brief.silhouette },
          { label: 'Detail', value: brief.detail },
          { label: 'Distinctive features', chips: (brief.distinctiveFeatures ?? []).map((label) => ({ label })) },
          { label: 'Visual motifs', chips: (brief.visualMotifs ?? []).map((label) => ({ label })) },
          { label: 'Palette direction', value: brief.paletteDirection },
          { label: 'Sprite scale', value: brief.spriteScale },
          { label: 'Readability', value: brief.readability },
          { label: 'Required variants', chips: (brief.requiredVariants ?? []).map((label) => ({ label })) },
        ].filter((item) => item.value || item.chips?.length),
      },
      {
        id: 'biome',
        title: 'Biome',
        open: true,
        items: context.world.biomes.map((entry) => ({ label: entry.name, value: entry.ambience })),
      },
      {
        id: 'world',
        title: 'Region / world',
        items: context.world.regions.map((region) => ({
          label: `${region.name} · ${region.layer}`,
          value: region.description,
        })),
      },
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
    ].filter((section) => section.items.length > 0),
    palettes: context.visual.palettes,
    raw: context.definition,
    biome: biome?.name ?? '',
  };
}

export const CyberiaObjectLayerStudio = Object.freeze({
  templates: CyberiaObjectLayerTemplates,
  /**
   * The context panel of the item a key names, or null where the foundation defines none.
   * @param {string} key - cid, document id or item label.
   */
  async context(key) {
    const { status, data } = await ObjectLayerService.getContext({ id: key });
    return status === 'success' && data ? contextPanel(data) : null;
  },
});
