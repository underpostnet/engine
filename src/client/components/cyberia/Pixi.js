import { s, append, getProxyPath } from '../core/VanillaJs.js';
import { randomHexColor, range } from '../core/CommonJs.js';
import { Responsive } from '../core/Responsive.js';

import { Matrix } from './Matrix.js';
import { Elements } from './Elements.js';

import { Application, BaseTexture, Container, Sprite, Texture } from 'pixi.js';

const Pixi = {
  MetaData: {
    dim: 2250,
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
      background: 'gray',
    });
    s('.pixi-container').appendChild(this.App.view);
    s('canvas').classList.add('abs');
    s('canvas').classList.add('pixi-canvas');

    Matrix.Render['matrix-center-square']('.pixi-container');

    Responsive.Event['pixi-container'] = () => {
      const ResponsiveDataAmplitude = Responsive.getResponsiveDataAmplitude({ dimAmplitude: Matrix.Data.dimAmplitude });
      s('.pixi-canvas').style.width = `${ResponsiveDataAmplitude.minValue}px`;
      s('.pixi-canvas').style.height = `${ResponsiveDataAmplitude.minValue}px`;
      // const ResponsiveData = Responsive.getResponsiveData();
      // s('.pixi-container').style.height = `${ResponsiveData.height}px`;
      // s('.pixi-container').style.width = `${ResponsiveData.width}px`;
    };

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

    this.Data.user.container = new Container();
    this.Data.user.container.width = this.MetaData.dim;
    this.Data.user.container.height = this.MetaData.dim;
    this.Data.user.container.x = 0;
    this.Data.user.container.y = 0;
    this.App.stage.addChild(this.Data.user.container);

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
        this.Data.biome[id].tint = randomHexColor();
        this.Data.biome[id].visible = true;
        this.Data.biome.container.addChild(this.Data.biome[id]);
      }),
    );
  },
  setFloor: function (blobUrl) {
    this.Data.biome.container.visible = false;
    this.Data.biome.floorContainer.removeChildren();
    this.Data.biome.floor = Sprite.from(new BaseTexture(blobUrl));
    this.Data.biome.floor.width = this.MetaData.dim;
    this.Data.biome.floor.height = this.MetaData.dim;
    this.Data.biome.floor.x = 0;
    this.Data.biome.floor.y = 0;
    this.Data.biome.floorContainer.addChild(this.Data.biome.floor);
  },
  setBiome: function (BiomeMatrix) {
    this.Data.biome.container.visible = true;
    this.Data.biome.floorContainer.removeChildren();
    const paintDim = Matrix.Data.dim * Matrix.Data.dimPaintByCell;
    range(0, paintDim - 1).map((y) =>
      range(0, paintDim - 1).map((x) => {
        const id = `biome-cell-${x}-${y}`;
        this.Data.biome[id].tint = BiomeMatrix.color[y][x]; // randomHexColor();
      }),
    );
  },
  setComponents: function (options) {
    const { type, id } = options;
    const dim = this.MetaData.dim / Matrix.Data.dim;
    this.Data[type][id] = new Container();
    this.Data[type][id].width = dim * Elements.Data[type][id].dim;
    this.Data[type][id].height = dim * Elements.Data[type][id].dim;
    this.Data[type][id].x = dim * Elements.Data[type][id].x;
    this.Data[type][id].y = dim * Elements.Data[type][id].y;
    this.Data[type][id].components = [];
    this.Data[type].container.addChild(this.Data[type][id]);
    for (const componentType of Object.keys(Elements.Data[type][id].components)) {
      switch (componentType) {
        case 'background':
          for (const component of Elements.Data[type][id].components[componentType]) {
            const { tint, visible } = component.pixi;
            const componentInstance = new Sprite(Texture.WHITE);
            componentInstance.x = 0;
            componentInstance.y = 0;
            componentInstance.width = dim * Elements.Data[type][id].dim;
            componentInstance.height = dim * Elements.Data[type][id].dim;
            componentInstance.tint = tint;
            componentInstance.visible = visible;
            this.Data[type][id].components.push(componentInstance);
            this.Data[type][id].addChild(componentInstance);
          }

          break;

        case 'skin':
          for (const component of Elements.Data[type][id].components[componentType]) {
            const { displayId, position } = component;
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
                const componentInstance = Sprite.from(
                  `${getProxyPath()}assets/skin/${displayId}/${positionId}/${frame}.png`,
                );
                componentInstance.x = 0;
                componentInstance.y = 0;
                componentInstance.width = dim * Elements.Data[type][id].dim;
                componentInstance.height = dim * Elements.Data[type][id].dim;
                componentInstance.visible = position === positionId;
                this.Data[type][id].components.push(componentInstance);
                this.Data[type][id].addChild(componentInstance);
              }
            }
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
