import express from 'express';
import { registerCrudRoutes } from '../../server/network/middlewares.js';
import { moderatorGuard } from '../../server/security/auth.js';
import { serverKeyGuard } from '../../projects/cyberia/server-key.js';
import { CyberiaQuestProgressController } from './cyberia-quest-progress.controller.js';

class CyberiaQuestProgressRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    // Player progress: the game server writes it with the server key; moderators read it.
    return registerCrudRoutes(express.Router(), CyberiaQuestProgressController, options, {
      readGuards: [options.authMiddleware, moderatorGuard],
      writeGuards: [serverKeyGuard],
    });
  }
}

const ApiRouter = (options) => CyberiaQuestProgressRouter.router(options);

export { ApiRouter, CyberiaQuestProgressRouter };
