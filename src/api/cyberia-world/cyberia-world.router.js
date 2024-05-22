import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';
import { CyberiaWorldController } from './cyberia-world.controller.js';
import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const logger = loggerFactory(import.meta);

const CyberiaWorldRouter = (options) => {
  const router = express.Router();
  const endpoint = 'cyberia-world';

  if (!options.cyberia)
    (async () => {
      /** @type {import('../cyberia-world/cyberia-world.model.js').CyberiaWorldModel} */
      const CyberiaWorld = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.CyberiaWorld;

      options.cyberia = {
        world: {
          instance: await CyberiaWorld.findOne({ name: options.path.slice(1) }),
          default: await CyberiaWorld.findOne({ name: process.env.CYBERIA_DEFAULT_WORLD_NAME }),
        },
      };

      for (const questObj of options.cyberia.world.instance.quests) {
        switch (questObj.type) {
          case 'search':
            break;

          default:
            break;
        }
      }

      // instanciar quests
    })();

  router.post(`/${endpoint}/:id`, async (req, res) => await CyberiaWorldController.post(req, res, options));
  router.post(`/${endpoint}`, async (req, res) => await CyberiaWorldController.post(req, res, options));
  router.get(`/${endpoint}/:id`, async (req, res) => await CyberiaWorldController.get(req, res, options));
  router.get(`/${endpoint}`, async (req, res) => await CyberiaWorldController.get(req, res, options));
  router.delete(`/${endpoint}/:id`, async (req, res) => await CyberiaWorldController.delete(req, res, options));
  router.delete(`/${endpoint}`, async (req, res) => await CyberiaWorldController.delete(req, res, options));
  return router;
};

const ApiRouter = CyberiaWorldRouter;

export { ApiRouter, CyberiaWorldRouter };
