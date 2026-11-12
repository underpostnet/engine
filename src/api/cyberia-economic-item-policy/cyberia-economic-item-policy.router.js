/**
 * @module src/api/cyberia-economic-item-policy
 *
 * Item policies of the economy profiles.
 *
 * Endpoints:
 *   GET    /api/v1/cyberia-economic-item-policy[/:id]   the rows; ?economyCode= lists one economy
 *   GET    /api/v1/cyberia-economic-item-policy/view    ?economyCode=: rows with their binding and effective policy
 *   POST   /api/v1/cyberia-economic-item-policy         moderator; creates or replaces {economyCode, itemId}
 *   PUT    /api/v1/cyberia-economic-item-policy/:id     moderator
 *   DELETE /api/v1/cyberia-economic-item-policy/:id     moderator
 */

import express from 'express';
import { registerCrudRoutes } from '../../server/network/middlewares.js';
import { CyberiaEconomicItemPolicyController } from './cyberia-economic-item-policy.controller.js';

/** @type {import('../types.js').ApiModuleDefinition} */
export const ApiModule = {
  id: 'cyberia-economic-item-policy',
  services: ['database', 'auth'],
  /**
   * @param {import('../types.js').ApiRouterContext} context
   * @returns {import('express').Router}
   */
  createRouter(context) {
    const router = express.Router();
    router.get('/view', async (req, res) => await CyberiaEconomicItemPolicyController.view(req, res, context));
    return registerCrudRoutes(router, CyberiaEconomicItemPolicyController, context);
  },
};
