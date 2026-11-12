import express from 'express';
import { WalletAccountController } from './wallet-account.controller.js';

/** @type {import('../types.js').ApiModuleDefinition} */
export const ApiModule = {
  id: 'wallet-account',
  services: ['database', 'auth'],
  /**
   * @param {import('../types.js').ApiRouterContext} context
   * @returns {import('express').Router}
   */
  createRouter(context) {
    const { auth } = context.services;
    const router = express.Router();
    const post = async (req, res) => await WalletAccountController.post(req, res, context);
    // Sign-in is the way in: it authenticates itself with the signature, not with a session.
    router.post(`/challenge`, post);
    router.post(`/sign-in`, post);
    router.get(`/:id`, async (req, res) => await WalletAccountController.get(req, res, context));
    router.get(`/`, auth.authenticate, async (req, res) => await WalletAccountController.get(req, res, context));
    return router;
  },
};
