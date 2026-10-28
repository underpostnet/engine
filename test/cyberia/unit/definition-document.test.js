import { describe, it, expect } from 'vitest';
import {
  CyberiaObjectLayerProfile,
  DEFINITION_DOCUMENT_VERSIONS,
  definitionDocumentProblems,
} from '../../../src/client/components/cyberia/ObjectLayerProfileCyberia.js';
import { STAT_DEFAULTS } from '../../../src/client/components/cyberia/SharedDefaultsCyberia.js';
import {
  OBJECT_LAYER_SCHEMA_VERSION,
  profileRef,
} from '../../../src/client/components/objectlayer-studio/ObjectLayerProtocol.js';

const CID = `bafkrei${'a'.repeat(52)}`;
const data = {
  item: { id: 'js-rules', type: 'skin', description: 'a daily lifestyle since 1995', activable: true },
  stats: { ...STAT_DEFAULTS, effect: 2 },
  render: { cid: CID, metadataCid: CID },
};
const document = { schemaVersion: OBJECT_LAYER_SCHEMA_VERSION, profile: profileRef(CyberiaObjectLayerProfile), data };
const withData = (changes) => ({ ...document, data: { ...data, ...changes } });

describe('a definition document', () => {
  it('is the canonical payload of one definition under the Cyberia profile, every field and no other', () => {
    expect(DEFINITION_DOCUMENT_VERSIONS).toEqual([OBJECT_LAYER_SCHEMA_VERSION]);
    expect(definitionDocumentProblems(document)).toEqual([]);
    expect(definitionDocumentProblems({ ...document, cid: CID })).toEqual(['cid is not in the format']);
    const { render, ...unrendered } = data;
    expect(definitionDocumentProblems({ ...document, data: unrendered })).toEqual(['data.render is missing']);
    const { utility, ...stats } = data.stats;
    expect(
      definitionDocumentProblems(withData({ item: { ...data.item, color: 'red' }, stats: { ...stats, luck: 1 } })),
    ).toEqual([
      'data.item.color is not in the format',
      'data.stats.utility is missing',
      'data.stats.luck is not in the format',
    ]);
    for (const value of [null, [], 'text', 7])
      expect(definitionDocumentProblems(value)).toEqual(['The document is not an object']);
    expect(definitionDocumentProblems(withData({ stats: [] }))).toEqual(['data.stats is not an object']);
    expect(definitionDocumentProblems({ ...document, data: null })).toEqual(['data is not an object']);
    expect(definitionDocumentProblems(JSON.parse(`{"__proto__":{},${JSON.stringify(document).slice(1)}`))).toEqual([
      '__proto__ is not in the format',
    ]);
  });

  it('names the schema version and the profile version it follows, and refuses one this host does not read', () => {
    expect(definitionDocumentProblems(data)).toEqual([
      `schemaVersion is null: this host reads Object Layer schema ${OBJECT_LAYER_SCHEMA_VERSION}`,
    ]);
    expect(definitionDocumentProblems({ ...document, schemaVersion: 2 })[0]).toMatch(/^schemaVersion is 2: /);
    expect(definitionDocumentProblems({ ...document, schemaVersion: '1' })[0]).toMatch(/^schemaVersion is "1": /);
    expect(definitionDocumentProblems({ ...document, profile: { id: 'other-game', version: 1 } })).toEqual([
      'profile.id is cyberia',
      `profile.version is ${CyberiaObjectLayerProfile.version}: the Cyberia profile this host runs`,
    ]);
  });

  it('names each value outside the format', () => {
    const problems = definitionDocumentProblems(
      withData({
        item: { id: 'js rules', type: 'relic', description: 7, activable: 'yes' },
        stats: { ...data.stats, effect: 1.5, agility: CyberiaObjectLayerProfile.statModifierMax + 1 },
        render: { cid: 'https://objectlayer.org/', metadataCid: '' },
      }),
    );
    const range = `an integer from ${CyberiaObjectLayerProfile.statModifierMin} to ${CyberiaObjectLayerProfile.statModifierMax}`;
    expect(problems).toEqual([
      'data.item.id is 1 to 128 letters, digits, dots, hyphens or underscores',
      `data.item.type is one of ${CyberiaObjectLayerProfile.itemTypes.join(', ')}`,
      'data.item.description is text',
      'data.item.activable is true or false',
      `data.stats.effect is ${range}`,
      `data.stats.agility is ${range}`,
      'data.render.cid is a CID (bafkrei…)',
      'data.render.metadataCid is a CID (bafkrei…)',
    ]);
  });
});
