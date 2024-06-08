import { getId } from '../core/CommonJs.js';
import { Application, Container, Sprite, Texture } from 'pixi.js';
import { htmls, s } from '../core/VanillaJs.js';

const ElementPreviewCyberia = {
  Tokens: {},
  Render: async function (options = { renderId: '' }) {
    const selector = `element-preview-${options.renderId}`;
    const appDim = 400;
    setTimeout(() => {
      this.Tokens[options.renderId] = {
        selector,
        appDim,
        appOption: {
          view: s(`.${selector}`),
          width: appDim,
          height: appDim,
          backgroundAlpha: 0,
        },
        AppInstance: null,
      };
      this.Tokens[options.renderId].AppInstance = new Application(this.Tokens[options.renderId].appOption);
    });
    return html`
      <style>
        .element-preview {
          width: 130px;
          height: 130px;
          margin: auto;
        }
      </style>
      <canvas class="in element-preview ${selector}"></canvas>
    `;
  },
  renderElement: async function ({ type, id, renderId }) {
    this.Tokens[renderId].AppInstance.stage.removeChildren();

    const appDim = this.Tokens[renderId].appDim;

    const dim = appDim / 2;

    const container = new Container();
    container.x = appDim / 2 - dim / 2;
    container.y = appDim / 2 - dim / 2;
    container.width = dim;
    container.height = dim;
    container.visible = true;

    const background = new Sprite(Texture.WHITE);
    background.tint = `#ff0000ff`;
    background.x = 0;
    background.y = 0;
    background.width = dim;
    background.height = dim;
    background.visible = true;

    container.addChild(background);
    this.Tokens[renderId].AppInstance.stage.addChild(container);
  },
};

export { ElementPreviewCyberia };
