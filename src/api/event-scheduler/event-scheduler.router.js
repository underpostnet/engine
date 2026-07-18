import express from 'express';
import { registerCrudRoutes } from '../../server/middlewares.js';
import { moderatorGuard } from '../../server/auth.js';
import { EventSchedulerController } from './event-scheduler.controller.js';

class EventSchedulerRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const router = express.Router();
    router.get(
      `/creatorUser`,
      options.authMiddleware,
      async (req, res) => await EventSchedulerController.get(req, res, options),
    );
    router.get(
      `/creatorUser/:id`,
      options.authMiddleware,
      async (req, res) => await EventSchedulerController.get(req, res, options),
    );
    // Collection delete uses moderator (not admin) guard, matching prior behavior.
    return registerCrudRoutes(router, EventSchedulerController, options, {
      deleteAllGuards: [options.authMiddleware, moderatorGuard],
    });
  }
}

const ApiRouter = (options) => EventSchedulerRouter.router(options);

export { ApiRouter, EventSchedulerRouter };
