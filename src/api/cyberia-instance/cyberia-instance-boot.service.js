/**
 * REST boot service — the /api/cyberia-instance/boot/* fallback transport.
 *
 * Serves the exact CyberiaDataService payloads (world load, hot reload) over
 * REST so cyberia-server can boot from ENGINE_API_BASE_URL when the engine
 * gRPC server (ENGINE_GRPC_ADDRESS) is not enabled for the deploy. All data
 * assembly lives in src/projects/cyberia/instance-data.js, shared with
 * src/grpc/cyberia/grpc-server.js so both transports stay equivalent.
 *
 * Endpoints (all GET, internal server-to-server, mirroring the RPCs):
 *   /boot/ping                         → { serverTimeMs }
 *   /boot/object-layers[?itemType=x]   → ObjectLayerMessage[]        (getObjectLayerBatch)
 *   /boot/object-layer/:itemId         → ObjectLayerMessage | 404    (getObjectLayer)
 *   /boot/map/:mapCode[?instanceCode=] → { map } | 404               (getMapData)
 *   /boot/full-instance[/:instanceCode]→ full world payload           (getFullInstance)
 *   /boot/object-layer-manifest        → { entries }                  (getObjectLayerManifest)
 */

import {
  fetchFullInstance,
  fetchMapData,
  fetchObjectLayer,
  fetchObjectLayerBatch,
  fetchObjectLayerManifest,
  getInstanceModels,
  pingData,
} from '../../projects/cyberia/instance-data.js';

class CyberiaInstanceBootService {
  static ping = async () => pingData();

  static objectLayerBatch = async (req, res, options) =>
    await fetchObjectLayerBatch(getInstanceModels(options), req.query.itemType);

  static objectLayer = async (req, res, options) => {
    const msg = await fetchObjectLayer(getInstanceModels(options), req.params.itemId);
    if (!msg) throw new Error(`ObjectLayer "${req.params.itemId}" not found`);
    return msg;
  };

  static mapData = async (req, res, options) => {
    const result = await fetchMapData(getInstanceModels(options), {
      mapCode: req.params.mapCode,
      instanceCode: req.query.instanceCode,
    });
    if (!result) throw new Error(`Map "${req.params.mapCode}" not found`);
    return result;
  };

  static fullInstance = async (req, res, options) =>
    await fetchFullInstance(getInstanceModels(options), req.params.instanceCode);

  static objectLayerManifest = async (req, res, options) =>
    await fetchObjectLayerManifest(getInstanceModels(options));
}

export { CyberiaInstanceBootService };
