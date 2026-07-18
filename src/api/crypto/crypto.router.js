import express from 'express';
import { CryptoController } from './crypto.controller.js';

class CryptoRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const router = express.Router();
    router.post(`/:id`, async (req, res) => await CryptoController.post(req, res, options));
    router.post(`/`, options.authMiddleware, async (req, res) => await CryptoController.post(req, res, options));
    router.get(`/:id`, async (req, res) => await CryptoController.get(req, res, options));
    router.get(`/`, async (req, res) => await CryptoController.get(req, res, options));
    router.delete(`/:id`, async (req, res) => await CryptoController.delete(req, res, options));
    router.delete(`/`, async (req, res) => await CryptoController.delete(req, res, options));
    return router;
  }
}

const ApiRouter = (options) => CryptoRouter.router(options);

export { ApiRouter, CryptoRouter };
