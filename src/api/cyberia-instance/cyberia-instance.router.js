import express from 'express';
import { registerCrudRoutes } from '../../server/middlewares.js';
import { userGuard } from '../../server/auth.js';
import { CyberiaInstanceController } from './cyberia-instance.controller.js';

class CyberiaInstanceRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const router = express.Router();
    // ── Custom actions (must come before generic /:id routes) ──────────────
    // Boot transport — REST fallback of the gRPC CyberiaDataService, consumed
    // server-to-server by cyberia-server (ENGINE_API_BASE_URL) when the engine
    // gRPC server (ENGINE_GRPC_ADDRESS) is not enabled. Unauthenticated for
    // parity with the internal-network insecure gRPC channel.
    router.get(`/boot/ping`, async (req, res) => await CyberiaInstanceController.bootPing(req, res, options));
    router.get(
      `/boot/object-layers`,
      async (req, res) => await CyberiaInstanceController.bootObjectLayerBatch(req, res, options),
    );
    router.get(
      `/boot/object-layer-manifest`,
      async (req, res) => await CyberiaInstanceController.bootObjectLayerManifest(req, res, options),
    );
    router.get(
      `/boot/object-layer/:itemId`,
      async (req, res) => await CyberiaInstanceController.bootObjectLayer(req, res, options),
    );
    router.get(`/boot/map/:mapCode`, async (req, res) => await CyberiaInstanceController.bootMapData(req, res, options));
    router.get(
      `/boot/full-instance/:instanceCode`,
      async (req, res) => await CyberiaInstanceController.bootFullInstance(req, res, options),
    );
    router.get(
      `/boot/full-instance`,
      async (req, res) => await CyberiaInstanceController.bootFullInstance(req, res, options),
    );
    router.get(`/fallback-world`, async (req, res) => await CyberiaInstanceController.fallbackWorld(req, res, options));
    // Instance Map — static topology/presence plus dynamic player capability activity.
    router.get(
      `/instance-map/:instanceCode/static`,
      async (req, res) => await CyberiaInstanceController.instanceMapStatic(req, res, options),
    );
    router.get(
      `/instance-map/:instanceCode/dynamic`,
      async (req, res) => await CyberiaInstanceController.instanceMapDynamic(req, res, options),
    );
    router.get(
      `/:id/portal-connect`,
      options.authMiddleware,
      userGuard,
      async (req, res) => await CyberiaInstanceController.portalConnect(req, res, options),
    );
    return registerCrudRoutes(router, CyberiaInstanceController, options);
  }
}

const ApiRouter = (options) => CyberiaInstanceRouter.router(options);

export { ApiRouter, CyberiaInstanceRouter };
