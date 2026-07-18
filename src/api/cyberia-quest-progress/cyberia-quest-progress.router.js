import express from 'express';
import { registerCrudRoutes } from '../../server/middlewares.js';
import { CyberiaQuestProgressController } from './cyberia-quest-progress.controller.js';

class CyberiaQuestProgressRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    // Player-written progress: intentionally unguarded (matches prior behavior).
    return registerCrudRoutes(express.Router(), CyberiaQuestProgressController, options, {
      writeGuards: [],
      deleteAllGuards: [],
    });
  }
}

const ApiRouter = (options) => CyberiaQuestProgressRouter.router(options);

export { ApiRouter, CyberiaQuestProgressRouter };
