import { loggerFactory } from '../../server/logger.js';
import { CyberiaTileController } from './cyberia-tile.controller.js';
import express from 'express';
const logger = loggerFactory(import.meta);

const CyberiaTileRouter = (options) => {
  const router = express.Router();
  const endpoint = 'cyberia-tile';
  router.post(`/${endpoint}/:id`, async (req, res) => await CyberiaTileController.post(req, res, options));
  router.post(`/${endpoint}`, async (req, res) => await CyberiaTileController.post(req, res, options));
  router.get(`/${endpoint}/:id`, async (req, res) => await CyberiaTileController.get(req, res, options));
  router.get(`/${endpoint}`, async (req, res) => await CyberiaTileController.get(req, res, options));
  router.delete(`/${endpoint}/:id`, async (req, res) => await CyberiaTileController.delete(req, res, options));
  router.delete(`/${endpoint}`, async (req, res) => await CyberiaTileController.delete(req, res, options));
  return router;
};

const ApiRouter = CyberiaTileRouter;

export { ApiRouter, CyberiaTileRouter };
