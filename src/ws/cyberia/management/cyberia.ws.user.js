import { newInstance, objectEquals, timer } from '../../../client/components/core/CommonJs.js';
import {
  DisplayComponent,
  QuestComponent,
  setElementConsistency,
} from '../../../client/components/cyberia/CommonCyberia.js';
import { DataBaseProvider } from '../../../db/DataBaseProvider.js';
import { CyberiaWsUserChannel } from '../channels/cyberia.ws.user.js';
import { CyberiaWsEmit } from '../cyberia.ws.emit.js';

const CyberiaWsUserManagement = {
  element: {},
  localElementScope: {},
  updateCyberiaUser: async function (wsManagementId, timeInterval) {
    /** @type {import('../../../api/cyberia-user/cyberia-user.model.js').CyberiaUserModel} */
    const CyberiaUser = DataBaseProvider.instance[`${wsManagementId}`].mongoose.models.CyberiaUser;

    await timer(timeInterval);
    for (const elementId of Object.keys(this.element[wsManagementId])) {
      const element = this.element[wsManagementId][elementId];
      element?._id
        ? (async () => {
            const saveElement = setElementConsistency('user', element);
            const result = await CyberiaUser.findByIdAndUpdate(element._id, saveElement, {
              runValidators: true,
              // Create a document if one isn't found. Required
              // for `setDefaultsOnInsert`
              upsert: true,
              setDefaultsOnInsert: true,
            });
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
  setRegenerationLife: function (wsManagementId, id) {
    this.localElementScope[wsManagementId][id].lifeRegeneration = {
      Callback: async () => {
        await timer(this.element[wsManagementId][id].lifeRegenerationVel);
        if (!this.localElementScope[wsManagementId] || !this.localElementScope[wsManagementId][id]) return;
        if (this.element[wsManagementId][id].life > 0) {
          this.updateLife({
            wsManagementId,
            id,
            life: this.element[wsManagementId][id].life + this.element[wsManagementId][id].lifeRegeneration,
          });
        }
        this.localElementScope[wsManagementId][id].lifeRegeneration.Callback();
      },
    };
    this.localElementScope[wsManagementId][id].lifeRegeneration.Callback();
  },
  updateLife: function (args = { wsManagementId: '', id: '', life: 1 }) {
    const { wsManagementId, id, life } = args;
    if (!this.element[wsManagementId][id]) return;
    this.element[wsManagementId][id].life =
      life < 0
        ? 0
        : life > this.element[wsManagementId][id].maxLife
        ? newInstance(this.element[wsManagementId][id].maxLife)
        : life;
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

    for (const clientId of Object.keys(this.element[wsManagementId])) {
      if (
        objectEquals(this.element[wsManagementId][id].model.world, this.element[wsManagementId][clientId].model.world)
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
      for (const clientId of Object.keys(this.element[wsManagementId])) {
        if (
          objectEquals(this.element[wsManagementId][id].model.world, this.element[wsManagementId][clientId].model.world)
        )
          CyberiaWsEmit(CyberiaWsUserChannel.channel, CyberiaWsUserChannel.client[clientId], {
            status: 'update-skin-position',
            id,
            element: { components: { skin: this.element[wsManagementId][id].components.skin } },
          });
      }
    }, this.element[wsManagementId][id].deadTime);
  },
  getCyberiaUserWsId: function (wsManagementId = '', id = '') {
    for (const cyberiaUserWsId of Object.keys(this.element[wsManagementId])) {
      if (this.element[wsManagementId][cyberiaUserWsId]._id === id) {
        return cyberiaUserWsId;
      }
    }
    return undefined;
  },
  verifyCompleteQuest: async function ({ wsManagementId, elementId, questIndex }) {
    const completeStep = QuestComponent.verifyCompleteQuestStep({
      questData: this.element[wsManagementId][elementId].model.quests[questIndex],
    });

    if (completeStep) {
      const completeQuest = QuestComponent.verifyCompleteQuest({
        questData: this.element[wsManagementId][elementId].model.quests[questIndex],
      });

      if (completeQuest) {
        this.element[wsManagementId][elementId].model.quests[questIndex].complete = true;

        for (const reward of QuestComponent.Data[this.element[wsManagementId][elementId].model.quests[questIndex].id]()
          .reward)
          switch (reward.type) {
            case 'coin':
              this.element[wsManagementId][elementId].coin += reward.quantity;
              CyberiaWsEmit(CyberiaWsUserChannel.channel, CyberiaWsUserChannel.client[elementId], {
                status: 'update-coin',
                id: elementId,
                element: {
                  coin: this.element[wsManagementId][elementId].coin,
                },
              });
              break;

            case 'weapon':
              await CyberiaWsUserManagement.addItem(wsManagementId, elementId, 'weapon', reward.id);
              CyberiaWsEmit(CyberiaWsUserChannel.channel, CyberiaWsUserChannel.client[elementId], {
                status: 'update-weapon',
                id: elementId,
                element: {
                  id: reward.id,
                },
              });
              break;

            default:
              break;
          }
      } else {
        this.element[wsManagementId][elementId].model.quests[questIndex].currentStep++;
      }
    }
  },
  addItem: (wsManagementId, socketId, itemType, displayId) => {
    CyberiaWsUserManagement.element[wsManagementId][socketId][itemType].tree.push({ id: displayId });

    if (
      !CyberiaWsUserManagement.element[wsManagementId][socketId].components[itemType].find(
        (c) => c.displayId === displayId,
      )
    ) {
      CyberiaWsUserManagement.element[wsManagementId][socketId].components[itemType].push(
        DisplayComponent.get[displayId](),
      );
    }
  },
};

export { CyberiaWsUserManagement };
