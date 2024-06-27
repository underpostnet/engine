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
  const endpoint = 'cyberia-user';

  if (!options.cyberia)
    (async () => {
      /** @type {import('../cyberia-world/cyberia-world.model.js').CyberiaWorldModel} */
      const CyberiaWorld = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.CyberiaWorld;

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
        const CyberiaBiome = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.CyberiaBiome;

        for (const biomeId of options.cyberia.world.instance.face) {
          if (!options.cyberia.biome.instance[biomeId])
            options.cyberia.biome.instance[biomeId] = await CyberiaBiome.findOne({ _id: biomeId.toString() });
        }
      }
    })();

  router.post(`/${endpoint}/:id`, async (req, res) => await CyberiaUserController.post(req, res, options));
  router.post(`/${endpoint}`, async (req, res) => await CyberiaUserController.post(req, res, options));

  router.get(
    `/${endpoint}/:id`,
    authMiddleware,
    async (req, res) => await CyberiaUserController.get(req, res, options),
  );
  router.get(`/${endpoint}`, authMiddleware, async (req, res) => await CyberiaUserController.get(req, res, options));

  router.put(
    `/${endpoint}/:id`,
    authMiddleware,
    async (req, res) => await CyberiaUserController.put(req, res, options),
  );
  router.put(`/${endpoint}`, authMiddleware, async (req, res) => await CyberiaUserController.put(req, res, options));

  // router.delete(`/${endpoint}/:id`, async (req, res) => await CyberiaUserController.delete(req, res, options));

  return router;
};

const ApiRouter = CyberiaUserRouter;

export { ApiRouter, CyberiaUserRouter };
