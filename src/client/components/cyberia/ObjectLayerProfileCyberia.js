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
import { OBJECT_LAYER_SCHEMA_VERSION, isObjectLayerCid } from '../objectlayer-studio/ObjectLayerProtocol.js';

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

/**
 * The definition document formats this host reads, by Object Layer schema version: the canonical
 * payload of one definition, every field and no other. A new schema version needs its own entry.
 */
const DOCUMENT_FORMATS = Object.freeze({
  [OBJECT_LAYER_SCHEMA_VERSION]: Object.freeze({
    '': ['schemaVersion', 'profile', 'data'],
    profile: ['id', 'version'],
    data: ['item', 'stats', 'render'],
    'data.item': ['id', 'type', 'description', 'activable'],
    'data.stats': STAT_TYPES,
    'data.render': ['cid', 'metadataCid'],
  }),
});

/** The Object Layer schema versions a definition document may name. */
export const DEFINITION_DOCUMENT_VERSIONS = Object.freeze(Object.keys(DOCUMENT_FORMATS).map(Number));

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const fieldPath = (block, field) => (block ? `${block}.` : '') + JSON.stringify(field.slice(0, 40)).slice(1, -1);
const blockOf = (document, block) => (block ? block.split('.').reduce((value, key) => value[key], document) : document);

/** The fields a block lacks, and the fields it holds beyond the format. */
const fieldProblems = (fields, block, value) => {
  if (!isRecord(value)) return [`${block || 'The document'} is not an object`];
  return [
    ...fields.filter((field) => !Object.hasOwn(value, field)).map((field) => `${fieldPath(block, field)} is missing`),
    ...Object.keys(value)
      .filter((field) => !fields.includes(field))
      .map((field) => `${fieldPath(block, field)} is not in the format`),
  ];
};

/**
 * The problems of a definition document: the canonical payload `{ schemaVersion, profile, data }`
 * of one definition, whose bytes hash to its CID. It names a schema version this host reads and the
 * Cyberia profile version it runs, holds every field of that format and no other, an item id the
 * catalog binds, an item type of this profile, every stat in the contract range, and a render that
 * names its primary render and its layout by CID.
 * @param {*} document - The parsed document.
 * @returns {string[]} Empty when the document is a definition.
 */
export function definitionDocumentProblems(document) {
  if (!isRecord(document)) return ['The document is not an object'];
  const { schemaVersion } = document;
  const format =
    Number.isInteger(schemaVersion) &&
    Object.hasOwn(DOCUMENT_FORMATS, schemaVersion) &&
    DOCUMENT_FORMATS[schemaVersion];
  if (!format)
    return [
      `schemaVersion is ${JSON.stringify(schemaVersion ?? null)}: this host reads Object Layer schema ${DEFINITION_DOCUMENT_VERSIONS.join(', ')}`,
    ];
  const shape = [];
  const failed = new Set();
  for (const block of Object.keys(format)) {
    const parent = block.includes('.') ? block.slice(0, block.lastIndexOf('.')) : '';
    if (block && failed.has(parent)) {
      failed.add(block);
      continue;
    }
    const problems = fieldProblems(format[block], block, blockOf(document, block));
    if (problems.length) failed.add(block);
    shape.push(...problems);
  }
  if (shape.length) return shape;
  const { profile, data } = document;
  const { item, stats, render } = data;
  const problems = [];
  if (profile.id !== CyberiaObjectLayerProfile.id) problems.push(`profile.id is ${CyberiaObjectLayerProfile.id}`);
  if (profile.version !== CyberiaObjectLayerProfile.version)
    problems.push(`profile.version is ${CyberiaObjectLayerProfile.version}: the Cyberia profile this host runs`);
  if (typeof item.id !== 'string' || !CATALOG_ITEM_ID_PATTERN.test(item.id))
    problems.push('data.item.id is 1 to 128 letters, digits, dots, hyphens or underscores');
  if (!CyberiaObjectLayerProfile.itemTypes.includes(item.type))
    problems.push(`data.item.type is one of ${CyberiaObjectLayerProfile.itemTypes.join(', ')}`);
  if (typeof item.description !== 'string') problems.push('data.item.description is text');
  if (typeof item.activable !== 'boolean') problems.push('data.item.activable is true or false');
  for (const key of STAT_TYPES)
    if (!Number.isInteger(stats[key]) || stats[key] < STAT_MODIFIER_MIN || stats[key] > STAT_MODIFIER_MAX)
      problems.push(`data.stats.${key} is an integer from ${STAT_MODIFIER_MIN} to ${STAT_MODIFIER_MAX}`);
  for (const key of format['data.render'])
    if (!isObjectLayerCid(render[key])) problems.push(`data.render.${key} is a CID (bafkrei…)`);
  return problems;
}
