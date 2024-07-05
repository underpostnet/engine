import { CyberiaQuestService } from '../../services/cyberia-quest/cyberia-quest.service.js';
import { BtnIcon } from '../core/BtnIcon.js';
import { objectEquals } from '../core/CommonJs.js';
import { Css, Themes, renderBubbleDialog, typeWriter } from '../core/Css.js';
import { EventsUI } from '../core/EventsUI.js';
import { loggerFactory } from '../core/Logger.js';
import { Modal, renderViewTitle } from '../core/Modal.js';
import { Translate } from '../core/Translate.js';
import { getProxyPath, htmls, s } from '../core/VanillaJs.js';
import { QuestComponent, isElementCollision } from './CommonCyberia.js';
import { ElementsCyberia } from './ElementsCyberia.js';
import { InteractionPanelCyberia } from './InteractionPanelCyberia.js';
import { MatrixCyberia } from './MatrixCyberia.js';
import { PointAndClickMovementCyberia } from './PointAndClickMovementCyberia.js';
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
        if (
          !WorldCyberiaManagement.Data[type] ||
          !WorldCyberiaManagement.Data[type][id] ||
          !WorldCyberiaManagement.Data[type][id].model.world
        )
          return clearInterval(this.IntervalQuestDetector);
        for (const instance of WorldCyberiaManagement.Data[type][id].model.world.instance) {
          const botsQuest = instance.bots.filter((b) => b.behavior === 'quest-passive');
          for (const botQuestData of botsQuest) {
            for (const elementTargetId of Object.keys(ElementsCyberia.Data[typeTarget])) {
              const displayId = ElementsCyberia.getCurrentSkinDisplayId({ type: typeTarget, id: elementTargetId });
              const questData = QuestComponent.getQuestByDisplayId({ displayId })[0];
              const idPanel = `action-panel-${typeTarget}-${elementTargetId}`;
              if (
                (!questData || (questData && !s(`.modal-panel-quest-${questData.id}`))) &&
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
                if (questData)
                  ElementsCyberia.LocalDataScope[typeTarget][elementTargetId].quest = {
                    idPanel,
                    id: questData.id,
                  };
                await InteractionPanelCyberia.PanelRender.action({
                  idPanel,
                  type: typeTarget,
                  id: elementTargetId,
                  html: async () => {
                    const interactionPanelQuestId = questData ? `interaction-panel-${questData.id}` : undefined;
                    setTimeout(() => {
                      s(`.action-panel-close-${idPanel}`).onclick = async () => {
                        this.questClosePanels.push(idPanel);
                        await InteractionPanelCyberia.PanelRender.removeActionPanel(idPanel);
                      };
                      if (s(`.action-panel-ok-${idPanel}`))
                        s(`.action-panel-ok-${idPanel}`).onclick = async () => {
                          const currentQuestData = ElementsCyberia.Data.user['main'].model.quests.find(
                            (q) => q.id === questData.id,
                          );
                          if (!currentQuestData) {
                            s(`.action-panel-ok-${idPanel}`).classList.add('hide');
                            await this.takeQuest({ questData });
                          }
                        };
                      if (questData) {
                        s(`.action-panel-dude-${idPanel}`).onclick = async () =>
                          await this.RenderModal({ questData, interactionPanelQuestId });
                      }
                    });
                    return await renderBubbleDialog({
                      id: idPanel,
                      html: async () => html`
                        <div class="in quest-provider-head">
                          <span style="color: #d5b019"
                            >${ElementsCyberia.getDisplayTitle({ type: typeTarget, id: elementTargetId })}</span
                          >
                          <span style="color: #2d2d2d"
                            >${ElementsCyberia.getDisplayName({ type: typeTarget, id: elementTargetId })}</span
                          >:
                        </div>
                        <div class="in quest-short-description">
                          ${await typeWriter({
                            id: idPanel,
                            html: questData
                              ? html`${Translate.Render(`${questData.id}-shortDescription`)}`
                              : html`Hi! Hi! Hi! Hi! Hi!`,
                          })}
                        </div>
                        <div class="fl">
                          ${questData
                            ? html`${await BtnIcon.Render({
                                class: `in fll action-panel-bar-btn-container action-panel-ok-${idPanel} ${
                                  ElementsCyberia.Data.user['main'].model.quests.find((q) => q.id === questData.id)
                                    ? 'hide'
                                    : ''
                                }`,
                                label: html`<img
                                  class="abs center action-panel-img-icon"
                                  src="${getProxyPath()}assets/ui-icons/ok.png"
                                />`,
                              })}
                              ${await BtnIcon.Render({
                                class: `in fll action-panel-bar-btn-container action-panel-dude-${idPanel}`,
                                label: html`<img
                                  class="abs center action-panel-img-icon"
                                  src="${getProxyPath()}assets/ui-icons/dude.png"
                                />`,
                              })} `
                            : ''}
                          ${await BtnIcon.Render({
                            class: `in fll action-panel-bar-btn-container action-panel-close-${idPanel}`,
                            label: html`<img
                              class="abs center action-panel-img-icon"
                              src="${getProxyPath()}assets/ui-icons/close.png"
                            />`,
                          })}
                        </div>
                      `,
                    });
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
    PointAndClickMovementCyberia.TargetEvent['quest-event'] = async ({ type, id }) => {
      if (type !== 'user' && id !== 'main')
        this.questClosePanels = this.questClosePanels.filter((p) => p !== `action-panel-${type}-${id}`);
    };
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
        // htmls(selector, listRenderQuest);
        htmls(selector, '');
      }
    }
  },
  RenderModal: async function ({ questData, interactionPanelQuestId }) {
    questData = {
      ...QuestComponent.Data[questData.id],
      ...questData,
    };

    const idPanel = this.getIdPanelByQuestId({ questData });
    if (idPanel) await InteractionPanelCyberia.PanelRender.removeActionPanel(idPanel);

    const currentQuestData = ElementsCyberia.Data.user['main'].model.quests.find((q) => q.id === questData.id);
    const { barConfig } = await Themes[Css.currentTheme]();
    const idModal = `modal-panel-quest-${questData.id}`;

    await Modal.Render({
      id: idModal,
      barConfig,
      title: renderViewTitle({
        'ui-icon': questData.icon.id,
        assetFolder: questData.icon.folder,
        text: html`${Translate.Render(`${questData.id}-title`)}`,
      }),
      html: html`<div class="in section-mp">
        <div class="in">
          ${await renderBubbleDialog({
            id: `${idModal}-bubble-description`,
            html: async () => html`${Translate.Render(`${questData.id}-description`)}`,
          })}
        </div>
        <div class="fl">
          <div class="in fll" style="width: 50%">
            ${questData.displaySearchObjects
              .map((q) => {
                if (currentQuestData) {
                  const searchItemData = currentQuestData.displaySearchObjects.find((s) => s.id === q.id);
                  if (searchItemData) q.current = searchItemData.current;
                }
                return html`<div class="in">${q.id} ${q.current} / ${q.quantity}</div>`;
              })
              .join('')}
          </div>
          <div class="in fll" style="width: 50%">
            <img
              class="in quest-provide-img"
              src="${getProxyPath()}assets/skin/${questData.provide.displayIds[0].id}/08/0.png"
            />
          </div>
          <div class="in">
            ${await BtnIcon.Render({
              label: Translate.Render('dismiss-quest'),
              type: 'button',
              class: `btn-dismiss-quest-${idModal} ${
                ElementsCyberia.Data.user['main'].model.quests.find((q) => q.id === questData.id) ? '' : 'hide'
              }`,
            })}
            ${await BtnIcon.Render({
              label: Translate.Render('ok'),
              type: 'button',
              class: `btn-ok-quest-${idModal} ${
                !ElementsCyberia.Data.user['main'].model.quests.find((q) => q.id === questData.id) ? '' : 'hide'
              }`,
            })}
          </div>
        </div>
      </div> `,
      maximize: true,
      mode: 'view',
      slideMenu: 'modal-menu',
    });

    EventsUI.onClick(`.btn-dismiss-quest-${idModal}`, async () => {
      ElementsCyberia.Data.user['main'].model.quests = ElementsCyberia.Data.user['main'].model.quests.filter(
        (q) => q.id !== questData.id,
      );

      if (s(`.quest-interaction-panel-${interactionPanelQuestId}`))
        s(`.quest-interaction-panel-${interactionPanelQuestId}`).remove();

      const result = await CyberiaQuestService.post({ id: `abandon/${questData.id}` });
      s(`.btn-close-${idModal}`).click();
    });

    EventsUI.onClick(`.btn-ok-quest-${idModal}`, async () => {
      s(`.btn-dismiss-quest-${idModal}`).classList.remove('hide');
      s(`.btn-ok-quest-${idModal}`).classList.add('hide');
      await this.takeQuest({ questData });
    });
  },
  takeQuest: async function ({ questData }) {
    questData = {
      ...questData,
      ...QuestComponent.Data[questData.id],
    };
    const interactionPanelQuestId = questData ? `interaction-panel-${questData.id}` : undefined;

    ElementsCyberia.Data.user['main'].model.quests.push(questData);
    const result = await CyberiaQuestService.post({ id: `take/${questData.id}` });
    await InteractionPanelCyberia.PanelRender.quest({
      id: interactionPanelQuestId,
      questData,
    });
    // post take quest
    // interaction panel info and shortcut
    // modal quest render
  },
  getIdPanelByQuestId: function ({ questData }) {
    for (const elementTargetId of Object.keys(ElementsCyberia.LocalDataScope['bot'])) {
      if (
        ElementsCyberia.LocalDataScope['bot'][elementTargetId].quest &&
        ElementsCyberia.LocalDataScope['bot'][elementTargetId].quest.id === questData.id
      )
        return ElementsCyberia.LocalDataScope['bot'][elementTargetId].quest.idPanel;
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
