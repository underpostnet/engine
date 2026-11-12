import express from 'express';
import { ItemLedgerTransferController } from './item-ledger-transfer.controller.js';

// The projection is written by the indexer only: every route reads.
/** @type {import('../types.js').ApiModuleDefinition} */
export const ApiModule = {
  id: 'item-ledger-transfer',
  services: ['database'],
  /**
   * @param {import('../types.js').ApiRouterContext} context
   * @returns {import('express').Router}
   */
  createRouter(context) {
    const router = express.Router();
    const get = async (req, res) => await ItemLedgerTransferController.get(req, res, context);
    router.get(`/token/:chainId/:contractAddress/:tokenId`, get);
    router.get(`/owner/:chainId/:contractAddress/:ownerAddress`, get);
    router.get(`/tx/:chainId/:contractAddress/:txHash`, get);
    router.get(`/`, get);
    return router;
  },
};
