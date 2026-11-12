import express from 'express';
import { InstanceController } from './instance.controller.js';

/** @type {import('../types.js').ApiModuleDefinition} */
export const ApiModule = {
  id: 'instance',
  services: ['database', 'auth'],
  /**
   * @param {import('../types.js').ApiRouterContext} context
   * @returns {import('express').Router}
   */
  createRouter(context) {
    const { auth } = context.services;
    const router = express.Router();
    const adminOnly = auth.requireAdmin;
    router.post(`/:id`, ...adminOnly, async (req, res) => await InstanceController.post(req, res, context));
    router.post(`/`, ...adminOnly, async (req, res) => await InstanceController.post(req, res, context));
    router.get(`/:id`, ...adminOnly, async (req, res) => await InstanceController.get(req, res, context));
    router.get(`/`, auth.authenticate, async (req, res) => await InstanceController.get(req, res, context));
    router.put(`/:id`, ...adminOnly, async (req, res) => await InstanceController.put(req, res, context));
    router.put(`/`, ...adminOnly, async (req, res) => await InstanceController.put(req, res, context));
    router.delete(`/:id`, ...adminOnly, async (req, res) => await InstanceController.delete(req, res, context));
    router.delete(`/`, ...adminOnly, async (req, res) => await InstanceController.delete(req, res, context));
    return router;
  },
};
