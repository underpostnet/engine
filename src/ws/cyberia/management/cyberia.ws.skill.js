import { getId, newInstance, objectEquals, random, timer } from '../../../client/components/core/CommonJs.js';
import {
  BaseElement,
  CyberiaBaseMatrix,
  CyberiaParams,
  Stat,
  WorldType,
  isElementCollision,
} from '../../../client/components/cyberia/CommonCyberia.js';
import { DataBaseProvider } from '../../../db/DataBaseProvider.js';
import { loggerFactory } from '../../../server/logger.js';
import { CyberiaWsSkillChannel } from '../channels/cyberia.ws.skill.js';
import { CyberiaWsUserChannel } from '../channels/cyberia.ws.user.js';
import { CyberiaWsEmit } from '../cyberia.ws.emit.js';
import { CyberiaWsBotManagement } from './cyberia.ws.bot.js';
import { CyberiaWsUserManagement } from './cyberia.ws.user.js';
import dotenv from 'dotenv';

dotenv.config();

const logger = loggerFactory(import.meta);

const CyberiaWsSkillManagement = {
  element: {},
  localElementScope: {},
  matrixData: CyberiaBaseMatrix(),
  instance: async function (wsManagementId = '') {
    this.element[wsManagementId] = {};
    this.localElementScope[wsManagementId] = {};
    /** @type {import('../../../api/cyberia-world/cyberia-world.model.js').CyberiaWorldModel} */
    const CyberiaWorld = DataBaseProvider.instance[`${wsManagementId}`].mongoose.CyberiaWorld;
    this.world = await CyberiaWorld.findById(process.env.CYBERIA_WORLD_ID);
  },
  createSkill: function (wsManagementId = '', parent = { id: '', type: '' }, skillKey = '') {
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

    const id = getId(this.element[wsManagementId], 'skill-');
    if (!skillKey) skillKey = 'basic';
    const skillData = Stat.get[parentElement.skill.keys[skillKey]]();
    this.element[wsManagementId][id] = BaseElement({ worldId: process.env.CYBERIA_WORLD_ID }).skill.main;
    this.element[wsManagementId][id].x = parentElement.x + (parentElement.dim > 1 ? (parentElement.dim - 1) / 2 : 0);
    this.element[wsManagementId][id].y = parentElement.y + (parentElement.dim > 1 ? (parentElement.dim - 1) / 2 : 0);
    this.element[wsManagementId][id].parent = parent;
    this.element[wsManagementId][id].model.world = parentElement.model.world;

    // skill stats
    this.element[wsManagementId][id] = {
      ...this.element[wsManagementId][id],
      ...skillData,
    };
    this.element[wsManagementId][id].components.skin[0].displayId = parentElement.skill.keys[skillKey];

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
        await timer(CyberiaParams.CYBERIA_EVENT_CALLBACK_TIME);
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
                  (parent.type === 'bot' ||
                    (parent.type === 'user' &&
                      this.world.instance[
                        WorldType[this.world.type].worldFaces.findIndex((f) => f === parentElement.model.world.face)
                      ].type === 'pvp')) &&
                  CyberiaWsUserManagement.element[wsManagementId][clientId].life > 0 &&
                  isElementCollision({
                    A: this.element[wsManagementId][id],
                    B: CyberiaWsUserManagement.element[wsManagementId][clientId],
                    dimPaintByCell: this.matrixData.dimPaintByCell,
                  })
                )
                  if (!(parent.type === 'user' && parent.id === clientId))
                    CyberiaWsUserManagement.updateLife({
                      wsManagementId,
                      id: clientId,
                      life:
                        CyberiaWsUserManagement.element[wsManagementId][clientId].life -
                        skillData.damage -
                        parentElement.damage,
                    });
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
                  CyberiaWsBotManagement.localElementScope[wsManagementId][botId].metaDataBot.type === 'user-hostile' &&
                  CyberiaWsBotManagement.element[wsManagementId][botId].life > 0 &&
                  isElementCollision({
                    A: this.element[wsManagementId][id],
                    B: CyberiaWsBotManagement.element[wsManagementId][botId],
                    dimPaintByCell: this.matrixData.dimPaintByCell,
                  })
                ) {
                  const newLife =
                    CyberiaWsBotManagement.element[wsManagementId][botId].life -
                    skillData.damage -
                    parentElement.damage;
                  CyberiaWsBotManagement.updateLife({
                    wsManagementId,
                    id: botId,
                    life: newLife,
                  });
                  if (newLife <= 0) {
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
                }
                break;

              default:
                break;
            }
          }
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
