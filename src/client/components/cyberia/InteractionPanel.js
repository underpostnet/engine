import { getId, range } from '../core/CommonJs.js';
import { Css, Themes, borderChar } from '../core/Css.js';
import { Modal } from '../core/Modal.js';
import { Responsive } from '../core/Responsive.js';
import { htmls, s } from '../core/VanillaJs.js';
import { isElementCollision } from './CommonCyberia.js';
import { Elements } from './Elements.js';
import { Matrix } from './Matrix.js';
import { PointAndClickMovement } from './PointAndClickMovement.js';

const InteractionPanel = {
  Data: {},
  PanelRender: {
    element: ({ type, id }) => {
      htmls(
        `.display-current-element`,
        html`${type} <span style="color: white">${Elements.getDisplayName({ type, id })}</span>`,
      );
    },
    map: ({ face }) => {
      htmls('.display-current-face', face);
      range(1, 4).map((i) => (s(`.map-face-slot-${i}`).style.background = `#80751980`));
      s(`.map-face-slot-${face}`).style.background = `#f5dd11d9`;
    },
  },
  Render: async function (options = { id: 'interaction-panel' }) {
    const id = options?.id ? options.id : getId(this.Data, 'interaction-panel-');
    this.Data[id] = {};
    const style = {
      height: '60px',
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
        style.top = '60px';

        render = async () => html`<span class="display-current-element" style="${borderChar(2, 'black')}"></span>`;
        PointAndClickMovement.Event[id] = ({ x, y }) => {
          let mainUserPanel = false;
          for (const type of ['user', 'bot']) {
            for (const elementId of Object.keys(Elements.Data[type])) {
              if (
                isElementCollision({
                  A: { x, y, dim: 1 },
                  B: Elements.Data[type][elementId],
                  dimPaintByCell: Matrix.Data.dimPaintByCell,
                })
              ) {
                if (type === 'user' && elementId === 'main') mainUserPanel = true;
                else {
                  this.PanelRender.element({ type, id: elementId });
                  return;
                }
              }
            }
          }
          if (mainUserPanel) this.PanelRender.element({ type: 'user', id: 'main' });
        };
        break;
      case 'map-interaction-panel':
        style.top = '130px';
        // const displaySymbol = ['༺', 'Ⓐ', '⌘', 'Ξ', '†'];
        render = async () => html`
          <div class="in hide">Face <span class="display-current-face" style="${borderChar(2, 'black')}"></span></div>
          <div class="fl">
            ${[1, 6, 3, 5]
              .map(
                (v, i) =>
                  html` <div class="in fll map-face-slot-container">
                    <div class="abs center map-face-slot map-face-slot-${i + 1} map-face-slot-${v}">
                      <div class="abs center map-face-symbol-text">${v}</div>
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

export { InteractionPanel };
