import express from 'express';
import { registerCrudRoutes } from '../../server/middlewares.js';
import { CyberiaGlobalMapCodeRegistryController } from './cyberia-global-map-code-registry.controller.js';

class CyberiaGlobalMapCodeRegistryRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    // Registry endpoints: intentionally unguarded (matches prior behavior).
    return registerCrudRoutes(express.Router(), CyberiaGlobalMapCodeRegistryController, options, {
      writeGuards: [],
      deleteAllGuards: [],
    });
  }
}

const ApiRouter = (options) => CyberiaGlobalMapCodeRegistryRouter.router(options);

export { ApiRouter, CyberiaGlobalMapCodeRegistryRouter };
