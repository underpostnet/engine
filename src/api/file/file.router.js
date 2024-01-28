import { endpointFactory } from '../../client/components/core/CommonJs.js';
import { loggerFactory } from '../../server/logger.js';
import { FileController } from './file.controller.js';
import express from 'express';

const endpoint = endpointFactory(import.meta);
const meta = { url: `api-${endpoint}-router` };
const logger = loggerFactory(meta);

const FileRouter = (options) => {
  const router = express.Router();
  router.post(`${endpoint}/:id`, async (req, res) => await FileController.post(req, res, options));
  router.post(`${endpoint}`, async (req, res) => await FileController.post(req, res, options));
  router.get(`${endpoint}/:id`, async (req, res) => await FileController.get(req, res, options));
  router.get(`${endpoint}`, async (req, res) => await FileController.get(req, res, options));
  router.delete(`${endpoint}/:id`, async (req, res) => await FileController.delete(req, res, options));
  router.delete(`${endpoint}`, async (req, res) => await FileController.delete(req, res, options));
  return router;
};

const ApiRouter = FileRouter;

export { ApiRouter, FileRouter };
