import express from 'express';
import { ItemLedgerCheckpointController } from './item-ledger-checkpoint.controller.js';

class ItemLedgerCheckpointRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const router = express.Router();
    const get = async (req, res) => await ItemLedgerCheckpointController.get(req, res, options);
    router.get(`/:chainId/:contractAddress`, get);
    router.get(`/`, get);
    return router;
  }
}

const ApiRouter = (options) => ItemLedgerCheckpointRouter.router(options);

export { ApiRouter, ItemLedgerCheckpointRouter };
