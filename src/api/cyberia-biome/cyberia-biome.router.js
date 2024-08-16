import { moderatorGuard, authMiddleware, adminGuard } from '../../server/auth.js';
import { loggerFactory } from '../../server/logger.js';
import { CyberiaBiomeController } from './cyberia-biome.controller.js';
import express from 'express';
const logger = loggerFactory(import.meta);

const CyberiaBiomeRouter = (options) => {
  const router = express.Router();
  router.post(
    `/:id`,
    authMiddleware,
    moderatorGuard,
    async (req, res) => await CyberiaBiomeController.post(req, res, options),
  );
  router.post(
    `/`,
    authMiddleware,
    moderatorGuard,
    async (req, res) => await CyberiaBiomeController.post(req, res, options),
  );
  router.get(`/:id`, async (req, res) => await CyberiaBiomeController.get(req, res, options));
  router.get(`/`, async (req, res) => await CyberiaBiomeController.get(req, res, options));
  router.delete(
    `/:id`,
    authMiddleware,
    adminGuard,
    async (req, res) => await CyberiaBiomeController.delete(req, res, options),
  );
  router.delete(
    `/`,
    authMiddleware,
    adminGuard,
    async (req, res) => await CyberiaBiomeController.delete(req, res, options),
  );
  return router;
};

const ApiRouter = CyberiaBiomeRouter;

export { ApiRouter, CyberiaBiomeRouter };
