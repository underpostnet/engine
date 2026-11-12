import express from 'express';
import { registerCrudRoutes } from '../../server/network/middlewares.js';
import { IpfsController } from './ipfs.controller.js';

/** @type {import('../types.js').ApiModuleDefinition} */
export const ApiModule = {
  id: 'ipfs',
  services: ['database', 'auth'],
  /**
   * @param {import('../types.js').ApiRouterContext} context
   * @returns {import('express').Router}
   */
  createRouter(context) {
    const { auth } = context.services;
    const router = express.Router();
    const adminOnly = auth.requireAdmin;
    // Health / audit — must come before /:id to avoid matching conflicts.
    router.get(`/verify`, ...adminOnly, async (req, res) => await IpfsController.verify(req, res, context));
    return registerCrudRoutes(router, IpfsController, context, {
      readGuards: adminOnly,
      writeGuards: adminOnly,
      deleteAllGuards: adminOnly,
    });
  },
};
