import { authMiddleware } from '../../server/auth.js';
import { loggerFactory } from '../../server/logger.js';
import { CyberiaItemController } from './cyberia-item.controller.js';
import express from 'express';

const logger = loggerFactory(import.meta);

const CyberiaItemRouter = (options) => {
  const router = express.Router();
  router.post(
    `/buy/:providerId/:itemType/:id`,
    authMiddleware,
    async (req, res) => await CyberiaItemController.post(req, res, options),
  );
  router.post(`/:id`, authMiddleware, async (req, res) => await CyberiaItemController.post(req, res, options));
  router.post(`/`, authMiddleware, async (req, res) => await CyberiaItemController.post(req, res, options));
  router.get(`/:id`, authMiddleware, async (req, res) => await CyberiaItemController.get(req, res, options));
  router.get(`/`, authMiddleware, async (req, res) => await CyberiaItemController.get(req, res, options));
  router.put(`/:id`, authMiddleware, async (req, res) => await CyberiaItemController.put(req, res, options));
  router.put(`/`, authMiddleware, async (req, res) => await CyberiaItemController.put(req, res, options));
  router.delete(`/:id`, authMiddleware, async (req, res) => await CyberiaItemController.delete(req, res, options));
  router.delete(`/`, authMiddleware, async (req, res) => await CyberiaItemController.delete(req, res, options));
  return router;
};

const ApiRouter = CyberiaItemRouter;

export { ApiRouter, CyberiaItemRouter };
