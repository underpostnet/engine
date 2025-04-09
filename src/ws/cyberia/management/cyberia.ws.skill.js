import { getId, newInstance, objectEquals, random, timer } from '../../../client/components/core/CommonJs.js';
import {
  BaseElement,
  CyberiaParams,
  DisplayComponent,
  QuestComponent,
  ResourcesComponentCyberia,
  SkillCyberiaData,
  Stat,
  WorldCyberiaType,
  isElementCollision,
} from '../../../client/components/cyberia/CommonCyberia.js';
import { DataBaseProvider } from '../../../db/DataBaseProvider.js';
import { loggerFactory } from '../../../server/logger.js';
import { CyberiaWsSkillChannel } from '../channels/cyberia.ws.skill.js';
import { CyberiaWsUserChannel } from '../channels/cyberia.ws.user.js';
import { CyberiaWsInstanceScope } from '../cyberia.ws.server.js';
import { CyberiaWsEmit } from '../cyberia.ws.emit.js';
import { CyberiaWsBotManagement } from './cyberia.ws.bot.js';
import { CyberiaWsUserManagement } from './cyberia.ws.user.js';
import dotenv from 'dotenv';

dotenv.config();

const logger = loggerFactory(import.meta);

const CyberiaWsSkillManagement = {
  element: {},
  localElementScope: {},
  instance: async function (wsManagementId = '') {
    this.element[wsManagementId] = {};
    this.localElementScope[wsManagementId] = {};
    /** @type {import('../../../api/cyberia-world/cyberia-world.model.js').CyberiaWorldModel} */
    const CyberiaWorld = DataBaseProvider.instance[`${wsManagementId}`].mongoose.models.CyberiaWorld;
  },
  createSkill: function (
    wsManagementId = '',
    parent = { id: '', type: '' },
    skillKey = '',
    biome = {
      dimPaintByCell: 3,
      dim: 1,
      dimAmplitude: 8,
    },
  ) {
    let parentElement;
    let direction;
    switch (parent.type) {
      case 'user':
        parentElement = newInstance(CyberiaWsUserManagement.element[wsManagementId][parent.id]);
        direction = `${CyberiaWsUserManagement.localElementScope[wsManagementId][parent.id].direction}`;
        break;
      case 'bot':
        parentElement = newInstance(CyberiaWsBotManagement.element[wsManagementId][parent.id]);
        direction = `${CyberiaWsBotManagement.localElementScope[wsManagementId][parent.id].target.Direction}`;
        break;
      default:
        break;
    }
    if (parentElement.life <= 0) return;
    if (!parentElement) return logger.error('Not found skill caster parent', parent);

    const world = CyberiaWsInstanceScope[wsManagementId].world.instance;
    const id = getId(this.element[wsManagementId], 'skill-');
    if (!skillKey) skillKey = 'basic';
    const skillData = Stat.get[parentElement.skill.keys[skillKey]]();
    this.element[wsManagementId][id] = BaseElement({
      worldId: world._id.toString(),
    }).skill.main;
    this.element[wsManagementId][id].x = parentElement.x + (parentElement.dim > 1 ? (parentElement.dim - 1) / 2 : 0);
    this.element[wsManagementId][id].y = parentElement.y + (parentElement.dim > 1 ? (parentElement.dim - 1) / 2 : 0);
    this.element[wsManagementId][id].parent = parent;
    this.element[wsManagementId][id].model.world = parentElement.model.world;

    // skill stats
    this.element[wsManagementId][id] = {
      ...this.element[wsManagementId][id],
      ...skillData,
    };
    if (
      SkillCyberiaData[parentElement.skill.keys[skillKey]] &&
      SkillCyberiaData[parentElement.skill.keys[skillKey]].skillDisplayData
    ) {
      this.element[wsManagementId][id].components.skin = [
        {
          ...SkillCyberiaData[parentElement.skill.keys[skillKey]].skillDisplayData,
          current: true,
          enabled: true,
        },
      ];
    } else if (parentElement.skill.keys[skillKey] in DisplayComponent.get) {
      this.element[wsManagementId][id].components.skin = [
        {
          ...DisplayComponent.get[parentElement.skill.keys[skillKey]](),
          current: true,
          enabled: true,
        },
      ];
    } else {
      this.element[wsManagementId][id].components.skin[0].displayId = parentElement.skill.keys[skillKey];
    }

    this.localElementScope[wsManagementId][id] = {};

    for (const clientId of Object.keys(CyberiaWsUserManagement.element[wsManagementId])) {
      if (
        objectEquals(parentElement.model.world, CyberiaWsUserManagement.element[wsManagementId][clientId].model.world)
      ) {
        CyberiaWsEmit(CyberiaWsSkillChannel.channel, CyberiaWsSkillChannel.client[clientId], {
          status: 'connection',
          id,
          element: this.element[wsManagementId][id],
        });
      }
    }
    this.localElementScope[wsManagementId][id].movement = {
      Callback: async () => {
        try {
          switch (parentElement.skill.keys[skillKey]) {
            case 'heal':
              {
                switch (parent.type) {
                  case 'user':
                    const newLife =
                      CyberiaWsUserManagement.element[wsManagementId][parent.id].life +
                      skillData.heal +
                      parentElement.heal;
                    CyberiaWsUserManagement.updateLife({
                      wsManagementId,
                      id: parent.id,
                      life: newLife,
                    });
                    break;
                  default:
                    break;
                }
              }
              return;

            default:
              break;
          }
          await timer(CyberiaParams.EVENT_CALLBACK_TIME);
          if (!this.element[wsManagementId][id]) return;
          for (const directionCode of direction) {
            switch (directionCode) {
              case 's':
                this.element[wsManagementId][id].y += this.element[wsManagementId][id].vel;
                break;
              case 'n':
                this.element[wsManagementId][id].y -= this.element[wsManagementId][id].vel;
                break;
              case 'e':
                this.element[wsManagementId][id].x += this.element[wsManagementId][id].vel;
                break;
              case 'w':
                this.element[wsManagementId][id].x -= this.element[wsManagementId][id].vel;
                break;
              default:
                break;
            }
          }
          for (const clientId of Object.keys(CyberiaWsUserManagement.element[wsManagementId])) {
            if (
              objectEquals(
                parentElement.model.world,
                CyberiaWsUserManagement.element[wsManagementId][clientId].model.world,
              )
            ) {
              CyberiaWsEmit(CyberiaWsSkillChannel.channel, CyberiaWsSkillChannel.client[clientId], {
                status: 'update-position',
                id,
                element: { x: this.element[wsManagementId][id].x, y: this.element[wsManagementId][id].y },
              });
              switch (parent.type) {
                case 'user':
                case 'bot':
                  if (
                    CyberiaWsUserManagement.localElementScope[wsManagementId][clientId].transportBlock ||
                    CyberiaWsUserManagement.localElementScope[wsManagementId][clientId].immunityQuestModalDialog
                  )
                    break;

                  if (
                    (parent.type === 'bot' ||
                      (parent.type === 'user' &&
                        world.instance[
                          WorldCyberiaType[world.type].worldFaces.findIndex((f) => f === parentElement.model.world.face)
                        ].type === 'pvp')) &&
                    CyberiaWsUserManagement.element[wsManagementId][clientId].life > 0 &&
                    isElementCollision({
                      A: this.element[wsManagementId][id],
                      B: CyberiaWsUserManagement.element[wsManagementId][clientId],
                      dimPaintByCell: biome.dimPaintByCell,
                    })
                  )
                    if (!(parent.type === 'user' && parent.id === clientId)) {
                      let newLife;
                      switch (parentElement.skill.keys[skillKey]) {
                        case 'green-power':
                          newLife =
                            CyberiaWsUserManagement.element[wsManagementId][clientId].life +
                            skillData.heal +
                            parentElement.heal;
                          break;

                        default:
                          newLife =
                            CyberiaWsUserManagement.element[wsManagementId][clientId].life -
                            skillData.damage -
                            parentElement.damage;
                          break;
                      }
                      CyberiaWsUserManagement.updateLife({
                        wsManagementId,
                        id: clientId,
                        life: newLife,
                      });
                    }
                  break;

                default:
                  break;
              }
            }
          }
          for (const botId of Object.keys(CyberiaWsBotManagement.element[wsManagementId])) {
            if (
              objectEquals(parentElement.model.world, CyberiaWsBotManagement.element[wsManagementId][botId].model.world)
            ) {
              switch (parent.type) {
                case 'user':
                  if (
                    ['user-hostile', 'resource'].includes(
                      CyberiaWsBotManagement.localElementScope[wsManagementId][botId].displayBotMetaData.behavior,
                    ) &&
                    CyberiaWsBotManagement.element[wsManagementId][botId].life > 0 &&
                    isElementCollision({
                      A: this.element[wsManagementId][id],
                      B: CyberiaWsBotManagement.element[wsManagementId][botId],
                      dimPaintByCell: biome.dimPaintByCell,
                    })
                  ) {
                    let enabledFlow = true;
                    switch (
                      CyberiaWsBotManagement.localElementScope[wsManagementId][botId].displayBotMetaData.behavior
                    ) {
                      case 'resource':
                        {
                          enabledFlow = false;
                          for (const itemSubtractData of ResourcesComponentCyberia[
                            CyberiaWsBotManagement.localElementScope[wsManagementId][botId].displayBotMetaData.id
                          ].subtractItemId) {
                            const testDisplayItemSubtract = CyberiaWsUserManagement.element[wsManagementId][
                              parent.id
                            ].components[itemSubtractData.itemType].find((t) => t.current === true);
                            if (testDisplayItemSubtract && testDisplayItemSubtract.displayId === itemSubtractData.id) {
                              enabledFlow = true;
                              break;
                            }
                          }
                        }
                        break;

                      default:
                        break;
                    }
                    if (!enabledFlow) break;
                    let newLife;
                    switch (parentElement.skill.keys[skillKey]) {
                      case 'green-power':
                        newLife =
                          CyberiaWsBotManagement.element[wsManagementId][botId].life +
                          skillData.heal +
                          parentElement.heal;
                        break;

                      default:
                        newLife =
                          CyberiaWsBotManagement.element[wsManagementId][botId].life -
                          skillData.damage -
                          parentElement.damage;
                        break;
                    }
                    CyberiaWsBotManagement.updateLife({
                      wsManagementId,
                      id: botId,
                      life: newLife,
                    });
                    if (newLife <= 0) {
                      switch (
                        CyberiaWsBotManagement.localElementScope[wsManagementId][botId].displayBotMetaData.behavior
                      ) {
                        case 'resource':
                          {
                            let indexDataResource = CyberiaWsUserManagement.element[wsManagementId][
                              parent.id
                            ].resource.tree.findIndex(
                              (r) =>
                                r.id ===
                                CyberiaWsBotManagement.localElementScope[wsManagementId][botId].displayBotMetaData.id,
                            );

                            if (indexDataResource < 0) {
                              indexDataResource = newInstance(
                                CyberiaWsUserManagement.element[wsManagementId][parent.id].resource.tree.length,
                              );
                              CyberiaWsUserManagement.element[wsManagementId][parent.id].resource.tree.push({
                                id: CyberiaWsBotManagement.localElementScope[wsManagementId][botId].displayBotMetaData
                                  .id,
                                quantity: 0,
                              });
                              CyberiaWsUserManagement.element[wsManagementId][parent.id].components.resource.push(
                                DisplayComponent.get[
                                  CyberiaWsBotManagement.localElementScope[wsManagementId][botId].displayBotMetaData.id
                                ](),
                              );
                            }

                            const quantity = random(
                              ...ResourcesComponentCyberia[
                                CyberiaWsBotManagement.localElementScope[wsManagementId][botId].displayBotMetaData.id
                              ].drop.range,
                            );
                            CyberiaWsUserManagement.element[wsManagementId][parent.id].resource.tree[
                              indexDataResource
                            ].quantity += quantity;
                            CyberiaWsEmit(CyberiaWsUserChannel.channel, CyberiaWsUserChannel.client[parent.id], {
                              status: 'update-resource',
                              id: parent.id,
                              element: {
                                resource: {
                                  id: CyberiaWsBotManagement.localElementScope[wsManagementId][botId].displayBotMetaData
                                    .id,
                                  tree: CyberiaWsUserManagement.element[wsManagementId][parent.id].resource.tree,
                                },
                                components: {
                                  resource:
                                    CyberiaWsUserManagement.element[wsManagementId][parent.id].components.resource,
                                },
                              },
                            });
                          }
                          break;

                        default:
                          {
                            CyberiaWsUserManagement.element[wsManagementId][parent.id].coin += random(
                              CyberiaWsBotManagement.localElementScope[wsManagementId][botId].drop.coin.range[0],
                              CyberiaWsBotManagement.localElementScope[wsManagementId][botId].drop.coin.range[1],
                            );
                            CyberiaWsEmit(CyberiaWsUserChannel.channel, CyberiaWsUserChannel.client[parent.id], {
                              status: 'update-coin',
                              id: parent.id,
                              element: {
                                coin: CyberiaWsUserManagement.element[wsManagementId][parent.id].coin,
                              },
                            });
                          }
                          break;
                      }
                      const componentData = CyberiaWsBotManagement.element[wsManagementId][botId].components.skin.find(
                        (s) => s.current,
                      );
                      if (componentData) {
                        const questIndex = CyberiaWsUserManagement.element[wsManagementId][
                          parent.id
                        ].model.quests.findIndex((q) =>
                          q.displaySearchObjects.find(
                            (s) => s.id === componentData.displayId && s.step === q.currentStep,
                          ),
                        );
                        if (questIndex >= 0) {
                          const questData =
                            CyberiaWsUserManagement.element[wsManagementId][parent.id].model.quests[questIndex];

                          const itemQuestIndex = questData.displaySearchObjects.findIndex(
                            (o) => o.id === componentData.displayId && o.step === questData.currentStep,
                          );

                          if (itemQuestIndex >= 0) {
                            const itemData = questData.displaySearchObjects[itemQuestIndex];
                            if (
                              QuestComponent.componentsScope[itemData.id].questKeyContext === 'displayKillObjects' &&
                              itemData.current < itemData.quantity
                            ) {
                              CyberiaWsUserManagement.element[wsManagementId][parent.id].model.quests[questIndex]
                                .displaySearchObjects[itemQuestIndex].current++;
                              CyberiaWsEmit(CyberiaWsUserChannel.channel, CyberiaWsUserChannel.client[parent.id], {
                                status: 'update-quantity-quest-item',
                                id: parent.id,
                                displayId: componentData.displayId,
                                questIndex,
                                itemQuestIndex,
                                questData: {
                                  id: questData.id,
                                },
                              });
                              CyberiaWsUserManagement.verifyCompleteQuest({
                                wsManagementId,
                                questIndex,
                                elementId: parent.id,
                              });
                            }
                          }
                        }
                      }
                    }
                  }
                  break;

                default:
                  break;
              }
            }
          }
        } catch (error) {
          logger.error(error, { stack: error.stack, wsManagementId, id });
        }
        this.localElementScope[wsManagementId][id].movement.Callback();
      },
    };
    this.localElementScope[wsManagementId][id].movement.Callback();
    setTimeout(() => {
      for (const clientId of Object.keys(CyberiaWsUserManagement.element[wsManagementId])) {
        if (
          objectEquals(parentElement.model.world, CyberiaWsUserManagement.element[wsManagementId][clientId].model.world)
        ) {
          CyberiaWsEmit(CyberiaWsSkillChannel.channel, CyberiaWsSkillChannel.client[clientId], {
            status: 'disconnect',
            id,
          });
        }
      }
      delete this.element[wsManagementId][id];
      delete this.localElementScope[wsManagementId][id];
    }, skillData.timeLife);
  },
};

export { CyberiaWsSkillManagement };
