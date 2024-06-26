import { BtnIcon } from '../core/BtnIcon.js';
import { getId, objectEquals, range, timer } from '../core/CommonJs.js';
import { Css, Themes, borderChar, dashRange, getTranslate3d, renderBubbleDialog, typeWriter } from '../core/Css.js';
import { LoadingAnimation } from '../core/LoadingAnimation.js';
import { Modal } from '../core/Modal.js';
import { Responsive } from '../core/Responsive.js';
import { append, getProxyPath, htmls, prepend, s } from '../core/VanillaJs.js';
import { BiomeCyberiaScope } from './BiomeCyberia.js';
import { CharacterCyberia } from './CharacterCyberia.js';
import { WorldCyberiaType, isElementCollision } from './CommonCyberia.js';
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
    removeActionPanel: async function (idPanel) {
      if (s(`.${idPanel}`)) s(`.${idPanel}`).remove();
      // delete InteractionPanelCyberia.PanelRender.actionPanelTokens[idPanel];
    },
    action: async function ({ idPanel, type, id, html }) {
      const maxHeight = 80;
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
              ${await renderBubbleDialog({
                id: idPanel,
                html,
              })}
            </div>
          `,
        );
    },
    element: async function ({ type, id }) {
      if (InteractionPanelCyberia.Data['element-interaction-panel']) {
        PixiCyberia.displayPointerArrow({
          oldElement: InteractionPanelCyberia.Data['element-interaction-panel'].element.current,
          newElement: { type, id },
        });
        InteractionPanelCyberia.Data['element-interaction-panel'].element.current = { type, id };
      }
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
            ${WorldCyberiaManagement.Data['user']['main'].model.world.instance[i].type}<br />
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
        if (indexFace === face) s(`.map-face-slot-dash-${index}`).classList.remove('hide');
        else s(`.map-face-slot-dash-${index}`).classList.add('hide');
      }

      Responsive.Event[`map-interaction-panel`]();
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
      'z-index': 3,
      'font-size': '18px',
      overflow: 'hidden',
      resize: 'none',
      color: `#ffcc00`,
      // border: '1px solid red',
      'box-sizing': 'border-box',
    };
    let render = async () => html`${id}`;
    let restorePosition = () => null;
    switch (id) {
      case 'menu-interaction-panel':
        {
          style.left = `0px`;
          style.top = `0px`;
          style.height = `${100}px`;
          style.background = 'none';
          style['z-index'] = 7;
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
                s(`.main-btn-home`).click();
              };
              s(`.cy-int-btn-map`).onclick = async () => {
                if (!s(`.map-interaction-panel`)) {
                  await this.Render({ id: 'map-interaction-panel' });
                  await this.PanelRender.map({ face: ElementsCyberia.Data.user.main.model.world.face });
                } else {
                  this.restorePanel('map-interaction-panel');
                }
              };
              s(`.cy-int-btn-target`).onclick = async () => {
                if (!s(`.element-interaction-panel`)) {
                  await this.Render({ id: 'element-interaction-panel' });
                  await this.PanelRender.element(
                    InteractionPanelCyberia.Data['element-interaction-panel'].element.current,
                  );
                } else {
                  this.restorePanel('element-interaction-panel');
                }
              };
              s(`.cy-int-btn-quest`).onclick = () => {
                if (!s(`.quest-interaction-panel`)) this.Render({ id: 'quest-interaction-panel' });
                else {
                  this.restorePanel('quest-interaction-panel');
                }
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
                    /><img
                      class="abs center img-btn-square-menu img-btn-square-menu-close hide"
                      src="${getProxyPath()}assets/ui-icons/close-yellow.png"
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
                .map-face-slot-dash {
                  width: 50%;
                  height: 50%;
                }
              </style>
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
        PointAndClickMovementCyberia.Event[id] = async ({ x, y }) => {
          let mainUserPanel = false;
          for (const type of ['user', 'bot']) {
            for (const elementId of Object.keys(ElementsCyberia.Data[type])) {
              if (
                isElementCollision({
                  A: { x, y, dim: 1 },
                  B: ElementsCyberia.Data[type][elementId],
                  dimPaintByCell: MatrixCyberia.Data.dimPaintByCell,
                })
              ) {
                if (type === 'user' && elementId === 'main') mainUserPanel = true;
                else {
                  await this.PanelRender.element({ type, id: elementId });
                  QuestManagementCyberia.questClosePanels = QuestManagementCyberia.questClosePanels.filter(
                    (p) => p !== `action-panel-${type}-${elementId}`,
                  );
                  return;
                }
              }
            }
          }
          if (mainUserPanel) await this.PanelRender.element({ type: 'user', id: 'main' });
        };
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

      if (Modal.mobileModal()) {
        for (const idModal of ['map-interaction-panel', 'quest-interaction-panel', 'element-interaction-panel']) {
          if (idModal !== id && s(`.${idModal}`)) {
            s(`.btn-close-${idModal}`).click();
          }
        }
      }
    }

    if (id === 'menu-interaction-panel' && !Modal.mobileModal()) {
      const interactionPanelStorage = localStorage.getItem('modal') ? JSON.parse(localStorage.getItem('modal')) : {};
      for (const idPanel of Object.keys(interactionPanelStorage)) {
        await InteractionPanelCyberia.Render({ id: idPanel });
      }
    }
  },
};

export { InteractionPanelCyberia };
