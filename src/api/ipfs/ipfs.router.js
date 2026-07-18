import express from 'express';
import { registerCrudRoutes } from '../../server/middlewares.js';
import { adminGuard } from '../../server/auth.js';
import { IpfsController } from './ipfs.controller.js';

class IpfsRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const router = express.Router();
    const adminOnly = [options.authMiddleware, adminGuard];
    // Health / audit — must come before /:id to avoid matching conflicts.
    router.get(`/verify`, ...adminOnly, async (req, res) => await IpfsController.verify(req, res, options));
    return registerCrudRoutes(router, IpfsController, options, {
      readGuards: adminOnly,
      writeGuards: adminOnly,
      deleteAllGuards: adminOnly,
    });
  }
}

const ApiRouter = (options) => IpfsRouter.router(options);

export { ApiRouter, IpfsRouter };
