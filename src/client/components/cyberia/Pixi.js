import { s, append, getProxyPath } from '../core/VanillaJs.js';
import { JSONmatrix, amplifyMatrix, mergeMatrices, newInstance, randomHexColor, range } from '../core/CommonJs.js';
import { Responsive } from '../core/Responsive.js';

import { Matrix } from './Matrix.js';
import { Elements } from './Elements.js';

import { Application, BaseTexture, Container, Sprite, Texture } from 'pixi.js';
import { Event } from './Event.js';
import { CoreService } from '../../services/core/core.service.js';
import { BiomeEngine } from './Biome.js';

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
      background: 'gray',
    });
    s('.pixi-container').appendChild(this.App.view);
    s('canvas').classList.add('abs');
    s('canvas').classList.add('pixi-canvas');

    // Matrix.Render['matrix-center-square']('.pixi-container');

    Responsive.Event['pixi-container'] = () => {
      const ResponsiveDataAmplitude = Responsive.getResponsiveDataAmplitude({ dimAmplitude: Matrix.Data.dimAmplitude });
      s('.pixi-canvas').style.width = `${ResponsiveDataAmplitude.minValue}px`;
      s('.pixi-canvas').style.height = `${ResponsiveDataAmplitude.minValue}px`;
      // const ResponsiveData = Responsive.getResponsiveData();
      // s('.pixi-container').style.height = `${ResponsiveData.height}px`;
      // s('.pixi-container').style.width = `${ResponsiveData.width}px`;
    };

    this.Data.biome.seedCityContainer = new Container();
    this.Data.biome.seedCityContainer.width = this.MetaData.dim;
    this.Data.biome.seedCityContainer.height = this.MetaData.dim;
    this.Data.biome.seedCityContainer.x = 0;
    this.Data.biome.seedCityContainer.y = 0;
    this.App.stage.addChild(this.Data.biome.seedCityContainer);

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
        // this.Data.biome[id].tint = randomHexColor();
        this.Data.biome[id].visible = false;
        this.Data.biome.container.addChild(this.Data.biome[id]);
      }),
    );

    return this.loadSeedCity();
  },
  loadSeedCity: async function () {
    const mapData = [
      {
        name_map: '3hnp',
        position: [4, 3],
      },
      {
        name_map: '74fp9',
        position: [2, 3],
      },
      {
        name_map: 'a225',
        position: [3, 0],
      },
      {
        name_map: 'b43de',
        position: [1, 3],
      },
      {
        name_map: 'b4db',
        position: [-1, 1],
      },
      {
        name_map: 'buro',
        position: [0, 0],
      },
      {
        name_map: 'bx-park',
        position: [0, 3],
      },
      {
        name_map: 'cd89',
        position: [2, -1],
      },
      {
        name_map: 'cxfr',
        position: [-1, -1],
      },
      {
        name_map: 'cy-stadium',
        position: [3, -1],
      },
      {
        name_map: 'cy03-station',
        position: [1, 0],
      },
      {
        name_map: 'df23',
        position: [4, 2],
      },
      {
        name_map: 'ecc0',
        position: [-1, 0],
      },
      {
        name_map: 'fe17',
        position: [-1, 2],
      },
      {
        name_map: 'gyr8',
        position: [3, 2],
      },
      {
        name_map: 'hu6r',
        position: [1, -1],
      },
      {
        name_map: 'jf2b',
        position: [0, -1],
      },
      {
        name_map: 'lim01',
        position: [3, 4],
      },
      {
        name_map: 'mont',
        position: [2, 1],
      },
      {
        name_map: 'or56m',
        position: [5, 3],
      },
      {
        name_map: 'or865',
        position: [-1, 3],
      },
      {
        name_map: 'orange-over-purple',
        position: [0, 1],
      },
      {
        name_map: 'redpark',
        position: [2, 2],
      },
      {
        name_map: 'til42',
        position: [4, 4],
      },
      {
        name_map: 'todarp',
        position: [0, 2],
      },
      {
        name_map: 'trvc',
        position: [3, 1],
      },
      {
        name_map: 'ubrig',
        position: [2, 0],
      },
      {
        name_map: 'vlit6',
        position: [5, 4],
      },
      {
        name_map: 'wen6x',
        position: [3, 3],
      },
      {
        name_map: 'yupark',
        position: [1, 2],
      },
      {
        name_map: 'zax-shop',
        position: [1, 1],
      },
    ];
    // 7x6 (16*3)
    const dim = 16 * 3 * 10; // this.MetaData.dim * 0.17;
    const sumFactor = 1;
    const solid = {};
    for (const y of range(-1 + sumFactor, 5 + sumFactor)) {
      solid[y] = {};
      for (const x of range(-1 + sumFactor, 5 + sumFactor)) {
        const dataSection = mapData.find(
          (d) => d.position && d.position[0] + sumFactor === x && d.position[1] + sumFactor === y,
        );

        let src;
        if (dataSection) src = `${getProxyPath()}assets/seed-city/${dataSection.name_map}.PNG`;
        else src = `${getProxyPath()}assets/seed-city/void.PNG`;

        let sectionSolidMatrix;
        if (dataSection) {
          const allData = JSON.parse(
            await CoreService.getRaw(`${getProxyPath()}assets/seed-city/${dataSection.name_map}.metadata.json`),
          );

          sectionSolidMatrix = allData.matrix.map((row) => row.map((value) => (value === 1 ? 1 : 0)));
        } else {
          sectionSolidMatrix = range(0, 15).map((row) => range(0, 15).map(() => 0));
        }

        sectionSolidMatrix = amplifyMatrix(sectionSolidMatrix, 3);

        solid[y][x] = newInstance(sectionSolidMatrix);

        const mapImg = Sprite.from(src);
        mapImg.width = dim;
        mapImg.height = dim;
        mapImg.x = x * dim;
        mapImg.y = y * dim;
        this.Data.biome.seedCityContainer.addChild(mapImg);
      }
    }
    BiomeEngine.currentBiome = { solid: mergeMatrices(solid) };
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
        this.Data.biome[id].visible = true;
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
                const componentInstance = Sprite.from(src);
                componentInstance.x = 0;
                componentInstance.y = 0;
                componentInstance.width = dim * Elements.Data[type][id].dim;
                componentInstance.height = dim * Elements.Data[type][id].dim;
                componentInstance.visible = position === positionId && frame === 0;
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

                    currentFrame++;
                    if (currentFrame === frames) currentFrame = 0;

                    currentSrc = `${getProxyPath()}assets/skin/${displayId}/${positionId}/${currentFrame}.png`;
                    this.Data[type][id].components[componentType][`${currentSrc}-${currentIndex}`].visible =
                      position === positionId ? true : false;
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
