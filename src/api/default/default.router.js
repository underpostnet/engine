import { authMiddleware } from '../../server/auth.js';
import { loggerFactory } from '../../server/logger.js';
import { DefaultController } from './default.controller.js';
import express from 'express';

const logger = loggerFactory(import.meta);

const DefaultRouter = (options) => {
  const router = express.Router();
  router.post(`/:id`, async (req, res) => await DefaultController.post(req, res, options));
  router.post(`/`, async (req, res) => await DefaultController.post(req, res, options));
  router.get(
    `/:id`,
    // authMiddleware,
    async (req, res) => await DefaultController.get(req, res, options),
  );
  router.get(`/`, async (req, res) => await DefaultController.get(req, res, options));
  router.put(`/:id`, async (req, res) => await DefaultController.put(req, res, options));
  router.put(`/`, async (req, res) => await DefaultController.put(req, res, options));
  router.delete(`/:id`, async (req, res) => await DefaultController.delete(req, res, options));
  router.delete(`/`, async (req, res) => await DefaultController.delete(req, res, options));
  return router;
};

const ApiRouter = DefaultRouter;

export { ApiRouter, DefaultRouter };
