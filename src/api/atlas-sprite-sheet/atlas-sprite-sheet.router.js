import { loggerFactory } from '../../server/logger.js';
import { AtlasSpriteSheetController } from './atlas-sprite-sheet.controller.js';
import express from 'express';

const logger = loggerFactory(import.meta);

const AtlasSpriteSheetRouter = (options) => {
  const router = express.Router();
  const authMiddleware = options.authMiddleware;
  router.post(`/:id`, async (req, res) => await AtlasSpriteSheetController.post(req, res, options));
  router.post(`/`, async (req, res) => await AtlasSpriteSheetController.post(req, res, options));
  router.get(
    `/:id`,
    // authMiddleware,
    async (req, res) => await AtlasSpriteSheetController.get(req, res, options),
  );
  router.get(`/`, async (req, res) => await AtlasSpriteSheetController.get(req, res, options));
  router.put(`/:id`, async (req, res) => await AtlasSpriteSheetController.put(req, res, options));
  router.put(`/`, async (req, res) => await AtlasSpriteSheetController.put(req, res, options));
  router.delete(`/:id`, async (req, res) => await AtlasSpriteSheetController.delete(req, res, options));
  router.delete(`/`, async (req, res) => await AtlasSpriteSheetController.delete(req, res, options));
  return router;
};

const ApiRouter = AtlasSpriteSheetRouter;

export { ApiRouter, AtlasSpriteSheetRouter };
