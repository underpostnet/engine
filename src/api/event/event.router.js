import { authMiddleware } from '../../server/auth.js';
import { loggerFactory } from '../../server/logger.js';
import { EventController } from './event.controller.js';
import express from 'express';

const logger = loggerFactory(import.meta);

const EventRouter = (options) => {
  const router = express.Router();
  const endpoint = 'event';
  router.post(`/${endpoint}/:id`, async (req, res) => await EventController.post(req, res, options));
  router.post(`/${endpoint}`, async (req, res) => await EventController.post(req, res, options));
  router.get(`/${endpoint}/:id`, async (req, res) => await EventController.get(req, res, options));
  router.get(`/${endpoint}`, async (req, res) => await EventController.get(req, res, options));
  router.put(`/${endpoint}/:id`, async (req, res) => await EventController.put(req, res, options));
  router.put(`/${endpoint}`, async (req, res) => await EventController.put(req, res, options));
  router.delete(`/${endpoint}/:id`, async (req, res) => await EventController.delete(req, res, options));
  router.delete(`/${endpoint}`, async (req, res) => await EventController.delete(req, res, options));
  return router;
};

const ApiRouter = EventRouter;

export { ApiRouter, EventRouter };
