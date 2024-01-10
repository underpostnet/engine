import { CoreService } from '../../services/core/core.service.js';
import { CyberiaBiomeService } from '../../services/cyberia-biome/cyberia-biome.service.js';
import { FileService } from '../../services/file/file.service.js';
import { AgGrid } from '../core/AgGrid.js';
import { BtnIcon } from '../core/BtnIcon.js';
import {
  JSONmatrix,
  amplifyMatrix,
  mergeMatrices,
  newInstance,
  random,
  randomHexColor,
  range,
  round10,
} from '../core/CommonJs.js';
import { Css, Themes, dynamicCol, renderStatus } from '../core/Css.js';
import { DropDown } from '../core/DropDown.js';
import { EventsUI } from '../core/EventsUI.js';
import { Input } from '../core/Input.js';
import { loggerFactory } from '../core/Logger.js';
import { Modal } from '../core/Modal.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { Translate } from '../core/Translate.js';
import { Validator } from '../core/Validator.js';
import { downloadFile, getProxyPath, htmls, s } from '../core/VanillaJs.js';
import { Elements } from './Elements.js';
import { Matrix } from './Matrix.js';
import { Pixi } from './Pixi.js';

const logger = loggerFactory(import.meta);

const Biome = {
  city: async function () {
    const dim = Matrix.Data.dim * Matrix.Data.dimPaintByCell;
    const buildingStyles = [
      {
        name: 'blue',
        body: ['#000c2d', '#001a5e'],
        window: ['#ccce41', '#ffff4a', '#ffff99'],
      },
      {
        name: 'purple',
        body: ['#4f004f', '#620062'],
        window: ['#b83e0a', '#e44d0c', '#f47239'],
      },
    ];
    const pavementStyle = ['#373737', '#282828', '#1d1d1d', 'black'];
    const BiomeMatrix = {
      color: {},
      solid: {},
    };
    let colorCell;
    // seeds
    range(0, dim - 1).map((y) => {
      range(0, dim - 1).map((x) => {
        if (x % Matrix.Data.dimPaintByCell === 0 && y % Matrix.Data.dimPaintByCell === 0 && random(0, 700) < 10) {
          colorCell = buildingStyles[random(0, buildingStyles.length - 1)].body[0];
        } else {
          const probPavement = random(0, 700);
          if (probPavement < 10) {
            colorCell = pavementStyle[pavementStyle.length - 1];
          } else if (probPavement < 100) {
            colorCell = pavementStyle[pavementStyle.length - 2];
          } else if (probPavement < 300) {
            colorCell = pavementStyle[pavementStyle.length - 3];
          } else {
            colorCell = pavementStyle[pavementStyle.length - 4];
          }
        }
        if (!BiomeMatrix.color[y]) BiomeMatrix.color[y] = {};
        if (!BiomeMatrix.solid[y]) BiomeMatrix.solid[y] = {};
        BiomeMatrix.color[y][x] = `${colorCell}`;
        BiomeMatrix.solid[y][x] = 0;
      });
    });
    const seedMatrix = newInstance(BiomeMatrix.color);
    const baseCordValidator = (x, y, maxLimitX, maxLimitY) => x >= 0 && y >= 0 && x <= maxLimitX && y <= maxLimitY;

    const buildLimitStorage = {};
    Object.keys(BiomeMatrix.color).map((y) => {
      Object.keys(BiomeMatrix.color[y]).map((x) => {
        x = parseInt(x);
        y = parseInt(y);
        buildingStyles.map((buildStyle) => {
          // builging
          if (seedMatrix[y][x] === buildStyle.body[0]) {
            // body
            const xFactor = random(4, 8);
            const yFactor = random(3, 10);
            const buildLimitX = Matrix.Data.dimPaintByCell * xFactor - 1;
            const buildLimitY = Matrix.Data.dimPaintByCell * yFactor - 1;

            if (!buildLimitStorage[x]) buildLimitStorage[x] = {};
            buildLimitStorage[x][y] = {
              buildLimitX,
              buildLimitY,
            };

            range(0, buildLimitX).map((sumX) =>
              range(0, buildLimitY).map((sumY) => {
                if (baseCordValidator(x + sumX, y + sumY, dim - 1, dim - 1)) {
                  colorCell = buildStyle.body[random(0, 500) < 100 || x + sumX <= x + random(3, 7) ? 0 : 1];
                  BiomeMatrix.solid[y + sumY][x + sumX] = 1;
                  BiomeMatrix.color[y + sumY][x + sumX] = `${colorCell}`;
                }
              }),
            );
            // window
            range(0, buildLimitX).map((sumX) =>
              range(0, buildLimitY).map((sumY) => {
                if (random(0, 1) === 0) return;
                if (
                  baseCordValidator(x + sumX, y + sumY, dim - 1, dim - 1) &&
                  (x + sumX) % 4 === 0 &&
                  (y + sumY) % 4 === 0
                ) {
                  // single window area
                  const xFactorWindow = random(1, 2);
                  const yFactorWindow = random(1, 2);
                  range(0, xFactorWindow).map((sumX0) =>
                    range(0, yFactorWindow).map((sumY0) => {
                      if (
                        baseCordValidator(x + sumX + sumX0, y + sumY + sumY0, x + buildLimitX, y + buildLimitY) &&
                        y + sumY + sumY0 < y + buildLimitY - 4 &&
                        y + sumY + sumY0 > y
                      ) {
                        colorCell = buildStyle.window[random(0, 2)];
                        BiomeMatrix.color[y + sumY + sumY0][x + sumX + sumX0] = `${colorCell}`;
                      }
                    }),
                  );
                }
              }),
            );
          }
        });
      });
    });

    Object.keys(BiomeMatrix.color).map((y) => {
      Object.keys(BiomeMatrix.color[y]).map((x) => {
        x = parseInt(x);
        y = parseInt(y);
        buildingStyles.map((buildStyle) => {
          // builging
          if (seedMatrix[y][x] === buildStyle.body[0]) {
            const { buildLimitX, buildLimitY } = buildLimitStorage[x][y];
            // door
            const dimDoor = 2;
            const xDoorPadding = 2;
            const xDoorCords = range(x + xDoorPadding, x + buildLimitX - xDoorPadding - dimDoor).filter(
              (n) => n % Matrix.Data.dimPaintByCell === 0,
            );
            const xDoor = xDoorCords[random(0, xDoorCords.length - 1)];
            const yDoor = y + buildLimitY;
            let validDoor = true;
            // colorCell = 'red';
            range(0, dimDoor).map((deltaX) =>
              range(1, dimDoor + 1).map((deltaY) => {
                if (
                  !baseCordValidator(xDoor + deltaX, yDoor + deltaY, dim - 1, dim - 1) ||
                  !baseCordValidator(xDoor + deltaX, yDoor + deltaY, x + buildLimitX, y + buildLimitY + dimDoor + 1)
                ) {
                  validDoor = false;
                }

                if (
                  BiomeMatrix.color[yDoor + deltaY] &&
                  BiomeMatrix.color[yDoor + deltaY][xDoor + deltaX] &&
                  !pavementStyle.includes(BiomeMatrix.color[yDoor + deltaY][xDoor + deltaX])
                ) {
                  validDoor = false;
                } else if (
                  BiomeMatrix.color[yDoor + deltaY] &&
                  BiomeMatrix.color[yDoor + deltaY][xDoor + deltaX] &&
                  !pavementStyle.includes(BiomeMatrix.color[yDoor + deltaY][xDoor + deltaX])
                ) {
                  validDoor = false;
                }
              }),
            );
            if (!validDoor) return;
            colorCell = 'black';
            range(0, dimDoor).map((deltaX) =>
              range(0, dimDoor).map((deltaY) => {
                if (
                  baseCordValidator(xDoor + deltaX, yDoor - deltaY, dim - 1, dim - 1) &&
                  baseCordValidator(xDoor + deltaX, yDoor - deltaY, x + buildLimitX, y + buildLimitY)
                ) {
                  BiomeMatrix.color[yDoor - deltaY][xDoor + deltaX] = `${colorCell}`;
                  BiomeMatrix.solid[yDoor - deltaY][xDoor + deltaX] = 0;
                }
              }),
            );
          }
        });
      });
    });

    return BiomeMatrix;
  },
  forest: async function () {
    const dim = Matrix.Data.dim * Matrix.Data.dimPaintByCell;

    // phenotypes
    const treePhenotype = [
      ['#c41919', '#810202'],
      ['#aaf93e', '#e7ef46'],
    ];

    const validateMatrixLimit = (x, y) => x >= 0 && y >= 0 && x <= dim - 1 && y <= dim - 1;

    const BiomeMatrix = {
      color: {},
      solid: {},
    };
    let colorCell;

    // biome seeds
    range(0, dim - 1).map((y) => {
      range(0, dim - 1).map((x) => {
        const probColor = random(0, 700);
        if (probColor <= 3) {
          colorCell = '#AF5E06';
        } else if (probColor <= 22) {
          colorCell = '#29714c';
        } else if (probColor <= 30) {
          colorCell = treePhenotype[random(0, treePhenotype.length - 1)][0];
        } else {
          colorCell = '#3bb177';
        }

        if (!BiomeMatrix.color[y]) BiomeMatrix.color[y] = {};
        if (!BiomeMatrix.solid[y]) BiomeMatrix.solid[y] = {};
        BiomeMatrix.color[y][x] = `${colorCell}`;
        BiomeMatrix.solid[y][x] = 0;
      });
    });
    const seedMatrix = newInstance(BiomeMatrix.color);

    // dark lawn
    colorCell = '#29714c';
    Object.keys(BiomeMatrix.color).map((y) => {
      Object.keys(BiomeMatrix.color[y]).map((x) => {
        x = parseInt(x);
        y = parseInt(y);
        if (seedMatrix[y][x] === colorCell) {
          range(-3, 3).map((sumX) =>
            range(-1, 1).map((sumY) => {
              if (random(0, 8) > 2) return;
              if (validateMatrixLimit(x + sumX, y + sumY)) BiomeMatrix.color[y + sumY][x + sumX] = `${colorCell}`;
            }),
          );
          colorCell = '#349a67';
          range(-5, 5).map((sumX) =>
            range(-3, 3).map((sumY) => {
              if (random(0, 10) > 2) return;
              if (validateMatrixLimit(x + sumX, y + sumY)) BiomeMatrix.color[y + sumY][x + sumX] = `${colorCell}`;
            }),
          );
          colorCell = '#29714c';
        }
      });
    });

    // flowers
    Object.keys(BiomeMatrix.color).map((y) => {
      Object.keys(BiomeMatrix.color[y]).map((x) => {
        x = parseInt(x);
        y = parseInt(y);
        treePhenotype.map((phenoType) => {
          if (seedMatrix[y][x] === phenoType[0]) {
            range(-2, 2).map((sumX) =>
              range(1, 1).map((sumY) => {
                if (random(0, 1) === 0) return;
                if (validateMatrixLimit(x + sumX, y + sumY))
                  BiomeMatrix.color[y + sumY][x + sumX] = `${phenoType[random(0, phenoType.length - 1)]}`;
              }),
            );
          }
        });
      });
    });

    colorCell = '#AF5E06';
    Object.keys(BiomeMatrix.color).map((y) => {
      Object.keys(BiomeMatrix.color[y]).map((x) => {
        x = parseInt(x);
        y = parseInt(y);
        if (seedMatrix[y][x] === colorCell) {
          // shadow
          colorCell = '#29714c';
          range(-2, 2).map((sumX) =>
            range(4, 5).map((sumY) => {
              // if (random(0, 1) === 0) return;
              if (validateMatrixLimit(x + sumX, y + sumY)) BiomeMatrix.color[y + sumY][x + sumX] = `${colorCell}`;
            }),
          );
          range(-3, 3).map((sumX) =>
            range(3, 6).map((sumY) => {
              if (random(0, 1) === 0) return;
              if (validateMatrixLimit(x + sumX, y + sumY)) BiomeMatrix.color[y + sumY][x + sumX] = `${colorCell}`;
            }),
          );
          colorCell = '#349a67';
          range(-4, 4).map((sumX) =>
            range(2, 7).map((sumY) => {
              if (random(0, 10) > 1) return;
              if (validateMatrixLimit(x + sumX, y + sumY)) BiomeMatrix.color[y + sumY][x + sumX] = `${colorCell}`;
            }),
          );
          // tree leaves
          const selectPhenotype = treePhenotype[random(0, treePhenotype.length - 1)];
          range(-4, 4).map((sumX) =>
            range(-6, -1).map((sumY) => {
              if (random(1, 0) === 1 && (sumX > 3 || sumX < -3) && (sumY > -3 || sumY < -4)) return;
              colorCell = selectPhenotype[0];
              if (validateMatrixLimit(x + sumX, y + sumY)) {
                BiomeMatrix.color[y + sumY][x + sumX] = `${colorCell}`;
                BiomeMatrix.solid[y + sumY][x + sumX] = 1;
              }
            }),
          );
          range(-5, 5).map((sumX) =>
            range(-5, 0).map((sumY) => {
              if (random(1, 4) === 4) return;
              colorCell = selectPhenotype[1];
              if (validateMatrixLimit(x + sumX, y + sumY)) BiomeMatrix.color[y + sumY][x + sumX] = `${colorCell}`;
            }),
          );
          // rhizome
          colorCell = '#AF5E06';
          range(0, 0).map((sumX) =>
            range(-1, 3).map((sumY) => {
              if (random(0, 1) === 0) colorCell = '#975206';
              if (validateMatrixLimit(x + sumX, y + sumY)) {
                BiomeMatrix.color[y + sumY][x + sumX] = `${colorCell}`;
                BiomeMatrix.solid[y + sumY][x + sumX] = 1;
              }
              colorCell = '#AF5E06';
            }),
          );
          // roots
          [-1, 1].map((sumX) =>
            range(-1, 3).map((sumY) => {
              if (random(0, 1) === 0) return;
              if (random(0, 1) === 0) colorCell = '#975206';
              if (validateMatrixLimit(x + sumX, y + sumY)) BiomeMatrix.color[y + sumY][x + sumX] = `${colorCell}`;
              colorCell = '#AF5E06';
            }),
          );
        }
      });
    });

    return BiomeMatrix;
  },
  space: async function () {
    const dim = Matrix.Data.dim * Matrix.Data.dimPaintByCell;

    const validateMatrixLimit = (x, y) => x >= 0 && y >= 0 && x <= dim - 1 && y <= dim - 1;

    const BiomeMatrix = {
      color: {},
      solid: {},
    };
    let colorCell;

    // biome seeds
    range(0, dim - 1).map((y) => {
      range(0, dim - 1).map((x) => {
        const probColor = random(0, 700);
        if (probColor <= 3) {
          colorCell = '#cfcf05';
        } else if (probColor <= 22) {
          colorCell = '#212121';
        } else if (probColor <= 30) {
          colorCell = '#29166e';
        } else {
          colorCell = '#080808';
        }

        if (!BiomeMatrix.color[y]) BiomeMatrix.color[y] = {};
        if (!BiomeMatrix.solid[y]) BiomeMatrix.solid[y] = {};
        BiomeMatrix.color[y][x] = `${colorCell}`;
        BiomeMatrix.solid[y][x] = 0;
      });
    });
    const seedMatrix = newInstance(BiomeMatrix.color);

    return BiomeMatrix;
  },
  'seed-city': async function () {
    const BiomeMatrix = {
      color: {},
      solid: {},
      setBiome: [],
      container: 'seed-city',
      timeOut: 1000,
    };
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

        BiomeMatrix.setBiome.push({
          src,
          dim,
          x,
          y,
        });
      }
    }
    BiomeMatrix.solid = mergeMatrices(solid);

    return BiomeMatrix;
  },
  'color-chaos': async function () {
    const BiomeMatrix = {
      color: {},
      solid: {},
      // container: 'container',
      // setBiome: [],
      // timeOut: 1000,
    };
    for (const y of range(0, Matrix.Data.dim * Matrix.Data.dimPaintByCell - 1)) {
      BiomeMatrix.color[y] = {};
      BiomeMatrix.solid[y] = {};
      for (const x of range(0, Matrix.Data.dim * Matrix.Data.dimPaintByCell - 1)) {
        BiomeMatrix.solid[y][x] = 0;
        BiomeMatrix.color[y][x] = randomHexColor();
      }
    }
    return BiomeMatrix;
  },
};

const BiomeScope = {
  CurrentKey: Object.keys(Biome)[0],
  Keys: {},
  Data: {},
  Grid: [],
};

class LoadBiomeRenderer {
  eGui;

  idFactory(params) {
    return `biome-${params.data._id}`;
  }

  async init(params) {
    console.log('LoadBiomeRenderer created', params);
    const rowId = this.idFactory(params);

    this.eGui = document.createElement('div');
    this.eGui.innerHTML = html`
      ${await BtnIcon.Render({
        class: `in ag-btn-renderer btn-load-biome-${rowId}`,
        label: html`<i class="fa-solid fa-bolt"></i><br />
          ${Translate.Render(`load`)}`,
      })}
      ${await BtnIcon.Render({
        class: `in ag-btn-renderer btn-delete-biome-${rowId}`,
        label: html`<i class="fa-solid fa-circle-xmark"></i> <br />
          ${Translate.Render(`delete`)}`,
      })}
    `;

    setTimeout(() => {
      EventsUI.onClick(`.btn-load-biome-${rowId}`, async () => {
        if (!BiomeScope.Data[rowId]) await this.loadScope(params);
        await this.load(params);
        s(`.input-name-${params.data.biome}`).value = BiomeScope.Data[rowId].name;
        s(`.dropdown-option-${params.data.biome}`).click();
      });
      EventsUI.onClick(`.btn-delete-biome-${rowId}`, async () => {
        const biomeDeleteResult = await CyberiaBiomeService.delete(params.data._id);
        NotificationManager.Push({
          html:
            biomeDeleteResult.status === 'success'
              ? Translate.Render(biomeDeleteResult.message)
              : biomeDeleteResult.message,
          status: biomeDeleteResult.status,
        });

        const fileDeleteResult = await FileService.delete(params.data.fileId);
        NotificationManager.Push({
          html:
            fileDeleteResult.status === 'success'
              ? Translate.Render(fileDeleteResult.message)
              : fileDeleteResult.message,
          status: fileDeleteResult.status,
        });

        setTimeout(() => {
          BiomeScope.Grid = BiomeScope.Grid.filter((biome) => biome._id !== params.data._id);
          AgGrid.grids[`ag-grid-biome-files`].setGridOption('rowData', BiomeScope.Grid);
        });
      });
    });
  }

  getGui() {
    return this.eGui;
  }

  refresh(params) {
    console.log('LoadBiomeRenderer refreshed', params);
    return true;
  }

  async loadScope(params) {
    const rowId = this.idFactory(params);

    const resultBiome = await CyberiaBiomeService.get(params.data._id);

    const biomeData = resultBiome.data[0];

    const resultFile = await FileService.get(biomeData.fileId);

    const imageData = resultFile.data[0];

    const imageBlob = new Blob([new Uint8Array(imageData.data.data)], { type: imageData.mimetype });

    const imageFile = new File([imageBlob], imageData.name, { type: imageData.mimetype });

    const imageSrc = URL.createObjectURL(imageFile);

    biomeData.color = Object.assign(
      {},
      biomeData.color.map((cell) => Object.assign({}, cell)),
    );
    biomeData.solid = Object.assign(
      {},
      biomeData.solid.map((cell) => Object.assign({}, cell)),
    );

    BiomeScope.Data[rowId] = {
      ...biomeData,
      imageFile,
      imageSrc,
    };

    return BiomeScope.Data[rowId];
  }

  async load(params) {
    const rowId = this.idFactory(params);
    BiomeScope.CurrentKey = BiomeScope.Data[rowId].biome;

    Matrix.Data.dim = BiomeScope.Data[rowId].dim;
    Matrix.Data.dimPaintByCell = BiomeScope.Data[rowId].dimPaintByCell;
    // Matrix.Data.dimAmplitude = BiomeScope.Data[rowId].dimAmplitude;
    BiomeScope.Keys[params.data.biome] = BiomeScope.Data[rowId];
    Pixi.setFloor(BiomeScope.Data[rowId].imageSrc);
  }
}

const BiomeEngine = {
  Render: async function (options) {
    const resultBiome = await CyberiaBiomeService.get('all-name');
    NotificationManager.Push({
      html: resultBiome.status === 'success' ? Translate.Render(resultBiome.message) : resultBiome.message,
      status: resultBiome.status,
    });
    if (resultBiome.status === 'success') BiomeScope.Grid = resultBiome.data;

    let configBiomeFormRender = html`
      <div class="in section-mp">
        ${await DropDown.Render({
          value: BiomeScope.CurrentKey,
          label: html`${Translate.Render('select-biome')}`,
          data: Object.keys(Biome).map((biomeKey) => {
            return {
              value: biomeKey,
              display: html`<i class="fa-solid fa-mountain-city"></i> ${Translate.Render(biomeKey)}`,
              onClick: () => {
                logger.info('DropDown Biome onClick', biomeKey);
                BiomeScope.CurrentKey = biomeKey;

                for (const biome of Object.keys(Biome))
                  s(`.section-row-${biome}`).style.display = biomeKey === biome ? 'block' : 'none';
              },
            };
          }),
        })}
      </div>
    `;
    // let render = '';
    for (const biome of Object.keys(Biome)) {
      configBiomeFormRender += html`
        <div class="in section-row-${biome}" style="display: none">
          ${await Input.Render({
            id: `input-name-${biome}`,
            label: html`<i class="fa-solid fa-pen-to-square"></i> ${Translate.Render('name')}`,
            containerClass: 'section-mp container-component input-container',
            placeholder: true,
          })}
          <div class="in">
            ${await BtnIcon.Render({
              class: `inl section-mp btn-custom btn-generate-biome-${biome}`,
              label: html`<i class="fa-solid fa-arrows-rotate"></i> ${Translate.Render(`generate`)}`,
            })}
          </div>
          <div class="in">
            ${await BtnIcon.Render({
              class: `inl section-mp btn-custom btn-download-biome-${biome}-png`,
              label: html`<i class="fa-solid fa-download"></i> ${Translate.Render(`download`)}`,
            })}
          </div>
          <div class="in">
            ${await BtnIcon.Render({
              class: `inl section-mp btn-custom btn-upload-biome-${biome}`,
              label: html`<i class="fa-solid fa-upload"></i> ${Translate.Render(`upload`)}`,
            })}
          </div>
          <div class="in">
            ${await BtnIcon.Render({
              class: `inl section-mp btn-custom btn-image-biome-${biome}`,
              label: html`<i class="fa-regular fa-image"></i> ${Translate.Render(`biome-image`)}`,
            })}
          </div>
          <div class="in">
            ${await BtnIcon.Render({
              class: `inl section-mp btn-custom btn-solid-biome-${biome}`,
              label: html`<i class="fa-solid fa-table-cells"></i> ${Translate.Render(`biome-solid`)}`,
            })}
          </div>
        </div>
      `;
    }

    setTimeout(() =>
      Object.keys(Biome).map((biome) => {
        const validators = Validator.instance([{ id: `input-name-${biome}`, rules: [{ type: 'emptyField' }] }]);

        EventsUI.onClick(`.btn-generate-biome-${biome}`, async () => {
          await this.generateBiome(biome);
        });
        EventsUI.onClick(`.btn-download-biome-${biome}-png`, async () =>
          downloadFile(BiomeScope.Keys[biome].imageFile, `${biome}.png`),
        );
        EventsUI.onClick(`.btn-upload-biome-${biome}`, async () => {
          const validateError = await validators();
          if (validateError) return;

          if (!BiomeScope.Keys[biome])
            return NotificationManager.Push({
              html: Translate.Render('invalid-data'),
              status: 'error',
            });

          let { solid, color } = BiomeScope.Keys[biome];
          if (!solid)
            return NotificationManager.Push({
              html: Translate.Render('invalid-data'),
              status: 'error',
            });
          const body = new FormData();
          // https://www.iana.org/assignments/media-types/media-types.xhtml
          body.append('file', BiomeScope.Keys[biome].imageFile);
          let fileId;
          await (async () => {
            const { status, data } = await FileService.post(body);
            // await timer(3000);
            NotificationManager.Push({
              html: Translate.Render(`${status}-upload-file`),
              status,
            });
            if (status === 'success') fileId = data[0]._id;
          })();
          if (fileId)
            await (async () => {
              if (color) color = Object.values(color).map((row) => Object.values(row));
              solid = Object.values(solid).map((row) => Object.values(row));
              const { dim, dimPaintByCell, dimAmplitude } = Matrix.Data;
              const { status, data } = await CyberiaBiomeService.post({
                fileId,
                solid,
                color,
                name: s(`.input-name-${biome}`).value,
                biome,
                dim,
                dimPaintByCell,
                dimAmplitude,
              });
              NotificationManager.Push({
                html: Translate.Render(`${status}-upload-biome`),
                status,
              });
              BiomeScope.Grid.push(data);
              AgGrid.grids[`ag-grid-biome-files`].setGridOption('rowData', BiomeScope.Grid);
              // AgGrid.grids[`ag-grid-biome-files`].refreshCells({
              //   force: true,
              //   suppressFlash: false,
              // });
            })();
        });

        EventsUI.onClick(`.btn-image-biome-${biome}`, async () => {
          const { barConfig } = await Themes[Css.currentTheme]();
          await Modal.Render({
            id: `modal-image-biome-${biome}`,
            barConfig,
            title: ` ${Translate.Render(`biome-image`)} - ${biome}`,
            html: html`<img src="${BiomeScope.Keys[biome].imageSrc}" />`,
            mode: 'view',
            slideMenu: 'modal-menu',
          });
        });
        EventsUI.onClick(`.btn-solid-biome-${biome}`, async () => {
          const { barConfig } = await Themes[Css.currentTheme]();
          await Modal.Render({
            id: `modal-solid-biome-${biome}`,
            barConfig,
            title: ` ${Translate.Render(`biome-solid`)} - ${biome}`,
            html: html`<pre style="font-size: 10px">
            ${JSONmatrix(BiomeScope.Keys[biome].solid).replaceAll('1', html`<span style="color: yellow">1</span>`)}</pre
            >`,
            mode: 'view',
            slideMenu: 'modal-menu',
          });
        });
      }),
    );

    return html`
      <style>
        ${css`
          .biome-solid-matrix-preview {
            font-size: 8px;
          }
        `}
      </style>
      ${dynamicCol({ containerSelector: options.idModal, id: 'biome' })}
      <style class="style-biome-col"></style>
      <div class="fl">
        <div class="in fll biome-col-a">
          <div class="in section-mp">
            <div class="in sub-title-modal">
              <i class="fa-solid fa-sliders"></i> ${Translate.Render('config-biome')}
            </div>
          </div>
          ${configBiomeFormRender}
        </div>
        <div class="in fll biome-col-b">
          <div class="in section-mp">
            <div class="in sub-title-modal"><i class="far fa-list-alt"></i> ${Translate.Render('biomes')}</div>
          </div>
          <div class="in section-mp">
            ${await AgGrid.Render({
              id: `ag-grid-biome-files`,
              darkTheme: true,
              gridOptions: {
                rowData: BiomeScope.Grid,
                columnDefs: [
                  { field: '_id', headerName: 'ID' },
                  { field: 'biome', headerName: 'Biome' },
                  { field: 'name', headerName: 'Name' },
                  { headerName: '', cellRenderer: LoadBiomeRenderer },
                ],
              },
            })}
          </div>
        </div>
      </div>
      <!--
      <div class="in biome-img-matrix-preview"></div>
      <pre class="in biome-solid-matrix-preview"></pre>
      -->
    `;
  },
  isCollision: function (options) {
    if (!BiomeScope.Keys[BiomeScope.CurrentKey] || !BiomeScope.Keys[BiomeScope.CurrentKey].solid) return false;
    const x = options.x * Matrix.Data.dimPaintByCell;
    const y = options.y * Matrix.Data.dimPaintByCell;
    const { type, id } = options;
    for (const sumY of range(0, round10(Elements.Data[type][id].dim * Matrix.Data.dimPaintByCell) - 1))
      for (const sumX of range(0, round10(Elements.Data[type][id].dim * Matrix.Data.dimPaintByCell) - 1)) {
        if (
          BiomeScope.Keys[BiomeScope.CurrentKey].solid[round10(y + sumY)] === undefined ||
          BiomeScope.Keys[BiomeScope.CurrentKey].solid[round10(y + sumY)][round10(x + sumX)] === undefined ||
          BiomeScope.Keys[BiomeScope.CurrentKey].solid[round10(y + sumY)][round10(x + sumX)] === 1
        )
          return true;
      }
    return false;
  },
  generateBiome: async function (biome) {
    const BiomeMatrix = await Biome[biome]();
    BiomeScope.Keys[biome] = { ...BiomeMatrix, biome };
    BiomeScope.CurrentKey = biome;
    Pixi.setBiome(BiomeMatrix);
    setTimeout(
      async () => {
        const biomeImg = await Pixi.App.renderer.extract.image(Pixi.Data.biome[Pixi.currentBiomeContainer]);
        BiomeScope.Keys[biome].imageSrc = biomeImg.currentSrc;
        const res = await fetch(BiomeScope.Keys[biome].imageSrc);
        const blob = await res.blob();
        BiomeScope.Keys[biome].imageFile = new File([blob], `${biome}.png`, { type: 'image/png' });
      },
      BiomeMatrix.timeOut ? BiomeMatrix.timeOut : 0,
    );
  },
};

export { Biome, BiomeEngine, BiomeScope, LoadBiomeRenderer };
