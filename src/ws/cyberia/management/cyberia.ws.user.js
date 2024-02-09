import { objectEquals } from '../../../client/components/core/CommonJs.js';
import { CyberiaWsUserChannel } from '../channels/cyberia.ws.user.js';
import { CyberiaWsEmit } from '../cyberia.ws.emit.js';

const CyberiaWsUserManagement = {
  element: {},
  localElementScope: {},
  instance: function (wsManagementId = '') {
    this.element[wsManagementId] = {};
    this.localElementScope[wsManagementId] = {};
  },
  updateLife: function (args = { wsManagementId: '', id: '', life: 1 }) {
    const { wsManagementId, id, life } = args;
    this.element[wsManagementId][id].life = life < 0 ? 0 : life;
    for (const clientId of Object.keys(this.element[wsManagementId])) {
      if (
        objectEquals(this.element[wsManagementId][id].model.world, this.element[wsManagementId][clientId].model.world)
      )
        CyberiaWsEmit(CyberiaWsUserChannel.channel, CyberiaWsUserChannel.client[clientId], {
          status: 'update-life',
          id,
          element: { life: this.element[wsManagementId][id].life },
        });
    }
  },
};

export { CyberiaWsUserManagement };
