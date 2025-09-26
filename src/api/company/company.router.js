import { loggerFactory } from '../../server/logger.js';
import { CompanyController } from './company.controller.js';
import express from 'express';

const logger = loggerFactory(import.meta);

const CompanyRouter = (options) => {
  const router = express.Router();
  const authMiddleware = options.authMiddleware;
  router.post(`/:id`, async (req, res) => await CompanyController.post(req, res, options));
  router.post(`/`, async (req, res) => await CompanyController.post(req, res, options));
  router.get(`/:id`, async (req, res) => await CompanyController.get(req, res, options));
  router.get(`/`, async (req, res) => await CompanyController.get(req, res, options));
  router.put(`/:id`, async (req, res) => await CompanyController.put(req, res, options));
  router.put(`/`, async (req, res) => await CompanyController.put(req, res, options));
  router.delete(`/:id`, async (req, res) => await CompanyController.delete(req, res, options));
  router.delete(`/`, async (req, res) => await CompanyController.delete(req, res, options));
  return router;
};

const ApiRouter = CompanyRouter;

export { ApiRouter, CompanyRouter };
