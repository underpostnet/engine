import { describe, it, expect } from 'vitest';
import {
  CyberiaObjectLayerProfile,
  definitionDocumentProblems,
} from '../../../src/client/components/cyberia/ObjectLayerProfileCyberia.js';
import { STAT_DEFAULTS } from '../../../src/client/components/cyberia/SharedDefaultsCyberia.js';

const CID = `bafkrei${'a'.repeat(52)}`;
const document = {
  item: { id: 'js-rules', type: 'skin', description: 'a daily lifestyle since 1995', activable: true },
  stats: { ...STAT_DEFAULTS, effect: 2 },
  render: { cid: CID, metadataCid: CID },
};

describe('a definition document', () => {
  it('is the data of one definition under the Cyberia profile, every field and no other', () => {
    expect(definitionDocumentProblems(document)).toEqual([]);
    expect(definitionDocumentProblems({ ...document, profile: {} })).toEqual(['profile is not in the format']);
    const { render, ...unrendered } = document;
    expect(definitionDocumentProblems(unrendered)).toEqual(['render is missing']);
    const { utility, ...stats } = document.stats;
    expect(
      definitionDocumentProblems({
        ...document,
        item: { ...document.item, color: 'red' },
        stats: { ...stats, luck: 1 },
      }),
    ).toEqual(['item.color is not in the format', 'stats.utility is missing', 'stats.luck is not in the format']);
    for (const value of [null, [], 'text', 7])
      expect(definitionDocumentProblems(value)).toEqual(['The document is not an object']);
    expect(definitionDocumentProblems({ ...document, stats: [] })).toEqual(['stats is not an object']);
  });

  it('names each value outside the format', () => {
    const problems = definitionDocumentProblems({
      item: { id: 'js rules', type: 'relic', description: 7, activable: 'yes' },
      stats: { ...document.stats, effect: 1.5, agility: CyberiaObjectLayerProfile.statModifierMax + 1 },
      render: { cid: 'https://objectlayer.org/', metadataCid: '' },
    });
    expect(problems).toEqual([
      'item.id is 1 to 128 letters, digits, dots, hyphens or underscores',
      `item.type is one of ${CyberiaObjectLayerProfile.itemTypes.join(', ')}`,
      'item.description is text',
      'item.activable is true or false',
      `stats.effect is an integer from ${CyberiaObjectLayerProfile.statModifierMin} to ${CyberiaObjectLayerProfile.statModifierMax}`,
      `stats.agility is an integer from ${CyberiaObjectLayerProfile.statModifierMin} to ${CyberiaObjectLayerProfile.statModifierMax}`,
      'render.cid is a CID (bafkrei…)',
      'render.metadataCid is a CID (bafkrei…)',
    ]);
  });
});
