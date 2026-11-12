import express from 'express';
import { TestController } from './test.controller.js';

/** @type {import('../types.js').ApiModuleDefinition} */
export const ApiModule = {
  id: 'test',
  services: ['database', 'auth'],
  /**
   * @param {import('../types.js').ApiRouterContext} context
   * @returns {import('express').Router}
   */
  createRouter(context) {
    const { auth } = context.services;
    const router = express.Router();
    router.post(`/:id`, async (req, res) => await TestController.post(req, res, context));
    router.post(`/`, auth.authenticate, async (req, res) => await TestController.post(req, res, context));
    router.get(`/:id`, async (req, res) => await TestController.get(req, res, context));
    router.get(`/`, async (req, res) => await TestController.get(req, res, context));
    router.delete(`/:id`, async (req, res) => await TestController.delete(req, res, context));
    router.delete(`/`, async (req, res) => await TestController.delete(req, res, context));
    return router;
  },
};
