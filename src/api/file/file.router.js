import { adminGuard } from '../../server/auth.js';
import { loggerFactory } from '../../server/logger.js';
import { FileController } from './file.controller.js';
import express from 'express';
const logger = loggerFactory(import.meta);

const FileRouter = (options) => {
  const router = express.Router();
  const authMiddleware = options.authMiddleware;
  router.post(`/:id`, authMiddleware, async (req, res) => await FileController.post(req, res, options));
  router.post(`/`, authMiddleware, async (req, res) => await FileController.post(req, res, options));
  router.get(`/blob/:id`, async (req, res) => await FileController.get(req, res, options));
  router.get(`/:id`, async (req, res) => await FileController.get(req, res, options));
  router.get(`/`, async (req, res) => await FileController.get(req, res, options));
  router.delete(`/:id`, authMiddleware, adminGuard, async (req, res) => await FileController.delete(req, res, options));
  router.delete(`/`, authMiddleware, adminGuard, async (req, res) => await FileController.delete(req, res, options));
  return router;
};

const ApiRouter = FileRouter;

export { ApiRouter, FileRouter };
