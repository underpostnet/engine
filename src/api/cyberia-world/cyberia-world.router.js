import { loggerFactory } from '../../server/logger.js';
import { CyberiaWorldController } from './cyberia-world.controller.js';
import express from 'express';
const logger = loggerFactory(import.meta);

const CyberiaWorldRouter = (options) => {
  const router = express.Router();
  const endpoint = 'cyberia-world';
  router.post(`/${endpoint}/:id`, async (req, res) => await CyberiaWorldController.post(req, res, options));
  router.post(`/${endpoint}`, async (req, res) => await CyberiaWorldController.post(req, res, options));
  router.get(`/${endpoint}/:id`, async (req, res) => await CyberiaWorldController.get(req, res, options));
  router.get(`/${endpoint}`, async (req, res) => await CyberiaWorldController.get(req, res, options));
  router.delete(`/${endpoint}/:id`, async (req, res) => await CyberiaWorldController.delete(req, res, options));
  router.delete(`/${endpoint}`, async (req, res) => await CyberiaWorldController.delete(req, res, options));
  return router;
};

const ApiRouter = CyberiaWorldRouter;

export { ApiRouter, CyberiaWorldRouter };
