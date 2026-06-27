import { loggerFactory } from '../../server/logger.js';
import { CyberiaSkillController } from './cyberia-skill.controller.js';
import express from 'express';

const logger = loggerFactory(import.meta);

class CyberiaSkillRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const router = express.Router();
    router.post(`/:id`, async (req, res) => await CyberiaSkillController.post(req, res, options));
    router.post(`/`, async (req, res) => await CyberiaSkillController.post(req, res, options));
    router.get(`/:id`,
      // options.authMiddleware,
      async (req, res) => await CyberiaSkillController.get(req, res, options),
    );
    router.get(`/`, async (req, res) => await CyberiaSkillController.get(req, res, options));
    router.put(`/:id`, async (req, res) => await CyberiaSkillController.put(req, res, options));
    router.put(`/`, async (req, res) => await CyberiaSkillController.put(req, res, options));
    router.delete(`/:id`, async (req, res) => await CyberiaSkillController.delete(req, res, options));
    router.delete(`/`, async (req, res) => await CyberiaSkillController.delete(req, res, options));
    return router;
  }
}

const ApiRouter = (options) => CyberiaSkillRouter.router(options);

export { ApiRouter, CyberiaSkillRouter };
