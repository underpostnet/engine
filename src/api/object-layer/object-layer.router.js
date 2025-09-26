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

  router.post(`/:id`, async (req, res) => await ObjectLayerController.post(req, res, options));
  router.post(`/`, async (req, res) => await ObjectLayerController.post(req, res, options));
  router.get(`/:id`, async (req, res) => await ObjectLayerController.get(req, res, options));
  router.get(`/`, async (req, res) => await ObjectLayerController.get(req, res, options));
  router.put(`/:id`, async (req, res) => await ObjectLayerController.put(req, res, options));
  router.put(`/`, async (req, res) => await ObjectLayerController.put(req, res, options));
  router.delete(`/:id`, async (req, res) => await ObjectLayerController.delete(req, res, options));
  router.delete(`/`, async (req, res) => await ObjectLayerController.delete(req, res, options));
  return router;
};

const ApiRouter = ObjectLayerRouter;

export { ApiRouter, ObjectLayerRouter };
