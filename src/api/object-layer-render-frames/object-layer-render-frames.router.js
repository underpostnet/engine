import express from 'express';
import { registerCrudRoutes } from '../../server/network/middlewares.js';
import { ObjectLayerRenderFramesController } from './object-layer-render-frames.controller.js';

/** @type {import('../types.js').ApiModuleDefinition} */
export const ApiModule = {
  id: 'object-layer-render-frames',
  services: ['database', 'auth'],
  /**
   * @param {import('../types.js').ApiRouterContext} context
   * @returns {import('express').Router}
   */
  createRouter(context) {
    return registerCrudRoutes(express.Router(), ObjectLayerRenderFramesController, context);
  },
};
