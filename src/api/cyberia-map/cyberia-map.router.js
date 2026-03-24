import { loggerFactory } from '../../server/logger.js';
import { CyberiaMapController } from './cyberia-map.controller.js';
import express from 'express';

const logger = loggerFactory(import.meta);

const CyberiaMapRouter = (options) => {
  const router = express.Router();
  const authMiddleware = options.authMiddleware;
  router.post(`/:id`, async (req, res) => await CyberiaMapController.post(req, res, options));
  router.post(`/`, async (req, res) => await CyberiaMapController.post(req, res, options));
  router.get(
    `/:id`,
    // authMiddleware,
    async (req, res) => await CyberiaMapController.get(req, res, options),
  );
  router.get(`/`, async (req, res) => await CyberiaMapController.get(req, res, options));
  router.put(`/:id`, async (req, res) => await CyberiaMapController.put(req, res, options));
  router.put(`/`, async (req, res) => await CyberiaMapController.put(req, res, options));
  router.delete(`/:id`, async (req, res) => await CyberiaMapController.delete(req, res, options));
  router.delete(`/`, async (req, res) => await CyberiaMapController.delete(req, res, options));
  return router;
};

const ApiRouter = CyberiaMapRouter;

export { ApiRouter, CyberiaMapRouter };
