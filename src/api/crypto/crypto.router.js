import { authMiddleware } from '../../server/auth.js';
import { loggerFactory } from '../../server/logger.js';
import { CryptoController } from './crypto.controller.js';
import express from 'express';
const logger = loggerFactory(import.meta);

const CryptoRouter = (options) => {
  const router = express.Router();
  const endpoint = 'crypto';
  router.post(`/${endpoint}/:id`, async (req, res) => await CryptoController.post(req, res, options));
  router.post(`/${endpoint}`, authMiddleware, async (req, res) => await CryptoController.post(req, res, options));
  router.get(`/${endpoint}/:id`, async (req, res) => await CryptoController.get(req, res, options));
  router.get(`/${endpoint}`, async (req, res) => await CryptoController.get(req, res, options));
  router.delete(`/${endpoint}/:id`, async (req, res) => await CryptoController.delete(req, res, options));
  router.delete(`/${endpoint}`, async (req, res) => await CryptoController.delete(req, res, options));
  return router;
};

const ApiRouter = CryptoRouter;

export { ApiRouter, CryptoRouter };
