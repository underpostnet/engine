import express from 'express';
import { TestController } from './test.controller.js';

class TestRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const router = express.Router();
    router.post(`/:id`, async (req, res) => await TestController.post(req, res, options));
    router.post(`/`, options.authMiddleware, async (req, res) => await TestController.post(req, res, options));
    router.get(`/:id`, async (req, res) => await TestController.get(req, res, options));
    router.get(`/`, async (req, res) => await TestController.get(req, res, options));
    router.delete(`/:id`, async (req, res) => await TestController.delete(req, res, options));
    router.delete(`/`, async (req, res) => await TestController.delete(req, res, options));
    return router;
  }
}

const ApiRouter = (options) => TestRouter.router(options);

export { ApiRouter, TestRouter };
