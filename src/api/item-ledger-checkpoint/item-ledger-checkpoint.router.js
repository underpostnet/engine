import express from 'express';
import { ItemLedgerCheckpointController } from './item-ledger-checkpoint.controller.js';

/** @type {import('../types.js').ApiModuleDefinition} */
export const ApiModule = {
  id: 'item-ledger-checkpoint',
  services: ['database'],
  /**
   * @param {import('../types.js').ApiRouterContext} context
   * @returns {import('express').Router}
   */
  createRouter(context) {
    const router = express.Router();
    const get = async (req, res) => await ItemLedgerCheckpointController.get(req, res, context);
    router.get(`/:chainId/:contractAddress`, get);
    router.get(`/`, get);
    return router;
  },
};
