import { BtnIcon } from '../core/BtnIcon.js';
import { getId, newInstance, objectEquals, range, timer } from '../core/CommonJs.js';
import {
  Css,
  Themes,
  borderChar,
  dashRange,
  getTranslate3d,
  renderBubbleDialog,
  renderCssAttr,
  typeWriter,
} from '../core/Css.js';
import { LoadingAnimation } from '../core/LoadingAnimation.js';
import { Modal, renderViewTitle } from '../core/Modal.js';
import { Responsive } from '../core/Responsive.js';
import { Translate } from '../core/Translate.js';
import { append, getProxyPath, htmls, prepend, s } from '../core/VanillaJs.js';
import { BiomeCyberiaScope } from './BiomeCyberia.js';
import { CharacterCyberia } from './CharacterCyberia.js';
import { QuestComponent, WorldCyberiaType, isElementCollision } from './CommonCyberia.js';
import { ElementsCyberia } from './ElementsCyberia.js';
import { MatrixCyberia } from './MatrixCyberia.js';
import { PixiCyberia } from './PixiCyberia.js';
import { PointAndClickMovementCyberia } from './PointAndClickMovementCyberia.js';
import { QuestManagementCyberia } from './QuestCyberia.js';
import { WorldCyberiaManagement } from './WorldCyberia.js';

const InteractionPanelCyberia = {
  Data: {},
  restorePanel: function (id) {
    const transition = s(`.${id}`).style.transition;
    s(`.${id}`).style.transition = '0.3s';
    this.Data[`${id}`].restorePosition(s(`.${id}`).style);
    s(`.${id}`).style.transform = '';
    Modal.Data[`${id}`].setDragInstance({
      defaultPosition: {
        x: 0,
        y: 0,
      },
    });
    Modal.Data[`${id}`].onDragEndListener[`${id}`](); // save storage
    setTimeout(() => {
      s(`.${id}`).style.transition = transition;
    }, 400);
  },
  PanelRender: {
    actionPanelTokens: {},
    removeAllActionPanel: async function () {
      for (const idPanel of Object.keys(InteractionPanelCyberia.PanelRender.actionPanelTokens))
        await InteractionPanelCyberia.PanelRender.removeActionPanel(idPanel);
      QuestManagementCyberia.questClosePanels = [];
    },
    removeActionPanel: async function (idPanel) {
      if (s(`.${idPanel}`)) s(`.${idPanel}`).remove();
      delete InteractionPanelCyberia.PanelRender.actionPanelTokens[idPanel];
    },
    action: async function ({ idPanel, type, id, html }) {
      const maxHeight = 110;
      const ResponsiveDataAmplitude = Responsive.getResponsiveDataAmplitude({
        dimAmplitude: MatrixCyberia.Data.dimAmplitude,
      });

      this.actionPanelTokens[idPanel] = {};

      const top = `${
        (ResponsiveDataAmplitude.minValue / MatrixCyberia.Data.dim) * ElementsCyberia.Data[type][id].y * 1 - maxHeight
      }px`;
      const left = `${
        (ResponsiveDataAmplitude.minValue / MatrixCyberia.Data.dim) * ElementsCyberia.Data[type][id].x * 1
      }px`;

      const height = `${maxHeight}px`;

      if (s(`.${idPanel}`)) {
        s(`.${idPanel}`).style.left = left;
        s(`.${idPanel}`).style.top = top;
      } else
        append(
          `.PointAndClickMovementCyberia-container`,
          html`
            <div class="abs action-game-panel ${idPanel}" style="top: ${top}; left: ${left}; height: ${height};">
              ${await html()}
            </div>
          `,
        );
    },
    element: async function ({ type, id }) {
      if (!s(`.element-interaction-panel`)) return;
      htmls(
        '.element-interaction-panel-preview',
        html`<div class="abs center element-interaction-panel-preview-loading"></div>`,
      );
      LoadingAnimation.img.play(`.element-interaction-panel-preview-loading`, 'points');
      {
        const container = 'element-interaction-panel-preview';
        await CharacterCyberia.renderCharacterCyberiaPreView({
          type,
          id,
          container,
          customStyle: html`<style>
            .${container}-header {
              height: 100%;
              width: 50%;
              float: left;
            }
            .${container}-body {
              height: 100%;
              width: 50%;
              float: left;
            }
            .${container}-img {
              width: 100%;
              height: auto;
            }
          </style>`,
        });
      }
    },
    map: function ({ face }) {
      if (!s(`.map-interaction-panel`)) return;
      const displaySymbol = ['༺', 'Ⓐ', '⌘', 'Ξ', '†', '⨁', '◶', '✪', '◍', '⚉', '⨂'];
      const zoneNames = ['vlit6', 'ubrig', 'df23', 'ecc0'];

      htmls(
        `.map-interaction-panel-cell-0`,
        html` <div class="abs center map-face-slot-center-container">
          ${(WorldCyberiaManagement.Data['user']['main'].model.world.type === 'width' ? range(0, 3) : range(3, 0))
            .map(
              (v, i) =>
                html` <div class="in fll map-face-slot-container map-face-slot-container-${v}">
                  <img class="abs center map-face-slot-img map-face-slot-img-${v}" />
                  <img class="abs center map-face-slot-img map-face-slot-img-toplevel-${v}" />
                  <div class="abs center map-face-slot-dash map-face-slot-dash-${v}"></div>
                  <div class="abs center map-face-slot map-face-slot-${v}">
                    <div class="abs center map-face-symbol-text map-face-symbol-text-${v}"></div>
                  </div>
                </div>`,
            )
            .join('')}
        </div>`,
      );

      const indexFace = WorldCyberiaType[
        WorldCyberiaManagement.Data['user']['main'].model.world.type
      ].worldFaces.findIndex((f) => f === face);
      range(
        0,
        WorldCyberiaType[WorldCyberiaManagement.Data['user']['main'].model.world.type].worldFaces.length - 1,
      ).map((i) => {
        htmls(
          `.map-face-symbol-text-${i}`,
          html`
            ${WorldCyberiaManagement.Data['user']['main'].model.world.instance[
              WorldCyberiaType[WorldCyberiaManagement.Data['user']['main'].model.world.type].worldFaces[i] - 1
            ].type}<br />
            ${WorldCyberiaType[WorldCyberiaManagement.Data['user']['main'].model.world.type].worldFaces[i]}
          `,
        );
        s(`.map-face-slot-${i}`).style.background = `#80751980`;
      });
      s(`.map-face-slot-${indexFace}`).style.background = `#f5dd11d9`;
      s(`.interaction-panel-zone-img-background`).src = BiomeCyberiaScope.Data[MatrixCyberia.Data.biomeDataId].imageSrc;

      let index = -1;
      for (const indexFace of WorldCyberiaType[WorldCyberiaManagement.Data['user']['main'].model.world.type]
        .worldFaces) {
        index++;
        s(`.map-face-slot-img-${index}`).src =
          BiomeCyberiaScope.Data[
            `biome-${WorldCyberiaManagement.Data['user']['main'].model.world.face[indexFace - 1]}`
          ].imageSrc;
        s(`.map-face-slot-img-toplevel-${index}`).src =
          BiomeCyberiaScope.Data[
            `biome-${WorldCyberiaManagement.Data['user']['main'].model.world.face[indexFace - 1]}`
          ].imageTopLevelColorSrc;
        if (indexFace === face) s(`.map-face-slot-dash-${index}`).classList.remove('hide');
        else s(`.map-face-slot-dash-${index}`).classList.add('hide');
      }

      Responsive.Event[`map-interaction-panel`]();
    },
    questTokens: {},
    questTokensPaginationFrom: 0,
    questTokensPaginationRange: 2,
    callBackQuestPanelRender: async () => {
      for (const panelQuestId of Object.keys(InteractionPanelCyberia.PanelRender.questTokens).reverse())
        if (s(`.quest-interaction-panel-${panelQuestId}`)) s(`.quest-interaction-panel-${panelQuestId}`).remove();

      let index = -1;
      for (const panelQuestId of Object.keys(InteractionPanelCyberia.PanelRender.questTokens).reverse()) {
        index++;
        if (
          index >= InteractionPanelCyberia.PanelRender.questTokensPaginationFrom &&
          index <=
            InteractionPanelCyberia.PanelRender.questTokensPaginationFrom +
              InteractionPanelCyberia.PanelRender.questTokensPaginationRange
        ) {
          if (!s(`.quest-interaction-panel-${panelQuestId}`))
            await InteractionPanelCyberia.PanelRender.quest(
              InteractionPanelCyberia.PanelRender.questTokens[panelQuestId],
            );
        }
      }
    },
    restoreQuestPanelRender: function () {
      InteractionPanelCyberia.PanelRender.questTokensPaginationFrom = 1;
      if (s(`.quest-interaction-panel-footer-btn-arrow-up`)) s(`.quest-interaction-panel-footer-btn-arrow-up`).click();
    },
    quest: async function ({ id, questData, disabledRender }) {
      if (!s(`.quest-interaction-panel`)) return;

      questData = {
        ...QuestComponent.Data[questData.id](),
        ...questData,
      };

      if (!(id in this.questTokens)) {
        this.questTokens[id] = { questData, id };
        this.restoreQuestPanelRender();
        return;
      }

      if (disabledRender) return;

      const currentQuestData = ElementsCyberia.Data.user['main'].model.quests.find((q) => q.id === questData.id);

      const providerQuestSpriteData = QuestComponent.components.find(
        (s) => s.displayId === questData.provide.displayIds[0].id,
      );

      const { currentStep } = currentQuestData;

      if (!s(`.quest-interaction-panel-${id}`))
        append(
          `.quest-interaction-panel-body`,
          html`<div class="fl quest-interaction-panel-${id}">
            <div class="in quest-interaction-panel-section">
              <div class="in quest-interaction-panel-row quest-interaction-panel-row-title-${id}">
                <div class="in fll quest-interaction-panel-search-object-container" style="background: none">
                  <div class="in fll quest-interaction-panel-containers-quest-img">
                    <img class="abs center quest-step-background-img" src="${getProxyPath()}assets/util/step.png" />
                    <div class="abs center quest-interaction-panel-current-step-${questData.id}">
                      ${currentStep + 1}
                    </div>
                  </div>
                  <div class="in fll quest-interaction-panel-containers-quest-img">
                    <img
                      class="in quest-interaction-panel-icon-img"
                      src="${getProxyPath()}assets/${providerQuestSpriteData.assetFolder}/${providerQuestSpriteData.displayId}/${providerQuestSpriteData.position}/0.${providerQuestSpriteData.extension}"
                    />
                  </div>

                  <span class="quest-interaction-panel-text" style="color: #ffcc00">
                    ${Translate.Render(`${questData.id}-title`)}
                  </span>
                </div>
              </div>
              <div class="in quest-interaction-panel-row quest-interaction-panel-row-info-${id}"></div>
            </div>
          </div>`,
        );

      htmls(
        `.quest-interaction-panel-row-info-${id}`,
        html` ${range(0, questData.maxStep)
          .map(
            (i) =>
              html`${questData.displaySearchObjects
                .map((q) => {
                  if (q.step !== i) return '';
                  if (currentQuestData) {
                    const searchItemData = currentQuestData.displaySearchObjects.find(
                      (s) => s.id === q.id && s.step === i,
                    );
                    if (searchItemData) q.current = searchItemData.current;
                  }

                  const searchObjectQuestSpriteData = QuestComponent.components.find((s) => s.displayId === q.id);

                  return html`<div
                    class="inl quest-panel-step-${questData.id}-${q.step} ${q.step !== currentStep ? 'hide' : ''}"
                  >
                    <div class="in fll quest-interaction-panel-search-object-container">
                      ${q.panelQuestIcons && q.panelQuestIcons.length > 0
                        ? html`${q.panelQuestIcons
                            .map(
                              (srcIcon) => html`<div class="in fll quest-interaction-panel-containers-quest-img">
                                <img class="in quest-interaction-panel-icon-img" src="${getProxyPath()}${srcIcon}" />
                              </div>`,
                            )
                            .join('')}`
                        : html`<div class="in fll quest-interaction-panel-containers-quest-img">
                            <img
                              class="in quest-interaction-panel-icon-img"
                              src="${getProxyPath()}assets/${searchObjectQuestSpriteData.assetFolder}/${searchObjectQuestSpriteData.displayId}/${searchObjectQuestSpriteData.position}/0.${searchObjectQuestSpriteData.extension}"
                            />
                          </div>`}

                      <span class="quest-interaction-panel-text"
                        ><span class="${questData.id}-${q.id}-${q.step}-current">${q.current}</span> /
                        <span> ${q.quantity}</span>
                      </span>
                    </div>
                  </div>`;
                })
                .join('')}`,
          )
          .join('')}`,
      );

      s(`.quest-interaction-panel-${id}`).onclick = async () => {
        const interactionPanelQuestId = questData ? `interaction-panel-${questData.id}` : undefined;
        await QuestManagementCyberia.RenderModal({ questData, interactionPanelQuestId });
      };
    },
    AllQuest: async function ({ type, id }) {
      if (!s(`.quest-interaction-panel`)) return;

      htmls(`.quest-interaction-panel-body`, html``);

      for (const currentQuestData of ElementsCyberia.Data[type][id].model.quests) {
        await this.quest({
          questData: currentQuestData,
          id: `interaction-panel-${currentQuestData.id}`,
          disabledRender: true,
        });
      }

      this.restoreQuestPanelRender();
    },
  },
  Render: async function (options = { id: 'interaction-panel' }) {
    const id = options?.id ? options.id : getId(this.Data, 'interaction-panel-');
    if (!this.Data[id])
      this.Data[id] = {
        element: {
          current: {
            type: 'user',
            id: 'main',
          },
        },
      };
    const style = {
      // height: '40px',
      // width: '180px',
      // 'z-index': 3,
      'font-size': '18px',
      overflow: 'hidden',
      resize: 'none',
      color: `#ffcc00`,
      // border: '1px solid red',
      'box-sizing': 'border-box',
    };
    let containerClass;
    let render = async () => html`${id}`;
    let restorePosition = () => null;
    switch (id) {
      case 'menu-interaction-panel':
        {
          style.left = `0px`;
          style.top = `0px`;
          style.height = `${100}px`;
          // style.background = 'none';
          // style['z-index'] = 7;
          Responsive.Event[id] = () => {
            s(`.${id}`).style.width = `${window.innerWidth}px`;
          };
          setTimeout(Responsive.Event[id]);
          render = async () => {
            setTimeout(() => {
              Modal.Data['modal-menu'].onCloseListener['cy-int-btn-menu'] = () => {
                s(`.img-btn-square-menu-close`).classList.add('hide');
                s(`.img-btn-square-menu-open`).classList.remove('hide');
              };
              Modal.Data['modal-menu'].onMenuListener['cy-int-btn-menu'] = () => {
                s(`.img-btn-square-menu-open`).classList.add('hide');
                s(`.img-btn-square-menu-close`).classList.remove('hide');
              };

              s(`.cy-int-btn-menu`).onclick = () => {
                if (s(`.img-btn-square-menu-close`).classList.contains('hide')) {
                  s(`.btn-menu-modal-menu`).click();
                } else {
                  s(`.btn-close-modal-menu`).click();
                }
              };
              s(`.cy-int-btn-logo`).onclick = () => {
                Modal.onHomeRouterEvent();
              };
              s(`.cy-int-btn-map`).onclick = async () => {
                Modal.onHomeRouterEvent();
                if (!s(`.map-interaction-panel`)) {
                  await this.Render({ id: 'map-interaction-panel' });
                  await this.PanelRender.map({ face: ElementsCyberia.Data.user.main.model.world.face });
                } else {
                  this.restorePanel('map-interaction-panel');
                  {
                    const idModal = 'map-interaction-panel';
                    Modal.zIndexSync({ idModal });
                  }
                }
              };
              s(`.cy-int-btn-target`).onclick = async () => {
                Modal.onHomeRouterEvent();
                if (!s(`.element-interaction-panel`)) {
                  await this.Render({ id: 'element-interaction-panel' });
                  await this.PanelRender.element(
                    InteractionPanelCyberia.Data['element-interaction-panel'].element.current,
                  );
                } else {
                  this.restorePanel('element-interaction-panel');
                  {
                    const idModal = 'element-interaction-panel';
                    Modal.zIndexSync({ idModal });
                  }
                }
              };
              s(`.cy-int-btn-quest`).onclick = () => {
                Modal.onHomeRouterEvent();
                if (!s(`.quest-interaction-panel`)) this.Render({ id: 'quest-interaction-panel' });
                else {
                  this.restorePanel('quest-interaction-panel');
                  {
                    const idModal = 'quest-interaction-panel';
                    Modal.zIndexSync({ idModal });
                  }
                }
              };

              s(`.cy-int-btn-character`).onclick = () => {
                s(`.main-btn-character`).click();
              };
              s(`.cy-int-btn-bag`).onclick = () => {
                s(`.main-btn-bag`).click();
              };
              s(`.cy-int-btn-chat`).onclick = () => {
                s(`.main-btn-chat`).click();
              };
              s(`.cy-int-btn-wallet`).onclick = () => {
                s(`.main-btn-wallet`).click();
              };
            });
            return html`
              <div class="in">
                ${await BtnIcon.Render({
                  class: `inl action-bar-box cy-int-btn-logo`,
                  label: html`<img
                    class="abs center img-btn-square-menu"
                    src="${getProxyPath()}assets/ui-icons/cyberia-white.png"
                  />`,
                })}
                ${await BtnIcon.Render({
                  class: `inl action-bar-box cy-int-btn-character`,
                  label: html`<img
                    class="abs center img-btn-square-menu"
                    src="${getProxyPath()}assets/ui-icons/anon.png"
                  />`,
                })}
                ${await BtnIcon.Render({
                  class: `inl action-bar-box cy-int-btn-bag`,
                  label: html`<img
                    class="abs center img-btn-square-menu"
                    src="${getProxyPath()}assets/ui-icons/bag.png"
                  />`,
                })}
                ${await BtnIcon.Render({
                  class: `inl action-bar-box cy-int-btn-map`,
                  label: html`<img
                    class="abs center img-btn-square-menu"
                    src="${getProxyPath()}assets/ui-icons/map.png"
                  />`,
                })}
                ${await BtnIcon.Render({
                  class: `inl action-bar-box cy-int-btn-target`,
                  label: html`<img
                    class="abs center img-btn-square-menu"
                    src="${getProxyPath()}assets/ui-icons/target.png"
                  />`,
                })}
                ${await BtnIcon.Render({
                  class: `inl action-bar-box cy-int-btn-quest`,
                  label: html`<img
                    class="abs center img-btn-square-menu"
                    src="${getProxyPath()}assets/ui-icons/quest.png"
                  />`,
                })}
              </div>
              <div class="in">
                ${await BtnIcon.Render({
                  class: `inl action-bar-box cy-int-btn-menu`,
                  label: html`<img
                      class="abs center img-btn-square-menu img-btn-square-menu-open"
                      src="${getProxyPath()}assets/ui-icons/points.png"
                      style="${renderCssAttr({ style: { transform: 'translate(-50%, -50%) rotate(90deg)' } })}"
                    /><img
                      class="abs center img-btn-square-menu img-btn-square-menu-close hide"
                      src="${getProxyPath()}assets/ui-icons/close-yellow.png"
                    />`,
                })}
                ${await BtnIcon.Render({
                  class: `inl action-bar-box cy-int-btn-chat`,
                  label: html`<img
                    class="abs center img-btn-square-menu"
                    src="${getProxyPath()}assets/ui-icons/chat.png"
                  />`,
                })}
                ${await BtnIcon.Render({
                  class: `inl action-bar-box cy-int-btn-wallet`,
                  label: html`<img
                    class="abs center img-btn-square-menu"
                    src="${getProxyPath()}assets/ui-icons/wallet.png"
                  />`,
                })}
              </div>
              <style>
                .btn-modal-default-${'menu-interaction-panel'} {
                  min-width: 24px;
                  min-height: 24px;
                  margin: 3px;
                  padding: 0;
                }
                .btn-modal-default-${'element-interaction-panel'} {
                  min-width: 24px;
                  min-height: 24px;
                  margin: 3px;
                  padding: 0;
                }
                .btn-modal-default-${'map-interaction-panel'} {
                  min-width: 24px;
                  min-height: 24px;
                  margin: 3px;
                  padding: 0;
                }
                .btn-modal-default-${'quest-interaction-panel'} {
                  min-width: 24px;
                  min-height: 24px;
                  margin: 3px;
                  padding: 0;
                }
                .interaction-panel-bar-default-icon {
                  top: 2px;
                }
                .interaction-panel-container-title {
                  top: 5px;
                  left: 5px;
                }
                .interaction-panel-container-title-icon {
                  width: 20px;
                  height: 20px;
                }
                .interaction-panel-container-text {
                  font-size: 12px;
                  font-family: 'retro-font-title';
                  color: #ffcc00;
                  top: -3px;
                }
                .element-interaction-panel-preview {
                  overflow: hidden;
                }
                .map-face-slot-container {
                  /* border: 2px solid red; */
                  box-sizing: border-box;
                }
                .map-face-slot-img {
                  width: 100%;
                  height: auto;
                }
                .map-face-slot-img-toplevel {
                  width: 100%;
                  height: auto;
                }
                .map-face-slot-dash {
                  width: 50%;
                  height: 50%;
                }
                .quest-interaction-panel-container {
                }
                .quest-interaction-panel-section {
                  margin: 6px;
                  padding: 3px;
                  background: #7d796b33;
                  cursor: pointer;
                }
                .quest-interaction-panel-section:hover {
                  background: #b6af9b33;
                }
                .quest-interaction-panel-body {
                  overflow: hidden;
                }
                .quest-interaction-panel-footer {
                  height: 50px;
                  overflow: hidden;
                }
                .quest-interaction-panel-row {
                  height: 25px;
                  overflow: hidden;
                }
                .quest-interaction-panel-search-object-container {
                  color: white;
                  font-size: 15px;
                  box-sizing: border-box;
                  background: #0000004a;
                  margin: 2px;
                  padding: 3px;
                }
                .quest-interaction-panel-text {
                  top: 3px;
                  position: relative;
                }
                .quest-interaction-panel-icon-img {
                  width: 100%;
                  height: 100%;
                }
                .quest-interaction-panel-pagination-display {
                  padding: 10px;
                }
              </style>
              ${borderChar(1, 'black', ['.quest-interaction-panel-search-object-container'])}
              ${dashRange({ selector: 'map-face-slot-dash', color: `#ffcc00` })}
            `;
          };
        }
        break;

      case 'element-interaction-panel':
        restorePosition = (style = {}) => {
          style.top = `${110}px`;
          style.height = `${100}px`;
          if (Modal.mobileModal()) {
            style.left = `10px`;
            style.width = `${window.innerWidth - 20}px`;
          } else {
            style.left = `${window.innerWidth - 210}px`;
            style.width = `${200}px`;
          }
          return style;
        };
        render = async () => html` <div class="fl element-interaction-panel-preview"></div> `;
        PointAndClickMovementCyberia.TargetEvent[id] = async ({ type, id }) =>
          await this.PanelRender.element({ type, id });
        break;
      case 'map-interaction-panel':
        restorePosition = (style = {}) => {
          style.height = `${300}px`;
          if (Modal.mobileModal()) {
            style.left = `10px`;
            style.width = `${window.innerWidth - 20}px`;
            style.top = `${110}px`;
          } else {
            style.left = `${window.innerWidth - 210}px`;
            style.width = `${200}px`;
            style.top = `${220}px`;
          }
          return style;
        };

        render = async () => html`
          <div class="map-interaction-panel-style"></div>
          <div class="fl">
            <div class="in fll map-interaction-panel-cell map-interaction-panel-cell-0"></div>
            <div class="in fll map-interaction-panel-cell map-interaction-panel-cell-1 hide">
              <img class="abs center interaction-panel-zone-img-background" style="width: 100%; height: auto" />
            </div>
          </div>
        `;
        break;
      case 'quest-interaction-panel':
        restorePosition = (style = {}) => {
          style.top = `${110}px`;
          style.height = `${300}px`;
          if (Modal.mobileModal()) {
            style.left = `10px`;
            style.width = `${window.innerWidth - 20}px`;
          } else {
            style.left = `${10}px`;
            style.width = `${200}px`;
          }
          return style;
        };
        style['min-height'] = `200px`;

        setTimeout(() => {
          const displayArrowCallback = () => {
            if (
              Object.keys(InteractionPanelCyberia.PanelRender.questTokens).length <=
              InteractionPanelCyberia.PanelRender.questTokensPaginationFrom +
                InteractionPanelCyberia.PanelRender.questTokensPaginationRange +
                1
            ) {
              s(`.quest-interaction-panel-footer-btn-arrow-down`).classList.add('gray');
            } else s(`.quest-interaction-panel-footer-btn-arrow-down`).classList.remove('gray');

            if (InteractionPanelCyberia.PanelRender.questTokensPaginationFrom === 0) {
              s(`.quest-interaction-panel-footer-btn-arrow-up`).classList.add('gray');
            } else s(`.quest-interaction-panel-footer-btn-arrow-up`).classList.remove('gray');
            htmls(
              `.quest-interaction-panel-pagination-display`,
              html`
                ${InteractionPanelCyberia.PanelRender.questTokensPaginationFrom + 1} -
                ${InteractionPanelCyberia.PanelRender.questTokensPaginationFrom +
                InteractionPanelCyberia.PanelRender.questTokensPaginationRange +
                1}
                / ${Object.keys(InteractionPanelCyberia.PanelRender.questTokens).length}
              `,
            );
          };
          s(`.quest-interaction-panel-footer-btn-arrow-down`).onclick = () => {
            if (
              InteractionPanelCyberia.PanelRender.questTokensPaginationFrom +
                InteractionPanelCyberia.PanelRender.questTokensPaginationRange >=
              Object.keys(InteractionPanelCyberia.PanelRender.questTokens).length - 1
            )
              return;
            InteractionPanelCyberia.PanelRender.questTokensPaginationFrom++;
            displayArrowCallback();
            InteractionPanelCyberia.PanelRender.callBackQuestPanelRender();
          };
          s(`.quest-interaction-panel-footer-btn-arrow-up`).onclick = () => {
            if (InteractionPanelCyberia.PanelRender.questTokensPaginationFrom === 0) return;
            InteractionPanelCyberia.PanelRender.questTokensPaginationFrom--;
            displayArrowCallback();
            InteractionPanelCyberia.PanelRender.callBackQuestPanelRender();
          };
          InteractionPanelCyberia.PanelRender.restoreQuestPanelRender();
        });

        render = async () => html`
          <div class="in quest-interaction-panel-container quest-interaction-panel-body"></div>
          <div class="in quest-interaction-panel-container quest-interaction-panel-footer">
            <div class="fl quest-interaction-panel-footer-arrows-btn">
              ${await BtnIcon.Render({
                label: html`<img
                  class="abs center quest-interaction-panel-footer-btn-img"
                  src="${getProxyPath()}assets/ui-icons/arrow-up.png"
                />`,
                class: 'in fll quest-interaction-panel-footer-btn quest-interaction-panel-footer-btn-arrow-up',
              })}
              ${await BtnIcon.Render({
                label: html`<img
                  class="abs center quest-interaction-panel-footer-btn-img"
                  src="${getProxyPath()}assets/ui-icons/arrow-down.png"
                />`,
                class: 'in fll quest-interaction-panel-footer-btn quest-interaction-panel-footer-btn-arrow-down',
              })}
              <div class="in flr quest-interaction-panel-pagination-display"></div>
            </div>
          </div>
        `;
        break;
      default:
        break;
    }
    this.Data[id].restorePosition = restorePosition;
    this.Data[id].restorePosition(style);
    const { barConfig } = await Themes[Css.currentTheme]({ iconClass: 'interaction-panel-bar-default-icon' });
    barConfig.buttons.maximize.disabled = true;
    barConfig.buttons.minimize.disabled = true;
    barConfig.buttons.restore.disabled = true;
    barConfig.buttons.menu.disabled = true;
    barConfig.buttons.close.disabled = false;
    let dragDisabled, observer;
    if (id === 'menu-interaction-panel') {
      dragDisabled = true;
      barConfig.buttons.close.disabled = true;
    } else {
      observer = true;
      style.resize = 'auto';
      style.overflow = 'auto';
    }
    if (Modal.mobileModal()) dragDisabled = true;
    await Modal.Render({
      id,
      barConfig,
      html: render,
      titleClass: 'hide',
      style,
      dragDisabled,
      observer,
      btnContainerClass: 'inl',
      btnIconContainerClass: 'abs center',
      zIndexSync: true,
      class: containerClass,
    });

    if (id !== 'menu-interaction-panel') {
      switch (id) {
        case 'element-interaction-panel':
          prepend(
            `.btn-bar-modal-container-${id}`,
            html`
              <div class="abs interaction-panel-container-title">
                <img
                  class="inl interaction-panel-container-title-icon"
                  src="${getProxyPath()}assets/ui-icons/target.png"
                />
                <div class="inl interaction-panel-container-text">Target</div>
              </div>
            `,
          );
          break;
        case 'map-interaction-panel':
          prepend(
            `.btn-bar-modal-container-${id}`,
            html`
              <div class="abs interaction-panel-container-title">
                <img
                  class="inl interaction-panel-container-title-icon"
                  src="${getProxyPath()}assets/ui-icons/map.png"
                />
                <div class="inl interaction-panel-container-text">Map</div>
              </div>
            `,
          );
          break;
        case 'quest-interaction-panel':
          prepend(
            `.btn-bar-modal-container-${id}`,
            html`
              <div class="abs interaction-panel-container-title">
                <img
                  class="inl interaction-panel-container-title-icon"
                  src="${getProxyPath()}assets/ui-icons/quest.png"
                />
                <div class="inl interaction-panel-container-text">Quest</div>
              </div>
            `,
          );
          await this.PanelRender.AllQuest({ type: 'user', id: 'main' });
          break;
        default:
          break;
      }

      Modal.Data[id].onCloseListener[id] = () => {
        const interactionPanelStorage = localStorage.getItem('modal') ? JSON.parse(localStorage.getItem('modal')) : {};
        delete interactionPanelStorage[id];
        localStorage.setItem('modal', JSON.stringify(interactionPanelStorage));
      };

      Modal.Data[id].onDragEndListener[id] = () => {
        const interactionPanelStorage = localStorage.getItem('modal') ? JSON.parse(localStorage.getItem('modal')) : {};
        if (!interactionPanelStorage[id]) interactionPanelStorage[id] = {};
        const transformValues = getTranslate3d(s(`.${id}`)).map((v) => parseFloat(v.split('px')[0]));
        interactionPanelStorage[id].x = transformValues[0];
        interactionPanelStorage[id].y = transformValues[1];
        localStorage.setItem('modal', JSON.stringify(interactionPanelStorage));
      };

      Responsive.Event[id] = () => {
        if (!s(`.${id}`)) return;
        const height = s(`.${id}`).offsetHeight - 30;
        const width = s(`.${id}`).offsetWidth;

        switch (id) {
          case 'quest-interaction-panel':
            s(`.quest-interaction-panel-body`).style.height = `${height - 50}px`;
            break;
          case 'element-interaction-panel':
            s(`.element-interaction-panel-preview`).style.height = `${height}px`;
            break;
          case 'map-interaction-panel':
            if (WorldCyberiaManagement.Data['user'] && WorldCyberiaManagement.Data['user']['main']) {
              if (WorldCyberiaManagement.Data['user']['main'].model.world.type === 'width') {
                if (width / 4 > height) {
                  htmls(
                    `.map-interaction-panel-style`,
                    html`<style>
                      .map-face-slot-container {
                        width: ${height}px;
                        height: ${height}px;
                      }
                      .map-face-slot-center-container {
                        width: ${height * 4}px;
                      }
                    </style>`,
                  );
                } else {
                  htmls(
                    `.map-interaction-panel-style`,
                    html`<style>
                      .map-face-slot-container {
                        width: ${width / 4}px;
                        height: ${width / 4}px;
                      }
                      .map-face-slot-center-container {
                        width: ${width}px;
                      }
                    </style>`,
                  );
                }
              } else {
                if (height / 4 > width) {
                  htmls(
                    `.map-interaction-panel-style`,
                    html`<style>
                      .map-face-slot-container {
                        width: ${width}px;
                        height: ${width}px;
                      }
                      .map-face-slot-center-container {
                        width: ${width / 4}px;
                      }
                    </style>`,
                  );
                } else {
                  htmls(
                    `.map-interaction-panel-style`,
                    html`<style>
                      .map-face-slot-container {
                        width: ${height / 4}px;
                        height: ${height / 4}px;
                      }
                      .map-face-slot-center-container {
                        width: ${height / 4}px;
                      }
                    </style>`,
                  );
                }
              }

              s(`.map-interaction-panel-cell-0`).style.width = `100%`;
              s(`.map-interaction-panel-cell-1`).style.width = `100%`;
              s(`.map-interaction-panel-cell-0`).style.height = `${height}px`;
              s(`.map-interaction-panel-cell-1`).style.height = `${height}px`;
            }
            break;
          default:
            break;
        }
      };

      Responsive.DelayEvent[id] = () => {
        if (
          s(`.${id}`) &&
          (!s(`.${id}`).style.transform || s(`.${id}`).style.transform === 'translate3d(0px, 0px, 0px)')
        ) {
          switch (id) {
            case 'quest-interaction-panel':
              if (s(`.cy-int-btn-quest`)) s(`.cy-int-btn-quest`).click();
              break;
            case 'map-interaction-panel':
              if (s(`.cy-int-btn-map`)) s(`.cy-int-btn-map`).click();
              break;
            case 'element-interaction-panel':
              if (s(`.cy-int-btn-target`)) s(`.cy-int-btn-target`).click();
              break;
          }
        }
      };

      Responsive.Event[id]();

      Modal.Data[id].onObserverListener[id] = ({ width, height }) => {
        const interactionPanelStorage = localStorage.getItem('modal') ? JSON.parse(localStorage.getItem('modal')) : {};
        interactionPanelStorage[id].width = width;
        interactionPanelStorage[id].height = height;
        localStorage.setItem('modal', JSON.stringify(interactionPanelStorage));
        Responsive.Event[id]();
      };

      const interactionPanelStorage = localStorage.getItem('modal') ? JSON.parse(localStorage.getItem('modal')) : {};

      if (!interactionPanelStorage[id]) {
        interactionPanelStorage[id] = {};
        localStorage.setItem('modal', JSON.stringify(interactionPanelStorage));
      }

      if (!Modal.mobileModal()) {
        if (interactionPanelStorage[id].width) {
          s(`.${id}`).style.width = interactionPanelStorage[id].width + 'px';
        }
        if (interactionPanelStorage[id].height) {
          s(`.${id}`).style.height = interactionPanelStorage[id].height + 'px';
        }
        if (interactionPanelStorage[id].x !== undefined && interactionPanelStorage[id].y !== undefined)
          Modal.Data[id].setDragInstance({
            defaultPosition: {
              x: interactionPanelStorage[id].x !== undefined ? interactionPanelStorage[id].x : 0,
              y: interactionPanelStorage[id].y !== undefined ? interactionPanelStorage[id].y : 0,
            },
          });
      }

      if (Modal.mobileModal()) this.mobileSingleInstance(id);
    }

    if (id === 'menu-interaction-panel') {
      if (!Modal.mobileModal()) {
        const interactionPanelStorage = localStorage.getItem('modal') ? JSON.parse(localStorage.getItem('modal')) : {};
        for (const idPanel of Object.keys(interactionPanelStorage)) {
          await InteractionPanelCyberia.Render({ id: idPanel });
        }
      }
      Modal.Data['modal-menu'].onExpandUiListener[id] = (expand) =>
        setTimeout(() => {
          s(`.top-bar`).classList.add('hide');
          s(`.bottom-bar`).classList.add('hide');
          s(`.slide-menu-top-bar`).classList.add('hide');
          if (expand) s(`.menu-interaction-panel`).classList.add('hide');
          else s(`.menu-interaction-panel`).classList.remove('hide');
        });
      setTimeout(() => {
        Modal.Data['modal-menu'].onExpandUiListener[id]();
      });
    }
  },
  mobileSingleInstance: function (id) {
    for (const idModal of ['map-interaction-panel', 'quest-interaction-panel', 'element-interaction-panel']) {
      if (idModal !== id && s(`.${idModal}`)) {
        s(`.btn-close-${idModal}`).click();
      }
    }
  },
};

export { InteractionPanelCyberia };
