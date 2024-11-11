import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { authMiddleware } from '../../server/auth.js';
import { loggerFactory } from '../../server/logger.js';
import { CyberiaUserController } from './cyberia-user.controller.js';
import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const logger = loggerFactory(import.meta);

const CyberiaUserRouter = (options) => {
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
        biome: {
          instance: {},
        },
      };
      if (options.cyberia.world.instance) {
        /** @type {import('../cyberia-biome/cyberia-biome.model.js').CyberiaBiomeModel} */
        const CyberiaBiome = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaBiome;

        for (const biomeId of options.cyberia.world.instance.face) {
          if (!options.cyberia.biome.instance[biomeId])
            options.cyberia.biome.instance[biomeId] = await CyberiaBiome.findOne({ _id: biomeId.toString() });
        }
      }
    })();

  router.post(`/:id`, async (req, res) => await CyberiaUserController.post(req, res, options));
  router.post(`/`, async (req, res) => await CyberiaUserController.post(req, res, options));

  router.get(`/:id`, authMiddleware, async (req, res) => await CyberiaUserController.get(req, res, options));
  router.get(`/`, authMiddleware, async (req, res) => await CyberiaUserController.get(req, res, options));

  router.put(`/:id`, authMiddleware, async (req, res) => await CyberiaUserController.put(req, res, options));
  router.put(`/`, authMiddleware, async (req, res) => await CyberiaUserController.put(req, res, options));

  // router.delete(`/:id`, async (req, res) => await CyberiaUserController.delete(req, res, options));

  return router;
};

const ApiRouter = CyberiaUserRouter;

export { ApiRouter, CyberiaUserRouter };
