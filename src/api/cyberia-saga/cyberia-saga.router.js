import express from 'express';
import { registerCrudRoutes } from '../../server/middlewares.js';
import { CyberiaSagaController } from './cyberia-saga.controller.js';

class CyberiaSagaRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    return registerCrudRoutes(express.Router(), CyberiaSagaController, options);
  }
}

const ApiRouter = (options) => CyberiaSagaRouter.router(options);

export { ApiRouter, CyberiaSagaRouter };
