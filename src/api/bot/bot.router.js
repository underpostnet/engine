import { authMiddleware } from '../../server/auth.js';
import { loggerFactory } from '../../server/logger.js';
import { BotController } from './bot.controller.js';
import express from 'express';

const logger = loggerFactory(import.meta);

const BotRouter = (options) => {
  const router = express.Router();
  router.post(`/:id`, async (req, res) => await BotController.post(req, res, options));
  router.post(`/`, async (req, res) => await BotController.post(req, res, options));
  router.get(`/:id`, async (req, res) => await BotController.get(req, res, options));
  router.get(`/`, async (req, res) => await BotController.get(req, res, options));
  router.put(`/:id`, async (req, res) => await BotController.put(req, res, options));
  router.put(`/`, async (req, res) => await BotController.put(req, res, options));
  router.delete(`/:id`, async (req, res) => await BotController.delete(req, res, options));
  router.delete(`/`, async (req, res) => await BotController.delete(req, res, options));
  return router;
};

const ApiRouter = BotRouter;

export { ApiRouter, BotRouter };
