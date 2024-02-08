import { getId, newInstance, objectEquals } from '../../../client/components/core/CommonJs.js';
import { BaseElement, SkillType } from '../../../client/components/cyberia/CommonCyberia.js';
import { loggerFactory } from '../../../server/logger.js';
import { CyberiaWsSkillChannel } from '../channels/cyberia.ws.skill.js';
import { CyberiaWsEmit } from '../cyberia.ws.emit.js';
import { CyberiaWsBotManagement } from './cyberia.ws.bot.js';
import { CyberiaWsUserManagement } from './cyberia.ws.user.js';

const logger = loggerFactory(import.meta);

const CyberiaWsSkillManagement = {
  element: {},
  instance: function (wsManagementId = '') {
    this.element[wsManagementId] = {};
  },
  createSkill: function (wsManagementId = '', parent = { id: '', type: '' }, skillKey = '') {
    let parentElement;
    switch (parent.type) {
      case 'user':
        parentElement = CyberiaWsUserManagement.element[wsManagementId][parent.id];
        break;
      case 'bot':
        parentElement = CyberiaWsBotManagement.element[wsManagementId][parent.id];
        break;
      default:
        break;
    }
    if (!parentElement) return logger.error('Not found skill caster parent', parent);
    else parentElement = newInstance(parentElement);

    const id = getId(this.element[wsManagementId], 'skill-');
    if (!skillKey) skillKey = parentElement.skill.basic;
    const skillData = SkillType[parentElement.skill.keys[skillKey]];

    this.element[wsManagementId][id] = BaseElement().skill.main;
    this.element[wsManagementId][id].x = parentElement.x;
    this.element[wsManagementId][id].y = parentElement.y;
    this.element[wsManagementId][id].parent = parent;
    this.element[wsManagementId][id].model.world = parentElement.model.world;
    this.element[wsManagementId][id].components.skill.push(skillData.component);

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
    }, skillData.timeLife);
  },
};

export { CyberiaWsSkillManagement };
