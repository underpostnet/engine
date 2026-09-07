import express from 'express';
import { registerCrudRoutes } from '../../server/network/middlewares.js';
import { CyberiaQuestController } from './cyberia-quest.controller.js';

class CyberiaQuestRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const router = express.Router();
    // Direct lookup of quest metadata by code.
    router.get(`/code/:code`, async (req, res) => await CyberiaQuestController.getByCode(req, res, options));
    // Quest offers by binding cell. The client resolves its Quest tab from the
    // interacted entity's cell, with no CyberiaAction lookup.
    router.get(
      `/cell/:mapCode/:cellX/:cellY`,
      async (req, res) => await CyberiaQuestController.getByCell(req, res, options),
    );
    return registerCrudRoutes(router, CyberiaQuestController, options);
  }
}

const ApiRouter = (options) => CyberiaQuestRouter.router(options);

export { ApiRouter, CyberiaQuestRouter };
