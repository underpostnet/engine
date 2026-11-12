import express from 'express';
import { registerCrudRoutes } from '../../server/network/middlewares.js';
import { CyberiaInstanceConfController } from './cyberia-instance-conf.controller.js';

/** @type {import('../types.js').ApiModuleDefinition} */
export const ApiModule = {
  id: 'cyberia-instance-conf',
  services: ['database', 'auth'],
  /**
   * @param {import('../types.js').ApiRouterContext} context
   * @returns {import('express').Router}
   */
  createRouter(context) {
    return registerCrudRoutes(express.Router(), CyberiaInstanceConfController, context);
  },
};
