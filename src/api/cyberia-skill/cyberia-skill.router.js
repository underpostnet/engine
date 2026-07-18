import express from 'express';
import { registerCrudRoutes } from '../../server/middlewares.js';
import { CyberiaSkillController } from './cyberia-skill.controller.js';

class CyberiaSkillRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    return registerCrudRoutes(express.Router(), CyberiaSkillController, options);
  }
}

const ApiRouter = (options) => CyberiaSkillRouter.router(options);

export { ApiRouter, CyberiaSkillRouter };
