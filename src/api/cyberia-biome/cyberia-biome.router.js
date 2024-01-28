import { endpointFactory } from '../../client/components/core/CommonJs.js';
import { loggerFactory } from '../../server/logger.js';
import { CyberiaBiomeController } from './cyberia-biome.controller.js';
import express from 'express';

const endpoint = endpointFactory(import.meta);
const meta = { url: `api-${endpoint}-router` };
const logger = loggerFactory(meta);

const CyberiaBiomeRouter = (options) => {
  const router = express.Router();
  router.post(`${endpoint}/:id`, async (req, res) => await CyberiaBiomeController.post(req, res, options));
  router.post(`${endpoint}`, async (req, res) => await CyberiaBiomeController.post(req, res, options));
  router.get(`${endpoint}/:id`, async (req, res) => await CyberiaBiomeController.get(req, res, options));
  router.get(`${endpoint}`, async (req, res) => await CyberiaBiomeController.get(req, res, options));
  router.delete(`${endpoint}/:id`, async (req, res) => await CyberiaBiomeController.delete(req, res, options));
  router.delete(`${endpoint}`, async (req, res) => await CyberiaBiomeController.delete(req, res, options));
  return router;
};

const ApiRouter = CyberiaBiomeRouter;

export { ApiRouter, CyberiaBiomeRouter };
