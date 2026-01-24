import { loggerFactory } from '../../server/logger.js';
import { AtlasSpriteSheetController } from './atlas-sprite-sheet.controller.js';
import express from 'express';

const logger = loggerFactory(import.meta);

const AtlasSpriteSheetRouter = (options) => {
  const router = express.Router();
  const authMiddleware = options.authMiddleware;
  router.post(
    `/generate/:id`,
    authMiddleware,
    async (req, res) => await AtlasSpriteSheetController.generate(req, res, options),
  );
  router.delete(
    `/object-layer/:id`,
    authMiddleware,
    async (req, res) => await AtlasSpriteSheetController.deleteByObjectLayerId(req, res, options),
  );
  router.post(`/:id`, authMiddleware, async (req, res) => await AtlasSpriteSheetController.post(req, res, options));
  router.post(`/`, authMiddleware, async (req, res) => await AtlasSpriteSheetController.post(req, res, options));
  router.get(
    `/:id`,
    // authMiddleware,
    async (req, res) => await AtlasSpriteSheetController.get(req, res, options),
  );
  router.get(`/`, async (req, res) => await AtlasSpriteSheetController.get(req, res, options));
  router.put(`/:id`, authMiddleware, async (req, res) => await AtlasSpriteSheetController.put(req, res, options));
  router.put(`/`, authMiddleware, async (req, res) => await AtlasSpriteSheetController.put(req, res, options));
  router.delete(`/:id`, authMiddleware, async (req, res) => await AtlasSpriteSheetController.delete(req, res, options));
  router.delete(`/`, authMiddleware, async (req, res) => await AtlasSpriteSheetController.delete(req, res, options));
  return router;
};

const ApiRouter = AtlasSpriteSheetRouter;

export { ApiRouter, AtlasSpriteSheetRouter };
