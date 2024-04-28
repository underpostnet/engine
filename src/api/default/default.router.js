import { authMiddleware } from '../../server/auth.js';
import { loggerFactory } from '../../server/logger.js';
import { DefaultController } from './default.controller.js';
import express from 'express';

const logger = loggerFactory(import.meta);

const DefaultRouter = (options) => {
  const router = express.Router();
  const endpoint = 'default';
  router.post(`/${endpoint}/:id`, async (req, res) => await DefaultController.post(req, res, options));
  router.post(`/${endpoint}`, async (req, res) => await DefaultController.post(req, res, options));
  router.get(`/${endpoint}/:id`, async (req, res) => await DefaultController.get(req, res, options));
  router.get(`/${endpoint}`, async (req, res) => await DefaultController.get(req, res, options));
  router.put(`/${endpoint}/:id`, async (req, res) => await DefaultController.put(req, res, options));
  router.put(`/${endpoint}`, async (req, res) => await DefaultController.put(req, res, options));
  router.delete(`/${endpoint}/:id`, async (req, res) => await DefaultController.delete(req, res, options));
  router.delete(`/${endpoint}`, async (req, res) => await DefaultController.delete(req, res, options));
  return router;
};

const ApiRouter = DefaultRouter;

export { ApiRouter, DefaultRouter };
