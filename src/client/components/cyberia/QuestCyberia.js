import { loggerFactory } from '../core/Logger.js';
import { htmls, s } from '../core/VanillaJs.js';
import { QuestComponent, isElementCollision } from './CommonCyberia.js';
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
    const typeTarget = 'bot';

    if (this.IntervalQuestDetector) clearInterval(this.IntervalQuestDetector);

    if (WorldCyberiaManagement.Data[type] && WorldCyberiaManagement.Data[type][id]) {
      this.IntervalQuestDetector = setInterval(async () => {
        for (const instance of WorldCyberiaManagement.Data[type][id].model.world.instance) {
          const botsQuest = instance.bots.filter((b) => b.behavior === 'quest-passive');
          for (const botQuestData of botsQuest) {
            for (const elementTargetId of Object.keys(ElementsCyberia.Data[typeTarget])) {
              const displayId = ElementsCyberia.getCurrentSkinDisplayId({ type: typeTarget, id: elementTargetId });
              if (
                botQuestData.displayIds.includes(displayId) &&
                isElementCollision({
                  A: {
                    dim: ElementsCyberia.Data[typeTarget][elementTargetId].dim * radius,
                    x:
                      ElementsCyberia.Data[typeTarget][elementTargetId].x -
                      (ElementsCyberia.Data[typeTarget][elementTargetId].dim * radius) / 2,
                    y:
                      ElementsCyberia.Data[typeTarget][elementTargetId].y -
                      (ElementsCyberia.Data[typeTarget][elementTargetId].dim * radius) / 2,
                  },
                  B: ElementsCyberia.Data[type][id],
                  dimPaintByCell: MatrixCyberia.Data.dimPaintByCell,
                })
              ) {
                logger.warn('quest provider detector', { type: typeTarget, id: elementTargetId });
                return await InteractionPanelCyberia.PanelRender.element({ type: typeTarget, id: elementTargetId });
              }
            }
          }
        }
      }, 500);

      await this.triggerQuestAvailableRender({ type, id });
    }
  },
  onChangeCurrentQuestAvailable: {},
  triggerQuestAvailableRender: async function ({ type, id }) {
    logger.warn('triggerQuestAvailableRender');
    // re render available quests
    const quests = WorldCyberiaManagement.Data[type][id].model.world.quests;
    for (const event of Object.keys(this.onChangeCurrentQuestAvailable)) {
      const { id, selector } = this.onChangeCurrentQuestAvailable[event];
      if (s(selector)) {
        let listRenderQuest = html``;
        let index = -1;
        for (const questMetaData of quests) {
          index++;
          listRenderQuest += await QuestCyberia.RenderPanelQuest({ id: `${id}-${index}`, questMetaData });
        }
        htmls(selector, listRenderQuest);
      }
    }
  },
};

const QuestCyberia = {
  RenderPanelQuest: async function ({ id, questMetaData }) {
    return html`<pre>
${JSON.stringify({ id, questMetaData, QuestComponent: QuestComponent[questMetaData.id] }, null, 4)}</pre
    >`;
  },
  Render: async function ({ idModal }) {
    QuestManagementCyberia.onChangeCurrentQuestAvailable[idModal] = {
      selector: '.current-render-quest',
      id: 'current-render-quest',
    };
    setTimeout(async () => {
      await QuestManagementCyberia.triggerQuestAvailableRender({ type: 'user', id: 'main' });
    });
    return html`<div class="in current-render-quest"></div>`;
  },
};

export { QuestManagementCyberia, QuestCyberia };
