import express from 'express';
import { registerCrudRoutes } from '../../server/middlewares.js';
import { CyberiaInstanceConfController } from './cyberia-instance-conf.controller.js';

class CyberiaInstanceConfRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    return registerCrudRoutes(express.Router(), CyberiaInstanceConfController, options);
  }
}

const ApiRouter = (options) => CyberiaInstanceConfRouter.router(options);

export { ApiRouter, CyberiaInstanceConfRouter };
