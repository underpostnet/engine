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

dotenv.config();

// https://socket.io/docs/v3/

const CyberiaWsInstanceScope = {};

const createIoServer = async (httpServer, options) => {
  const { host, path } = options;
  const wsManagementId = `${host}${path}`;

  /** @type {import('../../api/cyberia-world/cyberia-world.model.js').CyberiaWorldModel} */
  const CyberiaWorld = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.CyberiaWorld;

  CyberiaWsInstanceScope[wsManagementId] = {
    world: {
      instance: await CyberiaWorld.findOne({ name: path.slice(1) }),
      default: await CyberiaWorld.findOne({ name: process.env.CYBERIA_DEFAULT_WORLD_NAME }),
    },
  };

  CyberiaWsUserManagement.instance(wsManagementId);
  CyberiaWsBotManagement.instance(wsManagementId);
  CyberiaWsSkillManagement.instance(wsManagementId);
  CoreWsChatManagement.instance(wsManagementId);
  CoreWsMailerManagement.instance(wsManagementId);
  return IoServer(httpServer, options, (socket) => CyberiaWsConnection(socket, wsManagementId));
};

const CyberiaWsServer = createIoServer;

export { createIoServer, CyberiaWsServer, CyberiaWsInstanceScope };
