import { authMiddleware } from '../../server/auth.js';
import { loggerFactory } from '../../server/logger.js';
import { CyberiaQuestController } from './cyberia-quest.controller.js';
import express from 'express';
import dotenv from 'dotenv';
import { DataBaseProvider } from '../../db/DataBaseProvider.js';

dotenv.config();

const logger = loggerFactory(import.meta);

const CyberiaQuestRouter = (options) => {
  const router = express.Router();

  if (!options.cyberia)
    (async () => {
      /** @type {import('../cyberia-world/cyberia-world.model.js').CyberiaWorldModel} */
      const CyberiaWorld = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaWorld;

      options.cyberia = {
        world: {
          instance: await CyberiaWorld.findOne({ name: options.path.slice(1) }),
          default: await CyberiaWorld.findOne({ name: process.env.CYBERIA_DEFAULT_WORLD_NAME }),
        },
      };
    })();
  router.post(
    `/take/:sagaId/:questId`,
    authMiddleware,
    async (req, res) => await CyberiaQuestController.post(req, res, options),
  );
  router.post(
    `/abandon/:sagaId/:questId`,
    authMiddleware,
    async (req, res) => await CyberiaQuestController.post(req, res, options),
  );
  router.post(`/take-anon/:sagaId/:questId`, async (req, res) => await CyberiaQuestController.post(req, res, options));
  router.post(
    `/abandon-anon/:sagaId/:questId`,
    async (req, res) => await CyberiaQuestController.post(req, res, options),
  );
  router.post(`/:id`, async (req, res) => await CyberiaQuestController.post(req, res, options));
  router.post(`/`, async (req, res) => await CyberiaQuestController.post(req, res, options));
  router.get(`/:id`, async (req, res) => await CyberiaQuestController.get(req, res, options));
  router.get(`/`, async (req, res) => await CyberiaQuestController.get(req, res, options));
  router.put(`/:id`, async (req, res) => await CyberiaQuestController.put(req, res, options));
  router.put(`/`, async (req, res) => await CyberiaQuestController.put(req, res, options));
  router.delete(`/:id`, async (req, res) => await CyberiaQuestController.delete(req, res, options));
  router.delete(`/`, async (req, res) => await CyberiaQuestController.delete(req, res, options));
  return router;
};

const ApiRouter = CyberiaQuestRouter;

export { ApiRouter, CyberiaQuestRouter };
