import express from 'express';
import { registerCrudRoutes } from '../../server/middlewares.js';
import { DocumentController } from './document.controller.js';

class DocumentRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const router = express.Router();
    const authOnly = [options.authMiddleware];
    // Public listings — must come before the guarded generic /:id routes.
    router.get(`/public/high`, async (req, res) => await DocumentController.get(req, res, options));
    router.get(`/public`, async (req, res) => await DocumentController.get(req, res, options));
    router.patch(`/:id/copy-share-link`, async (req, res) => await DocumentController.patch(req, res, options));
    router.patch(
      `/:id/toggle-public`,
      options.authMiddleware,
      async (req, res) => await DocumentController.patch(req, res, options),
    );
    return registerCrudRoutes(router, DocumentController, options, {
      readGuards: authOnly,
      writeGuards: authOnly,
      deleteAllGuards: authOnly,
    });
  }
}

const ApiRouter = (options) => DocumentRouter.router(options);

export { ApiRouter, DocumentRouter };
