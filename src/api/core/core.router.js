import { adminGuard } from '../../server/auth.js';
import { loggerFactory } from '../../server/logger.js';
import { CoreController } from './core.controller.js';
import express from 'express';

const logger = loggerFactory(import.meta);

const CoreRouter = (options) => {
  const router = express.Router();
  const authMiddleware = options.authMiddleware;
  router.post(`/:id`, authMiddleware, adminGuard, async (req, res) => await CoreController.post(req, res, options));
  router.post(`/`, authMiddleware, adminGuard, async (req, res) => await CoreController.post(req, res, options));
  router.get(`/:id`, authMiddleware, adminGuard, async (req, res) => await CoreController.get(req, res, options));
  router.get(`/`, authMiddleware, adminGuard, async (req, res) => await CoreController.get(req, res, options));
  router.put(`/:id`, authMiddleware, adminGuard, async (req, res) => await CoreController.put(req, res, options));
  router.put(`/`, authMiddleware, adminGuard, async (req, res) => await CoreController.put(req, res, options));
  router.delete(`/:id`, authMiddleware, adminGuard, async (req, res) => await CoreController.delete(req, res, options));
  router.delete(`/`, authMiddleware, adminGuard, async (req, res) => await CoreController.delete(req, res, options));
  return router;
};

const ApiRouter = CoreRouter;

export { ApiRouter, CoreRouter };
