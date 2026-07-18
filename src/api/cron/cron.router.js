import express from 'express';
import { registerCrudRoutes } from '../../server/middlewares.js';
import { adminGuard } from '../../server/auth.js';
import { CronController } from './cron.controller.js';

class CronRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const adminOnly = [options.authMiddleware, adminGuard];
    return registerCrudRoutes(express.Router(), CronController, options, {
      readGuards: adminOnly,
      writeGuards: adminOnly,
      deleteAllGuards: adminOnly,
    });
  }
}

const ApiRouter = (options) => CronRouter.router(options);

export { ApiRouter, CronRouter };
