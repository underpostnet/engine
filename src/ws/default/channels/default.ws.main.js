import { loggerFactory } from '../../../server/logger.js';
import { IoCreateChannel } from '../../IoInterface.js';

const channel = 'main';
const logger = loggerFactory(import.meta);

const DefaultWsMainController = {
  channel,
  controller: function (socket, client, payload, wsManagementId) {},
  connection: function (socket, client, wsManagementId) {},
  disconnect: function (socket, client, reason, wsManagementId) {},
};

const DefaultWsMainChannel = IoCreateChannel(DefaultWsMainController);

export { DefaultWsMainChannel, DefaultWsMainController };
