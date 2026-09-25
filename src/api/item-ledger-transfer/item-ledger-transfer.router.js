import express from 'express';
import { ItemLedgerTransferController } from './item-ledger-transfer.controller.js';

// The projection is written by the indexer only: every route reads.
class ItemLedgerTransferRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const router = express.Router();
    const get = async (req, res) => await ItemLedgerTransferController.get(req, res, options);
    router.get(`/token/:chainId/:contractAddress/:tokenId`, get);
    router.get(`/owner/:chainId/:contractAddress/:ownerAddress`, get);
    router.get(`/tx/:chainId/:contractAddress/:txHash`, get);
    router.get(`/`, get);
    return router;
  }
}

const ApiRouter = (options) => ItemLedgerTransferRouter.router(options);

export { ApiRouter, ItemLedgerTransferRouter };
