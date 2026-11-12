import express from 'express';
import { registerCrudRoutes } from '../../server/network/middlewares.js';
import { CyberiaAudioController } from './cyberia-audio.controller.js';

/** @type {import('../types.js').ApiModuleDefinition} */
export const ApiModule = {
  id: 'cyberia-audio',
  services: ['database', 'auth'],
  /**
   * @param {import('../types.js').ApiRouterContext} context
   * @returns {import('express').Router}
   */
  createRouter(context) {
    return registerCrudRoutes(express.Router(), CyberiaAudioController, context);
  },
};
