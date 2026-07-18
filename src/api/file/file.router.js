import express from 'express';
import { adminGuard } from '../../server/auth.js';
import { FileController } from './file.controller.js';

class FileRouter {
  /**
   * authenticated writes, admin-only deletes.
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const router = express.Router();
    router.post(`/:id`, options.authMiddleware, async (req, res) => await FileController.post(req, res, options));
    router.post(`/`, options.authMiddleware, async (req, res) => await FileController.post(req, res, options));
    router.get(`/blob/:id`, async (req, res) => await FileController.get(req, res, options));
    router.get(`/:id`, async (req, res) => await FileController.get(req, res, options));
    router.get(`/`, async (req, res) => await FileController.get(req, res, options));
    router.delete(
      `/:id`,
      options.authMiddleware,
      adminGuard,
      async (req, res) => await FileController.delete(req, res, options),
    );
    router.delete(
      `/`,
      options.authMiddleware,
      adminGuard,
      async (req, res) => await FileController.delete(req, res, options),
    );
    return router;
  }
}

const ApiRouter = (options) => FileRouter.router(options);

export { ApiRouter, FileRouter };
