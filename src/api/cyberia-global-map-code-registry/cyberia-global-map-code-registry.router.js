import express from 'express';
import { registerCrudRoutes } from '../../server/network/middlewares.js';
import { CyberiaGlobalMapCodeRegistryController } from './cyberia-global-map-code-registry.controller.js';

class CyberiaGlobalMapCodeRegistryRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    return registerCrudRoutes(express.Router(), CyberiaGlobalMapCodeRegistryController, options);
  }
}

const ApiRouter = (options) => CyberiaGlobalMapCodeRegistryRouter.router(options);

export { ApiRouter, CyberiaGlobalMapCodeRegistryRouter };
