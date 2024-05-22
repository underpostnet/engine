import { loggerFactory } from '../../../server/logger.js';
import { IoCreateChannel } from '../../IoInterface.js';

const channel = 'default';
const logger = loggerFactory(import.meta);

const DefaultWsDefaultController = {
  channel,
  controller: function (socket, client, payload, wsManagementId) {},
  connection: function (socket, client, wsManagementId) {},
  disconnect: function (socket, client, reason, wsManagementId) {},
};

const DefaultWsDefaultChannel = IoCreateChannel(DefaultWsDefaultController);

export { DefaultWsDefaultChannel, DefaultWsDefaultController };
