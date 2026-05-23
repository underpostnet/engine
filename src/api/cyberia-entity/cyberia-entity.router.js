import { loggerFactory } from '../../server/logger.js';
import { CyberiaEntityController } from './cyberia-entity.controller.js';
import express from 'express';

const logger = loggerFactory(import.meta);

class CyberiaEntityRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const router = express.Router();
    router.post(`/:id`, async (req, res) => await CyberiaEntityController.post(req, res, options));
    router.post(`/`, async (req, res) => await CyberiaEntityController.post(req, res, options));
    router.get(`/:id`,
      // options.authMiddleware,
      async (req, res) => await CyberiaEntityController.get(req, res, options),
    );
    router.get(`/`, async (req, res) => await CyberiaEntityController.get(req, res, options));
    router.put(`/:id`, async (req, res) => await CyberiaEntityController.put(req, res, options));
    router.put(`/`, async (req, res) => await CyberiaEntityController.put(req, res, options));
    router.delete(`/:id`, async (req, res) => await CyberiaEntityController.delete(req, res, options));
    router.delete(`/`, async (req, res) => await CyberiaEntityController.delete(req, res, options));
    return router;
  }
}

const ApiRouter = (options) => CyberiaEntityRouter.router(options);

export { ApiRouter, CyberiaEntityRouter };
