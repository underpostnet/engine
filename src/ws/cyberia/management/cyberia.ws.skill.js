import { getId, newInstance, objectEquals, timer } from '../../../client/components/core/CommonJs.js';
import {
  BaseElement,
  CyberiaBaseMatrix,
  CyberiaParams,
  SkillType,
  isElementCollision,
} from '../../../client/components/cyberia/CommonCyberia.js';
import { loggerFactory } from '../../../server/logger.js';
import { CyberiaWsSkillChannel } from '../channels/cyberia.ws.skill.js';
import { CyberiaWsEmit } from '../cyberia.ws.emit.js';
import { CyberiaWsBotManagement } from './cyberia.ws.bot.js';
import { CyberiaWsUserManagement } from './cyberia.ws.user.js';

const logger = loggerFactory(import.meta);

const CyberiaWsSkillManagement = {
  element: {},
  localElementScope: {},
  matrixData: CyberiaBaseMatrix(),
  instance: function (wsManagementId = '') {
    this.element[wsManagementId] = {};
    this.localElementScope[wsManagementId] = {};
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
    if (!parentElement) return logger.error('Not found skill caster parent', parent);

    const id = getId(this.element[wsManagementId], 'skill-');
    if (!skillKey) skillKey = parentElement.skill.basic;
    const skillData = SkillType[parentElement.skill.keys[skillKey]];

    this.element[wsManagementId][id] = BaseElement().skill.main;
    this.element[wsManagementId][id].x = parentElement.x;
    this.element[wsManagementId][id].y = parentElement.y;
    this.element[wsManagementId][id].parent = parent;
    this.element[wsManagementId][id].model.world = parentElement.model.world;
    this.element[wsManagementId][id].components.skill.push(skillData.component);
    this.element[wsManagementId][id].vel = 0.2;
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
                      life: CyberiaWsUserManagement.element[wsManagementId][clientId].life - skillData.damage,
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
                  isElementCollision({
                    A: this.element[wsManagementId][id],
                    B: CyberiaWsBotManagement.element[wsManagementId][botId],
                    dimPaintByCell: this.matrixData.dimPaintByCell,
                  })
                )
                  CyberiaWsBotManagement.updateLife({
                    wsManagementId,
                    id: botId,
                    life: CyberiaWsBotManagement.element[wsManagementId][botId].life - skillData.damage,
                  });
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
