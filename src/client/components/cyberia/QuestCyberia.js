import { CyberiaQuestService } from '../../services/cyberia-quest/cyberia-quest.service.js';
import { Auth } from '../core/Auth.js';
import { BtnIcon } from '../core/BtnIcon.js';
import { newInstance, objectEquals, uniqueArray } from '../core/CommonJs.js';
import { Css, Themes, dynamicCol, renderBubbleDialog, typeWriter } from '../core/Css.js';
import { EventsUI } from '../core/EventsUI.js';
import { Keyboard } from '../core/Keyboard.js';
import { loggerFactory } from '../core/Logger.js';
import { Modal, renderViewTitle } from '../core/Modal.js';
import { SocketIo } from '../core/SocketIo.js';
import { Translate } from '../core/Translate.js';
import { getProxyPath, htmls, s } from '../core/VanillaJs.js';
import { Slot } from './BagCyberia.js';
import { QuestComponent, isElementCollision } from './CommonCyberia.js';
import { ElementsCyberia } from './ElementsCyberia.js';
import { InteractionPanelCyberia } from './InteractionPanelCyberia.js';
import { MainUserCyberia } from './MainUserCyberia.js';
import { MatrixCyberia } from './MatrixCyberia.js';
import { PointAndClickMovementCyberia } from './PointAndClickMovementCyberia.js';
import { SocketIoCyberia } from './SocketIoCyberia.js';
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

    // const instanceDisplayIdQuest = uniqueArray(
    //   WorldCyberiaManagement.Data[type][id].model.world.instance
    //     .map((instance) =>
    //       instance.bots
    //         .filter((b) => b.behavior === 'quest-passive' || b.behavior === 'item-quest')
    //         .map((b) => b.displayIds.map((s) => s.id))
    //         .flat(),
    //     )
    //     .flat(),
    // );

    if (this.IntervalQuestDetector) clearInterval(this.IntervalQuestDetector);

    if (WorldCyberiaManagement.Data[type] && WorldCyberiaManagement.Data[type][id]) {
      this.IntervalQuestDetector = setInterval(async () => {
        const panels = [];
        const displayIdCount = {};
        const handBlock = {};
        handBlock[typeTarget] = {};
        if (
          !WorldCyberiaManagement.Data[type] ||
          !WorldCyberiaManagement.Data[type][id] ||
          !WorldCyberiaManagement.Data[type][id].model.world
        )
          return clearInterval(this.IntervalQuestDetector);
        for (const elementTargetId of Object.keys(ElementsCyberia.Data[typeTarget])) {
          const displayId = ElementsCyberia.getCurrentSkinDisplayId({ type: typeTarget, id: elementTargetId });

          // if (!Object.keys(QuestComponent.componentsScope).includes(displayId)) continue;
          // if (!instanceDisplayIdQuest.includes(displayId)) continue;

          const respawn = 5000;
          const isCollision = isElementCollision({
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
          });

          if (!(displayId in displayIdCount)) displayIdCount[displayId] = 0;
          else displayIdCount[displayId]++;

          const quests = QuestComponent.getQuestByDisplayId({ displayId });

          if (quests.length === 0) quests.push(undefined);

          let indexQuest = -1;
          for (const questData of quests) {
            indexQuest++;

            if (
              QuestComponent.componentsScope[displayId] &&
              QuestComponent.componentsScope[displayId].questKeyContext === 'provide' &&
              indexQuest !== displayIdCount[displayId]
            )
              continue;

            const idPanel = `action-panel-${typeTarget}-${elementTargetId}`;
            const currentQuestData = questData
              ? ElementsCyberia.Data.user['main'].model.quests.find((q) => q.id === questData.id)
              : undefined;
            const currentItemData = currentQuestData
              ? currentQuestData.displaySearchObjects.find((o) => o.id === displayId)
              : undefined;

            const enabledQuestPanel = currentItemData && currentItemData.current < currentItemData.quantity;

            if (
              ((questData &&
                (QuestComponent.componentsScope[displayId].questKeyContext !== 'displaySearchObjects' ||
                  enabledQuestPanel)) ||
                (!['user-hostile'].includes(ElementsCyberia.Data[typeTarget][elementTargetId].behavior) &&
                  MainUserCyberia.lastArrowElement &&
                  MainUserCyberia.lastArrowElement.type === typeTarget &&
                  MainUserCyberia.lastArrowElement.id === elementTargetId)) &&
              (!questData || (questData && !s(`.modal-panel-quest-${questData.id}`))) &&
              (!this.questClosePanels.includes(idPanel) ||
                (this.questClosePanels.includes(idPanel) && enabledQuestPanel)) &&
              isCollision
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

                    if (s(`.action-panel-hand-${idPanel}`))
                      s(`.action-panel-hand-${idPanel}`).onclick = () => {
                        if (handBlock[typeTarget][elementTargetId]) return;
                        const currentQuestDataIndex = ElementsCyberia.Data.user['main'].model.quests.findIndex(
                          (q) => q.id === questData.id,
                        );
                        if (currentQuestDataIndex >= 0) {
                          const displayIdIndex = ElementsCyberia.Data.user['main'].model.quests[
                            currentQuestDataIndex
                          ].displaySearchObjects.findIndex((o) => o.id === displayId);
                          if (displayIdIndex >= 0) {
                            const itemData =
                              ElementsCyberia.Data.user['main'].model.quests[currentQuestDataIndex]
                                .displaySearchObjects[displayIdIndex];

                            if (itemData.current < itemData.quantity) {
                              ElementsCyberia.Data.user['main'].model.quests[currentQuestDataIndex]
                                .displaySearchObjects[displayIdIndex].current++;
                              handBlock[typeTarget][elementTargetId] = true;
                              setTimeout(() => {
                                delete handBlock[typeTarget][elementTargetId];
                              }, respawn);
                              SocketIoCyberia.disconnect({ type: typeTarget, id: elementTargetId });
                              SocketIo.Emit('user', {
                                status: 'take-quest-item',
                                element: { type: typeTarget, id: elementTargetId },
                                questData: { id: questData.id },
                              });
                              if (s(`.quest-interaction-panel-${interactionPanelQuestId}`))
                                htmls(
                                  `.${questData.id}-${displayId}-current`,
                                  ElementsCyberia.Data.user['main'].model.quests[currentQuestDataIndex]
                                    .displaySearchObjects[displayIdIndex].current,
                                );
                              if (s(`.modal-panel-quest-${questData.id}`))
                                htmls(
                                  `.modal-${questData.id}-${displayId}-current`,
                                  ElementsCyberia.Data.user['main'].model.quests[currentQuestDataIndex]
                                    .displaySearchObjects[displayIdIndex].current,
                                );
                            }
                          }
                        }
                      };
                    if (questData) {
                      s(`.action-panel-dude-${idPanel}`).onclick = async () =>
                        await this.RenderModal({ questData, interactionPanelQuestId });
                    }
                  });

                  const okButtonDisabled =
                    !questData || ElementsCyberia.Data.user['main'].model.quests.find((q) => q.id === questData.id);
                  {
                    const idKeyboardEvent = 'quest-key-event-ok' + idPanel;
                    if (okButtonDisabled) delete Keyboard.Event[idKeyboardEvent];
                    else
                      Keyboard.Event[idKeyboardEvent] = {
                        a: () => (s(`.action-panel-ok-${idPanel}`) ? s(`.action-panel-ok-${idPanel}`).click() : null),
                        A: () => (s(`.action-panel-ok-${idPanel}`) ? s(`.action-panel-ok-${idPanel}`).click() : null),
                      };
                  }

                  const dudeButtonEnabled =
                    questData && QuestComponent.componentsScope[displayId].questKeyContext === 'provide';
                  {
                    const idKeyboardEvent = 'quest-key-event-dude' + idPanel;
                    if (!dudeButtonEnabled) delete Keyboard.Event[idKeyboardEvent];
                    else
                      Keyboard.Event[idKeyboardEvent] = {
                        s: () =>
                          s(`.action-panel-dude-${idPanel}`) ? s(`.action-panel-dude-${idPanel}`).click() : null,
                        S: () =>
                          s(`.action-panel-dude-${idPanel}`) ? s(`.action-panel-dude-${idPanel}`).click() : null,
                      };
                  }

                  const handButtonEnabled =
                    questData &&
                    enabledQuestPanel &&
                    QuestComponent.componentsScope[displayId].questKeyContext === 'displaySearchObjects';
                  {
                    const idKeyboardEvent = 'quest-key-event-hand' + idPanel;
                    if (!handButtonEnabled) delete Keyboard.Event[idKeyboardEvent];
                    else
                      Keyboard.Event[idKeyboardEvent] = {
                        a: () =>
                          s(`.action-panel-hand-${idPanel}`) ? s(`.action-panel-hand-${idPanel}`).click() : null,
                        A: () =>
                          s(`.action-panel-hand-${idPanel}`) ? s(`.action-panel-hand-${idPanel}`).click() : null,
                      };
                  }

                  {
                    Keyboard.Event['focus'] = {
                      f: () =>
                        s(`.action-panel-close-${idPanel}`) ? s(`.action-panel-close-${idPanel}`).click() : null,
                      F: () =>
                        s(`.action-panel-close-${idPanel}`) ? s(`.action-panel-close-${idPanel}`).click() : null,
                    };
                  }
                  return await renderBubbleDialog({
                    id: idPanel,
                    html: async () => html`
                      <div class="in quest-provider-head">
                        <span style="color: #d5b019"
                          >${ElementsCyberia.getDisplayTitle({ type: typeTarget, id: elementTargetId })}</span
                        >
                        <span style="color: #2d2d2d"
                          >${ElementsCyberia.getDisplayName({ type: typeTarget, id: elementTargetId })}</span
                        >${questData &&
                        QuestComponent.componentsScope[displayId].questKeyContext === 'provide' &&
                        Translate.Data[`${questData.id}-shortDescription`]
                          ? ':'
                          : ''}
                      </div>
                      <div
                        class="in quest-short-description ${questData &&
                        QuestComponent.componentsScope[displayId].questKeyContext === 'provide' &&
                        Translate.Data[`${questData.id}-shortDescription`]
                          ? ''
                          : 'hide'}"
                      >
                        ${await typeWriter({
                          id: idPanel,
                          html: questData
                            ? html`${Translate.Render(`${questData.id}-shortDescription`)}`
                            : html`Hi! Hi! Hi! Hi! Hi!`,
                        })}
                      </div>
                      <div class="fl">
                        <div class="in ${dudeButtonEnabled ? '' : 'hide'}">
                          ${await BtnIcon.Render({
                            class: `in fll action-panel-bar-btn-container action-panel-ok-${idPanel} ${
                              okButtonDisabled ? 'hide' : ''
                            }`,
                            label: html`<img
                                class="abs center action-panel-img-icon"
                                src="${getProxyPath()}assets/ui-icons/ok.png"
                              />
                              <div class="abs quest-keyboard-bubble-info">A</div>`,
                          })}
                          ${await BtnIcon.Render({
                            class: `in fll action-panel-bar-btn-container action-panel-dude-${idPanel}`,
                            label: html`<img
                                class="abs center action-panel-img-icon"
                                src="${getProxyPath()}assets/ui-icons/dude.png"
                              />
                              <div class="abs quest-keyboard-bubble-info">S</div>`,
                          })}
                        </div>
                        ${await BtnIcon.Render({
                          class: `in fll action-panel-bar-btn-container action-panel-hand-${idPanel}  ${
                            handButtonEnabled ? '' : 'hide'
                          }`,
                          label: html`<img
                              class="abs center action-panel-img-icon"
                              src="${getProxyPath()}assets/ui-icons/hand.png"
                            />
                            <div class="abs quest-keyboard-bubble-info">A</div>`,
                        })}
                        ${await BtnIcon.Render({
                          class: `in fll action-panel-bar-btn-container action-panel-close-${idPanel}`,
                          label: html`<img
                              class="abs center action-panel-img-icon"
                              src="${getProxyPath()}assets/ui-icons/close.png"
                            />
                            <div class="abs quest-keyboard-bubble-info">F</div>`,
                        })}
                      </div>
                    `,
                  });
                },
              });
            }
          }
        }

        for (const idPanel of Object.keys(InteractionPanelCyberia.PanelRender.actionPanelTokens)) {
          if (!panels.includes(idPanel)) await InteractionPanelCyberia.PanelRender.removeActionPanel(idPanel);
        }
        if (panels.length === 0) {
          Keyboard.Event['focus'] = {
            f: MainUserCyberia.focusTarget,
            F: MainUserCyberia.focusTarget,
          };
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
      ...QuestComponent.Data[questData.id](),
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
        ${dynamicCol({
          id: `quest-dynamic-${questData.id}`,
          containerSelector: `quest-dynamic-${questData.id}`,
          type: 'a-50-b-50',
          limit: 500,
        })}
        <div class="fl quest-dynamic-${questData.id}">
          <div class="in fll quest-dynamic-${questData.id}-col-a">
            <div class="in section-mp quest-modal-container" style="max-width: 450px">
              <div class="in sub-title-item-modal">
                <img class="inl header-icon-item-modal" src="${getProxyPath()}assets/ui-icons/stats.png" /> Progress
              </div>
              <div class="in section-mp">
                ${questData.displaySearchObjects
                  .map((q) => {
                    if (currentQuestData) {
                      const searchItemData = currentQuestData.displaySearchObjects.find((s) => s.id === q.id);
                      if (searchItemData) q.current = searchItemData.current;
                    }
                    const searchObjectQuestSpriteData = QuestComponent.components.find((s) => s.displayId === q.id);

                    return html` <div class="in">
                      ${renderViewTitle({
                        'ui-icon': `0.${searchObjectQuestSpriteData.extension}`,
                        assetFolder: `${searchObjectQuestSpriteData.assetFolder}/${searchObjectQuestSpriteData.displayId}/${searchObjectQuestSpriteData.position}`,
                        text: html`<div class="fl">
                          <div class="in fll" style="width: 60%">
                            <span style="color: #ffcc00;">${q.id}</span>
                          </div>
                          <div class="in fll" style="width: 40%">
                            <span class="modal-${questData.id}-${q.id}-current">${q.current}</span> /
                            <span> ${q.quantity}</span>
                          </div>
                        </div>`,
                        dim: 30,
                        top: -3,
                      })}
                    </div>`;
                  })
                  .join('')}
                <br />
              </div>
            </div>

            <div class="in section-mp quest-modal-container" style="max-width: 450px">
              <div class="in sub-title-item-modal">
                <img class="inl header-icon-item-modal" src="${getProxyPath()}assets/ui-icons/star.png" />
                ${Translate.Render('reward')}
              </div>
              <div class="in section-mp">
                ${QuestComponent.Data[questData.id]()
                  .reward.map((r, i) => {
                    const type = r.type;
                    const index = i;
                    const bagId = questData.id + '-reward-slot';
                    const { quantity } = r;
                    setTimeout(() => {
                      Slot[type].renderBagCyberiaSlots({ bagId, indexBagCyberia: index, quantity });
                    });
                    return html`<div class="inl bag-slot ${bagId}-${index}"></div>`;
                  })
                  .join('')}
              </div>
              <br />
            </div>

            <div class="in section-mp">
              ${await BtnIcon.Render({
                label: html`${renderViewTitle({
                  'ui-icon': `close.png`,
                  text: html`${Translate.Render('dismiss-quest')}`,
                  dim: 30,
                  top: 4,
                })}`,
                type: 'button',
                class: `wfa section-mp-btn btn-dismiss-quest-${idModal} ${
                  ElementsCyberia.Data.user['main'].model.quests.find((q) => q.id === questData.id) ? '' : 'hide'
                }`,
                style: 'max-width: 450px',
              })}
              ${await BtnIcon.Render({
                label: html`${renderViewTitle({
                  'ui-icon': `ok.png`,
                  text: html`${Translate.Render('take-quest')}`,
                  dim: 30,
                  top: 4,
                })}`,
                type: 'button',
                class: `wfa section-mp-btn btn-ok-quest-${idModal} ${
                  !ElementsCyberia.Data.user['main'].model.quests.find((q) => q.id === questData.id) ? '' : 'hide'
                }`,
                style: 'max-width: 450px',
              })}
            </div>
          </div>
          <div class="in fll quest-dynamic-${questData.id}-col-b">
            <div class="in section-mp">
              <div class="in">
                ${await renderBubbleDialog({
                  id: `${idModal}-bubble-description`,
                  html: async () => html`${Translate.Render(`${questData.id}-description`)}`,
                })}
              </div>
              <img
                class="in quest-provide-img"
                src="${getProxyPath()}assets/skin/${questData.provide.displayIds[0].id}/08/0.png"
              />
            </div>
          </div>
        </div>
      </div> `,
      maximize: true,
      mode: 'view',
      slideMenu: 'modal-menu',
    });

    Keyboard.Event[`quest-close-modal`] = {
      F: () => (s(`.btn-close-${idModal}`) ? s(`.btn-close-${idModal}`).click() : null),
      f: () => (s(`.btn-close-${idModal}`) ? s(`.btn-close-${idModal}`).click() : null),
    };

    EventsUI.onClick(`.btn-dismiss-quest-${idModal}`, async () => {
      ElementsCyberia.Data.user['main'].model.quests = ElementsCyberia.Data.user['main'].model.quests.filter(
        (q) => q.id !== questData.id,
      );

      if (s(`.quest-interaction-panel-${interactionPanelQuestId}`))
        s(`.quest-interaction-panel-${interactionPanelQuestId}`).remove();

      if (Auth.getToken()) {
        const result = await CyberiaQuestService.post({ id: `abandon/${questData.id}` });
      } else {
        const result = await CyberiaQuestService.post({
          id: `abandon-anon/${questData.id}`,
          body: { socketId: SocketIo.socket.id },
        });
      }
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
      ...QuestComponent.Data[questData.id](),
    };
    const interactionPanelQuestId = questData ? `interaction-panel-${questData.id}` : undefined;

    ElementsCyberia.Data.user['main'].model.quests.push(questData);
    if (Auth.getToken()) {
      const result = await CyberiaQuestService.post({ id: `take/${questData.id}` });
    } else {
      const result = await CyberiaQuestService.post({
        id: `take-anon/${questData.id}`,
        body: { socketId: SocketIo.socket.id },
      });
    }
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
