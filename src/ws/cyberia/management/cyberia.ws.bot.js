import { getId, range } from '../../../client/components/core/CommonJs.js';
import { BaseElement } from '../../../client/components/cyberia/CommonCyberia.js';

const CyberiaWsBotManagement = {
  element: {},
  instance: function (wsManagementId = '') {
    this.element[wsManagementId] = {};
    for (const indexBot of range(0, 0)) {
      this.element[wsManagementId][getId(this.element[wsManagementId], 'bot-')] = BaseElement().bot.main;
    }
  },
};

export { CyberiaWsBotManagement };
