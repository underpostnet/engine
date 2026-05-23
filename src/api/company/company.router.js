import { loggerFactory } from '../../server/logger.js';
import { CompanyController } from './company.controller.js';
import express from 'express';

const logger = loggerFactory(import.meta);

class CompanyRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const router = express.Router();
    router.post(`/:id`, async (req, res) => await CompanyController.post(req, res, options));
    router.post(`/`, async (req, res) => await CompanyController.post(req, res, options));
    router.get(`/:id`, async (req, res) => await CompanyController.get(req, res, options));
    router.get(`/`, async (req, res) => await CompanyController.get(req, res, options));
    router.put(`/:id`, async (req, res) => await CompanyController.put(req, res, options));
    router.put(`/`, async (req, res) => await CompanyController.put(req, res, options));
    router.delete(`/:id`, async (req, res) => await CompanyController.delete(req, res, options));
    router.delete(`/`, async (req, res) => await CompanyController.delete(req, res, options));
    return router;
  }
}

const ApiRouter = (options) => CompanyRouter.router(options);

export { ApiRouter, CompanyRouter };
