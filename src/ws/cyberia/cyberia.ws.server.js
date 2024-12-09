'use strict';

import { IoServer } from '../IoServer.js';
import { CyberiaWsConnection } from './cyberia.ws.connection.js';

import { CoreWsChatManagement } from '../core/management/core.ws.chat.js';
import { CyberiaWsBotManagement } from './management/cyberia.ws.bot.js';
import { CyberiaWsUserManagement } from './management/cyberia.ws.user.js';
import { CyberiaWsSkillManagement } from './management/cyberia.ws.skill.js';
import { CoreWsMailerManagement } from '../core/management/core.ws.mailer.js';
import { DataBaseProvider } from '../../db/DataBaseProvider.js';

import dotenv from 'dotenv';
import { BaseElement, getRandomAvailablePositionCyberia } from '../../client/components/cyberia/CommonCyberia.js';

dotenv.config();

// https://socket.io/docs/v3/

const CyberiaWsInstanceScope = {};

const createIoServer = async (httpServer, options) => {
  const { host, path } = options;
  const wsManagementId = `${host}${path}`;

  /** @type {import('../../api/cyberia-world/cyberia-world.model.js').CyberiaWorldModel} */
  const CyberiaWorld = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaWorld;

  CyberiaWsInstanceScope[wsManagementId] = {
    world: {
      instance: await CyberiaWorld.findOne({ name: path.slice(1) }),
      default: await CyberiaWorld.findOne({ name: process.env.CYBERIA_DEFAULT_WORLD_NAME }),
    },
    biome: {},
    user: {},
  };

  if (CyberiaWsInstanceScope[wsManagementId].world.instance) {
    const biomeId = CyberiaWsInstanceScope[wsManagementId].world.instance.face[0];

    /** @type {import('../../api/cyberia-biome/cyberia-biome.model.js').CyberiaBiomeModel} */
    const CyberiaBiome = DataBaseProvider.instance[`${wsManagementId}`].mongoose.models.CyberiaBiome;

    const biome = await CyberiaBiome.findOne({ _id: biomeId });
    CyberiaWsInstanceScope[wsManagementId].biome.instance = biome;
    const { x, y } = getRandomAvailablePositionCyberia({
      biomeData: biome._doc,
      element: BaseElement({
        worldId: CyberiaWsInstanceScope[wsManagementId].world.instance._id.toString(),
      })['user'].main,
    });

    CyberiaWsInstanceScope[wsManagementId].user.x = x;
    CyberiaWsInstanceScope[wsManagementId].user.y = y;
  }

  CyberiaWsUserManagement.instance(wsManagementId);
  CyberiaWsBotManagement.instance(wsManagementId);
  CyberiaWsSkillManagement.instance(wsManagementId);
  CoreWsChatManagement.instance(wsManagementId);
  CoreWsMailerManagement.instance(wsManagementId);
  return IoServer(httpServer, options, (socket) => CyberiaWsConnection(socket, wsManagementId));
};

const CyberiaWsServer = createIoServer;

export { createIoServer, CyberiaWsServer, CyberiaWsInstanceScope };
