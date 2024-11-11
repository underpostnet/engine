import { authMiddleware } from '../../server/auth.js';
import { loggerFactory } from '../../server/logger.js';
import { CronController } from './cron.controller.js';
import express from 'express';

const logger = loggerFactory(import.meta);

const CronRouter = (options) => {
  const router = express.Router();
  router.post(`/:id`, async (req, res) => await CronController.post(req, res, options));
  router.post(`/`, async (req, res) => await CronController.post(req, res, options));
  router.get(`/:id`, async (req, res) => await CronController.get(req, res, options));
  router.get(`/`, async (req, res) => await CronController.get(req, res, options));
  router.put(`/:id`, async (req, res) => await CronController.put(req, res, options));
  router.put(`/`, async (req, res) => await CronController.put(req, res, options));
  router.delete(`/:id`, async (req, res) => await CronController.delete(req, res, options));
  router.delete(`/`, async (req, res) => await CronController.delete(req, res, options));
  return router;
};

const ApiRouter = CronRouter;

export { ApiRouter, CronRouter };
