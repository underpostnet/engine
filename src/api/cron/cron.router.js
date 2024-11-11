import { adminGuard, authMiddleware } from '../../server/auth.js';
import { loggerFactory } from '../../server/logger.js';
import { CronController } from './cron.controller.js';
import express from 'express';

const logger = loggerFactory(import.meta);

const CronRouter = (options) => {
  const router = express.Router();
  router.post(`/:id`, authMiddleware, adminGuard, async (req, res) => await CronController.post(req, res, options));
  router.post(`/`, authMiddleware, adminGuard, async (req, res) => await CronController.post(req, res, options));
  router.get(`/:id`, authMiddleware, adminGuard, async (req, res) => await CronController.get(req, res, options));
  router.get(`/`, authMiddleware, adminGuard, async (req, res) => await CronController.get(req, res, options));
  router.put(`/:id`, authMiddleware, adminGuard, async (req, res) => await CronController.put(req, res, options));
  router.put(`/`, authMiddleware, adminGuard, async (req, res) => await CronController.put(req, res, options));
  router.delete(`/:id`, authMiddleware, adminGuard, async (req, res) => await CronController.delete(req, res, options));
  router.delete(`/`, authMiddleware, adminGuard, async (req, res) => await CronController.delete(req, res, options));
  return router;
};

const ApiRouter = CronRouter;

export { ApiRouter, CronRouter };
