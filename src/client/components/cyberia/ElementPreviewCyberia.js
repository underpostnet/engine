import { getId, newInstance, range } from '../core/CommonJs.js';
import { AnimatedSprite, Application, Container, Sprite, Texture } from 'pixi.js';
import { htmls, s } from '../core/VanillaJs.js';
import { getProxyPath } from '../core/Router.js';
import { ElementsCyberia } from './ElementsCyberia.js';
import { CyberiaParams, DisplayComponent } from './CommonCyberia.js';
import { PixiCyberia } from './PixiCyberia.js';
import { renderStyleTag } from '../core/Css.js';
import { loggerFactory } from '../core/Logger.js';

const logger = loggerFactory(import.meta);

const ElementPreviewCyberia = {
  Tokens: {},
  Render: async function (options = { renderId: '' }) {
    const selector = `element-preview-${options.renderId}`;
    const appDim = 400;
    setTimeout(async () => {
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
        intervals: [],
      };
      this.Tokens[options.renderId].AppInstance = new Application(this.Tokens[options.renderId].appOption);
    });
    return html`
      ${renderStyleTag('style-element-preview', `.${selector}`, options)}
      <canvas class="in element-preview ${selector}"></canvas>
    `;
  },
  renderElementContainers: {},
  renderElement: async function ({ type, id, renderId, positionId, displayId }) {
    if (!positionId) positionId = '18';
    // for (const interval of Object.keys(this.Tokens[renderId].intervals)) {
    //   clearInterval(this.Tokens[renderId].intervals[interval]);
    // }

    const appDim = this.Tokens[renderId].appDim;

    const dim = appDim / 2;

    const globalContainer = new Container();
    globalContainer.x = 0;
    globalContainer.y = 0;
    globalContainer.width = appDim;
    globalContainer.height = appDim;
    globalContainer.visible = true;
    const containerId = getId(this.renderElementContainers, 'element-cyberia-preview-');

    this.renderElementContainers[containerId] = globalContainer;

    const element = await ElementsCyberia.getElement(type, id, displayId);

    const container = new Container();
    container.x = appDim / 2 - (dim * element.dim) / 2;
    container.y = appDim / 2 - (dim * element.dim) / 2;
    container.width = dim;
    container.height = dim;
    container.visible = true;

    const layers = [];
    for (const _ of range(0, 5)) {
      const layer = new Container();
      layer.x = 0;
      layer.y = 0;
      layer.width = dim;
      layer.height = dim;
      layer.visible = true;
      container.addChild(layer);
      layers.push(layer);
    }

    {
      const background = new Sprite(Texture.WHITE);
      background.tint = `#212121ff`;
      background.x = 0;
      background.y = 0;
      background.width = 3;
      background.height = 3;
      background.visible = true;
      globalContainer.addChild(background);
    }
    {
      const background = new Sprite(Texture.WHITE);
      background.tint = `#212121ff`;
      background.x = appDim - 3;
      background.y = appDim - 3;
      background.width = 3;
      background.height = 3;
      background.visible = true;
      globalContainer.addChild(background);
    }

    for (const itemType of ['skin', 'weapon', 'breastplate']) {
      const componentData = element.components[itemType].find((c) => c.current);

      if (!componentData) continue;

      const { displayId, position, enabled, positions, velFrame, assetFolder, extension } = componentData;

      switch (displayId) {
        default:
          {
            const pixiFrames = [];
            const positionData = positions.find((p) => p.positionId === positionId);
            const sprites = [];
            for (const frame of range(0, positionData.frames - 1)) {
              const src = `${getProxyPath()}assets/${assetFolder}/${displayId}/${positionId}/${frame}.${
                extension ? extension : `png`
              }`;

              pixiFrames.push(Texture.from(src));

              continue;

              const sprite = Sprite.from(src);

              const { indexLayer, componentInstance } = PixiCyberia.formatSpriteComponent({
                dim,
                element,
                displayId,
                positionId,
              });
              for (const attr of Object.keys(componentInstance)) {
                sprite[attr] = componentInstance[attr];
              }

              sprite.visible = frame === 0;
              sprites.push(sprite);
              layers[indexLayer].addChild(sprite);

              if (frame === 0 && positionData.frames > 1) {
                let frameInterval = newInstance(frame);
                this.Tokens[renderId].intervals.push(
                  setInterval(
                    () => {
                      sprites[frameInterval].visible = false;
                      frameInterval++;
                      if (frameInterval === positionData.frames) frameInterval = 0;
                      sprites[frameInterval].visible = true;
                    },
                    velFrame ? velFrame : CyberiaParams.EVENT_CALLBACK_TIME * 10,
                  ),
                );
              }
            }

            // Create an AnimatedSprite (brings back memories from the days of Flash, right ?)
            const anim = new AnimatedSprite(pixiFrames);
            const { indexLayer, componentInstance } = PixiCyberia.formatSpriteComponent({
              displayId,
              positionId,
              dim,
              element,
            });
            for (const attr of Object.keys(componentInstance)) {
              anim[attr] = componentInstance[attr];
            }
            anim.animationSpeed = DisplayComponent.get[displayId]().velFrame; // 0 - 1

            anim.play();

            layers[indexLayer].addChild(anim);
          }

          break;
      }
    }
    globalContainer.addChild(container);
    this.Tokens[renderId].AppInstance.stage.addChild(globalContainer);

    return containerId;
  },
};

export { ElementPreviewCyberia };
