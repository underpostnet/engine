import { loggerFactory } from '../../server/logger.js';
import { DocumentController } from './document.controller.js';
import express from 'express';
import fs from 'fs-extra';
const logger = loggerFactory(import.meta);

const DocumentRouter = (options) => {
  const router = express.Router();
  const authMiddleware = options.authMiddleware;
  router.post(`/:id`, authMiddleware, async (req, res) => await DocumentController.post(req, res, options));
  router.post(`/`, authMiddleware, async (req, res) => await DocumentController.post(req, res, options));
  router.get(`/public`, async (req, res) => await DocumentController.get(req, res, options));
  router.get(`/:id`, authMiddleware, async (req, res) => await DocumentController.get(req, res, options));
  router.get(`/`, authMiddleware, async (req, res) => await DocumentController.get(req, res, options));
  router.put(`/:id`, authMiddleware, async (req, res) => await DocumentController.put(req, res, options));
  router.put(`/`, authMiddleware, async (req, res) => await DocumentController.put(req, res, options));
  router.delete(`/:id`, authMiddleware, async (req, res) => await DocumentController.delete(req, res, options));
  router.delete(`/`, authMiddleware, async (req, res) => await DocumentController.delete(req, res, options));
  return router;
};

const ApiRouter = DocumentRouter;

export { ApiRouter, DocumentRouter };
