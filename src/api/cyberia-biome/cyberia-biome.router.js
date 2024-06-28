import { moderatorGuard, authMiddleware, adminGuard } from '../../server/auth.js';
import { loggerFactory } from '../../server/logger.js';
import { CyberiaBiomeController } from './cyberia-biome.controller.js';
import express from 'express';
const logger = loggerFactory(import.meta);

const CyberiaBiomeRouter = (options) => {
  const router = express.Router();
  const endpoint = 'cyberia-biome';
  router.post(
    `/${endpoint}/:id`,
    authMiddleware,
    moderatorGuard,
    async (req, res) => await CyberiaBiomeController.post(req, res, options),
  );
  router.post(
    `/${endpoint}`,
    authMiddleware,
    moderatorGuard,
    async (req, res) => await CyberiaBiomeController.post(req, res, options),
  );
  router.get(`/${endpoint}/:id`, async (req, res) => await CyberiaBiomeController.get(req, res, options));
  router.get(`/${endpoint}`, async (req, res) => await CyberiaBiomeController.get(req, res, options));
  router.delete(
    `/${endpoint}/:id`,
    authMiddleware,
    adminGuard,
    async (req, res) => await CyberiaBiomeController.delete(req, res, options),
  );
  router.delete(
    `/${endpoint}`,
    authMiddleware,
    adminGuard,
    async (req, res) => await CyberiaBiomeController.delete(req, res, options),
  );
  return router;
};

const ApiRouter = CyberiaBiomeRouter;

export { ApiRouter, CyberiaBiomeRouter };
