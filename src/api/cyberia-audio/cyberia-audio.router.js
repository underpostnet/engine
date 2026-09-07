import express from 'express';
import { registerCrudRoutes } from '../../server/network/middlewares.js';
import { CyberiaAudioController } from './cyberia-audio.controller.js';

class CyberiaAudioRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    // Fully unguarded (matches prior behavior).
    return registerCrudRoutes(express.Router(), CyberiaAudioController, options, {
      writeGuards: [],
      deleteAllGuards: [],
    });
  }
}

const ApiRouter = (options) => CyberiaAudioRouter.router(options);

export { ApiRouter, CyberiaAudioRouter };
