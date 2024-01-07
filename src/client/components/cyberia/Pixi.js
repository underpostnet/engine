import { s, append, getProxyPath } from '../core/VanillaJs.js';
import { newInstance, range } from '../core/CommonJs.js';
import { Responsive } from '../core/Responsive.js';

import { Matrix } from './Matrix.js';
import { Elements } from './Elements.js';

import { Application, BaseTexture, Container, Sprite, Texture } from 'pixi.js';
import { Event } from './Event.js';

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
          ${css`
            .pixi-container {
              width: 100%;
              height: 100%;
              top: 0px;
              left: 0px;
              overflow: hidden;
            }
          `}
        </style>
        <div class="abs pixi-container"></div>
      `,
    );
    this.App = new Application({
      width: this.MetaData.dim,
      height: this.MetaData.dim,
      background: '#c7c7c7',
    });
    s('.pixi-container').appendChild(this.App.view);
    s('canvas').classList.add('abs');
    s('canvas').classList.add('pixi-canvas');

    // Matrix.Render['matrix-center-square']('.pixi-container');

    Responsive.Event['pixi-container'] = () => {
      const ResponsiveDataAmplitude = Responsive.getResponsiveDataAmplitude({ dimAmplitude: Matrix.Data.dimAmplitude });
      s('.pixi-canvas').style.width = `${ResponsiveDataAmplitude.minValue}px`;
      s('.pixi-canvas').style.height = `${ResponsiveDataAmplitude.minValue}px`;
      s('.main-user-content').style.width = `${
        (ResponsiveDataAmplitude.minValue / Matrix.Data.dim) * Elements.Data.user.main.dim
      }px`;
      s('.main-user-content').style.height = `${
        (ResponsiveDataAmplitude.minValue / Matrix.Data.dim) * Elements.Data.user.main.dim
      }px`;
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

    this.Data.biome.container = new Container();
    this.Data.biome.container.width = this.MetaData.dim;
    this.Data.biome.container.height = this.MetaData.dim;
    this.Data.biome.container.x = 0;
    this.Data.biome.container.y = 0;
    this.App.stage.addChild(this.Data.biome.container);

    this.Data.biome.floorContainer = new Container();
    this.Data.biome.floorContainer.width = this.MetaData.dim;
    this.Data.biome.floorContainer.height = this.MetaData.dim;
    this.Data.biome.floorContainer.x = 0;
    this.Data.biome.floorContainer.y = 0;
    this.App.stage.addChild(this.Data.biome.floorContainer);

    // user container

    this.Data.user.container = new Container();
    this.Data.user.container.width = this.MetaData.dim;
    this.Data.user.container.height = this.MetaData.dim;
    this.Data.user.container.x = 0;
    this.Data.user.container.y = 0;
    this.App.stage.addChild(this.Data.user.container);
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
  setComponents: function (options) {
    const { type, id } = options;
    const dim = this.MetaData.dim / Matrix.Data.dim;
    this.Data[type][id] = new Container();
    this.Data[type][id].width = dim * Elements.Data[type][id].dim;
    this.Data[type][id].height = dim * Elements.Data[type][id].dim;
    this.Data[type][id].x = dim * Elements.Data[type][id].x;
    this.Data[type][id].y = dim * Elements.Data[type][id].y;
    this.Data[type][id].components = {};
    this.Data[type][id].intervals = {};
    let index;
    this.Data[type].container.addChild(this.Data[type][id]);
    for (const componentType of Object.keys(Elements.Data[type][id].components)) {
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
            if (!this.Data[type][id].components[componentType]) this.Data[type][id].components[componentType] = {};
            this.Data[type][id].components[componentType][`${index}`] = componentInstance;
            this.Data[type][id].addChild(componentInstance);
            index++;
          }

          break;

        case 'skin':
          index = 0;
          for (const component of Elements.Data[type][id].components[componentType]) {
            const { displayId, position, enabled } = component;
            if (!enabled) {
              index++;
              continue;
            }
            for (const positionData of [
              { positionId: '02', frames: 1 },
              { positionId: '04', frames: 1 },
              { positionId: '06', frames: 1 },
              { positionId: '08', frames: 1 },
              { positionId: '12', frames: 2 },
              { positionId: '14', frames: 2 },
              { positionId: '16', frames: 2 },
              { positionId: '18', frames: 2 },
            ]) {
              const { positionId, frames } = positionData;
              for (const frame of range(0, frames - 1)) {
                const src = `${getProxyPath()}assets/skin/${displayId}/${positionId}/${frame}.png`;
                if (id === 'main')
                  append(
                    '.main-user-content',
                    html`
                      <img
                        src="${src}"
                        class="abs main-user-avatar-img skin-${id}-${displayId}-${positionId}-${frame}"
                        style="display: ${position === positionId && frame === 0 ? 'block' : 'none'};"
                      />
                    `,
                  );
                const componentInstance = Sprite.from(src);
                componentInstance.x = 0;
                componentInstance.y = 0;
                componentInstance.width = dim * Elements.Data[type][id].dim;
                componentInstance.height = dim * Elements.Data[type][id].dim;
                componentInstance.visible = id === 'main' ? false : position === positionId && frame === 0;
                if (!this.Data[type][id].components[componentType]) this.Data[type][id].components[componentType] = {};
                this.Data[type][id].components[componentType][`${src}-${index}`] = componentInstance;
                this.Data[type][id].addChild(componentInstance);
                if (frame === 0) {
                  let currentFrame = 0;
                  let currentSrc;
                  let currentIndex = newInstance(index);
                  if (!this.Data[type][id].intervals[componentType]) this.Data[type][id].intervals[componentType] = {};

                  const callBack = () => {
                    const { position } = Elements.Data[type][id].components[componentType][currentIndex];

                    currentSrc = `${getProxyPath()}assets/skin/${displayId}/${positionId}/${currentFrame}.png`;
                    this.Data[type][id].components[componentType][`${currentSrc}-${currentIndex}`].visible = false;
                    if (id === 'main')
                      s(`.skin-${id}-${displayId}-${positionId}-${currentFrame}`).style.display = 'none';

                    currentFrame++;
                    if (currentFrame === frames) currentFrame = 0;

                    currentSrc = `${getProxyPath()}assets/skin/${displayId}/${positionId}/${currentFrame}.png`;
                    this.Data[type][id].components[componentType][`${currentSrc}-${currentIndex}`].visible =
                      id === 'main' ? false : position === positionId ? true : false;

                    if (id === 'main')
                      s(`.skin-${id}-${displayId}-${positionId}-${currentFrame}`).style.display =
                        position === positionId ? 'block' : 'none';
                  };

                  this.Data[type][id].intervals[componentType][`${src}-${currentIndex}`] = {
                    callBack,
                    interval: setInterval(callBack, Event.Data.globalTimeInterval * 10),
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
  updatePosition: function (options) {
    const dim = this.MetaData.dim / Matrix.Data.dim;
    const { type, id } = options;
    this.Data[type][id].x = dim * Elements.Data[type][id].x;
    this.Data[type][id].y = dim * Elements.Data[type][id].y;
  },
};

export { Pixi };
