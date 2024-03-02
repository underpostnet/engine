import { s, append, getProxyPath } from '../core/VanillaJs.js';
import { getId, newInstance, range, timer } from '../core/CommonJs.js';
import { Responsive } from '../core/Responsive.js';

import { Matrix } from './Matrix.js';
import { Elements } from './Elements.js';

import { Application, BaseTexture, Container, Sprite, Text, Texture } from 'pixi.js';
import { WorldManagement } from './World.js';
import { borderChar } from '../core/Css.js';
import { SocketIo } from '../core/SocketIo.js';
import { CyberiaParams } from './CommonCyberia.js';
import { MainUser } from './MainUser.js';

const Pixi = {
  MetaData: {
    dim: 7 * 16 * 3 * 10,
  },
  Data: {},
  Init: function () {
    Object.keys(Elements.Data).map((type) => (this.Data[type] = {}));
    append(
      'body',
      html`
        <style>
          .pixi-container {
            width: 100%;
            height: 100%;
            top: 0px;
            left: 0px;
            /* overflow: hidden; */
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
    append('.pixi-container', html` <div class="abs display-current-face" style="${borderChar(2, 'black')}"></div> `);

    // Matrix.Render['matrix-center-square']('.pixi-container');

    Responsive.Event['pixi-container'] = () => {
      const ResponsiveDataAmplitude = Responsive.getResponsiveDataAmplitude({ dimAmplitude: Matrix.Data.dimAmplitude });
      const ResponsiveData = Responsive.getResponsiveData();
      s('.pixi-canvas').style.width = `${ResponsiveDataAmplitude.minValue}px`;
      s('.pixi-canvas').style.height = `${ResponsiveDataAmplitude.minValue}px`;

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

    // channels container

    for (const channelType of Object.keys(Elements.Data)) {
      this.Data[channelType].container = new Container();
      this.Data[channelType].container.width = this.MetaData.dim;
      this.Data[channelType].container.height = this.MetaData.dim;
      this.Data[channelType].container.x = 0;
      this.Data[channelType].container.y = 0;
      this.App.stage.addChild(this.Data[channelType].container);
    }
  },
  currentBiomeContainer: String,
  clearBiomeContainers: function () {
    this.Data.biome.container.removeChildren();
    this.Data.biome['seed-city'].removeChildren();
    this.Data.biome.floorContainer.removeChildren();
  },
  setFloor: function (blobUrl) {
    this.clearBiomeContainers();

    this.currentBiomeContainer = 'floorContainer';
    this.Data.biome.floor = Sprite.from(new BaseTexture(blobUrl));
    this.Data.biome.floor.width = this.MetaData.dim;
    this.Data.biome.floor.height = this.MetaData.dim;
    this.Data.biome.floor.x = 0;
    this.Data.biome.floor.y = 0;
    this.Data.biome[this.currentBiomeContainer].addChild(this.Data.biome.floor);
  },
  setBiome: function (BiomeMatrix) {
    this.clearBiomeContainers();
    if (BiomeMatrix) {
      this.currentBiomeContainer = BiomeMatrix?.container ? BiomeMatrix.container : 'container';

      if (BiomeMatrix.setBiome) {
        for (const cellData of BiomeMatrix.setBiome) {
          const { src, dim, x, y } = cellData;
          this.Data.biome[src] = Sprite.from(src);
          this.Data.biome[src].width = dim;
          this.Data.biome[src].height = dim;
          this.Data.biome[src].x = x * dim;
          this.Data.biome[src].y = y * dim;
          this.Data.biome[this.currentBiomeContainer].addChild(this.Data.biome[src]);
        }
        return;
      }

      const paintDim = Matrix.Data.dim * Matrix.Data.dimPaintByCell;
      const dim = this.MetaData.dim / paintDim;
      range(0, paintDim - 1).map((y) =>
        range(0, paintDim - 1).map((x) => {
          const id = `biome-cell-${x}-${y}`;
          this.Data.biome[id] = new Sprite(Texture.WHITE);
          this.Data.biome[id].x = dim * x;
          this.Data.biome[id].y = dim * y;
          this.Data.biome[id].width = dim;
          this.Data.biome[id].height = dim;
          this.Data.biome[id].tint = BiomeMatrix.color[y][x];
          this.Data.biome[this.currentBiomeContainer].addChild(this.Data.biome[id]);
        }),
      );
    }
  },
  setComponents: function (options = { type: 'user', id: 'main' }) {
    const { type, id } = options;
    let dim = this.MetaData.dim / Matrix.Data.dim;
    if (type === 'user' && id === 'main') dim = dim * Matrix.Data.dimAmplitude;
    this.Data[type][id] = new Container();
    this.Data[type][id].width = dim * Elements.Data[type][id].dim;
    this.Data[type][id].height = dim * Elements.Data[type][id].dim;
    this.Data[type][id].x = dim * Elements.Data[type][id].x;
    this.Data[type][id].y = dim * Elements.Data[type][id].y;
    this.Data[type][id].components = {};
    this.Data[type][id].intervals = {};
    let index;
    if (type === 'user' && id === 'main') {
      this.Data[type][id].x = this.MetaData.dim / 2 - dim * Elements.Data[type][id].x * 0.5;
      this.Data[type][id].y = this.MetaData.dim / 2 - dim * Elements.Data[type][id].y * 0.5;
      MainUser.PixiMainUser.stage.addChild(this.Data[type][id]);
    } else this.Data[type].container.addChild(this.Data[type][id]);
    for (const componentType of Object.keys(Elements.Data[type][id].components)) {
      if (!this.Data[type][id].components[componentType]) this.Data[type][id].components[componentType] = {};
      switch (componentType) {
        case 'background':
          index = 0;
          for (const component of Elements.Data[type][id].components[componentType]) {
            const { enabled } = component;
            if (!enabled) {
              index++;
              continue;
            }
            const { tint, visible } = component.pixi;
            const componentInstance = new Sprite(Texture.WHITE);
            componentInstance.x = 0;
            componentInstance.y = 0;
            componentInstance.width = dim * Elements.Data[type][id].dim;
            componentInstance.height = dim * Elements.Data[type][id].dim;
            componentInstance.tint = tint;
            componentInstance.visible = visible;
            this.Data[type][id].components[componentType][`${index}`] = componentInstance;
            this.Data[type][id].addChild(componentInstance);
            index++;
          }

          break;

        case 'lifeBar':
          const componentInstance = new Sprite(Texture.WHITE);
          componentInstance.x = 0;
          componentInstance.y = -1 * dim * Elements.Data[type][id].dim * 0.2;

          // maxLife -> 100%
          // life -> x%
          componentInstance.width =
            dim * Elements.Data[type][id].dim * (Elements.Data[type][id].life / Elements.Data[type][id].maxLife);

          componentInstance.height = dim * Elements.Data[type][id].dim * 0.2;
          componentInstance.tint = '#00e622ff';
          componentInstance.visible = true;
          this.Data[type][id].components[componentType] = componentInstance;
          this.Data[type][id].addChild(componentInstance);

          break;

        case 'coinIndicator':
          {
            const componentInstance = new Container();
            componentInstance.x = 0;
            componentInstance.y = -1 * dim * Elements.Data[type][id].dim * 0.6;
            componentInstance.width = dim * Elements.Data[type][id].dim;
            componentInstance.height = dim * Elements.Data[type][id].dim * 0.4;
            this.Data[type][id].components[componentType].container = componentInstance;
            this.Data[type][id].addChild(componentInstance);
          }
          {
            const componentInstance = new Sprite(); // Texture.WHITE
            componentInstance.x = 0;
            componentInstance.y = 0;
            componentInstance.width = dim * Elements.Data[type][id].dim;
            componentInstance.height = dim * Elements.Data[type][id].dim * 0.4;
            // componentInstance.tint = '#000000ff';
            componentInstance.visible = true;
            this.Data[type][id].components[componentType].background = componentInstance;
            this.Data[type][id].components[componentType].container.addChild(componentInstance);
          }
          {
            let lastCoin = newInstance(Elements.Data[type][id].coin);
            const callBack = () => {
              if (Elements.Data[type][id].coin !== lastCoin) {
                let diffCoin = Elements.Data[type][id].coin - lastCoin;
                lastCoin = newInstance(Elements.Data[type][id].coin);
                if (diffCoin > 0) diffCoin = '+' + diffCoin;
                diffCoin = '$ ' + diffCoin;
                const componentInstance = new Text(`${diffCoin}`, {
                  fill: diffCoin[0] !== '+' ? '#d4da1e' : '#d4da1e',
                  fontFamily: 'retro-font', // Impact
                  fontSize: 100 * (type === 'user' && id === 'main' ? 1 : 1 / Matrix.Data.dimAmplitude),
                });
                this.Data[type][id].components[componentType].container.addChild(componentInstance);
                setTimeout(() => {
                  componentInstance.destroy();
                }, 450);
              }
            };
            if (!this.Data[type][id].intervals[componentType]) this.Data[type][id].intervals[componentType] = {};
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
            componentInstance.y = -1 * dim * Elements.Data[type][id].dim * 0.6;
            componentInstance.width = dim * Elements.Data[type][id].dim;
            componentInstance.height = dim * Elements.Data[type][id].dim * 0.4;
            this.Data[type][id].components[componentType].container = componentInstance;
            this.Data[type][id].addChild(componentInstance);
          }
          {
            const componentInstance = new Sprite(); // Texture.WHITE
            componentInstance.x = 0;
            componentInstance.y = 0;
            componentInstance.width = dim * Elements.Data[type][id].dim;
            componentInstance.height = dim * Elements.Data[type][id].dim * 0.4;
            // componentInstance.tint = '#000000ff';
            componentInstance.visible = true;
            this.Data[type][id].components[componentType].background = componentInstance;
            this.Data[type][id].components[componentType].container.addChild(componentInstance);
          }
          {
            let lastLife = newInstance(Elements.Data[type][id].life);
            const callBack = () => {
              if (Elements.Data[type][id].life !== lastLife) {
                let diffLife = Elements.Data[type][id].life - lastLife;
                lastLife = newInstance(Elements.Data[type][id].life);
                if (diffLife > 0) diffLife = '+' + diffLife;
                diffLife = diffLife + ' ♥';
                const componentInstance = new Text(`${diffLife}`, {
                  fill: diffLife[0] !== '+' ? '#FE2712' : '#7FFF00',
                  fontFamily: 'retro-font', // Impact
                  fontSize: 100 * (type === 'user' && id === 'main' ? 1 : 1 / Matrix.Data.dimAmplitude),
                });
                this.Data[type][id].components[componentType].container.addChild(componentInstance);
                setTimeout(() => {
                  componentInstance.destroy();
                }, 450);
              }
            };
            if (!this.Data[type][id].intervals[componentType]) this.Data[type][id].intervals[componentType] = {};
            this.Data[type][id].intervals[componentType]['lifeIndicator-interval'] = {
              callBack,
              interval: setInterval(callBack, 500),
            };
          }
          break;

        case 'skill':
        case 'skin':
          index = 0;
          for (const component of Elements.Data[type][id].components[componentType]) {
            const { displayId, position, enabled, positions, velFrame } = component;
            for (const positionData of positions) {
              const { positionId, frames } = positionData;
              for (const frame of range(0, frames - 1)) {
                const src = `${getProxyPath()}assets/${componentType}/${displayId}/${positionId}/${frame}.png`;
                const componentInstance = Sprite.from(src);
                switch (displayId) {
                  case 'green-power':
                  case 'red-power':
                    componentInstance.width = dim * Elements.Data[type][id].dim * 0.5;
                    componentInstance.height = dim * Elements.Data[type][id].dim * 0.5;
                    componentInstance.x =
                      (dim * Elements.Data[type][id].dim) / 2 - (dim * Elements.Data[type][id].dim * 0.5) / 2;
                    componentInstance.y =
                      (dim * Elements.Data[type][id].dim) / 2 - (dim * Elements.Data[type][id].dim * 0.5) / 2;
                    break;

                  default:
                    componentInstance.width = dim * Elements.Data[type][id].dim;
                    componentInstance.height = dim * Elements.Data[type][id].dim;
                    componentInstance.x = 0;
                    componentInstance.y = 0;
                    break;
                }
                componentInstance.visible = position === positionId && frame === 0 && enabled;
                this.Data[type][id].components[componentType][`${src}-${index}`] = componentInstance;
                this.Data[type][id].addChild(componentInstance);
                if (frame === 0) {
                  let currentFrame = 0;
                  let currentSrc;
                  let currentIndex = newInstance(index);
                  if (!this.Data[type][id].intervals[componentType]) this.Data[type][id].intervals[componentType] = {};

                  const callBack = () => {
                    if (!Elements.Data[type][id]) return this.removeElement({ type, id });
                    const { position } = Elements.Data[type][id].components[componentType][currentIndex];

                    currentSrc = `${getProxyPath()}assets/${componentType}/${displayId}/${positionId}/${currentFrame}.png`;
                    this.Data[type][id].components[componentType][`${currentSrc}-${currentIndex}`].visible = false;

                    currentFrame++;
                    if (currentFrame === frames) currentFrame = 0;

                    currentSrc = `${getProxyPath()}assets/${componentType}/${displayId}/${positionId}/${currentFrame}.png`;

                    const enabledSkin = Elements.Data[type][id].components[componentType].find((s) => s.enabled);
                    this.Data[type][id].components[componentType][`${currentSrc}-${currentIndex}`].visible =
                      position === positionId && enabledSkin && enabledSkin.displayId === displayId;
                  };
                  this.Data[type][id].intervals[componentType][`${src}-${currentIndex}`] = {
                    callBack,
                    interval: setInterval(
                      callBack,
                      velFrame ? velFrame : CyberiaParams.CYBERIA_EVENT_CALLBACK_TIME * 10,
                    ),
                  };
                }
              }
            }
            index++;
          }
          break;

        default:
          break;
      }
    }
  },
  updateLife: function (options) {
    const { type, id } = options;
    let dim = this.MetaData.dim / Matrix.Data.dim;
    if (type === 'user' && id === 'main') dim = dim * Matrix.Data.dimAmplitude;
    this.Data[type][id].components['lifeBar'].width =
      dim * Elements.Data[type][id].dim * (Elements.Data[type][id].life / Elements.Data[type][id].maxLife);
  },
  updatePosition: function (options) {
    const { type, id } = options;

    if (type === 'user' && id === 'main') {
      if (Elements.Data[type][id].x <= 0) {
        console.warn('limit map position', 'left');
        WorldManagement.ChangeFace({ type, id, direction: 'left' });
      }
      if (Elements.Data[type][id].y <= 0) {
        console.warn('limit map position', 'top');
        WorldManagement.ChangeFace({ type, id, direction: 'top' });
      }
      if (Elements.Data[type][id].x >= Matrix.Data.dim - Elements.Data[type][id].dim) {
        console.warn('limit map position', 'right');
        WorldManagement.ChangeFace({ type, id, direction: 'right' });
      }
      if (Elements.Data[type][id].y >= Matrix.Data.dim - Elements.Data[type][id].dim) {
        console.warn('limit map position', 'bottom');
        WorldManagement.ChangeFace({ type, id, direction: 'bottom' });
      }
    }

    if (type === 'user' && id === 'main') {
      SocketIo.Emit(type, {
        status: 'update-position',
        element: { x: Elements.Data[type][id].x, y: Elements.Data[type][id].y },
      });
    } else {
      const dim = this.MetaData.dim / Matrix.Data.dim;
      this.Data[type][id].x = dim * Elements.Data[type][id].x;
      this.Data[type][id].y = dim * Elements.Data[type][id].y;
    }
  },
  removeElement: function (options = { type: 'user', id: 'main' }) {
    const { type, id } = options;
    if (!this.Data[type][id]) return; // error case -> type: bot, skill, id: main
    for (const componentType of Object.keys(this.Data[type][id].intervals)) {
      for (const keyIntervalInstance of Object.keys(this.Data[type][id].intervals[componentType])) {
        if (this.Data[type][id].intervals[componentType][keyIntervalInstance].interval)
          clearInterval(this.Data[type][id].intervals[componentType][keyIntervalInstance].interval);
      }
    }
    this.Data[type][id].destroy();
    delete this.Data[type][id];
  },
  triggerUpdateSkinPosition: function (options = { type: 'user', id: 'main' }) {
    const { type, id } = options;
    for (const skinInterval of Object.keys(this.Data[type][id].intervals['skin']))
      this.Data[type][id].intervals['skin'][skinInterval].callBack();
  },
  removeAll: function () {
    for (const type of Object.keys(Elements.Data)) {
      for (const id of Object.keys(Elements.Data[type])) {
        this.removeElement({ type, id });
      }
    }
  },
  markers: {},
  renderMarker: async function ({ x, y }) {
    const id = getId(this.markers, 'marker-');

    this.markers[id] = { x, y };

    const dim = this.MetaData.dim / Matrix.Data.dim;
    const container = new Container();
    container.width = dim;
    container.height = dim;
    container.x = dim * x;
    container.y = dim * y;

    const sprites = {};

    for (const frame of range(0, 3)) {
      const src = `${getProxyPath()}assets/icons/pointer/${frame}.png`;
      sprites[frame] = Sprite.from(src);
      sprites[frame].width = dim / 2;
      sprites[frame].height = dim / 2;
      sprites[frame].x = 0;
      sprites[frame].y = 0;
      sprites[frame].visible = frame === 0;
      container.addChild(sprites[frame]);
    }
    this.App.stage.addChild(container);

    await timer(30);
    sprites[0].visible = false;
    sprites[1].visible = true;
    await timer(30);
    sprites[1].visible = false;
    sprites[2].visible = true;
    await timer(30);
    sprites[2].visible = false;
    sprites[3].visible = true;
    await timer(750);
    sprites[3].visible = false;
    sprites[2].visible = true;
    await timer(10);
    sprites[3].visible = false;
    sprites[2].visible = true;
    await timer(10);
    sprites[2].visible = false;
    sprites[1].visible = true;
    await timer(10);
    sprites[1].visible = false;
    sprites[0].visible = true;
    await timer(10);

    container.destroy();
    delete this.markers[id];
  },
};

export { Pixi };
