import express from 'express';
import { ItemLedgerBalanceController } from './item-ledger-balance.controller.js';

// The projection is written by the indexer only: every route reads.
class ItemLedgerBalanceRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const router = express.Router();
    const get = async (req, res) => await ItemLedgerBalanceController.get(req, res, options);
    router.get(`/token/:chainId/:contractAddress/:tokenId`, get);
    router.get(`/owner/:chainId/:contractAddress/:ownerAddress`, get);
    router.get(`/supply/:chainId/:contractAddress/:tokenId`, get);
    router.get(`/`, get);
    return router;
  }
}

const ApiRouter = (options) => ItemLedgerBalanceRouter.router(options);

export { ApiRouter, ItemLedgerBalanceRouter };
