import express from 'express';
import { registerCrudRoutes } from '../../server/middlewares.js';
import { ObjectLayerRenderFramesController } from './object-layer-render-frames.controller.js';

class ObjectLayerRenderFramesRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    return registerCrudRoutes(express.Router(), ObjectLayerRenderFramesController, options);
  }
}

const ApiRouter = (options) => ObjectLayerRenderFramesRouter.router(options);

export { ApiRouter, ObjectLayerRenderFramesRouter };
