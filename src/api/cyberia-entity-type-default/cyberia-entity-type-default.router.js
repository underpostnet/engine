import express from 'express';
import { registerCrudRoutes } from '../../server/middlewares.js';
import { CyberiaEntityTypeDefaultController } from './cyberia-entity-type-default.controller.js';

class CyberiaEntityTypeDefaultRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    return registerCrudRoutes(express.Router(), CyberiaEntityTypeDefaultController, options);
  }
}

const ApiRouter = (options) => CyberiaEntityTypeDefaultRouter.router(options);

export { ApiRouter, CyberiaEntityTypeDefaultRouter };
