import { authMiddleware } from '../../server/auth.js';
import { loggerFactory } from '../../server/logger.js';
import { TestController } from './test.controller.js';
import express from 'express';

const logger = loggerFactory(import.meta);

const TestRouter = (options) => {
  const router = express.Router();
  const endpoint = 'blockchain';
  router.post(`/${endpoint}/:id`, async (req, res) => await TestController.post(req, res, options));
  router.post(`/${endpoint}`, authMiddleware, async (req, res) => await TestController.post(req, res, options));
  router.get(`/${endpoint}/:id`, async (req, res) => await TestController.get(req, res, options));
  router.get(`/${endpoint}`, async (req, res) => await TestController.get(req, res, options));
  router.delete(`/${endpoint}/:id`, async (req, res) => await TestController.delete(req, res, options));
  router.delete(`/${endpoint}`, async (req, res) => await TestController.delete(req, res, options));
  return router;
};

const ApiRouter = TestRouter;

export { ApiRouter, TestRouter };
