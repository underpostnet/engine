import { endpointFactory } from '../../client/components/core/CommonJs.js';
import { loggerFactory } from '../../server/logger.js';
import { CryptoController } from './crypto.controller.js';
import express from 'express';

const endpoint = endpointFactory(import.meta);
const meta = { url: `api-${endpoint}-router` };
const logger = loggerFactory(meta);

const CryptoRouter = (options) => {
  const router = express.Router();
  router.post(`${endpoint}/:id`, async (req, res) => await CryptoController.post(req, res, options));
  router.post(`${endpoint}`, async (req, res) => await CryptoController.post(req, res, options));
  router.get(`${endpoint}/:id`, async (req, res) => await CryptoController.get(req, res, options));
  router.get(`${endpoint}`, async (req, res) => await CryptoController.get(req, res, options));
  router.delete(`${endpoint}/:id`, async (req, res) => await CryptoController.delete(req, res, options));
  router.delete(`${endpoint}`, async (req, res) => await CryptoController.delete(req, res, options));
  return router;
};

const ApiRouter = CryptoRouter;

export { ApiRouter, CryptoRouter };
