import express from 'express';
import { registerCrudRoutes } from '../../server/network/middlewares.js';
import { DocumentController } from './document.controller.js';

/** @type {import('../types.js').ApiModuleDefinition} */
export const ApiModule = {
  id: 'document',
  services: ['database', 'auth'],
  /**
   * @param {import('../types.js').ApiRouterContext} context
   * @returns {import('express').Router}
   */
  createRouter(context) {
    const { auth } = context.services;
    const router = express.Router();
    const authOnly = [auth.authenticate];
    // Public reads — must come before the guarded generic /:id routes.
    router.get(`/public/high`, async (req, res) => await DocumentController.get(req, res, context));
    router.get(`/public`, async (req, res) => await DocumentController.get(req, res, context));
    router.get(`/slug/:stableSlug`, async (req, res) => await DocumentController.getBySlug(req, res, context));
    router.patch(`/:id/copy-share-link`, async (req, res) => await DocumentController.patch(req, res, context));
    router.patch(
      `/:id/toggle-public`,
      auth.authenticate,
      async (req, res) => await DocumentController.patch(req, res, context),
    );
    return registerCrudRoutes(router, DocumentController, context, {
      readGuards: authOnly,
      writeGuards: authOnly,
      deleteAllGuards: authOnly,
    });
  },
};
