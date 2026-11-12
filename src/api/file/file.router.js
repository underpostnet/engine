import express from 'express';
import { FileController } from './file.controller.js';

/** @type {import('../types.js').ApiModuleDefinition} */
export const ApiModule = {
  id: 'file',
  services: ['database', 'auth'],
  /**
   * authenticated writes, admin-only deletes and full listing.
   * @param {import('../types.js').ApiRouterContext} context
   * @returns {import('express').Router}
   */
  createRouter(context) {
    const { auth } = context.services;
    const router = express.Router();
    router.post(`/:id`, auth.authenticate, async (req, res) => await FileController.post(req, res, context));
    router.post(`/`, auth.authenticate, async (req, res) => await FileController.post(req, res, context));
    router.get(`/blob/:id`, async (req, res) => await FileController.get(req, res, context));
    router.get(`/all`, auth.requireAdmin, async (req, res) => await FileController.get(req, res, context));
    router.get(`/:id`, async (req, res) => await FileController.get(req, res, context));
    router.delete(`/:id`, auth.requireAdmin, async (req, res) => await FileController.delete(req, res, context));
    return router;
  },
};
