import { loggerFactory } from '../../server/logger.js';
import { ObjectLayerController } from './object-layer.controller.js';
import express from 'express';

const logger = loggerFactory(import.meta);

const ObjectLayerRouter = (options) => {
  const router = express.Router();
  const authMiddleware = options.authMiddleware;
  router.post(
    `/frame-image/:itemType/:itemId/:directionCode`,
    async (req, res) => await ObjectLayerController.post(req, res, options),
  );
  router.post(`/metadata/:itemType/:itemId`, async (req, res) => await ObjectLayerController.post(req, res, options));

  router.post(`/:id`, authMiddleware, async (req, res) => await ObjectLayerController.post(req, res, options));
  router.post(`/`, authMiddleware, async (req, res) => await ObjectLayerController.post(req, res, options));
  router.get(`/:id`, authMiddleware, async (req, res) => await ObjectLayerController.get(req, res, options));
  router.get(`/`, authMiddleware, async (req, res) => await ObjectLayerController.get(req, res, options));
  router.put(`/:id`, authMiddleware, async (req, res) => await ObjectLayerController.put(req, res, options));
  router.put(`/`, authMiddleware, async (req, res) => await ObjectLayerController.put(req, res, options));
  router.delete(`/:id`, authMiddleware, async (req, res) => await ObjectLayerController.delete(req, res, options));
  router.delete(`/`, authMiddleware, async (req, res) => await ObjectLayerController.delete(req, res, options));
  return router;
};

const ApiRouter = ObjectLayerRouter;

export { ApiRouter, ObjectLayerRouter };
