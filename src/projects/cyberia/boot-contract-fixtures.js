import { STAT_DEFAULTS } from '../../client/components/cyberia/SharedDefaultsCyberia.js';
import { CyberiaObjectLayerProfile } from '../../client/components/cyberia/ObjectLayerProfileCyberia.js';
import { profileRef } from '../../client/components/object-layer/ObjectLayerProtocol.js';
import { objectLayerIdentity, renderContractOf } from '../../api/object-layer/object-layer.identity.js';
import { DefaultCyberiaActions, DefaultCyberiaQuests } from '../../api/cyberia-server-defaults/cyberia-server-defaults.js';
import { toInstanceConfig, toMapMsg, toInstanceMsg, toObjectLayerMsg, toActionMsg, toQuestMsg } from './instance-data.js';

// One definition feeds every runtime contract: the Go boot fixtures (engine → cyberia-server)
// and the WebSocket metadata fixture (cyberia-server → cyberia-client). Its render contract and
// its cid are computed, so the three runtimes carry a real identity: `cid` is the definition,
// `data.item.id` its label.
const SWORD_CONTENT = {
  profile: profileRef(CyberiaObjectLayerProfile),
  data: {
    stats: { ...STAT_DEFAULTS, effect: -100, resistance: 100 },
    item: { id: 'sword', type: 'weapon' },
    render: renderContractOf({
      primary: Buffer.from('cyberia contract primary render'),
      metadata: { itemKey: 'sword', atlasWidth: 1, atlasHeight: 1, cellPixelDim: 1 },
    }),
  },
};
const SWORD = { _id: 'contract-layer', ...SWORD_CONTENT, cid: objectLayerIdentity(SWORD_CONTENT).cid };

export function buildBootContractArtifacts() {
  const layer = toObjectLayerMsg(SWORD);
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
    boot_manifest: { entries: [{ itemId: 'sword', cid: SWORD.cid }] },
    boot_ping: { serverTimeMs: 1000 },
  };
  // The shape `game.OLMeta` marshals for the client: an unregistered ledger is absent.
  const wsMetadata = {
    [layer.item.id]: {
      cid: layer.cid,
      data: { stats: layer.stats, item: layer.item, render: layer.render },
    },
  };
  return {
    ...Object.fromEntries(Object.entries(payloads).map(([name, data]) => [
      'cyberia-server/engine_client/testdata/' + name + '.json',
      JSON.stringify({ status: 'success', data }, null, 2) + '\n',
    ])),
    'cyberia-client/tests/testdata/ws_object_layer_metadata.json': JSON.stringify(wsMetadata, null, 2) + '\n',
  };
}
