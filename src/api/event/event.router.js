import { authMiddleware } from '../../server/auth.js';
import { loggerFactory } from '../../server/logger.js';
import { EventController } from './event.controller.js';
import express from 'express';

const logger = loggerFactory(import.meta);

const EventRouter = (options) => {
  const router = express.Router();
  router.post(`/:id`, async (req, res) => await EventController.post(req, res, options));
  router.post(`/`, async (req, res) => await EventController.post(req, res, options));
  router.get(`/:id`, async (req, res) => await EventController.get(req, res, options));
  router.get(`/`, async (req, res) => await EventController.get(req, res, options));
  router.put(`/:id`, async (req, res) => await EventController.put(req, res, options));
  router.put(`/`, async (req, res) => await EventController.put(req, res, options));
  router.delete(`/:id`, async (req, res) => await EventController.delete(req, res, options));
  router.delete(`/`, async (req, res) => await EventController.delete(req, res, options));
  return router;
};

const ApiRouter = EventRouter;

export { ApiRouter, EventRouter };
