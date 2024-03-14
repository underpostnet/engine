import { loggerFactory } from '../../server/logger.js';
import { FileController } from './file.controller.js';
import express from 'express';
const logger = loggerFactory(import.meta);

const FileRouter = (options) => {
  const router = express.Router();
  const endpoint = 'file';
  router.post(`/${endpoint}/:id`, async (req, res) => await FileController.post(req, res, options));
  router.post(`/${endpoint}`, async (req, res) => await FileController.post(req, res, options));
  router.get(`/${endpoint}/:id`, async (req, res) => await FileController.get(req, res, options));
  router.get(`/${endpoint}`, async (req, res) => await FileController.get(req, res, options));
  router.delete(`/${endpoint}/:id`, async (req, res) => await FileController.delete(req, res, options));
  router.delete(`/${endpoint}`, async (req, res) => await FileController.delete(req, res, options));
  return router;
};

const ApiRouter = FileRouter;

export { ApiRouter, FileRouter };
