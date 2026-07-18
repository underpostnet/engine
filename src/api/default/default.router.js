import express from 'express';
import { registerCrudRoutes } from '../../server/middlewares.js';
import { DefaultController } from './default.controller.js';

class DefaultRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    // Fully unguarded (matches prior behavior).
    return registerCrudRoutes(express.Router(), DefaultController, options, {
      writeGuards: [],
      deleteAllGuards: [],
    });
  }
}

const ApiRouter = (options) => DefaultRouter.router(options);

export { ApiRouter, DefaultRouter };
