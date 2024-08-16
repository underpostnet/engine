import { authMiddleware } from '../../server/auth.js';
import { loggerFactory } from '../../server/logger.js';
import { CoreController } from './core.controller.js';
import express from 'express';

const logger = loggerFactory(import.meta);

const CoreRouter = (options) => {
  const router = express.Router();
  router.post(`/:id`, async (req, res) => await CoreController.post(req, res, options));
  router.post(`/`, async (req, res) => await CoreController.post(req, res, options));
  router.get(`/:id`, async (req, res) => await CoreController.get(req, res, options));
  router.get(`/`, async (req, res) => await CoreController.get(req, res, options));
  router.put(`/:id`, async (req, res) => await CoreController.put(req, res, options));
  router.put(`/`, async (req, res) => await CoreController.put(req, res, options));
  router.delete(`/:id`, async (req, res) => await CoreController.delete(req, res, options));
  router.delete(`/`, async (req, res) => await CoreController.delete(req, res, options));
  return router;
};

const ApiRouter = CoreRouter;

export { ApiRouter, CoreRouter };
