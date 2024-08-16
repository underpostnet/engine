import { CoreService } from '../../services/core/core.service.js';
import { CyberiaBiomeService } from '../../services/cyberia-biome/cyberia-biome.service.js';
import { CyberiaTileService } from '../../services/cyberia-tile/cyberia-tile.service.js';
import { FileService } from '../../services/file/file.service.js';
import { AgGrid } from '../core/AgGrid.js';
import { BtnIcon } from '../core/BtnIcon.js';
import {
  JSONmatrix,
  amplifyMatrix,
  getMostFrequentValue,
  mergeMatrices,
  newInstance,
  random,
  randomHexColor,
  range,
  round10,
} from '../core/CommonJs.js';
import { Css, Themes, darkTheme, dynamicCol } from '../core/Css.js';
import { DropDown } from '../core/DropDown.js';
import { EventsUI } from '../core/EventsUI.js';
import { Input } from '../core/Input.js';
import { loggerFactory } from '../core/Logger.js';
import { Modal } from '../core/Modal.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { ToggleSwitch } from '../core/ToggleSwitch.js';
import { Translate } from '../core/Translate.js';
import { Validator } from '../core/Validator.js';
import { downloadFile, getProxyPath, htmls, s } from '../core/VanillaJs.js';
import {
  BaseMatrixCyberia,
  getCollisionMatrixCyberia,
  getRandomAvailablePositionCyberia,
  isBiomeCyberiaCollision,
} from './CommonCyberia.js';
import { ElementsCyberia } from './ElementsCyberia.js';
import { MatrixCyberia } from './MatrixCyberia.js';
import { PixiCyberia } from './PixiCyberia.js';
import { Application, BaseTexture, Container, Sprite, Texture } from 'pixi.js';

const logger = loggerFactory(import.meta);

const BiomeCyberiaParamsScope = BaseMatrixCyberia();

const cut = {
  enable: false,
  x1: 4,
  y1: 2,
  x2: 5,
  y2: 3,
};

const BiomeCyberia = {
  'city-interior': async function () {
    const dim = BiomeCyberiaParamsScope.dim * BiomeCyberiaParamsScope.dimPaintByCell;
    const BiomeCyberiaMatrixCyberia = {
      color: {},
      solid: {},
    };

    const squareSeedDimLimit = round10((dim - 1) * [0.2, 0.15, 0.1, 0.05][random(0, 3)]);
    const squareSeedDimLimitMax = round10(squareSeedDimLimit * (1 + [0.5, 0.6, 0.7, 0.8][random(0, 3)]));

    range(0, dim - 1).map((y) => {
      range(0, dim - 1).map((x) => {
        if (!BiomeCyberiaMatrixCyberia.color[y]) BiomeCyberiaMatrixCyberia.color[y] = {};
        if (!BiomeCyberiaMatrixCyberia.solid[y]) BiomeCyberiaMatrixCyberia.solid[y] = {};

        if (
          x >= squareSeedDimLimit &&
          x <= dim - 1 - squareSeedDimLimit &&
          y >= squareSeedDimLimit &&
          y <= dim - 1 - squareSeedDimLimit
        ) {
          BiomeCyberiaMatrixCyberia.color[y][x] = `#ffd900`;
          BiomeCyberiaMatrixCyberia.solid[y][x] = 0;
        } else {
          BiomeCyberiaMatrixCyberia.color[y][x] = `#000000`;
          BiomeCyberiaMatrixCyberia.solid[y][x] = 1;
        }
      });
    });

    range(0, dim - 1).map((y) => {
      range(0, dim - 1).map((x) => {
        if (!BiomeCyberiaMatrixCyberia.color[y]) BiomeCyberiaMatrixCyberia.color[y] = {};
        if (!BiomeCyberiaMatrixCyberia.solid[y]) BiomeCyberiaMatrixCyberia.solid[y] = {};

        if (
          x >= squareSeedDimLimit &&
          x <= dim - 1 - squareSeedDimLimit &&
          y >= squareSeedDimLimit &&
          y <= dim - 1 - squareSeedDimLimit
        ) {
          if (
            x % BiomeCyberiaParamsScope.dimPaintByCell === 0 &&
            y % BiomeCyberiaParamsScope.dimPaintByCell === 0 &&
            random(0, 700) < 30
          ) {
            if (
              !(
                x >= squareSeedDimLimitMax &&
                x <= dim - 1 - squareSeedDimLimitMax &&
                y >= squareSeedDimLimitMax &&
                y <= dim - 1 - squareSeedDimLimitMax
              )
            ) {
              BiomeCyberiaMatrixCyberia.color[y][x] = `#ff0a0a`;
            }
          }
        }
      });
    });

    const seedMatrixCyberia = newInstance(BiomeCyberiaMatrixCyberia.color);

    range(0, dim - 1).map((y) => {
      range(0, dim - 1).map((x) => {
        if (seedMatrixCyberia[y][x] === `#ff0a0a`) {
          const squareLimit = round10(((dim - 1) * [0.1, 0.2, 0.3, 0.4][random(0, 3)]) / 2);
          range(-1 * squareLimit, squareLimit).map((sumY) => {
            range(-1 * squareLimit, squareLimit).map((sumX) => {
              if (BiomeCyberiaMatrixCyberia.color[y + sumY] && BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX]) {
                BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] = `#000000`;
                BiomeCyberiaMatrixCyberia.solid[y + sumY][x + sumX] = 1;
              }
            });
          });
        }
      });
    });

    // doors
    const seedMatrixCyberiaDoor = newInstance(BiomeCyberiaMatrixCyberia.color);
    const _instanceValidDoor = (x, fromLimitX, toLimitX, y, fromLimitY, toLimitY) => {
      let validDoor = true;
      for (const sumY of range(fromLimitY, toLimitY)) {
        for (const sumX of range(fromLimitX, toLimitX)) {
          if (
            !seedMatrixCyberiaDoor[y + sumY] ||
            !seedMatrixCyberiaDoor[y + sumY][x + sumX] ||
            seedMatrixCyberiaDoor[y + sumY][x + sumX] !== `#ffd900`
          ) {
            validDoor = false;
          }
        }
      }
      if (validDoor)
        for (const sumY of range(fromLimitY, toLimitY)) {
          for (const sumX of range(fromLimitX, toLimitX)) {
            if (
              fromLimitX > 0 &&
              (sumX > 3 || sumY > 3) &&
              BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] !== `#790073`
            )
              BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] = `#ff00f2`;
            else if (
              fromLimitX < 0 &&
              (sumX < -3 || sumY < -3) &&
              BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] !== `#790073`
            )
              BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] = `#ff00f2`;
            else BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] = `#790073`;
          }
        }
    };
    const instanceValidDoor = (x, fromLimitX, toLimitX, y, fromLimitY, toLimitY) => {
      let validDoor = true;
      for (const sumY of range(fromLimitY, toLimitY)) {
        for (const sumX of range(fromLimitX, toLimitX)) {
          if (
            !seedMatrixCyberiaDoor[y + sumY] ||
            !seedMatrixCyberiaDoor[y + sumY][x + sumX] ||
            seedMatrixCyberiaDoor[y + sumY][x + sumX] !== `#ffd900` ||
            BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] === `#790073` ||
            BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] === `#1fa92d`
          ) {
            validDoor = false;
          }
        }
      }
      if (validDoor) {
        const colorDoor = random(0, 20) <= 5 ? `#1fa92d` : `#790073`;
        for (const sumY of range(fromLimitY, toLimitY)) {
          for (const sumX of range(fromLimitX, toLimitX)) {
            if (
              fromLimitX > 0 &&
              (sumX > 3 || sumY > 3) &&
              BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] !== `#790073` &&
              BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] !== `#1fa92d`
            )
              BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] = `#ff00f2`;
            else if (
              fromLimitX < 0 &&
              (sumX < -3 || sumY < -3) &&
              BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] !== `#790073` &&
              BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] !== `#1fa92d`
            )
              BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] = `#ff00f2`;
            else BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] = colorDoor;
          }
        }
      }
    };
    range(0, dim - 1).map((y) => {
      range(0, dim - 1).map((x) => {
        if (BiomeCyberiaMatrixCyberia.color[y][x] === `#000000`) {
          instanceValidDoor(x, 1, 6, y, 1, 3);
          instanceValidDoor(x, -1, -6, y, -1, -3);
          instanceValidDoor(x, 1, 3, y, 1, 6);
          instanceValidDoor(x, -1, -3, y, -1, -6);
        }
      });
    });

    return BiomeCyberiaMatrixCyberia;
  },
  city: async function () {
    const dim = BiomeCyberiaParamsScope.dim * BiomeCyberiaParamsScope.dimPaintByCell;
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
    const BiomeCyberiaMatrixCyberia = {
      color: {},
      solid: {},
      topLevelColor: {},
    };
    let colorCell;
    let defaultColor;
    // seeds
    range(0, dim - 1).map((y) => {
      range(0, dim - 1).map((x) => {
        if (
          x % BiomeCyberiaParamsScope.dimPaintByCell === 0 &&
          y % BiomeCyberiaParamsScope.dimPaintByCell === 0 &&
          random(0, 700) < 10
        ) {
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
          if (!defaultColor) defaultColor = pavementStyle[pavementStyle.length - 4];
        }
        if (!BiomeCyberiaMatrixCyberia.color[y]) BiomeCyberiaMatrixCyberia.color[y] = {};
        if (!BiomeCyberiaMatrixCyberia.solid[y]) BiomeCyberiaMatrixCyberia.solid[y] = {};
        if (!BiomeCyberiaMatrixCyberia.topLevelColor[y]) BiomeCyberiaMatrixCyberia.topLevelColor[y] = {};
        BiomeCyberiaMatrixCyberia.color[y][x] = `${colorCell}`;
        BiomeCyberiaMatrixCyberia.topLevelColor[y][x] =
          (y === 0 && x === 0) || (x === dim - 1 && y === dim - 1) ? `${defaultColor}` : '';
        BiomeCyberiaMatrixCyberia.solid[y][x] = 0;
      });
    });
    const seedMatrixCyberia = newInstance(BiomeCyberiaMatrixCyberia.color);
    const baseCordValidator = (x, y, maxLimitX, maxLimitY) => x >= 0 && y >= 0 && x <= maxLimitX && y <= maxLimitY;

    const buildLimitStorage = {};
    Object.keys(BiomeCyberiaMatrixCyberia.color).map((y) => {
      Object.keys(BiomeCyberiaMatrixCyberia.color[y]).map((x) => {
        x = parseInt(x);
        y = parseInt(y);
        buildingStyles.map((buildStyle) => {
          // builging
          if (seedMatrixCyberia[y][x] === buildStyle.body[0]) {
            // body
            const xFactor = random(4, 8);
            const yFactor = random(3, 10);
            const buildLimitX = BiomeCyberiaParamsScope.dimPaintByCell * xFactor - 1;
            const buildLimitY = BiomeCyberiaParamsScope.dimPaintByCell * yFactor - 1;
            const topLevelColor = {
              y: round10(buildLimitY * 0.4),
            };

            if (!buildLimitStorage[x]) buildLimitStorage[x] = {};
            buildLimitStorage[x][y] = {
              buildLimitX,
              buildLimitY,
            };

            range(0, buildLimitX).map((sumX) =>
              range(0, buildLimitY).map((sumY) => {
                if (baseCordValidator(x + sumX, y + sumY, dim - 1, dim - 1)) {
                  colorCell = buildStyle.body[random(0, 500) < 100 || x + sumX <= x + random(3, 7) ? 0 : 1];
                  const topLevelColorEnabled = sumY <= topLevelColor.y;
                  BiomeCyberiaMatrixCyberia.solid[y + sumY][x + sumX] = topLevelColorEnabled ? 0 : 1;
                  if (topLevelColorEnabled) {
                    BiomeCyberiaMatrixCyberia.topLevelColor[y + sumY][x + sumX] = `${colorCell}`;
                    if (sumX === 0 && sumY === 0)
                      BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] = `${defaultColor}`;
                  } else BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] = `${colorCell}`;
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
                        const topLevelColorEnabled = sumY + sumY0 <= topLevelColor.y;
                        if (topLevelColorEnabled) {
                          BiomeCyberiaMatrixCyberia.topLevelColor[y + sumY + sumY0][x + sumX + sumX0] = `${colorCell}`;
                          if (sumX0 === 0 && sumY0 === 0)
                            BiomeCyberiaMatrixCyberia.color[y + sumY + sumY0][x + sumX + sumX0] = `${defaultColor}`;
                        } else BiomeCyberiaMatrixCyberia.color[y + sumY + sumY0][x + sumX + sumX0] = `${colorCell}`;
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

    Object.keys(BiomeCyberiaMatrixCyberia.color).map((y) => {
      Object.keys(BiomeCyberiaMatrixCyberia.color[y]).map((x) => {
        x = parseInt(x);
        y = parseInt(y);
        buildingStyles.map((buildStyle) => {
          // builging
          if (seedMatrixCyberia[y][x] === buildStyle.body[0]) {
            const { buildLimitX, buildLimitY } = buildLimitStorage[x][y];
            // door
            const dimDoor = 2;
            const xDoorPadding = 2;
            const xDoorCords = range(x + xDoorPadding, x + buildLimitX - xDoorPadding - dimDoor).filter(
              (n) => n % BiomeCyberiaParamsScope.dimPaintByCell === 0,
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
                  BiomeCyberiaMatrixCyberia.color[yDoor + deltaY] &&
                  BiomeCyberiaMatrixCyberia.color[yDoor + deltaY][xDoor + deltaX] &&
                  !pavementStyle.includes(BiomeCyberiaMatrixCyberia.color[yDoor + deltaY][xDoor + deltaX])
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
                  BiomeCyberiaMatrixCyberia.color[yDoor - deltaY][xDoor + deltaX] = `${colorCell}`;
                  BiomeCyberiaMatrixCyberia.solid[yDoor - deltaY][xDoor + deltaX] = 0;
                }
              }),
            );
          }
        });
      });
    });

    return BiomeCyberiaMatrixCyberia;
  },
  forest: async function () {
    const dim = BiomeCyberiaParamsScope.dim * BiomeCyberiaParamsScope.dimPaintByCell;

    // phenotypes
    const treePhenotype = [
      ['#c41919', '#810202'],
      ['#aaf93e', '#e7ef46'],
    ];

    const validateMatrixCyberiaLimit = (x, y) => x >= 0 && y >= 0 && x <= dim - 1 && y <= dim - 1;

    const BiomeCyberiaMatrixCyberia = {
      color: {},
      solid: {},
      topLevelColor: {},
    };
    let colorCell;
    let defaultColor;

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
        if (!defaultColor) defaultColor = '#3bb177';

        if (!BiomeCyberiaMatrixCyberia.color[y]) BiomeCyberiaMatrixCyberia.color[y] = {};
        if (!BiomeCyberiaMatrixCyberia.solid[y]) BiomeCyberiaMatrixCyberia.solid[y] = {};
        if (!BiomeCyberiaMatrixCyberia.topLevelColor[y]) BiomeCyberiaMatrixCyberia.topLevelColor[y] = {};
        BiomeCyberiaMatrixCyberia.color[y][x] = `${colorCell}`;
        BiomeCyberiaMatrixCyberia.solid[y][x] = 0;
        BiomeCyberiaMatrixCyberia.topLevelColor[y][x] =
          (y === 0 && x === 0) || (x === dim - 1 && y === dim - 1) ? `${defaultColor}` : '';
      });
    });
    const seedMatrixCyberia = newInstance(BiomeCyberiaMatrixCyberia.color);

    // dark lawn
    colorCell = '#29714c';
    Object.keys(BiomeCyberiaMatrixCyberia.color).map((y) => {
      Object.keys(BiomeCyberiaMatrixCyberia.color[y]).map((x) => {
        x = parseInt(x);
        y = parseInt(y);
        if (seedMatrixCyberia[y][x] === colorCell) {
          range(-3, 3).map((sumX) =>
            range(-1, 1).map((sumY) => {
              if (random(0, 8) > 2) return;
              if (validateMatrixCyberiaLimit(x + sumX, y + sumY))
                BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] = `${colorCell}`;
            }),
          );
          colorCell = '#349a67';
          range(-5, 5).map((sumX) =>
            range(-3, 3).map((sumY) => {
              if (random(0, 10) > 2) return;
              if (validateMatrixCyberiaLimit(x + sumX, y + sumY))
                BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] = `${colorCell}`;
            }),
          );
          colorCell = '#29714c';
        }
      });
    });

    // flowers
    Object.keys(BiomeCyberiaMatrixCyberia.color).map((y) => {
      Object.keys(BiomeCyberiaMatrixCyberia.color[y]).map((x) => {
        x = parseInt(x);
        y = parseInt(y);
        treePhenotype.map((phenoType) => {
          if (seedMatrixCyberia[y][x] === phenoType[0]) {
            range(-2, 2).map((sumX) =>
              range(1, 1).map((sumY) => {
                if (random(0, 1) === 0) return;
                if (validateMatrixCyberiaLimit(x + sumX, y + sumY))
                  BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] = `${phenoType[random(0, phenoType.length - 1)]}`;
              }),
            );
          }
        });
      });
    });

    colorCell = '#AF5E06';
    Object.keys(BiomeCyberiaMatrixCyberia.color).map((y) => {
      Object.keys(BiomeCyberiaMatrixCyberia.color[y]).map((x) => {
        x = parseInt(x);
        y = parseInt(y);
        if (seedMatrixCyberia[y][x] === colorCell) {
          // shadow
          colorCell = '#29714c';
          range(-2, 2).map((sumX) =>
            range(4, 5).map((sumY) => {
              // if (random(0, 1) === 0) return;
              if (validateMatrixCyberiaLimit(x + sumX, y + sumY))
                BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] = `${colorCell}`;
            }),
          );
          range(-3, 3).map((sumX) =>
            range(3, 6).map((sumY) => {
              if (random(0, 1) === 0) return;
              if (validateMatrixCyberiaLimit(x + sumX, y + sumY))
                BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] = `${colorCell}`;
            }),
          );
          colorCell = '#349a67';
          range(-4, 4).map((sumX) =>
            range(2, 7).map((sumY) => {
              if (random(0, 10) > 1) return;
              if (validateMatrixCyberiaLimit(x + sumX, y + sumY))
                BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] = `${colorCell}`;
            }),
          );
          // tree leaves
          const selectPhenotype = treePhenotype[random(0, treePhenotype.length - 1)];
          range(-4, 4).map((sumX) =>
            range(-6, -1).map((sumY) => {
              if (random(1, 0) === 1 && (sumX > 3 || sumX < -3) && (sumY > -3 || sumY < -4)) return;
              colorCell = selectPhenotype[0];
              if (validateMatrixCyberiaLimit(x + sumX, y + sumY)) {
                if (sumX === 0 && sumY === 0) BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] = `${defaultColor}`;
                BiomeCyberiaMatrixCyberia.solid[y + sumY][x + sumX] = 0;
                BiomeCyberiaMatrixCyberia.topLevelColor[y + sumY][x + sumX] = `${colorCell}`;
              }
            }),
          );
          range(-5, 5).map((sumX) =>
            range(-5, 0).map((sumY) => {
              if (random(1, 4) === 4) return;
              colorCell = selectPhenotype[1];
              if (validateMatrixCyberiaLimit(x + sumX, y + sumY)) {
                if (sumX === 0 && sumY === 0) BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] = `${defaultColor}`;
                BiomeCyberiaMatrixCyberia.topLevelColor[y + sumY][x + sumX] = `${colorCell}`;
              }
            }),
          );
          // rhizome
          colorCell = '#AF5E06';
          range(0, 0).map((sumX) =>
            range(-1, 3).map((sumY) => {
              if (random(0, 1) === 0) colorCell = '#975206';
              if (validateMatrixCyberiaLimit(x + sumX, y + sumY)) {
                const topLevelColorEnabled = sumY > 0;
                if (BiomeCyberiaMatrixCyberia.solid[y + sumY + 2])
                  BiomeCyberiaMatrixCyberia.solid[y + sumY + 2][x + sumX] = topLevelColorEnabled ? 0 : 1;
                if (topLevelColorEnabled) BiomeCyberiaMatrixCyberia.topLevelColor[y + sumY][x + sumX] = `${colorCell}`;
              }
              colorCell = '#AF5E06';
            }),
          );
          // roots
          [-1, 1].map((sumX) =>
            range(-1, 3).map((sumY) => {
              if (random(0, 1) === 0) return;
              if (random(0, 1) === 0) colorCell = '#975206';
              if (validateMatrixCyberiaLimit(x + sumX, y + sumY))
                BiomeCyberiaMatrixCyberia.color[y + sumY][x + sumX] = `${colorCell}`;
              colorCell = '#AF5E06';
            }),
          );
        }
      });
    });

    return BiomeCyberiaMatrixCyberia;
  },
  space: async function () {
    const dim = BiomeCyberiaParamsScope.dim * BiomeCyberiaParamsScope.dimPaintByCell;

    const validateMatrixCyberiaLimit = (x, y) => x >= 0 && y >= 0 && x <= dim - 1 && y <= dim - 1;

    const BiomeCyberiaMatrixCyberia = {
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

        if (!BiomeCyberiaMatrixCyberia.color[y]) BiomeCyberiaMatrixCyberia.color[y] = {};
        if (!BiomeCyberiaMatrixCyberia.solid[y]) BiomeCyberiaMatrixCyberia.solid[y] = {};
        BiomeCyberiaMatrixCyberia.color[y][x] = `${colorCell}`;
        BiomeCyberiaMatrixCyberia.solid[y][x] = 0;
      });
    });
    const seedMatrixCyberia = newInstance(BiomeCyberiaMatrixCyberia.color);

    return BiomeCyberiaMatrixCyberia;
  },
  'seed-city': async function () {
    const BiomeCyberiaMatrixCyberia = {
      color: {},
      solid: {},
      topLevelColor: [],
      setBiomeCyberia: [],
      container: 'seed-city',
      timeOut: 1000,
      dim: 16 * 7,
      dimPaintByCell: 3,
      dimAmplitude: 1,
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
        // src: 'orange-over-purple0',
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

    const dim = BiomeCyberiaEngine.PixiCyberiaBiomeCyberiaDim / (cut.enable ? cut.x2 - cut.x1 + 1 : 7); // 16 * 3 * 10; // this.MetaData.dim * 0.17;
    const sumFactor = 1; // center
    const solid = {};
    const color = {};

    if (cut.enable) {
      BiomeCyberiaMatrixCyberia.dim = 16 * (cut.x2 - cut.x1 + 1);
    }

    for (const y of range(-1 + sumFactor, 5 + sumFactor)) {
      if (cut.enable && (y < cut.y1 || y > cut.y2)) continue;
      solid[y] = {};
      color[y] = {};
      for (const x of range(-1 + sumFactor, 5 + sumFactor)) {
        if (cut.enable && (x < cut.x1 || x > cut.x2)) continue;
        const dataSection = mapData.find(
          (d) => d.position && d.position[0] + sumFactor === x && d.position[1] + sumFactor === y,
        );
        // #282828
        let src;
        let sectionColorMatrixCyberia;
        if (dataSection) {
          src = `${getProxyPath()}assets/custom-biome/seed-city/${
            dataSection.src ? dataSection.src : dataSection.name_map
          }.PNG`;
          if (cut.enable) {
            const result = await CyberiaTileService.post({ id: 'hex-matrix-from-png', body: { src } });

            sectionColorMatrixCyberia = result.data.hexMatrix;
          }

          // get hex color matrix
        } else src = `${getProxyPath()}assets/custom-biome/seed-city/void.PNG`;

        let sectionSolidMatrixCyberia;
        if (dataSection) {
          const allData = JSON.parse(
            await CoreService.getRaw({
              url: `${getProxyPath()}assets/custom-biome/seed-city/${dataSection.name_map}.metadata.json`,
            }),
          );

          sectionSolidMatrixCyberia = allData.matrix.map((row) => row.map((value) => (value === 1 ? 1 : 0)));
        } else {
          // new Array(48) -> [empty x 48]
          sectionSolidMatrixCyberia = new Array(16).fill().map(() => new Array(16).fill().map(() => 0));
          sectionColorMatrixCyberia = new Array(48).fill().map(() => new Array(48).fill().map(() => ''));
        }

        color[y][x] = sectionColorMatrixCyberia;

        solid[y][x] = amplifyMatrix(sectionSolidMatrixCyberia, 3);

        BiomeCyberiaMatrixCyberia.setBiomeCyberia.push({
          src,
          dim,
          // camera
          x: cut.enable ? x - sumFactor + (1 - cut.x1) : x,
          y: cut.enable ? y - sumFactor + (1 - cut.y1) : y,
        });
      }
    }

    if (cut.enable) delete BiomeCyberiaMatrixCyberia.setBiomeCyberia;
    console.warn('seed-city generator matrix', { solid });
    BiomeCyberiaMatrixCyberia.solid = mergeMatrices(solid);

    // slice force length
    // const newColor = {};
    // for (const key of Object.keys(color)) {
    //   newColor[key] = {};
    //   for (const key0 of Object.keys(color[key])) {
    //     newColor[key][key0] = color[key][key0]
    //       .slice(0, color[key][key0].length > 16 * 3 ? -1 * (color[key][key0].length - 16 * 3) : undefined)
    //       .map((y) => y.slice(0, y.length > 16 * 3 ? -1 * (y.length - 16 * 3) : undefined));
    //   }
    // }
    // console.error({ newColor });
    // if (cut.enable) BiomeCyberiaMatrixCyberia.color = mergeMatrices(newColor);
    console.warn('seed-city generator matrix', { color });
    if (cut.enable) BiomeCyberiaMatrixCyberia.color = mergeMatrices(color);

    // top level solid
    if (cut.enable) {
      const defaultMatrixColor = getMostFrequentValue(BiomeCyberiaMatrixCyberia.color.flat());
      {
        const dimPixel = (cut.x2 - cut.x1 + 1) * 16 * BiomeCyberiaMatrixCyberia.dimPaintByCell;

        for (const y of range(0, dimPixel - 1)) {
          if (BiomeCyberiaMatrixCyberia.solid[y] === undefined)
            BiomeCyberiaMatrixCyberia.solid[y] = new Array(dimPixel).fill().map(() => 0);
          else
            for (const x of range(0, dimPixel - 1))
              if (BiomeCyberiaMatrixCyberia.solid[y][x] === undefined) BiomeCyberiaMatrixCyberia.solid[y][x] = 0;

          if (BiomeCyberiaMatrixCyberia.color[y] === undefined)
            BiomeCyberiaMatrixCyberia.color[y] = new Array(dimPixel).fill().map(() => '');
          else
            for (const x of range(0, dimPixel - 1))
              if (BiomeCyberiaMatrixCyberia.color[y][x] === undefined) BiomeCyberiaMatrixCyberia.color[y][x] = '';

          BiomeCyberiaMatrixCyberia.topLevelColor[y] = new Array(dimPixel).fill().map(() => '');
        }

        BiomeCyberiaMatrixCyberia.color[dimPixel - 1][dimPixel - 1] = defaultMatrixColor;
      }
      {
        const originColor = newInstance(BiomeCyberiaMatrixCyberia.color);
        let newSolid = newInstance(BiomeCyberiaMatrixCyberia.solid);

        let y = -1;
        for (const row of BiomeCyberiaMatrixCyberia.solid) {
          y++;
          let x = -1;
          for (const value of row) {
            x++;

            const target = BiomeCyberiaMatrixCyberia.solid[y][x] === 1;

            {
              const botLimit =
                BiomeCyberiaMatrixCyberia.solid[y + 1] !== undefined &&
                BiomeCyberiaMatrixCyberia.solid[y + 1][x] !== undefined &&
                BiomeCyberiaMatrixCyberia.solid[y + 1][x] === 1 &&
                BiomeCyberiaMatrixCyberia.solid[y] !== undefined &&
                BiomeCyberiaMatrixCyberia.solid[y][x + 1] !== undefined &&
                BiomeCyberiaMatrixCyberia.solid[y][x + 1] === 1 &&
                BiomeCyberiaMatrixCyberia.solid[y + 1] !== undefined &&
                BiomeCyberiaMatrixCyberia.solid[y + 1][x + 1] !== undefined &&
                BiomeCyberiaMatrixCyberia.solid[y + 1][x + 1] === 1;

              const supLimit =
                BiomeCyberiaMatrixCyberia.solid[y - 1] !== undefined &&
                BiomeCyberiaMatrixCyberia.solid[y - 1][x] !== undefined &&
                BiomeCyberiaMatrixCyberia.solid[y - 1][x] === 0 &&
                BiomeCyberiaMatrixCyberia.solid[y] !== undefined &&
                BiomeCyberiaMatrixCyberia.solid[y][x - 1] !== undefined &&
                BiomeCyberiaMatrixCyberia.solid[y][x - 1] === 0 &&
                BiomeCyberiaMatrixCyberia.solid[y - 1] !== undefined &&
                BiomeCyberiaMatrixCyberia.solid[y - 1][x - 1] !== undefined &&
                BiomeCyberiaMatrixCyberia.solid[y - 1][x - 1] === 0;

              if (target && supLimit && botLimit) {
                BiomeCyberiaMatrixCyberia.solid[y][x] = 2;
                let y0AbsIndex = 0;
                let y0 = newInstance(y) + 1;
                while (BiomeCyberiaMatrixCyberia.solid[y0][x] === 1) {
                  y0AbsIndex++;
                  y0++;
                  if (BiomeCyberiaMatrixCyberia.solid[y0] === undefined) BiomeCyberiaMatrixCyberia.solid[y0] = [];
                }
                BiomeCyberiaMatrixCyberia.solid[y0 - parseInt(y0AbsIndex / 2) - 2][x] = 3;

                let x0AbsIndex = 0;
                let x0 = newInstance(x) + 1;
                while (BiomeCyberiaMatrixCyberia.solid[y0 - parseInt(y0AbsIndex / 2) - 2][x0] === 1) {
                  x0AbsIndex++;
                  x0++;
                }
                BiomeCyberiaMatrixCyberia.solid[y0 - parseInt(y0AbsIndex / 2) - 2][x0 - 1] = 4;

                const topLevelX1 = newInstance(x);
                const topLevelY1 = newInstance(y);
                const topLevelX2 = newInstance(x0 - 1);
                const topLevelY2 = newInstance(y0 - parseInt(y0AbsIndex / 2) - 2);

                for (const yt of range(topLevelY1, topLevelY2)) {
                  for (const xt of range(topLevelX1, topLevelX2)) {
                    newSolid[yt][xt] = 0;
                    BiomeCyberiaMatrixCyberia.topLevelColor[yt][xt] = newInstance(originColor[yt][xt]);
                    BiomeCyberiaMatrixCyberia.color[yt][xt] = defaultMatrixColor;
                  }
                }
              }
            }
          }
        }

        if (BiomeCyberiaMatrixCyberia.topLevelColor[0] === undefined) BiomeCyberiaMatrixCyberia.topLevelColor[0] = {};
        BiomeCyberiaMatrixCyberia.topLevelColor[0][0] = defaultMatrixColor;

        if (BiomeCyberiaMatrixCyberia.topLevelColor[newSolid[0].length - 1] === undefined)
          BiomeCyberiaMatrixCyberia.topLevelColor[newSolid[0].length - 1] = [];
        BiomeCyberiaMatrixCyberia.topLevelColor[newSolid[0].length - 1][newSolid[0].length - 1] = defaultMatrixColor;

        BiomeCyberiaMatrixCyberia.solid = newSolid;
      }
    }

    s(`.biome-dim`).value = BiomeCyberiaMatrixCyberia.dim;
    s(`.biome-dimPaintByCell`).value = BiomeCyberiaMatrixCyberia.dimPaintByCell;

    return BiomeCyberiaMatrixCyberia;
  },
  'color-chaos': async function () {
    const BiomeCyberiaMatrixCyberia = {
      color: {},
      solid: {},
      // container: 'container',
      // setBiomeCyberia: [],
      // timeOut: 1000,
    };
    for (const y of range(0, BiomeCyberiaParamsScope.dim * BiomeCyberiaParamsScope.dimPaintByCell - 1)) {
      BiomeCyberiaMatrixCyberia.color[y] = {};
      BiomeCyberiaMatrixCyberia.solid[y] = {};
      for (const x of range(0, BiomeCyberiaParamsScope.dim * BiomeCyberiaParamsScope.dimPaintByCell - 1)) {
        BiomeCyberiaMatrixCyberia.solid[y][x] = 0;
        BiomeCyberiaMatrixCyberia.color[y][x] = randomHexColor();
      }
    }
    return BiomeCyberiaMatrixCyberia;
  },
};

const getBiomeId = (params) => `biome-${params.data._id}`;

const BiomeCyberiaScope = {
  CurrentKey: Object.keys(BiomeCyberia)[0],
  Keys: {},
  Data: {},
  Grid: [],
};

const BiomeCyberiaRender = {
  loadData: async function (params) {
    const rowId = getBiomeId(params);

    if (!(rowId in BiomeCyberiaScope.Data)) {
      const resultBiomeCyberia = await CyberiaBiomeService.get({ id: params.data._id });

      const biomeData = resultBiomeCyberia.data[0];

      const resultFile = await FileService.get({ id: biomeData.fileId });

      const imageData = resultFile.data[0];

      const imageBlob = new Blob([new Uint8Array(imageData.data.data)], { type: imageData.mimetype });

      const imageFile = new File([imageBlob], imageData.name, { type: imageData.mimetype });

      const imageSrc = URL.createObjectURL(imageFile);

      const resultTopLevelColorFile = await FileService.get({ id: biomeData.topLevelColorFileId });

      const imageTopLevelColorData = resultTopLevelColorFile.data[0];

      const imageTopLevelColorBlob = new Blob([new Uint8Array(imageTopLevelColorData.data.data)], {
        type: imageTopLevelColorData.mimetype,
      });

      const imageTopLevelColorFile = new File([imageTopLevelColorBlob], imageTopLevelColorData.name, {
        type: imageTopLevelColorData.mimetype,
      });

      const imageTopLevelColorSrc = URL.createObjectURL(imageTopLevelColorFile);

      biomeData.color = Object.assign(
        {},
        biomeData.color.map((cell) => Object.assign({}, cell)),
      );
      biomeData.topLevelColor = Object.assign(
        {},
        biomeData.topLevelColor.map((cell) => Object.assign({}, cell)),
      );
      biomeData.solid = Object.assign(
        {},
        biomeData.solid.map((cell) => Object.assign({}, cell)),
      );

      BiomeCyberiaScope.Data[rowId] = {
        ...biomeData,
        imageFile,
        imageSrc,
        imageTopLevelColorFile,
        imageTopLevelColorSrc,
        mainUserCollisionMatrixCyberia: getCollisionMatrixCyberia(biomeData, ElementsCyberia.Data.user.main),
      };
    }

    return BiomeCyberiaScope.Data[rowId];
  },
  load: async function (params) {
    const rowId = getBiomeId(params);

    MatrixCyberia.Data.dim = BiomeCyberiaScope.Data[rowId].dim;
    MatrixCyberia.Data.dimPaintByCell = BiomeCyberiaScope.Data[rowId].dimPaintByCell;
    MatrixCyberia.Data.biomeDataId = rowId;
    // MatrixCyberia.Data.dimAmplitude = BiomeCyberiaScope.Data[rowId].dimAmplitude;
    PixiCyberia.setFloor(BiomeCyberiaScope.Data[rowId].imageSrc);
    PixiCyberia.setFloorTopLevelColor(BiomeCyberiaScope.Data[rowId].imageTopLevelColorSrc);
  },
};

class LoadBiomeCyberiaRenderer {
  eGui;

  async init(params) {
    console.log('LoadBiomeCyberiaRenderer created', params);
    const rowId = getBiomeId(params);

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
      if (s(`.btn-load-biome-${rowId}`))
        EventsUI.onClick(`.btn-load-biome-${rowId}`, async () => {
          if (!BiomeCyberiaScope.Data[rowId]) await BiomeCyberiaRender.loadData(params);
          BiomeCyberiaScope.Keys[params.data.biome] = BiomeCyberiaScope.Data[rowId];
          BiomeCyberiaScope.CurrentKey = params.data.biome;

          await BiomeCyberiaEngine.renderPixiCyberiaBiomeCyberia(BiomeCyberiaScope.Data[rowId]);
          s(`.input-name-${params.data.biome}`).value = BiomeCyberiaScope.Data[rowId].name;
          s(`.dropdown-option-${params.data.biome}`).click();
        });
      if (s(`.btn-delete-biome-${rowId}`))
        EventsUI.onClick(`.btn-delete-biome-${rowId}`, async () => {
          const biomeDeleteResult = await CyberiaBiomeService.delete({ id: params.data._id });
          NotificationManager.Push({
            html: biomeDeleteResult.status === 'success' ? '33%' : biomeDeleteResult.message,
            status: biomeDeleteResult.status,
          });

          const fileDeleteResult = await FileService.delete({ id: params.data.fileId });
          NotificationManager.Push({
            html: fileDeleteResult.status === 'success' ? '66%' : fileDeleteResult.message,
            status: fileDeleteResult.status,
          });

          const topLevelColorFileDeleteResult = await FileService.delete({ id: params.data.topLevelColorFileId });
          NotificationManager.Push({
            html: topLevelColorFileDeleteResult.status === 'success' ? '100%' : topLevelColorFileDeleteResult.message,
            status: topLevelColorFileDeleteResult.status,
          });

          setTimeout(() => {
            BiomeCyberiaScope.Grid = BiomeCyberiaScope.Grid.filter((biome) => biome._id !== params.data._id);
            AgGrid.grids[`ag-grid-biome-files`].setGridOption('rowData', BiomeCyberiaScope.Grid);
          });
        });
    });
  }

  getGui() {
    return this.eGui;
  }

  refresh(params) {
    console.log('LoadBiomeCyberiaRenderer refreshed', params);
    return true;
  }
}

const BiomeCyberiaEngine = {
  PixiCyberiaBiomeCyberiaDim: 0,
  PixiCyberiaBiomeCyberia: Application,
  PixiCyberiaBiomeCyberiaTopLevelColor: Application,
  Render: async function (options) {
    const resultBiomeCyberia = await CyberiaBiomeService.get({ id: 'all-name' });
    NotificationManager.Push({
      html:
        resultBiomeCyberia.status === 'success'
          ? Translate.Render(resultBiomeCyberia.message)
          : resultBiomeCyberia.message,
      status: resultBiomeCyberia.status,
    });
    if (resultBiomeCyberia.status === 'success') BiomeCyberiaScope.Grid = resultBiomeCyberia.data;

    let configBiomeCyberiaFormRender = html`
      <div class="in section-mp">
        ${await DropDown.Render({
          value: BiomeCyberiaScope.CurrentKey,
          label: html`${Translate.Render('select-biome')}`,
          data: Object.keys(BiomeCyberia).map((biomeKey) => {
            return {
              value: biomeKey,
              display: html`<i class="fa-solid fa-mountain-city"></i> ${Translate.Render(biomeKey)}`,
              onClick: async () => {
                logger.info('DropDown BiomeCyberia onClick', biomeKey);
                BiomeCyberiaScope.CurrentKey = biomeKey;
                htmls('.biome-custom-options', html``);
                for (const biome of Object.keys(BiomeCyberia)) {
                  s(`.row-${biome}`).style.display = biomeKey === biome ? 'block' : 'none';
                  if (biomeKey === biome && BiomeCyberiaEngine.CustomBiomeOptions[biome])
                    htmls('.biome-custom-options', html`${await BiomeCyberiaEngine.CustomBiomeOptions[biome]()}`);
                }
              },
            };
          }),
        })}
      </div>
      <div class="biome-custom-options"></div>
    `;
    // let render = '';
    for (const biome of Object.keys(BiomeCyberia)) {
      configBiomeCyberiaFormRender += html`
        <div class="in row-${biome}" style="display: none">
          ${await Input.Render({
            id: `input-name-${biome}`,
            label: html`<i class="fa-solid fa-pen-to-square"></i> ${Translate.Render('name')}`,
            containerClass: 'inl section-mp width-mini-box input-container',
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

    setTimeout(() => {
      this.PixiCyberiaBiomeCyberiaDim = 1600;
      this.PixiCyberiaBiomeCyberia = new Application({
        width: this.PixiCyberiaBiomeCyberiaDim,
        height: this.PixiCyberiaBiomeCyberiaDim,
        background: 'gray',
      });

      this.PixiCyberiaBiomeCyberia.view.classList.add('in');
      this.PixiCyberiaBiomeCyberia.view.classList.add('pixi-canvas-biome');

      s('.biome-pixi-container').appendChild(this.PixiCyberiaBiomeCyberia.view);

      this.PixiCyberiaBiomeCyberiaTopLevelColor = new Application({
        width: this.PixiCyberiaBiomeCyberiaDim,
        height: this.PixiCyberiaBiomeCyberiaDim,
        backgroundAlpha: 0,
      });

      this.PixiCyberiaBiomeCyberiaTopLevelColor.view.classList.add('in');
      this.PixiCyberiaBiomeCyberiaTopLevelColor.view.classList.add('pixi-canvas-biome');

      s('.biome-top-level-pixi-container').appendChild(this.PixiCyberiaBiomeCyberiaTopLevelColor.view);
    });
    setTimeout(() =>
      Object.keys(BiomeCyberia).map(async (biome) => {
        const validators = await Validator.instance([{ id: `input-name-${biome}`, rules: [{ type: 'isEmpty' }] }]);

        EventsUI.onClick(`.btn-generate-biome-${biome}`, async () => {
          await this.generateBiomeCyberia(biome);
        });
        EventsUI.onClick(`.btn-download-biome-${biome}-png`, async () =>
          downloadFile(BiomeCyberiaScope.Keys[biome].imageFile, `${biome}.png`),
        );
        EventsUI.onClick(`.btn-upload-biome-${biome}`, async () => {
          const { errorMessage } = await validators();
          if (errorMessage) return;

          if (!BiomeCyberiaScope.Keys[biome])
            return NotificationManager.Push({
              html: Translate.Render('invalid-data'),
              status: 'error',
            });

          let { solid, color, topLevelColor } = BiomeCyberiaScope.Keys[biome];
          if (!solid)
            return NotificationManager.Push({
              html: Translate.Render('invalid-data'),
              status: 'error',
            });
          // https://www.iana.org/assignments/media-types/media-types.xhtml
          let fileId;
          let topLevelColorFileId;
          await (async () => {
            const body = new FormData();
            body.append('file', BiomeCyberiaScope.Keys[biome].imageFile);
            const { status, data } = await FileService.post({ body });
            // await timer(3000);
            NotificationManager.Push({
              html: Translate.Render(`${status}-upload-file`),
              status,
            });
            if (status === 'success') fileId = data[0]._id;
          })();
          await (async () => {
            const body = new FormData();
            body.append('file', BiomeCyberiaScope.Keys[biome].imageTopLevelColorFile);
            const { status, data } = await FileService.post({ body });
            // await timer(3000);
            NotificationManager.Push({
              html: Translate.Render(`${status}-upload-file`),
              status,
            });
            if (status === 'success') topLevelColorFileId = data[0]._id;
          })();
          if (fileId && topLevelColorFileId)
            await (async () => {
              if (color) color = Object.values(color).map((row) => Object.values(row));
              if (topLevelColor) topLevelColor = Object.values(topLevelColor).map((row) => Object.values(row));
              solid = Object.values(solid).map((row) => Object.values(row));
              const { dim, dimPaintByCell, dimAmplitude } = BiomeCyberiaScope.Keys[biome];
              const { status, data } = await CyberiaBiomeService.post({
                body: {
                  fileId,
                  topLevelColorFileId,
                  solid,
                  color,
                  topLevelColor,
                  name: s(`.input-name-${biome}`).value,
                  biome,
                  dim,
                  dimPaintByCell,
                  dimAmplitude,
                },
              });
              NotificationManager.Push({
                html: Translate.Render(`${status}-upload-biome`),
                status,
              });
              BiomeCyberiaScope.Grid.push(data);
              AgGrid.grids[`ag-grid-biome-files`].setGridOption('rowData', BiomeCyberiaScope.Grid);
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
            html: html`<div class="in section-mp">
              <img class="in" style="width: 100%" src="${BiomeCyberiaScope.Keys[biome].imageSrc}" />
              <img
                class="abs"
                style="top: 0%; left: 0%; width: 100%; height: 100%"
                src="${BiomeCyberiaScope.Keys[biome].imageTopLevelColorSrc}"
              />
            </div>`,
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
            ${JSONmatrix(BiomeCyberiaScope.Keys[biome].solid)
                .replaceAll('1', html`<span style="color: yellow">1</span>`)
                .replaceAll('2', html`<span style="color: red">1</span>`)
                .replaceAll('3', html`<span style="color: purple">1</span>`)
                .replaceAll('4', html`<span style="color: blue">1</span>`)}</pre
            >`,
            mode: 'view',
            slideMenu: 'modal-menu',
          });
        });
      }),
    );

    setTimeout(() => {
      const updateDim = () => (BiomeCyberiaParamsScope.dim = parseInt(s(`.biome-dim`).value));
      const updateDimPaintByCell = () =>
        (BiomeCyberiaParamsScope.dimPaintByCell = parseInt(s(`.biome-dimPaintByCell`).value));
      s(`.biome-dim`).oninput = updateDim;
      s(`.biome-dim`).onblur = updateDim;
      s(`.biome-dimPaintByCell`).oninput = updateDimPaintByCell;
      s(`.biome-dimPaintByCell`).onblur = updateDimPaintByCell;
      updateDim();
      updateDimPaintByCell();
    });

    return html`
      <style>
        .biome-solid-matrix-preview {
          font-size: 8px;
        }
      </style>
      ${dynamicCol({ containerSelector: options.idModal, id: 'biome' })}
      <div class="fl">
        <div class="in fll biome-col-a">
          <div class="in section-mp">
            <div class="in sub-title-modal">
              <i class="fa-solid fa-sliders"></i> ${Translate.Render('config-biome')}
            </div>
          </div>
          ${configBiomeCyberiaFormRender}
          ${await Input.Render({
            id: `biome-dim`,
            label: html`<i class="fa-solid fa-ruler"></i> dim`,
            containerClass: 'in section-mp width-mini-box input-container',
            type: 'number',
            min: 0,
            placeholder: true,
            value: 16,
          })}
          ${await Input.Render({
            id: `biome-dimPaintByCell`,
            label: html`<i class="fa-solid fa-ruler"></i> dimPaintByCell`,
            containerClass: 'in section-mp width-mini-box input-container',
            type: 'number',
            min: 0,
            placeholder: true,
            value: 3,
          })}
        </div>
        <div class="in fll biome-col-b">
          <div class="in section-mp">
            <div class="in sub-title-modal"><i class="fa-solid fa-vector-square"></i> Render</div>
          </div>
          <div class="in section-mp">
            <div class="in biome-pixi-container"></div>
          </div>
          <div class="in section-mp">
            <div class="in biome-top-level-pixi-container"></div>
          </div>
          <div class="in section-mp">
            <div class="in sub-title-modal"><i class="far fa-list-alt"></i> ${Translate.Render('biomes')}</div>
          </div>
          <div class="in section-mp">
            ${await AgGrid.Render({
              id: `ag-grid-biome-files`,
              darkTheme,
              gridOptions: {
                rowData: BiomeCyberiaScope.Grid,
                columnDefs: [
                  { field: '_id', headerName: 'ID' },
                  { field: 'biome', headerName: 'BiomeCyberia' },
                  { field: 'name', headerName: 'Name' },
                  { headerName: '', cellRenderer: LoadBiomeCyberiaRenderer },
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
  CustomBiomeOptions: {
    'seed-city': async () => {
      const id = 'seed-city-cut-toggle';
      setTimeout(() => {
        s(`.toggle-form-container-${id}`).onclick = () => ToggleSwitch.Tokens[id].click();

        const inputX1 = () => {
          cut.x1 = s(`.${id}-cut-dim-x1`).value;
        };
        const inputY1 = () => {
          cut.y1 = s(`.${id}-cut-dim-y1`).value;
        };
        const inputX2 = () => {
          cut.x2 = s(`.${id}-cut-dim-x2`).value;
        };
        const inputY2 = () => {
          cut.y2 = s(`.${id}-cut-dim-y2`).value;
        };

        s(`.${id}-cut-dim-x1`).onblur = inputX1;
        s(`.${id}-cut-dim-x1`).oninput = inputX1;

        s(`.${id}-cut-dim-y1`).onblur = inputY1;
        s(`.${id}-cut-dim-y1`).oninput = inputY1;

        s(`.${id}-cut-dim-x2`).onblur = inputX2;
        s(`.${id}-cut-dim-x2`).oninput = inputX2;

        s(`.${id}-cut-dim-y2`).onblur = inputY2;
        s(`.${id}-cut-dim-y2`).oninput = inputY2;
      });
      return html`<div class="in section-mp toggle-form-container toggle-form-container-${id} hover">
          <div class="fl ">
            <div class="in fll" style="width: 70%">
              <div class="in"><i class="fas fa-cut"></i> ${Translate.Render('cut')}</div>
            </div>
            <div class="in fll" style="width: 30%">
              ${await ToggleSwitch.Render({
                id,
                containerClass: 'inl',
                disabledOnClick: true,
                checked: cut.enable,
                on: {
                  unchecked: () => {
                    cut.enable = false;
                    s(`.${id}-cut-dim-container`).classList.add('hide');
                  },
                  checked: () => {
                    cut.enable = true;
                    s(`.${id}-cut-dim-container`).classList.remove('hide');
                  },
                },
              })}
            </div>
          </div>
        </div>
        <div class="${id}-cut-dim-container ${cut.enable ? '' : 'hide'}">
          ${await Input.Render({
            id: `${id}-cut-dim-x1`,
            label: html`<i class="fa-solid fa-ruler"></i> x1`,
            containerClass: 'in section-mp width-mini-box input-container',
            type: 'number',
            min: 0,
            placeholder: true,
            value: cut.x1,
          })}
          ${await Input.Render({
            id: `${id}-cut-dim-y1`,
            label: html`<i class="fa-solid fa-ruler"></i> y1`,
            containerClass: 'in section-mp width-mini-box input-container',
            type: 'number',
            min: 0,
            placeholder: true,
            value: cut.y1,
          })}
          ${await Input.Render({
            id: `${id}-cut-dim-x2`,
            label: html`<i class="fa-solid fa-ruler"></i> x2`,
            containerClass: 'in section-mp width-mini-box input-container',
            type: 'number',
            min: 0,
            placeholder: true,
            value: cut.x2,
          })}
          ${await Input.Render({
            id: `${id}-cut-dim-y2`,
            label: html`<i class="fa-solid fa-ruler"></i> y2`,
            containerClass: 'in section-mp width-mini-box input-container',
            type: 'number',
            min: 0,
            placeholder: true,
            value: cut.y2,
          })}
        </div>`;
    },
  },
  getRandomAvailablePositionCyberia: function (options) {
    const { type, id } = options;
    const biomeData = options.biome ? options.biome : BiomeCyberiaScope.Data[MatrixCyberia.Data.biomeDataId];
    return getRandomAvailablePositionCyberia({ element: ElementsCyberia.Data[type][id], biomeData });
  },
  isBiomeCyberiaCollision: function (options) {
    const { type, id, x, y } = options;
    const biomeData = options.biome ? options.biome : BiomeCyberiaScope.Data[MatrixCyberia.Data.biomeDataId];
    return isBiomeCyberiaCollision({ element: ElementsCyberia.Data[type][id], biomeData, x, y });
  },
  generateBiomeCyberia: async function (biome) {
    const BiomeCyberiaMatrixCyberia = await BiomeCyberia[biome]();
    BiomeCyberiaScope.Keys[biome] = { biome, ...BiomeCyberiaParamsScope, ...BiomeCyberiaMatrixCyberia };
    BiomeCyberiaScope.CurrentKey = biome;
    await this.renderPixiCyberiaBiomeCyberia(BiomeCyberiaScope.Keys[biome]);
    setTimeout(
      async () => {
        {
          const biomeImg = await this.PixiCyberiaBiomeCyberia.renderer.extract.image(
            this.PixiCyberiaBiomeCyberia.stage,
          );
          BiomeCyberiaScope.Keys[biome].imageSrc = biomeImg.currentSrc;
          const res = await fetch(BiomeCyberiaScope.Keys[biome].imageSrc);
          const blob = await res.blob();
          BiomeCyberiaScope.Keys[biome].imageFile = new File([blob], `${biome}.png`, { type: 'image/png' });
        }
        {
          const biomeImgTopLevelColor = await this.PixiCyberiaBiomeCyberiaTopLevelColor.renderer.extract.image(
            this.PixiCyberiaBiomeCyberiaTopLevelColor.stage,
          );
          BiomeCyberiaScope.Keys[biome].imageTopLevelColorSrc = biomeImgTopLevelColor.currentSrc;
          const res = await fetch(BiomeCyberiaScope.Keys[biome].imageTopLevelColorSrc);
          const blob = await res.blob();
          BiomeCyberiaScope.Keys[biome].imageTopLevelColorFile = new File([blob], `${biome}.png`, {
            type: 'image/png',
          });
        }
      },
      BiomeCyberiaMatrixCyberia.timeOut ? BiomeCyberiaMatrixCyberia.timeOut : 0,
    );
  },
  renderPixiCyberiaBiomeCyberia: async function (BiomeCyberiaMatrixCyberia) {
    this.PixiCyberiaBiomeCyberia.stage.removeChildren();
    this.PixiCyberiaBiomeCyberiaTopLevelColor.stage.removeChildren();
    const rangeBiomeCyberia = range(0, BiomeCyberiaMatrixCyberia.dim * BiomeCyberiaMatrixCyberia.dimPaintByCell - 1);
    const dim = this.PixiCyberiaBiomeCyberiaDim / rangeBiomeCyberia.length;

    // if (BiomeCyberiaMatrixCyberia.biome === 'seed-city' && !BiomeCyberiaMatrixCyberia.setBiomeCyberia) {
    //   const biomeData = await BiomeCyberia['seed-city']();
    //   BiomeCyberiaMatrixCyberia.setBiomeCyberia = biomeData.setBiomeCyberia;
    // }

    for (const y of rangeBiomeCyberia)
      for (const x of rangeBiomeCyberia) {
        if (
          BiomeCyberiaMatrixCyberia.topLevelColor &&
          BiomeCyberiaMatrixCyberia.topLevelColor[y] &&
          BiomeCyberiaMatrixCyberia.topLevelColor[y][x]
        ) {
          const cell = new Sprite(Texture.WHITE);
          cell.x = dim * x;
          cell.y = dim * y;
          cell.width = dim;
          cell.height = dim;
          cell.tint = BiomeCyberiaMatrixCyberia.topLevelColor[y][x];
          this.PixiCyberiaBiomeCyberiaTopLevelColor.stage.addChild(cell);
        }
      }

    if (BiomeCyberiaMatrixCyberia.setBiomeCyberia) {
      for (const cellData of BiomeCyberiaMatrixCyberia.setBiomeCyberia) {
        const { src, dim, x, y } = cellData;
        // case from png static url
        const cell = Sprite.from(src);
        cell.x = dim * x;
        cell.y = dim * y;
        cell.width = dim;
        cell.height = dim;
        this.PixiCyberiaBiomeCyberia.stage.addChild(cell);
      }
      return;
    }

    for (const y of rangeBiomeCyberia)
      for (const x of rangeBiomeCyberia) {
        if (BiomeCyberiaMatrixCyberia.color[y] && BiomeCyberiaMatrixCyberia.color[y][x]) {
          const cell = new Sprite(Texture.WHITE);
          cell.x = dim * x;
          cell.y = dim * y;
          cell.width = dim;
          cell.height = dim;
          cell.tint = BiomeCyberiaMatrixCyberia.color[y][x];
          this.PixiCyberiaBiomeCyberia.stage.addChild(cell);
        }
      }
  },
};

export {
  BiomeCyberia,
  BiomeCyberiaEngine,
  BiomeCyberiaScope,
  LoadBiomeCyberiaRenderer,
  getBiomeId,
  BiomeCyberiaRender,
};
