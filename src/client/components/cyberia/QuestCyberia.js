import { loggerFactory } from '../core/Logger.js';
import { isElementCollision } from './CommonCyberia.js';
import { ElementsCyberia } from './ElementsCyberia.js';
import { InteractionPanelCyberia } from './InteractionPanelCyberia.js';
import { MatrixCyberia } from './MatrixCyberia.js';
import { WorldCyberiaManagement } from './WorldCyberia.js';

const logger = loggerFactory(import.meta);

// https://github.com/underpostnet/cyberia/blob/master/modules/main/mod_quest/quest.js

const QuestManagementCyberia = {
  IntervalQuestDetector: null,
  Data: {},
  Load: async function ({ type, id }) {
    const radius = 3.5;

    if (this.IntervalQuestDetector) clearInterval(this.IntervalQuestDetector);

    if (WorldCyberiaManagement.Data[type] && WorldCyberiaManagement.Data['user']['main'])
      this.IntervalQuestDetector = setInterval(async () => {
        for (const instance of WorldCyberiaManagement.Data[type]['main'].model.world.instance) {
          const botsQuest = instance.bots.filter((b) => b.behavior === 'quest-passive');
          for (const botQuestData of botsQuest) {
            for (const botId of Object.keys(ElementsCyberia.Data['bot'])) {
              const displayId = ElementsCyberia.getCurrentSkinDisplayId({ type: 'bot', id: botId });
              if (
                botQuestData.displayIds.includes(displayId) &&
                isElementCollision({
                  A: {
                    dim: ElementsCyberia.Data['bot'][botId].dim * radius,
                    x: ElementsCyberia.Data['bot'][botId].x - (ElementsCyberia.Data['bot'][botId].dim * radius) / 2,
                    y: ElementsCyberia.Data['bot'][botId].y - (ElementsCyberia.Data['bot'][botId].dim * radius) / 2,
                  },
                  B: ElementsCyberia.Data['user']['main'],
                  dimPaintByCell: MatrixCyberia.Data.dimPaintByCell,
                })
              ) {
                logger.warn('quest provider detector', { type: 'bot', id: botId });
                return await InteractionPanelCyberia.PanelRender.element({ type: 'bot', id: botId });
              }
            }
          }
        }
      }, 500);
  },
};

const QuestCyberia = {
  Render: async function () {
    return html``;
  },
};

export { QuestManagementCyberia, QuestCyberia };
