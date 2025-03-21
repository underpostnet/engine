import { objectEquals } from '../../../client/components/core/CommonJs.js';
import { BaseElement, QuestComponent, Stat } from '../../../client/components/cyberia/CommonCyberia.js';
import { DataBaseProvider } from '../../../db/DataBaseProvider.js';
import { loggerFactory } from '../../../server/logger.js';
import { IoCreateChannel } from '../../IoInterface.js';
import { CyberiaWsInstanceScope } from '../cyberia.ws.server.js';
import { CyberiaWsEmit } from '../cyberia.ws.emit.js';
import { CyberiaWsSkillManagement } from '../management/cyberia.ws.skill.js';
import { CyberiaWsUserManagement } from '../management/cyberia.ws.user.js';
import { CyberiaWsSkillChannel } from './cyberia.ws.skill.js';
import dotenv from 'dotenv';
import { CyberiaWsBotManagement } from '../management/cyberia.ws.bot.js';
import { CyberiaWsBotChannel } from './cyberia.ws.bot.js';

dotenv.config();

const channel = 'user';
const logger = loggerFactory(import.meta);

const CyberiaWsUserController = {
  channel,
  controller: async function (socket, client, args, wsManagementId) {
    const { status, element, user } = args;
    const propagate = () => {
      for (const elementId of Object.keys(CyberiaWsUserManagement.element[wsManagementId])) {
        if (
          socket.id !== elementId &&
          objectEquals(
            CyberiaWsUserManagement.element[wsManagementId][elementId].model.world,
            CyberiaWsUserManagement.element[wsManagementId][socket.id].model.world,
          )
        ) {
          CyberiaWsEmit(channel, client[elementId], {
            status: 'connection',
            id: socket.id,
            element: CyberiaWsUserManagement.element[wsManagementId][socket.id],
          });
        }
      }
      if (CyberiaWsUserManagement.element[wsManagementId][socket.id].life <= 0)
        CyberiaWsUserManagement.setDeadState(wsManagementId, socket.id);
    };
    switch (status) {
      case 'propagate':
        propagate();
        break;

      case 'immunity-on-quest-modal-dialog': {
        if (
          CyberiaWsUserManagement.element[wsManagementId][socket.id].model.quests.find(
            (q) => q.id === args.questData.id && !q.complete,
          )
        ) {
          CyberiaWsUserManagement.localElementScope[wsManagementId][socket.id].immunityQuestModalDialog = true;
        }

        break;
      }
      case 'immunity-off-quest-modal-dialog': {
        CyberiaWsUserManagement.localElementScope[wsManagementId][socket.id].immunityQuestModalDialog = false;
        break;
      }
      case 'register-user':
        for (const elementId of Object.keys(CyberiaWsUserManagement.element[wsManagementId])) {
          if (
            socket.id !== elementId &&
            CyberiaWsUserManagement.element[wsManagementId][elementId].model.user._id &&
            CyberiaWsUserManagement.element[wsManagementId][elementId].model.user._id === user._id
          ) {
            // duplicate user
            CyberiaWsUserChannel.client[elementId].disconnect();
          }
        }
        CyberiaWsUserManagement.element[wsManagementId][socket.id].model.user._id = user._id;
        CyberiaWsUserManagement.element[wsManagementId][socket.id].model.user.username = user.username;
        CyberiaWsUserManagement.element[wsManagementId][socket.id].model.user.role = user.role;
        break;
      case 'unregister-user':
        CyberiaWsUserManagement.element[wsManagementId][socket.id].model.user = { _id: '' };
        break;
      case 'take-quest-item':
        {
          if (
            element.type === 'bot' &&
            !CyberiaWsBotManagement.localElementScope[wsManagementId][element.id].disabled
          ) {
            const dataSkin = CyberiaWsBotManagement.element[wsManagementId][element.id].components.skin.find(
              (s) => s.current,
            );
            const questIndex = CyberiaWsUserManagement.element[wsManagementId][socket.id].model.quests.findIndex(
              (q) =>
                q.id === args.questData.id &&
                q.displaySearchObjects.find((s) => s.id === dataSkin.displayId && s.step === q.currentStep),
            );
            if (questIndex >= 0) {
              const questData = CyberiaWsUserManagement.element[wsManagementId][socket.id].model.quests[questIndex];
              const itemQuestIndex = questData.displaySearchObjects.findIndex(
                (o) => o.id === dataSkin.displayId && o.step === questData.currentStep,
              );

              if (itemQuestIndex >= 0) {
                const itemData = questData.displaySearchObjects[itemQuestIndex];
                if (itemData.current < itemData.quantity) {
                  CyberiaWsUserManagement.element[wsManagementId][socket.id].model.quests[questIndex]
                    .displaySearchObjects[itemQuestIndex].current++;

                  await CyberiaWsUserManagement.verifyCompleteQuest({
                    wsManagementId,
                    questIndex,
                    elementId: socket.id,
                  });

                  switch (QuestComponent.componentsScope[itemData.id].questKeyContext) {
                    case 'displaySearchObjects':
                      {
                        CyberiaWsBotManagement.localElementScope[wsManagementId][element.id].disabled = true;
                        for (const elementId of Object.keys(CyberiaWsUserManagement.element[wsManagementId])) {
                          if (
                            elementId !== socket.id &&
                            objectEquals(
                              CyberiaWsUserManagement.element[wsManagementId][elementId].model.world,
                              CyberiaWsBotManagement.element[wsManagementId][element.id].model.world,
                            )
                          ) {
                            CyberiaWsEmit(CyberiaWsBotChannel.channel, client[elementId], {
                              status: 'disconnect',
                              id: element.id,
                            });
                          }
                        }
                        setTimeout(() => {
                          const { x, y } =
                            CyberiaWsBotManagement.localElementScope[wsManagementId][
                              element.id
                            ].api.getRandomPosition();
                          CyberiaWsBotManagement.element[wsManagementId][element.id].x = x;
                          CyberiaWsBotManagement.element[wsManagementId][element.id].y = y;

                          CyberiaWsBotManagement.localElementScope[wsManagementId][element.id].disabled = false;
                          for (const elementId of Object.keys(CyberiaWsUserManagement.element[wsManagementId])) {
                            if (
                              objectEquals(
                                CyberiaWsUserManagement.element[wsManagementId][elementId].model.world,
                                CyberiaWsBotManagement.element[wsManagementId][element.id].model.world,
                              )
                            ) {
                              CyberiaWsEmit(CyberiaWsBotChannel.channel, client[elementId], {
                                status: 'connection',
                                id: element.id,
                                element: CyberiaWsBotManagement.element[wsManagementId][element.id],
                              });
                            }
                          }
                        }, CyberiaWsBotManagement.localElementScope[wsManagementId][element.id].respawn);
                      }
                      break;

                    default:
                      break;
                  }
                }
              }
            }
          }
        }
        break;
      case 'transportBlock': {
        CyberiaWsUserManagement.localElementScope[wsManagementId][socket.id].transportBlock = false;
        break;
      }
      case 'register-cyberia-user':
        {
          /** @type {import('../../../api/cyberia-user/cyberia-user.model.js').CyberiaUserModel} */
          const CyberiaUser = DataBaseProvider.instance[`${wsManagementId}`].mongoose.models.CyberiaUser;
          /** @type {import('../../../api/cyberia-world/cyberia-world.model.js').CyberiaWorldModel} */
          const CyberiaWorld = DataBaseProvider.instance[`${wsManagementId}`].mongoose.models.CyberiaWorld;

          const userDoc = await CyberiaUser.findById(args.user._id);
          const user = userDoc._doc;
          user.model.user = CyberiaWsUserManagement.element[wsManagementId][socket.id].model.user;
          user.model.world._id = user.model.world._id.toString();

          const worldDoc = await CyberiaWorld.findById(user.model.world._id);
          if (!worldDoc) {
            const baseElement = BaseElement({
              worldId: CyberiaWsInstanceScope[wsManagementId].world.instance._id.toString(),
            }).user.main;
            user.model.world = baseElement.model.world;
            user.x = baseElement.x;
            user.y = baseElement.y;
          }

          user._id = user._id.toString();
          CyberiaWsUserManagement.element[wsManagementId][socket.id] = {
            ...CyberiaWsUserManagement.element[wsManagementId][socket.id],
            ...user,
          };
          CyberiaWsUserManagement.element[wsManagementId][socket.id] = Stat.set(
            channel,
            CyberiaWsUserManagement.element[wsManagementId][socket.id],
          );
          propagate();
        }
        break;
      case 'unregister-cyberia-user':
        {
          if (CyberiaWsInstanceScope[wsManagementId].world.instance)
            CyberiaWsUserManagement.element[wsManagementId][socket.id] = BaseElement({
              worldId: CyberiaWsInstanceScope[wsManagementId].world.instance._id.toString(),
            }).user.main;
          else CyberiaWsUserManagement.element[wsManagementId][socket.id] = BaseElement().user.main;
          propagate();
        }
        break;
      case 'update-position':
        if (
          CyberiaWsUserManagement.localElementScope[wsManagementId][socket.id].transportBlock ||
          CyberiaWsUserManagement.localElementScope[wsManagementId][socket.id].immunityQuestModalDialog
        )
          break;
        CyberiaWsUserManagement.element[wsManagementId][socket.id].x = element.x;
        CyberiaWsUserManagement.element[wsManagementId][socket.id].y = element.y;
        for (const elementId of Object.keys(CyberiaWsUserManagement.element[wsManagementId])) {
          if (
            elementId !== socket.id &&
            objectEquals(
              CyberiaWsUserManagement.element[wsManagementId][elementId].model.world,
              CyberiaWsUserManagement.element[wsManagementId][socket.id].model.world,
            )
          ) {
            CyberiaWsEmit(channel, client[elementId], {
              status,
              id: socket.id,
              element: { x: element.x, y: element.y },
            });
          }
        }
        break;
      case 'update-world-face':
        for (const elementId of Object.keys(CyberiaWsUserManagement.element[wsManagementId])) {
          if (
            elementId !== socket.id &&
            objectEquals(
              CyberiaWsUserManagement.element[wsManagementId][elementId].model.world,
              CyberiaWsUserManagement.element[wsManagementId][socket.id].model.world,
            )
          ) {
            CyberiaWsEmit(channel, client[elementId], {
              status: 'disconnect',
              id: socket.id,
            });
          }
        }
        CyberiaWsUserManagement.element[wsManagementId][socket.id].model.world = element.model.world;
        for (const elementId of Object.keys(CyberiaWsUserManagement.element[wsManagementId])) {
          if (
            objectEquals(
              CyberiaWsUserManagement.element[wsManagementId][elementId].model.world,
              CyberiaWsUserManagement.element[wsManagementId][socket.id].model.world,
            )
          ) {
            if (elementId !== socket.id) {
              CyberiaWsEmit(channel, client[elementId], {
                status: 'connection',
                id: socket.id,
                element: CyberiaWsUserManagement.element[wsManagementId][socket.id],
              });
              CyberiaWsEmit(channel, socket, {
                status: 'connection',
                id: elementId,
                element: CyberiaWsUserManagement.element[wsManagementId][elementId],
              });
            }
          }
        }
        for (const elementId of Object.keys(CyberiaWsSkillManagement.element[wsManagementId])) {
          if (
            objectEquals(
              CyberiaWsSkillManagement.element[wsManagementId][elementId].model.world,
              CyberiaWsUserManagement.element[wsManagementId][socket.id].model.world,
            )
          ) {
            CyberiaWsEmit(CyberiaWsSkillChannel.channel, socket, {
              status: 'connection',
              id: elementId,
              element: CyberiaWsSkillManagement.element[wsManagementId][elementId],
            });
          }
        }
        break;

      case 'update-skill':
        CyberiaWsUserManagement.element[wsManagementId][socket.id].skill = element.skill;
        break;
      case 'update-skin-position':
        CyberiaWsUserManagement.element[wsManagementId][socket.id].components.skin = element.components.skin;
        if (args.updateStat)
          CyberiaWsUserManagement.element[wsManagementId][socket.id] = Stat.set(
            channel,
            CyberiaWsUserManagement.element[wsManagementId][socket.id],
          );
        CyberiaWsUserManagement.localElementScope[wsManagementId][socket.id].direction = args.direction;
        for (const elementId of Object.keys(CyberiaWsUserManagement.element[wsManagementId])) {
          if (
            elementId !== socket.id &&
            objectEquals(
              CyberiaWsUserManagement.element[wsManagementId][elementId].model.world,
              CyberiaWsUserManagement.element[wsManagementId][socket.id].model.world,
            )
          ) {
            CyberiaWsEmit(channel, client[elementId], {
              status,
              id: socket.id,
              element: { components: { skin: element.components.skin } },
              updateStat: args.updateStat,
            });
          }
        }
        break;
      case 'update-item':
        {
          const { itemType } = args;
          const elementUpdate = { components: {} };
          elementUpdate.components[itemType] = element.components[itemType];
          CyberiaWsUserManagement.element[wsManagementId][socket.id].components[itemType] =
            element.components[itemType];
          CyberiaWsUserManagement.element[wsManagementId][socket.id] = Stat.set(
            channel,
            CyberiaWsUserManagement.element[wsManagementId][socket.id],
          );

          for (const elementId of Object.keys(CyberiaWsUserManagement.element[wsManagementId])) {
            if (
              elementId !== socket.id &&
              objectEquals(
                CyberiaWsUserManagement.element[wsManagementId][elementId].model.world,
                CyberiaWsUserManagement.element[wsManagementId][socket.id].model.world,
              )
            ) {
              CyberiaWsEmit(channel, client[elementId], {
                status,
                id: socket.id,
                itemType,
                element: elementUpdate,
              });
            }
          }
        }
        break;
      default:
        break;
    }
  },
  connection: function (socket, client, wsManagementId) {
    if (CyberiaWsInstanceScope[wsManagementId].world.instance)
      CyberiaWsUserManagement.element[wsManagementId][socket.id] = BaseElement({
        worldId: CyberiaWsInstanceScope[wsManagementId].world.instance._id.toString(),
      })[channel].main;
    else CyberiaWsUserManagement.element[wsManagementId][socket.id] = BaseElement()[channel].main;

    CyberiaWsUserManagement.localElementScope[wsManagementId][socket.id] = {
      direction: 's',
      transportBlock: true,
    };
    CyberiaWsEmit(channel, socket, {
      status: 'connection',
      id: socket.id,
      element: CyberiaWsUserManagement.element[wsManagementId][socket.id],
    });
    for (const elementId of Object.keys(CyberiaWsUserManagement.element[wsManagementId])) {
      if (
        objectEquals(
          CyberiaWsUserManagement.element[wsManagementId][elementId].model.world,
          CyberiaWsUserManagement.element[wsManagementId][socket.id].model.world,
        )
      ) {
        if (elementId !== socket.id)
          CyberiaWsEmit(channel, socket, {
            status: 'connection',
            id: elementId,
            element: CyberiaWsUserManagement.element[wsManagementId][elementId],
          });
      }
    }
    CyberiaWsUserManagement.setRegenerationLife(wsManagementId, socket.id);
    {
      const status = 'update-position';
      this.controller(
        socket,
        client,
        {
          status,
          element: CyberiaWsInstanceScope[wsManagementId].user,
        },
        wsManagementId,
      );
      CyberiaWsEmit(channel, client[socket.id], {
        status,
        id: socket.id,
        element: CyberiaWsInstanceScope[wsManagementId].user,
      });
    }
  },
  disconnect: function (socket, client, reason, wsManagementId) {
    for (const elementId of Object.keys(CyberiaWsUserManagement.element[wsManagementId])) {
      if (
        elementId !== socket.id &&
        objectEquals(
          CyberiaWsUserManagement.element[wsManagementId][elementId].model.world,
          CyberiaWsUserManagement.element[wsManagementId][socket.id].model.world,
        )
      )
        CyberiaWsEmit(channel, client[elementId], {
          status: 'disconnect',
          id: socket.id,
        });
    }
    delete CyberiaWsUserManagement.element[wsManagementId][socket.id];
    delete CyberiaWsUserManagement.localElementScope[wsManagementId][socket.id];
  },
};

const CyberiaWsUserChannel = IoCreateChannel(CyberiaWsUserController);

export { CyberiaWsUserChannel, CyberiaWsUserController };
