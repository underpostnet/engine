import { moderatorGuard } from '../../server/auth.js';
import { loggerFactory } from '../../server/logger.js';
import { EventSchedulerController } from './event-scheduler.controller.js';
import express from 'express';

const logger = loggerFactory(import.meta);

class EventSchedulerRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const router = express.Router();
    router.post(
      `/:id`,
      options.authMiddleware,
      moderatorGuard,
      async (req, res) => await EventSchedulerController.post(req, res, options),
    );
    router.post(
      `/`,
      options.authMiddleware,
      moderatorGuard,
      async (req, res) => await EventSchedulerController.post(req, res, options),
    );
    router.get(`/creatorUser`, options.authMiddleware, async (req, res) => await EventSchedulerController.get(req, res, options));
    router.get(
      `/creatorUser/:id`,
      options.authMiddleware,
      async (req, res) => await EventSchedulerController.get(req, res, options),
    );
    router.get(`/:id`, async (req, res) => await EventSchedulerController.get(req, res, options));
    router.get(`/`, async (req, res) => await EventSchedulerController.get(req, res, options));
    router.put(
      `/:id`,
      options.authMiddleware,
      moderatorGuard,
      async (req, res) => await EventSchedulerController.put(req, res, options),
    );
    router.put(
      `/`,
      options.authMiddleware,
      moderatorGuard,
      async (req, res) => await EventSchedulerController.put(req, res, options),
    );
    router.delete(
      `/:id`,
      options.authMiddleware,
      moderatorGuard,
      async (req, res) => await EventSchedulerController.delete(req, res, options),
    );
    router.delete(
      `/`,
      options.authMiddleware,
      moderatorGuard,
      async (req, res) => await EventSchedulerController.delete(req, res, options),
    );
    return router;
  }
}

const ApiRouter = (options) => EventSchedulerRouter.router(options);

export { ApiRouter, EventSchedulerRouter };
