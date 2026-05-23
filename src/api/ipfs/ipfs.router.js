import { adminGuard } from '../../server/auth.js';
import { loggerFactory } from '../../server/logger.js';
import { IpfsController } from './ipfs.controller.js';
import express from 'express';

const logger = loggerFactory(import.meta);

class IpfsRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const router = express.Router();
    // Health / audit — must come before /:id to avoid matching conflicts.
    router.get(`/verify`, options.authMiddleware, adminGuard, async (req, res) => await IpfsController.verify(req, res, options));
    router.post(`/:id`, options.authMiddleware, adminGuard, async (req, res) => await IpfsController.post(req, res, options));
    router.post(`/`, options.authMiddleware, adminGuard, async (req, res) => await IpfsController.post(req, res, options));
    router.get(`/:id`, options.authMiddleware, adminGuard, async (req, res) => await IpfsController.get(req, res, options));
    router.get(`/`, options.authMiddleware, adminGuard, async (req, res) => await IpfsController.get(req, res, options));
    router.put(`/:id`, options.authMiddleware, adminGuard, async (req, res) => await IpfsController.put(req, res, options));
    router.put(`/`, options.authMiddleware, adminGuard, async (req, res) => await IpfsController.put(req, res, options));
    router.delete(`/:id`, options.authMiddleware, adminGuard, async (req, res) => await IpfsController.delete(req, res, options));
    router.delete(`/`, options.authMiddleware, adminGuard, async (req, res) => await IpfsController.delete(req, res, options));
    return router;
  }
}

const ApiRouter = (options) => IpfsRouter.router(options);

export { ApiRouter, IpfsRouter };
