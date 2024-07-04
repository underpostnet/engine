import { s, append, getProxyPath } from '../core/VanillaJs.js';
import {
  getDistance,
  getId,
  insertTransitionCoordinates,
  newInstance,
  range,
  round10,
  timer,
} from '../core/CommonJs.js';
import { Responsive } from '../core/Responsive.js';

import { MatrixCyberia } from './MatrixCyberia.js';
import { ElementsCyberia } from './ElementsCyberia.js';

import { AnimatedSprite, Application, BaseTexture, Container, Sprite, Text, TextStyle, Texture, Ticker } from 'pixi.js';
import { WorldCyberiaManagement } from './WorldCyberia.js';
import { SocketIo } from '../core/SocketIo.js';
import { CharacterCyberiaSlotType, CyberiaParams, BehaviorElement } from './CommonCyberia.js';
import { BiomeCyberiaScope } from './BiomeCyberia.js';
import { ElementPreviewCyberia } from './ElementPreviewCyberia.js';

// https://pixijs.com/8.x/examples/sprite/animated-sprite-jet
// https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame
// https://pixijs.download/v6.5.2/docs/PIXI.AnimatedSprite.html

const PixiCyberia = {
  MetaData: {
    dim: 7 * 16 * 3 * 10,
  },
  Data: {},
  Init: async function () {
    Object.keys(ElementsCyberia.Data).map((type) => (this.Data[type] = {}));
    append(
      'body',
      html`
        <style>
          .pixi-container,
          .pixi-container-top-level {
            width: 100%;
            height: 100%;
            top: 0px;
            left: 0px;
            /* overflow: hidden; */
          }
          .pixi-container-top-level {
            transition: 0.4s;
          }
          .adjacent-map {
            /* border: 2px solid #ff0000; */
          }
          .adjacent-map-background {
            width: 100%;
            height: 100%;
            top: 0px;
            left: 0px;
            z-index: 1;
          }
        </style>
        <div class="fix pixi-container">
          <div class="abs adjacent-map adjacent-map-limit-top">
            <div class="abs adjacent-map-background adjacent-map-background-top"></div>
          </div>
          <div class="abs adjacent-map adjacent-map-limit-bottom">
            <div class="abs adjacent-map-background adjacent-map-background-bottom"></div>
          </div>
          <div class="abs adjacent-map adjacent-map-limit-left">
            <div class="abs adjacent-map-background adjacent-map-background-left"></div>
          </div>
          <div class="abs adjacent-map adjacent-map-limit-right">
            <div class="abs adjacent-map-background adjacent-map-background-right"></div>
          </div>

          <div class="abs adjacent-map adjacent-map-limit-top-left"></div>
          <div class="abs adjacent-map adjacent-map-limit-top-right"></div>
          <div class="abs adjacent-map adjacent-map-limit-bottom-left"></div>
          <div class="abs adjacent-map adjacent-map-limit-bottom-right"></div>
        </div>
        <div class="fix pixi-container-top-level" style="opacity: 1"></div>
      `,
    );
    this.App = new Application({
      width: this.MetaData.dim,
      height: this.MetaData.dim,
      background: '#c7c7c7',
    });
    this.App.view.classList.add('abs');
    this.App.view.classList.add('pixi-canvas');
    s('.pixi-container').appendChild(this.App.view);

    this.AppTopLevelColor = new Application({
      width: this.MetaData.dim,
      height: this.MetaData.dim,
      background: undefined,
      backgroundAlpha: 0,
    });
    this.AppTopLevelColor.view.classList.add('abs');
    this.AppTopLevelColor.view.classList.add('pixi-canvas-top-level');

    s('.pixi-container-top-level').appendChild(this.AppTopLevelColor.view);
    s('.pixi-container-top-level').style.zIndex = '2';

    (() => {
      return;
      // top level render test
      const componentInstance = new Sprite(Texture.WHITE);
      componentInstance.x = 100;
      componentInstance.y = 100;
      componentInstance.width = this.MetaData.dim * 0.1;
      componentInstance.height = this.MetaData.dim * 0.1;
      componentInstance.tint = '#ff0000';
      componentInstance.visible = true;
      this.AppTopLevelColor.stage.addChild(componentInstance);
    })();

    // MatrixCyberia.Render['matrix-center-square']('.pixi-container');

    Responsive.Event['pixi-container'] = () => {
      const ResponsiveDataAmplitude = Responsive.getResponsiveDataAmplitude({
        dimAmplitude: MatrixCyberia.Data.dimAmplitude,
      });
      const ResponsiveData = Responsive.getResponsiveData();
      s('.pixi-canvas').style.width = `${ResponsiveDataAmplitude.minValue}px`;
      s('.pixi-canvas').style.height = `${ResponsiveDataAmplitude.minValue}px`;
      s('.pixi-canvas-top-level').style.width = `${ResponsiveDataAmplitude.minValue}px`;
      s('.pixi-canvas-top-level').style.height = `${ResponsiveDataAmplitude.minValue}px`;

      for (const limitType of [
        'top',
        'bottom',
        'left',
        'right',
        'top-left',
        'top-right',
        'bottom-left',
        'bottom-right',
      ]) {
        s(`.adjacent-map-limit-${limitType}`).style.height = `${ResponsiveDataAmplitude.minValue}px`;
        s(`.adjacent-map-limit-${limitType}`).style.width = `${ResponsiveDataAmplitude.minValue}px`;
      }

      s('.main-user-container').style.width = `${ResponsiveData.minValue}px`;
      s('.main-user-container').style.height = `${ResponsiveData.minValue}px`;
      // const ResponsiveData = Responsive.getResponsiveData();
      // s('.pixi-container').style.height = `${ResponsiveData.height}px`;
      // s('.pixi-container').style.width = `${ResponsiveData.width}px`;
    };

    // biome containers
    this.Data.biome['seed-city'] = new Container();
    this.Data.biome['seed-city'].width = this.MetaData.dim;
    this.Data.biome['seed-city'].height = this.MetaData.dim;
    this.Data.biome['seed-city'].x = 0;
    this.Data.biome['seed-city'].y = 0;
    this.App.stage.addChild(this.Data.biome['seed-city']);

    this.Data.biome.floorContainer = new Container();
    this.Data.biome.floorContainer.width = this.MetaData.dim;
    this.Data.biome.floorContainer.height = this.MetaData.dim;
    this.Data.biome.floorContainer.x = 0;
    this.Data.biome.floorContainer.y = 0;
    this.App.stage.addChild(this.Data.biome.floorContainer);

    // elements container
    {
      const channelType = 'elements';
      this.Data[channelType] = {};
      this.Data[channelType].container = new Container();
      this.Data[channelType].container.width = this.MetaData.dim;
      this.Data[channelType].container.height = this.MetaData.dim;
      this.Data[channelType].container.x = 0;
      this.Data[channelType].container.y = 0;
      this.App.stage.addChild(this.Data[channelType].container);

      if (this.zOrderInterval) clearInterval(this.zOrderInterval);
      this.zOrderInterval = setInterval(() => {
        this.Data[channelType].container.children.sort((itemA, itemB) => itemA.zIndex - itemB.zIndex);
      }, CyberiaParams.EVENT_CALLBACK_TIME);
    }

    // channels container

    for (const channelType of Object.keys(ElementsCyberia.Data)) {
      this.Data[channelType].container = new Container();
      this.Data[channelType].container.width = this.MetaData.dim;
      this.Data[channelType].container.height = this.MetaData.dim;
      this.Data[channelType].container.x = 0;
      this.Data[channelType].container.y = 0;
      this.App.stage.addChild(this.Data[channelType].container);
    }

    {
      const id = 'main';
      const type = 'user';
      const dim = this.MetaData.dim / MatrixCyberia.Data.dim;
      const timeInterval = CyberiaParams.EVENT_CALLBACK_TIME * 4;

      let lastX;
      let lastY;

      setInterval(() => {
        if (!this.Data[type] || !this.Data[type][id] || !ElementsCyberia.Data[type] || !ElementsCyberia.Data[type][id])
          return;
        if (lastX === undefined || lastY === undefined) {
          lastX = newInstance(ElementsCyberia.Data[type][id].x);
          lastY = newInstance(ElementsCyberia.Data[type][id].y);
          return;
        }
        const x1 = lastX;
        const y1 = lastY;
        const x2 = ElementsCyberia.Data[type][id].x;
        const y2 = ElementsCyberia.Data[type][id].y;
        const frameFactor = 10;
        let frames = round10(getDistance(x1, y1, x2, y2) * frameFactor);
        if (frames === 0) frames = 1;
        lastX = newInstance(ElementsCyberia.Data[type][id].x);
        lastY = newInstance(ElementsCyberia.Data[type][id].y);
        if (ElementsCyberia.LocalDataScope[type][id].isChangeFace) {
          delete ElementsCyberia.LocalDataScope[type][id].isChangeFace;
          const x = lastX;
          const y = lastY;
          this.Data[type][id].x = dim * x;
          this.Data[type][id].y = dim * y;
          return;
        }
        const path = insertTransitionCoordinates(
          [
            [x1, y1],
            [x2, y2],
          ],
          frames,
        );
        for (const time of range(0, frames - 1)) {
          setTimeout(() => {
            if (this.Data[type] && this.Data[type][id]) {
              const [x, y] = path[time];
              this.Data[type][id].x = dim * x;
              this.Data[type][id].y = dim * y;
              // this.Data[type][id].x = dim * ElementsCyberia.Data[type][id].x;
              // this.Data[type][id].y = dim * ElementsCyberia.Data[type][id].y;
              MatrixCyberia.UpdateAllCamera();
            }
          }, time * (timeInterval / frames));
        }
      }, timeInterval);
    }
    append(
      'body',
      html`<div class="hide">
        ${await ElementPreviewCyberia.Render({
          renderId: 'element-interaction-panel',
          style: { height: '50px', width: '50px' },
        })}
      </div>`,
    );
  },
  currentBiomeCyberiaContainer: String,
  clearBiomeCyberiaContainers: function () {
    this.Data.biome.container.removeChildren();
    this.Data.biome['seed-city'].removeChildren();
    this.Data.biome.floorContainer.removeChildren();
  },
  setFloor: function (blobUrl) {
    this.clearBiomeCyberiaContainers();

    this.currentBiomeCyberiaContainer = 'floorContainer';
    this.Data.biome.floor = Sprite.from(new BaseTexture(blobUrl));
    this.Data.biome.floor.width = this.MetaData.dim;
    this.Data.biome.floor.height = this.MetaData.dim;
    this.Data.biome.floor.x = 0;
    this.Data.biome.floor.y = 0;
    this.Data.biome[this.currentBiomeCyberiaContainer].addChild(this.Data.biome.floor);
  },
  setFloorTopLevelColor: function (blobUrl) {
    this.AppTopLevelColor.stage.removeChildren();
    const componentInstance = Sprite.from(new BaseTexture(blobUrl));
    componentInstance.width = this.MetaData.dim;
    componentInstance.height = this.MetaData.dim;
    componentInstance.x = 0;
    componentInstance.y = 0;
    this.AppTopLevelColor.stage.addChild(componentInstance);
  },
  setBiomeCyberia: function (BiomeCyberiaMatrixCyberia) {
    this.clearBiomeCyberiaContainers();
    if (BiomeCyberiaMatrixCyberia) {
      this.currentBiomeCyberiaContainer = BiomeCyberiaMatrixCyberia?.container
        ? BiomeCyberiaMatrixCyberia.container
        : 'container';

      if (BiomeCyberiaMatrixCyberia.setBiomeCyberia) {
        for (const cellData of BiomeCyberiaMatrixCyberia.setBiomeCyberia) {
          const { src, dim, x, y } = cellData;
          this.Data.biome[src] = Sprite.from(src);
          this.Data.biome[src].width = dim;
          this.Data.biome[src].height = dim;
          this.Data.biome[src].x = x * dim;
          this.Data.biome[src].y = y * dim;
          this.Data.biome[this.currentBiomeCyberiaContainer].addChild(this.Data.biome[src]);
        }
        return;
      }

      const paintDim = MatrixCyberia.Data.dim * MatrixCyberia.Data.dimPaintByCell;
      const dim = this.MetaData.dim / paintDim;
      range(0, paintDim - 1).map((y) =>
        range(0, paintDim - 1).map((x) => {
          const id = `biome-cell-${x}-${y}`;
          this.Data.biome[id] = new Sprite(Texture.WHITE);
          this.Data.biome[id].x = dim * x;
          this.Data.biome[id].y = dim * y;
          this.Data.biome[id].width = dim;
          this.Data.biome[id].height = dim;
          this.Data.biome[id].tint = BiomeCyberiaMatrixCyberia.color[y][x];
          this.Data.biome[this.currentBiomeCyberiaContainer].addChild(this.Data.biome[id]);
        }),
      );
    }
  },
  setZIndex: function ({ type, id, dim }) {
    this.Data[type][id].zIndex = newInstance(
      dim * ElementsCyberia.Data[type][id].y + dim * ElementsCyberia.Data[type][id].dim,
    );
  },
  setComponents: function (options = { type: 'user', id: 'main' }) {
    const { type, id } = options;
    let dim = this.MetaData.dim / MatrixCyberia.Data.dim;
    if (this.Data[type][id]) this.removeElement({ type, id });
    this.Data[type][id] = new Container();
    this.Data[type][id].width = dim * ElementsCyberia.Data[type][id].dim;
    this.Data[type][id].height = dim * ElementsCyberia.Data[type][id].dim;
    this.Data[type][id].x = dim * ElementsCyberia.Data[type][id].x;
    this.Data[type][id].y = dim * ElementsCyberia.Data[type][id].y;
    this.setZIndex({ type, id, dim });
    this.Data[type][id].components = {
      'layer-1': { container: new Container() },
      layer0: { container: new Container() },
    };

    this.Data[type][id].components['layer-1'].container.width = dim * ElementsCyberia.Data[type][id].dim;
    this.Data[type][id].components['layer-1'].container.height = dim * ElementsCyberia.Data[type][id].dim;
    this.Data[type][id].components['layer-1'].container.x = 0;
    this.Data[type][id].components['layer-1'].container.y = 0;
    this.Data[type][id].addChild(this.Data[type][id].components['layer-1'].container);

    this.Data[type][id].components.layer0.container.width = dim * ElementsCyberia.Data[type][id].dim;
    this.Data[type][id].components.layer0.container.height = dim * ElementsCyberia.Data[type][id].dim;
    this.Data[type][id].components.layer0.container.x = 0;
    this.Data[type][id].components.layer0.container.y = 0;
    this.Data[type][id].addChild(this.Data[type][id].components.layer0.container);

    this.Data[type][id].intervals = {};
    let index;
    this.Data['elements'].container.addChild(this.Data[type][id]);
    for (const componentType of Object.keys(ElementsCyberia.Data[type][id].components)) {
      if (!this.Data[type][id].components[componentType]) this.Data[type][id].components[componentType] = {};
      if (!this.Data[type][id].intervals[componentType]) this.Data[type][id].intervals[componentType] = {};
      switch (componentType) {
        case 'background':
          index = 0;
          for (const component of ElementsCyberia.Data[type][id].components[componentType]) {
            const { enabled } = component;
            if (!enabled) {
              index++;
              continue;
            }
            const { tint, visible } = component.pixi;
            const componentInstance = new Sprite(Texture.WHITE);
            componentInstance.x = 0;
            componentInstance.y = 0;
            componentInstance.width = dim * ElementsCyberia.Data[type][id].dim;
            componentInstance.height = dim * ElementsCyberia.Data[type][id].dim;
            componentInstance.tint = tint;
            componentInstance.visible = visible;
            this.Data[type][id].components[componentType][`${index}`] = componentInstance;
            this.Data[type][id].addChild(componentInstance);
            index++;
          }

          break;

        case 'pointerArrow':
          {
            // const displayId = ElementsCyberia.getCurrentSkinDisplayId({ type, id });

            const arrowColor = BehaviorElement[ElementsCyberia.Data[type][id].behavior].color;

            const src = `${getProxyPath()}assets/icons/${arrowColor}-pointer-arrow.png`;
            const componentInstance = Sprite.from(src);
            componentInstance.width = dim * 0.5;
            componentInstance.height = dim * 0.4;
            componentInstance.x = (dim * ElementsCyberia.Data[type][id].dim) / 2 - (dim * 0.5) / 2;

            componentInstance.visible = false;
            this.Data[type][id].components[componentType][`pointer-arrow`] = componentInstance;
            this.Data[type][id].addChild(componentInstance);

            const frames = [-1.8, -2.0];
            let frame = 0;
            const callBack = function () {
              if (!componentInstance.visible) return;
              componentInstance.y = frames[frame] * dim * ElementsCyberia.Data[type][id].dim * 0.5;
              frame++;
              if (frame === frames.length) frame = 0;
            };

            // setTimeout(() => callBack());
            // this.Data[type][id].intervals[componentType][`pointer-arrow`] = {
            //   callBack,
            //   interval: setInterval(callBack, 200),
            // };

            {
              const ticker = new Ticker();

              let deltaSum = 0;
              // delta: ms last frame
              ticker.add((delta) => {
                deltaSum += delta;
                if (deltaSum >= 15) {
                  deltaSum = 0;
                  callBack();
                }
              });

              // Controller Interface:
              // ticker.start();
              // ticker.destroy();
              // ticker.stop();

              this.Data[type][id].components[componentType][`pointer-arrow-ticker`] = ticker;
            }
          }
          break;

        case 'lifeBar':
          const componentInstance = new Sprite(Texture.WHITE);
          componentInstance.x = 0;
          componentInstance.y = -1 * dim * ElementsCyberia.Data[type][id].dim * 0.2;

          // maxLife -> 100%
          // life -> x%

          componentInstance.height = dim * ElementsCyberia.Data[type][id].dim * 0.2;
          componentInstance.tint = '#00e622ff';
          componentInstance.visible = ElementsCyberia.Data[type][id].behavior !== 'item-quest';
          this.Data[type][id].components[componentType] = componentInstance;
          this.updateLifeBarWidth({ type, id, dim });
          this.Data[type][id].addChild(componentInstance);

          break;

        case 'coinIndicator':
          {
            const componentInstance = new Container();
            componentInstance.x = 0;
            componentInstance.y = -1 * dim * ElementsCyberia.Data[type][id].dim * 0.8;
            componentInstance.width = dim * ElementsCyberia.Data[type][id].dim;
            componentInstance.height = dim * ElementsCyberia.Data[type][id].dim * 0.4;
            this.Data[type][id].components[componentType].container = componentInstance;
            this.Data[type][id].addChild(componentInstance);
          }
          {
            const componentInstance = new Sprite(); // Texture.WHITE
            componentInstance.x = 0;
            componentInstance.y = 0;
            componentInstance.width = dim * ElementsCyberia.Data[type][id].dim;
            componentInstance.height = dim * ElementsCyberia.Data[type][id].dim * 0.4;
            // componentInstance.tint = '#000000ff';
            componentInstance.visible = true;
            this.Data[type][id].components[componentType].background = componentInstance;
            this.Data[type][id].components[componentType].container.addChild(componentInstance);
          }
          {
            let lastCoin = newInstance(ElementsCyberia.Data[type][id].coin);
            const callBack = () => {
              if (ElementsCyberia.Data[type][id].coin !== lastCoin) {
                let diffCoin = ElementsCyberia.Data[type][id].coin - lastCoin;
                lastCoin = newInstance(ElementsCyberia.Data[type][id].coin);
                if (diffCoin > 0) diffCoin = '+' + diffCoin;
                diffCoin = '$ ' + diffCoin;
                const componentInstance = new Text(
                  `${diffCoin}`,
                  new TextStyle({
                    fill: diffCoin[0] !== '+' ? '#d4da1e' : '#d4da1e',
                    fontFamily: 'retro-font', // Impact
                    fontSize: 100 * (1 / MatrixCyberia.Data.dimAmplitude),
                    dropShadow: true,
                    dropShadowAngle: 1,
                    dropShadowBlur: 3,
                    dropShadowColor: '#121212',
                    dropShadowDistance: 1,
                  }),
                );
                this.Data[type][id].components[componentType].container.addChild(componentInstance);
                setTimeout(() => {
                  componentInstance.destroy();
                }, 450);
              }
            };
            this.Data[type][id].intervals[componentType]['coinIndicator-interval'] = {
              callBack,
              interval: setInterval(callBack, 500),
            };
          }
          break;
        case 'lifeIndicator':
          {
            const componentInstance = new Container();
            componentInstance.x = 0;
            componentInstance.y = -1 * dim * ElementsCyberia.Data[type][id].dim * 0.8;
            componentInstance.width = dim * ElementsCyberia.Data[type][id].dim;
            componentInstance.height = dim * ElementsCyberia.Data[type][id].dim * 0.4;
            this.Data[type][id].components[componentType].container = componentInstance;
            this.Data[type][id].addChild(componentInstance);
          }
          {
            const componentInstance = new Sprite(); // Texture.WHITE
            componentInstance.x = 0;
            componentInstance.y = 0;
            componentInstance.width = dim * ElementsCyberia.Data[type][id].dim;
            componentInstance.height = dim * ElementsCyberia.Data[type][id].dim * 0.4;
            // componentInstance.tint = '#000000ff';
            componentInstance.visible = true;
            this.Data[type][id].components[componentType].background = componentInstance;
            this.Data[type][id].components[componentType].container.addChild(componentInstance);
          }
          {
            let lastLife = newInstance(ElementsCyberia.Data[type][id].life);
            const callBack = () => {
              if (ElementsCyberia.Data[type][id].life !== lastLife) {
                let diffLife = ElementsCyberia.Data[type][id].life - lastLife;
                lastLife = newInstance(ElementsCyberia.Data[type][id].life);
                if (diffLife > 0) diffLife = '+' + diffLife;
                diffLife = diffLife + ' ♥';
                const componentInstance = new Text(
                  `${diffLife}`,
                  new TextStyle({
                    fill: diffLife[0] !== '+' ? '#FE2712' : '#7FFF00',
                    fontFamily: 'retro-font', // Impact
                    fontSize: 100 * (1 / MatrixCyberia.Data.dimAmplitude),
                    dropShadow: true,
                    dropShadowAngle: 1,
                    dropShadowBlur: 3,
                    dropShadowColor: '#121212',
                    dropShadowDistance: 1,
                  }),
                );
                this.Data[type][id].components[componentType].container.addChild(componentInstance);
                setTimeout(() => {
                  componentInstance.destroy();
                }, 450);
              }
            };
            this.Data[type][id].intervals[componentType]['lifeIndicator-interval'] = {
              callBack,
              interval: setInterval(callBack, 500),
            };
          }
          break;
          break;

        default:
          break;
      }
    }
    this.setDisplayComponent({ type, id });
  },
  setDisplayComponent: function (options = { type: 'user', id: 'main' }) {
    // params
    const { type, id } = options;

    let dim = this.MetaData.dim / MatrixCyberia.Data.dim;

    for (const componentType of Object.keys(CharacterCyberiaSlotType)) {
      if (!this.Data[type][id].components[componentType]) continue;
      // clear
      if (this.Data[type][id].intervals && this.Data[type][id].intervals[componentType]) {
        for (const componentIntervalKey of Object.keys(this.Data[type][id].intervals[componentType])) {
          if (this.Data[type][id].intervals[componentType][componentIntervalKey].callBack)
            clearInterval(this.Data[type][id].intervals[componentType][componentIntervalKey].interval);
          else if (this.Data[type][id].intervals[componentType][componentIntervalKey].pixiFrames) {
            if (this.Data[type][id].intervals[componentType][componentIntervalKey].anim.stop)
              this.Data[type][id].intervals[componentType][componentIntervalKey].anim.stop();
            if (this.Data[type][id].intervals[componentType][componentIntervalKey].anim.destroy)
              this.Data[type][id].intervals[componentType][componentIntervalKey].anim.destroy();
          }
        }
      }

      if (this.Data[type][id].components[componentType]) {
        for (const componentKeyInstance of Object.keys(this.Data[type][id].components[componentType])) {
          if (this.Data[type][id].components[componentType][componentKeyInstance].destroy)
            this.Data[type][id].components[componentType][componentKeyInstance].destroy();
        }
        this.Data[type][id].components[componentType] = {};
      }

      let skinPosition = '08';
      const currentDataSkin = ElementsCyberia.Data[type][id].components['skin'].find((s) => s.enabled);
      if (currentDataSkin) skinPosition = currentDataSkin.position;

      // set skin
      let index = 0;
      for (const component of ElementsCyberia.Data[type][id].components[componentType]) {
        const { displayId, position, enabled, positions, velFrame, assetFolder, extension, current } = component;
        for (const positionData of positions) {
          const { positionId, frames } = positionData;
          const pixiFrames = [];
          for (const frame of range(0, frames - 1)) {
            const src = `${getProxyPath()}assets/${assetFolder}/${displayId}/${positionId}/${frame}.${
              extension ? extension : `png`
            }`;

            pixiFrames.push(Texture.from(src));
            continue;
            const componentInstance = Sprite.from(src);
            let componentContainer;
            const dataSpriteFormat = this.formatSpriteComponent({
              displayId,
              positionId,
              dim,
              element: ElementsCyberia.Data[type][id],
            });
            for (const attr of Object.keys(dataSpriteFormat.componentInstance)) {
              componentInstance[attr] = dataSpriteFormat.componentInstance[attr];
            }
            if (dataSpriteFormat.indexLayer !== 1) componentContainer = `layer${dataSpriteFormat.indexLayer}`;

            componentInstance.visible = position === positionId && frame === 0 && enabled;
            this.Data[type][id].components[componentType][`${src}-${index}`] = componentInstance;

            componentContainer
              ? this.Data[type][id].components[componentContainer].container.addChild(componentInstance)
              : this.Data[type][id].addChild(componentInstance);

            if (frame === 0) {
              let currentFrame = 0;
              let currentSrc;
              let currentIndex = newInstance(index);

              const callBack = () => {
                if (!ElementsCyberia.Data[type][id]) return this.removeElement({ type, id });
                if (!ElementsCyberia.Data[type][id].components[componentType][currentIndex])
                  return clearInterval(this.Data[type][id].intervals[componentType][`${currentSrc}-${currentIndex}`]);
                const position = ElementsCyberia.Data[type][id].components['skin'].find((s) => s.current).position;

                currentSrc = `${getProxyPath()}assets/${assetFolder}/${displayId}/${positionId}/${currentFrame}.${
                  extension ? extension : `png`
                }`;
                this.Data[type][id].components[componentType][`${currentSrc}-${currentIndex}`].visible = false;

                currentFrame++;
                if (currentFrame === frames) currentFrame = 0;

                currentSrc = `${getProxyPath()}assets/${assetFolder}/${displayId}/${positionId}/${currentFrame}.${
                  extension ? extension : `png`
                }`;

                const enabledSkin = ElementsCyberia.Data[type][id].components[componentType].find((s) => s.enabled);
                this.Data[type][id].components[componentType][`${currentSrc}-${currentIndex}`].visible =
                  position === positionId && enabledSkin && enabledSkin.displayId === displayId;
              };
              setTimeout(() => callBack());
              this.Data[type][id].intervals[componentType][`${src}-${currentIndex}`] = {
                callBack,
                interval: setInterval(callBack, velFrame ? velFrame : CyberiaParams.EVENT_CALLBACK_TIME * 10),
              };
            }
          }

          // Create an AnimatedSprite (brings back memories from the days of Flash, right ?)
          const anim = new AnimatedSprite(pixiFrames);
          const dataSpriteFormat = this.formatSpriteComponent({
            displayId,
            positionId,
            dim,
            element: ElementsCyberia.Data[type][id],
          });
          for (const attr of Object.keys(dataSpriteFormat.componentInstance)) {
            anim[attr] = dataSpriteFormat.componentInstance[attr];
          }
          anim.animationSpeed = 0.03; // 0 - 1

          let componentContainer;
          if (dataSpriteFormat.indexLayer !== 1) componentContainer = `layer${dataSpriteFormat.indexLayer}`;
          componentContainer
            ? this.Data[type][id].components[componentContainer].container.addChild(anim)
            : this.Data[type][id].addChild(anim);

          this.Data[type][id].intervals[componentType][`${displayId}-${positionId}`] = {
            pixiFrames,
            anim,
          };

          const currentComponentData = ElementsCyberia.Data[type][id].components[componentType].find((s) => s.enabled);

          if (!currentComponentData || displayId !== currentComponentData.displayId || positionId !== skinPosition)
            anim.visible = false;
          else anim.play();
        }
        index++;
      }
    }
    this.updateLifeBarWidth({ type, id, dim });
  },
  updateLife: function (options) {
    const { type, id } = options;
    let dim = this.MetaData.dim / MatrixCyberia.Data.dim;
    this.Data[type][id].components['lifeBar'].width =
      dim *
      ElementsCyberia.Data[type][id].dim *
      (ElementsCyberia.Data[type][id].life / ElementsCyberia.Data[type][id].maxLife);
  },
  updatePosition: function (options) {
    const { type, id } = options;

    if (type === 'user' && id === 'main') {
      if (ElementsCyberia.Data[type][id].x <= 0) {
        console.warn('limit map position', 'left');
        WorldCyberiaManagement.ChangeFace({ type, id, direction: 'left' });
      }
      if (ElementsCyberia.Data[type][id].y <= 0) {
        console.warn('limit map position', 'top');
        WorldCyberiaManagement.ChangeFace({ type, id, direction: 'top' });
      }
      if (ElementsCyberia.Data[type][id].x >= MatrixCyberia.Data.dim - ElementsCyberia.Data[type][id].dim) {
        console.warn('limit map position', 'right');
        WorldCyberiaManagement.ChangeFace({ type, id, direction: 'right' });
      }
      if (ElementsCyberia.Data[type][id].y >= MatrixCyberia.Data.dim - ElementsCyberia.Data[type][id].dim) {
        console.warn('limit map position', 'bottom');
        WorldCyberiaManagement.ChangeFace({ type, id, direction: 'bottom' });
      }
    }

    if (type === 'user' && id === 'main') {
      this.topLevelCallBack({ type, id });
      SocketIo.Emit(type, {
        status: 'update-position',
        element: { x: ElementsCyberia.Data[type][id].x, y: ElementsCyberia.Data[type][id].y },
      });
    }
    const dim = this.MetaData.dim / MatrixCyberia.Data.dim;
    if (type === 'user' && id === 'main' && !this.positionUpdateId) {
      // this.Data[type][id].x = dim * ElementsCyberia.Data[type][id].x;
      // this.Data[type][id].y = dim * ElementsCyberia.Data[type][id].y;
    } else {
      this.Data[type][id].x = dim * ElementsCyberia.Data[type][id].x;
      this.Data[type][id].y = dim * ElementsCyberia.Data[type][id].y;
    }

    this.setZIndex({ type, id, dim });
  },
  topLevelCallBack: function ({ type, id }) {
    if (!BiomeCyberiaScope.Data[MatrixCyberia.Data.biomeDataId]) return;
    if (
      BiomeCyberiaScope.Data[MatrixCyberia.Data.biomeDataId].topLevelColor &&
      BiomeCyberiaScope.Data[MatrixCyberia.Data.biomeDataId].topLevelColor[
        round10(
          ElementsCyberia.Data[type][id].y * MatrixCyberia.Data.dimPaintByCell +
            (ElementsCyberia.Data[type][id].dim / 2) * MatrixCyberia.Data.dimPaintByCell,
        )
      ] &&
      BiomeCyberiaScope.Data[MatrixCyberia.Data.biomeDataId].topLevelColor[
        round10(
          ElementsCyberia.Data[type][id].y * MatrixCyberia.Data.dimPaintByCell +
            (ElementsCyberia.Data[type][id].dim / 2) * MatrixCyberia.Data.dimPaintByCell,
        )
      ][
        round10(
          ElementsCyberia.Data[type][id].x * MatrixCyberia.Data.dimPaintByCell +
            (ElementsCyberia.Data[type][id].dim / 2) * MatrixCyberia.Data.dimPaintByCell,
        )
      ] &&
      `${s(`.pixi-container-top-level`).style.opacity}` !== `0.3`
    ) {
      s(`.pixi-container-top-level`).style.opacity = '0.3';
    } else if (
      (!BiomeCyberiaScope.Data[MatrixCyberia.Data.biomeDataId].topLevelColor[
        round10(
          ElementsCyberia.Data[type][id].y * MatrixCyberia.Data.dimPaintByCell +
            (ElementsCyberia.Data[type][id].dim / 2) * MatrixCyberia.Data.dimPaintByCell,
        )
      ] ||
        !BiomeCyberiaScope.Data[MatrixCyberia.Data.biomeDataId].topLevelColor[
          round10(
            ElementsCyberia.Data[type][id].y * MatrixCyberia.Data.dimPaintByCell +
              (ElementsCyberia.Data[type][id].dim / 2) * MatrixCyberia.Data.dimPaintByCell,
          )
        ][
          round10(
            ElementsCyberia.Data[type][id].x * MatrixCyberia.Data.dimPaintByCell +
              (ElementsCyberia.Data[type][id].dim / 2) * MatrixCyberia.Data.dimPaintByCell,
          )
        ]) &&
      `${s(`.pixi-container-top-level`).style.opacity}` !== `1`
    ) {
      s(`.pixi-container-top-level`).style.opacity = '1';
    }
  },
  removeElement: function (options = { type: 'user', id: 'main' }) {
    const { type, id } = options;
    if (!this.Data[type][id]) return; // error case -> type: bot, skill, id: main
    for (const componentType of Object.keys(this.Data[type][id].intervals)) {
      for (const keyIntervalInstance of Object.keys(this.Data[type][id].intervals[componentType])) {
        if (this.Data[type][id].intervals[componentType][keyIntervalInstance].interval) {
          if (this.Data[type][id].intervals[componentType][keyIntervalInstance].callBack)
            clearInterval(this.Data[type][id].intervals[componentType][keyIntervalInstance].interval);
          else if (this.Data[type][id].intervals[componentType][keyIntervalInstance].pixiFrames) {
            if (this.Data[type][id].intervals[componentType][keyIntervalInstance].anim.stop)
              this.Data[type][id].intervals[componentType][keyIntervalInstance].anim.stop();
            if (this.Data[type][id].intervals[componentType][keyIntervalInstance].anim.destroy)
              this.Data[type][id].intervals[componentType][keyIntervalInstance].anim.destroy();
          }
        }
      }
    }
    this.Data[type][id].destroy();
    delete this.Data[type][id];
  },
  triggerUpdateDisplay: function (options = { type: 'user', id: 'main' }) {
    const { type, id } = options;

    let skinPosition = '08';
    const currentDataSkin = ElementsCyberia.Data[type][id].components['skin'].find((s) => s.enabled);
    if (currentDataSkin) skinPosition = currentDataSkin.position;

    for (const componentType of Object.keys(CharacterCyberiaSlotType))
      if (this.Data[type][id].intervals[componentType]) {
        const currentComponentData = ElementsCyberia.Data[type][id].components[componentType].find((s) => s.enabled);

        for (const skinInterval of Object.keys(this.Data[type][id].intervals[componentType])) {
          if (this.Data[type][id].intervals[componentType][skinInterval].callBack)
            this.Data[type][id].intervals[componentType][skinInterval].callBack();
          else if (this.Data[type][id].intervals[componentType][skinInterval].pixiFrames) {
            if (
              currentComponentData &&
              skinInterval.match(skinPosition) &&
              skinInterval.match(currentComponentData.displayId)
            ) {
              this.Data[type][id].intervals[componentType][skinInterval].anim.visible = true;
              if (this.Data[type][id].intervals[componentType][skinInterval].anim.play)
                this.Data[type][id].intervals[componentType][skinInterval].anim.play();
            } else {
              this.Data[type][id].intervals[componentType][skinInterval].anim.visible = false;
              if (this.Data[type][id].intervals[componentType][skinInterval].anim.stop)
                this.Data[type][id].intervals[componentType][skinInterval].anim.stop();
            }
          }
        }
      }
  },
  removeAll: function () {
    for (const type of Object.keys(ElementsCyberia.Data)) {
      for (const id of Object.keys(ElementsCyberia.Data[type])) {
        this.removeElement({ type, id });
      }
    }
  },
  markers: {},
  renderMarker: async function ({ x, y }) {
    const id = getId(this.markers, 'marker-');

    this.markers[id] = { x, y };

    const pixiFrames = [];
    for (const frame of range(0, 3).concat(range(3, 0))) {
      const src = `${getProxyPath()}assets/icons/pointer/${frame}.png`;
      pixiFrames.push(Texture.from(src));
    }

    const dim = this.MetaData.dim / MatrixCyberia.Data.dim;
    const container = new AnimatedSprite(pixiFrames);
    container.width = dim * 0.5;
    container.height = dim * 0.5;
    container.x = dim * x;
    container.y = dim * y;
    container.animationSpeed = 0.35;

    this.AppTopLevelColor.stage.addChild(container);
    let repeat = 0;
    container.onFrameChange = (frame) => {
      if (frame === pixiFrames.length - 1) repeat++;
      if (repeat === 3) {
        container.stop();
        container.destroy();
        delete this.markers[id];
      }
    };

    container.play();
  },
  renderText: async function ({ componentType, type, id, dim, color, text, size }) {
    {
      if (this.Data[type][id].components[componentType] && this.Data[type][id].components[componentType].container)
        this.Data[type][id].components[componentType].container.destroy();
      const componentInstance = new Container();

      const dataSpriteFormat = this.formatSpriteComponent({
        displayId: componentType,
        dim,
        element: ElementsCyberia.Data[type][id],
      });
      for (const attr of Object.keys(dataSpriteFormat.componentInstance)) {
        componentInstance[attr] = dataSpriteFormat.componentInstance[attr];
      }

      this.Data[type][id].components[componentType].container = componentInstance;
      this.Data[type][id].addChild(componentInstance);
    }
    {
      setTimeout(() => {
        const componentInstance = new Text(
          text,
          new TextStyle({
            fill: color ? color : '#dcdcdc',
            fontFamily: 'retro-font-sensitive',
            fontSize: 100 * (1 / MatrixCyberia.Data.dimAmplitude) * (size ? size : 1),
            // fontWeight: 'bold',
            dropShadow: true,
            dropShadowAngle: 1,
            dropShadowBlur: 3,
            dropShadowColor: '#121212',
            dropShadowDistance: 1,
          }),
        );
        this.Data[type][id].components[componentType].container.addChild(componentInstance);
      }, 100);
    }
  },
  setUsername: function ({ type, id }) {
    // https://pixijs.io/pixi-text-style/#
    let dim = this.MetaData.dim / MatrixCyberia.Data.dim;
    this.renderText({ componentType: 'username', type, id, dim, text: ElementsCyberia.getDisplayName({ type, id }) });
    this.renderText({
      componentType: 'title',
      type,
      id,
      dim,
      color: '#ffcc00',
      text: ElementsCyberia.getDisplayTitle({ type, id }),
    });
  },
  updateLifeBarWidth: function ({ type, id, dim }) {
    if (this.Data[type][id].components['lifeBar'])
      this.Data[type][id].components['lifeBar'].width =
        dim *
        ElementsCyberia.Data[type][id].dim *
        (ElementsCyberia.Data[type][id].life / ElementsCyberia.Data[type][id].maxLife);
  },
  displayPointerArrow: function ({ oldElement, newElement }) {
    if (oldElement) {
      const { type, id } = oldElement;
      if (this.Data[type][id]) {
        this.Data[type][id].components['pointerArrow']['pointer-arrow'].visible = false;
        this.Data[type][id].components['pointerArrow']['pointer-arrow-ticker'].stop();
      }
    }
    {
      const { type, id } = newElement;
      if (this.Data[type][id]) {
        this.Data[type][id].components['pointerArrow']['pointer-arrow'].visible = true;
        this.Data[type][id].components['pointerArrow']['pointer-arrow-ticker'].start();
      }
    }
  },
  formatSpriteComponent: function ({ displayId, positionId, dim, element }) {
    let indexLayer = 1;
    let componentInstance = {};
    switch (displayId) {
      case 'green-power':
      case 'red-power':
        componentInstance.width = dim * element.dim * 0.5;
        componentInstance.height = dim * element.dim * 0.5;
        componentInstance.x = (dim * element.dim) / 2 - (dim * element.dim * 0.5) / 2;
        componentInstance.y = (dim * element.dim) / 2 - (dim * element.dim * 0.5) / 2;
        break;
      case 'tim-knife':
        componentInstance.width = dim * element.dim;
        componentInstance.height = dim * element.dim;
        componentInstance.x = 0;
        componentInstance.y = dim * element.dim * 0.15;
        break;
      case 'brown-wing':
        switch (positionId) {
          case '08':
          case '18':
            indexLayer = 0;
            componentInstance.width = dim * element.dim + (dim * element.dim) / 2.5;
            componentInstance.height = dim * element.dim;
            componentInstance.x = -1 * ((dim * element.dim) / 5);
            componentInstance.y = 0;
            break;
          case '02':
          case '12':
            componentInstance.width = dim * element.dim + (dim * element.dim) / 2.5;
            componentInstance.height = dim * element.dim;
            componentInstance.x = -1 * ((dim * element.dim) / 5);
            componentInstance.y = 0;
            break;
          case '06':
          case '16':
            componentInstance.width = (dim * element.dim) / 2;
            componentInstance.height = dim * element.dim;
            componentInstance.x = -1 * ((dim * element.dim) / 5);
            componentInstance.y = 0;
            break;
          case '04':
          case '14':
            componentInstance.width = (dim * element.dim) / 2;
            componentInstance.height = dim * element.dim;
            componentInstance.x = dim * element.dim - (dim * element.dim) / 4.5;
            componentInstance.y = 0;
            break;

          default:
            break;
        }
        break;
      case 'username':
        componentInstance.x = 0;
        componentInstance.y = -1 * dim * element.dim * 0.5;
        componentInstance.width = dim * element.dim;
        componentInstance.height = dim * element.dim * 0.4;
        break;
      case 'title':
        componentInstance.x = 0;
        componentInstance.y = -1 * dim * element.dim * 0.75;
        componentInstance.width = dim * element.dim;
        componentInstance.height = dim * element.dim * 0.4;
        break;
      default:
        componentInstance.width = dim * element.dim;
        componentInstance.height = dim * element.dim;
        componentInstance.x = 0;
        componentInstance.y = 0;
        break;
    }
    return { componentInstance, indexLayer };
  },
};

export { PixiCyberia };
