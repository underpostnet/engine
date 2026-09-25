import express from 'express';
import { adminGuard } from '../../server/security/auth.js';
import { ItemLedgerController } from './item-ledger.controller.js';

class ItemLedgerRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const router = express.Router();
    const adminOnly = [options.authMiddleware, adminGuard];
    const get = async (req, res) => await ItemLedgerController.get(req, res, options);

    router.get(`/token-id/:cid`, get);
    router.get(`/cid/:cid`, get);
    router.get(`/token/:chainId/:contractAddress/:tokenId`, get);
    router.get(`/asset/:chainId/:contractAddress/:tokenId`, get);
    router.get(`/:id`, get);
    router.get(`/`, get);
    router.post(`/`, ...adminOnly, async (req, res) => await ItemLedgerController.post(req, res, options));
    router.delete(`/:id`, ...adminOnly, async (req, res) => await ItemLedgerController.delete(req, res, options));
    return router;
  }
}

const ApiRouter = (options) => ItemLedgerRouter.router(options);

export { ApiRouter, ItemLedgerRouter };
