import { authMiddleware } from '../../server/auth.js';
import { loggerFactory } from '../../server/logger.js';
import { EventSchedulerController } from './event-scheduler.controller.js';
import express from 'express';

const logger = loggerFactory(import.meta);

const EventSchedulerRouter = (options) => {
  const router = express.Router();
  router.post(`/:id`, authMiddleware, async (req, res) => await EventSchedulerController.post(req, res, options));
  router.post(`/`, authMiddleware, async (req, res) => await EventSchedulerController.post(req, res, options));
  router.get(`/creatorUser`, authMiddleware, async (req, res) => await EventSchedulerController.get(req, res, options));
  router.get(
    `/creatorUser/:id`,
    authMiddleware,
    async (req, res) => await EventSchedulerController.get(req, res, options),
  );
  router.get(`/:id`, async (req, res) => await EventSchedulerController.get(req, res, options));
  router.get(`/`, async (req, res) => await EventSchedulerController.get(req, res, options));
  router.put(`/:id`, authMiddleware, async (req, res) => await EventSchedulerController.put(req, res, options));
  router.put(`/`, authMiddleware, async (req, res) => await EventSchedulerController.put(req, res, options));
  router.delete(`/:id`, authMiddleware, async (req, res) => await EventSchedulerController.delete(req, res, options));
  router.delete(`/`, authMiddleware, async (req, res) => await EventSchedulerController.delete(req, res, options));
  return router;
};

const ApiRouter = EventSchedulerRouter;

export { ApiRouter, EventSchedulerRouter };
