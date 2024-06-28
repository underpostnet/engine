import { adminGuard, authMiddleware } from '../../server/auth.js';
import { loggerFactory } from '../../server/logger.js';
import { FileController } from './file.controller.js';
import express from 'express';
const logger = loggerFactory(import.meta);

const FileRouter = (options) => {
  const router = express.Router();
  const endpoint = 'file';
  router.post(`/${endpoint}/:id`, authMiddleware, async (req, res) => await FileController.post(req, res, options));
  router.post(`/${endpoint}`, authMiddleware, async (req, res) => await FileController.post(req, res, options));
  router.get(`/${endpoint}/:id`, async (req, res) => await FileController.get(req, res, options));
  router.get(`/${endpoint}`, async (req, res) => await FileController.get(req, res, options));
  router.delete(
    `/${endpoint}/:id`,
    authMiddleware,
    adminGuard,
    async (req, res) => await FileController.delete(req, res, options),
  );
  router.delete(
    `/${endpoint}`,
    authMiddleware,
    adminGuard,
    async (req, res) => await FileController.delete(req, res, options),
  );
  return router;
};

const ApiRouter = FileRouter;

export { ApiRouter, FileRouter };
