import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';
import { CyberiaWorldController } from './cyberia-world.controller.js';
import express from 'express';
import dotenv from 'dotenv';
import { moderatorGuard, authMiddleware, adminGuard } from '../../server/auth.js';

dotenv.config();

const logger = loggerFactory(import.meta);

const CyberiaWorldRouter = (options) => {
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

  router.post(
    `/:id`,
    authMiddleware,
    moderatorGuard,
    async (req, res) => await CyberiaWorldController.post(req, res, options),
  );
  router.post(
    `/`,
    authMiddleware,
    moderatorGuard,
    async (req, res) => await CyberiaWorldController.post(req, res, options),
  );
  router.get(`/:id`, async (req, res) => await CyberiaWorldController.get(req, res, options));
  router.get(`/`, async (req, res) => await CyberiaWorldController.get(req, res, options));
  router.delete(
    `/:id`,
    authMiddleware,
    adminGuard,
    async (req, res) => await CyberiaWorldController.delete(req, res, options),
  );
  router.delete(
    `/`,
    authMiddleware,
    adminGuard,
    async (req, res) => await CyberiaWorldController.delete(req, res, options),
  );
  return router;
};

const ApiRouter = CyberiaWorldRouter;

export { ApiRouter, CyberiaWorldRouter };
