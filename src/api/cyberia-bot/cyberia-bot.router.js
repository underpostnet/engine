import { authMiddleware } from '../../server/auth.js';
import { loggerFactory } from '../../server/logger.js';
import { CyberiaBotController } from './cyberia-bot.controller.js';
import express from 'express';

const logger = loggerFactory(import.meta);

const CyberiaBotRouter = (options) => {
  const router = express.Router();
  const endpoint = 'cyberia-bot';
  router.post(`/${endpoint}/:id`, async (req, res) => await CyberiaBotController.post(req, res, options));
  router.post(`/${endpoint}`, async (req, res) => await CyberiaBotController.post(req, res, options));
  router.get(`/${endpoint}/:id`, async (req, res) => await CyberiaBotController.get(req, res, options));
  router.get(`/${endpoint}`, async (req, res) => await CyberiaBotController.get(req, res, options));
  router.put(`/${endpoint}/:id`, async (req, res) => await CyberiaBotController.put(req, res, options));
  router.put(`/${endpoint}`, async (req, res) => await CyberiaBotController.put(req, res, options));
  router.delete(`/${endpoint}/:id`, async (req, res) => await CyberiaBotController.delete(req, res, options));
  router.delete(`/${endpoint}`, async (req, res) => await CyberiaBotController.delete(req, res, options));
  return router;
};

const ApiRouter = CyberiaBotRouter;

export { ApiRouter, CyberiaBotRouter };
