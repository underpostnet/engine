import { newInstance, objectEquals } from '../../../client/components/core/CommonJs.js';
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
    if (!this.element[wsManagementId][id]) return;
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
    if (life <= 0) {
      this.element[wsManagementId][id].components.skin = this.element[wsManagementId][id].components.skin.map((s) => {
        s.enabled = s.displayId === 'ghost';
        return s;
      });

      for (const clientId of Object.keys(CyberiaWsUserManagement.element[wsManagementId])) {
        if (
          objectEquals(
            this.element[wsManagementId][id].model.world,
            CyberiaWsUserManagement.element[wsManagementId][clientId].model.world,
          )
        )
          CyberiaWsEmit(CyberiaWsUserChannel.channel, CyberiaWsUserChannel.client[clientId], {
            status: 'update-skin-position',
            id,
            element: { components: { skin: this.element[wsManagementId][id].components.skin } },
          });
      }
      setTimeout(() => {
        if (!this.element[wsManagementId][id]) return;
        this.updateLife({ ...args, life: newInstance(this.element[wsManagementId][id].maxLife) });
        this.element[wsManagementId][id].components.skin = this.element[wsManagementId][id].components.skin.map((s) => {
          s.enabled = s.current === true;
          return s;
        });
        for (const clientId of Object.keys(CyberiaWsUserManagement.element[wsManagementId])) {
          if (
            objectEquals(
              this.element[wsManagementId][id].model.world,
              CyberiaWsUserManagement.element[wsManagementId][clientId].model.world,
            )
          )
            CyberiaWsEmit(CyberiaWsUserChannel.channel, CyberiaWsUserChannel.client[clientId], {
              status: 'update-skin-position',
              id,
              element: { components: { skin: this.element[wsManagementId][id].components.skin } },
            });
        }
      }, this.element[wsManagementId][id].deadTime);
    }
  },
};

export { CyberiaWsUserManagement };
