import express from 'express';
import { ItemLedgerController } from './item-ledger.controller.js';

/** @type {import('../types.js').ApiModuleDefinition} */
export const ApiModule = {
  id: 'item-ledger',
  services: ['database', 'auth'],
  /**
   * @param {import('../types.js').ApiRouterContext} context
   * @returns {import('express').Router}
   */
  createRouter(context) {
    const { auth } = context.services;
    const router = express.Router();
    const adminOnly = auth.requireAdmin;
    const get = async (req, res) => await ItemLedgerController.get(req, res, context);

    router.get(`/token-id/:cid`, get);
    router.get(`/cid/:cid`, get);
    router.get(`/token/:chainId/:contractAddress/:tokenId`, get);
    router.get(`/asset/:chainId/:contractAddress/:tokenId`, get);
    router.get(`/:id`, get);
    router.get(`/`, get);
    router.post(`/`, ...adminOnly, async (req, res) => await ItemLedgerController.post(req, res, context));
    router.delete(`/:id`, ...adminOnly, async (req, res) => await ItemLedgerController.delete(req, res, context));
    return router;
  },
};
