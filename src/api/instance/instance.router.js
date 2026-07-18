import express from 'express';
import { adminGuard } from '../../server/auth.js';
import { InstanceController } from './instance.controller.js';

class InstanceRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const router = express.Router();
    const adminOnly = [options.authMiddleware, adminGuard];
    router.post(`/:id`, ...adminOnly, async (req, res) => await InstanceController.post(req, res, options));
    router.post(`/`, ...adminOnly, async (req, res) => await InstanceController.post(req, res, options));
    router.get(`/:id`, ...adminOnly, async (req, res) => await InstanceController.get(req, res, options));
    router.get(`/`, options.authMiddleware, async (req, res) => await InstanceController.get(req, res, options));
    router.put(`/:id`, ...adminOnly, async (req, res) => await InstanceController.put(req, res, options));
    router.put(`/`, ...adminOnly, async (req, res) => await InstanceController.put(req, res, options));
    router.delete(`/:id`, ...adminOnly, async (req, res) => await InstanceController.delete(req, res, options));
    router.delete(`/`, ...adminOnly, async (req, res) => await InstanceController.delete(req, res, options));
    return router;
  }
}

const ApiRouter = (options) => InstanceRouter.router(options);

export { ApiRouter, InstanceRouter };
