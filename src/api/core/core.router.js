import express from 'express';
import { registerCrudRoutes } from '../../server/middlewares.js';
import { adminGuard } from '../../server/auth.js';
import { CoreController } from './core.controller.js';

class CoreRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const adminOnly = [options.authMiddleware, adminGuard];
    return registerCrudRoutes(express.Router(), CoreController, options, {
      readGuards: adminOnly,
      writeGuards: adminOnly,
      deleteAllGuards: adminOnly,
    });
  }
}

const ApiRouter = (options) => CoreRouter.router(options);

export { ApiRouter, CoreRouter };
