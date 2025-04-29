import { authMiddleware } from '../../server/auth.js';
import { loggerFactory } from '../../server/logger.js';
import { PopController } from './pop.controller.js';
import express from 'express';

const logger = loggerFactory(import.meta);

const PopRouter = (options) => {
  const router = express.Router();
  router.post(`/:id`, async (req, res) => await PopController.post(req, res, options));
  router.post(`/`, async (req, res) => await PopController.post(req, res, options));
  router.get(`/:id`, async (req, res) => await PopController.get(req, res, options));
  router.get(`/`, async (req, res) => await PopController.get(req, res, options));
  router.put(`/:id`, async (req, res) => await PopController.put(req, res, options));
  router.put(`/`, async (req, res) => await PopController.put(req, res, options));
  router.delete(`/:id`, async (req, res) => await PopController.delete(req, res, options));
  router.delete(`/`, async (req, res) => await PopController.delete(req, res, options));
  return router;
};

const ApiRouter = PopRouter;

export { ApiRouter, PopRouter };
