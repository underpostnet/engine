import { getId, range } from '../core/CommonJs.js';
import { Css, Themes, borderChar, renderBubbleDialog, typeWriter } from '../core/Css.js';
import { Modal } from '../core/Modal.js';
import { Responsive } from '../core/Responsive.js';
import { append, htmls, s } from '../core/VanillaJs.js';
import { WorldCyberiaType, isElementCollision } from './CommonCyberia.js';
import { ElementPreviewCyberia } from './ElementPreviewCyberia.js';
import { ElementsCyberia } from './ElementsCyberia.js';
import { MatrixCyberia } from './MatrixCyberia.js';
import { PixiCyberia } from './PixiCyberia.js';
import { PointAndClickMovementCyberia } from './PointAndClickMovementCyberia.js';
import { WorldCyberiaManagement } from './WorldCyberia.js';

const InteractionPanelCyberia = {
  Data: {},
  PanelRender: {
    actionPanelTokens: {},
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
      htmls(
        `.display-current-element`,
        html`<div class="in display-current-element-header">
          <div class="abs center">
            ${type} <br />
            <span style="color: white">${ElementsCyberia.getDisplayName({ type, id })}</span>
          </div>
        </div>`,
      );
      setTimeout(() => {
        if (!InteractionPanelCyberia.Data['element-interaction-panel']) return;
        PixiCyberia.displayPointerArrow({
          oldElement: InteractionPanelCyberia.Data['element-interaction-panel'].element.current,
          newElement: { type, id },
        });
        InteractionPanelCyberia.Data['element-interaction-panel'].element.current = { type, id };
      });
      await ElementPreviewCyberia.renderElement({ type, id, renderId: 'element-interaction-panel' });
    },
    map: function ({ face }) {
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
            ${WorldCyberiaManagement.Data['user']['main'].model.world.instance[i].type}
            <br />
            ${WorldCyberiaType[WorldCyberiaManagement.Data['user']['main'].model.world.type].worldFaces[i]}
          `,
        );
        s(`.map-face-slot-${i}`).style.background = `#80751980`;
      });
      s(`.map-face-slot-${indexFace}`).style.background = `#f5dd11d9`;
    },
  },
  Render: async function (options = { id: 'interaction-panel' }) {
    const id = options?.id ? options.id : getId(this.Data, 'interaction-panel-');
    this.Data[id] = {
      element: {
        current: {
          type: 'user',
          id: 'main',
        },
      },
    };
    const style = {
      height: '40px',
      width: '180px',
      'z-index': 3,
      'font-size': '18px',
      overflow: 'hidden',
      resize: 'none',
      color: `#ffcc00`,
    };
    let render = async () => html`${id}`;
    switch (id) {
      case 'element-interaction-panel':
        style.top = '160px';
        style.height = '200px';
        render = async () =>
          html`<div class="in"><span class="display-current-element" style="${borderChar(2, 'black')}"></span></div>
            <div class="in">${await ElementPreviewCyberia.Render({ renderId: 'element-interaction-panel' })}</div>`;
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
                  return;
                }
              }
            }
          }
          if (mainUserPanel) await this.PanelRender.element({ type: 'user', id: 'main' });
        };
        break;
      case 'map-interaction-panel':
        style.top = `${411 - 40}px`;
        // const displaySymbol = ['༺', 'Ⓐ', '⌘', 'Ξ', '†', '⨁', '◶', '✪', '◍', '⚉', '⨂'];
        render = async () => html`
          <div class="fl">
            ${range(0, 3)
              .map(
                (v, i) =>
                  html` <div class="in fll map-face-slot-container">
                    <div class="abs center map-face-slot map-face-slot-${i}">
                      <div class="abs center map-face-symbol-text map-face-symbol-text-${i}"></div>
                    </div>
                  </div>`,
              )
              .join('')}
          </div>
        `;
        break;
      default:
        break;
    }
    const { barConfig } = await Themes[Css.currentTheme]();
    barConfig.buttons.maximize.disabled = true;
    barConfig.buttons.minimize.disabled = true;
    barConfig.buttons.restore.disabled = true;
    barConfig.buttons.menu.disabled = true;
    barConfig.buttons.close.disabled = true;
    await Modal.Render({
      id,
      barConfig,
      html: render,
      titleClass: 'hide',
      style,
      dragDisabled: true,
    });
    Responsive.Event[id] = () => {
      s(`.${id}`).style.left = `${window.innerWidth - (180 + 10)}px`;
    };
    Responsive.Event[id]();
  },
};

export { InteractionPanelCyberia };
