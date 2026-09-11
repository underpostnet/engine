import { STAT_DEFAULTS } from '../../client/components/cyberia/SharedDefaultsCyberia.js';
import { DefaultCyberiaActions, DefaultCyberiaQuests } from '../../api/cyberia-server-defaults/cyberia-server-defaults.js';
import { toInstanceConfig, toMapMsg, toInstanceMsg, toObjectLayerMsg, toActionMsg, toQuestMsg } from './instance-data.js';

export function buildBootContractArtifacts() {
  const layer = toObjectLayerMsg({
    _id: 'contract-layer', sha256: 'abc',
    data: { stats: { ...STAT_DEFAULTS, effect: -100, resistance: 100 }, item: { id: 'sword', type: 'weapon' } },
  });
  const full = {
    instance: toInstanceMsg({ _id: 'contract-instance', code: 'contract-test', cyberiaMapCodes: ['contract-map'] }),
    maps: [toMapMsg({
      _id: 'contract-map', code: 'contract-map', gridX: 16, gridY: 16,
      entities: [{ entityType: 'bot', level: 7, objectLayerItemIds: ['sword'] }],
    })],
    objectLayers: [layer],
    config: toInstanceConfig({}),
    version: 'contract-fixture',
    actions: DefaultCyberiaActions.slice(0, 1).map(toActionMsg),
    quests: DefaultCyberiaQuests.slice(0, 1).map(toQuestMsg),
  };
  const payloads = {
    boot_full_instance: full,
    boot_object_layer: layer,
    boot_manifest: { entries: [{ itemId: 'sword', sha256: 'abc' }] },
    boot_ping: { serverTimeMs: 1000 },
  };
  return Object.fromEntries(Object.entries(payloads).map(([name, data]) => [
    'cyberia-server/engine_client/testdata/' + name + '.json',
    JSON.stringify({ status: 'success', data }, null, 2) + '\n',
  ]));
}
