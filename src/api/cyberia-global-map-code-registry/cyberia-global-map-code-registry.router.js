import { loggerFactory } from '../../server/logger.js';
import { CyberiaGlobalMapCodeRegistryController } from './cyberia-global-map-code-registry.controller.js';
import express from 'express';

const logger = loggerFactory(import.meta);

class CyberiaGlobalMapCodeRegistryRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const router = express.Router();
    router.post(`/:id`, async (req, res) => await CyberiaGlobalMapCodeRegistryController.post(req, res, options));
    router.post(`/`, async (req, res) => await CyberiaGlobalMapCodeRegistryController.post(req, res, options));
    router.get(`/:id`,
      // options.authMiddleware,
      async (req, res) => await CyberiaGlobalMapCodeRegistryController.get(req, res, options),
    );
    router.get(`/`, async (req, res) => await CyberiaGlobalMapCodeRegistryController.get(req, res, options));
    router.put(`/:id`, async (req, res) => await CyberiaGlobalMapCodeRegistryController.put(req, res, options));
    router.put(`/`, async (req, res) => await CyberiaGlobalMapCodeRegistryController.put(req, res, options));
    router.delete(`/:id`, async (req, res) => await CyberiaGlobalMapCodeRegistryController.delete(req, res, options));
    router.delete(`/`, async (req, res) => await CyberiaGlobalMapCodeRegistryController.delete(req, res, options));
    return router;
  }
}

const ApiRouter = (options) => CyberiaGlobalMapCodeRegistryRouter.router(options);

export { ApiRouter, CyberiaGlobalMapCodeRegistryRouter };
