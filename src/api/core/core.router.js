import { authMiddleware } from '../../server/auth.js';
import { loggerFactory } from '../../server/logger.js';
import { CoreController } from './core.controller.js';
import express from 'express';

const logger = loggerFactory(import.meta);

const CoreRouter = (options) => {
  const router = express.Router();
  const endpoint = 'core';
  router.post(`/${endpoint}/:id`, async (req, res) => await CoreController.post(req, res, options));
  router.post(`/${endpoint}`, async (req, res) => await CoreController.post(req, res, options));
  router.get(`/${endpoint}/:id`, async (req, res) => await CoreController.get(req, res, options));
  router.get(`/${endpoint}`, async (req, res) => await CoreController.get(req, res, options));
  router.put(`/${endpoint}/:id`, async (req, res) => await CoreController.put(req, res, options));
  router.put(`/${endpoint}`, async (req, res) => await CoreController.put(req, res, options));
  router.delete(`/${endpoint}/:id`, async (req, res) => await CoreController.delete(req, res, options));
  router.delete(`/${endpoint}`, async (req, res) => await CoreController.delete(req, res, options));
  return router;
};

const ApiRouter = CoreRouter;

export { ApiRouter, CoreRouter };
