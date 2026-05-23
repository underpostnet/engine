import { loggerFactory } from '../../server/logger.js';
import { DocumentController } from './document.controller.js';
import express from 'express';

const logger = loggerFactory(import.meta);

class DocumentRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const router = express.Router();
    router.post(`/:id`, options.authMiddleware, async (req, res) => await DocumentController.post(req, res, options));
    router.post(`/`, options.authMiddleware, async (req, res) => await DocumentController.post(req, res, options));
    router.get(`/public/high`, async (req, res) => await DocumentController.get(req, res, options));
    router.get(`/public`, async (req, res) => await DocumentController.get(req, res, options));
    router.get(`/:id`, options.authMiddleware, async (req, res) => await DocumentController.get(req, res, options));
    router.get(`/`, options.authMiddleware, async (req, res) => await DocumentController.get(req, res, options));
    router.put(`/:id`, options.authMiddleware, async (req, res) => await DocumentController.put(req, res, options));
    router.put(`/`, options.authMiddleware, async (req, res) => await DocumentController.put(req, res, options));
    router.patch(`/:id/copy-share-link`, async (req, res) => await DocumentController.patch(req, res, options));
    router.patch(
      `/:id/toggle-public`,
      options.authMiddleware,
      async (req, res) => await DocumentController.patch(req, res, options),
    );
    router.delete(`/:id`, options.authMiddleware, async (req, res) => await DocumentController.delete(req, res, options));
    router.delete(`/`, options.authMiddleware, async (req, res) => await DocumentController.delete(req, res, options));
    return router;
  }
}

const ApiRouter = (options) => DocumentRouter.router(options);

export { ApiRouter, DocumentRouter };
