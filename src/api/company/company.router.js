import express from 'express';
import { registerCrudRoutes } from '../../server/middlewares.js';
import { CompanyController } from './company.controller.js';

class CompanyRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    // Fully unguarded (matches prior behavior).
    return registerCrudRoutes(express.Router(), CompanyController, options, {
      writeGuards: [],
      deleteAllGuards: [],
    });
  }
}

const ApiRouter = (options) => CompanyRouter.router(options);

export { ApiRouter, CompanyRouter };
