// The content profile Cyberia applies to Object Layers: item type vocabulary and stat contract.
// Canonical payloads name it as `profile: { id, version }`; the Object Layer core knows nothing of it.
import {
  ITEM_TYPES,
  STAT_CONTRACT_VERSION,
  STAT_DESCRIPTIONS,
  STAT_MODIFIER_MAX,
  STAT_MODIFIER_MIN,
  STAT_TYPES,
  generateRandomStats,
  validateStats,
} from './SharedDefaultsCyberia.js';

export const CyberiaObjectLayerProfile = Object.freeze({
  id: 'cyberia',
  version: STAT_CONTRACT_VERSION,
  itemTypes: Object.freeze(Object.values(ITEM_TYPES)),
  statTypes: STAT_TYPES,
  statDescriptions: STAT_DESCRIPTIONS,
  statModifierMin: STAT_MODIFIER_MIN,
  statModifierMax: STAT_MODIFIER_MAX,
  validateStats,
  generateRandomStats,
});
