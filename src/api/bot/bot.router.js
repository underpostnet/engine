import { authMiddleware } from '../../server/auth.js';
import { loggerFactory } from '../../server/logger.js';
import { BotController } from './bot.controller.js';
import express from 'express';

const logger = loggerFactory(import.meta);

const BotRouter = (options) => {
  const router = express.Router();
  const endpoint = 'bot';
  router.post(`/${endpoint}/:id`, async (req, res) => await BotController.post(req, res, options));
  router.post(`/${endpoint}`, async (req, res) => await BotController.post(req, res, options));
  router.get(`/${endpoint}/:id`, async (req, res) => await BotController.get(req, res, options));
  router.get(`/${endpoint}`, async (req, res) => await BotController.get(req, res, options));
  router.put(`/${endpoint}/:id`, async (req, res) => await BotController.put(req, res, options));
  router.put(`/${endpoint}`, async (req, res) => await BotController.put(req, res, options));
  router.delete(`/${endpoint}/:id`, async (req, res) => await BotController.delete(req, res, options));
  router.delete(`/${endpoint}`, async (req, res) => await BotController.delete(req, res, options));
  return router;
};

const ApiRouter = BotRouter;

export { ApiRouter, BotRouter };
