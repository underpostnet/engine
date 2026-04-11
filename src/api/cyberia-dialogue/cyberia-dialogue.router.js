import { loggerFactory } from '../../server/logger.js';
import { CyberiaDialogueController } from './cyberia-dialogue.controller.js';
import express from 'express';

const logger = loggerFactory(import.meta);

const CyberiaDialogueRouter = (options) => {
  const router = express.Router();
  const authMiddleware = options.authMiddleware;
  router.post(`/:id`, async (req, res) => await CyberiaDialogueController.post(req, res, options));
  router.post(`/`, async (req, res) => await CyberiaDialogueController.post(req, res, options));
  // Direct lookup by itemId — C client fetches dialogue by item key (same pattern as atlas /metadata/:itemKey)
  router.get(`/item/:itemId`, async (req, res) => await CyberiaDialogueController.getByItemId(req, res, options));
  router.get(
    `/:id`,
    // authMiddleware,
    async (req, res) => await CyberiaDialogueController.get(req, res, options),
  );
  router.get(`/`, async (req, res) => await CyberiaDialogueController.get(req, res, options));
  router.put(`/:id`, async (req, res) => await CyberiaDialogueController.put(req, res, options));
  router.put(`/`, async (req, res) => await CyberiaDialogueController.put(req, res, options));
  router.delete(`/:id`, async (req, res) => await CyberiaDialogueController.delete(req, res, options));
  router.delete(`/`, async (req, res) => await CyberiaDialogueController.delete(req, res, options));
  return router;
};

const ApiRouter = CyberiaDialogueRouter;

export { ApiRouter, CyberiaDialogueRouter };
