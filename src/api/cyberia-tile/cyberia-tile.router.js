import { endpointFactory } from '../../client/components/core/CommonJs.js';
import { loggerFactory } from '../../server/logger.js';
import { CyberiaTileController } from './cyberia-tile.controller.js';
import express from 'express';

const endpoint = endpointFactory(import.meta);
const meta = { url: `api-${endpoint}-router` };
const logger = loggerFactory(meta);

const CyberiaTileRouter = (options) => {
  const router = express.Router();
  router.post(`${endpoint}/:id`, async (req, res) => await CyberiaTileController.post(req, res, options));
  router.post(`${endpoint}`, async (req, res) => await CyberiaTileController.post(req, res, options));
  router.get(`${endpoint}/:id`, async (req, res) => await CyberiaTileController.get(req, res, options));
  router.get(`${endpoint}`, async (req, res) => await CyberiaTileController.get(req, res, options));
  router.delete(`${endpoint}/:id`, async (req, res) => await CyberiaTileController.delete(req, res, options));
  router.delete(`${endpoint}`, async (req, res) => await CyberiaTileController.delete(req, res, options));
  return router;
};

const ApiRouter = CyberiaTileRouter;

export { ApiRouter, CyberiaTileRouter };
