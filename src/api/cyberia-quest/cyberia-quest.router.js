import { loggerFactory } from '../../server/logger.js';
import { CyberiaQuestController } from './cyberia-quest.controller.js';
import express from 'express';

const logger = loggerFactory(import.meta);

class CyberiaQuestRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const router = express.Router();
    router.post(`/:id`, async (req, res) => await CyberiaQuestController.post(req, res, options));
    router.post(`/`, async (req, res) => await CyberiaQuestController.post(req, res, options));
    // Direct lookup by code — C client fetches quest metadata by code.
    router.get(`/code/:code`, async (req, res) => await CyberiaQuestController.getByCode(req, res, options));
    router.get(`/:id`,
      // options.authMiddleware,
      async (req, res) => await CyberiaQuestController.get(req, res, options),
    );
    router.get(`/`, async (req, res) => await CyberiaQuestController.get(req, res, options));
    router.put(`/:id`, async (req, res) => await CyberiaQuestController.put(req, res, options));
    router.put(`/`, async (req, res) => await CyberiaQuestController.put(req, res, options));
    router.delete(`/:id`, async (req, res) => await CyberiaQuestController.delete(req, res, options));
    router.delete(`/`, async (req, res) => await CyberiaQuestController.delete(req, res, options));
    return router;
  }
}

const ApiRouter = (options) => CyberiaQuestRouter.router(options);

export { ApiRouter, CyberiaQuestRouter };
