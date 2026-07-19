import {
  buildCrudController,
  controllerHandler,
  sendBlob,
  serviceHandler,
  setCrossOriginHeaders,
} from '../../server/middlewares.js';
import { CyberiaInstanceService } from './cyberia-instance.service.js';
import { CyberiaInstanceMapService } from './cyberia-instance-map.service.js';
import { CyberiaInstanceBootService } from './cyberia-instance-boot.service.js';

const CyberiaInstanceController = buildCrudController(CyberiaInstanceService, {
  // The C client fetches the instance map cross-origin (same as quest metadata).
  instanceMapStatic: serviceHandler(CyberiaInstanceMapService.getStatic, { crossOrigin: true, errorStatus: 404 }),
  instanceMapDynamic: serviceHandler(CyberiaInstanceMapService.getDynamic, { crossOrigin: true, errorStatus: 404 }),
  // Node background of a fallback-world map, rendered + cached server-side.
  instanceMapPreview: controllerHandler(
    async (req, res, options) => {
      setCrossOriginHeaders(req, res);
      const buffer = await CyberiaInstanceMapService.getPreview(req, res, options);
      return sendBlob(req, res, {
        buffer,
        mimetype: 'image/png',
        filename: `${req.params.mapCode}-preview.png`,
      });
    },
    { errorStatus: 404 },
  ),
  fallbackWorld: serviceHandler(CyberiaInstanceService.fallbackWorld),
  portalConnect: serviceHandler(CyberiaInstanceService.portalConnect),
  // Moderator/admin-triggered world reload on a running cyberia-server.
  hotReload: serviceHandler(CyberiaInstanceService.hotReload, { errorStatus: 502 }),
  // Boot transport (REST fallback of the gRPC CyberiaDataService).
  bootPing: serviceHandler(CyberiaInstanceBootService.ping),
  bootObjectLayerBatch: serviceHandler(CyberiaInstanceBootService.objectLayerBatch, { errorStatus: 500 }),
  bootObjectLayer: serviceHandler(CyberiaInstanceBootService.objectLayer, { errorStatus: 404 }),
  bootMapData: serviceHandler(CyberiaInstanceBootService.mapData, { errorStatus: 404 }),
  bootFullInstance: serviceHandler(CyberiaInstanceBootService.fullInstance, { errorStatus: 500 }),
  bootObjectLayerManifest: serviceHandler(CyberiaInstanceBootService.objectLayerManifest, { errorStatus: 500 }),
});

export { CyberiaInstanceController };
