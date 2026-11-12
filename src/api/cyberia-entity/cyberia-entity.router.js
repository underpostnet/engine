import express from 'express';
import { registerCrudRoutes } from '../../server/network/middlewares.js';
import { CyberiaEntityController } from './cyberia-entity.controller.js';

/** @type {import('../types.js').ApiModuleDefinition} */
export const ApiModule = {
  id: 'cyberia-entity',
  services: ['database', 'auth'],
  /**
   * @param {import('../types.js').ApiRouterContext} context
   * @returns {import('express').Router}
   */
  createRouter(context) {
    return registerCrudRoutes(express.Router(), CyberiaEntityController, context);
  },
};
