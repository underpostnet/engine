import express from 'express';
import { registerCrudRoutes } from '../../server/network/middlewares.js';
import { CompanyController } from './company.controller.js';

/** @type {import('../types.js').ApiModuleDefinition} */
export const ApiModule = {
  id: 'company',
  services: ['database'],
  /**
   * @param {import('../types.js').ApiRouterContext} context
   * @returns {import('express').Router}
   */
  createRouter(context) {
    // Fully unguarded (matches prior behavior).
    return registerCrudRoutes(express.Router(), CompanyController, context, {
      writeGuards: [],
      deleteAllGuards: [],
    });
  },
};
