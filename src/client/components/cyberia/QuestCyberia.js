import { BtnIcon } from '../core/BtnIcon.js';
import { objectEquals } from '../core/CommonJs.js';
import { Css, Themes, typeWriter } from '../core/Css.js';
import { loggerFactory } from '../core/Logger.js';
import { Modal, renderViewTitle } from '../core/Modal.js';
import { Translate } from '../core/Translate.js';
import { getProxyPath, htmls, s } from '../core/VanillaJs.js';
import { QuestComponent, isElementCollision } from './CommonCyberia.js';
import { ElementsCyberia } from './ElementsCyberia.js';
import { InteractionPanelCyberia } from './InteractionPanelCyberia.js';
import { MatrixCyberia } from './MatrixCyberia.js';
import { WorldCyberiaManagement } from './WorldCyberia.js';

const logger = loggerFactory(import.meta);

// https://github.com/underpostnet/cyberia/blob/master/modules/main/mod_quest/quest.js

const QuestManagementCyberia = {
  IntervalQuestDetector: null,
  questClosePanels: [],
  Data: {},
  Load: async function ({ type, id }) {
    const radius = 3.5;
    const typeTarget = 'bot';
    this.questClosePanels = [];

    if (this.IntervalQuestDetector) clearInterval(this.IntervalQuestDetector);

    if (WorldCyberiaManagement.Data[type] && WorldCyberiaManagement.Data[type][id]) {
      this.IntervalQuestDetector = setInterval(async () => {
        const panels = [];
        if (!WorldCyberiaManagement.Data[type] || !WorldCyberiaManagement.Data[type][id])
          return clearInterval(this.IntervalQuestDetector);
        for (const instance of WorldCyberiaManagement.Data[type][id].model.world.instance) {
          const botsQuest = instance.bots.filter((b) => b.behavior === 'quest-passive');
          for (const botQuestData of botsQuest) {
            for (const elementTargetId of Object.keys(ElementsCyberia.Data[typeTarget])) {
              const displayId = ElementsCyberia.getCurrentSkinDisplayId({ type: typeTarget, id: elementTargetId });
              const idPanel = `action-panel-${typeTarget}-${elementTargetId}`;
              if (
                !s(`.modal-panel-quest-${idPanel}`) &&
                !this.questClosePanels.includes(idPanel) &&
                botQuestData.displayIds.find((d) => d.id === displayId) &&
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
                // const targetElement = { type: typeTarget, id: elementTargetId };
                // logger.warn('quest provider detector', targetElement);
                panels.push(idPanel);
                const questData = QuestComponent.getQuestByDisplayId({ displayId })[0];
                await InteractionPanelCyberia.PanelRender.action({
                  idPanel,
                  type: typeTarget,
                  id: elementTargetId,
                  html: async () => {
                    setTimeout(() => {
                      s(`.action-panel-close-${idPanel}`).onclick = async () => {
                        this.questClosePanels.push(idPanel);
                        await InteractionPanelCyberia.PanelRender.removeActionPanel(idPanel);
                      };
                      if (questData)
                        s(`.action-panel-quest-${idPanel}`).onclick = async () => {
                          await InteractionPanelCyberia.PanelRender.removeActionPanel(idPanel);
                          const { barConfig } = await Themes[Css.currentTheme]();
                          await Modal.Render({
                            id: `modal-panel-quest-${idPanel}`,
                            barConfig,
                            title: renderViewTitle({
                              'ui-icon': questData.icon.id,
                              assetFolder: questData.icon.folder,
                              text: html`${Translate.Render(`${questData.questKey}-title`)}`,
                            }),
                            html: html`<div class="in section-mp">
                              ${Translate.Render(`${questData.questKey}-description`)}
                            </div>`,
                            maximize: true,
                            mode: 'view',
                            slideMenu: 'modal-menu',
                          });
                        };
                    });
                    return html`
                      <div class="fl">
                        ${questData
                          ? await BtnIcon.Render({
                              class: `in fll action-panel-bar-btn-container action-panel-quest-${idPanel}`,
                              label: html`<img
                                class="abs center action-panel-img-icon"
                                src="${getProxyPath()}assets/ui-icons/quest.png"
                              />`,
                            })
                          : ''}
                        ${await BtnIcon.Render({
                          class: `in fll action-panel-bar-btn-container action-panel-close-${idPanel}`,
                          label: html`<img
                            class="abs center action-panel-img-icon"
                            src="${getProxyPath()}assets/ui-icons/close.png"
                          />`,
                        })}
                      </div>
                      <div class="in quest-short-description">
                        ${await typeWriter({
                          id: idPanel,
                          html: questData
                            ? html`${Translate.Render(`${questData.questKey}-shortDescription`)}`
                            : html`Hi! Hi! Hi! Hi! Hi!`,
                        })}
                      </div>
                    `;
                  },
                });
              }
            }
          }
        }

        for (const idPanel of Object.keys(InteractionPanelCyberia.PanelRender.actionPanelTokens)) {
          if (!panels.includes(idPanel)) await InteractionPanelCyberia.PanelRender.removeActionPanel(idPanel);
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
    const dataScope = { id, questMetaData, QuestComponent: QuestComponent.Data[questMetaData.id] };
    return html` <div class="in section-mp ">
      <div class="in section-mp">
        <div class="in sub-title-modal">${Translate.Render(`${questMetaData.id}-title`)}</div>
        <div class="in section-mp">${Translate.Render(`${questMetaData.id}-description`)}</div>
      </div>
      <div class="in section-mp">
        <div class="in sub-title-modal">metadata</div>
        <div class="in"><pre>${JSON.stringify(dataScope, null, 4)}</pre></div>
      </div>
    </div>`;
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
