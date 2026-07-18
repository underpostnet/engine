import express from 'express';
import { registerCrudRoutes } from '../../server/middlewares.js';
import { CyberiaEntityController } from './cyberia-entity.controller.js';

class CyberiaEntityRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    return registerCrudRoutes(express.Router(), CyberiaEntityController, options);
  }
}

const ApiRouter = (options) => CyberiaEntityRouter.router(options);

export { ApiRouter, CyberiaEntityRouter };
