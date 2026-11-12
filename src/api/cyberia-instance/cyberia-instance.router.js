import express from 'express';
import { registerCrudRoutes } from '../../server/network/middlewares.js';
import { CyberiaInstanceController } from './cyberia-instance.controller.js';

/** @type {import('../types.js').ApiModuleDefinition} */
export const ApiModule = {
  id: 'cyberia-instance',
  services: ['database', 'auth'],
  /**
   * @param {import('../types.js').ApiRouterContext} context
   * @returns {import('express').Router}
   */
  createRouter(context) {
    const { auth } = context.services;
    const router = express.Router();
    // ── Custom actions (must come before generic /:id routes) ──────────────
    // Boot transport — REST fallback of the gRPC CyberiaDataService, consumed
    // server-to-server by cyberia-server (its --data-server-url) when the engine
    // gRPC server is not enabled for the deploy. Unauthenticated for parity with
    // the internal-network insecure gRPC channel.
    router.get(`/boot/ping`, async (req, res) => await CyberiaInstanceController.bootPing(req, res, context));
    router.get(
      `/boot/object-layers`,
      async (req, res) => await CyberiaInstanceController.bootObjectLayerBatch(req, res, context),
    );
    router.get(
      `/boot/object-layer-manifest`,
      async (req, res) => await CyberiaInstanceController.bootObjectLayerManifest(req, res, context),
    );
    router.get(
      `/boot/object-layer/:itemId`,
      async (req, res) => await CyberiaInstanceController.bootObjectLayer(req, res, context),
    );
    router.get(
      `/boot/item-content/:itemId`,
      async (req, res) => await CyberiaInstanceController.bootItemContent(req, res, context),
    );
    router.get(
      `/boot/map/:mapCode`,
      async (req, res) => await CyberiaInstanceController.bootMapData(req, res, context),
    );
    router.get(
      `/boot/full-instance/:instanceCode`,
      async (req, res) => await CyberiaInstanceController.bootFullInstance(req, res, context),
    );
    router.get(
      `/boot/full-instance`,
      async (req, res) => await CyberiaInstanceController.bootFullInstance(req, res, context),
    );
    // Instance Map — authored topology, presence and capabilities. The client marks active POIs.
    router.get(
      `/instance-map/:instanceCode/static`,
      async (req, res) => await CyberiaInstanceController.instanceMapStatic(req, res, context),
    );
    // The preview of a world: its maps on their cells (PNG).
    router.get(
      `/instance-map/:instanceCode/world-preview`,
      async (req, res) => await CyberiaInstanceController.instanceMapWorldPreview(req, res, context),
    );
    // Hot reload — engine-cyberia -> cyberia-server control trigger. Elevated
    // privilege only; the internal API key stays server-side.
    router.post(
      `/:id/hot-reload`,
      auth.requireModerator,
      async (req, res) => await CyberiaInstanceController.hotReload(req, res, context),
    );
    // Map sources and topology — the maps an instance takes in one step, and what its portals connect.
    router.get(
      `/map-sources`,
      auth.requireModerator,
      async (req, res) => await CyberiaInstanceController.mapSources(req, res, context),
    );
    router.post(
      `/topology`,
      auth.requireModerator,
      async (req, res) => await CyberiaInstanceController.topology(req, res, context),
    );
    router.get(
      `/:id/portal-connect`,
      auth.requireUser,
      async (req, res) => await CyberiaInstanceController.portalConnect(req, res, context),
    );
    return registerCrudRoutes(router, CyberiaInstanceController, context);
  },
};
