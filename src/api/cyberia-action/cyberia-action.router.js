import { loggerFactory } from '../../server/logger.js';
import { CyberiaActionController } from './cyberia-action.controller.js';
import express from 'express';

const logger = loggerFactory(import.meta);

class CyberiaActionRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const router = express.Router();
    router.post(`/:id`, async (req, res) => await CyberiaActionController.post(req, res, options));
    router.post(`/`, async (req, res) => await CyberiaActionController.post(req, res, options));
    router.get(`/:id`,
      // options.authMiddleware,
      async (req, res) => await CyberiaActionController.get(req, res, options),
    );
    router.get(`/`, async (req, res) => await CyberiaActionController.get(req, res, options));
    router.put(`/:id`, async (req, res) => await CyberiaActionController.put(req, res, options));
    router.put(`/`, async (req, res) => await CyberiaActionController.put(req, res, options));
    router.delete(`/:id`, async (req, res) => await CyberiaActionController.delete(req, res, options));
    router.delete(`/`, async (req, res) => await CyberiaActionController.delete(req, res, options));
    return router;
  }
}

const ApiRouter = (options) => CyberiaActionRouter.router(options);

export { ApiRouter, CyberiaActionRouter };
