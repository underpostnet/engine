// The content profile Cyberia applies to Object Layers: item type vocabulary and stat contract.
// Canonical payloads name it as `profile: { id, version }`; the Object Layer core knows nothing of it.
import {
  ITEM_TYPES,
  STAT_CONTRACT_VERSION,
  STAT_DESCRIPTIONS,
  STAT_MODIFIER_MAX,
  STAT_MODIFIER_MIN,
  STAT_TYPES,
  customStatBounds,
  randomStatsWithin,
  statBoundsForType,
  statProblems,
  validateStats,
} from './SharedDefaultsCyberia.js';
import { isObjectLayerCid } from '../objectlayer-studio/ObjectLayerProtocol.js';

export const CyberiaObjectLayerProfile = Object.freeze({
  id: 'cyberia',
  version: STAT_CONTRACT_VERSION,
  itemTypes: Object.freeze(Object.values(ITEM_TYPES)),
  statTypes: STAT_TYPES,
  statDescriptions: STAT_DESCRIPTIONS,
  statModifierMin: STAT_MODIFIER_MIN,
  statModifierMax: STAT_MODIFIER_MAX,
  validateStats,
  statBounds: statBoundsForType,
  customStatBounds,
  statProblems,
  randomStats: randomStatsWithin,
});

/** An item id the catalog binds: 1 to 128 letters, digits, dots, hyphens or underscores. */
export const CATALOG_ITEM_ID_PATTERN = /^[\w.-]{1,128}$/;

/** The most bytes of JSON one definition holds on import. */
export const DEFINITION_DOCUMENT_BYTES = 64 * 1024;

/** The fields of a definition document: the data of one definition under this profile, exactly. */
const DOCUMENT_FIELDS = Object.freeze({
  '': ['item', 'stats', 'render'],
  item: ['id', 'type', 'description', 'activable'],
  stats: STAT_TYPES,
  render: ['cid', 'metadataCid'],
});

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const fieldPath = (block, field) => (block ? `${block}.` : '') + JSON.stringify(field.slice(0, 40)).slice(1, -1);

/** The fields a block lacks, and the fields it holds beyond the format. */
const fieldProblems = (block, value) => {
  if (!isRecord(value)) return [`${block || 'The document'} is not an object`];
  const fields = DOCUMENT_FIELDS[block];
  return [
    ...fields.filter((field) => !Object.hasOwn(value, field)).map((field) => `${fieldPath(block, field)} is missing`),
    ...Object.keys(value)
      .filter((field) => !fields.includes(field))
      .map((field) => `${fieldPath(block, field)} is not in the format`),
  ];
};

/**
 * The problems of a definition document: `{ item, stats, render }` with every field and no other,
 * an item id the catalog binds, an item type of this profile, every stat in the contract range, and
 * a render that names its primary render and its layout by CID.
 * @param {*} document - The parsed document.
 * @returns {string[]} Empty when the document is a definition.
 */
export function definitionDocumentProblems(document) {
  const shape = fieldProblems('', document);
  if (shape.length) return shape;
  const { item, stats, render } = document;
  const fields = ['item', 'stats', 'render'].flatMap((block) => fieldProblems(block, document[block]));
  if (fields.length) return fields;
  const problems = [];
  if (typeof item.id !== 'string' || !CATALOG_ITEM_ID_PATTERN.test(item.id))
    problems.push('item.id is 1 to 128 letters, digits, dots, hyphens or underscores');
  if (!CyberiaObjectLayerProfile.itemTypes.includes(item.type))
    problems.push(`item.type is one of ${CyberiaObjectLayerProfile.itemTypes.join(', ')}`);
  if (typeof item.description !== 'string') problems.push('item.description is text');
  if (typeof item.activable !== 'boolean') problems.push('item.activable is true or false');
  for (const key of STAT_TYPES)
    if (!Number.isInteger(stats[key]) || stats[key] < STAT_MODIFIER_MIN || stats[key] > STAT_MODIFIER_MAX)
      problems.push(`stats.${key} is an integer from ${STAT_MODIFIER_MIN} to ${STAT_MODIFIER_MAX}`);
  for (const key of DOCUMENT_FIELDS.render)
    if (!isObjectLayerCid(render[key])) problems.push(`render.${key} is a CID (bafkrei…)`);
  return problems;
}
