import { newInstance, objectEquals, timer } from '../../../client/components/core/CommonJs.js';
import { DataBaseProvider } from '../../../db/DataBaseProvider.js';
import { CyberiaWsUserChannel } from '../channels/cyberia.ws.user.js';
import { CyberiaWsEmit } from '../cyberia.ws.emit.js';

const CyberiaWsUserManagement = {
  element: {},
  localElementScope: {},
  updateCyberiaUser: async function (wsManagementId, timeInterval) {
    await timer(timeInterval);
    for (const elementId of Object.keys(this.element[wsManagementId])) {
      const element = this.element[wsManagementId][elementId];
      element?._id
        ? (async () => {
            const result = await DataBaseProvider.instance[`${wsManagementId}`].mongoose.CyberiaUser.findByIdAndUpdate(
              element._id,
              element,
              {
                runValidators: true,
              },
            );
          })()
        : null;
    }
    this.updateCyberiaUser(wsManagementId, timeInterval);
  },
  instance: function (wsManagementId = '') {
    this.element[wsManagementId] = {};
    this.localElementScope[wsManagementId] = {};
    this.updateCyberiaUser(wsManagementId, 1500);
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
    if (life <= 0) this.setDeadState(wsManagementId, id);
  },
  setDeadState: function (wsManagementId, id) {
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
      this.updateLife({ wsManagementId, id, life: newInstance(this.element[wsManagementId][id].maxLife) });
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
  },
};

export { CyberiaWsUserManagement };
