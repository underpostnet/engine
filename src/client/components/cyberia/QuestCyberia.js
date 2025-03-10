import { CoreService } from '../../services/core/core.service.js';
import { CyberiaQuestService } from '../../services/cyberia-quest/cyberia-quest.service.js';
import { Auth } from '../core/Auth.js';
import { BtnIcon } from '../core/BtnIcon.js';
import { newInstance, range, s4, timer } from '../core/CommonJs.js';
import {
  Css,
  Themes,
  dynamicCol,
  getSectionsStringData,
  renderBubbleDialog,
  renderCssAttr,
  typeWriteSectionsString,
  typeWriter,
} from '../core/Css.js';
import { EventsUI } from '../core/EventsUI.js';
import { Keyboard } from '../core/Keyboard.js';
import { LoadingAnimation } from '../core/LoadingAnimation.js';
import { loggerFactory } from '../core/Logger.js';
import { Modal, renderViewTitle } from '../core/Modal.js';
import { SocketIo } from '../core/SocketIo.js';
import { Translate } from '../core/Translate.js';
import { append, getLang, getProxyPath, htmls, s, sa } from '../core/VanillaJs.js';
import { BagCyberia, Slot } from './BagCyberia.js';
import { CharacterCyberia } from './CharacterCyberia.js';
import { CyberiaShopStorage, DisplayComponent, QuestComponent, Stat, isElementCollision } from './CommonCyberia.js';
import { ElementsCyberia } from './ElementsCyberia.js';
import { InteractionPanelCyberia } from './InteractionPanelCyberia.js';
import { MainUserCyberia } from './MainUserCyberia.js';
import { MatrixCyberia } from './MatrixCyberia.js';
import { PointAndClickMovementCyberia } from './PointAndClickMovementCyberia.js';
import { SocketIoCyberia } from './SocketIoCyberia.js';
import { WorldCyberiaManagement } from './WorldCyberia.js';

const logger = loggerFactory(import.meta);

const QuestManagementCyberia = {
  IntervalQuestDetector: null,
  questClosePanels: [],
  Data: {},
  Load: async function ({ type, id }) {
    const radius = 5;
    const typeTarget = 'bot';
    this.questClosePanels = [];

    for (const questData of WorldCyberiaManagement.Data[type][id].model.world.quests) {
      const { id } = questData;
      if (!(id in QuestComponent.Data)) {
        const media = await fetch(`${getProxyPath()}/assets/ai-resources/lore/${id}/media.json`);

        const questData = JSON.parse(
          await CoreService.getRaw({
            url: `${getProxyPath()}/assets/ai-resources/lore/${id}/quests/${id}-001.json`,
          }),
        );

        QuestComponent.loadMediaQuestComponents(id, questData, media);
      }
    }

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
          const idPanel = `action-panel-${typeTarget}-${elementTargetId}`;
          if (s(`.${idPanel}`)) continue;
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
              ? currentQuestData.displaySearchObjects.find(
                  (o) => o.id === displayId && o.step === currentQuestData.currentStep,
                )
              : undefined;

            const enabledQuestPanel = currentItemData && currentItemData.current < currentItemData.quantity;
            const enabledShopPanel =
              questData && QuestComponent.componentsScope[displayId].questKeyContext === 'seller';

            if (
              ((questData &&
                (QuestComponent.componentsScope[displayId].questKeyContext !== 'displaySearchObjects' ||
                  enabledQuestPanel)) ||
                (!['user-hostile', 'pet', 'generic-people'].includes(
                  ElementsCyberia.Data[typeTarget][elementTargetId].behavior,
                ) &&
                  MainUserCyberia.lastArrowElement &&
                  MainUserCyberia.lastArrowElement.type === typeTarget &&
                  MainUserCyberia.lastArrowElement.id === elementTargetId)) &&
              (!questData || (questData && !s(`.modal-panel-quest-${questData.id}`))) &&
              (!this.questClosePanels.includes(idPanel) ||
                (this.questClosePanels.includes(idPanel) && enabledQuestPanel)) &&
              isCollision
            ) {
              const enableShortDescription =
                questData &&
                QuestComponent.componentsScope[displayId].questKeyContext === 'provide' &&
                Translate.Data[`${questData.id}-shortDescription`];

              const enableDefaultDialog =
                QuestComponent.componentsScope[displayId] &&
                QuestComponent.componentsScope[displayId].defaultDialog &&
                Translate.Data[`quest-${displayId}-defaultDialog`];

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
                  setTimeout(async () => {
                    if (questData) {
                      const renderBubbleLinesSectionString = async ({
                        containerSelector,
                        translateData,
                        containerLine,
                      }) => {
                        s(`.${idPanel}`).style.transition = '.3s';
                        const currentSectionIndex = 0; // split for '.'
                        const offsetWidth = s(containerSelector).offsetWidth;
                        const { phraseArray, sectionsIndex } = getSectionsStringData(
                          offsetWidth * 0.5,
                          translateData[getLang()] ? translateData[getLang()] : translateData['en'],
                        );
                        typeWriteSectionsString({
                          container: containerLine,
                          phraseArray,
                          rangeArraySectionIndex: sectionsIndex[currentSectionIndex],
                        });

                        let currentTopAnimation = parseFloat(
                          // window.getComputedStyle(s(`.${idPanel}`)).top.replace('px', ''),
                          s(`.${idPanel}`).style.top.replace('px', ''),
                        );

                        for (const toTopAnimationIndex of range(0, phraseArray.length - 1)) {
                          await timer(800);
                          currentTopAnimation -= 15;
                          if (!s(`.${idPanel}`)) break;
                          s(`.${idPanel}`).style.top = `${currentTopAnimation}px`;
                        }
                      };
                      if (s(`.typeWriter-render-shortDescription-${questData.id}`)) {
                        htmls(`.typeWriter-render-shortDescription-${questData.id}`, '');
                        renderBubbleLinesSectionString({
                          containerSelector: `.${idPanel}`,
                          translateData: Translate.Data[`${questData.id}-shortDescription`],
                          containerLine: `typeWriter-render-shortDescription-${questData.id}`,
                        });
                      }
                      // typeWriter({
                      //   id: `${questData.id}-shortDescription-typeWriter`,
                      //   html: questData
                      //     ? html`${Translate.Render(`${questData.id}-shortDescription`)}`
                      //     : html`Hi! Hi! Hi! Hi! Hi!`,
                      //   container: `typeWriter-render-shortDescription-${questData.id}`,
                      // });
                      if (s(`.typeWriter-render-defaultDialog-${displayId}`)) {
                        htmls(`.typeWriter-render-defaultDialog-${displayId}`, '');
                        renderBubbleLinesSectionString({
                          containerSelector: `.${idPanel}`,
                          translateData: Translate.Data[`quest-${displayId}-defaultDialog`],
                          containerLine: `typeWriter-render-defaultDialog-${displayId}`,
                        });
                      }
                      // typeWriter({
                      //   id: `quest-${displayId}-defaultDialog-typeWriter`,
                      //   html: questData
                      //     ? html`${Translate.Render(`quest-${displayId}-defaultDialog`)}`
                      //     : html`Hi! Hi! Hi! Hi! Hi!`,
                      //   container: `typeWriter-render-defaultDialog-${displayId}`,
                      // });
                    }

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
                      s(`.action-panel-hand-${idPanel}`).onclick = async () => {
                        if (handBlock[typeTarget][elementTargetId]) return;

                        if (enabledShopPanel) {
                          // TODO: cyberia-shop-bag
                          await this.RenderModal({ questData, interactionPanelQuestId, elementTargetId });
                          return;
                        }
                        const currentQuestDataIndex = ElementsCyberia.Data.user['main'].model.quests.findIndex(
                          (q) => q.id === questData.id,
                        );
                        if (currentQuestDataIndex >= 0) {
                          let currentStep =
                            ElementsCyberia.Data.user['main'].model.quests[currentQuestDataIndex].currentStep;
                          const displayIdIndex = ElementsCyberia.Data.user['main'].model.quests[
                            currentQuestDataIndex
                          ].displaySearchObjects.findIndex((o) => o.id === displayId && o.step === currentStep);
                          if (displayIdIndex >= 0) {
                            const itemData =
                              ElementsCyberia.Data.user['main'].model.quests[currentQuestDataIndex]
                                .displaySearchObjects[displayIdIndex];

                            const displayStepData =
                              QuestComponent.Data[questData.id]().provide.displayIds[0].stepData[currentStep];

                            //  <pre>${JSON.stringify(displayStepData.talkingDialog, null, 4)}</pre>

                            if (displayStepData.talkingDialog)
                              await new Promise(async (resolve) => {
                                const idModal = `modal-quest-dialog-${questData.id}`;
                                const { barConfig } = await Themes[Css.currentTheme]();
                                barConfig.buttons.maximize.disabled = true;
                                barConfig.buttons.minimize.disabled = true;
                                barConfig.buttons.restore.disabled = true;
                                await Modal.Render({
                                  id: idModal,
                                  barConfig,
                                  title: renderViewTitle({
                                    // 'ui-icon': questData.icon.id,
                                    // assetFolder: questData.icon.folder,
                                    'ui-icon': 'quest.png',
                                    text: html`${Translate.Render(`${questData.id}-title`)}`,
                                  }),
                                  maximize: true,
                                  mode: 'view',
                                  slideMenu: 'modal-menu',
                                  html: async () => {
                                    return html`
                                      <style>
                                        .${idModal}-element-0-body,
                                        .${idModal}-element-1-body {
                                          overflow: hidden;
                                        }
                                      </style>
                                      <div class="in ${idModal}-talking-loading-container" style="min-height: 300px;">
                                        <div class="abs center ${idModal}-talking-loading"></div>
                                      </div>
                                      <div class="abs" style="top: 80px; width: 100%;">
                                        <div class="fl">
                                          <div class="in fll" style="width: 50%;">
                                            <div class="${idModal}-element-0 hide"></div>
                                          </div>
                                          <div class="in fll" style="width: 50%;">
                                            <div class="${idModal}-element-1 hide"></div>
                                          </div>
                                        </div>
                                      </div>
                                      <div class="in render-bubble-${questData.id}" style="padding: 10px"></div>
                                    `;
                                  },
                                });

                                append(
                                  'body',
                                  html` <div
                                    class="abs button-quest-modal-forward button-quest-modal-forward-${questData.id}"
                                  >
                                    <img
                                      class="abs center button-quest-modal-img"
                                      src="${getProxyPath()}assets/ui-icons/forward.png"
                                    />
                                  </div>`,
                                );

                                Modal.Data[idModal].onCloseListener[idModal] = () => {
                                  if (s(`.button-quest-modal-forward-${questData.id}`))
                                    s(`.button-quest-modal-forward-${questData.id}`).remove();
                                };

                                s(`.button-quest-modal-forward-${questData.id}`).onclick = async () => {
                                  s(`.btn-close-${idModal}`).click();
                                  await timer(500);
                                  resolve();
                                };

                                LoadingAnimation.img.play(`.${idModal}-talking-loading`, 'points');

                                CharacterCyberia.renderCharacterCyberiaPreView({
                                  type: 'user',
                                  id: 'main',
                                  container: `${idModal}-element-0`,
                                  positionId: '06',
                                });

                                await CharacterCyberia.renderCharacterCyberiaPreView({
                                  type: typeTarget,
                                  id: elementTargetId,
                                  container: `${idModal}-element-1`,
                                  positionId: '04',
                                });

                                s(`.${idModal}-talking-loading-container`).remove();
                                s(`.${idModal}-element-0`).classList.remove('hide');
                                s(`.${idModal}-element-1`).classList.remove('hide');

                                const offsetWidth = s(`.${idModal}`).offsetWidth;
                                const triangleWidth = 60;
                                const dialogQuestIdSalt = s4() + s4() + s4();

                                htmls(
                                  `.render-bubble-${questData.id}`,
                                  html`<div class="fl" style="width: 85%; margin: auto">
                                    ${await renderBubbleDialog({
                                      id: `${idModal}-element-bubble-${dialogQuestIdSalt}-a`,
                                      // triangleType: 'left',
                                      html: async () =>
                                        html` <div
                                          class="in typeWriteSectionsString typeWriteSectionsString-${idModal}-${dialogQuestIdSalt}-a"
                                        ></div>`,
                                      classSelectors: 'in fll',
                                      bubbleCss: 'width: 80%',
                                      triangleWidth,
                                      trianglePositionCss: `bottom: -45px; left: 25%;`,
                                      triangleCss: `border-left: none`,
                                    })}${await renderBubbleDialog({
                                      id: `${idModal}-element-bubble-${dialogQuestIdSalt}-b`,
                                      // triangleType: 'left',
                                      html: async () =>
                                        html` <div
                                          class="in typeWriteSectionsString typeWriteSectionsString-${idModal}-${dialogQuestIdSalt}-b"
                                        ></div>`,
                                      classSelectors: 'in flr hide',
                                      bubbleCss: 'width: 80%',
                                      triangleWidth,
                                      trianglePositionCss: `bottom: -45px; right: 25%;`,
                                      triangleCss: `border-right: none`,
                                    })}
                                  </div>`,
                                );

                                // const renderTranslateData = Translate.Render(
                                //   `${questData.id}-completeDialog-step-${
                                //     QuestComponent.Data[questData.id]().provide.displayIds[0].id
                                //   }-${currentStep}-${currentDialogIndex}`,
                                // );

                                let currentDialogIndex = -1;
                                let currentBubbleId = 'a';
                                const renderTalkingDialog = async () => {
                                  currentDialogIndex++;
                                  const translateData = displayStepData.talkingDialog[currentDialogIndex].dialog;
                                  const { phraseArray, sectionsIndex } = getSectionsStringData(
                                    Modal.mobileModal() ? offsetWidth * 0.2 : offsetWidth * 0.3,
                                    translateData[s('html').lang] ? translateData[s('html').lang] : translateData['en'],
                                  );
                                  let currentPhraseArrayIndex = -1;
                                  const renderPhrase = async () => {
                                    if (
                                      !s(`.typeWriteSectionsString-${idModal}-${dialogQuestIdSalt}-${currentBubbleId}`)
                                    )
                                      return;
                                    currentPhraseArrayIndex++;
                                    htmls(
                                      `.typeWriteSectionsString-${idModal}-${dialogQuestIdSalt}-${currentBubbleId}`,
                                      '',
                                    );
                                    await typeWriteSectionsString({
                                      container: `typeWriteSectionsString-${idModal}-${dialogQuestIdSalt}-${currentBubbleId}`,
                                      phraseArray,
                                      rangeArraySectionIndex: sectionsIndex[currentPhraseArrayIndex],
                                    });
                                    await timer(1500);
                                    if (currentPhraseArrayIndex + 1 < sectionsIndex.length) await renderPhrase();
                                  };
                                  await renderPhrase();
                                  if (currentDialogIndex + 1 < displayStepData.talkingDialog.length) {
                                    if (
                                      s(
                                        `.bubble-dialog-${idModal}-element-bubble-${dialogQuestIdSalt}-a`,
                                      ).classList.contains('hide')
                                    )
                                      s(
                                        `.bubble-dialog-${idModal}-element-bubble-${dialogQuestIdSalt}-a`,
                                      ).classList.remove('hide');
                                    else
                                      s(
                                        `.bubble-dialog-${idModal}-element-bubble-${dialogQuestIdSalt}-a`,
                                      ).classList.add('hide');

                                    if (
                                      s(
                                        `.bubble-dialog-${idModal}-element-bubble-${dialogQuestIdSalt}-b`,
                                      ).classList.contains('hide')
                                    )
                                      s(
                                        `.bubble-dialog-${idModal}-element-bubble-${dialogQuestIdSalt}-b`,
                                      ).classList.remove('hide');
                                    else
                                      s(
                                        `.bubble-dialog-${idModal}-element-bubble-${dialogQuestIdSalt}-b`,
                                      ).classList.add('hide');

                                    if (
                                      s(
                                        `.bubble-dialog-${idModal}-element-bubble-${dialogQuestIdSalt}-a`,
                                      ).classList.contains('hide')
                                    )
                                      currentBubbleId = 'b';
                                    else currentBubbleId = 'a';

                                    await renderTalkingDialog();
                                  }
                                };
                                await renderTalkingDialog();
                                s(`.button-quest-modal-forward-${questData.id}`).click();
                              });

                            if (itemData.current < itemData.quantity) {
                              handBlock[typeTarget][elementTargetId] = true;
                              setTimeout(() => {
                                delete handBlock[typeTarget][elementTargetId];
                              }, respawn);
                              Slot.questItem.update({ bagId: 'cyberia-bag', displayId, type: 'user', id: 'main' });
                              if (QuestComponent.componentsScope[displayId].questKeyContext === 'displaySearchObjects')
                                SocketIoCyberia.disconnect({ type: typeTarget, id: elementTargetId });
                              SocketIo.Emit('user', {
                                status: 'take-quest-item',
                                element: { type: typeTarget, id: elementTargetId },
                                questData: { id: questData.id },
                              });
                              this.updateQuestItemProgressDisplay({
                                interactionPanelQuestId,
                                currentQuestDataIndex,
                                currentStep,
                                displayId,
                                questData,
                                searchObjectIndex: displayIdIndex,
                              });
                              await InteractionPanelCyberia.PanelRender.removeActionPanel(idPanel);
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
                    !questData ||
                    ElementsCyberia.Data.user['main'].model.quests.find((q) => q.id === questData.id) ||
                    QuestComponent.componentsScope[displayId].questKeyContext !== 'provide';
                  const idKeyboardEvent = 'quest-key-event-ok' + idPanel;
                  const instanceKeyBoardEventOk = () => {
                    if (okButtonDisabled) delete Keyboard.Event[idKeyboardEvent];
                    else
                      Keyboard.Event[idKeyboardEvent] = {
                        a: () =>
                          s(`.action-panel-ok-${idPanel}`) && !Modal.viewModalOpen()
                            ? s(`.action-panel-ok-${idPanel}`).click()
                            : null,
                        A: () =>
                          s(`.action-panel-ok-${idPanel}`) && !Modal.viewModalOpen()
                            ? s(`.action-panel-ok-${idPanel}`).click()
                            : null,
                      };
                  };
                  instanceKeyBoardEventOk();

                  const dudeButtonEnabled =
                    questData && QuestComponent.componentsScope[displayId].questKeyContext === 'provide';
                  {
                    const idKeyboardEvent = 'quest-key-event-dude' + idPanel;
                    if (!dudeButtonEnabled) delete Keyboard.Event[idKeyboardEvent];
                    else
                      Keyboard.Event[idKeyboardEvent] = {
                        s: () =>
                          s(`.action-panel-dude-${idPanel}`) && !Modal.viewModalOpen()
                            ? s(`.action-panel-dude-${idPanel}`).click()
                            : null,
                        S: () =>
                          s(`.action-panel-dude-${idPanel}`) && !Modal.viewModalOpen()
                            ? s(`.action-panel-dude-${idPanel}`).click()
                            : null,
                      };
                  }

                  const actionButtonEnabled = questData && (enabledQuestPanel || enabledShopPanel);

                  {
                    const idKeyboardEvent = 'quest-key-event-hand' + idPanel;
                    if (!actionButtonEnabled) delete Keyboard.Event[idKeyboardEvent];
                    else
                      Keyboard.Event[idKeyboardEvent] = {
                        a: () => {
                          if (actionButtonEnabled)
                            s(`.action-panel-hand-${idPanel}`) && !Modal.viewModalOpen()
                              ? s(`.action-panel-hand-${idPanel}`).click()
                              : null;
                        },
                        A: () => {
                          if (actionButtonEnabled)
                            s(`.action-panel-hand-${idPanel}`) && !Modal.viewModalOpen()
                              ? s(`.action-panel-hand-${idPanel}`).click()
                              : null;
                        },
                      };
                  }

                  let keyBoardFocusBlock = false;
                  const keyBoardFocusTrigger = () => {
                    if (keyBoardFocusBlock) return;
                    keyBoardFocusBlock = true;
                    setTimeout(() => (keyBoardFocusBlock = false), 500);
                    if (s(`.action-panel-close-${idPanel}`)) s(`.action-panel-close-${idPanel}`).click();
                    if (questData && s(`.button-quest-modal-forward-${questData.id}`))
                      s(`.button-quest-modal-forward-${questData.id}`).click();
                    Keyboard.Event['focus'] = {
                      f: MainUserCyberia.focusTarget,
                      F: MainUserCyberia.focusTarget,
                    };
                    instanceKeyBoardEventOk();
                  };
                  {
                    Keyboard.Event['focus'] = {
                      f: keyBoardFocusTrigger,
                      F: keyBoardFocusTrigger,
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
                        (QuestComponent.componentsScope[displayId].questKeyContext === 'provide' ||
                          QuestComponent.componentsScope[displayId].questKeyContext === 'seller') &&
                        (enableDefaultDialog || enableShortDescription)
                          ? ':'
                          : ''}
                      </div>
                      <div
                        class="in quest-short-description ${enableDefaultDialog || enableShortDescription
                          ? ''
                          : 'hide'}"
                      >
                        ${enableShortDescription
                          ? html`<div class="typeWriter-render-shortDescription-${questData.id}"></div>`
                          : enableDefaultDialog
                          ? html`<div class="typeWriter-render-defaultDialog-${displayId}"></div>`
                          : ''}
                      </div>
                      <div class="fl">
                        ${await BtnIcon.Render({
                          class: `in fll action-panel-bar-btn-container action-panel-hand-${idPanel}  ${
                            actionButtonEnabled ? '' : 'hide'
                          }`,
                          label: html`${currentItemData && currentItemData.actionIcon
                              ? html`
                                  <img
                                    class="abs center action-panel-img-icon"
                                    src="${getProxyPath()}${currentItemData.actionIcon}"
                                  />
                                `
                              : html`<img
                                  class="abs center action-panel-img-icon"
                                  src="${getProxyPath()}${questData && questData.actionIcon
                                    ? questData.actionIcon
                                    : 'assets/ui-icons/hand.png'}"
                                />`}
                            <div class="abs quest-keyboard-bubble-info">A</div>`,
                        })}
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
                          class: `in fll action-panel-bar-btn-container action-panel-dude-${idPanel} ${
                            dudeButtonEnabled ? '' : 'hide'
                          }`,
                          label: html`<img
                              class="abs center action-panel-img-icon"
                              src="${getProxyPath()}assets/ui-icons/dude.png"
                            />
                            <div class="abs quest-keyboard-bubble-info">S</div>`,
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

        // for (const idPanel of Object.keys(InteractionPanelCyberia.PanelRender.actionPanelTokens)) {
        //   if (!panels.includes(idPanel)) {
        //     // console.error('remove');
        //     // await InteractionPanelCyberia.PanelRender.removeActionPanel(idPanel);
        //   }
        // }
        // if (panels.length === 0) {
        //   Keyboard.Event['focus'] = {
        //     f: MainUserCyberia.focusTarget,
        //     F: MainUserCyberia.focusTarget,
        //   };
        // }
      }, 1250);

      Keyboard.Event['focus'] = {
        f: MainUserCyberia.focusTarget,
        F: MainUserCyberia.focusTarget,
      };

      await this.triggerQuestAvailableRender({ type, id });
    }
    PointAndClickMovementCyberia.TargetEvent['quest-event'] = async ({ type, id }) => {
      if (type !== 'user' && id !== 'main')
        this.questClosePanels = this.questClosePanels.filter((p) => p !== `action-panel-${type}-${id}`);
    };
  },
  onChangeCurrentQuestAvailable: {},
  triggerQuestAvailableRender: async function ({ type, id }) {
    // TODO: cyberia-shop-bag - enabled this ui feature
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
  RenderModal: async function ({ questData, interactionPanelQuestId, completeStep, completeQuest, elementTargetId }) {
    questData = {
      ...QuestComponent.Data[questData.id](),
      ...questData,
    };

    const idPanel = this.getIdPanelByQuestId({ questData });
    if (idPanel) await InteractionPanelCyberia.PanelRender.removeActionPanel(idPanel);

    const currentQuestData = ElementsCyberia.Data.user['main'].model.quests.find((q) => q.id === questData.id);
    let currentStep = 0;
    if (currentQuestData) currentStep = currentQuestData.currentStep;
    const { barConfig } = await Themes[Css.currentTheme]();
    const idModal = `modal-panel-quest-${questData.id}`;
    const displayIdIndex = 0;
    const componentData = QuestComponent.components.find(
      (s) => s.displayId === questData.provide.displayIds[displayIdIndex].id,
    );

    let completeQuestStatic = false;
    if (currentQuestData && !completeQuest)
      completeQuestStatic = QuestComponent.verifyCompleteQuest({ questData: currentQuestData });

    const renderMainText = html`${completeQuest !== undefined || completeQuestStatic
      ? Translate.Render(`${questData.id}-successDescription`)
      : completeStep !== undefined
      ? Translate.Render(`${questData.id}-completeDialog-step-${componentData.displayId}-${currentStep}`)
      : currentStep > 0
      ? Translate.Render(`${questData.id}-completeDialog-step-${componentData.displayId}-${currentStep - 1}`)
      : Translate.Render(`${questData.id}-description`)}`;

    const mainDisplayId =
      completeQuest !== undefined || completeQuestStatic
        ? componentData.displayId
        : completeStep !== undefined
        ? questData.provide.displayIds[displayIdIndex].stepData[currentStep].displayId
        : currentStep > 0
        ? questData.provide.displayIds[displayIdIndex].stepData[currentStep - 1].displayId
        : componentData.displayId;

    const elementType = 'bot';
    const elementId = mainDisplayId
      ? Object.keys(ElementsCyberia.Data.bot).find(
          (botId) => ElementsCyberia.getCurrentSkinDisplayId({ id: botId, type: elementType }) === mainDisplayId,
        )
      : undefined;

    const renderMainImage =
      completeQuest !== undefined || completeQuestStatic
        ? html` <img
            class="in quest-provide-img"
            src="${getProxyPath()}assets/skin/${componentData.displayId}/08/0.${componentData.extension}"
          />`
        : completeStep !== undefined
        ? html` <img
            class="in quest-provide-img"
            src="${getProxyPath()}${questData.provide.displayIds[displayIdIndex].stepData[currentStep].image}"
            ${getProxyPath()}${questData.provide.displayIds[displayIdIndex].stepData[currentStep].imageStyle
              ? `style="${renderCssAttr({
                  style: questData.provide.displayIds[displayIdIndex].stepData[currentStep].imageStyle,
                })}"`
              : ''}
          />`
        : currentStep > 0
        ? html` <img
            class="in quest-provide-img"
            src="${getProxyPath()}${questData.provide.displayIds[displayIdIndex].stepData[currentStep - 1].image}"
            ${getProxyPath()}${questData.provide.displayIds[displayIdIndex].stepData[currentStep - 1].imageStyle
              ? `style="${renderCssAttr({
                  style: questData.provide.displayIds[displayIdIndex].stepData[currentStep - 1].imageStyle,
                })}"`
              : ''}
          />`
        : html` <img
            class="in quest-provide-img"
            src="${getProxyPath()}assets/skin/${componentData.displayId}/08/0.${componentData.extension}"
          />`;

    const translateData =
      completeQuest !== undefined || completeQuestStatic
        ? questData.successDescription
        : completeStep !== undefined
        ? questData.provide.displayIds[displayIdIndex].stepData[currentStep].completeDialog
        : currentStep > 0
        ? questData.provide.displayIds[displayIdIndex].stepData[currentStep - 1].completeDialog
        : questData.description;

    const questContext = QuestComponent.componentsScope[mainDisplayId];

    // console.warn({ mainDisplayId, questData, questContext });

    const idSalt = s4() + s4();
    let currentSectionIndex = 0;

    const bubbleMainText = async () => {
      setTimeout(() => {
        const offsetWidth = s(`.${idModal}`).offsetWidth;
        const { phraseArray, sectionsIndex } = getSectionsStringData(
          offsetWidth * 0.07,
          translateData[s('html').lang] ? translateData[s('html').lang] : translateData['en'],
        );

        const updateArrowAction = () => {
          if (sectionsIndex.length > 1 && s(`.dialog-step-container-${questData.id}`).classList.contains('hide')) {
            s(`.dialog-step-container-${questData.id}`).classList.remove('hide');
            htmls(`.dialog-step-container-total-${questData.id}`, sectionsIndex.length);
          }
          htmls(`.dialog-step-container-current-${questData.id}`, currentSectionIndex + 1);
          if (currentSectionIndex === 0 && currentSectionIndex === sectionsIndex.length - 1) {
            s(`.quest-bubble-icon-arrow-left`).style.display = 'none';
            s(`.quest-bubble-icon-arrow-right`).style.display = 'none';
            return;
          }
          if (currentSectionIndex === 0) {
            s(`.quest-bubble-icon-arrow-left`).style.opacity = '0';
            s(`.quest-bubble-icon-arrow-left`).style.cursor = 'default';
          } else {
            s(`.quest-bubble-icon-arrow-left`).style.opacity = null;
            s(`.quest-bubble-icon-arrow-left`).style.cursor = null;
          }
          if (currentSectionIndex === sectionsIndex.length - 1) {
            s(`.quest-bubble-icon-arrow-right`).style.opacity = '0';
            s(`.quest-bubble-icon-arrow-right`).style.cursor = 'default';
          } else {
            s(`.quest-bubble-icon-arrow-right`).style.opacity = null;
            s(`.quest-bubble-icon-arrow-right`).style.cursor = null;
          }
        };

        const typeWriteRender = async () => {
          updateArrowAction();
          await typeWriteSectionsString({
            container: `typeWriteSectionsString-${questData.id}-${idSalt}`,
            phraseArray,
            rangeArraySectionIndex: sectionsIndex[currentSectionIndex],
          });
        };

        s(`.quest-bubble-icon-arrow-right`).onclick = () => {
          if (currentSectionIndex === sectionsIndex.length - 1) return;
          htmls(`.typeWriteSectionsString-${questData.id}-${idSalt}`, '');
          currentSectionIndex++;
          typeWriteRender();
        };
        s(`.quest-bubble-icon-arrow-left`).onclick = () => {
          if (currentSectionIndex === 0) return;
          htmls(`.typeWriteSectionsString-${questData.id}-${idSalt}`, '');
          currentSectionIndex--;
          typeWriteRender();
        };
        typeWriteRender();
      });
      return await renderBubbleDialog({
        id: `${idModal}-bubble-description`,
        triangleType: 'right',
        html: async () =>
          html`
            <div class="fl">
              ${await BtnIcon.Render({
                class: `in flr action-panel-bar-btn-container quest-bubble-icon-arrow-right`,
                label: html`<img
                    class="abs center action-panel-img-icon"
                    src="${getProxyPath()}assets/ui-icons/arrow-right.png"
                  />
                  <!-- <div class="abs quest-keyboard-bubble-info"></div> -->`,
              })}
              ${await BtnIcon.Render({
                class: `in flr action-panel-bar-btn-container quest-bubble-icon-arrow-left`,
                label: html`<img
                    class="abs center action-panel-img-icon"
                    src="${getProxyPath()}assets/ui-icons/arrow-left.png"
                  />
                  <!-- <div class="abs quest-keyboard-bubble-info"></div> -->`,
              })}
            </div>
            <div class="fl">
              <div class="in flr">
                <div class="dialog-step-container dialog-step-container-${questData.id} hide">
                  <span class="dialog-step-container-current-${questData.id}"></span> /
                  <span class="dialog-step-container-total-${questData.id}"></span>
                </div>
              </div>
            </div>
            <div class="in typeWriteSectionsString typeWriteSectionsString-${questData.id}-${idSalt}"></div>
          `,
        classSelectors: 'in',
      });
    };
    const CyberiaQuestSections = {
      sellerStorage: async () => {
        const bagId = 'cyberia-seller-bag';
        let indexBag = -1;
        setTimeout(() => {
          for (const componentType of Object.keys(CyberiaShopStorage)) {
            const itemShopData = CyberiaShopStorage[componentType].filter((s) =>
              s.sellers.find((s0) => s0.id === mainDisplayId),
            );
            for (const itemData of itemShopData) {
              indexBag++;
              Slot[componentType].render({
                bagId,
                slotId: `${bagId}-${indexBag}`,
                displayId: itemData.id,
                disabledCount: true,
                itemData,
                context: 'seller',
                storageBotId: elementTargetId,
              });
            }
          }
        });
        return html`${await BagCyberia.Render({
          disableSortable: true,
          id: bagId,
          idModal: 'modal-seller',
          owner: {
            type: elementType,
            id: elementId,
          },
          empty: true,
        })}`;
      },
      progress: async () => {
        setTimeout(() => {
          for (const step of range(0, questData.maxStep + 1)) {
            s(`.quest-step-box-${questData.id}-${step}`).onclick = () => {
              for (const step0 of range(0, questData.maxStep + 1)) {
                if (step === step0) {
                  s(`.quest-step-box-${questData.id}-${step0}`).classList.remove(`quest-step-box-disable`);
                  if (s(`.step-progress-container-${questData.id}-${step0}`))
                    s(`.step-progress-container-${questData.id}-${step0}`).classList.remove(`hide`);
                } else if (
                  !s(`.quest-step-box-${questData.id}-${step0}`).classList.contains(`quest-step-box-disable`)
                ) {
                  s(`.quest-step-box-${questData.id}-${step0}`).classList.add(`quest-step-box-disable`);
                  if (s(`.step-progress-container-${questData.id}-${step0}`))
                    s(`.step-progress-container-${questData.id}-${step0}`).classList.add(`hide`);
                }
              }
            };
          }

          if (completeStep || completeQuest)
            setTimeout(() => {
              for (const i of range(0, currentStep)) {
                s(`.quest-step-box-${questData.id}-${i}`).classList.remove('gray');
                s(`.quest-step-check-img-${questData.id}-${i}`).classList.remove('hide');
              }

              s(`.quest-step-box-${questData.id}-${currentStep + 1}`).classList.remove('gray');
              s(`.quest-step-box-${questData.id}-${currentStep + 1}`).click();
              if (completeQuest) s(`.quest-step-check-img-${questData.id}-${currentStep + 1}`).classList.remove('hide');
            }, 1000);

          if (completeQuestStatic) s(`.quest-step-box-${questData.id}-${currentStep + 1}`).click();
        });
        return html` <div class="in section-mp quest-modal-container" style="max-width: 450px">
          <div class="in sub-title-item-modal">
            <img class="inl header-icon-item-modal" src="${getProxyPath()}assets/ui-icons/stats.png" /> Progress
          </div>

          <div class="in section-mp" style="text-align: center;">
            ${range(0, questData.maxStep)
              .map(
                (i) => html`
                  ${i !== 0 && i % 4 === 0 ? html`<br />` : ''}
                  <div
                    class="inl quest-step-box quest-step-box-${questData.id}-${i} ${i === currentStep
                      ? ''
                      : `quest-step-box-disable`} ${!completeQuestStatic && currentStep < i ? 'gray' : ''}"
                  >
                    <img class="abs center quest-step-background-img" src="${getProxyPath()}assets/util/step.png" />
                    <div class="abs center">${i + 1}</div>
                    <img
                      class="abs quest-step-check-img quest-step-check-img-${questData.id}-${i} ${!completeQuestStatic &&
                      currentStep <= i
                        ? 'hide'
                        : ''}"
                      src="${getProxyPath()}assets/ui-icons/check.png"
                    />
                  </div>
                `,
              )
              .join('')}
            <div
              class="inl quest-step-box quest-step-box-${questData.id}-${questData.maxStep +
              1} quest-step-box-disable ${!completeQuestStatic ? 'gray' : ''}"
            >
              <img class="abs center quest-step-background-img" src="${getProxyPath()}assets/ui-icons/star.png" />
              <img
                class="abs quest-step-check-img quest-step-check-img-${questData.id}-${questData.maxStep +
                1} ${!completeQuestStatic ? 'hide' : ''}"
                src="${getProxyPath()}assets/ui-icons/check.png"
              />
            </div>
          </div>

          <div class="in section-mp">
            ${range(0, questData.maxStep)
              .map(
                (i) => html`
                  <div class="in step-progress-container-${questData.id}-${i} ${i === currentStep ? '' : 'hide'}">
                    ${questData.displaySearchObjects
                      .map((q) => {
                        if (q.step !== i) return '';
                        if (currentQuestData) {
                          const searchItemData = currentQuestData.displaySearchObjects.find(
                            (s) => s.id === q.id && s.step === i,
                          );

                          if (searchItemData) q.current = searchItemData.current;
                        }
                        const searchObjectQuestSpriteData = QuestComponent.components.find((s) => s.displayId === q.id);

                        return html`<div class="fl">
                          <div class="in fll" style="width: 60%">
                            <div class="in fll quest-modal-panel-containers-quest-img">
                              <img
                                class="in quest-interaction-panel-icon-img"
                                src="${getProxyPath()}assets/${searchObjectQuestSpriteData.assetFolder}/${searchObjectQuestSpriteData.displayId}/${searchObjectQuestSpriteData.position}/0.${searchObjectQuestSpriteData.extension}"
                              />
                            </div>
                            ${q.id}
                          </div>
                          <div class="in fll" style="width: 40%">
                            <span class="modal-${questData.id}-${q.id}-${q.step}-current">${q.current}</span>
                            /
                            <span> ${q.quantity}</span>
                          </div>
                        </div> `;
                      })
                      .join('')}
                  </div>
                `,
              )
              .join('')}

            <br />
          </div>
        </div>`;
      },
      rewards: async () => {
        return html` <div class="in section-mp quest-modal-container" style="max-width: 450px">
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
                  BagCyberia.Tokens[bagId] = { owner: { id: 'main', type: 'user' } };
                  Slot[type].renderBagCyberiaSlots({ bagId, indexBagCyberia: index, quantity });
                });
                return html`<div class="inl bag-slot ${bagId}-${index}"></div>`;
              })
              .join('')}
          </div>
          <br />
        </div>`;
      },
      btnTakeQuest: async () => {
        return html` <div class="in section-mp">
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
        </div>`;
      },
    };

    await Modal.Render({
      id: idModal,
      barConfig,
      title: renderViewTitle({
        // 'ui-icon': questData.icon.id,
        // assetFolder: questData.icon.folder,
        'ui-icon': 'quest.png',
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
            ${questContext && questContext.questKeyContext === 'seller'
              ? html`${await CyberiaQuestSections.sellerStorage()}`
              : html`${await CyberiaQuestSections.progress()} ${await CyberiaQuestSections.rewards()}
                ${await CyberiaQuestSections.btnTakeQuest()}`}
          </div>
          <div class="in fll quest-dynamic-${questData.id}-col-b">
            <div class="in section-mp">
              <div class="fl">
                <div class="in fll" style="width: 50%">
                  <div class="in" style="height: 60px"></div>
                  ${completeQuest !== undefined || completeQuestStatic
                    ? questData.successDescriptionBubble
                      ? await bubbleMainText()
                      : renderMainText
                    : completeStep !== undefined
                    ? questData.provide.displayIds[displayIdIndex].stepData[currentStep].bubble
                      ? await bubbleMainText()
                      : renderMainText
                    : currentStep > 0
                    ? questData.provide.displayIds[displayIdIndex].stepData[currentStep - 1].bubble
                      ? await bubbleMainText()
                      : renderMainText
                    : questData.descriptionBubble
                    ? await bubbleMainText()
                    : renderMainText}
                </div>

                <div class="in fll" style="width: 50%">
                  <div class="in" style="height: 60px">
                    ${mainDisplayId && elementId
                      ? html` <div class="abs center">
                          ${ElementsCyberia.getDisplayTitle({
                            type: elementType,
                            id: elementId,
                            htmlTemplate: true,
                          })}
                          <br />
                          ${ElementsCyberia.getDisplayName({
                            type: elementType,
                            id: elementId,
                            htmlTemplate: true,
                          })}
                        </div>`
                      : ''}
                  </div>
                  ${renderMainImage}
                </div>
              </div>
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
        await InteractionPanelCyberia.PanelRender.removeAllActionPanel();
      }
      s(`.btn-close-${idModal}`).click();
    });

    EventsUI.onClick(`.btn-ok-quest-${idModal}`, async () => {
      s(`.btn-dismiss-quest-${idModal}`).classList.remove('hide');
      s(`.btn-ok-quest-${idModal}`).classList.add('hide');
      await this.takeQuest({ questData });
      s(`.btn-close-${idModal}`).click();
    });
  },
  updateQuestItemProgressDisplay: async function ({
    interactionPanelQuestId,
    currentQuestDataIndex,
    currentStep,
    displayId,
    questData,
    searchObjectIndex,
  }) {
    ElementsCyberia.Data.user['main'].model.quests[currentQuestDataIndex].displaySearchObjects[searchObjectIndex]
      .current++;
    if (s(`.quest-interaction-panel-${interactionPanelQuestId}`))
      htmls(
        `.${questData.id}-${displayId}-${currentStep}-current`,
        ElementsCyberia.Data.user['main'].model.quests[currentQuestDataIndex].displaySearchObjects[searchObjectIndex]
          .current,
      );

    if (s(`.modal-panel-quest-${questData.id}`))
      htmls(
        `.modal-${questData.id}-${displayId}-${currentStep}-current`,
        ElementsCyberia.Data.user['main'].model.quests[currentQuestDataIndex].displaySearchObjects[searchObjectIndex]
          .current,
      );

    const completeStep = QuestComponent.verifyCompleteQuestStep({
      questData: ElementsCyberia.Data.user['main'].model.quests[currentQuestDataIndex],
    });
    if (completeStep) {
      const completeQuest = QuestComponent.verifyCompleteQuest({
        questData: ElementsCyberia.Data.user['main'].model.quests[currentQuestDataIndex],
      });
      if (completeQuest) {
        await this.RenderModal({
          questData,
          interactionPanelQuestId,
          completeQuest,
        });
        return;
      }

      sa(
        `.quest-panel-step-${questData.id}-${ElementsCyberia.Data.user['main'].model.quests[currentQuestDataIndex].currentStep}`,
      ).forEach((el) => el.classList.add('hide'));

      await this.RenderModal({
        questData,
        interactionPanelQuestId,
        completeStep,
      });

      ElementsCyberia.Data.user['main'].model.quests[currentQuestDataIndex].currentStep++;

      sa(
        `.quest-panel-step-${questData.id}-${ElementsCyberia.Data.user['main'].model.quests[currentQuestDataIndex].currentStep}`,
      ).forEach((el) => el.classList.remove('hide'));

      htmls(
        `.quest-interaction-panel-current-step-${questData.id}`,
        ElementsCyberia.Data.user['main'].model.quests[currentQuestDataIndex].currentStep + 1,
      );
    }
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
    await InteractionPanelCyberia.PanelRender.removeAllActionPanel();
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
  countQuestItems: function ({ type, id, displayId }) {
    let globalCount = 0;
    for (const questData of ElementsCyberia.Data[type][id].model.quests) {
      let count = 0;
      for (const itemData of questData.displaySearchObjects) {
        if (itemData.id === displayId) count += itemData.current;
        if (itemData.delivery && itemData.current >= itemData.quantity) count = 0;
      }
      globalCount += count;
    }

    return globalCount;
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
