import express from 'express';
import { ItemLedgerBalanceController } from './item-ledger-balance.controller.js';

// The projection is written by the indexer only: every route reads.
/** @type {import('../types.js').ApiModuleDefinition} */
export const ApiModule = {
  id: 'item-ledger-balance',
  services: ['database'],
  /**
   * @param {import('../types.js').ApiRouterContext} context
   * @returns {import('express').Router}
   */
  createRouter(context) {
    const router = express.Router();
    const get = async (req, res) => await ItemLedgerBalanceController.get(req, res, context);
    router.get(`/token/:chainId/:contractAddress/:tokenId`, get);
    router.get(`/owner/:chainId/:contractAddress/:ownerAddress`, get);
    router.get(`/supply/:chainId/:contractAddress/:tokenId`, get);
    router.get(`/`, get);
    return router;
  },
};
