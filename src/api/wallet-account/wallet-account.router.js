import express from 'express';
import { WalletAccountController } from './wallet-account.controller.js';

class WalletAccountRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const router = express.Router();
    const post = async (req, res) => await WalletAccountController.post(req, res, options);
    // Sign-in is the way in: it authenticates itself with the signature, not with a session.
    router.post(`/challenge`, post);
    router.post(`/sign-in`, post);
    router.get(`/:id`, async (req, res) => await WalletAccountController.get(req, res, options));
    router.get(`/`, options.authMiddleware, async (req, res) => await WalletAccountController.get(req, res, options));
    return router;
  }
}

const ApiRouter = (options) => WalletAccountRouter.router(options);

export { ApiRouter, WalletAccountRouter };
